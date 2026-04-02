const mockReactReviewAppInstances: Array<{
    args: unknown[];
    mount: jest.Mock;
    unmount: jest.Mock;
    remountSession: jest.Mock;
}> = [];

jest.mock("src/FlashcardReviewSequencer", () => ({
    FlashcardReviewMode: {
        Review: 0,
        Cram: 1,
    },
}));

jest.mock("src/ui/ReactReviewApp", () => ({
    ReactReviewApp: jest.fn().mockImplementation(function (...args: unknown[]) {
        const instance = {
            args,
            mount: jest.fn(),
            unmount: jest.fn(),
            remountSession: jest.fn(),
        };
        mockReactReviewAppInstances.push(instance);
        return instance;
    }),
}));

jest.mock("obsidian", () => {
    class ItemView {
        public leaf: unknown;
        public app: unknown;
        public containerEl: HTMLElement;

        constructor(leaf: { app: unknown }) {
            this.leaf = leaf;
            this.app = leaf.app;

            const containerEl = document.createElement("div");
            const viewContent = document.createElement("div") as HTMLDivElement & {
                addClass: (cls: string) => void;
                createDiv: (cls: string) => HTMLDivElement & { addClass: (name: string) => void };
            };
            viewContent.className = "view-content";
            viewContent.addClass = function (cls: string) {
                this.classList.add(cls);
            };
            viewContent.createDiv = function (cls: string) {
                const div = document.createElement("div") as HTMLDivElement & {
                    addClass: (name: string) => void;
                };
                div.className = cls;
                div.addClass = function (name: string) {
                    this.classList.add(name);
                };
                return div;
            };
            containerEl.appendChild(viewContent);
            this.containerEl = containerEl;
        }
    }

    class WorkspaceLeaf {}

    return {
        ItemView,
        WorkspaceLeaf,
    };
});

import { FlashcardReviewMode } from "src/FlashcardReviewSequencer";
import { TabView } from "src/ui/views/TabView";

describe("TabView", () => {
    beforeEach(() => {
        mockReactReviewAppInstances.length = 0;
    });

    function createLeaf() {
        return {
            app: {
                workspace: {},
            },
        };
    }

    it("mounts the first loaded session with the requested initial view", async () => {
        const sequencer = { id: "single-note" } as never;
        const loader = jest.fn(async () => ({
            reviewSequencer: sequencer,
            mode: FlashcardReviewMode.Review,
            initialView: "review" as const,
            initialTargetDeckPath: "folder/note",
        }));
        const plugin = {
            data: {
                settings: {},
            },
            savePluginData: jest.fn(async () => {}),
        };

        const view = new TabView(createLeaf() as never, plugin as never, loader);
        await view.onOpen();

        expect(loader).toHaveBeenCalledTimes(1);
        expect(mockReactReviewAppInstances).toHaveLength(1);
        expect(mockReactReviewAppInstances[0].args[3]).toBe(FlashcardReviewMode.Review);
        expect(mockReactReviewAppInstances[0].args[8]).toBe("review");
        expect(mockReactReviewAppInstances[0].args[9]).toBe("folder/note");
        expect(mockReactReviewAppInstances[0].mount).toHaveBeenCalledTimes(1);
    });

    it("remounts an existing React review app when the session changes", async () => {
        const firstSequencer = { id: "global" } as never;
        const secondSequencer = { id: "note" } as never;
        const loader = jest
            .fn()
            .mockResolvedValueOnce({
                reviewSequencer: firstSequencer,
                mode: FlashcardReviewMode.Review,
                initialView: "deck-list" as const,
            })
            .mockResolvedValueOnce({
                reviewSequencer: secondSequencer,
                mode: FlashcardReviewMode.Review,
                initialView: "review" as const,
                initialTargetDeckPath: "folder/note",
            });
        const plugin = {
            data: {
                settings: {},
            },
            savePluginData: jest.fn(async () => {}),
        };

        const view = new TabView(createLeaf() as never, plugin as never, loader);
        await view.onOpen();
        await view.reloadSession();

        expect(mockReactReviewAppInstances).toHaveLength(1);
        expect(mockReactReviewAppInstances[0].remountSession).toHaveBeenCalledWith(
            secondSequencer,
            FlashcardReviewMode.Review,
            "review",
            "folder/note",
        );
    });
});
