import { CardListType, Deck } from "src/Deck";
import { FlashcardReviewMode, FlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import { TopicPath } from "src/TopicPath";
import { createDefaultFsrsSettings, DEFAULT_SETTINGS, SRSettings } from "src/settings";
import { ReviewResponse } from "src/scheduling";
import { CardQueue, RepetitionItem, RPITEMTYPE } from "src/dataStore/repetitionItem";
import { DataStore } from "src/dataStore/data";
import SRPlugin from "src/main";
import type { IDeckTreeIterator } from "src/DeckTreeIterator";
import type { IQuestionPostponementList } from "src/QuestionPostponementList";
import { FsrsAlgorithm } from "src/algorithms/fsrs";

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
        question: {
            topicPathList: {
                list: [topicPath],
            },
        },
    } as any;
}

describe("FlashcardReviewSequencer", () => {
    beforeEach(() => {
        jest.clearAllMocks();
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
});
