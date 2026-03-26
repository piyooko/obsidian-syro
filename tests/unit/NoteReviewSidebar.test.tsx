import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { NoteReviewSidebar } from "src/ui/components/NoteReviewSidebar";
import type { NoteReviewItem, NoteReviewSidebarState } from "src/ui/types/noteReview";
import type {
    SidebarProgressIndicatorMode,
    SidebarProgressRingDirection,
} from "src/settings";

jest.mock("obsidian", () => {
    const actualMoment = require("moment");
    const moment = (...args: unknown[]) => actualMoment(...args);

    Object.assign(moment, actualMoment);
    moment.locale = jest.fn(() => "en");

    return {
        Component: class Component {
            load() {}
            unload() {}
        },
        MarkdownRenderer: {
            render: jest.fn(async (_app: unknown, content: string, el: HTMLElement) => {
                el.textContent = content;
            }),
        },
        moment,
    };
});

jest.mock("src/ui/components/TimelineCodeMirror", () => ({
    TimelineCodeMirror: () => null,
}));

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
    (HTMLElement.prototype as HTMLElement & {
        setCssProps?: (props: Record<string, string>) => void;
    }).setCssProps = function setCssProps(props: Record<string, string>) {
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
    } = {},
) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
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
                onNoteClick: jest.fn(),
                onNoteContextMenu: jest.fn(),
                showSidebarProgressIndicator: options.showSidebarProgressIndicator,
                progressRingColor: options.progressRingColor,
                progressIndicatorMode: options.progressIndicatorMode,
                progressRingDirection: options.progressRingDirection,
                filePathTooltipEnabled: options.filePathTooltipEnabled,
                filePathTooltipDelayMs: options.filePathTooltipDelayMs,
            }),
        );
    });

    return {
        container,
        cleanup: () => {
            act(() => root.unmount());
            container.remove();
        },
    };
}

describe("NoteReviewSidebar", () => {
    afterEach(() => {
        document.body.innerHTML = "";
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
            expect(sidebar?.getAttribute("data-progress-ring-direction")).toBe(
                "counterclockwise",
            );
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

    it("shows the file path tooltip after the configured hover delay", () => {
        jest.useFakeTimers();
        const item = createItem({ path: "folder/example.md" });
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

            const tooltip = document.body.querySelector(".sr-note-path-tooltip") as HTMLElement | null;
            expect(tooltip).not.toBeNull();
            expect(tooltip?.textContent).toContain(item.path);
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
