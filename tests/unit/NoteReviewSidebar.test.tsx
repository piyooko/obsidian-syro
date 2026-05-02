import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
    calculateExtractQuoteTooltipPosition,
    NoteReviewSidebar,
} from "src/ui/components/NoteReviewSidebar";
import type { NoteReviewItem, NoteReviewSidebarState } from "src/ui/types/noteReview";
import type { SidebarProgressIndicatorMode, SidebarProgressRingDirection } from "src/settings";
import type { ReviewCommitLog } from "src/dataStore/reviewCommitStore";
import { MarkdownRenderer } from "obsidian";

jest.mock("obsidian");

jest.mock("src/ui/components/TimelineCodeMirror", () => ({
    TimelineCodeMirror: () => null,
}));

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let hoverTooltipCapability = true;

function setHoverTooltipCapability(enabled: boolean) {
    hoverTooltipCapability = enabled;
}

beforeAll(() => {
    (
        HTMLElement.prototype as HTMLElement & {
            setCssProps?: (props: Record<string, string>) => void;
        }
    ).setCssProps = function setCssProps(props: Record<string, string>) {
        for (const [key, value] of Object.entries(props)) {
            this.style.setProperty(key, value);
        }
    };

    const immediateRaf = ((callback: FrameRequestCallback) => {
        callback(0);
        return 0;
    }) as typeof window.requestAnimationFrame;
    window.requestAnimationFrame = immediateRaf;
    window.cancelAnimationFrame = jest.fn();

    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: jest.fn().mockImplementation((query: string) => ({
            matches: hoverTooltipCapability,
            media: query,
            onchange: null,
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            addListener: jest.fn(),
            removeListener: jest.fn(),
            dispatchEvent: jest.fn(),
        })),
    });
});

function createItem(overrides: Partial<NoteReviewItem> = {}): NoteReviewItem {
    const path = overrides.path ?? "notes/example.md";

    return {
        id: "note-1",
        title: "Example Note",
        priority: 5,
        path,
        noteFile: { path, basename: "Example Note" } as never,
        tags: ["alpha"],
        ...overrides,
    };
}

function renderSidebar(
    items: NoteReviewItem[],
    options: {
        showSidebarProgressIndicator?: boolean;
        progressRingColor?: string;
        progressIndicatorMode?: SidebarProgressIndicatorMode;
        progressRingDirection?: SidebarProgressRingDirection;
        filePathTooltipEnabled?: boolean;
        filePathTooltipDelayMs?: number;
        mountInMobileDrawer?: boolean;
        isForegroundDrawerView?: boolean;
        isTimelineOpen?: boolean;
        timelineHeight?: number;
        filterBarHeight?: number;
        onTimelineToggle?: jest.Mock;
        onPriorityChange?: jest.Mock;
        activeFilePath?: string;
        autoRevealTargetPath?: string;
        autoRevealRequestKey?: number;
        selectedItem?: NoteReviewItem | null;
        onNoteClick?: jest.Mock;
        onNoteSelect?: jest.Mock;
        commitLogs?: ReviewCommitLog[];
        onCommitContextMenu?: jest.Mock;
        onCommitSelect?: jest.Mock;
        onEditCommit?: jest.Mock;
        editingId?: string | null;
    } = {},
) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let drawerShell: HTMLDivElement | null = null;
    let drawerInner: HTMLDivElement | null = null;
    let drawerHeader: HTMLDivElement | null = null;
    let drawerTabContainer: HTMLDivElement | null = null;
    let activeTabContent: HTMLDivElement | null = null;
    let renderTarget: Element = container;

    if (options.mountInMobileDrawer) {
        drawerShell = document.createElement("div");
        drawerShell.className = "workspace-drawer mod-right mod-active";
        drawerInner = document.createElement("div");
        drawerInner.className = "workspace-drawer-inner";
        drawerHeader = document.createElement("div");
        drawerHeader.className = "workspace-drawer-header";
        drawerTabContainer = document.createElement("div");
        drawerTabContainer.className = "workspace-drawer-tab-container";
        activeTabContent = document.createElement("div");
        activeTabContent.className = "workspace-drawer-active-tab-content";
        drawerInner.append(drawerHeader, drawerTabContainer, activeTabContent);
        drawerShell.appendChild(drawerInner);
        container.appendChild(drawerShell);
        renderTarget = activeTabContent;
    }

    const root = createRoot(renderTarget);
    const data: NoteReviewSidebarState = {
        sections: [
            {
                id: "new",
                title: "New",
                count: items.length,
                color: "#4f46e5",
                items,
            },
        ],
        totalCount: items.length,
    };

    act(() => {
        root.render(
            React.createElement(NoteReviewSidebar, {
                app: {} as never,
                data,
                activeFilePath: options.activeFilePath,
                autoRevealTargetPath: options.autoRevealTargetPath,
                autoRevealRequestKey: options.autoRevealRequestKey,
                onNoteClick: options.onNoteClick ?? jest.fn(),
                onNoteContextMenu: jest.fn(),
                showSidebarProgressIndicator: options.showSidebarProgressIndicator,
                progressRingColor: options.progressRingColor,
                progressIndicatorMode: options.progressIndicatorMode,
                progressRingDirection: options.progressRingDirection,
                filePathTooltipEnabled: options.filePathTooltipEnabled,
                filePathTooltipDelayMs: options.filePathTooltipDelayMs,
                filterBarHeight: options.filterBarHeight,
                isForegroundDrawerView: options.isForegroundDrawerView,
                isTimelineOpen: options.isTimelineOpen,
                timelineHeight: options.timelineHeight,
                onTimelineToggle: options.onTimelineToggle,
                onPriorityChange: options.onPriorityChange,
                selectedItem: options.selectedItem,
                onNoteSelect: options.onNoteSelect,
                commitLogs: options.commitLogs,
                onCommitContextMenu: options.onCommitContextMenu,
                onCommitSelect: options.onCommitSelect,
                onEditCommit: options.onEditCommit,
                editingId: options.editingId,
            }),
        );
    });

    return {
        container,
        drawerShell,
        drawerInner,
        drawerHeader,
        drawerTabContainer,
        activeTabContent,
        cleanup: () => {
            act(() => root.unmount());
            container.remove();
        },
    };
}

describe("NoteReviewSidebar", () => {
    afterEach(() => {
        document.body.innerHTML = "";
        document.body.className = "";
        document.documentElement.className = "";
        setHoverTooltipCapability(true);
    });

    it("renders a progress arc and keeps the ring before the tag text", () => {
        const view = renderSidebar([createItem({ lastScrollPercentage: 0.34 })]);

        try {
            const metaRow = view.container.querySelector(".sr-new-item-meta-row");
            const ring = metaRow?.firstElementChild as HTMLElement | null;
            const tag = metaRow?.lastElementChild as HTMLElement | null;

            expect(ring).not.toBeNull();
            expect(ring?.classList.contains("sr-new-item-progress-ring")).toBe(true);
            expect(ring?.getAttribute("title")).toBe("34%");
            expect(tag?.classList.contains("sr-new-item-tag")).toBe(true);
            expect(ring?.querySelector(".sr-new-item-progress-ring__value")).not.toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("renders empty rings for zero or missing progress", () => {
        const view = renderSidebar([
            createItem({ id: "note-1", path: "notes/zero.md", lastScrollPercentage: 0 }),
            createItem({ id: "note-2", path: "notes/empty.md", lastScrollPercentage: undefined }),
        ]);

        try {
            const rings = Array.from(
                view.container.querySelectorAll<HTMLElement>(".sr-new-item-progress-ring"),
            );

            expect(rings).toHaveLength(2);
            expect(rings.map((ring) => ring.getAttribute("title"))).toEqual(["0%", "0%"]);
            expect(
                view.container.querySelectorAll(".sr-new-item-progress-ring__value"),
            ).toHaveLength(0);
        } finally {
            view.cleanup();
        }
    });

    it("applies a custom progress ring color through the sidebar root style", () => {
        const view = renderSidebar([createItem({ lastScrollPercentage: 0.5 })], {
            progressRingColor: "#118833",
        });

        try {
            const sidebar = view.container.querySelector(".sr-note-sidebar") as HTMLElement | null;
            expect(sidebar?.style.getPropertyValue("--sr-sidebar-progress-ring-color")).toBe(
                "#118833",
            );
        } finally {
            view.cleanup();
        }
    });

    it("renders counterclockwise rings from the top toward the left", () => {
        const view = renderSidebar([createItem({ lastScrollPercentage: 0.5 })], {
            progressRingDirection: "counterclockwise",
        });

        try {
            const valuePath = view.container.querySelector(
                ".sr-new-item-progress-ring__value",
            ) as SVGPathElement | null;
            expect(valuePath?.getAttribute("d")).toContain("A 6 6 0 0 0 7 13");
        } finally {
            view.cleanup();
        }
    });

    it("renders counterclockwise rings from the top toward the left by default", () => {
        const view = renderSidebar([createItem({ lastScrollPercentage: 0.5 })]);

        try {
            const valuePath = view.container.querySelector(
                ".sr-new-item-progress-ring__value",
            ) as SVGPathElement | null;
            expect(valuePath?.getAttribute("d")).toContain("A 6 6 0 0 0 7 13");
            const sidebar = view.container.querySelector(".sr-note-sidebar") as HTMLElement | null;
            expect(sidebar?.getAttribute("data-progress-ring-direction")).toBe("counterclockwise");
        } finally {
            view.cleanup();
        }
    });

    it("exposes the configured ring direction on the sidebar root", () => {
        const view = renderSidebar([createItem({ lastScrollPercentage: 0.5 })], {
            progressRingDirection: "counterclockwise",
        });

        try {
            const sidebar = view.container.querySelector(".sr-note-sidebar") as HTMLElement | null;
            expect(sidebar?.getAttribute("data-progress-ring-direction")).toBe("counterclockwise");
        } finally {
            view.cleanup();
        }
    });

    it("renders percentage text instead of a ring when percentage mode is enabled", () => {
        const view = renderSidebar([createItem({ lastScrollPercentage: 0.34 })], {
            progressIndicatorMode: "percentage",
        });

        try {
            const metaRow = view.container.querySelector(".sr-new-item-meta-row");
            const indicator = metaRow?.firstElementChild as HTMLElement | null;

            expect(indicator?.classList.contains("sr-new-item-progress-percentage")).toBe(true);
            expect(indicator?.textContent).toBe("34%");
            expect(view.container.querySelector(".sr-new-item-progress-ring")).toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("hides the progress indicator entirely when the sidebar setting disables it", () => {
        const view = renderSidebar([createItem({ lastScrollPercentage: 0.34 })], {
            showSidebarProgressIndicator: false,
            progressIndicatorMode: "percentage",
        });

        try {
            const metaRow = view.container.querySelector(".sr-new-item-meta-row");
            const firstChild = metaRow?.firstElementChild as HTMLElement | null;

            expect(view.container.querySelector(".sr-new-item-progress-ring")).toBeNull();
            expect(view.container.querySelector(".sr-new-item-progress-percentage")).toBeNull();
            expect(firstChild?.classList.contains("sr-new-item-tag")).toBe(true);
        } finally {
            view.cleanup();
        }
    });

    it("keeps mobile drawer detection but stops writing bottom-gap filler state", () => {
        const view = renderSidebar([createItem()], {
            mountInMobileDrawer: true,
            isForegroundDrawerView: true,
        });

        try {
            const sidebar = view.container.querySelector(".sr-note-sidebar") as HTMLElement | null;

            expect(sidebar?.classList.contains("sr-note-sidebar--mobile-drawer")).toBe(true);
            expect(
                view.drawerInner?.classList.contains("sr-note-sidebar--mobile-drawer-host"),
            ).toBe(true);
            expect(sidebar?.style.getPropertyValue("--sr-drawer-bottom-gap")).toBe("");
            expect(view.drawerInner?.style.getPropertyValue("--sr-drawer-bottom-gap")).toBe("");
        } finally {
            view.cleanup();
        }
    });

    it("forces the timeline open inside the mobile drawer and ignores collapse clicks", () => {
        const onTimelineToggle = jest.fn();
        const view = renderSidebar([createItem()], {
            mountInMobileDrawer: true,
            isForegroundDrawerView: true,
            isTimelineOpen: false,
            onTimelineToggle,
        });

        try {
            const timelineBody = view.container.querySelector(".sr-timeline-body");
            const timelineHeader = view.container.querySelector(
                ".sr-timeline-header",
            ) as HTMLElement | null;

            expect(timelineBody).not.toBeNull();
            expect(timelineHeader).not.toBeNull();

            act(() => {
                timelineHeader?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(onTimelineToggle).not.toHaveBeenCalled();
        } finally {
            view.cleanup();
        }
    });

    it("allows a shorter minimum timeline height in the mobile drawer", () => {
        const view = renderSidebar([createItem()], {
            mountInMobileDrawer: true,
            isForegroundDrawerView: true,
            isTimelineOpen: false,
            timelineHeight: 10,
        });

        try {
            const timelineContainer = view.container.querySelector(
                ".sr-timeline-container",
            ) as HTMLElement | null;

            expect(timelineContainer).not.toBeNull();
            expect(timelineContainer?.style.height).toBe("64px");
        } finally {
            view.cleanup();
        }
    });

    it("adds the phone mobile drawer class only on narrow mobile drawers", () => {
        document.body.classList.add("is-mobile");

        const view = renderSidebar([createItem()], {
            mountInMobileDrawer: true,
            isForegroundDrawerView: true,
        });

        try {
            const sidebar = view.container.querySelector(".sr-note-sidebar") as HTMLElement | null;
            const dividerHandle = view.container.querySelector(
                ".sr-resizable-divider .sr-divider-handle",
            );

            expect(sidebar?.classList.contains("sr-note-sidebar--mobile-drawer")).toBe(true);
            expect(sidebar?.classList.contains("sr-note-sidebar--phone-mobile-drawer")).toBe(true);
            expect(dividerHandle).not.toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("uses content-height filter bars with a bounded tag area on phone-sized mobile drawers", () => {
        document.body.classList.add("is-mobile");

        const view = renderSidebar(
            [
                createItem({
                    tags: ["alpha", "beta", "gamma", "delta", "epsilon"],
                }),
            ],
            {
                mountInMobileDrawer: true,
                isForegroundDrawerView: true,
                filterBarHeight: 160,
            },
        );

        try {
            const filterBar = view.container.querySelector(".sr-filter-bar") as HTMLElement | null;
            const tagScrollContainer = view.container.querySelector(
                ".sr-tag-scroll-container",
            ) as HTMLElement | null;

            expect(filterBar).not.toBeNull();
            expect(tagScrollContainer).not.toBeNull();
            expect(filterBar?.style.height).toBe("");
            expect(tagScrollContainer?.style.maxHeight).toBe("160px");
        } finally {
            view.cleanup();
        }
    });

    it("renders the phone drawer search controls inside a grouped search container", () => {
        document.body.classList.add("is-mobile");

        const view = renderSidebar([createItem()], {
            mountInMobileDrawer: true,
            isForegroundDrawerView: true,
        });

        try {
            const searchGroup = view.container.querySelector(".sr-filter-bar-search-group");
            const searchInput = searchGroup?.querySelector(".sr-tag-search-input");
            const header = view.container.querySelector(".sr-filter-bar-header");

            expect(header).not.toBeNull();
            expect(searchGroup).not.toBeNull();
            expect(searchInput).not.toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("keeps the phone drawer divider drag updating the bounded tag area height", () => {
        document.body.classList.add("is-mobile");

        const view = renderSidebar([createItem()], {
            mountInMobileDrawer: true,
            isForegroundDrawerView: true,
            filterBarHeight: 160,
        });

        try {
            const divider = view.container.querySelector(
                ".sr-resizable-divider",
            ) as HTMLElement | null;
            const tagScrollContainer = view.container.querySelector(
                ".sr-tag-scroll-container",
            ) as HTMLElement | null;

            expect(divider).not.toBeNull();
            expect(tagScrollContainer?.style.maxHeight).toBe("160px");

            act(() => {
                divider?.dispatchEvent(
                    new MouseEvent("mousedown", { bubbles: true, clientY: 100 }),
                );
                document.dispatchEvent(
                    new MouseEvent("mousemove", { bubbles: true, clientY: 120 }),
                );
                document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientY: 120 }));
            });

            expect(tagScrollContainer?.style.maxHeight).toBe("180px");
        } finally {
            view.cleanup();
        }
    });

    it("keeps fixed filter bar heights on tablet drawers", () => {
        document.body.classList.add("is-mobile", "is-tablet");

        const view = renderSidebar([createItem()], {
            mountInMobileDrawer: true,
            isForegroundDrawerView: true,
            filterBarHeight: 160,
        });

        try {
            const filterBar = view.container.querySelector(".sr-filter-bar") as HTMLElement | null;
            const tagScrollContainer = view.container.querySelector(
                ".sr-tag-scroll-container",
            ) as HTMLElement | null;

            expect(filterBar?.style.height).toBe("160px");
            expect(tagScrollContainer?.style.maxHeight).toBe("");
        } finally {
            view.cleanup();
        }
    });

    it("keeps the divider as a transparent hit area with only the handle rendered inline", () => {
        document.body.classList.add("is-mobile");

        const view = renderSidebar([createItem()], {
            mountInMobileDrawer: true,
            isForegroundDrawerView: true,
            filterBarHeight: 160,
        });

        try {
            const divider = view.container.querySelector(
                ".sr-resizable-divider",
            ) as HTMLElement | null;
            const dividerHandle = view.container.querySelector(
                ".sr-divider-handle",
            ) as HTMLElement | null;

            expect(divider).not.toBeNull();
            expect(dividerHandle).not.toBeNull();
            expect(divider?.childElementCount).toBe(1);
            expect(divider?.getAttribute("style")).toBeNull();
            expect(dividerHandle?.getAttribute("style")).toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("keeps tablet mobile drawers out of the phone-only compact mode", () => {
        document.body.classList.add("is-mobile", "is-tablet");

        const view = renderSidebar([createItem()], {
            mountInMobileDrawer: true,
            isForegroundDrawerView: true,
        });

        try {
            const sidebar = view.container.querySelector(".sr-note-sidebar") as HTMLElement | null;

            expect(sidebar?.classList.contains("sr-note-sidebar--mobile-drawer")).toBe(true);
            expect(sidebar?.classList.contains("sr-note-sidebar--phone-mobile-drawer")).toBe(false);
        } finally {
            view.cleanup();
        }
    });

    it("uses tap-to-select before opening notes on phone-sized mobile drawers", () => {
        document.body.classList.add("is-mobile");

        const item = createItem();
        const onNoteClick = jest.fn();
        const onNoteSelect = jest.fn();
        const view = renderSidebar([item], {
            mountInMobileDrawer: true,
            isForegroundDrawerView: true,
            onNoteClick,
            onNoteSelect,
        });

        try {
            const noteItem = view.container.querySelector(".sr-new-item") as HTMLElement | null;
            expect(noteItem).not.toBeNull();

            act(() => {
                noteItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(onNoteSelect).toHaveBeenCalledTimes(1);
            expect(onNoteSelect).toHaveBeenCalledWith(item);
            expect(onNoteClick).not.toHaveBeenCalled();
        } finally {
            view.cleanup();
        }
    });

    it("opens the note on a second tap when the phone-sized mobile drawer item is already selected", () => {
        document.body.classList.add("is-mobile");

        const item = createItem();
        const onNoteClick = jest.fn();
        const onNoteSelect = jest.fn();
        const view = renderSidebar([item], {
            mountInMobileDrawer: true,
            isForegroundDrawerView: true,
            selectedItem: item,
            onNoteClick,
            onNoteSelect,
        });

        try {
            const noteItem = view.container.querySelector(".sr-new-item") as HTMLElement | null;
            expect(noteItem).not.toBeNull();
            expect(noteItem?.classList.contains("sr-new-item--active")).toBe(true);

            act(() => {
                noteItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(onNoteClick).toHaveBeenCalledTimes(1);
            expect(onNoteClick).toHaveBeenCalledWith(item);
            expect(onNoteSelect).not.toHaveBeenCalled();
        } finally {
            view.cleanup();
        }
    });

    it("scrolls the auto-follow target into view when it is outside the visible area", () => {
        const item = createItem();
        const scrollIntoView = jest.fn();
        const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
        const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

        HTMLElement.prototype.scrollIntoView = scrollIntoView;
        HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
            if (this.classList.contains("sr-note-sidebar__content")) {
                return {
                    top: 0,
                    bottom: 120,
                    left: 0,
                    right: 240,
                    width: 240,
                    height: 120,
                    x: 0,
                    y: 0,
                    toJSON: () => null,
                };
            }

            if (this.classList.contains("sr-new-item")) {
                return {
                    top: 220,
                    bottom: 280,
                    left: 0,
                    right: 240,
                    width: 240,
                    height: 60,
                    x: 0,
                    y: 220,
                    toJSON: () => null,
                };
            }

            return originalGetBoundingClientRect.call(this);
        };

        const view = renderSidebar([item], {
            autoRevealTargetPath: item.path,
            autoRevealRequestKey: 1,
        });

        try {
            expect(scrollIntoView).toHaveBeenCalledTimes(1);
            expect(scrollIntoView).toHaveBeenCalledWith({
                behavior: "smooth",
                block: "center",
                inline: "nearest",
            });
        } finally {
            HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
            HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
            view.cleanup();
        }
    });

    it("skips auto-scroll when the followed note is already visible", () => {
        const item = createItem();
        const scrollIntoView = jest.fn();
        const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
        const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

        HTMLElement.prototype.scrollIntoView = scrollIntoView;
        HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
            if (this.classList.contains("sr-note-sidebar__content")) {
                return {
                    top: 0,
                    bottom: 300,
                    left: 0,
                    right: 240,
                    width: 240,
                    height: 300,
                    x: 0,
                    y: 0,
                    toJSON: () => null,
                };
            }

            if (this.classList.contains("sr-new-item")) {
                return {
                    top: 80,
                    bottom: 140,
                    left: 0,
                    right: 240,
                    width: 240,
                    height: 60,
                    x: 0,
                    y: 80,
                    toJSON: () => null,
                };
            }

            return originalGetBoundingClientRect.call(this);
        };

        const view = renderSidebar([item], {
            mountInMobileDrawer: true,
            isForegroundDrawerView: true,
            selectedItem: item,
            autoRevealTargetPath: item.path,
            autoRevealRequestKey: 1,
        });

        try {
            const timelineBody = view.container.querySelector(".sr-timeline-body");
            expect(timelineBody).not.toBeNull();
            expect(scrollIntoView).not.toHaveBeenCalled();
        } finally {
            HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
            HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
            view.cleanup();
        }
    });

    it("keeps single-tap open behavior for tablet mobile drawers", () => {
        document.body.classList.add("is-mobile", "is-tablet");

        const item = createItem();
        const onNoteClick = jest.fn();
        const onNoteSelect = jest.fn();
        const view = renderSidebar([item], {
            mountInMobileDrawer: true,
            isForegroundDrawerView: true,
            onNoteClick,
            onNoteSelect,
        });

        try {
            const noteItem = view.container.querySelector(".sr-new-item") as HTMLElement | null;
            expect(noteItem).not.toBeNull();

            act(() => {
                noteItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(onNoteSelect).toHaveBeenCalledTimes(1);
            expect(onNoteClick).toHaveBeenCalledTimes(1);
        } finally {
            view.cleanup();
        }
    });

    it("renders extract timeline entries as quote and memo blocks", () => {
        const item = createItem();
        const view = renderSidebar([item], {
            selectedItem: item,
            isTimelineOpen: true,
            commitLogs: [
                {
                    id: "extract:ir_1",
                    message: "memo body",
                    timestamp: 1,
                    entryType: "extract",
                    extract: {
                        originUuid: "ir_1",
                        quoteText: "### **quoted** source",
                        memoText: "memo `body`",
                        sourcePath: item.path,
                        sourceAnchor: { start: 0, end: 12, ordinal: 0 },
                        sourceMode: "manual-ir",
                        extractCreatedAt: 1,
                    },
                },
            ],
        });

        try {
            const quote = view.container.querySelector(".sr-quote-block");
            const memo = view.container.querySelector(".sr-memo-text");
            const entry = view.container.querySelector(".sr-timeline-entry");

            expect(quote?.textContent).toBe("\\### **quoted** source");
            expect(memo?.textContent).toBe("memo `body`");
            expect(MarkdownRenderer.render).toHaveBeenCalledWith(
                expect.anything(),
                "\\### **quoted** source",
                quote,
                "",
                expect.anything(),
            );
            expect(MarkdownRenderer.render).toHaveBeenCalledWith(
                expect.anything(),
                "memo `body`",
                memo,
                "",
                expect.anything(),
            );
            expect(memo?.getAttribute("title")).toBeNull();
            expect(entry?.classList.contains("is-extract")).toBe(true);
            expect(quote?.classList.contains("sr-timeline-extract-part")).toBe(true);
            expect(memo?.classList.contains("sr-timeline-extract-part")).toBe(true);
        } finally {
            view.cleanup();
        }
    });

    it("shows extract quote tooltips above the quote after a two second hover", () => {
        jest.useFakeTimers();
        const item = createItem();
        const view = renderSidebar([item], {
            selectedItem: item,
            isTimelineOpen: true,
            commitLogs: [
                {
                    id: "extract:ir_1",
                    message: "memo body",
                    timestamp: 1,
                    entryType: "extract",
                    extract: {
                        originUuid: "ir_1",
                        quoteText: "quoted source",
                        memoText: "memo body",
                        memoEditedAt: Date.now() - 60 * 1000,
                        sourcePath: item.path,
                        sourceAnchor: { start: 0, end: 12, ordinal: 0 },
                        sourceMode: "manual-ir",
                        extractCreatedAt: 1,
                    },
                },
            ],
        });

        try {
            const quote = view.container.querySelector(".sr-quote-block") as HTMLElement | null;
            expect(quote).not.toBeNull();
            Object.defineProperty(quote, "offsetWidth", { configurable: true, value: 160 });
            Object.defineProperty(quote, "offsetHeight", { configurable: true, value: 34 });
            quote!.getBoundingClientRect = () =>
                ({
                    left: 40,
                    right: 200,
                    top: 120,
                    bottom: 154,
                    width: 160,
                    height: 34,
                    x: 40,
                    y: 120,
                    toJSON: () => ({}),
                }) as DOMRect;

            act(() => {
                quote?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
            });
            expect(document.body.querySelector(".sr-extract-quote-tooltip")).toBeNull();

            act(() => {
                jest.advanceTimersByTime(1999);
            });
            expect(document.body.querySelector(".sr-extract-quote-tooltip")).toBeNull();

            act(() => {
                jest.advanceTimersByTime(1);
            });

            const tooltip = document.body.querySelector(
                ".sr-extract-quote-tooltip",
            ) as HTMLElement | null;
            expect(tooltip?.textContent).toBe("quoted source");
            expect(tooltip?.classList.contains("is-above")).toBe(true);
        } finally {
            view.cleanup();
            document.body.querySelector(".sr-extract-quote-tooltip")?.remove();
            jest.useRealTimers();
        }
    });

    it("calculates extract quote tooltip placement above the quote without covering it", () => {
        const anchorRect = {
            left: 40,
            right: 360,
            top: 90,
            bottom: 138,
            width: 320,
            height: 48,
            x: 40,
            y: 90,
            toJSON: () => ({}),
        } as DOMRect;

        const position = calculateExtractQuoteTooltipPosition({
            anchorRect,
            tooltipWidth: 500,
            tooltipHeight: 180,
            viewportWidth: 1024,
            viewportHeight: 768,
        });

        expect(position.placement).toBe("above");
        expect(position.top).toBe(12);
        expect(position.maxHeight).toBe(68);
        expect(position.top + (position.maxHeight ?? 180)).toBeLessThanOrEqual(80);
    });

    it("passes extract ids through timeline context menu and click handlers", () => {
        const item = createItem();
        const onCommitContextMenu = jest.fn();
        const onCommitSelect = jest.fn();
        const extractLog: ReviewCommitLog = {
            id: "extract-preview:ir_1",
            message: "",
            timestamp: 1,
            entryType: "extract",
            isExtractPreview: true,
            extract: {
                originUuid: "ir_1",
                quoteText: "quoted source",
                memoText: "",
                sourcePath: item.path,
                sourceAnchor: { start: 0, end: 12, ordinal: 0 },
                sourceMode: "manual-ir",
                extractCreatedAt: 1,
            },
        };
        const view = renderSidebar([item], {
            selectedItem: item,
            isTimelineOpen: true,
            commitLogs: [extractLog],
            onCommitContextMenu,
            onCommitSelect,
        });

        try {
            const entry = view.container.querySelector(".sr-timeline-entry") as HTMLElement | null;
            expect(entry).not.toBeNull();

            act(() => {
                entry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });
            expect(onCommitSelect).toHaveBeenCalledWith(expect.objectContaining({ id: extractLog.id }));

            act(() => {
                entry?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
            });
            expect(onCommitContextMenu).toHaveBeenCalledWith(
                expect.any(Object),
                "extract-preview:ir_1",
            );
        } finally {
            view.cleanup();
        }
    });

    it("only edits the memo field for extract timeline entries", () => {
        const item = createItem();
        const onEditCommit = jest.fn();
        const view = renderSidebar([item], {
            selectedItem: item,
            isTimelineOpen: true,
            editingId: "extract:ir_1",
            onEditCommit,
            commitLogs: [
                {
                    id: "extract:ir_1",
                    message: "memo body",
                    timestamp: 1,
                    entryType: "extract",
                    extract: {
                        originUuid: "ir_1",
                        quoteText: "quoted source",
                        memoText: "memo body",
                        memoEditedAt: Date.now() - 60 * 1000,
                        sourcePath: item.path,
                        sourceAnchor: { start: 0, end: 12, ordinal: 0 },
                        sourceMode: "manual-ir",
                        extractCreatedAt: 1,
                    },
                },
            ],
        });

        try {
            expect(view.container.querySelector(".sr-quote-block")?.textContent).toBe(
                "quoted source",
            );
            expect(view.container.querySelector(".sr-timeline-time")?.textContent).toContain(
                "Edited at",
            );
            expect(view.container.querySelector(".sr-timeline-extract-edit-quote")).toBeNull();
            expect(view.container.querySelectorAll(".sr-timeline-extract-edit-field")).toHaveLength(
                1,
            );
            expect(
                (view.container.querySelector(
                    ".sr-timeline-extract-edit-memo",
                ) as HTMLTextAreaElement | null)?.value,
            ).toBe("memo body");
        } finally {
            view.cleanup();
        }
    });

    it("does not save extract memo edit when focus moves into the memo textarea", () => {
        jest.useFakeTimers();
        const item = createItem();
        const onEditCommit = jest.fn();
        const view = renderSidebar([item], {
            selectedItem: item,
            isTimelineOpen: true,
            editingId: "extract:ir_1",
            onEditCommit,
            commitLogs: [
                {
                    id: "extract:ir_1",
                    message: "memo body",
                    timestamp: 1,
                    entryType: "extract",
                    extract: {
                        originUuid: "ir_1",
                        quoteText: "quoted source",
                        memoText: "memo body",
                        sourcePath: item.path,
                        sourceAnchor: { start: 0, end: 12, ordinal: 0 },
                        sourceMode: "manual-ir",
                        extractCreatedAt: 1,
                    },
                },
            ],
        });

        try {
            const editContainer = view.container.querySelector(
                ".sr-timeline-extract-edit",
            ) as HTMLElement | null;
            const textarea = view.container.querySelector(
                ".sr-timeline-extract-edit-memo",
            ) as HTMLTextAreaElement | null;
            expect(editContainer).not.toBeNull();
            expect(textarea).not.toBeNull();

            act(() => {
                editContainer?.dispatchEvent(
                    new FocusEvent("focusout", {
                        bubbles: true,
                        relatedTarget: null,
                    }),
                );
                textarea?.focus();
            });

            act(() => {
                jest.runOnlyPendingTimers();
            });

            expect(onEditCommit).not.toHaveBeenCalled();
        } finally {
            view.cleanup();
            jest.useRealTimers();
        }
    });

    it("keeps extract memo textarea clicks inside edit mode", () => {
        const item = createItem();
        const onCommitSelect = jest.fn();
        const onEditCommit = jest.fn();
        const view = renderSidebar([item], {
            selectedItem: item,
            isTimelineOpen: true,
            editingId: "extract:ir_1",
            onCommitSelect,
            onEditCommit,
            commitLogs: [
                {
                    id: "extract:ir_1",
                    message: "memo body",
                    timestamp: 1,
                    entryType: "extract",
                    extract: {
                        originUuid: "ir_1",
                        quoteText: "quoted source",
                        memoText: "memo body",
                        sourcePath: item.path,
                        sourceAnchor: { start: 0, end: 12, ordinal: 0 },
                        sourceMode: "manual-ir",
                        extractCreatedAt: 1,
                    },
                },
            ],
        });

        try {
            const textarea = view.container.querySelector(
                ".sr-timeline-extract-edit-memo",
            ) as HTMLTextAreaElement | null;
            expect(textarea).not.toBeNull();

            act(() => {
                textarea?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(onCommitSelect).not.toHaveBeenCalled();
            expect(onEditCommit).not.toHaveBeenCalled();
        } finally {
            view.cleanup();
        }
    });

    it("shows the file path tooltip after the configured hover delay", () => {
        jest.useFakeTimers();
        const item = createItem({ path: "folder/Example.Md" });
        const view = renderSidebar([item], {
            filePathTooltipEnabled: true,
            filePathTooltipDelayMs: 1000,
        });

        try {
            const noteItem = view.container.querySelector(".sr-new-item") as HTMLElement | null;
            expect(noteItem).not.toBeNull();

            act(() => {
                noteItem?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
            });

            expect(document.body.querySelector(".sr-note-path-tooltip")).toBeNull();

            act(() => {
                jest.advanceTimersByTime(999);
            });
            expect(document.body.querySelector(".sr-note-path-tooltip")).toBeNull();

            act(() => {
                jest.advanceTimersByTime(1);
            });

            const tooltip = document.body.querySelector(
                ".sr-note-path-tooltip",
            ) as HTMLElement | null;
            expect(tooltip).not.toBeNull();
            expect(tooltip?.textContent).toBe("folder/Example");
        } finally {
            view.cleanup();
            jest.useRealTimers();
        }
    });

    it("does not show the file path tooltip without hover-capable pointer support", () => {
        jest.useFakeTimers();
        setHoverTooltipCapability(false);

        const item = createItem({ path: "folder/touch-only.md" });
        const view = renderSidebar([item], {
            filePathTooltipEnabled: true,
            filePathTooltipDelayMs: 1000,
        });

        try {
            const noteItem = view.container.querySelector(".sr-new-item") as HTMLElement | null;
            expect(noteItem).not.toBeNull();

            act(() => {
                noteItem?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
                jest.advanceTimersByTime(1000);
            });

            expect(document.body.querySelector(".sr-note-path-tooltip")).toBeNull();
        } finally {
            view.cleanup();
            jest.useRealTimers();
        }
    });

    it("does not show the file path tooltip on focus without mouse hover", () => {
        jest.useFakeTimers();

        const item = createItem({ path: "folder/focus.md" });
        const view = renderSidebar([item], {
            filePathTooltipEnabled: true,
            filePathTooltipDelayMs: 1000,
        });

        try {
            const noteItem = view.container.querySelector(".sr-new-item") as HTMLElement | null;
            expect(noteItem).not.toBeNull();

            act(() => {
                noteItem?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
                jest.advanceTimersByTime(1000);
            });

            expect(document.body.querySelector(".sr-note-path-tooltip")).toBeNull();
        } finally {
            view.cleanup();
            jest.useRealTimers();
        }
    });

    it("does not show the file path tooltip when the setting is disabled", () => {
        jest.useFakeTimers();
        const view = renderSidebar([createItem({ path: "folder/hidden.md" })], {
            filePathTooltipEnabled: false,
            filePathTooltipDelayMs: 1000,
        });

        try {
            const noteItem = view.container.querySelector(".sr-new-item") as HTMLElement | null;

            act(() => {
                noteItem?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
                jest.advanceTimersByTime(1000);
            });

            expect(document.body.querySelector(".sr-note-path-tooltip")).toBeNull();
        } finally {
            view.cleanup();
            jest.useRealTimers();
        }
    });
});
