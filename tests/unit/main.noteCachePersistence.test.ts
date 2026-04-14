import SRPlugin from "src/main";
import { Iadapter } from "src/dataStore/adapter";

describe("SRPlugin note cache persistence", () => {
    const originalIadapterInstance = (Iadapter as unknown as { _instance?: unknown })._instance;

    afterEach(() => {
        (Iadapter as unknown as { _instance?: unknown })._instance = originalIadapterInstance;
        jest.restoreAllMocks();
    });

    test("shouldPersistNoteCacheAfterSync stays false when incremental cache metadata is unchanged", () => {
        const shouldPersistNoteCacheAfterSync = (
            SRPlugin.prototype as unknown as {
                shouldPersistNoteCacheAfterSync: Function;
            }
        ).shouldPersistNoteCacheAfterSync;
        const plugin: any = Object.create(SRPlugin.prototype);

        expect(
            shouldPersistNoteCacheAfterSync.call(plugin, {
                syncMode: "incremental",
                signatureChanged: false,
                cacheFileMissing: false,
                reparsedNotes: false,
                nextCache: new Map([["note.md", { mtime: 123 }]]),
                baselineCacheByPath: new Map([["note.md", { mtime: 123 }]]),
            }),
        ).toBe(false);
    });

    test("shouldPersistNoteCacheAfterSync becomes true when cache metadata changed", () => {
        const shouldPersistNoteCacheAfterSync = (
            SRPlugin.prototype as unknown as {
                shouldPersistNoteCacheAfterSync: Function;
            }
        ).shouldPersistNoteCacheAfterSync;
        const plugin: any = Object.create(SRPlugin.prototype);

        expect(
            shouldPersistNoteCacheAfterSync.call(plugin, {
                syncMode: "incremental",
                signatureChanged: false,
                cacheFileMissing: false,
                reparsedNotes: false,
                nextCache: new Map([["note.md", { mtime: 124 }]]),
                baselineCacheByPath: new Map([["note.md", { mtime: 123 }]]),
            }),
        ).toBe(true);
    });

    test("saveNoteCacheToDisk skips adapter write when the serialized payload is unchanged", async () => {
        const adapter = {
            exists: jest.fn(async () => true),
            read: jest.fn(async () => '{"version":4,"signature":"sig","items":[]}'),
            write: jest.fn(async () => undefined),
        };
        (Iadapter as unknown as { _instance?: unknown })._instance = {
            adapter,
        };

        const plugin: any = Object.create(SRPlugin.prototype);
        plugin.getNoteCacheStorePath = jest.fn(() => "note-cache.json");

        await (
            SRPlugin.prototype as unknown as {
                saveNoteCacheToDisk: Function;
            }
        ).saveNoteCacheToDisk.call(plugin, "sig", new Map());

        expect(adapter.write).not.toHaveBeenCalled();
    });

    test("saveNoteCacheToDisk writes when the serialized payload changed", async () => {
        const adapter = {
            exists: jest.fn(async () => true),
            read: jest.fn(async () => '{"version":4,"signature":"old","items":[]}'),
            write: jest.fn(async () => undefined),
        };
        (Iadapter as unknown as { _instance?: unknown })._instance = {
            adapter,
        };

        const plugin: any = Object.create(SRPlugin.prototype);
        plugin.getNoteCacheStorePath = jest.fn(() => "note-cache.json");

        await (
            SRPlugin.prototype as unknown as {
                saveNoteCacheToDisk: Function;
            }
        ).saveNoteCacheToDisk.call(plugin, "sig", new Map());

        expect(adapter.write).toHaveBeenCalledWith(
            "note-cache.json",
            '{"version":4,"signature":"sig","items":[]}',
        );
    });
});
