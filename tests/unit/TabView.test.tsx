const mockReactReviewAppInstances: Array<{
    args: unknown[];
    mount: jest.Mock;
    requestToggleReviewEditMode: jest.Mock;
    unmount: jest.Mock;
    remountSession: jest.Mock;
}> = [];
const mockScopeInstances: Array<{
    register: jest.Mock;
    registered: Array<{
        callback: (event: KeyboardEvent) => boolean;
        key: string;
        modifiers: string[];
        token: unknown;
    }>;
    unregister: jest.Mock;
}> = [];
const mockRunResolvedHybridEditorHotkeyCommand = jest.fn();
const mockResolveHybridEditorHotkeyRegistry = jest.fn();

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
            requestToggleReviewEditMode: jest.fn(() => true),
            unmount: jest.fn(),
            remountSession: jest.fn(),
        };
        mockReactReviewAppInstances.push(instance);
        return instance;
    }),
}));

jest.mock("src/editor/obsidianHotkeyBridge", () => ({
    resolveHybridEditorHotkeyRegistry: (...args: unknown[]) =>
        mockResolveHybridEditorHotkeyRegistry(...args),
    runResolvedHybridEditorHotkeyCommand: (...args: unknown[]) =>
        mockRunResolvedHybridEditorHotkeyCommand(...args),
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

    class Scope {
        public registered: Array<{
            callback: (event: KeyboardEvent) => boolean;
            key: string;
            modifiers: string[];
            token: unknown;
        }> = [];
        public register = jest.fn(
            (modifiers: string[], key: string, callback: (event: KeyboardEvent) => boolean) => {
                const token = { key, modifiers };
                this.registered.push({ callback, key, modifiers, token });
                return token;
            },
        );
        public unregister = jest.fn();

        constructor() {
            mockScopeInstances.push(this);
        }
    }

    class WorkspaceLeaf {}

    return {
        ItemView,
        Scope,
        WorkspaceLeaf,
    };
});

import { FlashcardReviewMode } from "src/FlashcardReviewSequencer";
import { TabView } from "src/ui/views/TabView";

describe("TabView", () => {
    beforeEach(() => {
        mockReactReviewAppInstances.length = 0;
        mockScopeInstances.length = 0;
        mockRunResolvedHybridEditorHotkeyCommand.mockReset();
        mockResolveHybridEditorHotkeyRegistry.mockReset();
        mockResolveHybridEditorHotkeyRegistry.mockReturnValue({
            invalidHotkeys: [],
            noHotkeyCommands: [],
            officialEditorCommands: [],
            supported: [
                {
                    action: "bold",
                    commandId: "editor:toggle-bold",
                    commandIds: ["editor:toggle-bold"],
                    hotkeys: [{ modifiers: ["Mod"], key: "B" }],
                    source: "default",
                    supported: true,
                },
            ],
            syroCommands: [],
            unsupported: [],
        });
        mockRunResolvedHybridEditorHotkeyCommand.mockReturnValue(true);
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

    it("does not register hybrid editor hotkeys into the Obsidian Scope", async () => {
        const sequencer = { id: "single-note" } as never;
        const loader = jest.fn(async () => ({
            reviewSequencer: sequencer,
            mode: FlashcardReviewMode.Review,
            initialView: "review" as const,
        }));
        const plugin = {
            app: { hotkeyManager: {}, workspace: {} },
            data: {
                settings: {
                    showRuntimeDebugMessages: true,
                },
            },
            savePluginData: jest.fn(async () => {}),
        };
        const view = new TabView(createLeaf() as never, plugin as never, loader);
        await view.onOpen();

        expect(mockScopeInstances).toHaveLength(0);
        expect(mockResolveHybridEditorHotkeyRegistry).not.toHaveBeenCalled();
        expect(mockRunResolvedHybridEditorHotkeyCommand).not.toHaveBeenCalled();
    });

    it("toggles review edit mode without registering hybrid hotkey scope handlers", async () => {
        const loader = jest.fn(async () => ({
            reviewSequencer: { id: "single-note" } as never,
            mode: FlashcardReviewMode.Review,
            initialView: "review" as const,
        }));
        const plugin = {
            app: { hotkeyManager: {}, workspace: {} },
            data: {
                settings: {
                    showRuntimeDebugMessages: true,
                },
            },
            savePluginData: jest.fn(async () => {}),
        };
        const view = new TabView(createLeaf() as never, plugin as never, loader);
        await view.onOpen();

        expect(view.requestToggleReviewEditMode()).toBe(true);

        expect(mockReactReviewAppInstances[0].requestToggleReviewEditMode).toHaveBeenCalledTimes(1);
        expect(mockScopeInstances).toHaveLength(0);
        expect(mockResolveHybridEditorHotkeyRegistry).not.toHaveBeenCalled();
        expect(mockRunResolvedHybridEditorHotkeyCommand).not.toHaveBeenCalled();
    });

});
