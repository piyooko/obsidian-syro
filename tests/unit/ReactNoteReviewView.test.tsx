import type React from "react";
import {
    REACT_REVIEW_QUEUE_VIEW_TYPE,
    ReactNoteReviewView,
} from "src/ui/views/ReactNoteReviewView";

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

function resetPhoneDrawerTimelineSession(): void {
    const testingViewClass = ReactNoteReviewView as any;
    testingViewClass.hasInitializedPhoneDrawerTimelineHeightThisSession = false;
    testingViewClass.phoneDrawerTimelineHeightThisSession = null;
}

function createView(options: {
    savedTimelineHeight?: number;
    mountInMobileDrawer?: boolean;
    mobile?: boolean;
    tablet?: boolean;
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
            getActiveFile: jest.fn(() => null),
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
                sidebarIgnoredTags: [] as string[],
                sidebarTagSortMode: "frequency",
                sidebarCustomTagOrder: [] as string[],
                sidebarFilterBarHeight: 80,
                hideNoteReviewSidebarFilters: false,
                showScrollPercentage: true,
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
});
