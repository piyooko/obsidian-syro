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

import { FlashcardReviewMode } from "src/FlashcardReviewSequencer";
import TabViewManager from "src/ui/views/TabViewManager";

describe("TabViewManager", () => {
    beforeEach(() => {
        mockTabViewLoaders.length = 0;
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
        expect(existingLeaf.view.reloadSession).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: FlashcardReviewMode.Review,
                initialView: "deck-list",
                initialTargetDeckPath: "folder/note",
            }),
        );
        expect(existingLeaf.setViewState).not.toHaveBeenCalled();
        expect(plugin.app.workspace.revealLeaf).toHaveBeenCalledWith(existingLeaf);
    });

    it("prepares a standard global session and only passes the target deck intent", async () => {
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
        expect(result.initialView).toBe("deck-list");
        expect(result.initialTargetDeckPath).toBe("folder/note");
        expect(result.mode).toBe(FlashcardReviewMode.Review);
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
