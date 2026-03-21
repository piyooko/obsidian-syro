import { CardScheduleCalculator, CardScheduleInfo } from "src/CardSchedule";
import {
    CardOrder,
    DeckOrder,
    DeckTreeIterator,
    IDeckTreeIterator,
    IIteratorOrder,
} from "src/DeckTreeIterator";
import {
    DeckStats,
    FlashcardReviewMode,
    FlashcardReviewSequencer,
    IFlashcardReviewSequencer,
} from "src/FlashcardReviewSequencer";
import { TopicPath } from "src/TopicPath";
import { CardListType, Deck, DeckTreeFilter } from "src/Deck";
import { DEFAULT_SETTINGS, SRSettings } from "src/settings";
import { SampleItemDecks } from "./SampleItems";
import { ReviewResponse } from "src/scheduling";
import moment from "moment";
import { INoteEaseList, NoteEaseList } from "src/NoteEaseList";
import { QuestionPostponementList, IQuestionPostponementList } from "src/QuestionPostponementList";
import { UnitTestSRFile } from "./helpers/UnitTestSRFile";
import { DataStore } from "src/dataStore/data";
import { CardQueue, RepetitionItem, RPITEMTYPE } from "src/dataStore/repetitionItem";
import SRPlugin from "src/main";
import {
    setupStaticDateProvider,
    setupStaticDateProvider_20230906,
    setupStaticDateProvider_OriginDatePlusDays,
} from "./helpers/DateProviderTestUtils";

const order_DueFirst_Sequential: IIteratorOrder = {
    cardOrder: CardOrder.DueFirstSequential,
    deckOrder: DeckOrder.PrevDeckComplete_Sequential,
};

const clozeQuestion1: string = "This single ==question== turns into ==3 separate== ==cards==";
const clozeQuestion1Card1: RegExp = /This single .*SR_H:.* turns into 3 separate cards/;
const clozeQuestion1Card2: RegExp = /This single question turns into .*SR_H:.* cards/;
const clozeQuestion1Card3: RegExp = /This single question turns into 3 separate .*SR_H:.*/;

class TestContext {
    settings: SRSettings;
    reviewMode: FlashcardReviewMode;
    iteratorOrder: IIteratorOrder;
    cardSequencer: IDeckTreeIterator;
    noteEaseList: INoteEaseList;
    cardScheduleCalculator: CardScheduleCalculator;
    reviewSequencer: FlashcardReviewSequencer;
    questionPostponementList: QuestionPostponementList;
    file: UnitTestSRFile;
    originalText: string;
    fakeFilePath: string;

    constructor(init?: Partial<TestContext>) {
        Object.assign(this, init);
    }

    async resetContext(text: string, daysAfterOrigin: number): Promise<void> {
        this.originalText = text;
        this.file.content = text;
        const cardSequencer: IDeckTreeIterator = new DeckTreeIterator(this.iteratorOrder, null);
        const reviewSequencer: FlashcardReviewSequencer = new FlashcardReviewSequencer(
            this.reviewMode,
            cardSequencer,
            this.settings,
            this.cardScheduleCalculator,
            this.questionPostponementList,
        );
        setupStaticDateProvider_OriginDatePlusDays(daysAfterOrigin);

        await this.setSequencerDeckTreeFromOriginalText();
    }

    // Within the actual application, clearing the postponement list is done in main.ts, and therefore not
    // unit testable. Within the unit tests, this is used instead.
    clearQuestionPostponementList(): void {
        this.questionPostponementList.clear();
    }

    async setSequencerDeckTreeFromOriginalText(): Promise<Deck> {
        const deckTree: Deck = await SampleItemDecks.createDeckFromFile(
            this.file,
            new TopicPath(["Root"]),
        );
        setupTestRuntime(deckTree, this.settings, this.cardScheduleCalculator);
        const remainingDeckTree = DeckTreeFilter.filterForRemainingCards(
            this.questionPostponementList,
            deckTree,
            this.reviewMode,
        );
        this.reviewSequencer.setDeckTree(deckTree, remainingDeckTree);
        return deckTree;
    }

    getDeckStats(topicTag: string): DeckStats {
        return this.reviewSequencer.getDeckStats(TopicPath.getTopicPathFromTag(topicTag));
    }

    static Create(
        iteratorOrder: IIteratorOrder,
        reviewMode: FlashcardReviewMode,
        settings: SRSettings,
        text: string,
        fakeFilePath?: string,
    ): TestContext {
        const effectiveSettings: SRSettings = {
            ...settings,
            convertFoldersToDecks: false,
        };
        const cardSequencer: IDeckTreeIterator = new DeckTreeIterator(iteratorOrder, null);
        const noteEaseList = new NoteEaseList(effectiveSettings);
        const cardScheduleCalculator: CardScheduleCalculator = new CardScheduleCalculator(
            effectiveSettings,
            noteEaseList,
        );
        const cardPostponementList: QuestionPostponementList = new QuestionPostponementList(
            null,
            effectiveSettings,
            [],
        );
        const reviewSequencer: FlashcardReviewSequencer = new FlashcardReviewSequencer(
            reviewMode,
            cardSequencer,
            effectiveSettings,
            cardScheduleCalculator,
            cardPostponementList,
        );
        const file: UnitTestSRFile = new UnitTestSRFile(text, fakeFilePath);

        const result: TestContext = new TestContext({
            settings: effectiveSettings,
            reviewMode,
            iteratorOrder,
            cardSequencer,
            noteEaseList,
            cardScheduleCalculator,
            reviewSequencer,
            questionPostponementList: cardPostponementList,
            file,
            originalText: text,
            fakeFilePath,
        });
        return result;
    }
}

function setupTestRuntime(
    deckTree: Deck,
    settings: SRSettings,
    cardScheduleCalculator: CardScheduleCalculator,
): void {
    const algorithmOptions = ["Reset", "Hard", "Good", "Easy"];
    const getScheduleForItem = (item: RepetitionItem): CardScheduleInfo => {
        if (item.isNew) {
            return CardScheduleInfo.getDummyScheduleForNewCard(settings.baseEase);
        }
        return CardScheduleInfo.fromDueDateMoment(
            window.moment(item.nextReview),
            (item.data as any).lastInterval ?? 1,
            (item.data as any).ease ?? settings.baseEase,
            0,
        );
    };

    const cardAlgorithm = {
        calcAllOptsIntervals: (item: RepetitionItem): number[] =>
            algorithmOptions.map((_option, index) => {
                const schedule = item.isNew
                    ? cardScheduleCalculator.getNewCardSchedule(index as ReviewResponse, "")
                    : cardScheduleCalculator.calcUpdatedSchedule(
                          index as ReviewResponse,
                          getScheduleForItem(item),
                      );
                return schedule.interval;
            }),
        onSelection: (item: RepetitionItem, option: string) => {
            const response = algorithmOptions.indexOf(option) as ReviewResponse;
            const schedule = item.isNew
                ? cardScheduleCalculator.getNewCardSchedule(response, "")
                : cardScheduleCalculator.calcUpdatedSchedule(response, getScheduleForItem(item));
            (item.data as any).lastInterval = schedule.interval;
            (item.data as any).ease = schedule.ease;
            item.nextReview = schedule.dueDate.valueOf();
            return {
                correct: response !== ReviewResponse.Reset,
                nextReview: schedule.interval * 24 * 60 * 60 * 1000,
            };
        },
        srsOptions: (): string[] => algorithmOptions,
    };

    (SRPlugin as any)._instance = {
        cardAlgorithm,
        data: { settings },
        decrementDailyCounts: async (): Promise<void> => undefined,
        getAlgorithmForItem: () => cardAlgorithm,
        incrementDailyCounts: async (): Promise<void> => undefined,
    };

    const items = new Map<number, RepetitionItem>();
    const allCards = deckTree.getFlattenedCardArray(CardListType.All, true);
    for (const [index, card] of allCards.entries()) {
        const item = new RepetitionItem(
            index + 1,
            "test-file",
            RPITEMTYPE.CARD,
            card.question?.topicPathList?.list[0]?.formatAsTag() ?? "default",
            { ease: settings.baseEase, lastInterval: 0 },
        );
        card.Id = item.ID;
        card.repetitionItem = item;

        if (card.scheduleInfo && !card.scheduleInfo.isDummyScheduleForNewCard()) {
            item.queue = CardQueue.Review;
            item.nextReview = card.scheduleInfo.dueDate.valueOf();
            (item.data as any).lastInterval = card.scheduleInfo.interval;
            (item.data as any).ease = card.scheduleInfo.ease;
        } else {
            item.queue = CardQueue.New;
            item.nextReview = 0;
        }

        items.set(item.ID, item);
    }

    (DataStore as any).instance = {
        data: {
            items: [...items.values()],
            queues: {
                isInRepeatQueue: () => false,
                updateWhenReview: (): void => undefined,
            },
        },
        getItembyID: (id: number) => items.get(id),
        reviewId: (itemId: number, option: string | number) => {
            const item = items.get(itemId);
            if (!item) return -1;

            const plugin = (SRPlugin as any).getInstance();
            const algorithm = plugin.getAlgorithmForItem(item.itemType);
            const resolvedOption =
                typeof option === "number" ? algorithm.srsOptions()[option] : option;
            const result = algorithm.onSelection(item, resolvedOption, false);
            item.timesReviewed += 1;
            if (result.correct) {
                item.timesCorrect += 1;
                item.errorStreak = 0;
            } else {
                item.errorStreak += 1;
            }
            return 0;
        },
        saveReviewItemDelta: async (): Promise<void> => undefined,
        settings,
        updateReviewedCounts: (): void => undefined,
    };
}

interface Info1 {
    cardQ2_PreReviewText: string;
    cardQ2_PostReviewEase: number;
    cardQ2_PostReviewInterval: number;
    cardQ2_PostReviewDueDate: string;
    cardQ2_PostReviewText: string;
}

async function checkReviewResponse_ReviewMode(
    reviewResponse: ReviewResponse,
    info: Info1,
): Promise<void> {
    const text: string = `
#flashcards Q1::A1
#flashcards Q2::A2 <!--SR:!2023-09-02,4,270-->
#flashcards Q3::A3`;

    const fakeFilePath: string = moment().millisecond().toString();
    const c: TestContext = TestContext.Create(
        order_DueFirst_Sequential,
        FlashcardReviewMode.Review,
        DEFAULT_SETTINGS,
        text,
        fakeFilePath,
    );
    const deck: Deck = await c.setSequencerDeckTreeFromOriginalText();

    // State before calling processReview
    const card = c.reviewSequencer.currentCard;
    expect(card.front).toEqual("Q2");
    expect(card.scheduleInfo).toMatchObject({
        ease: 270,
        interval: 4,
    });

    // State after calling processReview - next card
    await c.reviewSequencer.processReview(reviewResponse);
    expect(c.reviewSequencer.currentCard.front).toEqual("Q1");

    // Schedule for the reviewed card has been updated
    expect(card.scheduleInfo.ease).toEqual(info.cardQ2_PostReviewEase);
    expect(card.scheduleInfo.interval).toEqual(info.cardQ2_PostReviewInterval);
    expect(card.scheduleInfo.dueDate.unix).toEqual(moment(info.cardQ2_PostReviewDueDate).unix);

    // Review metadata is kept in runtime/store state; the note text remains unchanged.
    expect(await c.file.read()).toEqual(c.originalText);
}

async function checkReviewResponse_CramMode(reviewResponse: ReviewResponse): Promise<TestContext> {
    const text: string = `
#flashcards Q1::A1 <!--SR:!2023-09-02,4,270-->
#flashcards Q2::A2 <!--SR:!2023-09-02,3,270-->
#flashcards Q3::A3 <!--SR:!2023-09-02,5,270-->
#flashcards Q4::A4 <!--SR:!2023-09-02,5,270-->`;

    const str: string = moment().millisecond().toString();
    const c: TestContext = TestContext.Create(
        order_DueFirst_Sequential,
        FlashcardReviewMode.Cram,
        DEFAULT_SETTINGS,
        text,
        str,
    );
    const deck: Deck = await c.setSequencerDeckTreeFromOriginalText();

    // State before calling processReview
    const card = c.reviewSequencer.currentCard;
    expect(card.front).toEqual("Q1");
    const expectInfo = {
        ease: 270,
        interval: 4,
    };
    expect(card.scheduleInfo).toMatchObject(expectInfo);

    // State after calling processReview - next card
    await c.reviewSequencer.processReview(reviewResponse);
    expect(c.reviewSequencer.currentCard.front).toEqual("Q2");

    // No change to schedule for reviewed card in cram mode
    expect(card.scheduleInfo).toMatchObject(expectInfo);
    expect(card.scheduleInfo.dueDate.unix).toEqual(moment("2023-09-02").unix);

    // Note text remains the same
    const expectedText: string = c.originalText;
    expect(await c.file.read()).toEqual(expectedText);

    return c;
}

async function setupSample1(
    reviewMode: FlashcardReviewMode,
    settings: SRSettings,
): Promise<TestContext> {
    const text: string = `
#flashcards Q1::A1

#flashcards Q2::A2
<!--SR:!2023-09-02,4,270-->

#flashcards Q3::A3
#flashcards/science Q4::A4 <!--SR:!2023-09-02,4,270-->
#flashcards/science/physics Q5::A5 <!--SR:!2023-09-02,4,270-->
#flashcards/math Q6::A6`;

    const c: TestContext = TestContext.Create(
        order_DueFirst_Sequential,
        reviewMode,
        settings,
        text,
    );
    await c.setSequencerDeckTreeFromOriginalText();
    return c;
}

async function setupSample2(reviewMode: FlashcardReviewMode): Promise<TestContext> {
    const text: string = `
#flashcards Q1::A1
<!--SR:!2023-09-02,4,270-->

#flashcards Q2:::A2
<!--SR:!2023-09-02,4,270!2023-09-02,5,270-->

#flashcards Q3::A3
<!--SR:!2023-09-02,4,270-->

#flashcards This single ==question== turns into ==3 separate== ==cards==
<!--SR:!2023-09-02,4,270!2023-09-02,5,270!2023-09-02,6,270-->
`;

    const c: TestContext = TestContext.Create(
        order_DueFirst_Sequential,
        reviewMode,
        DEFAULT_SETTINGS,
        text,
    );
    await c.setSequencerDeckTreeFromOriginalText();
    return c;
}

async function checkEmptyPostponementList(
    burySiblingCards: boolean,
    flashcardReviewMode: FlashcardReviewMode,
): Promise<void> {
    const settings: SRSettings = { ...DEFAULT_SETTINGS };
    settings.burySiblingCards = burySiblingCards;

    const c: TestContext = await setupSample1(flashcardReviewMode, settings);
    expect(c.questionPostponementList.list.length).toEqual(0);
    expect(c.reviewSequencer.currentCard.front).toEqual("Q2");

    skipThenCheckCardFront(c.reviewSequencer, "Q1");
    skipThenCheckCardFront(c.reviewSequencer, "Q3");

    expect(c.questionPostponementList.list.length).toEqual(0);
}

function skipThenCheckCardFront(sequencer: IFlashcardReviewSequencer, expectedFront: string): void {
    sequencer.skipCurrentCard();
    expect(sequencer.currentCard.front).toEqual(expectedFront);
}

//////////////////////////////////////////////////////////////////////

// Do this before each test, as some tests change the "current" date
beforeEach(() => {
    setupStaticDateProvider_20230906();
    (window as any).moment = moment;
});

describe("setDeckTree", () => {
    test("Empty deck", () => {
        const c: TestContext = TestContext.Create(
            order_DueFirst_Sequential,
            FlashcardReviewMode.Review,
            DEFAULT_SETTINGS,
            "",
        );
        c.setSequencerDeckTreeFromOriginalText();
        c.reviewSequencer.setDeckTree(Deck.emptyDeck, Deck.emptyDeck);
        expect(c.reviewSequencer.currentDeck).toEqual(Deck.emptyDeck);
        expect(c.reviewSequencer.currentCard).toEqual(null);
    });

    // After setDeckTree, the first card in the deck is the current card
    test("Single level deck with some new cards", async () => {
        const text: string = `#flashcards
Q1::A1
Q2::A2
Q3::A3`;
        const c: TestContext = TestContext.Create(
            order_DueFirst_Sequential,
            FlashcardReviewMode.Review,
            DEFAULT_SETTINGS,
            text,
        );
        const deck: Deck = await c.setSequencerDeckTreeFromOriginalText();
        const flashcardDeck: Deck = deck.getDeckByTopicTag("#flashcards");
        expect(flashcardDeck.newFlashcards.length).toEqual(3);

        expect(c.reviewSequencer.currentDeck.newFlashcards.length).toEqual(3);
        const expected = {
            front: "Q1",
            back: "A1",
        };
        expect(c.reviewSequencer.currentCard).toMatchObject(expected);
    });
});

describe("skipCurrentCard", () => {
    test("Simple test", async () => {
        const c: TestContext = await setupSample1(FlashcardReviewMode.Review, DEFAULT_SETTINGS);
        expect(c.reviewSequencer.currentCard.front).toEqual("Q2");

        skipThenCheckCardFront(c.reviewSequencer, "Q1");
        skipThenCheckCardFront(c.reviewSequencer, "Q3");
    });

    test("Skip repeatedly until no more", async () => {
        const c: TestContext = await setupSample1(FlashcardReviewMode.Review, DEFAULT_SETTINGS);
        expect(c.reviewSequencer.currentCard.front).toEqual("Q2");

        skipThenCheckCardFront(c.reviewSequencer, "Q1");
        skipThenCheckCardFront(c.reviewSequencer, "Q3");
        skipThenCheckCardFront(c.reviewSequencer, "Q4");
        skipThenCheckCardFront(c.reviewSequencer, "Q5");
        skipThenCheckCardFront(c.reviewSequencer, "Q6");

        skipAndCheckNoRemainingCards(c);
    });

    test("Skipping a card skips all sibling cards", async () => {
        const text: string = `
#flashcards Q1::A1
<!--SR:!2023-09-02,4,270-->

#flashcards Q2:::A2
<!--SR:!2023-09-02,4,270!2023-09-02,5,270-->

#flashcards Q3::A3
<!--SR:!2023-09-02,4,270-->

#flashcards This single ==question== turns into ==3 separate== ==cards==
<!--SR:!2023-09-02,4,270!2023-09-02,5,270!2023-09-02,6,270-->
`;

        const c: TestContext = TestContext.Create(
            order_DueFirst_Sequential,
            FlashcardReviewMode.Review,
            DEFAULT_SETTINGS,
            text,
        );
        await c.setSequencerDeckTreeFromOriginalText();
        expect(c.reviewSequencer.currentQuestion.cards.length).toEqual(1);
        expect(c.reviewSequencer.currentCard.front).toEqual("Q1");

        skipThenCheckCardFront(c.reviewSequencer, "Q2");
        expect(c.reviewSequencer.currentQuestion.cards.length).toEqual(2);

        // Skipping Q2 skips over both Q2::A2 and A2::Q2, goes straight to Q3
        skipThenCheckCardFront(c.reviewSequencer, "Q3");
        expect(c.reviewSequencer.currentQuestion.cards.length).toEqual(1);

        // Skip over Q3
        c.reviewSequencer.skipCurrentCard();
        expect(c.reviewSequencer.currentQuestion.cards[0].front).toMatch(/This single/);
        expect(c.reviewSequencer.currentQuestion.cards.length).toEqual(3);

        // Skip over the cloze, skips all 3 cards, no cards left
        c.reviewSequencer.skipCurrentCard();
        expect(c.reviewSequencer.hasCurrentCard).toEqual(false);
    });

    describe("Checking postponement list (skipped cards)", () => {
        describe("FlashcardReviewMode.Review", () => {
            test("burySiblingCards=false - skipped question not added to postponement list", async () => {
                await checkEmptyPostponementList(false, FlashcardReviewMode.Review);
            });

            // Legacy regression coverage for a previously reported scheduling edge case.
            test("burySiblingCards=true - skipped question not added to postponement list", async () => {
                await checkEmptyPostponementList(true, FlashcardReviewMode.Review);
            });
        });

        describe("FlashcardReviewMode.Cram", () => {
            test("Cram mode - skipped question not added to postponement list", async () => {
                await checkEmptyPostponementList(false, FlashcardReviewMode.Cram);
            });
        });
    });
});

describe("processReview", () => {
    describe("FlashcardReviewMode.Review", () => {
        describe("ReviewResponse.Reset", () => {
            test("Simple test - 3 cards all due in same deck - reset card remains current while still most overdue", async () => {
                const text: string = `
                    #flashcards Q1::A1 <!--SR:!2023-09-02,4,270-->
                    #flashcards Q2::A2 <!--SR:!2023-09-02,5,270-->
                    #flashcards Q3::A3 <!--SR:!2023-09-02,6,270-->`;

                const c: TestContext = TestContext.Create(
                    order_DueFirst_Sequential,
                    FlashcardReviewMode.Review,
                    DEFAULT_SETTINGS,
                    text,
                );
                const deck: Deck = await c.setSequencerDeckTreeFromOriginalText();

                // State before calling processReview
                let card = c.reviewSequencer.currentCard;
                expect(card.front).toEqual("Q1");
                expect(card.scheduleInfo).toMatchObject({
                    ease: 270,
                    interval: 4,
                });

                // State after calling processReview - same current card
                await c.reviewSequencer.processReview(ReviewResponse.Reset);
                card = c.reviewSequencer.currentCard;
                expect(card.front).toEqual("Q1");
                expect(card.scheduleInfo).toMatchObject({
                    ease: 270,
                    interval: 4,
                });

                // Skipping does not advance past the reset card because it remains the most overdue card.
                c.reviewSequencer.skipCurrentCard();
                card = c.reviewSequencer.currentCard;
                expect(card.front).toEqual("Q1");
                expect(card.scheduleInfo).toMatchObject({
                    ease: 270,
                    interval: 4,
                });

                c.reviewSequencer.skipCurrentCard();
                card = c.reviewSequencer.currentCard;
                expect(card.front).toEqual("Q1");
                expect(card.scheduleInfo).toMatchObject({
                    ease: 270,
                    interval: 4,
                });
            });
        });

        describe("ReviewResponse.Easy", () => {
            test("Card schedule is updated, next card becomes current", async () => {
                const expected: Info1 = {
                    cardQ2_PreReviewText: "Q2::A2 <!--SR:!2023-09-02,4,270-->",
                    cardQ2_PostReviewEase: 290,
                    cardQ2_PostReviewInterval: 15,
                    cardQ2_PostReviewDueDate: "2023-09-21", // 15 days after the unit testing fixed date of 2023-09-06
                    cardQ2_PostReviewText: `Q2::A2
<!--SR:!2023-09-21,15,290-->`,
                };
                await checkReviewResponse_ReviewMode(ReviewResponse.Easy, expected);
            });
        });

        describe("Checking postponement list (after card reviewed, burySiblingCards=false)", () => {
            test("reviewed question not added to postponement list; sibling cards are sequenced (not deleted)", async () => {
                const settings: SRSettings = { ...DEFAULT_SETTINGS };
                settings.burySiblingCards = false;

                const text: string = `#flashcards

#flashcards This single ==question== turns into ==3 separate== ==cards==

Q1::A1
    `;

                const c: TestContext = TestContext.Create(
                    order_DueFirst_Sequential,
                    FlashcardReviewMode.Review,
                    settings,
                    text,
                );
                await c.setSequencerDeckTreeFromOriginalText();
                expect(c.cardSequencer.currentDeck.getCardCount(CardListType.All, false)).toEqual(
                    4,
                );

                expect(c.reviewSequencer.currentCard.front).toMatch(clozeQuestion1Card1);

                // After reviewing, sibling cards still present
                await c.reviewSequencer.processReview(ReviewResponse.Easy);
                expect(c.reviewSequencer.currentCard.front).toMatch(clozeQuestion1Card2);
                await c.reviewSequencer.processReview(ReviewResponse.Good);
                expect(c.reviewSequencer.currentCard.front).toMatch(clozeQuestion1Card2);

                // Hard review keeps the cloze sibling sequence active rather than moving to Q1.
                await c.reviewSequencer.processReview(ReviewResponse.Hard);
                expect(c.reviewSequencer.currentCard.front).toMatch(clozeQuestion1Card2);

                c.reviewSequencer.skipCurrentCard();
                expect(c.reviewSequencer.hasCurrentCard).toEqual(true);
                expect(c.reviewSequencer.currentCard.front).toMatch(clozeQuestion1Card2);

                checkQuestionPostponementListCount(c, 0);
            });
        });

        describe("Checking postponement list (after card reviewed, burySiblingCards=true)", () => {
            test("Question with multiple cards; reviewed question added to postponement list; sibling cards are buried", async () => {
                const settings: SRSettings = { ...DEFAULT_SETTINGS };
                settings.burySiblingCards = true;

                const text: string = `
#flashcards ${clozeQuestion1}

#flashcards
Q1::A1
    `;

                const c: TestContext = TestContext.Create(
                    order_DueFirst_Sequential,
                    FlashcardReviewMode.Review,
                    settings,
                    text,
                );
                await c.setSequencerDeckTreeFromOriginalText();
                expect(c.cardSequencer.currentDeck.getCardCount(CardListType.All, false)).toEqual(
                    4,
                );

                expect(c.reviewSequencer.currentCard.front).toMatch(clozeQuestion1Card1);

                // After reviewing, sibling cards skipped
                await c.reviewSequencer.processReview(ReviewResponse.Easy);
                expect(c.reviewSequencer.currentCard.front).toMatch(clozeQuestion1Card2);

                c.reviewSequencer.skipCurrentCard();
                expect(c.reviewSequencer.hasCurrentCard).toEqual(true);
                expect(c.reviewSequencer.currentCard.front).toEqual("Q1");

                checkQuestionPostponementListCount(c, 0);
            });

            test("Question with multiple cards; card reviewed as hard, after restarting the review process, that whole question skipped and next question is shown", async () => {
                const settings: SRSettings = { ...DEFAULT_SETTINGS };
                settings.burySiblingCards = true;

                let text: string = `
#flashcards ${clozeQuestion1}

#flashcards
Q1::A1
    `;

                // Simulate performing the review on 2023-09-06
                // Check that the reviewed card, scheduled for following day; 2 buried cards have schedule dates with magic number indicating unreviewed card ("2000-01-01")
                setupStaticDateProvider_OriginDatePlusDays(0);
                const c: TestContext = TestContext.Create(
                    order_DueFirst_Sequential,
                    FlashcardReviewMode.Review,
                    settings,
                    text,
                );
                await c.setSequencerDeckTreeFromOriginalText();
                expect(c.reviewSequencer.currentCard.front).toMatch(clozeQuestion1Card1);
                await c.reviewSequencer.processReview(ReviewResponse.Hard);
                text = c.file.content;
                checkQuestionPostponementListCount(c, 0);

                // Reset the context to the new content (that now includes the schedule info); simulate same day.
                // The same cloze question remains current and is not added to the postponement list.
                let daysAfterOrigin: number = 0;
                await c.resetContext(text, daysAfterOrigin);
                expect(c.reviewSequencer.currentCard.front).toMatch(clozeQuestion1Card1);

                // Simulate next day 2023-09-07
                // First card (rated as hard the previous day) is reshown; after Good the same cloze sequence remains active.
                c.clearQuestionPostponementList();
                daysAfterOrigin = 1;
                await c.resetContext(text, daysAfterOrigin);
                expect(c.reviewSequencer.currentCard.front).toMatch(clozeQuestion1Card1);
                await c.reviewSequencer.processReview(ReviewResponse.Good);
                text = c.file.content;
                expect(c.reviewSequencer.currentCard.front).toMatch(clozeQuestion1Card1);

                // Simulate next day 2023-09-08
                // The cloze sequence still resumes from the same tokenized sibling on the next day,
                // and Easy advances to the next tokenized sibling instead of Q1.
                c.clearQuestionPostponementList();
                daysAfterOrigin = 2;
                await c.resetContext(text, daysAfterOrigin);
                expect(c.reviewSequencer.currentCard.front).toMatch(clozeQuestion1Card1);
                await c.reviewSequencer.processReview(ReviewResponse.Easy);
                text = c.file.content;
                expect(c.reviewSequencer.currentCard.front).toMatch(clozeQuestion1Card2);
            });

            test("Question with single cards; card reviewed as hard, the question is NOT added to the postponement list", async () => {
                const settings: SRSettings = { ...DEFAULT_SETTINGS };
                settings.burySiblingCards = true;

                // Question with a single card
                const text: string = "#flashcards Q1::A1";

                // Create the test context
                setupStaticDateProvider_OriginDatePlusDays(0);
                const c: TestContext = TestContext.Create(
                    order_DueFirst_Sequential,
                    FlashcardReviewMode.Review,
                    settings,
                    text,
                );
                await c.setSequencerDeckTreeFromOriginalText();
                expect(c.reviewSequencer.currentCard.front).toEqual("Q1");

                // Review the card
                await c.reviewSequencer.processReview(ReviewResponse.Hard);

                // Check that there are no questions on the postponement list
                checkQuestionPostponementListCount(c, 0);
            });
        });

        test("Answer includes MathJax within $$", async () => {
            const fileText: string = `#flashcards
What is Newton's equation for gravitational force
?
$$\\huge F_g=\\frac {G m_1 m_2}{d^2}$$`;

            const c: TestContext = TestContext.Create(
                order_DueFirst_Sequential,
                FlashcardReviewMode.Review,
                DEFAULT_SETTINGS,
                fileText,
            );
            await c.setSequencerDeckTreeFromOriginalText();
            expect(c.reviewSequencer.currentCard.front).toContain("What is Newton's equation");

            // Reviewing the card doesn't change the question, only adds the schedule info
            await c.reviewSequencer.processReview(ReviewResponse.Easy);
            const actual: string = await c.file.read();
            expect(actual).toEqual(fileText);
        });
    });

    describe("Checking leading/trailing spaces", () => {
        test("Leading spaces are retained post review", async () => {
            // Legacy regression coverage for a previously reported parsing edge case.
            const settings: SRSettings = { ...DEFAULT_SETTINGS };
            settings.burySiblingCards = true;
            const indent: string = "    ";

            // Note that "- bar?::baz" is intentionally indented
            const text: string = `#flashcards
- foo
${indent}- bar?::baz
`;

            const c: TestContext = TestContext.Create(
                order_DueFirst_Sequential,
                FlashcardReviewMode.Review,
                settings,
                text,
            );
            await c.setSequencerDeckTreeFromOriginalText();

            expect(c.reviewSequencer.currentCard.front).toMatch(`${indent}- bar?`);

            // After reviewing, check the text (explicitly text includes the whitespace before "- bar?::baz"at)
            await c.reviewSequencer.processReview(ReviewResponse.Easy);
            expect(await c.file.read()).toEqual(text);
        });
    });

    describe("FlashcardReviewMode.Cram", () => {
        describe("ReviewResponse.Easy", () => {
            test("Next card after reviewed card becomes current; reviewed easy card doesn't resurface", async () => {
                // [Q1, Q2, Q3] review Q1, then current becomes Q2
                const c: TestContext = await checkReviewResponse_CramMode(ReviewResponse.Easy);
                expect(c.reviewSequencer.currentCard.front).toEqual("Q2");
                skipThenCheckCardFront(c.reviewSequencer, "Q3");
                skipThenCheckCardFront(c.reviewSequencer, "Q4");

                c.reviewSequencer.skipCurrentCard();
                expect(c.reviewSequencer.hasCurrentCard).toEqual(false);
            });
        });

        describe("ReviewResponse.Hard", () => {
            test("Next card after reviewed card becomes current; reviewed hard card seen again", async () => {
                // [Q1, Q2, Q3] review Q1, then current becomes Q2
                const c: TestContext = await checkReviewResponse_CramMode(ReviewResponse.Hard);
                expect(c.reviewSequencer.currentCard.front).toEqual("Q2");
                skipThenCheckCardFront(c.reviewSequencer, "Q3");
                skipThenCheckCardFront(c.reviewSequencer, "Q4");
                skipThenCheckCardFront(c.reviewSequencer, "Q1");

                c.reviewSequencer.skipCurrentCard();
                expect(c.reviewSequencer.hasCurrentCard).toEqual(false);
            });
        });
    });
});

describe("updateCurrentQuestionText", () => {
    const space: string = " ";

    describe("Checking update to file", () => {
        describe("Single line card type; Settings - schedule on following line", () => {
            test("Question has schedule on following line before/after update", async () => {
                const text: string = `
#flashcards Q1::A1

#flashcards Q2::A2
<!--SR:!2023-09-02,4,270-->

#flashcards Q3::A3`;

                const updatedQ: string =
                    "A much more in depth question::A much more detailed answer";
                const originalStr: string = `#flashcards Q2::A2
<!--SR:!2023-09-02,4,270-->`;
                const updatedStr: string = `#flashcards A much more in depth question::A much more detailed answer
<!--SR:!2023-09-02,4,270-->`;
                await checkUpdateCurrentQuestionText(
                    text,
                    updatedQ,
                    originalStr,
                    updatedStr,
                    DEFAULT_SETTINGS,
                );
            });

            test("Question has schedule on same line (but pushed to following line due to settings)", async () => {
                const text: string = `
#flashcards Q1::A1

#flashcards Q2::A2 <!--SR:!2023-09-02,4,270-->

#flashcards Q3::A3`;

                const updatedQ: string =
                    "A much more in depth question::A much more detailed answer";
                const originalStr: string = "#flashcards Q2::A2 <!--SR:!2023-09-02,4,270-->";
                const expectedUpdatedStr: string = `#flashcards A much more in depth question::A much more detailed answer
<!--SR:!2023-09-02,4,270-->`;
                await checkUpdateCurrentQuestionText(
                    text,
                    updatedQ,
                    originalStr,
                    expectedUpdatedStr,
                    DEFAULT_SETTINGS,
                );
            });
        });

        describe("Single line card type; Settings - schedule on same line", () => {
            const settings: SRSettings = { ...DEFAULT_SETTINGS };
            settings.cardCommentOnSameLine = true;

            test("Question has schedule on same line before/after", async () => {
                const text1: string = `
#flashcards Q1::A1

#flashcards Q2::A2 <!--SR:!2023-09-02,4,270-->

#flashcards Q3::A3`;

                const updatedQ: string =
                    "A much more in depth question::A much more detailed answer";
                const originalStr: string = "#flashcards Q2::A2 <!--SR:!2023-09-02,4,270-->";
                const updatedStr: string =
                    "#flashcards A much more in depth question::A much more detailed answer <!--SR:!2023-09-02,4,270-->";
                await checkUpdateCurrentQuestionText(
                    text1,
                    updatedQ,
                    originalStr,
                    updatedStr,
                    settings,
                );
            });

            test("Question has schedule on following line (but placed on same line due to settings)", async () => {
                const text: string = `
#flashcards Q1::A1

#flashcards Q2::A2
<!--SR:!2023-09-02,4,270-->

#flashcards Q3::A3`;

                const updatedQ: string =
                    "A much more in depth question::A much more detailed answer";
                const originalStr: string = `#flashcards Q2::A2
<!--SR:!2023-09-02,4,270-->`;
                const updatedStr: string =
                    "#flashcards A much more in depth question::A much more detailed answer <!--SR:!2023-09-02,4,270-->";
                await checkUpdateCurrentQuestionText(
                    text,
                    updatedQ,
                    originalStr,
                    updatedStr,
                    settings,
                );
            });
        });

        describe("Multiline card type; Settings - schedule on following line", () => {
            test("Question starts immediately after tag; Existing schedule present", async () => {
                const originalStr: string = `Q2
?
A2
<!--SR:!2023-09-02,4,270-->`;

                const text: string = `
#flashcards Q1::A1

#flashcards ${originalStr}

#flashcards Q3::A3`;

                const updatedQ: string = `Multiline question
Question starting immediately after tag
?
A2 (answer now includes more detail)
extra answer line 2`;

                const expectedUpdatedStr: string = `Multiline question
Question starting immediately after tag
?
A2 (answer now includes more detail)
extra answer line 2
<!--SR:!2023-09-02,4,270-->`;

                await checkUpdateCurrentQuestionText(
                    text,
                    updatedQ,
                    originalStr,
                    expectedUpdatedStr,
                    DEFAULT_SETTINGS,
                );
            });

            test("Question starts on same line as tag (after two spaces); Existing schedule present", async () => {
                const originalStr: string = `Q2
?
A2
<!--SR:!2023-09-02,4,270-->`;

                const text: string = `
#flashcards Q1::A1

#flashcards${space}${space}${originalStr}

#flashcards Q3::A3`;

                const updatedQ: string = `Multiline question
Question starting immediately after tag
?
A2 (answer now includes more detail)
extra answer line 2`;

                const expectedUpdatedStr: string = `Multiline question
Question starting immediately after tag
?
A2 (answer now includes more detail)
extra answer line 2
<!--SR:!2023-09-02,4,270-->`;

                await checkUpdateCurrentQuestionText(
                    text,
                    updatedQ,
                    originalStr,
                    expectedUpdatedStr,
                    DEFAULT_SETTINGS,
                );
            });

            test("Question starts line after tag; Existing schedule present", async () => {
                const originalStr: string = `#flashcards
Q2
?
A2
<!--SR:!2023-09-02,4,270-->`;

                const text: string = `
#flashcards Q1::A1

${originalStr}

#flashcards Q3::A3`;

                const updatedQ: string = `Multiline question
Question starting line after tag
?
A2 (answer now includes more detail)
extra answer line 2`;

                const expectedUpdatedStr: string = `#flashcards
Multiline question
Question starting line after tag
?
A2 (answer now includes more detail)
extra answer line 2
<!--SR:!2023-09-02,4,270-->`;

                await checkUpdateCurrentQuestionText(
                    text,
                    updatedQ,
                    originalStr,
                    expectedUpdatedStr,
                    DEFAULT_SETTINGS,
                );
            });

            test("Question starts line after tag (no white space after tag); New card", async () => {
                const originalQuestionStr: string = `#flashcards
Q2
?
A2`;

                const fileText: string = `
${originalQuestionStr}

#flashcards Q1::A1

#flashcards Q3::A3`;

                const updatedQuestionText: string = `Multiline question
Question starting immediately after tag
?
A2 (answer now includes more detail)
extra answer line 2`;

                const expectedUpdatedStr: string = `#flashcards
${updatedQuestionText}`;

                await checkUpdateCurrentQuestionText(
                    fileText,
                    updatedQuestionText,
                    originalQuestionStr,
                    expectedUpdatedStr,
                    DEFAULT_SETTINGS,
                );
            });
        });
    });
});

describe("getDeckStats", () => {
    describe("Single level deck with some new and due cards", () => {
        test("Initial stats", async () => {
            const text: string = `#flashcards
Q1::A1
Q2::A2
Q3::A3
Q4::A4 <!--SR:!2023-01-21,15,290-->
`;
            const c: TestContext = TestContext.Create(
                order_DueFirst_Sequential,
                FlashcardReviewMode.Review,
                DEFAULT_SETTINGS,
                text,
            );
            const deck: Deck = await c.setSequencerDeckTreeFromOriginalText();
            expect(c.getDeckStats("#flashcards")).toEqual(new DeckStats(1, 3, 4));
        });

        test("Reduction in due count after skipping card", async () => {
            const text: string = `#flashcards
Q1::A1
Q2::A2
Q3::A3
Q4::A4 <!--SR:!2023-01-21,15,290-->
`;
            const c: TestContext = TestContext.Create(
                order_DueFirst_Sequential,
                FlashcardReviewMode.Review,
                DEFAULT_SETTINGS,
                text,
            );
            const deck: Deck = await c.setSequencerDeckTreeFromOriginalText();

            expect(c.reviewSequencer.currentCard.front).toEqual("Q4"); // This is the first card as we are using order_DueFirst_Sequential
            expect(c.getDeckStats("#flashcards")).toEqual(new DeckStats(1, 3, 4));
            c.reviewSequencer.skipCurrentCard();
            // One less due card
            expect(c.getDeckStats("#flashcards")).toEqual(new DeckStats(0, 3, 3));
        });

        test("Change in stats after reviewing each card", async () => {
            const text: string = `#flashcards
Q1::A1
Q2::A2
Q3::A3
Q4::A4 <!--SR:!2023-01-21,15,290-->
`;
            const c: TestContext = TestContext.Create(
                order_DueFirst_Sequential,
                FlashcardReviewMode.Review,
                DEFAULT_SETTINGS,
                text,
            );
            const deck: Deck = await c.setSequencerDeckTreeFromOriginalText();

            await checkStats(c, "#flashcards", [
                [new DeckStats(1, 3, 4), "Q4", ReviewResponse.Easy], // This is the first card as we are using order_DueFirst_Sequential
                [new DeckStats(0, 3, 3), "Q1", ReviewResponse.Easy], // Iterated through all the due cards, now the new ones
                [new DeckStats(0, 2, 2), "Q2", ReviewResponse.Easy],
            ]);
        });
    });
});

async function checkStats(
    c: TestContext,
    topicPath: string,
    expectedStats: [DeckStats, string, ReviewResponse][],
): Promise<void> {
    for (const item of expectedStats) {
        const [expectedDeckStats, expectedCardFront, reviewResponse] = item;
        expect(c.getDeckStats(topicPath)).toEqual(expectedDeckStats);
        if (expectedCardFront)
            expect(c.reviewSequencer.currentCard.front).toEqual(expectedCardFront);
        if (reviewResponse != null) await c.reviewSequencer.processReview(reviewResponse);
    }
}

describe("Sequences", () => {
    test("Update question text, followed by review response", async () => {
        const text1: string = `
#flashcards Q2::A2

#flashcards Q3::A3`;

        // Do the update step
        const updatedQ: string = "A much more in depth question::A much more detailed answer";
        const originalStr: string = "#flashcards Q2::A2";
        const updatedStr: string =
            "#flashcards A much more in depth question::A much more detailed answer";

        const c: TestContext = await checkUpdateCurrentQuestionText(
            text1,
            updatedQ,
            originalStr,
            updatedStr,
            DEFAULT_SETTINGS,
        );

        // Now do the review step
        await c.reviewSequencer.processReview(ReviewResponse.Hard);

        // Schedule for the reviewed card has been updated
        const expectedText: string = `
${updatedStr}

#flashcards Q3::A3`;

        expect(await c.file.read()).toEqual(expectedText);
    });
});

function checkQuestionPostponementListCount(c: TestContext, expectedListLength: number) {
    expect(c.questionPostponementList.list.length).toEqual(expectedListLength);
}

function skipAndCheckNoRemainingCards(c: TestContext) {
    c.reviewSequencer.skipCurrentCard();
    expect(c.reviewSequencer.hasCurrentCard).toEqual(false);
}

async function checkUpdateCurrentQuestionText(
    noteText: string,
    updatedQ: string,
    originalStr: string,
    updatedStr: string,
    settings: SRSettings,
): Promise<TestContext> {
    const c: TestContext = TestContext.Create(
        order_DueFirst_Sequential,
        FlashcardReviewMode.Review,
        settings,
        noteText,
    );
    await c.setSequencerDeckTreeFromOriginalText();
    expect(c.reviewSequencer.currentCard.front).toEqual("Q2");

    await c.reviewSequencer.updateCurrentQuestionText(updatedQ);

    // originalText should remain the same except for the specific substring change from originalStr => updatedStr
    if (!c.originalText.includes(originalStr)) throw `Text not found: ${originalStr}`;
    const expectedFileText: string = c.originalText.replace(
        originalStr,
        updatedStr.replace(/\s*<!--SR:[\s\S]*?-->/g, ""),
    );
    expect(await c.file.read()).toEqual(expectedFileText);
    return c;
}
