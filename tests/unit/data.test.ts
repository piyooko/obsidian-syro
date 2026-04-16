import { NoteEaseList } from "src/NoteEaseList";
import { DEFAULT_DECKNAME } from "src/constants";
import { DataStore } from "src/dataStore/data";
import { Iadapter } from "src/dataStore/adapter";
import { ItemTrans } from "src/dataStore/itemTrans";
import { Queue } from "src/dataStore/queue";
import { CardQueue, RPITEMTYPE } from "src/dataStore/repetitionItem";
import { TrackedItem } from "src/dataStore/trackedFile";
import { CardType } from "src/Question";
import SRPlugin from "src/main";
import { FsrsAlgorithm } from "src/algorithms/fsrs";
import { createDefaultFsrsSettings, DEFAULT_SETTINGS } from "src/settings";
import { Tags } from "src/tags";

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/g, "");
}

function createMockAdapter() {
    const files = new Map<string, string>();
    const timestamps = new Map<string, number>();
    const directories = new Set<string>(["."]);

    const ensureParentDirectories = (path: string): void => {
        const parts = normalizePath(path)
            .split("/")
            .filter((part) => part.length > 0);
        let current = "";
        for (let index = 0; index < Math.max(0, parts.length - 1); index++) {
            current = current ? `${current}/${parts[index]}` : parts[index];
            directories.add(current);
        }
    };

    const adapter = {
        exists: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            return files.has(normalized) || directories.has(normalized);
        }),
        read: jest.fn(async (path: string) => files.get(normalizePath(path)) ?? ""),
        write: jest.fn(async (path: string, value: string) => {
            const normalized = normalizePath(path);
            ensureParentDirectories(normalized);
            files.set(normalized, value);
            timestamps.set(normalized, Date.now());
        }),
        remove: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            files.delete(normalized);
            timestamps.delete(normalized);
        }),
        stat: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            return files.has(normalized)
                ? {
                      mtime: timestamps.get(normalized) ?? Date.now(),
                  }
                : null;
        }),
    };

    return { adapter, files };
}

function createStore(adapter: Record<string, unknown> = {}): DataStore {
    (Iadapter as any)._instance = {
        adapter,
        vault: {
            getAbstractFileByPath: (): null => null,
        },
    };
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

    test("getCardSnapshot returns cloned card state with tracked file uuid", () => {
        const store = createStore();
        store.trackFile("card-path.md", RPITEMTYPE.CARD, false);

        const trackedFile = store.getTrackedFile("card-path.md");
        const trackedItem = new TrackedItem(
            "card-hash",
            0,
            "context",
            CardType.SingleLineBasic,
            {
                startOffset: 1,
                endOffset: 2,
                blockStartOffset: 0,
                blockEndOffset: 3,
            },
            "c1",
        );
        trackedFile.trackedItems.push(trackedItem);
        store.updateCardItems(trackedFile, trackedItem, "#flashcards", false);

        const item = store.getItembyID(trackedItem.reviewId);
        const snapshot = store.getCardSnapshot(item.ID);

        expect(snapshot).not.toBeNull();
        expect(snapshot?.path).toBe("card-path.md");
        expect(snapshot?.trackedFileUuid).toBe(trackedFile.uuid);
        expect(snapshot?.trackedItem).not.toBe(trackedItem);
        expect(snapshot?.item).not.toBe(item);
        expect(snapshot?.item.uuid).toBe(item.uuid);

        if (!snapshot) {
            throw new Error("Expected card snapshot");
        }

        snapshot.item.timesReviewed = 99;
        snapshot.trackedItem!.lineNo = 12;
        expect(item.timesReviewed).not.toBe(99);
        expect(trackedItem.lineNo).toBe(0);
    });

    test("path prefix snapshot helpers keep tracked file uuid stable across rename and delete", () => {
        const store = createStore();
        store.trackFile("folder/one.md", RPITEMTYPE.CARD, false);
        store.trackFile("folder/sub/two.md", RPITEMTYPE.CARD, false);

        const originalOne = store.getTrackedFile("folder/one.md");
        const originalTwo = store.getTrackedFile("folder/sub/two.md");

        const renamed = store.renamePathPrefixWithSnapshots("folder", "archive");

        expect(renamed).toHaveLength(2);
        expect(renamed).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    oldPath: "folder/one.md",
                    newPath: "archive/one.md",
                    file: expect.objectContaining({ uuid: originalOne.uuid, path: "archive/one.md" }),
                }),
                expect.objectContaining({
                    oldPath: "folder/sub/two.md",
                    newPath: "archive/sub/two.md",
                    file: expect.objectContaining({
                        uuid: originalTwo.uuid,
                        path: "archive/sub/two.md",
                    }),
                }),
            ]),
        );

        const removed = store.untrackPathPrefixWithSnapshots("archive");

        expect(removed).toHaveLength(2);
        expect(removed).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ uuid: originalOne.uuid, path: "archive/one.md" }),
                expect.objectContaining({ uuid: originalTwo.uuid, path: "archive/sub/two.md" }),
            ]),
        );
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

    test("cleanDirtyNewItems skips cards that have pending review overlay deltas", () => {
        const store = createStore();
        store.trackFile("cards/pending-overlay.md", RPITEMTYPE.CARD, false);

        const trackedFile = store.getTrackedFile("cards/pending-overlay.md");
        const trackedItem = new TrackedItem(
            "hash-pending-overlay",
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
        if (!item) {
            throw new Error("Expected local item");
        }

        item.queue = CardQueue.Learn;
        item.nextReview = Date.now() + 60_000;
        item.learningStep = 0;
        item.timesReviewed = 1;
        item.timesCorrect = 1;
        item.data = {
            ...(item.data as Record<string, unknown>),
            state: 1,
        };
        store.stageReviewItemDelta(item);

        item.timesReviewed = 0;

        store.cleanDirtyNewItems();

        expect(item.queue).toBe(CardQueue.Learn);
        expect(item.nextReview).toBeGreaterThan(0);
        expect(item.timesReviewed).toBe(0);
        expect((item.data as Record<string, unknown>).state).toBe(1);
    });

    test("ensureReviewOverlayMerged applies disk overlay before saving base cards", async () => {
        const { adapter, files } = createMockAdapter();
        const store = createStore(adapter);
        store.trackFile("cards/overlay-merge.md", RPITEMTYPE.CARD, false);

        const trackedFile = store.getTrackedFile("cards/overlay-merge.md");
        const trackedItem = new TrackedItem(
            "hash-overlay-merge",
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
        if (!item) {
            throw new Error("Expected local item");
        }

        await store.save();

        const overlayPath = "./pending.overlay.json";
        await adapter.write(
            overlayPath,
            JSON.stringify({
                version: 1,
                sections: {
                    cardsReview: {
                        version: 1,
                        baseMtime: 0,
                        items: [
                            {
                                id: item.ID,
                                nextReview: 123456789,
                                learningStep: 0,
                                queue: CardQueue.Learn,
                                timesReviewed: 1,
                                timesCorrect: 1,
                                errorStreak: 0,
                                data: {
                                    ...(item.data as Record<string, unknown>),
                                    state: 1,
                                },
                            },
                        ],
                    },
                },
            }),
        );

        const merged = await store.ensureReviewOverlayMerged();

        expect(merged).toBe(true);
        expect(item.queue).toBe(CardQueue.Learn);
        expect(item.timesReviewed).toBe(1);
        expect(item.nextReview).toBe(123456789);
        expect(JSON.parse(files.get(normalizePath(overlayPath)) ?? "{}")).toEqual({
            version: 2,
            sections: {
                cardsReview: {
                    version: 2,
                    baseMtime: expect.any(Number),
                    items: [
                        expect.objectContaining({
                            id: item.ID,
                            commitId: "legacy-card:0",
                            sessionCommitted: false,
                            sessionOpType: "upsert",
                            timesReviewed: 1,
                            queue: CardQueue.Learn,
                        }),
                    ],
                },
            },
        });
    });

    test("save retains cardsReview overlay entries until both session and cards save are complete", async () => {
        const { adapter, files } = createMockAdapter();
        const store = createStore(adapter);
        store.trackFile("cards/pending-commit.md", RPITEMTYPE.CARD, false);

        const trackedFile = store.getTrackedFile("cards/pending-commit.md");
        const trackedItem = new TrackedItem(
            "hash-pending-commit",
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
        if (!item) {
            throw new Error("Expected local item");
        }

        item.queue = CardQueue.Learn;
        item.nextReview = 123456789;
        item.learningStep = 0;
        item.timesReviewed = 1;
        item.timesCorrect = 1;
        item.errorStreak = 0;
        item.data = {
            ...(item.data as Record<string, unknown>),
            state: 1,
        };

        const entry = store.stageReviewItemDelta(item, {
            commitId: "card-review:test-1",
            sessionCommitted: false,
            sessionOpType: "review",
        });
        expect(entry?.commitId).toBe("card-review:test-1");

        expect(await store.save()).toBe(true);

        expect(JSON.parse(files.get(normalizePath("./pending.overlay.json")) ?? "{}")).toEqual({
            version: 2,
            sections: {
                cardsReview: {
                    version: 2,
                    baseMtime: expect.any(Number),
                    items: [
                        expect.objectContaining({
                            id: item.ID,
                            commitId: "card-review:test-1",
                            sessionCommitted: false,
                            sessionOpType: "review",
                            timesReviewed: 1,
                            queue: CardQueue.Learn,
                        }),
                    ],
                },
            },
        });

        expect(store.markPendingReviewSessionCommitted(item.ID, "card-review:test-1")).toBe(true);
        expect(await store.save()).toBe(true);
        expect(JSON.parse(files.get(normalizePath("./pending.overlay.json")) ?? "{}")).toEqual({
            version: 2,
            sections: {},
        });
    });
});
