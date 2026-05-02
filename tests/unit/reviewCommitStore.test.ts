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

    it("stores extract timeline entries as independent snapshots", async () => {
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");
        await store.load();

        const entry = await store.addExtractCommit("notes/source.md", {
            originUuid: "ir_1",
            quoteText: "quoted source",
            memoText: "memo body",
            sourcePath: "notes/source.md",
            sourceAnchor: {
                start: 10,
                end: 23,
                startLine: 2,
                endLine: 2,
                ordinal: 0,
            },
            sourceMode: "manual-ir",
            extractCreatedAt: 1234,
        });

        expect(entry).toMatchObject({
            id: "extract:ir_1",
            message: "memo body",
            timestamp: 1234,
            entryType: "extract",
            extract: {
                originUuid: "ir_1",
                quoteText: "quoted source",
                memoText: "memo body",
                sourcePath: "notes/source.md",
                sourceMode: "manual-ir",
                extractCreatedAt: 1234,
            },
        });
        expect(store.getCommits("notes/source.md")).toHaveLength(1);

        const updated = await store.editCommit("notes/source.md", entry.id, {
            message: "updated memo",
            entryType: "extract",
            extract: {
                ...entry.extract!,
                quoteText: "updated quote",
                memoText: "updated memo",
            },
        });

        expect(updated?.extract?.quoteText).toBe("updated quote");
        expect(updated?.extract?.memoText).toBe("updated memo");
        expect(updated?.extract?.memoEditedAt).toEqual(expect.any(Number));
        expect(updated?.message).toBe("updated memo");
    });

    it("compacts legacy automatic extract timeline snapshots to heading quote text", async () => {
        files.set(
            ".obsidian/plugins/syro/review_commits.json",
            JSON.stringify({
                version: 1,
                files: {
                    "notes/source.md": [
                        {
                            id: "extract:auto_1",
                            message: "memo body",
                            timestamp: 1234,
                            entryType: "extract",
                            extract: {
                                originUuid: "auto_1",
                                quoteText: "# A\nbody\n## B\nchild",
                                memoText: "memo body",
                                sourcePath: "notes/source.md",
                                sourceMode: "auto-slice",
                                sourceAnchor: {
                                    start: 0,
                                    end: 18,
                                    prefix: "legacy prefix",
                                    suffix: "legacy suffix",
                                },
                                extractCreatedAt: 1234,
                            },
                        },
                    ],
                },
            }),
        );
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");

        await store.load();
        await store.save();

        const [commit] = store.getCommits("notes/source.md");
        expect(commit.extract?.quoteText).toBe("# A");
        expect(commit.extract?.sourceAnchor).not.toHaveProperty("prefix");
        expect(commit.extract?.sourceAnchor).not.toHaveProperty("suffix");
        expect(files.get(".obsidian/plugins/syro/review_commits.json")).not.toContain(
            "legacy prefix",
        );
    });

    it("returns the highest saved scroll percentage and preserves zero", async () => {
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");
        await store.load();

        await store.addCommit("note.md", "older", undefined, 0.42);
        await store.addCommit("note.md", "latest", undefined, 0);

        expect(store.getLatestScrollPercentage("note.md")).toBe(0.42);
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
        expect(store.getLatestScrollPercentage("note.md")).toBe(1);
    });

    it("preserves extract memo edit time snapshots", async () => {
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");
        await store.load();

        const entry = await store.addExtractCommit("note.md", {
            originUuid: "ir_1",
            quoteText: "quote",
            memoText: "memo",
            memoEditedAt: 456,
            sourcePath: "note.md",
            sourceAnchor: { start: 0, end: 5 },
            sourceMode: "manual-ir",
            extractCreatedAt: 123,
        });

        expect(entry.extract?.memoEditedAt).toBe(456);
        expect(store.getCommits("note.md")[0]?.extract?.memoEditedAt).toBe(456);
    });

    it("does not refresh extract memo edit time when timeline extract metadata changes", async () => {
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");
        await store.load();

        const entry = await store.addExtractCommit("note.md", {
            originUuid: "ir_1",
            quoteText: "quote",
            memoText: "memo",
            memoEditedAt: 456,
            sourcePath: "note.md",
            sourceAnchor: { start: 0, end: 5 },
            sourceMode: "manual-ir",
            extractCreatedAt: 123,
        });

        jest.spyOn(Date, "now").mockReturnValue(999);
        const updated = await store.editCommit("note.md", entry.id, {
            message: "memo",
            entryType: "extract",
            extract: {
                ...entry.extract!,
                quoteText: "updated quote",
            },
        });

        expect(updated?.extract?.quoteText).toBe("updated quote");
        expect(updated?.extract?.memoText).toBe("memo");
        expect(updated?.extract?.memoEditedAt).toBe(456);
        expect(updated?.lastEdited).toBe(999);
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

    it("renames extract source snapshots together with timeline file paths", async () => {
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");
        await store.load();

        await store.addExtractCommit("folder/a.md", {
            originUuid: "ir_1",
            quoteText: "quote",
            memoText: "memo",
            sourcePath: "folder/a.md",
            sourceAnchor: { start: 0, end: 5, ordinal: 0 },
            sourceMode: "manual-ir",
            extractCreatedAt: 10,
        });

        store.renameFileWithSnapshot("folder/a.md", "folder/b.md");
        expect(store.getCommits("folder/b.md")[0].extract?.sourcePath).toBe("folder/b.md");

        store.renamePathPrefixWithSnapshots("folder", "archive/folder");
        expect(store.getCommits("archive/folder/b.md")[0].extract?.sourcePath).toBe(
            "archive/folder/b.md",
        );
    });
});
