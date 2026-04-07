import type React from "react";
import {
    REACT_REVIEW_QUEUE_VIEW_TYPE,
    ReactNoteReviewView,
} from "src/ui/views/ReactNoteReviewView";
import { reviewDecksToSidebarState } from "src/ui/adapters/noteReviewAdapter";
import { MarkdownView } from "obsidian";

jest.mock("src/ui/components/NoteReviewSidebar", () => ({
    MOBILE_TIMELINE_MIN_HEIGHT_PX: 64,
    NoteReviewSidebar: jest.fn(() => null),
}));

jest.mock("src/ui/adapters/noteReviewAdapter", () => ({
    reviewDecksToSidebarState: jest.fn(() => ({
        sections: [],
        totalCount: 0,
    })),
}));

jest.mock("src/lang/helpers", () => ({
    t: (key: string) => key,
}));

jest.mock("src/dataStore/reviewCommitStore", () => ({
    ReviewCommitStore: class ReviewCommitStore {},
}));

jest.mock("src/util/ContextAnchor", () => ({
    ContextAnchorService: class ContextAnchorService {},
}));

jest.mock("src/services/LicenseManager", () => ({
    LicenseManager: {
        getInstance: jest.fn(() => ({
            checkFeatureAccess: jest.fn(async () => true),
        })),
    },
}));

jest.mock("src/ui/timeline/timelineContext", () => ({
    captureTimelineContext: jest.fn(async () => ({
        contextAnchor: null,
        scrollPercentage: 0,
    })),
}));

jest.mock("obsidian", () => {
    class ItemView {
        leaf: any;
        app: any;
        containerEl: HTMLElement;

        constructor(leaf: any) {
            this.leaf = leaf;
            this.app = leaf.app;
            this.containerEl = document.createElement("div");
            this.containerEl.appendChild(document.createElement("div"));
            this.containerEl.appendChild(document.createElement("div"));
        }

        registerEvent(): void {}

        registerDomEvent(): void {}
    }

    class Menu {
        addItem(): Menu {
            return this;
        }

        showAtMouseEvent(): void {}
    }

    class Notice {}

    class Scope {
        unregister(): void {}
    }

    class TFile {}

    class MarkdownView {}

    return {
        ItemView,
        Menu,
        Notice,
        Scope,
        TFile,
        MarkdownView,
    };
});

type RenderRoot = {
    render: jest.Mock;
};

function createMarkdownLeaf(path?: string, visible = true) {
    const view = Object.create(MarkdownView.prototype) as MarkdownView & {
        file?: { path: string } | null;
        containerEl?: HTMLElement;
    };
    const containerEl = document.createElement("div");
    if (visible) {
        containerEl.style.width = "240px";
        containerEl.style.height = "240px";
        Object.defineProperty(containerEl, "offsetWidth", { configurable: true, value: 240 });
        Object.defineProperty(containerEl, "offsetHeight", { configurable: true, value: 240 });
        containerEl.getClientRects = () => [{ width: 240, height: 240 }] as any;
    }
    document.body.appendChild(containerEl);
    view.file = (path ? { path } : null) as any;
    view.containerEl = containerEl;

    return {
        view,
        containerEl,
    };
}

function resetPhoneDrawerTimelineSession(): void {
    const testingViewClass = ReactNoteReviewView as any;
    testingViewClass.hasInitializedPhoneDrawerTimelineHeightThisSession = false;
    testingViewClass.phoneDrawerTimelineHeightThisSession = null;
}

function createView(options: {
    savedTimelineHeight?: number;
    savedTimelineOpen?: boolean;
    savedSelectedPath?: string | null;
    mountInMobileDrawer?: boolean;
    mobile?: boolean;
    tablet?: boolean;
    autoExpandTimeline?: boolean;
    activeMarkdownPath?: string | null;
    markdownLeaves?: Array<{ view: MarkdownView }>;
    mostRecentLeaf?: { view: MarkdownView } | null;
}) {
    if (options.mobile) {
        document.body.classList.add("is-mobile");
    }

    if (options.tablet) {
        document.body.classList.add("is-tablet");
    }

    const leafContainer = document.createElement("div");
    leafContainer.className = "workspace-leaf mod-active";

    if (options.mountInMobileDrawer) {
        const drawerInner = document.createElement("div");
        drawerInner.className = "workspace-drawer-inner";
        const activeTabContent = document.createElement("div");
        activeTabContent.className = "workspace-drawer-active-tab-content";
        activeTabContent.appendChild(leafContainer);
        drawerInner.appendChild(activeTabContent);
        document.body.appendChild(drawerInner);
    } else {
        document.body.appendChild(leafContainer);
    }

    const app = {
        workspace: {
            on: jest.fn(),
            getActiveFile: jest.fn(() =>
                options.activeMarkdownPath ? { path: options.activeMarkdownPath } : null,
            ),
            getActiveViewOfType: jest.fn((viewType: unknown) => {
                if (viewType !== MarkdownView || !options.activeMarkdownPath) {
                    return null;
                }

                return createMarkdownLeaf(options.activeMarkdownPath).view;
            }),
            getLeavesOfType: jest.fn((type: string) =>
                type === "markdown" ? (options.markdownLeaves ?? []) : [],
            ),
            getMostRecentLeaf: jest.fn(() => options.mostRecentLeaf ?? null),
            activeLeaf: null as unknown,
        },
        vault: {
            on: jest.fn(),
        },
    };

    const leaf = {
        app,
        containerEl: leafContainer,
        view: {
            getViewType: () => REACT_REVIEW_QUEUE_VIEW_TYPE,
        },
    };
    app.workspace.activeLeaf = leaf;

    const plugin = {
        data: {
            settings: {
                sidebarTimelineHeight: options.savedTimelineHeight,
                sidebarTimelineOpen: options.savedTimelineOpen ?? false,
                sidebarTimelineSelectedPath: options.savedSelectedPath ?? null,
                sidebarIgnoredTags: [] as string[],
                sidebarTagSortMode: "frequency",
                sidebarCustomTagOrder: [] as string[],
                sidebarFilterBarHeight: 80,
                hideNoteReviewSidebarFilters: false,
                showScrollPercentage: true,
                autoExpandTimeline: options.autoExpandTimeline ?? true,
                timelineEnableDurationPrefixSyntax: false,
                showSidebarProgressIndicator: true,
                sidebarFilePathTooltipEnabled: true,
                sidebarFilePathTooltipDelayMs: 1000,
            },
        },
        savePluginData: jest.fn(async () => {}),
    };

    const view = new ReactNoteReviewView(leaf as never, plugin as never);
    leaf.view = view;

    const root: RenderRoot = {
        render: jest.fn(),
    };
    (view as any).root = root;

    return {
        app,
        plugin,
        root,
        view,
        leafContainer,
    };
}

function getLastSidebarProps(root: RenderRoot): Record<string, unknown> {
    const lastCall = root.render.mock.calls.at(-1);
    if (!lastCall) {
        throw new Error("Expected sidebar render call");
    }

    const element = lastCall[0] as React.ReactElement;
    return element.props as Record<string, unknown>;
}

describe("ReactNoteReviewView", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        document.body.className = "";
        document.documentElement.className = "";
        resetPhoneDrawerTimelineSession();
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [],
            totalCount: 0,
        });
    });

    it("starts phone-sized mobile drawers at the minimum timeline height and keeps it across redraws", () => {
        const { root, view } = createView({
            savedTimelineHeight: 300,
            mountInMobileDrawer: true,
            mobile: true,
        });

        view.redraw();
        expect(getLastSidebarProps(root).timelineHeight).toBe(64);

        root.render.mockClear();
        view.redraw();
        expect(getLastSidebarProps(root).timelineHeight).toBe(64);
    });

    it("keeps the updated timeline height for the rest of the phone drawer session after a resize", () => {
        const { plugin, root, view } = createView({
            savedTimelineHeight: 300,
            mountInMobileDrawer: true,
            mobile: true,
        });

        view.redraw();
        (view as any).handleTimelineHeightChange(120);

        root.render.mockClear();
        view.redraw();

        expect(getLastSidebarProps(root).timelineHeight).toBe(120);
        expect(plugin.data.settings.sidebarTimelineHeight).toBe(120);
        expect(plugin.savePluginData).toHaveBeenCalled();
    });

    it("keeps the saved timeline height on desktop and tablet drawers", () => {
        const desktopView = createView({
            savedTimelineHeight: 280,
        });

        desktopView.view.redraw();
        expect(getLastSidebarProps(desktopView.root).timelineHeight).toBe(280);

        resetPhoneDrawerTimelineSession();

        const tabletDrawerView = createView({
            savedTimelineHeight: 280,
            mountInMobileDrawer: true,
            mobile: true,
            tablet: true,
        });

        tabletDrawerView.view.redraw();
        expect(getLastSidebarProps(tabletDrawerView.root).timelineHeight).toBe(280);
    });

    it("restores the saved desktop timeline selection and expanded state", () => {
        const item = { id: "note-1", path: "notes/persisted.md", title: "Persisted Note" };
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [{ id: "new", items: [item] }],
            totalCount: 1,
        } as any);
        const { root, view } = createView({
            savedTimelineOpen: true,
            savedSelectedPath: item.path,
            autoExpandTimeline: false,
        });

        view.redraw();

        const props = getLastSidebarProps(root);
        expect(props.selectedItem).toEqual(item);
        expect(props.isTimelineOpen).toBe(true);
    });

    it("auto-follows the current markdown note on file open when enabled", () => {
        const item = { id: "note-1", path: "notes/focused.md", title: "Focused Note" };
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [{ id: "new", items: [item] }],
            totalCount: 1,
        } as any);
        const { plugin, root, view } = createView({
            activeMarkdownPath: item.path,
            autoExpandTimeline: true,
        });

        (view as any).handleFileOpen();

        const props = getLastSidebarProps(root);
        expect(props.activeFilePath).toBe(item.path);
        expect(props.selectedItem).toEqual(item);
        expect(props.isTimelineOpen).toBe(true);
        expect(props.autoRevealTargetPath).toBe(item.path);
        expect(props.autoRevealRequestKey).toBe(1);
        expect(plugin.data.settings.sidebarTimelineSelectedPath).toBe(item.path);
        expect(plugin.data.settings.sidebarTimelineOpen).toBe(true);
    });

    it("does not auto-follow on active leaf changes alone", () => {
        const item = { id: "note-1", path: "notes/visible.md", title: "Visible Note" };
        const { view } = createMarkdownLeaf(item.path);
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [{ id: "new", items: [item] }],
            totalCount: 1,
        } as any);
        const { app, root, view: reviewView } = createView({
            activeMarkdownPath: "notes/original.md",
            autoExpandTimeline: true,
        });
        root.render.mockClear();
        const activeLeafChangeHandler = app.workspace.on.mock.calls.find(
            ([eventName]: [string]) => eventName === "active-leaf-change",
        )?.[1];

        if (typeof activeLeafChangeHandler !== "function") {
            throw new Error("Expected active-leaf-change handler");
        }

        activeLeafChangeHandler({ view } as any);

        expect(root.render).not.toHaveBeenCalled();

        reviewView.redraw();
        const props = getLastSidebarProps(root);
        expect(props.activeFilePath).toBe("notes/original.md");
        expect(props.selectedItem).toBeNull();
        expect(props.autoRevealRequestKey).toBe(0);
    });

    it("does not auto-follow just because the sidebar drawer becomes foreground", () => {
        const item = { id: "note-1", path: "notes/visible.md", title: "Visible Note" };
        const visibleLeaf = createMarkdownLeaf(item.path).view;
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [{ id: "new", items: [item] }],
            totalCount: 1,
        } as any);
        const { root, view, leafContainer } = createView({
            mountInMobileDrawer: true,
            activeMarkdownPath: null,
            markdownLeaves: [{ view: visibleLeaf }],
            mostRecentLeaf: null,
            autoExpandTimeline: true,
        });

        leafContainer.classList.remove("mod-active");
        view.redraw();
        expect(getLastSidebarProps(root).selectedItem).toBeNull();

        root.render.mockClear();
        leafContainer.classList.add("mod-active");
        view.redraw();

        const props = getLastSidebarProps(root);
        expect(props.activeFilePath).toBe(item.path);
        expect(props.selectedItem).toBeNull();
        expect(props.isTimelineOpen).toBe(true);
        expect(props.autoRevealRequestKey).toBe(0);
    });

    it("does not auto-follow when the setting is disabled", () => {
        const oldItem = { id: "note-1", path: "notes/original.md", title: "Original" };
        const newItem = { id: "note-2", path: "notes/new.md", title: "New" };
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [{ id: "new", items: [oldItem, newItem] }],
            totalCount: 2,
        } as any);
        const { root, view } = createView({
            activeMarkdownPath: newItem.path,
            autoExpandTimeline: false,
        });
        (view as any).selectedItem = oldItem;
        (view as any).isTimelineOpen = false;

        (view as any).handleFileOpen();

        const props = getLastSidebarProps(root);
        expect(props.activeFilePath).toBe(newItem.path);
        expect(props.selectedItem).toEqual(oldItem);
        expect(props.isTimelineOpen).toBe(false);
        expect(props.autoRevealRequestKey).toBe(0);
    });

    it("keeps the current selection when the active note is not in the queue", () => {
        const oldItem = { id: "note-1", path: "notes/original.md", title: "Original" };
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [{ id: "new", items: [oldItem] }],
            totalCount: 1,
        } as any);
        const { root, view } = createView({
            activeMarkdownPath: "notes/missing.md",
            autoExpandTimeline: true,
        });
        (view as any).selectedItem = oldItem;
        (view as any).isTimelineOpen = true;

        (view as any).handleFileOpen();

        const props = getLastSidebarProps(root);
        expect(props.activeFilePath).toBe("notes/missing.md");
        expect(props.selectedItem).toEqual(oldItem);
        expect(props.isTimelineOpen).toBe(true);
        expect(props.autoRevealRequestKey).toBe(0);
    });

    it("persists the selected note path and desktop timeline toggle state", () => {
        const item = { id: "note-1", path: "notes/selected.md", title: "Selected Note" };
        const { plugin, view } = createView({
            autoExpandTimeline: true,
        });

        (view as any).handleNoteSelect(item);

        expect(plugin.data.settings.sidebarTimelineSelectedPath).toBe(item.path);
        expect(plugin.data.settings.sidebarTimelineOpen).toBe(true);

        (view as any).handleTimelineToggle();

        expect(plugin.data.settings.sidebarTimelineOpen).toBe(false);
        expect(plugin.savePluginData).toHaveBeenCalled();
    });
});
