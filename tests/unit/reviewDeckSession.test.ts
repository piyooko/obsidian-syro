import { Deck, DeckTreeFilter } from "src/Deck";
import type SRPlugin from "src/main";
import { activateDeckReviewSession } from "src/ui/reviewDeckSession";

describe("activateDeckReviewSession", () => {
    beforeEach(() => {
        jest.spyOn(DeckTreeFilter, "filterByDailyLimits").mockImplementation((deck) => deck);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("activates an extract-only deck path that is missing from the card deck tree", () => {
        const sourceDeckTree = new Deck("root", null);
        const fullDeckTree = new Deck("root", null);
        const plugin = {
            remainingDeckTree: sourceDeckTree,
            deckTree: fullDeckTree,
            getExtractReviewStats: jest.fn(() => ({
                newCount: 1,
                dueCount: 0,
                totalCount: 1,
            })),
        } as unknown as SRPlugin;
        const sequencer = {
            setDeckTree: jest.fn(),
            setCurrentDeck: jest.fn(),
        };

        const result = activateDeckReviewSession({
            plugin,
            sequencer: sequencer as never,
            fullPath: "Main/摘录测试",
            sourceDeckTree,
            fullDeckTree,
            applyDailyLimits: true,
        });

        expect(result?.fullPath).toBe("Main/摘录测试");
        expect(result?.isolatedContextDeck.deckName).toBe("摘录测试");
        expect(sequencer.setDeckTree).toHaveBeenCalled();
        expect(sequencer.setCurrentDeck).toHaveBeenCalled();
    });
});
