import { NoteReviewStore } from "src/dataStore/noteReviewStore";
import { DEFAULT_SETTINGS } from "src/settings";
import { Iadapter } from "src/dataStore/adapter";

function createMockAdapter() {
    const files = new Map<string, string>();
    const adapter = {
        exists: jest.fn(async (path: string) => files.has(path)),
        read: jest.fn(async (path: string) => files.get(path) ?? ""),
        write: jest.fn(async (path: string, value: string) => {
            files.set(path, value);
        }),
        append: jest.fn(async (path: string, value: string) => {
            files.set(path, `${files.get(path) ?? ""}${value}`);
        }),
        remove: jest.fn(async (path: string) => {
            files.delete(path);
        }),
        stat: jest.fn(async () => null),
        mkdir: jest.fn(async () => {}),
    };

    return { adapter, files };
}

function createVaultAdapter() {
    return {
        getAbstractFileByPath: (): null => null,
    };
}

function createStore(raw?: string) {
    const { adapter, files } = createMockAdapter();
    if (raw !== undefined) {
        files.set("syro/devices/Desktop--d84f/notes.json", raw);
    }

    (Iadapter as any)._instance = {
        adapter,
        vault: createVaultAdapter(),
    };

    return new NoteReviewStore(DEFAULT_SETTINGS, {
        notesPath: "syro/devices/Desktop--d84f/notes.json",
    });
}

describe("NoteReviewStore", () => {
    test("clamps note priority when setting it directly", async () => {
        const store = createStore(
            JSON.stringify({
                version: 1,
                nextItemId: 2,
                items: {
                    "notes/example.md": {
                        source: "manual",
                        deckName: "default",
                        item: {
                            ID: 1,
                            fileID: "notes/example.md",
                            uuid: "note-1",
                            itemType: "note",
                            deckName: "default",
                            priority: 5,
                        },
                    },
                },
            }),
        );

        await store.load();
        expect(store.setPriority("notes/example.md", 11)).toBe(true);
        expect(store.getItem("notes/example.md")?.priority).toBe(10);
        expect(store.setPriority("notes/example.md", -4)).toBe(true);
        expect(store.getItem("notes/example.md")?.priority).toBe(1);
    });

    test("normalizes persisted note priority on load", async () => {
        const store = createStore(
            JSON.stringify({
                version: 1,
                nextItemId: 2,
                items: {
                    "notes/example.md": {
                        source: "manual",
                        deckName: "default",
                        item: {
                            ID: 1,
                            fileID: "notes/example.md",
                            uuid: "note-1",
                            itemType: "note",
                            deckName: "default",
                            priority: 42,
                        },
                    },
                },
            }),
        );

        await store.load();
        expect(store.getItem("notes/example.md")?.priority).toBe(10);
    });
});
