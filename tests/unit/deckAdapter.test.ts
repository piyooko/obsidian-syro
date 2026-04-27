import { Deck, DeckTreeFilter } from "src/Deck";
import type SRPlugin from "src/main";
import { buildDeckTreeUIState } from "src/ui/adapters/deckAdapter";

function createPlugin(
    statsByPath: Record<string, { newCount: number; dueCount: number }>,
    activeExtractDeckPaths: string[] = Object.keys(statsByPath),
) {
    return {
        data: {
            settings: {
                deckCollapseState: {},
                learnAheadMinutes: 0,
            },
        },
        getActiveExtractDeckPaths: jest.fn(() => activeExtractDeckPaths),
        getExtractReviewStats: jest.fn((path: string | null) => {
            const stats = statsByPath[path ?? ""] ?? { newCount: 0, dueCount: 0 };
            return {
                ...stats,
                totalCount: stats.newCount + stats.dueCount,
            };
        }),
    } as unknown as SRPlugin;
}

describe("buildDeckTreeUIState", () => {
    beforeEach(() => {
        jest.spyOn(DeckTreeFilter, "filterByDailyLimits").mockImplementation((deck) => deck);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("creates deck tree rows for extract-only paths", () => {
        const root = new Deck("root", null);
        const plugin = createPlugin({
            Main: { newCount: 2, dueCount: 1 },
            "Main/摘录测试": { newCount: 2, dueCount: 1 },
        });

        const state = buildDeckTreeUIState(root, plugin);

        expect(state).toHaveLength(1);
        expect(state[0]).toMatchObject({
            deckName: "Main",
            fullPath: "Main",
            newCount: 2,
            dueCount: 1,
            learningCount: 0,
        });
        expect(state[0].subdecks[0]).toMatchObject({
            deckName: "摘录测试",
            fullPath: "Main/摘录测试",
            newCount: 2,
            dueCount: 1,
            learningCount: 0,
        });
    });

    test("adds missing extract child under an existing card deck", () => {
        const root = new Deck("root", null);
        const main = new Deck("Main", root);
        root.subdecks.push(main);
        const plugin = createPlugin({
            Main: { newCount: 3, dueCount: 0 },
            "Main/摘录测试": { newCount: 3, dueCount: 0 },
        });

        const state = buildDeckTreeUIState(root, plugin);

        expect(state).toHaveLength(1);
        expect(state[0].deckName).toBe("Main");
        expect(state[0].subdecks).toEqual([
            expect.objectContaining({
                deckName: "摘录测试",
                fullPath: "Main/摘录测试",
                newCount: 3,
            }),
        ]);
    });

    test("keeps extract-only rows when active extracts are not currently reviewable", () => {
        const root = new Deck("root", null);
        const plugin = createPlugin(
            {
                Main: { newCount: 0, dueCount: 0 },
                "Main/摘录测试": { newCount: 0, dueCount: 0 },
            },
            ["Main/摘录测试"],
        );

        const state = buildDeckTreeUIState(root, plugin);

        expect(state).toEqual([
            expect.objectContaining({
                deckName: "Main",
                fullPath: "Main",
                newCount: 0,
                dueCount: 0,
                subdecks: [
                    expect.objectContaining({
                        deckName: "摘录测试",
                        fullPath: "Main/摘录测试",
                        newCount: 0,
                        dueCount: 0,
                    }),
                ],
            }),
        ]);
    });
});
