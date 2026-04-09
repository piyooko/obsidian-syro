/**
 * React-based note review sidebar view.
 * It renders the note review queue and timeline interactions inside an Obsidian item view.
 */

import {
    ItemView,
    WorkspaceLeaf,
    Menu,
    TFile,
    Notice,
    Scope,
    getAllTags,
    MarkdownView,
    type Modifier,
} from "obsidian";
import { createRoot, Root } from "react-dom/client";
import React from "react";
import type SRPlugin from "src/main";
import { DEFAULT_DECKNAME } from "src/constants";
import {
    MOBILE_TIMELINE_MIN_HEIGHT_PX,
    NoteReviewSidebar,
} from "src/ui/components/NoteReviewSidebar";
import { reviewDecksToSidebarState } from "src/ui/adapters/noteReviewAdapter";
import { NoteReviewItem } from "src/ui/types/noteReview";
import {
    ReviewCommitStore,
    ReviewCommitLog,
    type ReviewCommitEditPayload,
} from "src/dataStore/reviewCommitStore";
import { t } from "src/lang/helpers";
import { Tags } from "src/tags";
import { ContextAnchorService } from "src/util/ContextAnchor";
import { LicenseManager } from "src/services/LicenseManager";
import { captureTimelineContext } from "src/ui/timeline/timelineContext";
import { parseTimelineMessage } from "src/ui/timeline/timelineMessage";

// Stable view type id used when registering the sidebar view.
export const REACT_REVIEW_QUEUE_VIEW_TYPE = "react-review-queue-list-view";

interface OpenNoteTargetOptions {
    newTab?: boolean;
}

function isPhoneMobileLayout(): boolean {
    if (typeof document === "undefined") {
        return false;
    }

    const hasMobileClass =
        document.body.classList.contains("is-mobile") ||
        document.documentElement.classList.contains("is-mobile");
    const hasTabletClass =
        document.body.classList.contains("is-tablet") ||
        document.documentElement.classList.contains("is-tablet");

    return hasMobileClass && !hasTabletClass;
}

/**
 * React item view for the note review queue.
 */

export class ReactNoteReviewView extends ItemView {
    private static readonly FILE_OPEN_AFTER_LEAF_CHANGE_WINDOW_MS = 400;

    private static hasInitializedPhoneDrawerTimelineHeightThisSession = false;
    private static phoneDrawerTimelineHeightThisSession: number | null = null;

    private plugin: SRPlugin;
    private root: Root | null = null;
    private drawerChromeObserver: MutationObserver | null = null;
    private observedDrawerInner: HTMLElement | null = null;
    private scheduledDrawerChromeSyncFrame: number | null = null;

    // Timeline state
    private commitStore: ReviewCommitStore | null = null;
    private selectedItem: NoteReviewItem | null = null;
    private isTimelineOpen: boolean = false;
    private commitLogs: ReviewCommitLog[] = [];
    private timelineHeight: number = 300;
    private editingId: string | null = null;
    private unsubscribeSyncEvent: (() => void) | null = null;
    private unsubscribeReviewCardSyncEvent: (() => void) | null = null;
    private isLoading: boolean = false;
    private timelineScopeHandlers: Array<Parameters<Scope["unregister"]>[0]> = [];
    private autoRevealTargetPath: string | null = null;
    private autoRevealRequestKey = 0;
    private autoRevealDebugSource: string | null = null;
    private lastPrimaryMarkdownPath: string | null = null;
    private previousMarkdownTabsContainer: HTMLElement | null = null;
    private currentMarkdownTabsContainer: HTMLElement | null = null;
    private lastMarkdownLeafChangeAt = 0;

    private runAsync(task: Promise<void>, label: string): void {
        void task.catch((error: unknown) => {
            console.error(`[ReactNoteReviewView] ${label} failed`, error);
        });
    }

    private shouldLogRuntimeDebug(): boolean {
        return this.plugin.data.settings.showRuntimeDebugMessages === true;
    }

    private logRuntimeDebug(message: string, details?: Record<string, unknown>): void {
        if (!this.shouldLogRuntimeDebug()) {
            return;
        }

        if (details) {
            console.debug(message, details);
            return;
        }

        console.debug(message);
    }

    private shouldPersistTimelineOpenState(): boolean {
        return this.getDrawerInner() === null;
    }

    private persistTimelineUiState(options: {
        height?: number;
        isOpen?: boolean;
        selectedPath?: string | null;
    }): void {
        let changed = false;

        if (
            options.height !== undefined &&
            this.plugin.data.settings.sidebarTimelineHeight !== options.height
        ) {
            this.plugin.data.settings.sidebarTimelineHeight = options.height;
            changed = true;
        }

        if (
            options.selectedPath !== undefined &&
            this.plugin.data.settings.sidebarTimelineSelectedPath !== options.selectedPath
        ) {
            this.plugin.data.settings.sidebarTimelineSelectedPath = options.selectedPath;
            changed = true;
        }

        if (options.isOpen !== undefined && this.shouldPersistTimelineOpenState()) {
            if (this.plugin.data.settings.sidebarTimelineOpen !== options.isOpen) {
                this.plugin.data.settings.sidebarTimelineOpen = options.isOpen;
                changed = true;
            }
        }

        if (changed) {
            this.runAsync(this.plugin.savePluginData(), "save timeline ui state");
        }
    }

    private getLeafContainer(): HTMLElement | null {
        const leafWithContainer = this.leaf as WorkspaceLeaf & {
            containerEl?: HTMLElement;
        };
        return leafWithContainer.containerEl instanceof HTMLElement
            ? leafWithContainer.containerEl
            : null;
    }

    private getDrawerInner(): HTMLElement | null {
        const leafContainer = this.getLeafContainer();
        const drawerInner = leafContainer?.closest(".workspace-drawer-inner");
        return drawerInner instanceof HTMLElement ? drawerInner : null;
    }

    private describeLeaf(leaf: WorkspaceLeaf | null | undefined): Record<string, unknown> {
        const view = leaf?.view;
        const viewType =
            typeof view?.getViewType === "function"
                ? view.getViewType()
                : (view?.constructor?.name ?? null);
        const path =
            view instanceof MarkdownView && typeof view.file?.path === "string"
                ? view.file.path
                : null;
        const containerEl = (
            leaf as (WorkspaceLeaf & { containerEl?: HTMLElement }) | null | undefined
        )?.containerEl;

        return {
            viewType,
            path,
            containerClasses: containerEl instanceof HTMLElement ? containerEl.className : null,
        };
    }

    private getWorkspaceTabsContainer(leaf: WorkspaceLeaf | null | undefined): HTMLElement | null {
        const containerEl = (
            leaf as (WorkspaceLeaf & { containerEl?: HTMLElement }) | null | undefined
        )?.containerEl;
        const workspaceTabs = containerEl?.closest(".workspace-tabs");
        return workspaceTabs instanceof HTMLElement ? workspaceTabs : null;
    }

    private shouldAllowAutoFollowForFileOpen(
        file: TFile,
        activeLeaf: WorkspaceLeaf,
        activeLeafPath: string,
    ): boolean {
        const now = Date.now();
        const activeTabsContainer = this.getWorkspaceTabsContainer(activeLeaf);
        const hasRecentLeafChange =
            now - this.lastMarkdownLeafChangeAt <=
            ReactNoteReviewView.FILE_OPEN_AFTER_LEAF_CHANGE_WINDOW_MS;

        if (!hasRecentLeafChange) {
            this.logRuntimeDebug("[TimelineAutoFollow] workspace:file-open:allow", {
                reason: "noRecentLeafChange",
                filePath: file.path,
                activeLeafPath,
                lastPrimaryMarkdownPath: this.lastPrimaryMarkdownPath,
            });
            return true;
        }

        const sameTabsContainer =
            activeTabsContainer !== null &&
            activeTabsContainer === this.previousMarkdownTabsContainer;
        const changedMarkdownPath =
            this.lastPrimaryMarkdownPath == null || this.lastPrimaryMarkdownPath !== file.path;

        if (sameTabsContainer && changedMarkdownPath) {
            this.logRuntimeDebug("[TimelineAutoFollow] workspace:file-open:allow", {
                reason: "recentLeafChangeWithinSameTabsContainer",
                filePath: file.path,
                activeLeafPath,
                lastPrimaryMarkdownPath: this.lastPrimaryMarkdownPath,
            });
            return true;
        }

        this.logRuntimeDebug("[TimelineAutoFollow] workspace:file-open:ignored", {
            reason: sameTabsContainer
                ? "pathDidNotChangeWithinSameTabsContainer"
                : "tabsContainerChanged",
            filePath: file.path,
            activeLeafPath,
            lastPrimaryMarkdownPath: this.lastPrimaryMarkdownPath,
            hasRecentLeafChange,
            sameTabsContainer,
        });
        return false;
    }

    private isForegroundDrawerView(): boolean {
        const leafContainer = this.getLeafContainer();
        const activeTabContent = leafContainer?.closest(".workspace-drawer-active-tab-content");

        return (
            leafContainer instanceof HTMLElement &&
            activeTabContent instanceof HTMLElement &&
            this.leaf.view.getViewType() === REACT_REVIEW_QUEUE_VIEW_TYPE &&
            leafContainer.classList.contains("mod-active") &&
            activeTabContent.contains(leafContainer)
        );
    }

    private disconnectDrawerChromeObserver(): void {
        this.drawerChromeObserver?.disconnect();
        this.drawerChromeObserver = null;
        this.observedDrawerInner = null;
    }

    private bindDrawerChromeObserver(): void {
        const drawerInner = this.getDrawerInner();
        if (drawerInner === this.observedDrawerInner) {
            return;
        }

        this.disconnectDrawerChromeObserver();
        if (!drawerInner) {
            return;
        }

        this.observedDrawerInner = drawerInner;
        this.drawerChromeObserver = new MutationObserver(() => {
            this.scheduleDrawerChromeSync();
        });
        this.drawerChromeObserver.observe(drawerInner, {
            attributes: true,
            attributeFilter: ["class"],
            childList: true,
            subtree: true,
        });
    }

    private scheduleDrawerChromeSync(): void {
        if (this.scheduledDrawerChromeSyncFrame !== null) {
            return;
        }

        this.scheduledDrawerChromeSyncFrame = window.requestAnimationFrame(() => {
            this.scheduledDrawerChromeSyncFrame = null;
            this.syncDrawerChromeInterception();
        });
    }

    private syncDrawerChromeInterception(): void {
        if (!this.root) {
            this.clearDrawerChromeInterception();
            return;
        }

        this.bindDrawerChromeObserver();
        this.redraw();
    }

    private clearDrawerChromeInterception(): void {
        if (this.scheduledDrawerChromeSyncFrame !== null) {
            window.cancelAnimationFrame(this.scheduledDrawerChromeSyncFrame);
            this.scheduledDrawerChromeSyncFrame = null;
        }

        this.disconnectDrawerChromeObserver();
    }

    private getTimelineHeightForRender(isPhoneMobileDrawerView: boolean): number {
        if (!isPhoneMobileDrawerView) {
            return this.timelineHeight;
        }

        if (!ReactNoteReviewView.hasInitializedPhoneDrawerTimelineHeightThisSession) {
            ReactNoteReviewView.hasInitializedPhoneDrawerTimelineHeightThisSession = true;
            ReactNoteReviewView.phoneDrawerTimelineHeightThisSession =
                MOBILE_TIMELINE_MIN_HEIGHT_PX;
        }

        return (
            ReactNoteReviewView.phoneDrawerTimelineHeightThisSession ??
            MOBILE_TIMELINE_MIN_HEIGHT_PX
        );
    }

    private isMarkdownLeafVisible(leaf: WorkspaceLeaf): boolean {
        const viewWithContainer = leaf.view as MarkdownView & {
            containerEl?: HTMLElement;
        };
        const containerEl = viewWithContainer.containerEl;

        if (!(containerEl instanceof HTMLElement)) {
            return false;
        }

        return (
            containerEl.offsetWidth > 0 ||
            containerEl.offsetHeight > 0 ||
            containerEl.getClientRects().length > 0
        );
    }

    private resolvePrimaryMarkdownPath(): string | null {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (typeof activeView?.file?.path === "string" && activeView.file.path.length > 0) {
            return activeView.file.path;
        }

        const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
        for (const leaf of markdownLeaves) {
            if (!(leaf.view instanceof MarkdownView)) {
                continue;
            }

            if (!this.isMarkdownLeafVisible(leaf)) {
                continue;
            }

            const path = leaf.view.file?.path;
            if (typeof path === "string" && path.length > 0) {
                return path;
            }
        }

        const mostRecentLeaf = this.app.workspace.getMostRecentLeaf?.();
        if (mostRecentLeaf?.view instanceof MarkdownView) {
            const path = mostRecentLeaf.view.file?.path;
            if (typeof path === "string" && path.length > 0) {
                return path;
            }
        }

        return null;
    }

    private setSelectedTimelineItem(item: NoteReviewItem | null): void {
        this.selectedItem = item;
        this.commitLogs = item && this.commitStore ? this.commitStore.getCommits(item.path) : [];
    }

    private canUseStandaloneTimelineItems(): boolean {
        return this.plugin.data.settings.timelineAllowUntrackedNotes === true;
    }

    private extractStandaloneTimelineTags(file: TFile): string[] {
        const fileCache = this.app.metadataCache.getFileCache(file) ?? null;
        const tags = getAllTags(fileCache) ?? [];
        return Array.from(new Set(tags.map((tag) => tag.replace(/^#/, "")).filter(Boolean)));
    }

    private buildStandaloneTimelineItem(path: string): NoteReviewItem | null {
        if (!this.canUseStandaloneTimelineItems()) {
            return null;
        }

        const abstractFile = this.app.vault.getAbstractFileByPath(path);
        if (!(abstractFile instanceof TFile) || abstractFile.extension !== "md") {
            return null;
        }

        const item = this.plugin.noteReviewStore.getItem(path);
        return {
            id: `timeline-standalone-${path}`,
            title: abstractFile.basename,
            priority: item?.priority ?? 5,
            path,
            noteFile: abstractFile,
            dueUnix: item?.nextReview,
            isNew: item?.isNew ?? true,
            lastScrollPercentage: this.commitStore?.getLatestScrollPercentage(path),
            tags: this.extractStandaloneTimelineTags(abstractFile),
        };
    }

    private resolveTimelineItemByPath(
        data: ReturnType<typeof reviewDecksToSidebarState>,
        path: string,
    ): NoteReviewItem | null {
        return this.findSidebarItemByPath(data, path) ?? this.buildStandaloneTimelineItem(path);
    }

    private findSidebarItemByPath(
        data: ReturnType<typeof reviewDecksToSidebarState>,
        path: string,
    ): NoteReviewItem | null {
        for (const section of data.sections) {
            const foundItem = section.items.find((item) => item.path === path);
            if (foundItem) {
                return foundItem;
            }
        }

        return null;
    }

    private restorePersistedTimelineSelection(
        data: ReturnType<typeof reviewDecksToSidebarState>,
    ): void {
        const selectedPath =
            this.plugin.data.settings.sidebarTimelineSelectedPath ??
            this.selectedItem?.path ??
            null;
        if (selectedPath == null) {
            return;
        }

        const foundItem = this.resolveTimelineItemByPath(data, selectedPath);
        if (!foundItem) {
            const trackedItem = this.plugin.noteReviewStore.getItem(selectedPath);
            if (!trackedItem && !this.canUseStandaloneTimelineItems()) {
                this.setSelectedTimelineItem(null);
            }
            return;
        }

        this.setSelectedTimelineItem(foundItem);
    }

    private syncTimelineToPath(
        data: ReturnType<typeof reviewDecksToSidebarState>,
        notePath: string,
        options: { requestReveal: boolean; source: string },
    ): boolean {
        const foundItem = this.resolveTimelineItemByPath(data, notePath);
        if (!foundItem) {
            this.logRuntimeDebug("[TimelineAutoFollow] syncTimelineToPath:skip", {
                source: options.source,
                reason: "pathUnavailableForTimeline",
                notePath,
                allowStandaloneTimeline: this.canUseStandaloneTimelineItems(),
            });
            return false;
        }

        this.setSelectedTimelineItem(foundItem);
        this.isTimelineOpen = true;
        this.persistTimelineUiState({
            selectedPath: foundItem.path,
            isOpen: true,
        });

        if (options.requestReveal) {
            this.autoRevealTargetPath = foundItem.path;
            this.autoRevealRequestKey += 1;
            this.autoRevealDebugSource = options.source;
        }

        this.logRuntimeDebug("[TimelineAutoFollow] syncTimelineToPath:matched", {
            source: options.source,
            matchedPath: foundItem.path,
            requestReveal: options.requestReveal,
            autoRevealRequestKey: this.autoRevealRequestKey,
        });

        return true;
    }

    private syncSidebarToPrimaryMarkdownNote(
        data: ReturnType<typeof reviewDecksToSidebarState>,
        options: { requestReveal: boolean; source: string },
    ): string | null {
        const primaryMarkdownPath = this.resolvePrimaryMarkdownPath();
        this.logRuntimeDebug("[TimelineAutoFollow] syncSidebarToPrimaryMarkdownNote:start", {
            source: options.source,
            autoExpandEnabled: this.plugin.data.settings.autoExpandTimeline,
            primaryMarkdownPath,
        });

        if (!this.plugin.data.settings.autoExpandTimeline || primaryMarkdownPath == null) {
            this.logRuntimeDebug("[TimelineAutoFollow] syncSidebarToPrimaryMarkdownNote:skip", {
                source: options.source,
                reason: !this.plugin.data.settings.autoExpandTimeline
                    ? "autoExpandDisabled"
                    : "missingPrimaryMarkdownPath",
                primaryMarkdownPath,
            });
            return primaryMarkdownPath;
        }

        this.syncTimelineToPath(data, primaryMarkdownPath, options);

        return primaryMarkdownPath;
    }

    private handleReviewCardTimelineFollow(): void {
        const reviewCardPath = this.plugin.getTimelineReviewCardPath();
        if (!this.plugin.data.settings.timelineAutoFollowReviewCards || reviewCardPath == null) {
            this.logRuntimeDebug("[TimelineAutoFollow] review-card:skip", {
                reviewCardPath,
                enabled: this.plugin.data.settings.timelineAutoFollowReviewCards === true,
            });
            return;
        }

        const data = reviewDecksToSidebarState(this.plugin);
        const didSync = this.syncTimelineToPath(data, reviewCardPath, {
            requestReveal: false,
            source: `review-card:${reviewCardPath}`,
        });
        if (didSync) {
            this.redraw();
        }
    }

    constructor(leaf: WorkspaceLeaf, plugin: SRPlugin) {
        super(leaf);
        this.plugin = plugin;

        // Restore persisted timeline UI state.
        this.timelineHeight = this.plugin.data.settings.sidebarTimelineHeight;
        this.isTimelineOpen = this.plugin.data.settings.sidebarTimelineOpen;
        this.lastPrimaryMarkdownPath = this.resolvePrimaryMarkdownPath();
        this.currentMarkdownTabsContainer = this.getWorkspaceTabsContainer(
            this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf ?? null,
        );

        // Register workspace and vault listeners.
        this.registerEvent(
            this.app.workspace.on("file-open", (file: TFile | null) => {
                const activeMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                const activeLeaf = activeMarkdownView?.leaf ?? null;
                const activeLeafPath = activeMarkdownView?.file?.path ?? null;
                const activeLeafIsMarkdown = this.isMarkdownLeaf(activeLeaf);
                this.logRuntimeDebug("[TimelineAutoFollow] workspace:file-open", {
                    filePath: file?.path ?? null,
                    activeLeaf: this.describeLeaf(activeLeaf),
                    activeLeafIsMarkdown,
                    activeLeafPath,
                });

                if (!file) {
                    this.logRuntimeDebug("[TimelineAutoFollow] workspace:file-open:ignored", {
                        reason: "missingFile",
                    });
                    return;
                }

                if (!activeLeafIsMarkdown) {
                    this.logRuntimeDebug("[TimelineAutoFollow] workspace:file-open:ignored", {
                        reason: "activeLeafNotMarkdown",
                        filePath: file.path,
                        activeLeaf: this.describeLeaf(activeLeaf),
                    });
                    return;
                }

                if (activeLeafPath !== file.path) {
                    this.logRuntimeDebug("[TimelineAutoFollow] workspace:file-open:ignored", {
                        reason: "activeLeafPathMismatch",
                        filePath: file.path,
                        activeLeafPath,
                    });
                    return;
                }

                if (!this.shouldAllowAutoFollowForFileOpen(file, activeLeaf, activeLeafPath)) {
                    return;
                }

                this.handleFileOpen(file);
            }),
        );
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                // Keep timeline entries in sync with renamed files.
                if (this.commitStore && oldPath) {
                    this.commitStore.renameFile(oldPath, file.path);
                    this.runAsync(this.commitStore.save(), "save renamed commit store");
                }
                if (oldPath && this.plugin.data.settings.sidebarTimelineSelectedPath === oldPath) {
                    this.plugin.data.settings.sidebarTimelineSelectedPath = file.path;
                    this.runAsync(this.plugin.savePluginData(), "save renamed timeline selection");
                }
                this.redraw();
            }),
        );
        this.registerEvent(
            this.app.workspace.on("active-leaf-change", (activeLeaf: WorkspaceLeaf | null) => {
                if (activeLeaf?.view instanceof MarkdownView) {
                    this.previousMarkdownTabsContainer = this.currentMarkdownTabsContainer;
                    this.currentMarkdownTabsContainer = this.getWorkspaceTabsContainer(activeLeaf);
                    this.lastMarkdownLeafChangeAt = Date.now();
                }
                this.logRuntimeDebug("[TimelineAutoFollow] workspace:active-leaf-change:ignored", {
                    activeLeaf: this.describeLeaf(activeLeaf),
                    activeMarkdownPath: this.resolvePrimaryMarkdownPath(),
                    lastPrimaryMarkdownPath: this.lastPrimaryMarkdownPath,
                    previousTabsContainerMatched:
                        this.previousMarkdownTabsContainer !== null &&
                        this.previousMarkdownTabsContainer === this.currentMarkdownTabsContainer,
                });
                this.scheduleDrawerChromeSync();
            }),
        );
        this.registerEvent(
            this.app.workspace.on("layout-change", () => {
                this.scheduleDrawerChromeSync();
            }),
        );
        this.registerDomEvent(window, "resize", () => {
            this.scheduleDrawerChromeSync();
        });
        this.registerDomEvent(window, "orientationchange", () => {
            this.scheduleDrawerChromeSync();
        });
    }

    /** View type id. */
    public getViewType(): string {
        return REACT_REVIEW_QUEUE_VIEW_TYPE;
    }

    /** View title. */
    public getDisplayText(): string {
        return t("NOTES_REVIEW_QUEUE");
    }

    /** View icon. */
    public getIcon(): string {
        return "SpacedRepIcon";
    }

    /**
     * Header menu actions.
     */
    public onHeaderMenu(menu: Menu): void {
        menu.addItem((item) => {
            item.setTitle(t("CLOSE"))
                .setIcon("cross")
                .onClick(() => {
                    this.app.workspace.detachLeavesOfType(REACT_REVIEW_QUEUE_VIEW_TYPE);
                });
        });
    }

    /**
     * Open the view and mount the React root.
     */
    onOpen(): Promise<void> {
        const contentEl = this.containerEl.children[1] as HTMLElement;
        contentEl.empty();
        contentEl.addClass("sr-react-note-review-view");
        contentEl.setCssProps({ padding: "0" });

        this.commitStore = this.plugin.reviewCommitStore;

        // Mount the React tree.
        this.root = createRoot(contentEl);
        this.syncDrawerChromeInterception();

        // Ensure this view has a scope instance for keyboard bindings.
        if (!this.scope) {
            this.scope = new Scope();
        }

        // Obsidian intercepts Ctrl+Enter before the DOM sees it, so bridge it via Scope.

        this.registerTimelineScopeHotkeys();

        // Refresh automatically after sync completes.
        this.unsubscribeSyncEvent = this.plugin.syncEvents.on("note-review-updated", () => {
            this.redraw();
        });
        this.unsubscribeReviewCardSyncEvent = this.plugin.syncEvents.on(
            "timeline-review-card-updated",
            () => {
                this.handleReviewCardTimelineFollow();
            },
        );

        return Promise.resolve();
    }

    /**
     * Close the view and clean up resources.
     */
    onClose(): Promise<void> {
        // Unsubscribe from sync events.
        if (this.unsubscribeSyncEvent) {
            this.unsubscribeSyncEvent();
            this.unsubscribeSyncEvent = null;
        }
        if (this.unsubscribeReviewCardSyncEvent) {
            this.unsubscribeReviewCardSyncEvent();
            this.unsubscribeReviewCardSyncEvent = null;
        }

        this.unregisterTimelineScopeHotkeys();

        if (this.root) {
            this.root.unmount();
            this.root = null;
        }

        this.clearDrawerChromeInterception();

        return Promise.resolve();
    }

    /**
     * Re-render the sidebar state.
     */
    public redraw(): void {
        if (!this.root) return;

        this.bindDrawerChromeObserver();
        const isMobileDrawerView = this.getDrawerInner() !== null;
        const isPhoneMobileDrawerView = isMobileDrawerView && isPhoneMobileLayout();
        const isForegroundDrawerView = this.isForegroundDrawerView();
        const timelineHeight = this.getTimelineHeightForRender(isPhoneMobileDrawerView);
        const data = reviewDecksToSidebarState(this.plugin);
        this.restorePersistedTimelineSelection(data);
        const activeFilePath = this.resolvePrimaryMarkdownPath();
        this.lastPrimaryMarkdownPath = activeFilePath;
        this.logRuntimeDebug("[TimelineAutoFollow] redraw", {
            activeFilePath,
            selectedItemPath: this.selectedItem?.path ?? null,
            autoRevealTargetPath: this.autoRevealTargetPath,
            autoRevealRequestKey: this.autoRevealRequestKey,
            autoRevealDebugSource: this.autoRevealDebugSource,
        });
        this.setSelectedTimelineItem(this.selectedItem);

        this.root.render(
            React.createElement(NoteReviewSidebar, {
                app: this.app,
                data,
                activeFilePath: activeFilePath ?? undefined,
                autoRevealTargetPath: this.autoRevealTargetPath ?? undefined,
                autoRevealRequestKey: this.autoRevealRequestKey,
                autoRevealDebugSource: this.autoRevealDebugSource ?? undefined,
                debugRuntime: this.shouldLogRuntimeDebug(),
                onNoteClick: (item, options) => {
                    this.runAsync(this.handleNoteClick(item, options), "open note");
                },
                onNoteContextMenu: (item, event) => this.handleNoteContextMenu(item, event),
                onTagDrop: (item, tag) => {
                    this.runAsync(this.handleTagDrop(item, tag), "drop tag");
                },
                onPriorityChange: (item, newPriority) => {
                    this.runAsync(this.handlePriorityChange(item, newPriority), "change priority");
                },
                ignoredTags: this.plugin.data.settings.sidebarIgnoredTags || [],
                sortMode: this.plugin.data.settings.sidebarTagSortMode || "frequency",
                onSortModeChange: (mode) => this.handleSortModeChange(mode),
                customTagOrder: this.plugin.data.settings.sidebarCustomTagOrder || [],
                onCustomTagOrderChange: (order) => this.handleCustomTagOrderChange(order),
                filterBarHeight: this.plugin.data.settings.sidebarFilterBarHeight || 80,
                onFilterBarHeightChange: (height) => this.handleFilterBarHeightChange(height),
                onIgnoreTag: (tag) => this.handleIgnoreTag(tag),
                onShowTagContextMenu: (e, tag) => this.showTagContextMenu(e, tag),
                hideFilterBarHeader:
                    this.plugin.data.settings.hideNoteReviewSidebarFilters || false,
                selectedItem: this.selectedItem,
                commitLogs: this.commitLogs,
                onCommit: (path, message) => {
                    this.runAsync(this.handleCommit(path, message), "create timeline commit");
                },
                isTimelineOpen: isMobileDrawerView ? true : this.isTimelineOpen,
                onTimelineToggle: () => {
                    if (!isMobileDrawerView) {
                        this.handleTimelineToggle();
                    }
                },
                timelineHeight,
                onTimelineHeightChange: (height) => this.handleTimelineHeightChange(height),
                onNoteSelect: (item) => this.handleNoteSelect(item),
                onNoteDoubleClick: (item) => {
                    this.runAsync(this.handleNoteClick(item), "open note on double click");
                },
                onCommitContextMenu: (e, commitId) => this.handleCommitContextMenu(e, commitId),
                editingId: this.editingId,
                onEditCommit: (commitId, payload) => {
                    this.runAsync(this.handleEditCommit(commitId, payload), "edit timeline commit");
                },
                onStartEdit: (commitId) => this.handleStartEdit(commitId),
                onCancelEdit: () => this.handleCancelEdit(),
                onCommitSelect: (log) => {
                    this.runAsync(this.handleCommitSelect(log), "select timeline commit");
                },
                isLoading: this.isLoading,
                showScrollPercentage: this.plugin.data.settings.showScrollPercentage,
                enableDurationPrefixSyntax:
                    this.plugin.data.settings.timelineEnableDurationPrefixSyntax,
                showSidebarProgressIndicator:
                    this.plugin.data.settings.showSidebarProgressIndicator,
                progressRingColor: this.plugin.data.settings.sidebarProgressRingColor,
                progressIndicatorMode: this.plugin.data.settings.sidebarProgressIndicatorMode,
                progressRingDirection: this.plugin.data.settings.sidebarProgressRingDirection,
                filePathTooltipEnabled:
                    this.plugin.data.settings.sidebarFilePathTooltipEnabled ?? true,
                filePathTooltipDelayMs:
                    this.plugin.data.settings.sidebarFilePathTooltipDelayMs ?? 1000,
                isForegroundDrawerView,
            }),
        );
    }

    private registerTimelineScopeHotkeys(): void {
        if (!this.scope) return;
        this.unregisterTimelineScopeHotkeys();

        this.timelineScopeHandlers.push(
            this.scope.register(["Mod"], "Enter", (evt: KeyboardEvent) => {
                const activeEl = document.activeElement;
                const timelineTarget = this.getTimelineEventTarget(activeEl);
                if (timelineTarget) {
                    evt.preventDefault();
                    timelineTarget.dispatchEvent(
                        new CustomEvent("sr-ctrl-enter", { bubbles: false }),
                    );
                    return false;
                }
                return true;
            }),
        );

        const hotkeyActions: Array<{
            action: "bold" | "italic" | "strikethrough" | "highlight" | "inline-code" | "math";
            commandIds: string[];
            fallback: Array<{ modifiers: string[]; key: string }>;
        }> = [
            {
                action: "bold",
                commandIds: ["editor:toggle-bold"],
                fallback: [{ modifiers: ["Mod"], key: "b" }],
            },
            {
                action: "italic",
                commandIds: ["editor:toggle-italics", "editor:toggle-italic"],
                fallback: [{ modifiers: ["Mod"], key: "i" }],
            },
            {
                action: "strikethrough",
                commandIds: ["editor:toggle-strikethrough"],
                fallback: [{ modifiers: ["Mod", "Shift"], key: "s" }],
            },
            {
                action: "highlight",
                commandIds: ["editor:toggle-highlight"],
                fallback: [{ modifiers: ["Mod", "Shift"], key: "h" }],
            },
            {
                action: "inline-code",
                commandIds: ["editor:toggle-inline-code", "editor:toggle-code"],
                fallback: [{ modifiers: ["Mod"], key: "e" }],
            },
            {
                action: "math",
                commandIds: ["editor:insert-math-expression", "editor:insert-math"],
                fallback: [{ modifiers: ["Mod", "Shift"], key: "m" }],
            },
        ];

        for (const hotkeyAction of hotkeyActions) {
            const hotkeys = this.resolveTimelineHotkeys(
                hotkeyAction.commandIds,
                hotkeyAction.fallback,
            );
            for (const hotkey of hotkeys) {
                this.timelineScopeHandlers.push(
                    this.scope.register(
                        hotkey.modifiers as Modifier[],
                        hotkey.key,
                        (evt: KeyboardEvent) => {
                            const timelineTarget = this.getTimelineEventTarget(
                                document.activeElement,
                            );
                            if (!timelineTarget) {
                                return true;
                            }

                            evt.preventDefault();
                            timelineTarget.dispatchEvent(
                                new CustomEvent("sr-timeline-format", {
                                    bubbles: false,
                                    detail: { action: hotkeyAction.action },
                                }),
                            );
                            return false;
                        },
                    ),
                );
            }
        }
    }

    private unregisterTimelineScopeHotkeys(): void {
        if (!this.scope) return;
        for (const handler of this.timelineScopeHandlers) {
            this.scope.unregister(handler);
        }
        this.timelineScopeHandlers = [];
    }

    private resolveTimelineHotkeys(
        commandIds: readonly string[],
        fallback: ReadonlyArray<{ modifiers: string[]; key: string }>,
    ): Array<{ modifiers: string[]; key: string }> {
        const appWithCommands = this.app as typeof this.app & {
            commands?: {
                commands?: Record<
                    string,
                    { hotkeys?: Array<{ modifiers: string[]; key: string }> }
                >;
            };
            hotkeyManager?: {
                customKeys?: Record<string, Array<{ modifiers: string[]; key: string }>>;
            };
        };
        const commandsApi = appWithCommands.commands;
        const hotkeyManager = appWithCommands.hotkeyManager;
        const collected: Array<{ modifiers: string[]; key: string }> = [];
        const seen = new Set<string>();

        const pushHotkey = (hotkey: { modifiers: string[]; key: string } | null | undefined) => {
            if (!hotkey || !hotkey.key || !Array.isArray(hotkey.modifiers)) return;
            const signature = `${hotkey.modifiers.join("+")}::${hotkey.key}`;
            if (seen.has(signature)) return;
            seen.add(signature);
            collected.push({
                modifiers: hotkey.modifiers,
                key: hotkey.key,
            });
        };

        for (const commandId of commandIds) {
            const customKeys = hotkeyManager?.customKeys?.[commandId];
            if (Array.isArray(customKeys) && customKeys.length > 0) {
                customKeys.forEach(pushHotkey);
            }

            const defaultCommand = commandsApi?.commands?.[commandId];
            if (Array.isArray(defaultCommand?.hotkeys) && defaultCommand.hotkeys.length > 0) {
                defaultCommand.hotkeys.forEach(pushHotkey);
            }
        }

        if (collected.length === 0) {
            fallback.forEach(pushHotkey);
        }

        return collected;
    }

    private getTimelineEventTarget(activeEl: Element | null): HTMLElement | null {
        if (!(activeEl instanceof HTMLElement)) {
            return null;
        }

        if (!activeEl.closest(".sr-react-note-review-view")) {
            return null;
        }

        const editorHost = activeEl.closest(".sr-timeline-editor-host");
        if (editorHost instanceof HTMLElement) {
            return editorHost;
        }

        return activeEl instanceof HTMLTextAreaElement &&
            (activeEl.classList.contains("sr-timeline-textarea") ||
                activeEl.classList.contains("sr-timeline-edit-textarea"))
            ? activeEl
            : null;
    }

    // ==========================================
    // Note interactions
    // ==========================================

    /**
     * Open the selected note.
     */
    private isMarkdownLeaf(leaf: WorkspaceLeaf | null | undefined): leaf is WorkspaceLeaf {
        return leaf?.view instanceof MarkdownView;
    }

    private findOpenMarkdownLeafForFile(noteFile: TFile): WorkspaceLeaf | null {
        const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
        for (const leaf of markdownLeaves) {
            if (!this.isMarkdownLeaf(leaf)) {
                continue;
            }

            const markdownView = leaf.view as MarkdownView;
            if (markdownView.file?.path === noteFile.path) {
                return leaf;
            }
        }

        return null;
    }

    private resolveNoteNavigationLeaf(
        noteFile: TFile,
        options?: OpenNoteTargetOptions,
    ): WorkspaceLeaf {
        if (!options?.newTab) {
            const existingLeaf = this.findOpenMarkdownLeafForFile(noteFile);
            if (existingLeaf) {
                return existingLeaf;
            }

            const activeMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
            const activeMarkdownLeaf = activeMarkdownView?.leaf;
            if (this.isMarkdownLeaf(activeMarkdownLeaf) && activeMarkdownLeaf !== this.leaf) {
                return activeMarkdownLeaf;
            }

            const mostRecentLeaf = this.app.workspace.getMostRecentLeaf?.();
            if (this.isMarkdownLeaf(mostRecentLeaf) && mostRecentLeaf !== this.leaf) {
                return mostRecentLeaf;
            }

            const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
            for (const leaf of markdownLeaves) {
                if (this.isMarkdownLeaf(leaf) && leaf !== this.leaf) {
                    return leaf;
                }
            }
        }

        return this.app.workspace.getLeaf("tab");
    }

    private async handleNoteClick(
        item: NoteReviewItem,
        options?: OpenNoteTargetOptions,
    ): Promise<void> {
        // Remember the last selected deck for sidebar context.
        const pathParts = item.path.split("/");
        if (pathParts.length > 1) {
            this.plugin.lastSelectedReviewDeck = pathParts[0];
        }

        const targetLeaf = this.resolveNoteNavigationLeaf(item.noteFile, options);
        this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
        await targetLeaf.openFile(item.noteFile);
        this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
        this.app.workspace.revealLeaf?.(targetLeaf);

        // Show the floating review bar when the note is tracked.
        const repItem = this.plugin.noteReviewStore.getItem(item.path);
        if (repItem) {
            this.plugin.reviewFloatBar.display(repItem);
        }
    }

    /**
     * Open the note context menu.
     */
    private handleNoteContextMenu(item: NoteReviewItem, event: MouseEvent): void {
        const fileMenu = new Menu();

        // 1. Open actions
        fileMenu.addItem((menuItem) => {
            menuItem
                .setTitle(t("OPEN_IN_TAB"))
                .setIcon("file-plus")
                .onClick(() => {
                    this.runAsync(
                        this.app.workspace.getLeaf("tab").openFile(item.noteFile),
                        "open in tab",
                    );
                });
        });

        fileMenu.addItem((menuItem) => {
            menuItem
                .setTitle(t("OPEN_TO_RIGHT"))
                .setIcon("separator-vertical")
                .onClick(() => {
                    this.runAsync(
                        this.app.workspace.getLeaf("split").openFile(item.noteFile),
                        "open to right",
                    );
                });
        });

        fileMenu.addItem((menuItem) => {
            menuItem
                .setTitle(t("OPEN_IN_NEW_WINDOW"))
                .setIcon("scan-line")
                .onClick(() => {
                    this.runAsync(
                        this.app.workspace.openPopoutLeaf().openFile(item.noteFile),
                        "open in new window",
                    );
                });
        });

        fileMenu.addSeparator();

        // 2. File operations (Rename, Copy, etc makes sense here, but keeping it simple for now as requested, just making it look native)
        // User specifically asked for "System commands".
        // Let's add Rename as it's standard.
        fileMenu.addItem((menuItem) => {
            menuItem
                .setTitle(t("RENAME"))
                .setIcon("pencil")
                .onClick(() => {
                    const fileManager = this.app.fileManager as typeof this.app.fileManager & {
                        promptForFileRename?: (file: TFile) => void;
                    };
                    fileManager.promptForFileRename?.(item.noteFile);
                });
        });

        fileMenu.addSeparator();

        // 3. Plugin items (trigger event so other plugins add here)
        this.app.workspace.trigger("file-menu", fileMenu, item.noteFile, "my-context-menu", null);

        fileMenu.addSeparator();

        // 4. Danger actions (Delete) at the very bottom
        fileMenu.addItem((menuItem) => {
            menuItem.setTitle(t("DELETE")).setIcon("trash");
            const warningMenuItem = menuItem as typeof menuItem & {
                setWarning?: () => void;
            };
            if (typeof warningMenuItem.setWarning === "function") {
                warningMenuItem.setWarning();
            }
            menuItem.onClick(() => {
                this.runAsync(
                    this.app.fileManager.trashFile(item.noteFile),
                    "trash note review file",
                );
            });
        });

        fileMenu.showAtPosition({
            x: event.pageX,
            y: event.pageY,
        });
    }

    /**
     * Add a dropped tag into the note frontmatter.
     */
    private async handleTagDrop(item: NoteReviewItem, tag: string): Promise<void> {
        const file = item.noteFile;
        if (!file) return;

        try {
            const content = await this.app.vault.read(file);

            if (item.tags && item.tags.includes(tag)) {
                new Notice(t("SIDEBAR_TAG_EXISTS", { tag }));
                return;
            }

            const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
            const match = content.match(frontmatterRegex);

            let newContent: string;

            if (match) {
                const frontmatter = match[1];
                const tagsMatch = frontmatter.match(/^tags:\s*(.*)$/m);

                if (tagsMatch) {
                    const existingTagsStr = tagsMatch[1].trim();
                    let newTagsStr: string;

                    if (existingTagsStr.startsWith("[")) {
                        newTagsStr = existingTagsStr.slice(0, -1) + `, ${tag}]`;
                    } else {
                        newTagsStr = existingTagsStr ? `${existingTagsStr}, ${tag}` : tag;
                    }

                    const newFrontmatter = frontmatter.replace(
                        /^tags:\s*.*$/m,
                        `tags: ${newTagsStr}`,
                    );
                    newContent = content.replace(frontmatterRegex, `---\n${newFrontmatter}\n---`);
                } else {
                    const newFrontmatter = frontmatter + `\ntags: [${tag}]`;
                    newContent = content.replace(frontmatterRegex, `---\n${newFrontmatter}\n---`);
                }
            } else {
                newContent = `---\ntags: [${tag}]\n---\n\n${content}`;
            }

            await this.app.vault.modify(file, newContent);
            new Notice(t("SIDEBAR_TAG_ADDED", { tag }));

            const metadataHandler = () => {
                this.app.metadataCache.off("resolved", metadataHandler);
                this.redraw();
            };
            this.app.metadataCache.on("resolved", metadataHandler);

            setTimeout(() => {
                this.app.metadataCache.off("resolved", metadataHandler);
                this.redraw();
            }, 100);
        } catch (error) {
            console.error(t("SIDEBAR_TAG_ADD_FAILED"), error);
            new Notice(t("SIDEBAR_TAG_ADD_FAILED"));
        }
    }

    /**
     * Update note priority.
     */
    private async handlePriorityChange(item: NoteReviewItem, newPriority: number): Promise<void> {
        const file = item.noteFile;
        if (!file) return;

        try {
            const noteItem = this.plugin.noteReviewStore.getItem(file.path);

            if (noteItem) {
                noteItem.priority = newPriority;
                await this.plugin.noteReviewStore.save();
                this.plugin.updateAndSortDueNotes();
                this.plugin.syncEvents.emit("note-review-updated");
            } else {
                new Notice(t("SIDEBAR_NOTE_DATA_NOT_FOUND"));
            }
        } catch (error) {
            console.error(t("SIDEBAR_PRIORITY_CHANGE_FAILED"), error);
            new Notice(t("SIDEBAR_PRIORITY_CHANGE_FAILED"));
        }
    }

    // ==========================================
    // Settings interactions
    // ==========================================

    private handleSortModeChange(mode: "a-z" | "frequency" | "custom"): void {
        this.plugin.data.settings.sidebarTagSortMode = mode;
        this.runAsync(this.plugin.savePluginData(), "save sidebar sort mode");
        this.redraw();
    }

    private handleCustomTagOrderChange(order: string[]): void {
        this.plugin.data.settings.sidebarCustomTagOrder = order;
        this.runAsync(this.plugin.savePluginData(), "save custom tag order");
        this.redraw();
    }

    private handleFilterBarHeightChange(height: number): void {
        this.plugin.data.settings.sidebarFilterBarHeight = height;
        this.runAsync(this.plugin.savePluginData(), "save filter bar height");
    }

    private handleIgnoreTag(tag: string): void {
        const ignoredTags = this.plugin.data.settings.sidebarIgnoredTags || [];
        if (!ignoredTags.includes(tag)) {
            ignoredTags.push(tag);
            this.plugin.data.settings.sidebarIgnoredTags = ignoredTags;
            this.runAsync(this.plugin.savePluginData(), "save ignored tags");
            new Notice(t("SIDEBAR_TAG_IGNORED", { tag }));
            this.redraw();
        }
    }

    private showTagContextMenu(e: React.MouseEvent, tag: string): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle(t("SIDEBAR_IGNORE_TAG"))
                .setIcon("eye-off")
                .onClick(() => {
                    this.handleIgnoreTag(tag);
                });
        });

        menu.showAtMouseEvent(e.nativeEvent);
    }

    // ==========================================
    // Timeline interactions
    // ==========================================

    /**
     * Select a note and load its timeline entries.
     */
    private handleNoteSelect(item: NoteReviewItem): void {
        this.setSelectedTimelineItem(item);

        // Auto-expand the timeline if the setting allows it.
        let persistOpenState: boolean | undefined;
        if (this.plugin.data.settings.autoExpandTimeline && !this.isTimelineOpen) {
            this.isTimelineOpen = true;
            persistOpenState = true;
        }

        this.persistTimelineUiState({
            selectedPath: item.path,
            isOpen: persistOpenState,
        });

        this.redraw();
    }

    /**
     * Save a new timeline entry.
     */
    private async handleCommit(path: string, message: string): Promise<void> {
        if (!this.commitStore) return;

        // Free users are limited to ten timeline entries per note.
        const existingCommits = this.commitStore.getCommits(path);
        if (existingCommits.length >= 10) {
            const hasAccess = await LicenseManager.getInstance(this.plugin).checkFeatureAccess(
                "Timeline",
            );
            if (!hasAccess) return;
        }

        const context = captureTimelineContext(this.app, path);
        await this.commitStore.addCommit(
            path,
            message,
            context.contextAnchor,
            context.scrollPercentage,
        );
        await this.applyManualTimelineDurationSchedule(path, message);
        this.commitLogs = this.commitStore.getCommits(path);
        this.redraw();
    }

    /**
     * Toggle the timeline panel.
     */
    private handleTimelineToggle(): void {
        this.isTimelineOpen = !this.isTimelineOpen;
        this.persistTimelineUiState({ isOpen: this.isTimelineOpen });
        this.redraw();
    }

    /**
     * Persist timeline height changes.
     */
    private handleTimelineHeightChange(height: number): void {
        this.timelineHeight = height;
        if (ReactNoteReviewView.hasInitializedPhoneDrawerTimelineHeightThisSession) {
            ReactNoteReviewView.phoneDrawerTimelineHeightThisSession = height;
        }
        this.persistTimelineUiState({ height });
    }

    /**
     * Open the context menu for a timeline entry.
     */
    private handleCommitContextMenu(e: React.MouseEvent, commitId: string): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle(t("SIDEBAR_EDIT_COMMIT"))
                .setIcon("pencil")
                .onClick(() => {
                    this.handleStartEdit(commitId);
                });
        });

        menu.addItem((item) => {
            item.setTitle(t("SIDEBAR_DELETE_COMMIT"))
                .setIcon("trash-2")
                .onClick(() => {
                    if (!this.commitStore || !this.selectedItem) return;
                    const selectedPath = this.selectedItem.path;
                    this.runAsync(
                        (async () => {
                            await this.commitStore.deleteCommit(selectedPath, commitId);
                            this.commitLogs = this.commitStore.getCommits(selectedPath);
                            this.redraw();
                            new Notice(t("SIDEBAR_COMMIT_DELETED"));
                        })(),
                        "delete timeline commit",
                    );
                });
        });

        menu.showAtMouseEvent(e.nativeEvent);
    }

    /**
     * Enter edit mode for a timeline entry.
     */
    private handleStartEdit(commitId: string): void {
        this.editingId = commitId;
        this.redraw();
    }

    /**
     * Cancel timeline entry editing.
     */
    private handleCancelEdit(): void {
        this.editingId = null;
        this.redraw();
    }

    /**
     * Jump back to the saved context for a timeline entry.
     */
    private async handleCommitSelect(log: ReviewCommitLog): Promise<void> {
        if (!log || !this.selectedItem) return;

        const file = this.app.vault.getAbstractFileByPath(this.selectedItem.path);
        if (!(file instanceof TFile)) return;

        // 1. Open the file if needed.
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);

        const view = leaf.view;
        if (view instanceof MarkdownView) {
            const editor = view.editor;
            const text = editor.getValue();

            // 2. Prefer context-anchor navigation for precise restoration.
            if (log.contextAnchor) {
                const match = ContextAnchorService.findBestMatch(text, log.contextAnchor);
                if (match) {
                    editor.setCursor({ line: match.line, ch: match.ch });
                    editor.scrollIntoView(
                        {
                            from: { line: match.line, ch: match.ch },
                            to: { line: match.line, ch: match.ch },
                        },
                        true,
                    );
                    return;
                }
            }

            // 3. Fall back to the saved normalized offset.
            if (log.scrollPercentage !== undefined) {
                const scrollInfo = editor.getScrollInfo
                    ? (editor.getScrollInfo() as {
                          top: number;
                          left: number;
                          height: number;
                          clientHeight: number;
                      })
                    : null;
                const scrollableEditor = editor as typeof editor & {
                    scrollTo?: (x: number, y: number) => void;
                };
                if (scrollInfo && scrollableEditor.scrollTo) {
                    const targetTop =
                        log.scrollPercentage * (scrollInfo.height - scrollInfo.clientHeight);
                    scrollableEditor.scrollTo(0, targetTop);
                }
                return;
            }

            new Notice(t("UNABLE_TO_LOCATE_CONTEXT"));
        }
    }

    /**
     * Save edits to an existing timeline entry.
     */
    private async handleEditCommit(
        commitId: string,
        payload: ReviewCommitEditPayload,
    ): Promise<void> {
        if (!this.commitStore || !this.selectedItem) return;
        await this.commitStore.editCommit(this.selectedItem.path, commitId, payload);
        if (payload.entryType === "manual") {
            await this.applyManualTimelineDurationSchedule(this.selectedItem.path, payload.message);
        }
        this.commitLogs = this.commitStore.getCommits(this.selectedItem.path);
        this.editingId = null;
        this.redraw();
    }

    private async applyManualTimelineDurationSchedule(
        notePath: string,
        message: string,
    ): Promise<boolean> {
        if (!this.plugin.data.settings.timelineEnableDurationPrefixSyntax) {
            return false;
        }

        const parsed = parseTimelineMessage(message);
        if (!parsed.durationPrefix) {
            return false;
        }

        let item = this.plugin.noteReviewStore.getItem(notePath);
        if (!item) {
            const abstractFile = this.app.vault.getAbstractFileByPath(notePath);
            if (!(abstractFile instanceof TFile) || abstractFile.extension !== "md") {
                return false;
            }

            const ignoreReason = this.plugin.getNoteReviewIgnoreReason(abstractFile);
            if (ignoreReason) {
                this.plugin.showNoteReviewIgnoreNotice(ignoreReason);
                return false;
            }

            this.plugin.clearFolderTrackingExclusion(notePath);
            const fileCache = this.app.metadataCache.getFileCache(abstractFile) ?? null;
            const fileTags = getAllTags(fileCache) ?? [];
            const deckName =
                Tags.getTagFromSettingTags(fileTags, this.plugin.data.settings.tagsToReview) ??
                DEFAULT_DECKNAME;
            item = this.plugin.noteReviewStore.ensureTracked(
                notePath,
                deckName,
                "manual",
                this.plugin.noteAlgorithm,
            );
        }

        item.applyManualTimelineSchedule(parsed.durationPrefix.totalDays);
        await this.plugin.noteReviewStore.save();

        this.plugin.reviewDecks = this.plugin.noteReviewStore.buildReviewDecks(this.app.vault);
        this.plugin.updateAndSortDueNotes();
        this.plugin.syncEvents.emit("note-review-updated");

        return true;
    }

    /**
     * Auto-select and expand the timeline when a reviewed file opens.
     */
    private handleFileOpen(file?: TFile | null): void {
        const data = reviewDecksToSidebarState(this.plugin);
        this.syncSidebarToPrimaryMarkdownNote(data, {
            requestReveal: true,
            source: `file-open:${file?.path ?? "unknown"}`,
        });
        this.redraw();
    }
}
