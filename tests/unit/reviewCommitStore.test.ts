import { Iadapter } from "src/dataStore/adapter";
import { ReviewCommitStore } from "src/dataStore/reviewCommitStore";
import { DEFAULT_SETTINGS } from "src/settings";

interface AdapterSingleton {
    _instance: {
        adapter: {
            exists: (path: string) => Promise<boolean>;
            read: (path: string) => Promise<string>;
            write: (path: string, value: string) => Promise<void>;
        };
    };
}

describe("reviewCommitStore", () => {
    const files = new Map<string, string>();
    const adapter = {
        exists: jest.fn(async (path: string) => files.has(path)),
        read: jest.fn(async (path: string) => files.get(path) ?? ""),
        write: jest.fn(async (path: string, value: string) => {
            files.set(path, value);
        }),
    };

    beforeEach(() => {
        files.clear();
        jest.clearAllMocks();
        (Iadapter as unknown as AdapterSingleton)._instance = { adapter };
    });

    it("stores manual entries by default and preserves metadata on edit", async () => {
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");
        await store.load();

        const entry = await store.addCommit("note.md", "manual note");
        expect(entry.entryType).toBe("manual");
        expect(entry.reviewResponse).toBeUndefined();

        const updated = await store.editCommit("note.md", entry.id, {
            message: "manual note updated",
            entryType: "manual",
        });

        const [saved] = store.getCommits("note.md");
        expect(updated).toMatchObject({
            id: entry.id,
            message: "manual note updated",
            entryType: "manual",
        });
        expect(saved.message).toBe("manual note updated");
        expect(saved.entryType).toBe("manual");
        expect(saved.lastEdited).toEqual(expect.any(Number));
    });

    it("stores auto review-response metadata", async () => {
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");
        await store.load();

        const entry = await store.addCommit("note.md", "Good", undefined, undefined, {
            entryType: "review-response",
            reviewResponse: "Good",
            displayDuration: { raw: "9d", totalDays: 9 },
        });

        expect(entry.entryType).toBe("review-response");
        expect(entry.reviewResponse).toBe("Good");
        expect(entry.displayDuration).toEqual({ raw: "9d", totalDays: 9 });
        expect(store.getCommits("note.md")[0].reviewResponse).toBe("Good");
    });

    it("returns the latest saved scroll percentage and preserves zero", async () => {
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");
        await store.load();

        await store.addCommit("note.md", "older", undefined, 0.42);
        await store.addCommit("note.md", "latest", undefined, 0);

        expect(store.getLatestScrollPercentage("note.md")).toBe(0);
    });

    it("falls back to an earlier saved scroll percentage when the latest entry has none", async () => {
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");
        await store.load();

        await store.addCommit("note.md", "older", undefined, 0.42);
        await store.addCommit("note.md", "latest");

        expect(store.getLatestScrollPercentage("note.md")).toBe(0.42);
    });

    it("clamps saved scroll percentages into the supported 0-1 range", async () => {
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");
        await store.load();

        await store.addCommit("note.md", "too far", undefined, 1.7);
        expect(store.getLatestScrollPercentage("note.md")).toBe(1);

        await store.addCommit("note.md", "before start", undefined, -0.25);
        expect(store.getLatestScrollPercentage("note.md")).toBe(0);
    });

    it("returns cloned snapshots for commit and file mutations", async () => {
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");
        await store.load();

        const entry = await store.addCommit("folder/note.md", "snapshot me");
        const commitSnapshot = store.getCommitSnapshot("folder/note.md", entry.id);
        const renamed = store.renameFileWithSnapshot("folder/note.md", "folder/renamed.md");

        if (!commitSnapshot || !renamed) {
            throw new Error("Expected timeline snapshots");
        }

        commitSnapshot.message = "changed locally";
        renamed.commits[0].message = "changed locally";
        expect(store.getCommits("folder/renamed.md")[0].message).toBe("snapshot me");

        const deleted = store.deleteFileWithSnapshot("folder/renamed.md");
        if (!deleted) {
            throw new Error("Expected deleted timeline snapshot");
        }

        expect(store.getCommit("folder/note.md", entry.id)).toBeNull();
        expect(renamed.oldPath).toBe("folder/note.md");
        expect(renamed.newPath).toBe("folder/renamed.md");
        expect(deleted.path).toBe("folder/renamed.md");
        expect(deleted.commits[0].message).toBe("snapshot me");
    });

    it("renames and deletes timeline files by path prefix", async () => {
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");
        await store.load();

        await store.addCommit("folder/a.md", "a");
        await store.addCommit("folder/sub/b.md", "b");
        await store.addCommit("elsewhere/c.md", "c");

        const renamed = store.renamePathPrefixWithSnapshots("folder", "archive/folder");
        expect(renamed).toHaveLength(2);
        expect(store.getCommits("archive/folder/a.md")).toHaveLength(1);
        expect(store.getCommits("archive/folder/sub/b.md")).toHaveLength(1);
        expect(store.getCommits("folder/a.md")).toHaveLength(0);

        const removed = store.deletePathPrefixWithSnapshots("archive/folder");
        expect(removed).toHaveLength(2);
        expect(store.getCommits("archive/folder/a.md")).toHaveLength(0);
        expect(store.getCommits("archive/folder/sub/b.md")).toHaveLength(0);
        expect(store.getCommits("elsewhere/c.md")).toHaveLength(1);
    });
});
