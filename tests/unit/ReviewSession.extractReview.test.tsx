import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Component, TFile, type WorkspaceLeaf } from "obsidian";
import type SRPlugin from "src/main";
import { ExtractStore, type ExtractItem } from "src/dataStore/extractStore";
import { FlashcardReviewMode, type IFlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import { DEFAULT_SETTINGS } from "src/settings";
import { parseIrExtracts } from "src/util/irExtractParser";
import type { ExtractReviewContext } from "src/util/irExtractContext";
import { ReviewSession } from "src/ui/containers/ReviewSession";

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("framer-motion", () => {
    const React = require("react");
    const componentCache = new Map<string, React.ComponentType<Record<string, unknown>>>();

    const createMotionComponent = (tag: string) =>
        React.forwardRef(
            ({ children, ...props }: Record<string, unknown>, ref: React.Ref<Element>) => {
                const {
                    animate,
                    custom,
                    exit,
                    initial,
                    layout,
                    mode,
                    onAnimationComplete,
                    transition,
                    variants,
                    whileHover,
                    whileTap,
                    ...domProps
                } = props;
                return React.createElement(tag, { ...domProps, ref }, children);
            },
        );

    const getMotionComponent = (tag: string) => {
        if (!componentCache.has(tag)) {
            componentCache.set(tag, createMotionComponent(tag));
        }
        return componentCache.get(tag);
    };

    return {
        AnimatePresence: ({ children }: { children: React.ReactNode }) =>
            React.createElement(React.Fragment, null, children),
        motion: new Proxy(
            {},
            {
                get: (_target, prop: string) => getMotionComponent(prop),
            },
        ),
    };
});

function createTFile(path: string): TFile {
    const basename = path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
    return Object.assign(new TFile(), {
        path,
        basename,
        extension: "md",
        stat: { mtime: 1 },
    });
}

function createManualExtractContext(markdown: string, outerFrom: number, outerTo: number) {
    const openToken = "{{ir::";
    return {
        sourceFrom: 0,
        sourceTo: markdown.length,
        markdown,
        currentOuterFrom: outerFrom,
        currentOuterTo: outerTo,
        currentInnerFrom: outerFrom + openToken.length,
        currentInnerTo: outerTo - 2,
        currentOpenTokenFrom: outerFrom,
        currentOpenTokenTo: outerFrom + openToken.length,
        currentCloseTokenFrom: outerTo - 2,
        currentCloseTokenTo: outerTo,
    };
}

function createExtractItem(overrides: Partial<ExtractItem> = {}): ExtractItem {
    const sourceText = "before {{ir::target}} after";
    const match = parseIrExtracts(sourceText)[0];
    if (!match) {
        throw new Error("Expected test extract match");
    }

    return {
        id: 1,
        uuid: "ir_retry",
        aliases: [],
        sourcePath: "摘录测试.md",
        sourceAnchor: { ...match.anchor, ordinal: 0 },
        rawMarkdown: "target",
        memo: "",
        deckName: "摘录测试",
        sourceMode: "manual-ir",
        sliceRule: "manual-ir",
        priority: 5,
        nextReview: 0,
        timesReviewed: 0,
        timesCorrect: 0,
        errorStreak: 0,
        stage: "active",
        createdAt: 1,
        updatedAt: 1,
        data: { currentInterval: 1 },
        ...overrides,
    };
}

function createSequencer(): IFlashcardReviewSequencer {
    return {
        hasCurrentCard: false,
        currentCard: null,
        currentDeck: null,
        canUndo: false,
        getSessionDeckStats: jest.fn(() => ({
            newCount: 0,
            learningCount: 0,
            dueCount: 0,
        })),
        undoReview: jest.fn(),
        processReview: jest.fn(),
        untrackCurrentCard: jest.fn(() => Promise.resolve()),
    } as unknown as IFlashcardReviewSequencer;
}

function createPlugin(
    itemOrItems: ExtractItem | ExtractItem[],
    getExtractReviewContext: jest.Mock<Promise<ExtractReviewContext | null>, [string, string?]>,
    intervals: string[] = ["1d", "1d", "1d", "1d"],
): SRPlugin {
    const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
    const item = items[0];
    const file = createTFile(item.sourcePath);
    const extractStore = new ExtractStore(DEFAULT_SETTINGS, { extractsPath: "extracts.json" });
    for (const extract of items) {
        extractStore.upsertSnapshot({ item: extract });
    }

    return {
        data: {
            settings: {
                ...DEFAULT_SETTINGS,
                enableExtracts: true,
                showRuntimeDebugMessages: false,
            },
        },
        app: {
            vault: {
                getAbstractFileByPath: jest.fn(() => file),
                read: jest.fn(() => Promise.resolve("before {{ir::target}} after")),
            },
            metadataCache: {
                getFileCache: jest.fn(() => ({ headings: [] })),
            },
        },
        deckTree: null,
        remainingDeckTree: null,
        store: null,
        extractStore,
        getExtractReviewCandidates: jest.fn(() =>
            items.filter((candidate) => candidate.stage === "active"),
        ),
        getExtractReviewContext,
        getExtractReviewIntervals: jest.fn(() => intervals),
        getExtractReviewStats: jest.fn(() => ({
            newCount: items.filter(
                (candidate) =>
                    candidate.stage === "active" &&
                    (candidate.timesReviewed === 0 || candidate.nextReview === 0),
            ).length,
            dueCount: items.filter(
                (candidate) =>
                    candidate.stage === "active" &&
                    candidate.timesReviewed > 0 &&
                    candidate.nextReview !== 0,
            ).length,
            totalCount: items.filter((candidate) => candidate.stage === "active").length,
        })),
        graduateExtract: jest.fn((uuid: string) => {
            const current = extractStore.get(uuid);
            if (!current) {
                return Promise.resolve(null);
            }
            const graduated = { ...current, stage: "graduated" as const };
            extractStore.upsertSnapshot({ item: graduated });
            return Promise.resolve(graduated);
        }),
        undoExtractReviewAction: jest.fn(() => Promise.resolve(null)),
        syncEvents: {
            on: jest.fn(() => jest.fn()),
        },
        flushReviewPersistence: jest.fn(() => Promise.resolve()),
        savePluginData: jest.fn(() => Promise.resolve()),
        setSRViewInFocus: jest.fn(),
    } as unknown as SRPlugin;
}

async function flushEffects() {
    await act(async () => {
        await Promise.resolve();
    });
}

function renderExtractReviewSession(plugin: SRPlugin) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
        root.render(
            React.createElement(ReviewSession, {
                plugin,
                sequencer: createSequencer(),
                reviewMode: FlashcardReviewMode.Review,
                hostLeaf: { id: "leaf" } as unknown as WorkspaceLeaf,
                markdownOwner: new Component(),
                initialView: "review",
            }),
        );
    });

    return { container, root };
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
        candidate.textContent?.includes(label) || candidate.title.includes(label),
    );
    if (!(button instanceof HTMLButtonElement)) {
        throw new Error(`Expected button with label ${label}`);
    }
    return button;
}

function pressUndo() {
    act(() => {
        window.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "z",
                ctrlKey: true,
                bubbles: true,
            }),
        );
    });
}

test("extract review retries a missing prepared context instead of caching it", async () => {
    jest.useFakeTimers();
    const item = createExtractItem();
    const markdown = "before {{ir::target}} after";
    const context = createManualExtractContext(markdown, 7, 21);
    const getExtractReviewContext = jest
        .fn<Promise<ExtractReviewContext | null>, [string, string?]>()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(context);
    const plugin = createPlugin(item, getExtractReviewContext);
    const { root } = renderExtractReviewSession(plugin);

    try {
        await flushEffects();
        expect(getExtractReviewContext).toHaveBeenCalledTimes(1);

        act(() => {
            jest.advanceTimersByTime(250);
        });
        await flushEffects();
        await flushEffects();

        expect(getExtractReviewContext).toHaveBeenCalledTimes(2);
    } finally {
        act(() => root.unmount());
        jest.useRealTimers();
    }
});

test("extract review highlights reviewed extracts with nextReview zero as new", async () => {
    const item = createExtractItem({ timesReviewed: 1, nextReview: 0 });
    const markdown = "before {{ir::target}} after";
    const context = createManualExtractContext(markdown, 7, 21);
    const plugin = createPlugin(
        item,
        jest.fn<Promise<ExtractReviewContext | null>, [string, string?]>().mockResolvedValue(context),
    );
    const { container, root } = renderExtractReviewSession(plugin);

    try {
        await flushEffects();
        await flushEffects();

        const liveHeader = container.querySelector(".sr-card-header:not(.sr-card-header-measure)");
        expect(liveHeader?.querySelector(".sr-stat-badge.active")?.textContent).toContain("NEW");
    } finally {
        act(() => root.unmount());
    }
});

test("extract review does not highlight due when intervals are unavailable", async () => {
    const item = createExtractItem({ stage: "graduated", timesReviewed: 1, nextReview: Date.now() - 1 });
    const plugin = createPlugin(
        item,
        jest.fn<Promise<ExtractReviewContext | null>, [string, string?]>().mockResolvedValue(null),
        ["-", "-", "-", "-"],
    );
    const { container, root } = renderExtractReviewSession(plugin);

    try {
        await flushEffects();
        await flushEffects();

        const liveHeader = container.querySelector(".sr-card-header:not(.sr-card-header-measure)");
        expect(liveHeader?.querySelector(".sr-stat-badge.active") ?? null).toBeNull();
    } finally {
        act(() => root.unmount());
    }
});

test("extract graduate is pending until review exits", async () => {
    const first = createExtractItem({ uuid: "ir_first", rawMarkdown: "first" });
    const second = createExtractItem({ uuid: "ir_second", rawMarkdown: "second" });
    const contexts = new Map<string, ExtractReviewContext>([
        [first.uuid, createManualExtractContext("before {{ir::first}} after", 7, 20)],
        [second.uuid, createManualExtractContext("before {{ir::second}} after", 7, 21)],
    ]);
    const plugin = createPlugin(
        [first, second],
        jest.fn<Promise<ExtractReviewContext | null>, [string, string?]>((uuid) =>
            Promise.resolve(contexts.get(uuid) ?? null),
        ),
    );
    const { container, root } = renderExtractReviewSession(plugin);

    try {
        await flushEffects();
        await flushEffects();

        act(() => {
            findButton(container, "Graduate").click();
        });
        await flushEffects();
        await flushEffects();

        expect(plugin.graduateExtract).not.toHaveBeenCalled();
        expect(plugin.extractStore?.get(first.uuid)?.stage).toBe("active");
        expect(container.textContent).toContain("Marked for graduation");
        expect(container.textContent).toContain("second");

        act(() => {
            findButton(container, "Back").click();
        });
        await flushEffects();
        await flushEffects();

        expect(plugin.graduateExtract).toHaveBeenCalledWith(first.uuid, null);
    } finally {
        act(() => root.unmount());
    }
});

test("extract pending graduate can be undone without store undo", async () => {
    const first = createExtractItem({ uuid: "ir_first", rawMarkdown: "first" });
    const second = createExtractItem({ uuid: "ir_second", rawMarkdown: "second" });
    const contexts = new Map<string, ExtractReviewContext>([
        [first.uuid, createManualExtractContext("before {{ir::first}} after", 7, 20)],
        [second.uuid, createManualExtractContext("before {{ir::second}} after", 7, 21)],
    ]);
    const plugin = createPlugin(
        [first, second],
        jest.fn<Promise<ExtractReviewContext | null>, [string, string?]>((uuid) =>
            Promise.resolve(contexts.get(uuid) ?? null),
        ),
    );
    const { container, root } = renderExtractReviewSession(plugin);

    try {
        await flushEffects();
        await flushEffects();

        act(() => {
            findButton(container, "Graduate").click();
        });
        await flushEffects();
        pressUndo();
        await flushEffects();
        await flushEffects();

        expect(plugin.graduateExtract).not.toHaveBeenCalled();
        expect(plugin.undoExtractReviewAction).not.toHaveBeenCalled();
        expect(plugin.extractStore?.get(first.uuid)?.stage).toBe("active");
        expect(container.textContent).toContain("first");
    } finally {
        act(() => root.unmount());
    }
});

test("inactive extract is not retried for context", async () => {
    jest.useFakeTimers();
    const item = createExtractItem({ stage: "graduated" });
    const getExtractReviewContext = jest
        .fn<Promise<ExtractReviewContext | null>, [string, string?]>()
        .mockResolvedValue(null);
    const plugin = createPlugin(item, getExtractReviewContext);
    (plugin.getExtractReviewCandidates as jest.Mock).mockReturnValue([item]);
    const { root } = renderExtractReviewSession(plugin);

    try {
        await flushEffects();
        act(() => {
            jest.advanceTimersByTime(750);
        });
        await flushEffects();

        expect(getExtractReviewContext).not.toHaveBeenCalled();
    } finally {
        act(() => root.unmount());
        jest.useRealTimers();
    }
});
