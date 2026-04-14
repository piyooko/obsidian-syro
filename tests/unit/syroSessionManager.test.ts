import { gunzipSync } from "zlib";
import { createHash } from "crypto";
import { DEFAULT_SETTINGS } from "src/settings";
import { createDeckOptionsStoreSnapshot } from "src/dataStore/deckOptionsStore";
import { SyroSessionManager } from "src/dataStore/syroSessionManager";
import { SyroWorkspace } from "src/dataStore/syroWorkspace";

type MockAdapter = {
    basePath: string;
    append: jest.Mock<Promise<void>, [string, string]>;
    exists: jest.Mock<Promise<boolean>, [string]>;
    list: jest.Mock<Promise<{ files: string[]; folders: string[] }>, [string]>;
    mkdir: jest.Mock<Promise<void>, [string]>;
    read: jest.Mock<Promise<string>, [string]>;
    readBinary: jest.Mock<Promise<ArrayBuffer>, [string]>;
    remove: jest.Mock<Promise<void>, [string]>;
    rename: jest.Mock<Promise<void>, [string, string]>;
    write: jest.Mock<Promise<void>, [string, string]>;
    writeBinary: jest.Mock<Promise<void>, [string, ArrayBuffer]>;
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
        readBinary: jest.fn(async (path: string) => {
            const value = files.get(normalizePath(path)) ?? "";
            const encoded = Buffer.from(value, "base64");
            return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
        }),
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
        writeBinary: jest.fn(async (path: string, value: ArrayBuffer) => {
            const normalized = normalizePath(path);
            ensureParentDirectories(normalized);
            files.set(normalized, Buffer.from(value).toString("base64"));
        }),
    };

    return { adapter, files, directories };
}

function createValidDeviceMetadata(options: {
    deviceId: string;
    deviceName: string;
    shortDeviceId: string;
    importedSessionIds?: string[];
    importedSessionRetentionUntil?: Record<string, string>;
    lastSeenAt?: string;
}): string {
    return JSON.stringify(
        {
            version: 1,
            deviceId: options.deviceId,
            deviceName: options.deviceName,
            shortDeviceId: options.shortDeviceId,
            createdAt: "2026-04-12T00:00:00.000Z",
            updatedAt: "2026-04-12T00:00:00.000Z",
            lastSeenAt: options.lastSeenAt ?? "2026-04-13T00:00:00.000Z",
            baselineFromDeviceId: null,
            baselineBuiltAt: null,
            importedSessionIds: options.importedSessionIds ?? [],
            importedSessionRetentionUntil: options.importedSessionRetentionUntil ?? {},
        },
        null,
        2,
    );
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
                    digest: async (algorithm: string, data: BufferSource): Promise<ArrayBuffer> => {
                        if (algorithm !== "SHA-256") {
                            throw new Error(`Unsupported digest: ${algorithm}`);
                        }

                        const hash = createHash("sha256");
                        if (data instanceof ArrayBuffer) {
                            hash.update(Buffer.from(data));
                        } else {
                            hash.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
                        }

                        const digest = hash.digest();
                        return digest.buffer.slice(
                            digest.byteOffset,
                            digest.byteOffset + digest.byteLength,
                        );
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

    async function addSecondaryDevice(
        adapter: MockAdapter,
        files: Map<string, string>,
        options: {
            folderName?: string;
            deviceId?: string;
            deviceName?: string;
            shortDeviceId?: string;
            importedSessionIds?: string[];
            importedSessionRetentionUntil?: Record<string, string>;
            lastSeenAt?: string;
        } = {},
    ): Promise<void> {
        const folderName = options.folderName ?? "Mobile--91ac";
        await adapter.mkdir(`.obsidian/plugins/syro/devices/${folderName}`);
        files.set(
            `.obsidian/plugins/syro/devices/${folderName}/device.json`,
            createValidDeviceMetadata({
                deviceId: options.deviceId ?? "91ac1111-2222-3333-4444-555555555555",
                deviceName: options.deviceName ?? "Mobile",
                shortDeviceId: options.shortDeviceId ?? "91ac",
                importedSessionIds: options.importedSessionIds,
                importedSessionRetentionUntil: options.importedSessionRetentionUntil,
                lastSeenAt: options.lastSeenAt,
            }),
        );
    }

    test("appends new session records even before a second valid device appears", async () => {
        const { app, files, layout } = await createWorkspaceContext();
        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        const deckOptionsState = createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state;
        await expect(manager.appendDeckOptionsChange(deckOptionsState)).resolves.toBe(true);
        const bufferRaw = files.get(normalizePath(layout.activeSessionBufferPath)) ?? "";
        expect(bufferRaw).toContain('"domain":"deck-options"');
        expect(bufferRaw).toContain('"sessionSeq":1');
    });

    test("ignores orphan device directories without blocking local session persistence", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await adapter.mkdir(".obsidian/plugins/syro/devices/Desktop--ec3c");
        await adapter.write(
            ".obsidian/plugins/syro/devices/Desktop--ec3c/settings.json",
            JSON.stringify({ version: 1 }),
        );

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        const deckOptionsState = createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state;
        await expect(manager.appendDeckOptionsChange(deckOptionsState)).resolves.toBe(true);
        expect(files.has(normalizePath(layout.activeSessionBufferPath))).toBe(true);
    });

    test("flushes the active buffer into a formal session file and confirms it locally", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        const deckOptionsState = createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state;
        await manager.appendDeckOptionsChange(deckOptionsState);
        const sessionId = await manager.flushActiveSession();

        expect(sessionId).toBe("2026-04-13T12-34-56__d84f__0001");
        expect(
            files.get(normalizePath(`${layout.closedSessionsRoot}/${sessionId}.jsonl`)),
        ).toContain('"sessionId":"2026-04-13T12-34-56__d84f__0001"');
        expect(files.has(normalizePath(layout.activeSessionBufferPath))).toBe(false);

        const currentDeviceMeta = JSON.parse(
            files.get(normalizePath(layout.deviceMetaPath)) ?? "{}",
        ) as { importedSessionIds?: string[] };
        expect(currentDeviceMeta.importedSessionIds).toContain(sessionId);
    });

    test("recovers buffered records on startup and quarantines bad buffer lines", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        const deckOptionsState = createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state;
        await manager.appendDeckOptionsChange(deckOptionsState);
        await adapter.append(layout.activeSessionBufferPath, "this is not valid json\n");

        const restoredManager = new SyroSessionManager(app, layout);
        await restoredManager.initialize();

        expect(files.get(normalizePath(`${layout.activeSessionBufferPath}.bad`))).toContain(
            "this is not valid json",
        );

        const sessionId = await restoredManager.flushActiveSession();
        expect(sessionId).toBe("2026-04-13T12-34-56__d84f__0001");
        expect(files.has(normalizePath(`${layout.closedSessionsRoot}/${sessionId}.jsonl`))).toBe(
            true,
        );
    });

    test("imports pending sessions, quarantines bad lines, and confirms the imported session", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);

        const remoteSessionPath = `${layout.closedSessionsRoot}/2026-04-12T08-00-00__91ac__0001.jsonl`;
        files.set(
            normalizePath(remoteSessionPath),
            [
                JSON.stringify({
                    version: 1,
                    sessionId: "2026-04-12T08-00-00__91ac__0001",
                    opId: "op-1",
                    deviceId: "91ac1111-2222-3333-4444-555555555555",
                    deviceName: "Mobile",
                    domain: "deck-options",
                    entityType: "deck-options",
                    opType: "replace",
                    targetUuid: "deck-options:global",
                    createdAt: "2026-04-12T08:00:00.000Z",
                    updatedAt: "2026-04-12T08:00:00.000Z",
                    payload: createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state,
                }),
                "not-json",
                "",
            ].join("\n"),
        );

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        const replaySession = jest.fn(async () => undefined);
        const result = await manager.importPendingSessions(replaySession);

        expect(replaySession).toHaveBeenCalledWith(
            "2026-04-12T08-00-00__91ac__0001",
            expect.arrayContaining([
                expect.objectContaining({
                    sessionId: "2026-04-12T08-00-00__91ac__0001",
                    domain: "deck-options",
                }),
            ]),
        );
        expect(result.importedSessionIds).toEqual(["2026-04-12T08-00-00__91ac__0001"]);
        expect(files.get(normalizePath(`${remoteSessionPath}.bad`))).toContain("not-json");

        const currentDeviceMeta = JSON.parse(
            files.get(normalizePath(layout.deviceMetaPath)) ?? "{}",
        ) as { importedSessionIds?: string[] };
        expect(currentDeviceMeta.importedSessionIds).toContain(
            "2026-04-12T08-00-00__91ac__0001",
        );
    });

    test("imports pending sessions even when only the current device is registered locally", async () => {
        const { app, files, layout } = await createWorkspaceContext();

        files.set(
            normalizePath(`${layout.closedSessionsRoot}/2026-04-12T08-00-00__91ac__0001.jsonl`),
            JSON.stringify({
                version: 1,
                sessionId: "2026-04-12T08-00-00__91ac__0001",
                opId: "op-1",
                deviceId: "91ac1111-2222-3333-4444-555555555555",
                deviceName: "Mobile",
                domain: "deck-options",
                entityType: "deck-options",
                opType: "replace",
                targetUuid: "deck-options:global",
                createdAt: "2026-04-12T08:00:00.000Z",
                updatedAt: "2026-04-12T08:00:00.000Z",
                payload: createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state,
            }),
        );

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        const replaySession = jest.fn(async () => undefined);
        const result = await manager.importPendingSessions(replaySession);

        expect(replaySession).toHaveBeenCalledTimes(1);
        expect(result.importedSessionIds).toEqual(["2026-04-12T08-00-00__91ac__0001"]);
    });

    test("peekPendingSessions classifies runtime-only review deltas without forcing a global sync", async () => {
        const { app, files, layout } = await createWorkspaceContext();

        files.set(
            normalizePath(`${layout.closedSessionsRoot}/2026-04-12T08-00-00__91ac__0001.jsonl`),
            [
                JSON.stringify({
                    version: 1,
                    sessionId: "2026-04-12T08-00-00__91ac__0001",
                    opId: "op-card-review",
                    deviceId: "91ac1111-2222-3333-4444-555555555555",
                    deviceName: "Mobile",
                    domain: "cards",
                    entityType: "card-item",
                    opType: "review",
                    targetUuid: "card-1",
                    createdAt: "2026-04-12T08:00:00.000Z",
                    updatedAt: "2026-04-12T08:00:00.000Z",
                    payload: {
                        item: {
                            id: 1,
                        },
                    },
                }),
                JSON.stringify({
                    version: 1,
                    sessionId: "2026-04-12T08-00-00__91ac__0001",
                    opId: "op-daily",
                    deviceId: "91ac1111-2222-3333-4444-555555555555",
                    deviceName: "Mobile",
                    domain: "daily-state",
                    entityType: "daily-state-op",
                    opType: "deck-stats-delta",
                    targetUuid: "daily-op:1",
                    createdAt: "2026-04-12T08:00:01.000Z",
                    updatedAt: "2026-04-12T08:00:01.000Z",
                    payload: {
                        date: "2026-04-12",
                        deckName: "default",
                        newDelta: 1,
                        reviewDelta: 0,
                    },
                }),
            ].join("\n"),
        );

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        await expect(manager.peekPendingSessions()).resolves.toEqual({
            pendingSessionIds: ["2026-04-12T08-00-00__91ac__0001"],
            impact: "runtime-only",
        });
    });

    test("peekPendingSessions escalates when a structural remote change is pending", async () => {
        const { app, files, layout } = await createWorkspaceContext();

        files.set(
            normalizePath(`${layout.closedSessionsRoot}/2026-04-12T08-00-00__91ac__0001.jsonl`),
            JSON.stringify({
                version: 1,
                sessionId: "2026-04-12T08-00-00__91ac__0001",
                opId: "op-settings",
                deviceId: "91ac1111-2222-3333-4444-555555555555",
                deviceName: "Mobile",
                domain: "settings",
                entityType: "shared-settings",
                opType: "patch",
                targetUuid: "settings:batch:1",
                createdAt: "2026-04-12T08:00:00.000Z",
                updatedAt: "2026-04-12T08:00:00.000Z",
                payload: {
                    changed: {
                        openRandomNote: true,
                    },
                },
            }),
        );

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        await expect(manager.peekPendingSessions()).resolves.toEqual({
            pendingSessionIds: ["2026-04-12T08-00-00__91ac__0001"],
            impact: "requires-global-sync",
        });
    });

    test("keeps importedSessionIds for the retention window after fully confirmed cleanup", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        const sessionId = "2026-04-12T08-00-00__91ac__0001";
        await addSecondaryDevice(adapter, files, {
            importedSessionIds: [sessionId],
        });

        files.set(
            normalizePath(`${layout.closedSessionsRoot}/${sessionId}.jsonl`),
            JSON.stringify({
                version: 1,
                sessionId,
                opId: "op-1",
                deviceId: "91ac1111-2222-3333-4444-555555555555",
                deviceName: "Mobile",
                domain: "deck-options",
                entityType: "deck-options",
                opType: "replace",
                targetUuid: "deck-options:global",
                createdAt: "2026-04-12T08:00:00.000Z",
                updatedAt: "2026-04-12T08:00:00.000Z",
                payload: createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state,
            }),
        );

        const currentDeviceMeta = JSON.parse(
            files.get(normalizePath(layout.deviceMetaPath)) ?? "{}",
        ) as {
            importedSessionIds?: string[];
            importedSessionRetentionUntil?: Record<string, string>;
        };
        currentDeviceMeta.importedSessionIds = [sessionId];
        currentDeviceMeta.importedSessionRetentionUntil = {};
        files.set(normalizePath(layout.deviceMetaPath), JSON.stringify(currentDeviceMeta, null, 2));
        layout.device.importedSessionIds = [sessionId];
        layout.device.importedSessionRetentionUntil = {};

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();
        const result = await manager.importPendingSessions(async () => undefined);

        expect(result.deletedSessionIds).toContain(sessionId);
        expect(files.has(normalizePath(`${layout.closedSessionsRoot}/${sessionId}.jsonl`))).toBe(
            false,
        );

        const retainedCurrentMeta = JSON.parse(
            files.get(normalizePath(layout.deviceMetaPath)) ?? "{}",
        ) as {
            importedSessionIds?: string[];
            importedSessionRetentionUntil?: Record<string, string>;
        };
        expect(retainedCurrentMeta.importedSessionIds).toContain(sessionId);
        expect(retainedCurrentMeta.importedSessionRetentionUntil?.[sessionId]).toBeTruthy();
    });

    test("cleanup only rewrites the current device metadata and leaves foreign device.json untouched", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        const sessionId = "2026-04-12T08-00-00__91ac__0001";
        const foreignMetaPath = normalizePath(
            ".obsidian/plugins/syro/devices/Mobile--91ac/device.json",
        );
        await addSecondaryDevice(adapter, files, {
            importedSessionIds: [sessionId],
        });

        const currentDeviceMeta = JSON.parse(
            files.get(normalizePath(layout.deviceMetaPath)) ?? "{}",
        ) as {
            importedSessionIds?: string[];
            importedSessionRetentionUntil?: Record<string, string>;
        };
        currentDeviceMeta.importedSessionIds = [sessionId];
        currentDeviceMeta.importedSessionRetentionUntil = {};
        files.set(normalizePath(layout.deviceMetaPath), JSON.stringify(currentDeviceMeta, null, 2));
        layout.device.importedSessionIds = [sessionId];
        layout.device.importedSessionRetentionUntil = {};

        files.set(
            normalizePath(`${layout.closedSessionsRoot}/${sessionId}.jsonl`),
            JSON.stringify({
                version: 1,
                sessionId,
                opId: "op-1",
                deviceId: "91ac1111-2222-3333-4444-555555555555",
                deviceName: "Mobile",
                domain: "deck-options",
                entityType: "deck-options",
                opType: "replace",
                targetUuid: "deck-options:global",
                createdAt: "2026-04-12T08:00:00.000Z",
                updatedAt: "2026-04-12T08:00:00.000Z",
                payload: createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state,
            }),
        );

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();
        adapter.write.mockClear();

        await manager.importPendingSessions(async () => undefined);

        const touchedMetaPaths = adapter.write.mock.calls
            .map(([path]) => normalizePath(path))
            .filter((path) => path.endsWith("/device.json"));
        expect(touchedMetaPaths).toContain(normalizePath(layout.deviceMetaPath));
        expect(touchedMetaPaths).not.toContain(foreignMetaPath);
    });

    test("archives stale unconfirmed sessions into a real gzip pack and keeps retention metadata", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        const sessionId = "2026-03-01T08-00-00__91ac__0001";
        await addSecondaryDevice(adapter, files, {
            importedSessionIds: [sessionId],
        });
        await addSecondaryDevice(adapter, files, {
            folderName: "Tablet--22bb",
            deviceId: "22bb1111-2222-3333-4444-555555555555",
            deviceName: "Tablet",
            shortDeviceId: "22bb",
            importedSessionIds: [],
        });

        files.set(
            normalizePath(`${layout.closedSessionsRoot}/${sessionId}.jsonl`),
            JSON.stringify({
                version: 1,
                sessionId,
                opId: "op-1",
                deviceId: "91ac1111-2222-3333-4444-555555555555",
                deviceName: "Mobile",
                domain: "deck-options",
                entityType: "deck-options",
                opType: "replace",
                targetUuid: "deck-options:global",
                createdAt: "2026-03-01T08:00:00.000Z",
                updatedAt: "2026-03-01T08:00:00.000Z",
                payload: createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state,
            }),
        );

        const currentDeviceMeta = JSON.parse(
            files.get(normalizePath(layout.deviceMetaPath)) ?? "{}",
        ) as {
            importedSessionIds?: string[];
            importedSessionRetentionUntil?: Record<string, string>;
        };
        currentDeviceMeta.importedSessionIds = [sessionId];
        currentDeviceMeta.importedSessionRetentionUntil = {};
        files.set(normalizePath(layout.deviceMetaPath), JSON.stringify(currentDeviceMeta, null, 2));
        layout.device.importedSessionIds = [sessionId];
        layout.device.importedSessionRetentionUntil = {};

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();
        const result = await manager.importPendingSessions(async () => undefined);

        const archivePath = normalizePath(
            `${layout.archivedSessionsRoot}/91ac__2026-03.sessionpack.gz`,
        );
        expect(result.archivedSessionIds).toContain(sessionId);
        expect(files.has(normalizePath(`${layout.closedSessionsRoot}/${sessionId}.jsonl`))).toBe(
            false,
        );
        expect(files.has(archivePath)).toBe(true);

        const archiveBuffer = Buffer.from(files.get(archivePath) ?? "", "base64");
        const archiveText = gunzipSync(archiveBuffer).toString("utf8");
        expect(archiveText).toContain(sessionId);

        const retainedCurrentMeta = JSON.parse(
            files.get(normalizePath(layout.deviceMetaPath)) ?? "{}",
        ) as {
            importedSessionIds?: string[];
            importedSessionRetentionUntil?: Record<string, string>;
        };
        expect(retainedCurrentMeta.importedSessionIds).toContain(sessionId);
        expect(retainedCurrentMeta.importedSessionRetentionUntil?.[sessionId]).toBeTruthy();
    });

    test("seals the active session after five minutes of idleness", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();
        await manager.appendDeckOptionsChange(createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state);

        await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

        expect(
            files.has(
                normalizePath(`${layout.closedSessionsRoot}/2026-04-13T12-39-56__d84f__0001.jsonl`),
            ),
        ).toBe(true);
        expect(files.has(normalizePath(layout.activeSessionBufferPath))).toBe(false);
    });

    test("seals the active session immediately when the record limit is reached", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();
        const deckOptionsState = createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state;

        for (let index = 0; index < 100; index++) {
            await manager.appendDeckOptionsChange(
                {
                    ...deckOptionsState,
                    deckPresetAssignment: {
                        ...deckOptionsState.deckPresetAssignment,
                        [`Deck-${index}`]: 0,
                    },
                },
                `2026-04-13T12:34:${String(index % 60).padStart(2, "0")}.000Z`,
            );
        }

        expect(
            files.has(
                normalizePath(`${layout.closedSessionsRoot}/2026-04-13T12-34-56__d84f__0001.jsonl`),
            ),
        ).toBe(true);
        expect(files.has(normalizePath(layout.activeSessionBufferPath))).toBe(false);
    });

    test("seals the local open session before importing foreign closed sessions", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        await manager.appendDeckOptionsChange(createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state);

        const remoteSessionPath = `${layout.closedSessionsRoot}/2026-04-12T08-00-00__91ac__0001.jsonl`;
        files.set(
            normalizePath(remoteSessionPath),
            JSON.stringify({
                version: 1,
                sessionId: "2026-04-12T08-00-00__91ac__0001",
                opId: "op-remote",
                deviceId: "91ac1111-2222-3333-4444-555555555555",
                deviceName: "Mobile",
                domain: "deck-options",
                entityType: "deck-options",
                opType: "replace",
                targetUuid: "deck-options:global",
                createdAt: "2026-04-12T08:00:00.000Z",
                updatedAt: "2026-04-12T08:00:00.000Z",
                payload: createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state,
            }),
        );

        await manager.importPendingSessions(async () => undefined);

        expect(
            files.has(
                normalizePath(`${layout.closedSessionsRoot}/2026-04-13T12-34-56__d84f__0001.jsonl`),
            ),
        ).toBe(true);
        expect(files.has(normalizePath(layout.activeSessionBufferPath))).toBe(false);
    });
});
