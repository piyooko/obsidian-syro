import { CardListType, Deck } from "src/Deck";
import { FlashcardReviewMode, FlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import { TopicPath } from "src/TopicPath";
import { createDefaultFsrsSettings, DEFAULT_SETTINGS, SRSettings } from "src/settings";
import { ReviewResponse } from "src/scheduling";
import { CardQueue, RepetitionItem, RPITEMTYPE } from "src/dataStore/repetitionItem";
import { DataStore } from "src/dataStore/data";
import { Iadapter } from "src/dataStore/adapter";
import { Queue } from "src/dataStore/queue";
import { TrackedItem } from "src/dataStore/trackedFile";
import SRPlugin from "src/main";
import type { IDeckTreeIterator } from "src/DeckTreeIterator";
import type { IQuestionPostponementList } from "src/QuestionPostponementList";
import { FsrsAlgorithm } from "src/algorithms/fsrs";
import { CardType } from "src/Question";
import { DeckStatsService } from "src/dataStore/deckStatsService";

class IteratorStub implements IDeckTreeIterator {
    private baseDeck: Deck | null = null;

    get currentDeck(): Deck {
        return this.baseDeck ?? Deck.emptyDeck;
    }

    get currentCard(): any {
        return null;
    }

    get hasCurrentCard(): boolean {
        return false;
    }

    get currentTopicPath(): TopicPath {
        return TopicPath.emptyPath;
    }

    setBaseDeck(baseDeck: Deck): void {
        this.baseDeck = baseDeck;
    }

    setIteratorTopicPath(_topicPath: TopicPath): void {}

    deleteCurrentCardFromAllDecks(): boolean {
        return false;
    }

    deleteCurrentQuestionFromAllDecks(): boolean {
        return false;
    }

    moveCurrentCardToEndOfList(): void {}

    nextCard(): boolean {
        return false;
    }

    setCurrentCard(_card: any, _deck: Deck): void {}
}

function createQuestionPostponementList(): IQuestionPostponementList {
    return {
        clear: () => undefined,
        add: () => undefined,
        includes: () => false,
        write: async () => undefined,
    };
}

function createSettings(): SRSettings {
    const fsrs = createDefaultFsrsSettings({
        enable_fuzz: false,
        enable_short_term: true,
        learning_steps: ["1m", "10m"],
        relearning_steps: ["10m"],
    });

    return {
        ...DEFAULT_SETTINGS,
        fsrsSettings: { ...fsrs },
        deckOptionsPresets: [
            {
                ...DEFAULT_SETTINGS.deckOptionsPresets[0],
                learningSteps: "99m",
                lapseSteps: "88m",
                fsrs: { ...fsrs },
            },
        ],
    };
}

function installCardAlgorithm(settings: SRSettings): FsrsAlgorithm {
    (DataStore as any).instance = {
        dataPath: "./tracked_files.json",
    };
    const cardAlgorithm = new FsrsAlgorithm();
    cardAlgorithm.updateSettings(settings.fsrsSettings);

    (SRPlugin as any)._instance = {
        cardAlgorithm,
        getAlgorithmForItem: () => cardAlgorithm,
    };

    return cardAlgorithm;
}

function createSequencer(settings = createSettings()): FlashcardReviewSequencer {
    installCardAlgorithm(settings);
    return new FlashcardReviewSequencer(
        FlashcardReviewMode.Review,
        new IteratorStub(),
        settings,
        createQuestionPostponementList(),
    );
}

function createNewReviewItem(settings: SRSettings): RepetitionItem {
    const algorithm = new FsrsAlgorithm();
    algorithm.updateSettings(settings.fsrsSettings);

    const item = new RepetitionItem(
        1,
        "file-1",
        RPITEMTYPE.CARD,
        "#flashcards",
        algorithm.defaultData(),
    );
    item.queue = CardQueue.New;
    item.nextReview = 0;
    item.learningStep = null;
    return item;
}

function createLearningReviewItem(settings: SRSettings): RepetitionItem {
    const algorithm = new FsrsAlgorithm();
    algorithm.updateSettings(settings.fsrsSettings);

    const item = createNewReviewItem(settings);
    const againResult = algorithm.onSelection(item, "Again", false, false);
    item.reviewUpdate(againResult);
    return item;
}

function createCardForDeck(topicPath: TopicPath, id: number = 1) {
    return {
        Id: id,
        isNew: true,
        hasSchedule: false,
        cardListType: CardListType.NewCard,
        question: {
            topicPathList: {
                list: [topicPath],
            },
        },
    } as any;
}

function createStore(settings: SRSettings): DataStore {
    (Iadapter as any)._instance = {
        adapter: {},
        vault: {
            getAbstractFileByPath: (): null => null,
        },
    };
    const store = new DataStore(settings, "./");
    store.resetData();
    store.data.queues = Queue.create(store.data.queues as any);
    jest.spyOn(store, "requestFlushReviewOverlay").mockImplementation(() => undefined);
    jest.spyOn(store, "save").mockResolvedValue(undefined);
    return store;
}

function createTrackedCardState(settings: SRSettings, path = "cards/test.md") {
    const store = createStore(settings);
    store.trackFile(path, RPITEMTYPE.CARD, false);

    const trackedFile = store.getTrackedFile(path);
    const trackedItem = new TrackedItem(
        "card-hash",
        0,
        "context",
        CardType.SingleLineBasic,
        {
            startOffset: 0,
            endOffset: 10,
            blockStartOffset: 0,
            blockEndOffset: 10,
        },
        "c1",
    );
    trackedFile.trackedItems.push(trackedItem);
    store.updateCardItems(trackedFile, trackedItem, "#flashcards", false);

    const item = store.getItembyID(trackedItem.reviewId);
    return { store, trackedFile, trackedItem, item };
}

function installSequencerPlugin(
    settings: SRSettings,
    store: DataStore,
    overrides: Record<string, unknown> = {},
) {
    const cardAlgorithm = new FsrsAlgorithm();
    cardAlgorithm.updateSettings(settings.fsrsSettings);
    jest.spyOn(cardAlgorithm, "appendRevlog").mockResolvedValue("");

    const plugin: any = {
        cardAlgorithm,
        getAlgorithmForItem: () => cardAlgorithm,
        store,
        incrementDailyCounts: jest.fn(),
        decrementDailyCounts: jest.fn(),
        updateStatusBar: jest.fn(),
        appendSyroCardUpsert: jest.fn(async () => true),
        appendSyroCardRemove: jest.fn(async () => true),
        reviewPersistenceCoordinator: null,
        ...overrides,
    };

    (SRPlugin as any)._instance = plugin;
    return plugin;
}

describe("FlashcardReviewSequencer", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(DeckStatsService, "getInstance").mockReturnValue({
            recalculateDeck: jest.fn(),
        } as never);
    });

    test("constructs without legacy schedule calculator dependencies", () => {
        expect(() => createSequencer()).not.toThrow();
    });

    test("determineCardSchedule uses official FSRS preview intervals for new cards", () => {
        const settings = createSettings();
        const sequencer = createSequencer(settings);
        const item = createNewReviewItem(settings);

        (DataStore as any).instance = {
            dataPath: "./tracked_files.json",
            getItembyID: () => item,
        };
        (sequencer as any).remainingDeckTree = new Deck("root", null);
        (sequencer as any)._selectedTopicPath = TopicPath.emptyPath;

        const card = {
            Id: item.ID,
            cardListType: CardListType.NewCard,
        } as any;

        expect(sequencer.determineCardSchedule(ReviewResponse.Reset, card).interval).toBeCloseTo(
            1 / 1440,
            6,
        );
        expect(sequencer.determineCardSchedule(ReviewResponse.Hard, card).interval).toBeCloseTo(
            6 / 1440,
            6,
        );
        expect(sequencer.determineCardSchedule(ReviewResponse.Good, card).interval).toBeCloseTo(
            10 / 1440,
            6,
        );
        expect(sequencer.determineCardSchedule(ReviewResponse.Easy, card).interval).toBeCloseTo(
            8,
            6,
        );
    });

    test("determineCardSchedule uses official FSRS preview for learning cards", () => {
        const settings = createSettings();
        const sequencer = createSequencer(settings);
        const item = createLearningReviewItem(settings);

        (DataStore as any).instance = {
            dataPath: "./tracked_files.json",
            getItembyID: () => item,
        };
        (sequencer as any).remainingDeckTree = new Deck("root", null);
        (sequencer as any)._selectedTopicPath = TopicPath.emptyPath;

        const card = {
            Id: item.ID,
            cardListType: CardListType.LearningCard,
        } as any;

        expect(item.queue).toBe(CardQueue.Learn);
        expect(sequencer.determineCardSchedule(ReviewResponse.Good, card).interval).toBeCloseTo(
            1,
            6,
        );
    });

    test("syncGlobalRemainingDeckTree refreshes status bar after removing a card from today's queue", () => {
        const settings = createSettings();
        const sequencer = createSequencer(settings);
        const topicPath = new TopicPath(["DeckA"]);
        const root = new Deck("root", null);
        const deck = root.getOrCreateDeck(topicPath);
        const card = createCardForDeck(topicPath, 42);

        deck.dueFlashcards.push(card);
        (sequencer as any).globalRemainingDeckTree = root;
        (sequencer as any)._currentCard = card;

        const updateStatusBar = jest.fn();
        (SRPlugin as any)._instance = {
            ...(SRPlugin as any)._instance,
            updateStatusBar,
        };

        (sequencer as any).syncGlobalRemainingDeckTree(card, CardQueue.Review);

        expect(deck.dueFlashcards).toHaveLength(0);
        expect(updateStatusBar).toHaveBeenCalledTimes(1);
    });

    test("restoreGlobalRemainingDeckTree refreshes status bar after undo restores a due card", () => {
        const settings = createSettings();
        const sequencer = createSequencer(settings);
        const topicPath = new TopicPath(["DeckA"]);
        const root = new Deck("root", null);
        const deck = root.getOrCreateDeck(topicPath);
        const card = createCardForDeck(topicPath, 77);

        (sequencer as any).globalRemainingDeckTree = root;

        const updateStatusBar = jest.fn();
        (SRPlugin as any)._instance = {
            ...(SRPlugin as any)._instance,
            updateStatusBar,
        };

        (sequencer as any).restoreGlobalRemainingDeckTree(card, {
            originalDeck: deck,
            wasNew: false,
            fromLearningQueue: false,
        });

        expect(deck.dueFlashcards).toContain(card);
        expect(updateStatusBar).toHaveBeenCalledTimes(1);
    });

    test("processReview emits syro cards review session with updated snapshot", async () => {
        const settings = createSettings();
        const sequencer = createSequencer(settings);
        const topicPath = new TopicPath(["DeckA"]);
        const root = new Deck("root", null);
        const deck = root.getOrCreateDeck(topicPath);
        const { store, trackedFile, item } = createTrackedCardState(settings);
        const plugin = installSequencerPlugin(settings, store);
        const card = createCardForDeck(topicPath, item.ID);

        deck.newFlashcards.push(card);
        sequencer.setDeckTree(root, root, root, "DeckA");
        (DataStore as any).instance = store;
        (sequencer as any)._currentCard = card;
        (sequencer as any)._isLearning = false;

        sequencer.processReview(ReviewResponse.Good);
        await Promise.resolve();

        expect(plugin.appendSyroCardUpsert).toHaveBeenCalledTimes(1);
        const firstCall = plugin.appendSyroCardUpsert.mock.calls[0] as [any, string] | undefined;
        if (!firstCall) {
            throw new Error("Expected review session call");
        }
        const [snapshot, opType] = firstCall;
        expect(opType).toBe("review");
        expect(snapshot).toEqual(
            expect.objectContaining({
                path: "cards/test.md",
                trackedFileUuid: trackedFile.uuid,
                item: expect.objectContaining({
                    uuid: item.uuid,
                    ID: item.ID,
                }),
            }),
        );
        expect(snapshot.item.timesReviewed).toBeGreaterThan(0);
    });

    test("undoReview emits syro cards undo session with restored snapshot", async () => {
        const settings = createSettings();
        const sequencer = createSequencer(settings);
        const topicPath = new TopicPath(["DeckA"]);
        const root = new Deck("root", null);
        const deck = root.getOrCreateDeck(topicPath);
        const { store, item } = createTrackedCardState(settings);
        const plugin = installSequencerPlugin(settings, store);
        const card = createCardForDeck(topicPath, item.ID);

        deck.newFlashcards.push(card);
        sequencer.setDeckTree(root, root, root, "DeckA");
        (DataStore as any).instance = store;
        (sequencer as any)._currentCard = card;
        (sequencer as any)._isLearning = false;

        sequencer.processReview(ReviewResponse.Good);
        await Promise.resolve();
        plugin.appendSyroCardUpsert.mockClear();

        sequencer.undoReview();
        await Promise.resolve();

        expect(plugin.appendSyroCardUpsert).toHaveBeenCalledTimes(1);
        const firstCall = plugin.appendSyroCardUpsert.mock.calls[0] as [any, string] | undefined;
        if (!firstCall) {
            throw new Error("Expected undo session call");
        }
        const [snapshot, opType] = firstCall;
        expect(opType).toBe("undo");
        expect(snapshot.item.uuid).toBe(item.uuid);
        expect(snapshot.item.timesReviewed).toBe(0);
        expect(snapshot.item.queue).toBe(CardQueue.New);
    });

    test("untrackCurrentCard emits syro cards remove session with pre-remove snapshot", async () => {
        const settings = createSettings();
        const sequencer = createSequencer(settings);
        const topicPath = new TopicPath(["DeckA"]);
        const root = new Deck("root", null);
        const deck = root.getOrCreateDeck(topicPath);
        const { store, trackedFile, item } = createTrackedCardState(settings, "cards/remove.md");
        const plugin = installSequencerPlugin(settings, store);
        const card = createCardForDeck(topicPath, item.ID);
        const noteFile = {
            read: jest.fn(async () => "{{c1::Front}}"),
            write: jest.fn(async () => undefined),
        };

        card.question = {
            topicPathList: {
                list: [topicPath],
            },
            questionText: {
                actualQuestion: "{{c1::Front}}",
                original: "{{c1::Front}}",
            },
            note: {
                file: noteFile,
            },
        };
        deck.newFlashcards.push(card);
        sequencer.setDeckTree(root, root, root, "DeckA");
        (DataStore as any).instance = store;
        (sequencer as any)._currentCard = card;
        (sequencer as any)._isLearning = false;

        await sequencer.untrackCurrentCard();
        await Promise.resolve();

        expect(plugin.appendSyroCardRemove).toHaveBeenCalledTimes(1);
        const firstCall = plugin.appendSyroCardRemove.mock.calls[0] as [any, string] | undefined;
        if (!firstCall) {
            throw new Error("Expected remove session call");
        }
        const [snapshot, opType] = firstCall;
        expect(opType).toBe("remove");
        expect(snapshot.path).toBe("cards/remove.md");
        expect(snapshot.trackedFileUuid).toBe(trackedFile.uuid);
        expect(snapshot.item.uuid).toBe(item.uuid);
        expect(store.getItembyID(item.ID)?.isTracked).toBe(false);
    });
});
