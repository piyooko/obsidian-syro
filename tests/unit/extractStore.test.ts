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
        const result = store.syncFileExtracts("notes/source.md", "{{ir::one}}\n{{ir::two}}", "deck");

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

    test("keeps nested extracts as same-level active items with parent source", () => {
        const store = createStore();
        store.syncFileExtracts("notes/source.md", "{{ir::{{ir::t}}e}}", "deck");
        const active = store.getActiveByPath("notes/source.md");

        expect(active.map((item) => item.rawMarkdown)).toEqual(["{{ir::t}}e", "t"]);
        expect(active[1].parentUuid).toBe(active[0].uuid);
    });
});
