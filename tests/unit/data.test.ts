import { NoteEaseList } from "src/NoteEaseList";
import { DEFAULT_DECKNAME } from "src/constants";
import { DataStore } from "src/dataStore/data";
import { ItemTrans } from "src/dataStore/itemTrans";
import { Queue } from "src/dataStore/queue";
import { CardQueue, RPITEMTYPE } from "src/dataStore/repetitionItem";
import { TrackedItem } from "src/dataStore/trackedFile";
import { CardType } from "src/Question";
import SRPlugin from "src/main";
import { FsrsAlgorithm } from "src/algorithms/fsrs";
import { createDefaultFsrsSettings, DEFAULT_SETTINGS } from "src/settings";
import { Tags } from "src/tags";

function createStore(): DataStore {
    const store = new DataStore(DEFAULT_SETTINGS, "./");
    store.resetData();
    store.data.queues = Queue.create(store.data.queues as any);
    return store;
}

describe("DataStore algorithm binding", () => {
    afterEach(() => {
        (SRPlugin as any)._instance = undefined;
    });

    test("creates note items with WMS data", () => {
        const store = createStore();
        store.trackFile("note-path.md", RPITEMTYPE.NOTE, false);

        const item = store.getNoteItem("note-path.md");
        expect(item).not.toBeNull();
        expect(item?.itemType).toBe(RPITEMTYPE.NOTE);
        expect(item?.isFsrs).toBe(false);
        expect(item?.data).toMatchObject({ currentInterval: 1 });
    });

    test("creates card items with FSRS data", () => {
        const store = createStore();
        store.trackFile("card-path.md", RPITEMTYPE.CARD, false);

        const trackedFile = store.getTrackedFile("card-path.md");
        const trackedItem = new TrackedItem(
            "card-hash",
            0,
            "",
            CardType.SingleLineBasic,
            {
                startOffset: 0,
                endOffset: 0,
                blockStartOffset: 0,
                blockEndOffset: 0,
            },
            "c1",
        );
        trackedFile.trackedItems.push(trackedItem);
        store.updateCardItems(trackedFile, trackedItem, "#flashcards", false);

        const item = store.getItembyID(trackedItem.reviewId);
        expect(item).not.toBeNull();
        expect(item?.itemType).toBe(RPITEMTYPE.CARD);
        expect(item?.isFsrs).toBe(true);
        expect(item?.data).toHaveProperty("state");
    });

    test("reviewId applies passed preset FSRS settings to card reviews", () => {
        const store = createStore();
        store.trackFile("card-path.md", RPITEMTYPE.CARD, false);

        const trackedFile = store.getTrackedFile("card-path.md");
        const trackedItem = new TrackedItem(
            "card-hash",
            0,
            "",
            CardType.SingleLineBasic,
            {
                startOffset: 0,
                endOffset: 0,
                blockStartOffset: 0,
                blockEndOffset: 0,
            },
            "c1",
        );
        trackedFile.trackedItems.push(trackedItem);
        store.updateCardItems(trackedFile, trackedItem, "#flashcards", false);

        const item = store.getItembyID(trackedItem.reviewId);
        const cardAlgorithm = new FsrsAlgorithm();
        jest.spyOn(cardAlgorithm, "appendRevlog").mockResolvedValue("");
        const fsrsSettings = createDefaultFsrsSettings({
            enable_fuzz: false,
            learning_steps: ["2m", "20m"],
            relearning_steps: ["15m"],
        });

        (SRPlugin as any)._instance = {
            cardAlgorithm,
            getAlgorithmForItem: () => cardAlgorithm,
        };

        const result = store.reviewId(item.ID, 0, fsrsSettings);
        const intervalMinutes = (item.nextReview - Date.now()) / (1000 * 60);

        expect(result).not.toBeNull();
        expect(cardAlgorithm.settings.learning_steps).toEqual(["2m", "20m"]);
        expect(item.queue).toBe(CardQueue.Learn);
        expect(intervalMinutes).toBeGreaterThan(1.5);
        expect(intervalMinutes).toBeLessThan(2.5);
    });

    test("itemToReviewDecks recreates missing note items from tracked files", () => {
        const store = createStore();
        const path = "ghost-note-path.md";
        store.trackFile(path, DEFAULT_DECKNAME, false);

        const trackedFile = store.getTrackedFile(path);
        const missingId = trackedFile.items.file;
        store.data.items = store.data.items.filter((item) => item?.ID !== missingId);
        (store as unknown as { markItemByIdIndexDirty: () => void }).markItemByIdIndexDirty();

        const note = { path } as any;
        const reviewDecks: Record<string, any> = {};
        const easeByPath = new NoteEaseList(DEFAULT_SETTINGS);
        const getDeckNameSpy = jest.spyOn(Tags, "getNoteDeckName").mockReturnValue(null);

        expect(() =>
            ItemTrans.create(DEFAULT_SETTINGS).itemToReviewDecks(reviewDecks, [note], easeByPath),
        ).not.toThrow();
        expect(store.getNoteItem(path)).not.toBeNull();
        expect(reviewDecks[DEFAULT_DECKNAME]).toBeDefined();

        getDeckNameSpy.mockRestore();
    });
});
