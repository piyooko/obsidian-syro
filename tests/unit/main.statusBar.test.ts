import { Card } from "src/Card";
import { Deck, DeckTreeFilter } from "src/Deck";
import SRPlugin from "src/main";

function createCard(id: number): Card {
    return new Card({ Id: id });
}

function createLearningCard(id: number, nextReview: number): Card {
    return new Card({
        Id: id,
        repetitionItem: {
            isReviewableLearning: (now: number, learnAheadMillis: number) =>
                nextReview <= now + Math.max(0, learnAheadMillis),
        } as any,
    });
}

function createPluginForStatusBar(deck: Deck, learnAheadMinutes: number = 15) {
    return {
        remainingDeckTree: deck,
        data: {
            settings: {
                learnAheadMinutes,
                showStatusBar: true,
            },
        },
        statusBarNote: {
            empty: jest.fn(),
            createSpan: jest.fn(() => ({ classList: { add: jest.fn() } })),
        },
        statusBarFlashcard: {
            empty: jest.fn(),
            createSpan: jest.fn(() => ({ classList: { add: jest.fn() } })),
        },
    };
}

describe("SRPlugin status bar card count", () => {
    beforeEach(() => {
        jest.spyOn(DeckTreeFilter, "filterByDailyLimits").mockImplementation((deck) => deck);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("returns 0 when there are no deck-tree subdecks", () => {
        const root = new Deck("root", null);
        const plugin = createPluginForStatusBar(root);

        expect((SRPlugin.prototype as any).getStatusBarReviewableCardCount.call(plugin)).toBe(0);
    });

    test("sums new, due, and reviewable learning counts from top-level deck tree decks", () => {
        const now = 1_700_000_000_000;
        jest.spyOn(Date, "now").mockReturnValue(now);

        const root = new Deck("root", null);
        const deckA = new Deck("A", root);
        const deckB = new Deck("B", root);
        root.subdecks.push(deckA, deckB);

        deckA.newFlashcards.push(createCard(1), createCard(2));
        deckA.dueFlashcards.push(createCard(3));
        deckA.learningFlashcards.push(createLearningCard(4, now + 10 * 60 * 1000));

        deckB.newFlashcards.push(createCard(5));
        deckB.dueFlashcards.push(createCard(6), createCard(7));

        const plugin = createPluginForStatusBar(root, 15);

        expect((SRPlugin.prototype as any).getStatusBarReviewableCardCount.call(plugin)).toBe(7);
    });

    test("deduplicates cards within each top-level deck total", () => {
        const now = 1_700_000_000_000;
        jest.spyOn(Date, "now").mockReturnValue(now);

        const root = new Deck("root", null);
        const deckA = new Deck("A", root);
        root.subdecks.push(deckA);

        const child = new Deck("A-child", deckA);
        deckA.subdecks.push(child);

        const sharedNew = createCard(1);
        const sharedDue = createCard(2);
        const sharedLearning = createLearningCard(3, now + 5 * 60 * 1000);

        deckA.newFlashcards.push(sharedNew);
        child.newFlashcards.push(sharedNew);
        deckA.dueFlashcards.push(sharedDue);
        child.dueFlashcards.push(sharedDue);
        deckA.learningFlashcards.push(sharedLearning);
        child.learningFlashcards.push(sharedLearning);

        const plugin = createPluginForStatusBar(root, 15);

        expect((SRPlugin.prototype as any).getStatusBarReviewableCardCount.call(plugin)).toBe(3);
    });

    test("ignores learning cards outside the learn-ahead window", () => {
        const now = 1_700_000_000_000;
        jest.spyOn(Date, "now").mockReturnValue(now);

        const root = new Deck("root", null);
        const deckA = new Deck("A", root);
        root.subdecks.push(deckA);
        deckA.learningFlashcards.push(createLearningCard(1, now + 20 * 60 * 1000));

        const plugin = createPluginForStatusBar(root, 15);

        expect((SRPlugin.prototype as any).getStatusBarReviewableCardCount.call(plugin)).toBe(0);
    });

    test("updateStatusBar still renders flashcard count when noteStats is missing", () => {
        const root = new Deck("root", null);
        const deckA = new Deck("A", root);
        root.subdecks.push(deckA);
        deckA.newFlashcards.push(createCard(1), createCard(2));

        const plugin = createPluginForStatusBar(root, 15) as any;
        plugin.updateStatusBarVisibility = jest.fn();
        plugin.getStatusBarReviewableCardCount = jest
            .fn()
            .mockImplementation((SRPlugin.prototype as any).getStatusBarReviewableCardCount.bind(plugin));

        (SRPlugin.prototype as any).updateStatusBar.call(plugin);

        expect(plugin.statusBarFlashcard.createSpan).toHaveBeenCalled();
        expect(plugin.statusBarNote.createSpan).toHaveBeenCalled();
    });
});
