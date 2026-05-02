const mockTabViewLoaders: Array<() => Promise<unknown>> = [];

jest.mock("src/FlashcardReviewSequencer", () => ({
    FlashcardReviewMode: {
        Review: 0,
        Cram: 1,
    },
}));

jest.mock("src/ui/views/TabView", () => {
    class TabView {
        public reloadSession = jest.fn(async () => {});

        constructor(
            _leaf: unknown,
            _plugin: unknown,
            loadReviewSequencerData: () => Promise<unknown>,
        ) {
            mockTabViewLoaders.push(loadReviewSequencerData);
        }
    }

    return {
        TabView,
    };
});

const mockActivateDeckReviewSession = jest.fn();

jest.mock("src/ui/reviewDeckSession", () => ({
    activateDeckReviewSession: (...args: unknown[]) => mockActivateDeckReviewSession(...args),
}));

import { FlashcardReviewMode } from "src/FlashcardReviewSequencer";
import TabViewManager from "src/ui/views/TabViewManager";

describe("TabViewManager", () => {
    beforeEach(() => {
        mockTabViewLoaders.length = 0;
        mockActivateDeckReviewSession.mockReset();
        mockActivateDeckReviewSession.mockReturnValue({
            isolatedContextDeck: { name: "targeted" },
            fullPath: "folder/note",
        });
    });

    function createPlugin() {
        const freshLeaf = {
            view: {},
            setViewState: jest.fn(async () => {}),
        };
        const workspace = {
            getLeavesOfType: jest.fn(() => []),
            revealLeaf: jest.fn(),
            getLeaf: jest.fn(() => freshLeaf),
        };

        return {
            app: {
                workspace,
            },
            data: {
                settings: {
                    showRuntimeDebugMessages: false,
                },
            },
            registerView: jest.fn(),
            getPreparedReviewSequencer: jest.fn((deckTree, remainingDeckTree, mode) => {
                const reviewSequencer = {
                    deckTree,
                    remainingDeckTree,
                    mode,
                    hasCurrentCard: true,
                };
                return {
                    reviewSequencer,
                    mode,
                };
            }),
            deckTree: { name: "global-full" },
            remainingDeckTree: { name: "global-remaining" },
        };
    }

    it("reloads an existing SR tab instead of only revealing it", async () => {
        const plugin = createPlugin();
        const existingLeaf = {
            view: {
                reloadSession: jest.fn(async () => {}),
            },
            setViewState: jest.fn(async () => {}),
        };
        plugin.app.workspace.getLeavesOfType.mockReturnValue([existingLeaf]);

        const manager = new TabViewManager(plugin as never);

        await manager.openSRTabView(FlashcardReviewMode.Review, {
            targetDeckPath: "folder/note",
        });

        expect(existingLeaf.view.reloadSession).toHaveBeenCalledTimes(1);
        const reloadedSession = (existingLeaf.view.reloadSession as jest.Mock).mock
            .calls[0]?.[0] as
            | {
                  initialTargetDeckPath?: string;
              }
            | undefined;
        expect(existingLeaf.view.reloadSession).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: FlashcardReviewMode.Review,
                initialView: "review",
            }),
        );
        expect(reloadedSession?.initialTargetDeckPath).toBe("folder/note");
        expect(existingLeaf.setViewState).not.toHaveBeenCalled();
        expect(plugin.app.workspace.revealLeaf).toHaveBeenCalledWith(existingLeaf);
        expect(mockActivateDeckReviewSession).toHaveBeenCalledWith(
            expect.objectContaining({
                plugin,
                sequencer: expect.objectContaining({
                    deckTree: plugin.deckTree,
                    remainingDeckTree: plugin.remainingDeckTree,
                    mode: FlashcardReviewMode.Review,
                }),
                fullPath: "folder/note",
                sourceDeckTree: plugin.remainingDeckTree,
                fullDeckTree: plugin.deckTree,
                globalRemainingDeckTree: plugin.remainingDeckTree,
                applyDailyLimits: true,
            }),
        );
    });

    it("prepares the target deck session before opening the review tab", async () => {
        const plugin = createPlugin();
        const manager = new TabViewManager(plugin as never);
        const viewCreator = plugin.registerView.mock.calls[0][1];

        viewCreator({});
        const loader = mockTabViewLoaders[0];

        await manager.openSRTabView(FlashcardReviewMode.Review, {
            targetDeckPath: "folder/note",
        });
        const result = (await loader()) as {
            initialView: string;
            initialTargetDeckPath?: string;
            mode: FlashcardReviewMode;
        };

        expect(plugin.getPreparedReviewSequencer).toHaveBeenCalledWith(
            plugin.deckTree,
            plugin.remainingDeckTree,
            FlashcardReviewMode.Review,
        );
        expect(mockActivateDeckReviewSession).toHaveBeenCalledWith(
            expect.objectContaining({
                plugin,
                fullPath: "folder/note",
                sourceDeckTree: plugin.remainingDeckTree,
                fullDeckTree: plugin.deckTree,
                globalRemainingDeckTree: plugin.remainingDeckTree,
                applyDailyLimits: true,
            }),
        );
        expect(result.initialView).toBe("review");
        expect(result.initialTargetDeckPath).toBe("folder/note");
        expect(result.mode).toBe(FlashcardReviewMode.Review);
    });

    it("keeps the target deck path after activation so extract-only sessions stay scoped", async () => {
        const plugin = createPlugin();
        const manager = new TabViewManager(plugin as never);
        const viewCreator = plugin.registerView.mock.calls[0][1];

        viewCreator({});
        const loader = mockTabViewLoaders[0];

        await manager.openSRTabView(FlashcardReviewMode.Review, {
            targetDeckPath: "摘录测试",
        });
        const result = (await loader()) as {
            initialView: string;
            initialTargetDeckPath?: string;
            mode: FlashcardReviewMode;
        };

        expect(result.initialView).toBe("review");
        expect(result.initialTargetDeckPath).toBe("摘录测试");
    });

    it("keeps global cram sessions on the deck list and omits a target deck", async () => {
        const plugin = createPlugin();
        const manager = new TabViewManager(plugin as never);
        const viewCreator = plugin.registerView.mock.calls[0][1];

        viewCreator({});
        const loader = mockTabViewLoaders[0];

        await manager.openSRTabView(FlashcardReviewMode.Cram);
        const result = (await loader()) as {
            initialView: string;
            initialTargetDeckPath?: string;
            mode: FlashcardReviewMode;
        };

        expect(plugin.getPreparedReviewSequencer).toHaveBeenCalledWith(
            plugin.deckTree,
            plugin.deckTree,
            FlashcardReviewMode.Cram,
        );
        expect(result.initialView).toBe("deck-list");
        expect(result.initialTargetDeckPath).toBeUndefined();
        expect(result.mode).toBe(FlashcardReviewMode.Cram);
    });
});
