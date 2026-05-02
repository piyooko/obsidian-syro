import type React from "react";
import {
    REACT_REVIEW_QUEUE_VIEW_TYPE,
    ReactNoteReviewView,
} from "src/ui/views/ReactNoteReviewView";
import { reviewDecksToSidebarState } from "src/ui/adapters/noteReviewAdapter";
import { DEFAULT_DECKNAME } from "src/constants";
import { MarkdownView, Menu, TFile } from "obsidian";
import { LicenseManager } from "src/services/LicenseManager";

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
        static lastItems: Array<{
            title?: string;
            icon?: string;
            checked?: boolean;
            submenu?: Menu;
            onClick?: () => void;
        }> = [];

        items: typeof Menu.lastItems = [];

        constructor(isSubmenu = false) {
            if (!isSubmenu) {
                Menu.lastItems = this.items;
            }
        }

        addItem(callback?: (item: unknown) => void): Menu {
            const menuItem = {
                submenu: undefined as Menu | undefined,
                setTitle(title: string) {
                    this.title = title;
                    return this;
                },
                setIcon(icon: string) {
                    this.icon = icon;
                    return this;
                },
                setChecked(checked: boolean) {
                    this.checked = checked;
                    return this;
                },
                setSubmenu() {
                    this.submenu = new Menu(true);
                    return this.submenu;
                },
                onClick(callback: () => void) {
                    this.onClick = callback;
                    return this;
                },
            } as {
                title?: string;
                icon?: string;
                checked?: boolean;
                submenu?: Menu;
                onClick?: () => void;
            } & {
                setTitle: (title: string) => typeof menuItem;
                setIcon: (icon: string) => typeof menuItem;
                setChecked: (checked: boolean) => typeof menuItem;
                setSubmenu: () => Menu;
                onClick: (callback: () => void) => typeof menuItem;
            };
            callback?.(menuItem);
            this.items.push(menuItem);
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
            getEntrySnapshot: jest.fn(() => null),
            ensureTracked: jest.fn(),
            save: jest.fn(async () => {}),
            buildReviewDecks: jest.fn(() => ({})),
        },
        getNoteReviewIgnoreReason: jest.fn(() => null),
        showNoteReviewIgnoreNotice: jest.fn(),
        clearFolderTrackingExclusion: jest.fn(),
        getTimelineReviewCardPath: jest.fn(() => null),
        setTimelineReviewCardPath: jest.fn(),
        extractStore: {
            getActiveByPath: jest.fn(() => []),
        },
        updateExtractMemo: jest.fn(async () => null),
        removeExtractFromTimelinePreview: jest.fn(async () => null),
        noteAlgorithm: {},
        reviewDecks: {},
        updateAndSortDueNotes: jest.fn(),
        syncEvents: {
            emit: jest.fn(),
            on: jest.fn(() => () => {}),
        },
        appendSyroNoteUpsert: jest.fn(async () => true),
        appendSyroNoteRemove: jest.fn(async () => true),
        appendSyroTimelineAdd: jest.fn(async () => true),
        appendSyroTimelineEdit: jest.fn(async () => true),
        appendSyroTimelineDelete: jest.fn(async () => true),
        appendSyroTimelineRenameFile: jest.fn(async () => true),
        appendSyroTimelineDeleteFile: jest.fn(async () => true),
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
        plugin.noteReviewStore.getEntrySnapshot.mockImplementation(() => ({
            path,
            source: "manual",
            deckName: DEFAULT_DECKNAME,
            item: {
                uuid: "note-1",
            },
        }));

        const commitStore = {
            getCommits: jest.fn(() => []),
            addCommit: jest.fn(async () => ({
                id: "timeline-1",
                message: "2d:: revisit",
                timestamp: 1,
            })),
        };
        (view as any).commitStore = commitStore;

        await (view as any).handleCommit(path, "2d:: revisit");

        expect(commitStore.addCommit).toHaveBeenCalledWith(path, "2d:: revisit", null, 0);
        expect(plugin.appendSyroTimelineAdd).toHaveBeenCalledWith(
            path,
            expect.objectContaining({
                id: "timeline-1",
                message: "2d:: revisit",
            }),
        );
        expect(plugin.clearFolderTrackingExclusion).toHaveBeenCalledWith(path);
        expect(plugin.noteReviewStore.ensureTracked).toHaveBeenCalledWith(
            path,
            DEFAULT_DECKNAME,
            "manual",
            plugin.noteAlgorithm,
        );
        expect(trackedItem.applyManualTimelineSchedule).toHaveBeenCalledWith(2);
        expect(plugin.noteReviewStore.save).toHaveBeenCalled();
        expect(plugin.appendSyroNoteUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                path,
            }),
            "manual-schedule",
        );
        expect(plugin.noteReviewStore.buildReviewDecks).toHaveBeenCalledWith(
            (view as any).app.vault,
        );
        expect(plugin.updateAndSortDueNotes).toHaveBeenCalled();
        expect(plugin.syncEvents.emit).toHaveBeenCalledWith("note-review-updated");
    });

    it("does not gate timeline commits behind the old ten-entry free limit", async () => {
        const path = "notes/Many Logs.md";
        const { plugin, view } = createView({
            activeMarkdownPath: path,
            availableFiles: [path],
        });
        const license = {
            checkFeatureAccess: jest.fn(async () => true),
        };
        jest.mocked(LicenseManager.getInstance).mockReturnValue(license as never);
        const existingCommits = Array.from({ length: 10 }, (_, index) => ({
            id: `commit-${index}`,
            message: `entry ${index}`,
            timestamp: index,
        }));
        const commitStore = {
            getCommits: jest.fn(() => existingCommits),
            addCommit: jest.fn(async () => ({
                id: "timeline-11",
                message: "entry 11",
                timestamp: 11,
            })),
        };
        (view as any).commitStore = commitStore;

        await (view as any).handleCommit(path, "entry 11");

        expect(license.checkFeatureAccess).not.toHaveBeenCalled();
        expect(commitStore.addCommit).toHaveBeenCalledWith(path, "entry 11", null, 0);
        expect(plugin.appendSyroTimelineAdd).toHaveBeenCalledWith(
            path,
            expect.objectContaining({ id: "timeline-11" }),
        );
    });

    it("combines active extracts and timeline commits by creation time", () => {
        const path = "notes/Mixed.md";
        const item = {
            id: "note-1",
            path,
            title: "Mixed",
            noteFile: createTFile(path),
        };
        const { root, view, plugin } = createView({
            activeMarkdownPath: path,
            availableFiles: [path],
        });
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [
                {
                    id: "new",
                    title: "New",
                    count: 1,
                    color: "#4f46e5",
                    items: [item as never],
                },
            ],
            totalCount: 1,
        });
        const commitStore = {
            getCommits: jest.fn(() => [
                { id: "manual", message: "manual", timestamp: 20, entryType: "manual" },
                {
                    id: "formal",
                    message: "formal memo",
                    timestamp: 30,
                    entryType: "extract",
                    extract: {
                        originUuid: "ir_formal",
                        quoteText: "formal quote",
                        memoText: "formal memo",
                        sourcePath: path,
                        sourceAnchor: { start: 0, end: 5, ordinal: 0 },
                        sourceMode: "manual-ir",
                        extractCreatedAt: 30,
                    },
                },
            ]),
        };
        plugin.extractStore.getActiveByPath.mockReturnValue([
            {
                uuid: "manual-active",
                sourcePath: path,
                sourceMode: "manual-ir",
                rawMarkdown: "manual preview",
                memo: "",
                sourceAnchor: { start: 1, end: 15, ordinal: 0, sourceLength: 10 },
                createdAt: 40,
                stage: "active",
            },
            {
                uuid: "auto-empty",
                sourcePath: path,
                sourceMode: "auto-slice",
                rawMarkdown: "# Hidden\nbody",
                memo: "",
                sourceAnchor: { start: 2, end: 20, ordinal: 1, sourceLength: 10 },
                createdAt: 50,
                stage: "active",
            },
            {
                uuid: "auto-memo",
                sourcePath: path,
                sourceMode: "auto-slice",
                rawMarkdown: "## Auto title\nbody",
                memo: "auto memo",
                sourceAnchor: { start: 3, end: 22, ordinal: 2, sourceLength: 10 },
                createdAt: 10,
                timelineCreatedAt: 35,
                memoEditedAt: 45,
                stage: "active",
            },
        ]);
        (view as any).commitStore = commitStore;

        (view as any).setSelectedTimelineItem(item);
        view.redraw();

        const logs = getLastSidebarProps(root).commitLogs as Array<{
            id: string;
            scrollPercentage?: number;
            extract?: { quoteText?: string; memoText?: string; sourceMode?: string };
        }>;
        expect(logs.map((log) => log.id)).toEqual([
            "extract-preview:manual-active",
            "extract-preview:auto-memo",
            "formal",
            "manual",
        ]);
        expect(
            logs.find((log) => log.id === "extract-preview:manual-active")?.extract,
        ).toMatchObject({
            quoteText: "manual preview",
            memoText: "",
        });
        expect(
            logs.find((log) => log.id === "extract-preview:manual-active")?.scrollPercentage,
        ).toBe(0.1);
        expect(logs.find((log) => log.id === "extract-preview:auto-memo")?.extract).toMatchObject({
            quoteText: "## Auto title",
            sourceMode: "auto-slice",
            extractCreatedAt: 35,
            memoEditedAt: 45,
        });
        expect(logs.find((log) => log.id === "extract-preview:auto-memo")?.scrollPercentage).toBe(
            0.3,
        );
    });

    it("filters timeline logs from the timeline preference context menu", () => {
        const path = "notes/Timeline Prefs.md";
        const item = {
            id: "note-1",
            path,
            title: "Timeline Prefs",
            noteFile: createTFile(path),
        };
        const { root, view, plugin } = createView({
            activeMarkdownPath: path,
            availableFiles: [path],
        });
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [
                {
                    id: "new",
                    title: "New",
                    count: 1,
                    color: "#4f46e5",
                    items: [item as never],
                },
            ],
            totalCount: 1,
        });
        const commitStore = {
            getCommits: jest.fn(() => [
                {
                    id: "graduated",
                    message: "graduated memo",
                    timestamp: 30,
                    entryType: "extract",
                    extract: {
                        originUuid: "ir_done",
                        quoteText: "done quote",
                        memoText: "graduated memo",
                        sourcePath: path,
                        sourceAnchor: { start: 0, end: 5, ordinal: 0 },
                        sourceMode: "manual-ir",
                        extractCreatedAt: 30,
                    },
                },
                {
                    id: "message",
                    message: "message",
                    timestamp: 20,
                    entryType: "manual",
                },
            ]),
        };
        plugin.extractStore.getActiveByPath.mockReturnValue([
            {
                uuid: "manual-active",
                sourcePath: path,
                sourceMode: "manual-ir",
                rawMarkdown: "manual preview",
                memo: "",
                sourceAnchor: { start: 1, end: 15, ordinal: 0, sourceLength: 10 },
                createdAt: 40,
                stage: "active",
            },
            {
                uuid: "auto-active",
                sourcePath: path,
                sourceMode: "auto-slice",
                rawMarkdown: "# Auto\nbody",
                memo: "auto memo",
                sourceAnchor: { start: 2, end: 20, ordinal: 1, sourceLength: 10 },
                createdAt: 50,
                stage: "active",
            },
        ]);
        (view as any).commitStore = commitStore;
        (view as any).setSelectedTimelineItem(item);
        view.redraw();

        expect(
            (getLastSidebarProps(root).commitLogs as Array<{ id: string }>).map((log) => log.id),
        ).toEqual([
            "extract-preview:auto-active",
            "extract-preview:manual-active",
            "graduated",
            "message",
        ]);

        (view as any).handleCommitContextMenu(
            { nativeEvent: new MouseEvent("contextmenu") } as React.MouseEvent,
            "message",
        );

        const preferenceItem = (
            Menu as unknown as {
                lastItems: Array<{ title?: string; icon?: string; submenu?: unknown }>;
            }
        ).lastItems.find((menuItem) => menuItem.title === "TIMELINE_PREFERENCES");
        expect(preferenceItem).toMatchObject({ icon: "funnel" });

        const submenuItems = (
            (preferenceItem?.submenu as { items: unknown[] }).items as Array<{
                title?: string;
                icon?: string;
                checked?: boolean;
                onClick?: () => void;
            }>
        ).filter((menuItem) => menuItem.title?.startsWith("TIMELINE_PREFERENCE_SHOW_")) as Array<{
            title?: string;
            icon?: string;
            checked?: boolean;
            onClick?: () => void;
        }>;
        expect(
            submenuItems.map((menuItem) => [menuItem.title, menuItem.icon, menuItem.checked]),
        ).toEqual([
            ["TIMELINE_PREFERENCE_SHOW_EXTRACTS", "library-big", true],
            ["TIMELINE_PREFERENCE_SHOW_AUTO_EXTRACTS", "library-big", true],
            ["TIMELINE_PREFERENCE_SHOW_GRADUATED_EXTRACTS", "graduation-cap", true],
            ["TIMELINE_PREFERENCE_SHOW_COMMIT_MESSAGES", "message-square-text", true],
        ]);

        submenuItems[1].onClick?.();

        expect(plugin.savePluginData).toHaveBeenCalled();
        expect((plugin.data.settings as any).timelineDisplayPreferences).toMatchObject({
            autoExtracts: false,
        });
        expect(
            (getLastSidebarProps(root).commitLogs as Array<{ id: string }>).map((log) => log.id),
        ).toEqual(["extract-preview:manual-active", "graduated", "message"]);
    });

    it("opens only the timeline preference menu from timeline blank space", () => {
        const path = "notes/Timeline Blank.md";
        const item = {
            id: "note-1",
            path,
            title: "Timeline Blank",
            noteFile: createTFile(path),
        };
        const { root, view } = createView({
            activeMarkdownPath: path,
            availableFiles: [path],
        });
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [
                {
                    id: "new",
                    title: "New",
                    count: 1,
                    color: "#4f46e5",
                    items: [item as never],
                },
            ],
            totalCount: 1,
        });
        (view as any).commitStore = {
            getCommits: jest.fn(() => []),
        };
        (view as any).setSelectedTimelineItem(item);
        view.redraw();

        const props = getLastSidebarProps(root) as {
            onTimelineContextMenu?: (event: React.MouseEvent) => void;
        };
        props.onTimelineContextMenu?.({
            nativeEvent: new MouseEvent("contextmenu"),
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
        } as unknown as React.MouseEvent);

        const menuItems = (
            Menu as unknown as {
                lastItems: Array<{ title?: string; icon?: string; submenu?: unknown }>;
            }
        ).lastItems;
        expect(menuItems.map((menuItem) => menuItem.title)).toEqual(["TIMELINE_PREFERENCES"]);
        expect(menuItems[0]).toMatchObject({ icon: "funnel" });
    });

    it("uses the highest timeline percentage for tracked sidebar progress only", () => {
        const trackedPath = "notes/Tracked.md";
        const standalonePath = "notes/Standalone.md";
        const trackedFile = createTFile(trackedPath);
        const standaloneFile = createTFile(standalonePath);
        const { root, view, plugin } = createView({
            activeMarkdownPath: trackedPath,
            timelineAllowUntrackedNotes: true,
            availableFiles: [trackedPath, standalonePath],
        });
        const trackedItem = {
            id: "note-1",
            path: trackedPath,
            title: "Tracked",
            priority: 5,
            noteFile: trackedFile,
        };
        jest.mocked(reviewDecksToSidebarState).mockReturnValue({
            sections: [
                {
                    id: "new",
                    title: "New",
                    count: 1,
                    color: "#4f46e5",
                    items: [trackedItem as never],
                },
            ],
            totalCount: 1,
        });
        const commitStore = {
            getCommits: jest.fn(() => []),
            getLatestScrollPercentage: jest.fn((path: string) =>
                path === trackedPath ? 0.44 : 0.6,
            ),
        };
        (view as any).commitStore = commitStore;
        (
            plugin.extractStore.getActiveByPath as unknown as jest.MockedFunction<
                (path: string) => unknown[]
            >
        ).mockImplementation((path: string) =>
            path === trackedPath
                ? [
                      {
                          uuid: "active-75",
                          sourcePath: trackedPath,
                          sourceMode: "manual-ir",
                          rawMarkdown: "preview at 75",
                          memo: "",
                          sourceAnchor: {
                              start: 75,
                              end: 90,
                              ordinal: 0,
                              sourceLength: 100,
                          },
                          createdAt: 1,
                          stage: "active",
                      },
                  ]
                : [],
        );
        plugin.noteReviewStore.getItem.mockImplementation((path?: string) =>
            path === trackedPath ? { priority: 5, isNew: true } : null,
        );
        view.redraw();

        const sidebarItem = (
            getLastSidebarProps(root).data as {
                sections: Array<{ items: Array<{ path: string; lastScrollPercentage?: number }> }>;
            }
        ).sections[0].items[0];
        expect(sidebarItem.lastScrollPercentage).toBe(0.75);

        const standaloneItem = (view as any).buildStandaloneTimelineItem(standalonePath) as {
            lastScrollPercentage?: number;
        } | null;
        expect(standaloneItem).toMatchObject({
            path: standalonePath,
            noteFile: standaloneFile,
        });
        expect(standaloneItem?.lastScrollPercentage).toBeUndefined();
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
                addCommit: jest.fn(async () => ({
                    id: "timeline-1",
                    message: "2d:: blocked",
                    timestamp: 1,
                })),
            };
            (view as any).commitStore = commitStore;

            await (view as any).handleCommit(path, "2d:: blocked");

            expect(commitStore.addCommit).toHaveBeenCalledWith(path, "2d:: blocked", null, 0);
            expect(plugin.appendSyroTimelineAdd).toHaveBeenCalledWith(
                path,
                expect.objectContaining({
                    id: "timeline-1",
                    message: "2d:: blocked",
                }),
            );
            expect(plugin.noteReviewStore.ensureTracked).not.toHaveBeenCalled();
            expect(plugin.noteReviewStore.save).not.toHaveBeenCalled();
            expect(plugin.appendSyroNoteUpsert).not.toHaveBeenCalled();
            expect(plugin.showNoteReviewIgnoreNotice).toHaveBeenCalledWith(reason);
        },
    );

    it("emits a note session after changing sidebar priority", async () => {
        const path = "notes/Priority.md";
        const { plugin, view } = createView({
            activeMarkdownPath: path,
            availableFiles: [path],
        });
        plugin.noteReviewStore.getItem.mockReturnValue({
            priority: 5,
        });
        plugin.noteReviewStore.getEntrySnapshot = jest.fn(() => ({
            path,
            source: "manual",
            deckName: DEFAULT_DECKNAME,
            item: {
                uuid: "note-1",
            },
        }));

        await (view as any).handlePriorityChange(
            {
                path,
                noteFile: { path },
            },
            9,
        );

        expect(plugin.noteReviewStore.save).toHaveBeenCalled();
        expect(plugin.appendSyroNoteUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                path,
            }),
            "priority",
        );
        expect(plugin.updateAndSortDueNotes).toHaveBeenCalled();
        expect(plugin.syncEvents.emit).toHaveBeenCalledWith("note-review-updated");
    });

    it("clamps sidebar priority before saving note review data", async () => {
        const path = "notes/Priority.md";
        const { plugin, view } = createView({
            activeMarkdownPath: path,
            availableFiles: [path],
        });
        const storedItem = {
            priority: 5,
        };
        plugin.noteReviewStore.getItem.mockReturnValue(storedItem);
        plugin.noteReviewStore.getEntrySnapshot = jest.fn(() => ({
            path,
            source: "manual",
            deckName: DEFAULT_DECKNAME,
            item: {
                uuid: "note-1",
            },
        }));

        await (view as any).handlePriorityChange(
            {
                path,
                noteFile: { path },
            },
            11,
        );

        expect(storedItem.priority).toBe(10);
        expect(plugin.noteReviewStore.save).toHaveBeenCalled();
    });

    it("emits a timeline edit session after editing a commit", async () => {
        const path = "notes/Edit Commit.md";
        const { plugin, view } = createView({
            activeMarkdownPath: path,
            availableFiles: [path],
        });
        (view as any).selectedItem = { path };
        (view as any).commitStore = {
            editCommit: jest.fn(async () => ({
                id: "commit-1",
                message: "updated",
                timestamp: 1,
                entryType: "manual",
            })),
            getCommits: jest.fn(() => []),
        };

        await (view as any).handleEditCommit("commit-1", {
            message: "updated",
            entryType: "manual",
        });

        expect(plugin.appendSyroTimelineEdit).toHaveBeenCalledWith(
            path,
            expect.objectContaining({
                id: "commit-1",
                message: "updated",
            }),
        );
    });

    it("edits active extract previews through the extract memo path", async () => {
        const path = "notes/Extract.md";
        const { plugin, view } = createView({
            activeMarkdownPath: path,
            availableFiles: [path],
        });
        (view as any).selectedItem = { path };
        (view as any).commitStore = {
            getCommits: jest.fn(() => []),
        };
        plugin.extractStore.getActiveByPath.mockReturnValue([
            {
                uuid: "ir_1",
                sourcePath: path,
                sourceMode: "manual-ir",
                rawMarkdown: "quote",
                memo: "old memo",
                sourceAnchor: { start: 0, end: 5, ordinal: 0 },
                createdAt: 1,
                stage: "active",
            },
        ]);
        (view as any).commitLogs = (view as any).buildTimelineLogs(path);

        await (view as any).handleEditCommit("extract-preview:ir_1", {
            message: "new memo",
            entryType: "extract",
            extract: {
                originUuid: "ir_1",
                quoteText: "ignored quote edit",
                memoText: "new memo",
                sourcePath: path,
                sourceAnchor: { start: 0, end: 5, ordinal: 0 },
                sourceMode: "manual-ir",
                extractCreatedAt: 1,
            },
        });

        expect(plugin.updateExtractMemo).toHaveBeenCalledWith("ir_1", "new memo");
    });

    it("updates formal extract timeline entries without touching extract memo", async () => {
        const path = "notes/Formal Extract.md";
        const { plugin, view } = createView({
            activeMarkdownPath: path,
            availableFiles: [path],
        });
        (view as any).selectedItem = { path };
        (view as any).commitStore = {
            editCommit: jest.fn(async () => ({
                id: "extract:ir_1",
                message: "new memo",
                timestamp: 1,
                entryType: "extract",
            })),
            getCommits: jest.fn(() => []),
        };

        await (view as any).handleEditCommit("extract:ir_1", {
            message: "new memo",
            entryType: "extract",
            extract: {
                originUuid: "ir_1",
                quoteText: "new quote",
                memoText: "new memo",
                sourcePath: path,
                sourceAnchor: { start: 0, end: 5, ordinal: 0 },
                sourceMode: "manual-ir",
                extractCreatedAt: 1,
            },
        });

        expect(plugin.updateExtractMemo).not.toHaveBeenCalled();
        expect((view as any).commitStore.editCommit).toHaveBeenCalledWith(
            path,
            "extract:ir_1",
            expect.objectContaining({ entryType: "extract" }),
        );
        expect(plugin.appendSyroTimelineEdit).toHaveBeenCalledWith(
            path,
            expect.objectContaining({ id: "extract:ir_1" }),
        );
    });

    it("uses active extract context menu deletion for previews", async () => {
        const path = "notes/Extract Context.md";
        const { plugin, view } = createView({
            activeMarkdownPath: path,
            availableFiles: [path],
        });
        (view as any).selectedItem = { path };
        (view as any).commitStore = {
            getCommits: jest.fn(() => []),
        };
        plugin.extractStore.getActiveByPath.mockReturnValue([
            {
                uuid: "ir_1",
                sourcePath: path,
                sourceMode: "auto-slice",
                rawMarkdown: "# A\nbody",
                memo: "memo",
                sourceAnchor: { start: 0, end: 8, ordinal: 0 },
                createdAt: 1,
                stage: "active",
            },
        ]);
        (view as any).commitLogs = (view as any).buildTimelineLogs(path);

        (view as any).handleCommitContextMenu(
            { nativeEvent: new MouseEvent("contextmenu") } as React.MouseEvent,
            "extract-preview:ir_1",
        );
        const deleteItem = (
            Menu as unknown as { lastItems: Array<{ title?: string; onClick?: () => void }> }
        ).lastItems.find((item) => item.title === "TIMELINE_CLEAR_EXTRACT_MEMO");
        deleteItem.onClick?.();
        await Promise.resolve();
        await Promise.resolve();

        expect(plugin.removeExtractFromTimelinePreview).toHaveBeenCalledWith("ir_1");
        expect(plugin.appendSyroTimelineDelete).not.toHaveBeenCalled();
    });

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
