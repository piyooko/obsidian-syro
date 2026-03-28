import { FsrsAlgorithm } from "src/algorithms/fsrs";
import { DataStore } from "src/dataStore/data";
import { CardQueue, RepetitionItem, RPITEMTYPE } from "src/dataStore/repetitionItem";
import { createDefaultFsrsSettings } from "src/settings";

function ensureDataStoreStub(): void {
    (DataStore as any).instance = {
        dataPath: "./tracked_files.json",
    };
}

function createAlgorithm() {
    ensureDataStoreStub();
    const algorithm = new FsrsAlgorithm();
    algorithm.updateSettings(
        createDefaultFsrsSettings({
            enable_fuzz: false,
            enable_short_term: true,
            learning_steps: ["1m", "10m"],
            relearning_steps: ["10m"],
        }),
    );
    return algorithm;
}

describe("RepetitionItem FSRS updates", () => {
    beforeEach(() => {
        ensureDataStoreStub();
    });

    test("maps new-card Again to learning queue with same-day scheduled_days", () => {
        const algorithm = createAlgorithm();
        const item = new RepetitionItem(
            1,
            "file-1",
            RPITEMTYPE.CARD,
            "#flashcards",
            algorithm.defaultData(),
        );

        const result = algorithm.onSelection(item, "Again", false, false);
        item.reviewUpdate(result);

        expect(item.queue).toBe(CardQueue.Learn);
        expect(item.learningStep).toBeNull();
        expect(item.nextReview).toBeGreaterThan(Date.now());
        expect((item.data as { scheduled_days: number }).scheduled_days).toBeCloseTo(1 / 1440, 6);
    });

    test("maps review-card Again to relearning queue with preset relearning step", () => {
        const algorithm = createAlgorithm();
        const item = new RepetitionItem(
            2,
            "file-2",
            RPITEMTYPE.CARD,
            "#flashcards",
            algorithm.defaultData(),
        );

        const firstGood = algorithm.onSelection(item, "Good", false, false);
        item.reviewUpdate(firstGood);

        const secondGood = algorithm.onSelection(item, "Good", false, false);
        item.reviewUpdate(secondGood);

        const lapse = algorithm.onSelection(item, "Again", false, false);
        item.reviewUpdate(lapse);

        expect(item.queue).toBe(CardQueue.Learn);
        expect((item.data as { scheduled_days: number }).scheduled_days).toBeCloseTo(10 / 1440, 6);
    });

    test("silently repairs legacy learning items whose queue and FSRS state drifted apart", () => {
        const lastReview = new Date("2026-03-28T00:00:00.000Z");
        const nextReview = new Date("2026-03-28T00:10:00.000Z").getTime();

        const item = RepetitionItem.create({
            ID: 3,
            fileID: "file-3",
            uuid: "legacy-item",
            itemType: RPITEMTYPE.CARD,
            deckName: "#flashcards",
            timesReviewed: 1,
            timesCorrect: 1,
            errorStreak: 0,
            queue: CardQueue.Learn,
            learningStep: 1,
            nextReview,
            data: {
                due: new Date("2026-03-30T00:00:00.000Z"),
                last_review: lastReview,
                scheduled_days: 2,
                stability: 0,
                difficulty: 0,
                elapsed_days: 0,
                reps: 1,
                lapses: 0,
                state: 2,
            },
        } as RepetitionItem);

        expect((item.data as { state: number }).state).toBe(1);
        expect((item.data as { due: Date }).due.getTime()).toBe(nextReview);
        expect((item.data as { scheduled_days: number }).scheduled_days).toBeCloseTo(10 / 1440, 6);
    });
});
