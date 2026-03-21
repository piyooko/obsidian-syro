import { Iadapter } from "src/dataStore/adapter";
import { ReviewCommitStore } from "src/dataStore/reviewCommitStore";
import { DEFAULT_SETTINGS } from "src/settings";

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
        (Iadapter as any)._instance = { adapter };
    });

    it("stores manual entries by default and preserves metadata on edit", async () => {
        const store = new ReviewCommitStore(DEFAULT_SETTINGS, ".obsidian/plugins/syro");
        await store.load();

        const entry = await store.addCommit("note.md", "manual note");
        expect(entry.entryType).toBe("manual");
        expect(entry.reviewResponse).toBeUndefined();

        await store.editCommit("note.md", entry.id, "manual note updated");

        const [saved] = store.getCommits("note.md");
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
});
