import { gunzipSync } from "zlib";
import { DEFAULT_SETTINGS } from "src/settings";
import { createDeckOptionsStoreSnapshot } from "src/dataStore/deckOptionsStore";
import { SyroSessionManager } from "src/dataStore/syroSessionManager";
import { SyroWorkspace } from "src/dataStore/syroWorkspace";

type MockAdapter = {
    basePath: string;
    exists: jest.Mock<Promise<boolean>, [string]>;
    mkdir: jest.Mock<Promise<void>, [string]>;
    read: jest.Mock<Promise<string>, [string]>;
    write: jest.Mock<Promise<void>, [string, string]>;
    append: jest.Mock<Promise<void>, [string, string]>;
    remove: jest.Mock<Promise<void>, [string]>;
    rename: jest.Mock<Promise<void>, [string, string]>;
    list: jest.Mock<Promise<{ files: string[]; folders: string[] }>, [string]>;
    readBinary: jest.Mock<Promise<ArrayBuffer>, [string]>;
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
        exists: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            return files.has(normalized) || directories.has(normalized);
        }),
        mkdir: jest.fn(async (path: string) => {
            directories.add(normalizePath(path));
        }),
        read: jest.fn(async (path: string) => files.get(normalizePath(path)) ?? ""),
        write: jest.fn(async (path: string, value: string) => {
            const normalized = normalizePath(path);
            ensureParentDirectories(normalized);
            files.set(normalized, value);
        }),
        append: jest.fn(async (path: string, value: string) => {
            const normalized = normalizePath(path);
            ensureParentDirectories(normalized);
            files.set(normalized, `${files.get(normalized) ?? ""}${value}`);
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
        readBinary: jest.fn(async (path: string) => {
            const value = files.get(normalizePath(path)) ?? "";
            const encoded = Buffer.from(value, "base64");
            return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
        }),
        writeBinary: jest.fn(async (path: string, value: ArrayBuffer) => {
            const normalized = normalizePath(path);
            ensureParentDirectories(normalized);
            files.set(normalized, Buffer.from(value).toString("base64"));
        }),
    };

    return { adapter, files, directories };
}

describe("SyroSessionManager", () => {
    const manifestDir = ".obsidian/plugins/syro";
    const originalCrypto = globalThis.crypto;

    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date("2026-04-13T12:34:56.000Z"));
        window.localStorage.clear();
        if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
            jest.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
                "d84f1111-2222-3333-4444-555555555555",
            );
        } else {
            Object.defineProperty(globalThis, "crypto", {
                configurable: true,
                value: {
                    randomUUID: () => "d84f1111-2222-3333-4444-555555555555",
                    getRandomValues: (buffer: Uint8Array) => buffer,
                },
            });
        }
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

        const layout = await new SyroWorkspace(app, manifestDir, DEFAULT_SETTINGS).initialize();
        return { adapter, app, files, layout };
    }

    async function addSecondaryDevice(
        adapter: MockAdapter,
        files: Map<string, string>,
        folderName = "Mobile--91ac",
    ): Promise<void> {
        await adapter.mkdir(`.obsidian/plugins/syro/syro/devices/${folderName}`);
        files.set(
            `.obsidian/plugins/syro/syro/devices/${folderName}/device.json`,
            JSON.stringify(
                {
                    version: 1,
                    deviceId: "91ac1111-2222-3333-4444-555555555555",
                    deviceName: "Mobile",
                    shortDeviceId: "91ac",
                    createdAt: "2026-04-12T00:00:00.000Z",
                    updatedAt: "2026-04-12T00:00:00.000Z",
                    lastSeenAt: "2026-04-13T00:00:00.000Z",
                    baselineFromDeviceId: null,
                    baselineBuiltAt: null,
                    importedSessionIds: [],
                },
                null,
                2,
            ),
        );
    }

    test("only appends new session records after a second valid device appears", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();

        const deckOptionsState = createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state;
        await expect(manager.appendDeckOptionsChange(deckOptionsState)).resolves.toBe(false);
        expect(files.has(normalizePath(layout.activeSessionBufferPath))).toBe(false);

        await addSecondaryDevice(adapter, files);

        await expect(manager.appendDeckOptionsChange(deckOptionsState)).resolves.toBe(true);
        const bufferRaw = files.get(normalizePath(layout.activeSessionBufferPath)) ?? "";
        expect(bufferRaw).toContain('"domain":"deck-options"');
        expect(bufferRaw).toContain('"sessionSeq":1');
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
        const sessionPath = normalizePath(
            `${layout.sessionsRoot}/2026-04-13T12-34-56__d84f__0001.jsonl`,
        );
        expect(files.get(sessionPath)).toContain('"sessionId":"2026-04-13T12-34-56__d84f__0001"');
        expect(files.has(normalizePath(layout.activeSessionBufferPath))).toBe(false);

        const currentDeviceMeta = JSON.parse(
            files.get(normalizePath(layout.deviceMetaPath)) ?? "{}",
        ) as { importedSessionIds?: string[] };
        expect(currentDeviceMeta.importedSessionIds).toContain(
            "2026-04-13T12-34-56__d84f__0001",
        );
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
        expect(
            files.has(
                normalizePath(`${layout.sessionsRoot}/2026-04-13T12-34-56__d84f__0001.jsonl`),
            ),
        ).toBe(true);
    });

    test("imports pending sessions, quarantines bad lines, and confirms the imported session", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);

        const remoteSessionPath = `${layout.sessionsRoot}/2026-04-12T08-00-00__91ac__0001.jsonl`;
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
        expect(files.get(normalizePath(remoteSessionPath))).toContain('"opId":"op-1"');
        expect(files.get(normalizePath(remoteSessionPath))).not.toContain("not-json");

        const currentDeviceMeta = JSON.parse(
            files.get(normalizePath(layout.deviceMetaPath)) ?? "{}",
        ) as { importedSessionIds?: string[] };
        expect(currentDeviceMeta.importedSessionIds).toContain(
            "2026-04-12T08-00-00__91ac__0001",
        );
    });

    test("deletes fully confirmed sessions after import cleanup", async () => {
        const { app, files, layout } = await createWorkspaceContext();
        const sessionId = "2026-04-12T08-00-00__91ac__0001";
        await addSecondaryDevice(
            app.vault.adapter as MockAdapter,
            files,
            "Mobile--91ac",
        );

        const remoteMetaPath = ".obsidian/plugins/syro/syro/devices/Mobile--91ac/device.json";
        files.set(
            normalizePath(remoteMetaPath),
            JSON.stringify(
                {
                    version: 1,
                    deviceId: "91ac1111-2222-3333-4444-555555555555",
                    deviceName: "Mobile",
                    shortDeviceId: "91ac",
                    createdAt: "2026-04-12T00:00:00.000Z",
                    updatedAt: "2026-04-12T00:00:00.000Z",
                    lastSeenAt: "2026-04-13T00:00:00.000Z",
                    baselineFromDeviceId: null,
                    baselineBuiltAt: null,
                    importedSessionIds: [sessionId],
                },
                null,
                2,
            ),
        );
        files.set(
            normalizePath(`${layout.sessionsRoot}/${sessionId}.jsonl`),
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
        ) as { importedSessionIds?: string[] };
        currentDeviceMeta.importedSessionIds = [sessionId];
        files.set(normalizePath(layout.deviceMetaPath), JSON.stringify(currentDeviceMeta, null, 2));

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();
        const result = await manager.importPendingSessions(async () => undefined);

        expect(result.deletedSessionIds).toContain(sessionId);
        expect(files.has(normalizePath(`${layout.sessionsRoot}/${sessionId}.jsonl`))).toBe(false);
    });

    test("archives stale unconfirmed sessions into monthly packs", async () => {
        const { app, adapter, files, layout } = await createWorkspaceContext();
        await addSecondaryDevice(adapter, files);

        const sessionId = "2026-03-01T08-00-00__91ac__0001";
        files.set(
            normalizePath(`${layout.sessionsRoot}/${sessionId}.jsonl`),
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

        const manager = new SyroSessionManager(app, layout);
        await manager.initialize();
        const result = await manager.importPendingSessions(async () => undefined);

        const archivePath = normalizePath(`${layout.sessionsArchiveRoot}/91ac__2026-03.sessionpack.gz`);
        expect(result.archivedSessionIds).toContain(sessionId);
        expect(files.has(normalizePath(`${layout.sessionsRoot}/${sessionId}.jsonl`))).toBe(false);
        expect(files.has(archivePath)).toBe(true);

        const archiveBuffer = Buffer.from(files.get(archivePath) ?? "", "base64");
        let archiveText: string;
        try {
            archiveText = gunzipSync(archiveBuffer).toString("utf8");
        } catch {
            archiveText = archiveBuffer.toString("utf8");
        }
        expect(archiveText).toContain(sessionId);
    });
});
