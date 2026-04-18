import { Iadapter } from "src/dataStore/adapter";
import {
    buildFileIdentityTargetUuid,
    createDeterministicFileIdentityUuid,
    SyroFileIdentityStore,
} from "src/dataStore/syroFileIdentityStore";

interface AdapterSingleton {
    _instance: {
        adapter: {
            exists: (path: string) => Promise<boolean>;
            read: (path: string) => Promise<string>;
            write: (path: string, value: string) => Promise<void>;
        };
    };
}

describe("syroFileIdentityStore", () => {
    const files = new Map<string, string>();
    const adapter = {
        exists: jest.fn(async (path: string) => files.has(path)),
        read: jest.fn(async (path: string) => files.get(path) ?? ""),
        write: jest.fn(async (path: string, value: string) => {
            files.set(path, value);
        }),
    };
    const storePath = ".obsidian/plugins/syro/devices/Desktop--d84f/file-identities.json";

    beforeEach(() => {
        files.clear();
        jest.clearAllMocks();
        (Iadapter as unknown as AdapterSingleton)._instance = { adapter };
    });

    it("creates the store file when it is missing and reloads persisted entries", async () => {
        const createdAt = "2026-04-19T00:00:00.000Z";
        const updatedAt = "2026-04-19T01:00:00.000Z";
        const store = new SyroFileIdentityStore(storePath);

        await store.load();
        store.upsert({
            uuid: "file-note-1",
            createdAt,
            updatedAt,
            path: "folder/note.md",
            aliases: ["legacy-note-1"],
        });
        store.markSyncEntity({
            targetUuid: buildFileIdentityTargetUuid("file-note-1"),
            updatedAt,
            deleted: false,
            entityType: "file-identity",
            pathHint: "folder/note.md",
        });
        await store.save();

        const reloaded = new SyroFileIdentityStore(storePath);
        await reloaded.load();

        expect(reloaded.getByUuid("file-note-1")).toMatchObject({
            uuid: "file-note-1",
            createdAt,
            updatedAt,
            path: "folder/note.md",
            aliases: ["legacy-note-1"],
            deleted: false,
        });
        expect(reloaded.getByPath("folder/note.md")?.uuid).toBe("file-note-1");
        expect(reloaded.getByUuidOrAlias("legacy-note-1")?.uuid).toBe("file-note-1");
        expect(reloaded.getSyncEntities()).toMatchObject({
            "file:file-note-1": {
                updatedAt,
                deleted: false,
                entityType: "file-identity",
            },
        });
    });

    it("rejects invalid schema payloads", async () => {
        files.set(
            storePath,
            JSON.stringify({
                version: 1,
                entries: {
                    "file-note-1": {
                        uuid: "mismatch",
                        createdAt: "2026-04-19T00:00:00.000Z",
                        updatedAt: "2026-04-19T00:00:00.000Z",
                        path: "note.md",
                        aliases: [],
                        deleted: false,
                    },
                },
            }),
        );

        const store = new SyroFileIdentityStore(storePath);
        await store.load();

        expect(store.lastLoadError).toContain("Invalid file-identities.json schema");
        expect(store.getState()).toEqual({
            version: 1,
            entries: {},
            syncEntities: {},
        });
    });

    it("persists tombstones instead of hard deleting entries", async () => {
        const store = new SyroFileIdentityStore(storePath);
        await store.load();

        store.upsert({
            uuid: "file-note-2",
            createdAt: "2026-04-19T00:00:00.000Z",
            updatedAt: "2026-04-19T00:30:00.000Z",
            path: "note.md",
        });
        store.mergeAliases("file-note-2", ["legacy-note-2"]);
        store.remove("file-note-2", "2026-04-19T02:00:00.000Z");
        await store.save();

        const reloaded = new SyroFileIdentityStore(storePath);
        await reloaded.load();

        expect(reloaded.getByUuid("file-note-2")).toMatchObject({
            uuid: "file-note-2",
            path: "note.md",
            aliases: ["legacy-note-2"],
            deleted: true,
            updatedAt: "2026-04-19T02:00:00.000Z",
        });
    });

    it("derives the same deterministic UUID from the same normalized legacy path", () => {
        expect(createDeterministicFileIdentityUuid("folder\\note.md")).toBe(
            createDeterministicFileIdentityUuid("folder/note.md/"),
        );
    });
});
