import type React from "react";
import {
    REACT_REVIEW_QUEUE_VIEW_TYPE,
    ReactNoteReviewView,
} from "src/ui/views/ReactNoteReviewView";
import { reviewDecksToSidebarState } from "src/ui/adapters/noteReviewAdapter";
import { DEFAULT_DECKNAME } from "src/constants";
import { MarkdownView, TFile } from "obsidian";

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
    captureTimelineContext: jest.fn(() => ({
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
        getAllTags: jest.fn(
            (fileCache: { tags?: Array<{ tag: string }> } | null | undefined) =>
                fileCache?.tags?.map((item) => item.tag) ?? [],
        ),
    };
});

type RenderRoot = {
    render: jest.Mock;
};

function createTFile(path: string) {
    const basename = path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
    return Object.assign(Object.create(TFile.prototype), {
        path,
        basename,
        extension: "md",
    });
}

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
    timelineAllowUntrackedNotes?: boolean;
    timelineAutoFollowReviewCards?: boolean;
    activeMarkdownPath?: string | null;
    markdownLeaves?: Array<{ view: MarkdownView }>;
    mostRecentLeaf?: { view: MarkdownView } | null;
    availableFiles?: string[];
    fileCacheByPath?: Record<string, unknown>;
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

    const fileMap = new Map<string, TFile>();
    const availableFiles = new Set<string>(options.availableFiles ?? []);
    if (options.activeMarkdownPath) {
        availableFiles.add(options.activeMarkdownPath);
    }
    if (options.savedSelectedPath) {
        availableFiles.add(options.savedSelectedPath);
    }
    for (const path of availableFiles) {
        fileMap.set(path, createTFile(path));
    }

    const app = {
        metadataCache: {
            getFileCache: jest.fn((file: { path?: string } | null | undefined) => {
                const path = file?.path;
                return path ? (options.fileCacheByPath?.[path] ?? {}) : {};
            }),
        },
        workspace: {
            on: jest.fn(),
            setActiveLeaf: jest.fn(),
            revealLeaf: jest.fn(),
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
            getAbstractFileByPath: jest.fn((path: string) => fileMap.get(path) ?? null),
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
                timelineAllowUntrackedNotes: options.timelineAllowUntrackedNotes ?? false,
                timelineAutoFollowReviewCards: options.timelineAutoFollowReviewCards ?? false,
                timelineEnableDurationPrefixSyntax: false,
                showSidebarProgressIndicator: true,
                sidebarFilePathTooltipEnabled: true,
                sidebarFilePathTooltipDelayMs: 1000,
                tagsToReview: ["#review"],
                noteFoldersToIgnore: [] as string[],
                tagsToIgnore: [] as string[],
            },
        },
        savePluginData: jest.fn(async () => {}),
        noteReviewStore: {
            getItem: jest.fn(() => null),
            ensureTracked: jest.fn(),
            save: jest.fn(async () => {}),
            buildReviewDecks: jest.fn(() => ({})),
        },
        getNoteReviewIgnoreReason: jest.fn(() => null),
        showNoteReviewIgnoreNotice: jest.fn(),
        clearFolderTrackingExclusion: jest.fn(),
        getTimelineReviewCardPath: jest.fn(() => null),
        setTimelineReviewCardPath: jest.fn(),
        noteAlgorithm: {},
        reviewDecks: {},
        updateAndSortDueNotes: jest.fn(),
        syncEvents: {
            emit: jest.fn(),
            on: jest.fn(() => () => {}),
        },
        reviewFloatBar: {
            display: jest.fn(),
        },
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
        fileMap,
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

    it("restores a saved standalone timeline selection when the path is not in the queue", () => {
        const path = "notes/Standalone Note.md";
        const { root, view } = createView({
            savedTimelineOpen: true,
            savedSelectedPath: path,
            autoExpandTimeline: false,
            timelineAllowUntrackedNotes: true,
            availableFiles: [path],
        });

        view.redraw();

        expect(getLastSidebarProps(root).selectedItem).toMatchObject({
            path,
            title: "Standalone Note",
        });
    });

    it("uses only file property tags for standalone timeline items", () => {
        const path = "notes/Standalone Tags.md";
        const { root, view } = createView({
            savedTimelineOpen: true,
            savedSelectedPath: path,
            autoExpandTimeline: false,
            timelineAllowUntrackedNotes: true,
            availableFiles: [path],
            fileCacheByPath: {
                [path]: {
                    frontmatter: {
                        tags: ["project", "#project/alpha", "project"],
                    },
                    tags: [{ tag: "#inline-only" }],
                },
            },
        });

        view.redraw();

        expect(getLastSidebarProps(root).selectedItem).toMatchObject({
            path,
            tags: ["project", "project/alpha"],
        });
    });

    it("does not restore a saved standalone timeline selection when experimental support is disabled", () => {
        const path = "notes/Standalone Note.md";
        const { root, view } = createView({
            savedTimelineOpen: true,
            savedSelectedPath: path,
            autoExpandTimeline: false,
            timelineAllowUntrackedNotes: false,
            availableFiles: [path],
        });

        view.redraw();

        expect(getLastSidebarProps(root).selectedItem).toBeNull();
    });

    it("auto-follows the current markdown note on file open when the active leaf is that markdown tab", () => {
        const item = { id: "note-1", path: "notes/focused.md", title: "Focused Note" };
        const { view: markdownView } = createMarkdownLeaf(item.path);
        const markdownLeaf = { view: markdownView } as any;
        (markdownView as any).leaf = markdownLeaf;
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [{ id: "new", items: [item] }],
            totalCount: 1,
        } as any);
        const { app, plugin, root } = createView({
            activeMarkdownPath: item.path,
            autoExpandTimeline: true,
        });
        app.workspace.getActiveViewOfType.mockReturnValue(markdownView);
        const fileOpenHandler = app.workspace.on.mock.calls.find(
            ([eventName]: [string]) => eventName === "file-open",
        )?.[1];

        if (typeof fileOpenHandler !== "function") {
            throw new Error("Expected file-open handler");
        }

        fileOpenHandler({ path: item.path });

        const props = getLastSidebarProps(root);
        expect(props.activeFilePath).toBe(item.path);
        expect(props.selectedItem).toEqual(item);
        expect(props.isTimelineOpen).toBe(true);
        expect(props.autoRevealTargetPath).toBe(item.path);
        expect(props.autoRevealRequestKey).toBe(1);
        expect(plugin.data.settings.sidebarTimelineSelectedPath).toBe(item.path);
        expect(plugin.data.settings.sidebarTimelineOpen).toBe(true);
    });

    it("auto-follows the current markdown note into a standalone timeline item when it is not in the queue", () => {
        const path = "notes/Standalone Focus.md";
        const file = createTFile(path);
        const { view: markdownView } = createMarkdownLeaf(path);
        const markdownLeaf = { view: markdownView } as any;
        (markdownView as any).leaf = markdownLeaf;
        const { app, plugin, root } = createView({
            activeMarkdownPath: path,
            autoExpandTimeline: true,
            timelineAllowUntrackedNotes: true,
            availableFiles: [path],
        });
        app.workspace.getActiveViewOfType.mockReturnValue(markdownView);
        const fileOpenHandler = app.workspace.on.mock.calls.find(
            ([eventName]: [string]) => eventName === "file-open",
        )?.[1];

        if (typeof fileOpenHandler !== "function") {
            throw new Error("Expected file-open handler");
        }

        fileOpenHandler(file);

        const props = getLastSidebarProps(root);
        expect(props.activeFilePath).toBe(path);
        expect(props.selectedItem).toMatchObject({
            path,
            title: "Standalone Focus",
            noteFile: file,
        });
        expect(props.isTimelineOpen).toBe(true);
        expect(props.autoRevealTargetPath).toBe(path);
        expect(props.autoRevealRequestKey).toBe(1);
        expect(plugin.data.settings.sidebarTimelineSelectedPath).toBe(path);
        expect(plugin.data.settings.sidebarTimelineOpen).toBe(true);
    });

    it("ignores file-open for auto-follow when the active leaf is not markdown", () => {
        const item = { id: "note-1", path: "notes/focused.md", title: "Focused Note" };
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [{ id: "new", items: [item] }],
            totalCount: 1,
        } as any);
        const { app, root, view } = createView({
            activeMarkdownPath: item.path,
            autoExpandTimeline: true,
        });
        const fileOpenHandler = app.workspace.on.mock.calls.find(
            ([eventName]: [string]) => eventName === "file-open",
        )?.[1];

        if (typeof fileOpenHandler !== "function") {
            throw new Error("Expected file-open handler");
        }

        root.render.mockClear();
        fileOpenHandler({ path: item.path });

        expect(root.render).not.toHaveBeenCalled();

        view.redraw();
        const props = getLastSidebarProps(root);
        expect(props.activeFilePath).toBe(item.path);
        expect(props.selectedItem).toBeNull();
        expect(props.autoRevealRequestKey).toBe(0);
    });

    it("does not auto-follow on active leaf changes alone", () => {
        const item = { id: "note-1", path: "notes/visible.md", title: "Visible Note" };
        const { view } = createMarkdownLeaf(item.path);
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [{ id: "new", items: [item] }],
            totalCount: 1,
        } as any);
        const {
            app,
            root,
            view: reviewView,
        } = createView({
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

    it("switches the timeline selection to the current file even when it is not in the queue", () => {
        const oldItem = { id: "note-1", path: "notes/original.md", title: "Original" };
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [{ id: "new", items: [oldItem] }],
            totalCount: 1,
        } as any);
        const { root, view } = createView({
            activeMarkdownPath: "notes/Current Focus.md",
            autoExpandTimeline: true,
            timelineAllowUntrackedNotes: true,
            availableFiles: ["notes/Current Focus.md"],
        });
        (view as any).selectedItem = oldItem;
        (view as any).isTimelineOpen = true;

        (view as any).handleFileOpen();

        const props = getLastSidebarProps(root);
        expect(props.activeFilePath).toBe("notes/Current Focus.md");
        expect(props.selectedItem).toMatchObject({
            path: "notes/Current Focus.md",
            title: "Current Focus",
        });
        expect(props.isTimelineOpen).toBe(true);
        expect(props.autoRevealRequestKey).toBe(1);
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

    it("activates and reveals the target markdown leaf when clicking a note", async () => {
        const noteFile = { path: "notes/focused.md" } as any;
        const targetLeaf = {
            openFile: jest.fn(async () => {}),
            view: Object.create(MarkdownView.prototype),
        };
        const item = {
            id: "note-1",
            path: noteFile.path,
            title: "Focused Note",
            noteFile,
        };
        const { app, view } = createView({
            activeMarkdownPath: noteFile.path,
            autoExpandTimeline: true,
        });
        jest.spyOn(view as any, "resolveNoteNavigationLeaf").mockReturnValue(targetLeaf);

        await (view as any).handleNoteClick(item);

        expect(app.workspace.setActiveLeaf).toHaveBeenNthCalledWith(1, targetLeaf, {
            focus: true,
        });
        expect(targetLeaf.openFile).toHaveBeenCalledWith(noteFile);
        expect(app.workspace.setActiveLeaf).toHaveBeenNthCalledWith(2, targetLeaf, {
            focus: true,
        });
        expect(app.workspace.revealLeaf).toHaveBeenCalledWith(targetLeaf);
    });

    it("creates a tracked note item when committing a duration prefix from standalone timeline", async () => {
        const path = "notes/Plan.md";
        const { plugin, view } = createView({
            activeMarkdownPath: path,
            timelineAllowUntrackedNotes: true,
            availableFiles: [path],
        });
        plugin.data.settings.timelineEnableDurationPrefixSyntax = true;

        const trackedItem = {
            applyManualTimelineSchedule: jest.fn(),
        };
        let storedItem: typeof trackedItem | null = null;
        plugin.noteReviewStore.getItem.mockImplementation(() => storedItem);
        plugin.noteReviewStore.ensureTracked.mockImplementation(() => {
            storedItem = trackedItem;
            return trackedItem;
        });

        const commitStore = {
            getCommits: jest.fn(() => []),
            addCommit: jest.fn(async () => undefined),
        };
        (view as any).commitStore = commitStore;

        await (view as any).handleCommit(path, "2d:: revisit");

        expect(commitStore.addCommit).toHaveBeenCalledWith(path, "2d:: revisit", null, 0);
        expect(plugin.clearFolderTrackingExclusion).toHaveBeenCalledWith(path);
        expect(plugin.noteReviewStore.ensureTracked).toHaveBeenCalledWith(
            path,
            DEFAULT_DECKNAME,
            "manual",
            plugin.noteAlgorithm,
        );
        expect(trackedItem.applyManualTimelineSchedule).toHaveBeenCalledWith(2);
        expect(plugin.noteReviewStore.save).toHaveBeenCalled();
        expect(plugin.noteReviewStore.buildReviewDecks).toHaveBeenCalledWith(
            (view as any).app.vault,
        );
        expect(plugin.updateAndSortDueNotes).toHaveBeenCalled();
        expect(plugin.syncEvents.emit).toHaveBeenCalledWith("note-review-updated");
    });

    test.each([["ignored-tag"], ["ignored-folder"]])(
        "keeps duration-prefix timeline commits as logs only when note review is blocked by %s",
        async (reason) => {
            const path = "notes/Blocked.md";
            const { plugin, view } = createView({
                activeMarkdownPath: path,
                timelineAllowUntrackedNotes: true,
                availableFiles: [path],
            });
            plugin.data.settings.timelineEnableDurationPrefixSyntax = true;
            plugin.getNoteReviewIgnoreReason.mockReturnValue(reason);

            const commitStore = {
                getCommits: jest.fn(() => []),
                addCommit: jest.fn(async () => undefined),
            };
            (view as any).commitStore = commitStore;

            await (view as any).handleCommit(path, "2d:: blocked");

            expect(commitStore.addCommit).toHaveBeenCalledWith(path, "2d:: blocked", null, 0);
            expect(plugin.noteReviewStore.ensureTracked).not.toHaveBeenCalled();
            expect(plugin.noteReviewStore.save).not.toHaveBeenCalled();
            expect(plugin.showNoteReviewIgnoreNotice).toHaveBeenCalledWith(reason);
        },
    );

    it("follows the current review card note into a standalone timeline item when enabled", () => {
        const path = "notes/Card Source.md";
        const { plugin, root, view } = createView({
            timelineAllowUntrackedNotes: true,
            timelineAutoFollowReviewCards: true,
            availableFiles: [path],
        });
        plugin.getTimelineReviewCardPath.mockReturnValue(path);

        (view as any).handleReviewCardTimelineFollow();

        const props = getLastSidebarProps(root);
        expect(props.selectedItem).toMatchObject({
            path,
            title: "Card Source",
        });
        expect(props.isTimelineOpen).toBe(true);
        expect(props.autoRevealRequestKey).toBe(0);
    });

    it("ignores review card timeline follow for untracked notes when experimental support is disabled", () => {
        const path = "notes/Card Source.md";
        const { plugin, root, view } = createView({
            timelineAllowUntrackedNotes: false,
            timelineAutoFollowReviewCards: true,
            availableFiles: [path],
        });
        plugin.getTimelineReviewCardPath.mockReturnValue(path);
        view.redraw();
        root.render.mockClear();

        (view as any).handleReviewCardTimelineFollow();

        expect(root.render).not.toHaveBeenCalled();
    });
});
