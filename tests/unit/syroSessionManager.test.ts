import { createHash } from "crypto";
import { DEFAULT_SETTINGS } from "src/settings";
import { createDeckOptionsStoreSnapshot } from "src/dataStore/deckOptionsStore";
import type { SyroSessionRecord } from "src/dataStore/syroSessionManager";
import { SyroSessionManager } from "src/dataStore/syroSessionManager";
import { SyroWorkspace } from "src/dataStore/syroWorkspace";

type MockAdapter = {
    basePath: string;
    append: jest.Mock<Promise<void>, [string, string]>;
    exists: jest.Mock<Promise<boolean>, [string]>;
    list: jest.Mock<Promise<{ files: string[]; folders: string[] }>, [string]>;
    mkdir: jest.Mock<Promise<void>, [string]>;
    read: jest.Mock<Promise<string>, [string]>;
    remove: jest.Mock<Promise<void>, [string]>;
    rename: jest.Mock<Promise<void>, [string, string]>;
    write: jest.Mock<Promise<void>, [string, string]>;
};

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/g, "");
}

function createMockAdapter() {
    const files = new Map<string, string>();
    const directories = new Set<string>([
        ".obsidian",
        ".obsidian/plugins",
        ".obsidian/plugins/syro",
    ]);

    const ensureParentDirectories = (path: string): void => {
        const parts = normalizePath(path)
            .split("/")
            .filter((part) => part.length > 0);
        let current = "";
        for (let index = 0; index < Math.max(0, parts.length - 1); index++) {
            current = current ? `${current}/${parts[index]}` : parts[index];
            directories.add(current);
        }
    };

    const adapter: MockAdapter = {
        basePath: "C:/Vaults/Syro",
        append: jest.fn(async (path: string, value: string) => {
            const normalized = normalizePath(path);
            ensureParentDirectories(normalized);
            files.set(normalized, `${files.get(normalized) ?? ""}${value}`);
        }),
        exists: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            return files.has(normalized) || directories.has(normalized);
        }),
        list: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            const prefix = normalized ? `${normalized}/` : "";
            const folderSet = new Set<string>();
            const fileList: string[] = [];

            for (const directory of directories) {
                if (!directory.startsWith(prefix) || directory === normalized) {
                    continue;
                }
                const rest = directory.slice(prefix.length);
                if (rest.length === 0 || rest.includes("/")) {
                    continue;
                }
                folderSet.add(directory);
            }

            for (const filePath of files.keys()) {
                if (!filePath.startsWith(prefix)) {
                    continue;
                }
                const rest = filePath.slice(prefix.length);
                if (rest.length === 0 || rest.includes("/")) {
                    continue;
                }
                fileList.push(filePath);
            }

            return {
                files: fileList.sort(),
                folders: Array.from(folderSet).sort(),
            };
        }),
        mkdir: jest.fn(async (path: string) => {
            directories.add(normalizePath(path));
        }),
        read: jest.fn(async (path: string) => files.get(normalizePath(path)) ?? ""),
        remove: jest.fn(async (path: string) => {
            files.delete(normalizePath(path));
        }),
        rename: jest.fn(async (oldPath: string, newPath: string) => {
            const normalizedOld = normalizePath(oldPath);
            const normalizedNew = normalizePath(newPath);
            const value = files.get(normalizedOld);
            if (value !== undefined) {
                ensureParentDirectories(normalizedNew);
                files.set(normalizedNew, value);
                files.delete(normalizedOld);
                return;
            }

            if (directories.has(normalizedOld)) {
                directories.add(normalizedNew);
                directories.delete(normalizedOld);
            }
        }),
        write: jest.fn(async (path: string, value: string) => {
            const normalized = normalizePath(path);
            ensureParentDirectories(normalized);
            files.set(normalized, value);
        }),
    };

    return { adapter, files, directories };
}

function createValidDeviceMetadata(options: {
    deviceId: string;
    deviceName: string;
    shortDeviceId: string;
}): string {
    return JSON.stringify(
        {
            version: 1,
            deviceId: options.deviceId,
            deviceName: options.deviceName,
            shortDeviceId: options.shortDeviceId,
            createdAt: "2026-04-12T00:00:00.000Z",
            updatedAt: "2026-04-12T00:00:00.000Z",
            lastSeenAt: "2026-04-13T00:00:00.000Z",
            ownerInstallIdHash: null,
            baselineFromDeviceId: null,
            baselineBuiltAt: null,
        },
        null,
        2,
    );
}

function createSessionEventLine(record: SyroSessionRecord): string {
    return JSON.stringify({
        version: 1,
        lineType: "event",
        record,
    });
}

function createCursorSnapshotLine(cursors: Record<string, { offset: number; lastOpId: string | null; updatedAt: string }>): string {
    return JSON.stringify({
        version: 1,
        lineType: "cursor-snapshot",
        deviceId: "d84f1111-2222-3333-4444-555555555555",
        deviceName: "Desktop",
        updatedAt: "2026-04-13T12:34:57.000Z",
        cursors,
    });
}

function createRemoteRecord(overrides: Partial<SyroSessionRecord> = {}): SyroSessionRecord {
    return {
        version: 1,
        sessionId: "Mobile--91ac/2026-04-13",
        opId: "remote-op-1",
        deviceId: "91ac1111-2222-3333-4444-555555555555",
        deviceName: "Mobile",
        domain: "cards",
        entityType: "card-item",
        opType: "review",
        targetUuid: "card-1",
        createdAt: "2026-04-13T12:00:00.000Z",
        updatedAt: "2026-04-13T12:00:00.000Z",
        payload: { id: 1 },
        ...overrides,
    };
}

describe("SyroSessionManager", () => {
    const manifestDir = ".obsidian/plugins/syro";
    const originalCrypto = globalThis.crypto;

    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date("2026-04-13T12:34:56.000Z"));
        window.localStorage.clear();
        Object.defineProperty(globalThis, "crypto", {
            configurable: true,
            value: {
                randomUUID: () => "d84f1111-2222-3333-4444-555555555555",
                getRandomValues: originalCrypto?.getRandomValues ?? ((buffer: Uint8Array) => buffer),
                subtle: originalCrypto?.subtle ?? {
                    digest: async (_algorithm: string, data: BufferSource): Promise<ArrayBuffer> => {
                        const hash = createHash("sha256");
                        if (data instanceof ArrayBuffer) {
                            hash.update(Buffer.from(data));
                        } else {
                            hash.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
                        }
                        const digest = hash.digest();
                        return digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength);
                    },
                },
            },
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        window.localStorage.clear();
        Object.defineProperty(globalThis, "crypto", {
            configurable: true,
            value: originalCrypto,
        });
    });

    async function createWorkspaceContext() {
        const { adapter, files } = createMockAdapter();
        const app = {
            vault: {
                adapter,
                getName: () => "SyroVault",
            },
        } as any;

        const startup = await new SyroWorkspace(app, manifestDir, DEFAULT_SETTINGS).initialize();
        return { adapter, app, files, layout: startup.layout! };
    }

    async function addSecondaryDevice(adapter: MockAdapter, files: Map<string, string>): Promise<void> {
        await adapter.mkdir(".obsidian/plugins/syro/devices/Mobile--91ac");
        await adapter.mkdir(".obsidian/plugins/syro/sessions/Mobile--91ac");
        files.set(
            ".obsidian/plugins/syro/devices/Mobile--91ac/device.json",
            createValidDeviceMetadata({
                deviceId: "91ac1111-2222-3333-4444-555555555555",
                deviceName: "Mobile",
                shortDeviceId: "91ac",
            }),
        );
    }

    test("appends new records to the current device daily session file", async () => {
        const { app, files, layout } = await createWorkspaceContext();
        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        const deckOptionsState = createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state;
        await expect(manager.appendDeckOptionsChange(deckOptionsState)).resolves.toBe(true);

        const sessionRaw = files.get(normalizePath(layout.currentDeviceSessionFilePath)) ?? "";
        expect(sessionRaw).toContain('"lineType":"event"');
        expect(sessionRaw).toContain('"domain":"deck-options"');
    });

    test("imports remote records from a still-growing session file and appends a local cursor snapshot", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);
        const remoteSessionPath = ".obsidian/plugins/syro/sessions/Mobile--91ac/2026-04-13.session.jsonl";
        files.set(normalizePath(remoteSessionPath), `${createSessionEventLine(createRemoteRecord())}\n`);

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();
        const replaySession = jest.fn(async () => undefined);

        const result = await manager.importPendingSessions(replaySession);

        expect(replaySession).toHaveBeenCalledWith("Mobile--91ac/2026-04-13", [
            expect.objectContaining({ opId: "remote-op-1" }),
        ]);
        expect(result.importedSessionIds).toEqual(["Mobile--91ac/2026-04-13"]);
        const localSessionRaw = files.get(normalizePath(layout.currentDeviceSessionFilePath)) ?? "";
        expect(localSessionRaw).toContain('"lineType":"cursor-snapshot"');
        expect(localSessionRaw).toContain("Mobile--91ac/2026-04-13.session.jsonl");
        expect(files.get(normalizePath(remoteSessionPath))).toContain('"lineType":"event"');
    });

    test("ignores trailing partial lines until they become complete", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);
        const remoteSessionPath = ".obsidian/plugins/syro/sessions/Mobile--91ac/2026-04-13.session.jsonl";
        const firstLine = createSessionEventLine(createRemoteRecord());
        const secondLine = createSessionEventLine(
            createRemoteRecord({
                opId: "remote-op-2",
                targetUuid: "card-2",
            }),
        );
        files.set(normalizePath(remoteSessionPath), `${firstLine}\n${secondLine}`);

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();
        const replaySession = jest.fn(async () => undefined);

        await manager.importPendingSessions(replaySession);
        expect(replaySession).toHaveBeenCalledTimes(1);
        const firstReplayArgs = replaySession.mock.calls[0] as unknown as [
            string,
            SyroSessionRecord[],
        ];
        expect(firstReplayArgs[1]).toHaveLength(1);

        files.set(normalizePath(remoteSessionPath), `${firstLine}\n${secondLine}\n`);
        await manager.importPendingSessions(replaySession);
        expect(replaySession).toHaveBeenCalledTimes(2);
        const secondReplayArgs = replaySession.mock.calls[1] as unknown as [
            string,
            SyroSessionRecord[],
        ];
        expect(secondReplayArgs[1]).toEqual([
            expect.objectContaining({ opId: "remote-op-2" }),
        ]);
    });

    test("restores cursor snapshots after restart and resumes from the saved offset", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);
        const remoteSessionPath = ".obsidian/plugins/syro/sessions/Mobile--91ac/2026-04-13.session.jsonl";
        const firstLine = `${createSessionEventLine(createRemoteRecord())}\n`;
        files.set(normalizePath(remoteSessionPath), firstLine);
        files.set(
            normalizePath(layout.currentDeviceSessionFilePath),
            `${createCursorSnapshotLine({
                "Mobile--91ac/2026-04-13.session.jsonl": {
                    offset: firstLine.length,
                    lastOpId: "remote-op-1",
                    updatedAt: "2026-04-13T12:34:57.000Z",
                },
            })}\n`,
        );

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();
        const replaySession = jest.fn(async () => undefined);

        await manager.importPendingSessions(replaySession);
        expect(replaySession).not.toHaveBeenCalled();

        files.set(
            normalizePath(remoteSessionPath),
            `${firstLine}${createSessionEventLine(
                createRemoteRecord({
                    opId: "remote-op-2",
                    targetUuid: "card-2",
                }),
            )}\n`,
        );

        await manager.importPendingSessions(replaySession);
        expect(replaySession).toHaveBeenCalledTimes(1);
        const resumedReplayArgs = replaySession.mock.calls[0] as unknown as [
            string,
            SyroSessionRecord[],
        ];
        expect(resumedReplayArgs[1]).toEqual([
            expect.objectContaining({ opId: "remote-op-2" }),
        ]);
    });

    test("summarizes pending remote changes, synced cursors, and devices without session history", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);
        await adapter.mkdir(".obsidian/plugins/syro/devices/Tablet--7f3a");
        files.set(
            ".obsidian/plugins/syro/devices/Tablet--7f3a/device.json",
            createValidDeviceMetadata({
                deviceId: "7f3a1111-2222-3333-4444-555555555555",
                deviceName: "Tablet",
                shortDeviceId: "7f3a",
            }),
        );

        const remoteSessionPath = ".obsidian/plugins/syro/sessions/Mobile--91ac/2026-04-13.session.jsonl";
        const remoteRaw = `${createSessionEventLine(createRemoteRecord())}\n`;
        files.set(normalizePath(remoteSessionPath), remoteRaw);
        files.set(
            normalizePath(layout.currentDeviceSessionFilePath),
            `${createCursorSnapshotLine({
                "Mobile--91ac/2026-04-13.session.jsonl": {
                    offset: 0,
                    lastOpId: null,
                    updatedAt: "2026-04-13T12:10:00.000Z",
                },
            })}\n`,
        );

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        const summaries = await manager.summarizeDeviceSessions();
        const mobileSummary = summaries.find((entry) => entry.deviceFolderName === "Mobile--91ac");
        const tabletSummary = summaries.find((entry) => entry.deviceFolderName === "Tablet--7f3a");

        expect(mobileSummary).toEqual(
            expect.objectContaining({
                deviceFolderName: "Mobile--91ac",
                latestSessionAt: "2026-04-13T12:00:00.000Z",
                lastPulledIntoCurrentAt: "2026-04-13T12:10:00.000Z",
                hasPendingRemoteChanges: true,
            }),
        );
        expect(tabletSummary).toEqual(
            expect.objectContaining({
                deviceFolderName: "Tablet--7f3a",
                latestSessionAt: null,
                lastPulledIntoCurrentAt: null,
                hasPendingRemoteChanges: false,
            }),
        );
    });

    test("marks remote sessions at EOF after overwrite so old history is not imported again", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);
        const remoteSessionPath = ".obsidian/plugins/syro/sessions/Mobile--91ac/2026-04-13.session.jsonl";
        const remoteRaw = `${createSessionEventLine(createRemoteRecord())}\n`;
        files.set(normalizePath(remoteSessionPath), remoteRaw);
        files.set(
            normalizePath(layout.currentDeviceSessionFilePath),
            `${createSessionEventLine(
                createRemoteRecord({
                    sessionId: "Desktop--d84f/2026-04-13",
                    deviceId: layout.device.deviceId,
                    deviceName: layout.device.deviceName,
                    opId: "local-op-1",
                }),
            )}\n`,
        );

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        await manager.resetCurrentDeviceSessionsToRemoteEof();

        const replaySession = jest.fn(async () => undefined);
        await manager.importPendingSessions(replaySession);

        const localSessionRaw = files.get(normalizePath(layout.currentDeviceSessionFilePath)) ?? "";
        expect(localSessionRaw).toContain('"lineType":"cursor-snapshot"');
        expect(localSessionRaw).not.toContain('"opId":"local-op-1"');
        expect(replaySession).not.toHaveBeenCalled();
    });

    test("prunes cursor entries for a deleted device", async () => {
        const { app, files, layout } = await createWorkspaceContext();
        files.set(
            normalizePath(layout.currentDeviceSessionFilePath),
            `${createCursorSnapshotLine({
                "Mobile--91ac/2026-04-13.session.jsonl": {
                    offset: 42,
                    lastOpId: "remote-op-1",
                    updatedAt: "2026-04-13T12:10:00.000Z",
                },
                "Tablet--7f3a/2026-04-13.session.jsonl": {
                    offset: 15,
                    lastOpId: "tablet-op-1",
                    updatedAt: "2026-04-13T12:11:00.000Z",
                },
            })}\n`,
        );

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        await manager.pruneRemoteDeviceCursorState("Mobile--91ac");

        const localSessionRaw = files.get(normalizePath(layout.currentDeviceSessionFilePath)) ?? "";
        const latestSnapshotLine = localSessionRaw.trim().split("\n").at(-1) ?? "";
        expect(latestSnapshotLine).toContain("Tablet--7f3a/2026-04-13.session.jsonl");
        expect(latestSnapshotLine).not.toContain("Mobile--91ac/2026-04-13.session.jsonl");
    });

    test("deletes historical session files after all devices have confirmed EOF", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);
        const remoteSessionPath = ".obsidian/plugins/syro/sessions/Mobile--91ac/2026-04-12.session.jsonl";
        files.set(normalizePath(remoteSessionPath), `${createSessionEventLine(createRemoteRecord({
            sessionId: "Mobile--91ac/2026-04-12",
            createdAt: "2026-04-12T12:00:00.000Z",
            updatedAt: "2026-04-12T12:00:00.000Z",
        }))}\n`);

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();
        const replaySession = jest.fn(async () => undefined);

        const result = await manager.importPendingSessions(replaySession);

        expect(result.deletedSessionIds).toEqual(["Mobile--91ac/2026-04-12"]);
        expect(files.has(normalizePath(remoteSessionPath))).toBe(false);
    });
});
