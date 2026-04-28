import { WeightedMultiplierAlgorithm } from "src/algorithms/weightedMultiplier";
import { ExtractStore } from "src/dataStore/extractStore";
import { DEFAULT_SETTINGS } from "src/settings";
import { ReviewResponse } from "src/scheduling";

function createStore(): ExtractStore {
    return new ExtractStore(DEFAULT_SETTINGS, { extractsPath: "extracts.json" });
}

function createWms(): WeightedMultiplierAlgorithm {
    const algorithm = new WeightedMultiplierAlgorithm();
    algorithm.updateSettings(DEFAULT_SETTINGS.weightedMultiplierSettings);
    return algorithm;
}

describe("ExtractStore", () => {
    test("syncs handwritten ir markers into active extracts", () => {
        const store = createStore();
        const result = store.syncFileExtracts(
            "notes/source.md",
            "{{ir::one}}\n{{ir::two}}",
            "deck",
        );

        expect(result.added).toHaveLength(2);
        expect(store.getActiveByPath("notes/source.md").map((item) => item.rawMarkdown)).toEqual([
            "one",
            "two",
        ]);
    });

    test("does not duplicate unchanged extracts on repeated sync", () => {
        const store = createStore();
        const first = store.syncFileExtracts("notes/source.md", "{{ir::one}}", "deck");
        const second = store.syncFileExtracts("notes/source.md", "{{ir::one}}", "deck");

        expect(first.added).toHaveLength(1);
        expect(second.added).toHaveLength(0);
        expect(second.updated).toHaveLength(0);
        expect(store.getActiveByPath("notes/source.md")).toHaveLength(1);
    });

    test("moves existing extracts to the current source deck on sync", () => {
        const store = createStore();
        const [created] = store.syncFileExtracts("notes/source.md", "{{ir::one}}", "default").added;

        const result = store.syncFileExtracts("notes/source.md", "{{ir::one}}", "notes/source");

        expect(result.added).toHaveLength(0);
        expect(result.updated.map((item) => item.uuid)).toContain(created.uuid);
        expect(store.get(created.uuid)?.deckName).toBe("notes/source");
    });

    test("graduates active extracts when their source marker disappears", () => {
        const store = createStore();
        const created = store.syncFileExtracts("notes/source.md", "{{ir::one}}", "deck").added[0];
        const result = store.syncFileExtracts("notes/source.md", "one", "deck");

        expect(result.graduated.map((item) => item.uuid)).toEqual([created.uuid]);
        expect(store.get(created.uuid)?.stage).toBe("graduated");
        expect(store.getActiveByPath("notes/source.md")).toHaveLength(0);
    });

    test("reviews active extracts with WMS and applies daily new limits", () => {
        const store = createStore();
        const algorithm = createWms();
        const [first] = store.syncFileExtracts(
            "notes/source.md",
            "{{ir::one}}\n{{ir::two}}",
            "deck",
        ).added;

        expect(store.getReviewCandidates("deck", { maxNew: 1, maxDue: 50 })).toHaveLength(1);

        const reviewed = store.review(first.uuid, ReviewResponse.Good, algorithm);

        expect(reviewed?.timesReviewed).toBe(1);
        expect(reviewed?.nextReview ?? 0).toBeGreaterThan(Date.now());
        expect(store.getReviewCandidates("deck", { maxNew: 1, maxDue: 50 })).toHaveLength(0);
    });

    test("reports limited new and due stats without a learning bucket", () => {
        const store = createStore();
        const created = store.syncFileExtracts(
            "notes/source.md",
            "{{ir::one}}\n{{ir::two}}\n{{ir::three}}",
            "deck",
        ).added;
        const internalItems = (
            store as unknown as {
                items: Record<string, { nextReview: number; timesReviewed: number }>;
            }
        ).items;
        internalItems[created[0].uuid]!.timesReviewed = 1;
        internalItems[created[0].uuid]!.nextReview = Date.now() - 1;

        const stats = store.getStats("deck", { maxNew: 1, maxDue: 1 });

        expect(stats).toEqual({
            newCount: 1,
            dueCount: 1,
            totalCount: 2,
        });
        expect(stats).not.toHaveProperty("learningCount");
    });

    test("can filter review candidates by a resolved source deck instead of stale stored deck", () => {
        const store = createStore();
        const [created] = store.syncFileExtracts(
            "math.md",
            "{{ir::one}}",
            "old-deck",
        ).added;

        const resolveDeckName = jest.fn((item) =>
            item.sourcePath === "math.md" ? "数学卡" : item.deckName,
        );

        expect(store.getReviewCandidates("数学卡", undefined, resolveDeckName)).toEqual([
            expect.objectContaining({ uuid: created.uuid }),
        ]);
        expect(store.getStats("数学卡", undefined, resolveDeckName)).toEqual({
            newCount: 1,
            dueCount: 0,
            totalCount: 1,
        });
        expect(store.getReviewCandidates("old-deck", undefined, resolveDeckName)).toHaveLength(0);
    });

    test("applies reviewed counts to the entrance deck when provided", () => {
        const store = createStore();
        const algorithm = createWms();
        const [first] = store.syncFileExtracts(
            "notes/source.md",
            "{{ir::one}}\n{{ir::two}}",
            "Parent/Child",
        ).added;

        store.review(first.uuid, ReviewResponse.Good, algorithm, "Parent");

        expect(store.getReviewCandidates("Parent", { maxNew: 1, maxDue: 50 })).toHaveLength(0);
        expect(store.getReviewCandidates("Parent/Child", { maxNew: 1, maxDue: 50 })).toHaveLength(
            1,
        );
    });

    test("keeps nested extracts as same-level active items with parent source", () => {
        const store = createStore();
        store.syncFileExtracts("notes/source.md", "{{ir::{{ir::t}}e}}", "deck");
        const active = store.getActiveByPath("notes/source.md");

        expect(active.map((item) => item.rawMarkdown)).toEqual(["{{ir::t}}e", "t"]);
        expect(active[1].parentUuid).toBe(active[0].uuid);
    });

    test("normalizes legacy extracts as manual IR source items", () => {
        const store = createStore();
        const [created] = store.syncFileExtracts("notes/source.md", "{{ir::one}}", "deck").added;

        const item = store.get(created.uuid);

        expect(item?.sourceMode).toBe("manual-ir");
        expect(item?.sliceRule).toBe("manual-ir");
        expect(item?.autoSliceKey).toBeUndefined();
    });

    test("sets a custom next review date and counts the extract as reviewed", () => {
        const store = createStore();
        const [created] = store.syncFileExtracts("notes/source.md", "{{ir::one}}", "deck").added;
        const dueAt = Date.now() + 3 * 24 * 60 * 60 * 1000;

        const updated = store.setNextReviewDate(created.uuid, dueAt, "deck");

        expect(updated?.nextReview).toBe(dueAt);
        expect(updated?.timesReviewed).toBe(1);
        expect(updated?.timesCorrect).toBe(0);
        expect(updated?.errorStreak).toBe(0);
        expect(store.getReviewCandidates("deck", { maxNew: 1, maxDue: 50 })).toHaveLength(0);
    });

    test("graduates an extract while counting today's review quota", () => {
        const store = createStore();
        const [created] = store.syncFileExtracts(
            "notes/source.md",
            "{{ir::one}}\n{{ir::two}}",
            "deck",
        ).added;

        const graduated = store.graduateWithReviewCount(created.uuid, "deck");

        expect(graduated?.stage).toBe("graduated");
        expect(graduated?.timesReviewed).toBe(1);
        expect(graduated?.graduatedAt).toEqual(expect.any(Number));
        expect(store.getReviewCandidates("deck", { maxNew: 1, maxDue: 50 })).toHaveLength(0);
    });

    test("syncs heading auto slices without touching manual IR extracts", () => {
        const store = createStore();
        const manual = store.syncFileExtracts("notes/source.md", "{{ir::manual}}", "deck")
            .added[0];
        const result = store.syncAutoExtractsForFile(
            "notes/source.md",
            "# A\none\n## A\nchild\n# B\ntwo",
            "deck",
            {
                sourcePath: "notes/source.md",
                rule: "heading",
                headingLevel: 1,
                enabled: true,
                createdAt: 1,
                updatedAt: 1,
            },
        );

        expect(result.added).toHaveLength(2);
        expect(result.added[0]).toEqual(
            expect.objectContaining({
                sourceMode: "auto-slice",
                sliceRule: "heading",
                autoSliceKey: "heading:1:A:0",
                rawMarkdown: "# A\none\n## A\nchild",
            }),
        );
        expect(store.get(manual.uuid)?.stage).toBe("active");
    });

    test("manual IR sync does not graduate active auto slices from the same file", () => {
        const store = createStore();
        const rule = {
            sourcePath: "notes/source.md",
            rule: "heading" as const,
            headingLevel: 1 as const,
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
        };
        const [auto] = store.syncAutoExtractsForFile(
            "notes/source.md",
            "# A\none",
            "deck",
            rule,
        ).added;

        const result = store.syncFileExtracts("notes/source.md", "# A\none", "deck");

        expect(result.graduated).toHaveLength(0);
        expect(store.get(auto.uuid)?.stage).toBe("active");
        expect(store.getReviewCandidates("deck")).toEqual([
            expect.objectContaining({
                uuid: auto.uuid,
                sourceMode: "auto-slice",
            }),
        ]);
    });

    test("keeps blank-block auto slice state when a new block is inserted before it", () => {
        const store = createStore();
        const rule = {
            sourcePath: "notes/source.md",
            rule: "blank-block" as const,
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
        };
        const [first, second] = store.syncAutoExtractsForFile(
            "notes/source.md",
            "alpha\n\nbeta",
            "deck",
            rule,
        ).added;

        const result = store.syncAutoExtractsForFile(
            "notes/source.md",
            "new\n\nalpha\n\nbeta",
            "deck",
            rule,
        );

        expect(result.added).toHaveLength(1);
        expect(store.get(first.uuid)?.stage).toBe("active");
        expect(store.get(second.uuid)?.stage).toBe("active");
        expect(store.get(first.uuid)?.rawMarkdown).toBe("alpha");
        expect(store.get(second.uuid)?.rawMarkdown).toBe("beta");
    });

    test("does not recreate a graduated auto slice on later sync", () => {
        const store = createStore();
        const rule = {
            sourcePath: "notes/source.md",
            rule: "blank-block" as const,
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
        };
        const [created] = store.syncAutoExtractsForFile(
            "notes/source.md",
            "alpha",
            "deck",
            rule,
        ).added;

        store.graduate(created.uuid);
        const result = store.syncAutoExtractsForFile("notes/source.md", "alpha", "deck", rule);

        expect(result.added).toHaveLength(0);
        expect(store.get(created.uuid)?.stage).toBe("graduated");
        expect(store.getActiveByPath("notes/source.md")).toHaveLength(0);
    });

    test("switching auto slice rules graduates old active auto slices", () => {
        const store = createStore();
        const [heading] = store.syncAutoExtractsForFile(
            "notes/source.md",
            "# A\none\n\npara",
            "deck",
            {
                sourcePath: "notes/source.md",
                rule: "heading",
                headingLevel: 1,
                enabled: true,
                createdAt: 1,
                updatedAt: 1,
            },
        ).added;

        const result = store.syncAutoExtractsForFile(
            "notes/source.md",
            "# A\none\n\npara",
            "deck",
            {
                sourcePath: "notes/source.md",
                rule: "blank-block",
                enabled: true,
                createdAt: 2,
                updatedAt: 2,
            },
        );

        expect(result.graduated.map((item) => item.uuid)).toContain(heading.uuid);
        expect(result.added.every((item) => item.sliceRule === "blank-block")).toBe(true);
        expect(store.get(heading.uuid)?.stage).toBe("graduated");
    });
});
