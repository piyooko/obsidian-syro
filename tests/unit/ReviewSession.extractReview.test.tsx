import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { Component, TFile, type WorkspaceLeaf } from "obsidian";
import { Card } from "src/Card";
import { CardListType, Deck } from "src/Deck";
import { CardQueue, RepetitionItem, RPITEMTYPE } from "src/dataStore/repetitionItem";
import type SRPlugin from "src/main";
import { ExtractStore, type ExtractItem } from "src/dataStore/extractStore";
import { FlashcardReviewMode, type IFlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import { CardType } from "src/Question";
import { DEFAULT_SETTINGS, type ReviewQueueMode } from "src/settings";
import { parseIrExtracts } from "src/util/irExtractParser";
import type { ExtractReviewContext } from "src/util/irExtractContext";
import { resolveActiveReviewItemByQueue, ReviewSession } from "src/ui/containers/ReviewSession";

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
        setDeckTree: jest.fn(),
        setCurrentDeck: jest.fn(),
    } as unknown as IFlashcardReviewSequencer;
}

function createRenderableCard(id: number, front: string): Card {
    return new Card({
        Id: id,
        cardIdx: 0,
        front,
        back: "back",
        question: {
            questionText: {
                actualQuestion: `${front}::back`,
            },
            questionType: CardType.SingleLineBasic,
            lineNo: 0,
            cards: [],
            topicPathList: {
                list: [],
            },
            questionContext: [],
            note: {
                file: {
                    basename: "card",
                    path: "card.md",
                },
            },
        } as never,
    });
}

function createTestSyncEvents() {
    const listeners = new Map<string, Set<() => void>>();
    return {
        on: jest.fn((eventName: string, listener: () => void) => {
            let eventListeners = listeners.get(eventName);
            if (!eventListeners) {
                eventListeners = new Set();
                listeners.set(eventName, eventListeners);
            }
            eventListeners.add(listener);
            return () => {
                eventListeners?.delete(listener);
            };
        }),
        emit: jest.fn((eventName: string) => {
            for (const listener of listeners.get(eventName) ?? []) {
                listener();
            }
        }),
    };
}

function createPlugin(
    itemOrItems: ExtractItem | ExtractItem[],
    getExtractReviewContext: jest.Mock<Promise<ExtractReviewContext | null>, [string, string?]>,
    intervals: string[] = ["1d", "1d", "1d", "1d"],
    options: {
        reviewQueueMode?: ReviewQueueMode;
        interleaveFlashcardCount?: number;
    } = {},
): SRPlugin {
    const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
    const item = items[0];
    const file = createTFile(item.sourcePath);
    const extractStore = new ExtractStore(DEFAULT_SETTINGS, { extractsPath: "extracts.json" });
    for (const extract of items) {
        extractStore.upsertSnapshot({ item: extract });
    }
    const syncEvents = createTestSyncEvents();

    return {
        data: {
            settings: {
                ...DEFAULT_SETTINGS,
                enableExtracts: true,
                showRuntimeDebugMessages: false,
                deckOptionsPresets: [
                    {
                        ...DEFAULT_SETTINGS.deckOptionsPresets[0],
                        reviewQueueMode: options.reviewQueueMode ?? "extract-first",
                        interleaveFlashcardCount: options.interleaveFlashcardCount ?? 4,
                    },
                ],
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
            extractStore.list().filter((candidate) => candidate.stage === "active"),
        ),
        getExtractReviewContext,
        updateExtractContextMarkdown: jest.fn(() => Promise.resolve(item)),
        getExtractReviewIntervals: jest.fn(() => intervals),
        getExtractReviewStats: jest.fn(() => ({
            newCount: extractStore.list().filter(
                (candidate) =>
                    candidate.stage === "active" &&
                    (candidate.timesReviewed === 0 || candidate.nextReview === 0),
            ).length,
            dueCount: extractStore.list().filter(
                (candidate) =>
                    candidate.stage === "active" &&
                    candidate.timesReviewed > 0 &&
                    candidate.nextReview !== 0,
            ).length,
            totalCount: extractStore.list().filter((candidate) => candidate.stage === "active")
                .length,
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
        updateExtractMemo: jest.fn((uuid: string, memo: string) => {
            const updated = extractStore.setMemo(uuid, memo);
            return Promise.resolve(updated);
        }),
        syncEvents,
        flushReviewPersistence: jest.fn(() => Promise.resolve()),
        loadDailyDeckStats: jest.fn(),
        getDailyCounts: jest.fn(() => ({ new: 0, review: 0 })),
        savePluginData: jest.fn(() => Promise.resolve()),
        setSRViewInFocus: jest.fn(),
        setTimelineReviewCardPath: jest.fn(),
        getTimelineReviewCardPath: jest.fn(() => null),
    } as unknown as SRPlugin;
}

async function flushEffects() {
    await act(async () => {
        await Promise.resolve();
    });
}

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
}

function renderExtractReviewSession(
    plugin: SRPlugin,
    hostLeaf: WorkspaceLeaf = { id: "leaf" } as unknown as WorkspaceLeaf,
    options: {
        sequencer?: IFlashcardReviewSequencer;
        initialTargetDeckPath?: string;
    } = {},
) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
        root.render(
            React.createElement(ReviewSession, {
                plugin,
                sequencer: options.sequencer ?? createSequencer(),
                reviewMode: FlashcardReviewMode.Review,
                hostLeaf,
                markdownOwner: new Component(),
                initialView: "review",
                initialTargetDeckPath: options.initialTargetDeckPath,
            }),
        );
    });

    return { container, root };
}

function getLiveHeaderNewCount(container: HTMLElement): number {
    const liveHeader = container.querySelector(".sr-card-header:not(.sr-card-header-measure)");
    const badges = Array.from(liveHeader?.querySelectorAll(".sr-stat-badge") ?? []);
    const newBadge = badges.find((badge) => badge.querySelector(".sr-stat-label")?.textContent === "NEW");
    const count = newBadge?.querySelector(".sr-stat-count")?.textContent ?? "";
    return Number(count);
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
        candidate.textContent?.includes(label) ||
        candidate.getAttribute("aria-label")?.includes(label),
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

test("extract review displays and saves the active extract memo", async () => {
    jest.useFakeTimers();
    const item = createExtractItem({ memo: "已有摘录备注" });
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

        const preview = container.querySelector<HTMLElement>(".text-preview");
        const textarea = container.querySelector<HTMLTextAreaElement>(
            ".corner-pill-wrapper textarea",
        );
        expect(preview?.textContent).toBe("已有摘录备注");
        expect(textarea?.value).toBe("已有摘录备注");

        act(() => {
            if (textarea) {
                textarea.value = "复习时更新的备注";
                textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
            }
        });

        expect(plugin.updateExtractMemo).not.toHaveBeenCalled();

        act(() => {
            jest.advanceTimersByTime(700);
        });
        await flushEffects();

        expect(plugin.updateExtractMemo).toHaveBeenCalledWith(item.uuid, "复习时更新的备注");
    } finally {
        act(() => root.unmount());
        jest.useRealTimers();
    }
});

test("extract review flushes pending memo before answering", async () => {
    jest.useFakeTimers();
    const item = createExtractItem({ memo: "旧备注" });
    const markdown = "before {{ir::target}} after";
    const context = createManualExtractContext(markdown, 7, 21);
    const plugin = createPlugin(
        item,
        jest.fn<Promise<ExtractReviewContext | null>, [string, string?]>().mockResolvedValue(context),
    );
    const reviewExtract = jest.fn(() => Promise.resolve(item));
    (plugin as SRPlugin & { reviewExtract: typeof reviewExtract }).reviewExtract = reviewExtract;
    const { container, root } = renderExtractReviewSession(plugin);

    try {
        await flushEffects();
        await flushEffects();

        const textarea = container.querySelector<HTMLTextAreaElement>(
            ".corner-pill-wrapper textarea",
        );
        act(() => {
            if (textarea) {
                textarea.value = "离开前保存";
                textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
            }
        });

        act(() => {
            findButton(container, "Again").click();
        });
        await flushEffects();

        expect(plugin.updateExtractMemo).toHaveBeenCalledWith(item.uuid, "离开前保存");
        expect(reviewExtract).toHaveBeenCalled();
    } finally {
        act(() => root.unmount());
        jest.useRealTimers();
    }
});

test("extract review keeps pending memo dirty after a failed autosave", async () => {
    jest.useFakeTimers();
    const item = createExtractItem({ memo: "旧备注" });
    const markdown = "before {{ir::target}} after";
    const context = createManualExtractContext(markdown, 7, 21);
    const plugin = createPlugin(
        item,
        jest.fn<Promise<ExtractReviewContext | null>, [string, string?]>().mockResolvedValue(context),
    );
    const updateExtractMemo = plugin.updateExtractMemo as jest.MockedFunction<
        (uuid: string, memo: string) => Promise<ExtractItem | null>
    >;
    updateExtractMemo.mockRejectedValueOnce(new Error("memo save failed"));
    updateExtractMemo.mockImplementationOnce((uuid: string, memo: string) => {
        const updated = plugin.extractStore?.setMemo(uuid, memo) ?? null;
        return Promise.resolve(updated);
    });
    const reviewExtract = jest.fn(() => Promise.resolve(item));
    (plugin as SRPlugin & { reviewExtract: typeof reviewExtract }).reviewExtract = reviewExtract;
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { container, root } = renderExtractReviewSession(plugin);

    try {
        await flushEffects();
        await flushEffects();

        const textarea = container.querySelector<HTMLTextAreaElement>(
            ".corner-pill-wrapper textarea",
        );
        act(() => {
            if (textarea) {
                textarea.value = "失败后仍待保存";
                textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
            }
        });

        act(() => {
            jest.advanceTimersByTime(700);
        });
        await flushEffects();

        expect(updateExtractMemo).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "[SR-Extract] Failed to save extract memo",
            expect.any(Error),
        );
        expect(textarea?.value).toBe("失败后仍待保存");

        act(() => {
            findButton(container, "Again").click();
        });
        await flushEffects();

        expect(updateExtractMemo).toHaveBeenCalledTimes(2);
        expect(updateExtractMemo).toHaveBeenLastCalledWith(item.uuid, "失败后仍待保存");
    } finally {
        consoleErrorSpy.mockRestore();
        act(() => root.unmount());
        jest.useRealTimers();
    }
});

test("sync-complete refreshes active extract review card counters without returning to deck list", async () => {
    const item = createExtractItem({ deckName: "摘录测试" });
    const markdown = "before {{ir::target}} after";
    const context = createManualExtractContext(markdown, 7, 21);
    const plugin = createPlugin(
        item,
        jest.fn<Promise<ExtractReviewContext | null>, [string, string?]>().mockResolvedValue(context),
    );
    const rootDeck = new Deck("root", null);
    const extractDeck = new Deck("摘录测试", rootDeck);
    rootDeck.subdecks.push(extractDeck);
    plugin.remainingDeckTree = rootDeck;
    plugin.deckTree = rootDeck;

    let sessionStats = { newCount: 0, learningCount: 0, dueCount: 0 };
    const sequencer = {
        ...createSequencer(),
        getSessionDeckStats: jest.fn(() => sessionStats),
        setDeckTree: jest.fn((_fullDeckTree: Deck, isolatedDeckTree: Deck) => {
            sessionStats = {
                newCount: isolatedDeckTree.getCardCount(CardListType.NewCard, true),
                learningCount: isolatedDeckTree.getCardCount(CardListType.LearningCard, true),
                dueCount: isolatedDeckTree.getCardCount(CardListType.DueCard, true),
            };
        }),
        setCurrentDeck: jest.fn(),
    } as unknown as IFlashcardReviewSequencer;

    const { container, root } = renderExtractReviewSession(
        plugin,
        { id: "leaf" } as unknown as WorkspaceLeaf,
        { sequencer, initialTargetDeckPath: "摘录测试" },
    );

    try {
        await flushEffects();
        await flushEffects();

        expect(getLiveHeaderNewCount(container)).toBe(1);

        extractDeck.newFlashcards.push(new Card({ Id: 42 }));

        await act(async () => {
            plugin.syncEvents.emit("sync-complete");
        });
        await flushEffects();

        expect(getLiveHeaderNewCount(container)).toBe(2);
    } finally {
        act(() => root.unmount());
    }
});

test("sync-complete refresh keeps newly added cards out of counters after daily new limit is reached", async () => {
    const item = createExtractItem({ deckName: "摘录测试" });
    const markdown = "before {{ir::target}} after";
    const context = createManualExtractContext(markdown, 7, 21);
    const plugin = createPlugin(
        item,
        jest.fn<Promise<ExtractReviewContext | null>, [string, string?]>().mockResolvedValue(context),
    );
    const rootDeck = new Deck("root", null);
    const extractDeck = new Deck("摘录测试", rootDeck);
    rootDeck.subdecks.push(extractDeck);
    plugin.remainingDeckTree = rootDeck;
    plugin.deckTree = rootDeck;
    (plugin.getDailyCounts as jest.Mock).mockReturnValue({ new: 20, review: 0 });

    let sessionStats = { newCount: 0, learningCount: 0, dueCount: 0 };
    const sequencer = {
        ...createSequencer(),
        getSessionDeckStats: jest.fn(() => sessionStats),
        setDeckTree: jest.fn((_fullDeckTree: Deck, isolatedDeckTree: Deck) => {
            sessionStats = {
                newCount: isolatedDeckTree.getCardCount(CardListType.NewCard, true),
                learningCount: isolatedDeckTree.getCardCount(CardListType.LearningCard, true),
                dueCount: isolatedDeckTree.getCardCount(CardListType.DueCard, true),
            };
        }),
        setCurrentDeck: jest.fn(),
    } as unknown as IFlashcardReviewSequencer;

    const { container, root } = renderExtractReviewSession(
        plugin,
        { id: "leaf" } as unknown as WorkspaceLeaf,
        { sequencer, initialTargetDeckPath: "摘录测试" },
    );

    try {
        await flushEffects();
        await flushEffects();

        expect(getLiveHeaderNewCount(container)).toBe(1);

        extractDeck.newFlashcards.push(new Card({ Id: 43 }));

        await act(async () => {
            plugin.syncEvents.emit("sync-complete");
        });
        await flushEffects();

        expect(getLiveHeaderNewCount(container)).toBe(1);
    } finally {
        act(() => root.unmount());
    }
});

test("inactive review leaf ignores global numeric review shortcuts", async () => {
    const item = createExtractItem();
    const markdown = "before {{ir::target}} after";
    const context = createManualExtractContext(markdown, 7, 21);
    const plugin = createPlugin(
        item,
        jest.fn<Promise<ExtractReviewContext | null>, [string, string?]>().mockResolvedValue(context),
    );
    const reviewExtract = jest.fn(() => Promise.resolve(item));
    (plugin as SRPlugin & { reviewExtract: typeof reviewExtract }).reviewExtract = reviewExtract;

    const hostLeaf = { id: "review-leaf" } as unknown as WorkspaceLeaf;
    const activeLeaf = { id: "note-leaf" } as unknown as WorkspaceLeaf;
    const getLeaf = jest.fn(() => hostLeaf);
    (plugin.app as unknown as {
        workspace: { activeLeaf: WorkspaceLeaf; getLeaf: (newLeaf?: false) => WorkspaceLeaf };
    }).workspace = {
        activeLeaf,
        getLeaf,
    };

    const { root } = renderExtractReviewSession(plugin, hostLeaf);

    try {
        await flushEffects();
        await flushEffects();

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "2" }));
        });
        await flushEffects();

        expect(reviewExtract).not.toHaveBeenCalled();
        expect(getLeaf).not.toHaveBeenCalled();
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

test("extract-first queue mode keeps a reviewable extract ahead of the current flashcard", async () => {
    const item = createExtractItem({ rawMarkdown: "extract first", priority: 8 });
    const markdown = "before {{ir::extract first}} after";
    const context = createManualExtractContext(markdown, 7, 28);
    const plugin = createPlugin(
        item,
        jest.fn<Promise<ExtractReviewContext | null>, [string, string?]>().mockResolvedValue(context),
        ["1d", "1d", "1d", "1d"],
        { reviewQueueMode: "extract-first" },
    );
    const sequencer = {
        ...createSequencer(),
        hasCurrentCard: true,
        currentCard: createRenderableCard(101, "card first"),
    } as unknown as IFlashcardReviewSequencer;
    const { container, root } = renderExtractReviewSession(plugin, undefined, { sequencer });

    try {
        await flushEffects();
        await flushEffects();

        expect(container.textContent).toContain("extract first");
    } finally {
        act(() => root.unmount());
    }
});

test("flashcard-first queue mode keeps the current flashcard ahead of a reviewable extract", async () => {
    const item = createExtractItem({ rawMarkdown: "extract second", priority: 1 });
    const plugin = createPlugin(
        item,
        jest.fn<Promise<ExtractReviewContext | null>, [string, string?]>().mockResolvedValue(
            createManualExtractContext("before {{ir::extract second}} after", 7, 29),
        ),
        ["1d", "1d", "1d", "1d"],
        { reviewQueueMode: "flashcard-first" },
    );
    const sequencer = {
        ...createSequencer(),
        hasCurrentCard: true,
        currentCard: createRenderableCard(102, "card first"),
    } as unknown as IFlashcardReviewSequencer;
    const { container, root } = renderExtractReviewSession(plugin, undefined, { sequencer });

    try {
        await flushEffects();
        await flushEffects();

        expect(container.textContent).not.toContain("extract second");
    } finally {
        act(() => root.unmount());
    }
});

test("flashcard-first queue mode does not show a learn-ahead card before a reviewable extract", async () => {
    const item = createExtractItem({ rawMarkdown: "eligible extract", priority: 5 });
    const plugin = createPlugin(
        item,
        jest.fn<Promise<ExtractReviewContext | null>, [string, string?]>().mockResolvedValue(
            createManualExtractContext("before {{ir::eligible extract}} after", 7, 31),
        ),
        ["1d", "1d", "1d", "1d"],
        { reviewQueueMode: "flashcard-first" },
    );
    const learnAheadItem = new RepetitionItem(103, "file-103", RPITEMTYPE.CARD, "deck", {});
    learnAheadItem.queue = CardQueue.Learn;
    learnAheadItem.nextReview = Date.now() + 10 * 60 * 1000;
    const sequencer = {
        ...createSequencer(),
        hasCurrentCard: true,
        isCurrentCardFromLearningQueue: true,
        currentCard: Object.assign(createRenderableCard(103, "learn ahead"), {
            repetitionItem: learnAheadItem,
        }),
    } as unknown as IFlashcardReviewSequencer;
    const { container, root } = renderExtractReviewSession(plugin, undefined, { sequencer });

    try {
        await flushEffects();
        await flushEffects();

        expect(container.textContent).toContain("eligible extract");
    } finally {
        act(() => root.unmount());
    }
});

test("interleaved queue mode defaults to four flashcards before one extract", async () => {
    const item = createExtractItem({ rawMarkdown: "after four cards" });
    const plugin = createPlugin(
        item,
        jest.fn<Promise<ExtractReviewContext | null>, [string, string?]>().mockResolvedValue(
            createManualExtractContext("before {{ir::after four cards}} after", 7, 31),
        ),
        ["1d", "1d", "1d", "1d"],
        { reviewQueueMode: "interleaved", interleaveFlashcardCount: 4 },
    );
    const sequencer = {
        ...createSequencer(),
        hasCurrentCard: true,
        currentCard: createRenderableCard(103, "card first"),
    } as unknown as IFlashcardReviewSequencer;
    const { container, root } = renderExtractReviewSession(plugin, undefined, { sequencer });

    try {
        await flushEffects();
        await flushEffects();

        expect(container.textContent).not.toContain("after four cards");
    } finally {
        act(() => root.unmount());
    }
});

test("interleaved queue mode selects an extract after the configured number of flashcards", () => {
    expect(
        resolveActiveReviewItemByQueue({
            hasCard: true,
            extractUuid: "ir_after_two",
            reviewQueueMode: "interleaved",
            interleaveFlashcardCount: 2,
            interleavedFlashcardRun: 0,
            isCurrentCardLearnAhead: false,
        }).item,
    ).toEqual({ kind: "card" });

    expect(
        resolveActiveReviewItemByQueue({
            hasCard: true,
            extractUuid: "ir_after_two",
            reviewQueueMode: "interleaved",
            interleaveFlashcardCount: 2,
            interleavedFlashcardRun: 1,
            isCurrentCardLearnAhead: false,
        }).item,
    ).toEqual({ kind: "card" });

    expect(
        resolveActiveReviewItemByQueue({
            hasCard: true,
            extractUuid: "ir_after_two",
            reviewQueueMode: "interleaved",
            interleaveFlashcardCount: 2,
            interleavedFlashcardRun: 2,
            isCurrentCardLearnAhead: false,
        }),
    ).toEqual({
        item: { kind: "extract", uuid: "ir_after_two" },
        interleavedFlashcardRun: 0,
    });
});

test("extract graduate waits for the real commit before advancing", async () => {
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
    const firstGraduation = createDeferred<ExtractItem | null>();
    (plugin.graduateExtract as jest.Mock).mockImplementation((uuid: string) => {
        if (uuid !== first.uuid) {
            return Promise.resolve(null);
        }
        return firstGraduation.promise;
    });
    const { container, root } = renderExtractReviewSession(plugin);

    try {
        await flushEffects();
        await flushEffects();

        act(() => {
            findButton(container, "Graduate").click();
        });
        await flushEffects();
        await flushEffects();

        expect(plugin.graduateExtract).toHaveBeenCalledWith(first.uuid, null);
        expect(plugin.extractStore?.get(first.uuid)?.stage).toBe("active");
        expect(container.querySelector(".sr-extract-review-overlay")).toBeNull();
        expect(container.textContent).toContain("first");
        expect(container.textContent).not.toContain("second");

        const graduatedFirst = { ...first, stage: "graduated" as const };
        await act(async () => {
            plugin.extractStore?.upsertSnapshot({ item: graduatedFirst });
            firstGraduation.resolve(graduatedFirst);
            await Promise.resolve();
        });
        await flushEffects();

        expect(plugin.graduateExtract).toHaveBeenCalledTimes(1);
        expect(plugin.extractStore?.get(first.uuid)?.stage).toBe("graduated");
        expect(container.textContent).toContain("second");
    } finally {
        act(() => root.unmount());
    }
});

test("extract committed graduate can be undone through store undo", async () => {
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
    (plugin.undoExtractReviewAction as jest.Mock).mockImplementation((action) => {
        plugin.extractStore?.upsertSnapshot(action.snapshot);
        return Promise.resolve(action.snapshot.item);
    });
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

        expect(plugin.graduateExtract).toHaveBeenCalledWith(first.uuid, null);
        expect(plugin.undoExtractReviewAction).toHaveBeenCalledWith({
            snapshot: { item: first },
            countDeckName: null,
        });
        expect(plugin.extractStore?.get(first.uuid)?.stage).toBe("active");
        expect(container.textContent).toContain("first");
    } finally {
        act(() => root.unmount());
    }
});

test("extract move-to-end button advances to the next extract and undo restores it", async () => {
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

        expect(container.textContent).toContain("first");

        act(() => {
            findButton(container, "Move this extract to the end of the learning queue").click();
        });
        await flushEffects();
        await flushEffects();

        expect(container.textContent).toContain("second");

        pressUndo();
        await flushEffects();
        await flushEffects();

        expect(plugin.undoExtractReviewAction).not.toHaveBeenCalled();
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

test("extract with a missing source file is not retried for context", async () => {
    jest.useFakeTimers();
    const item = createExtractItem({ sourcePath: "Untitled.md" });
    const getExtractReviewContext = jest
        .fn<Promise<ExtractReviewContext | null>, [string, string?]>()
        .mockResolvedValue(null);
    const plugin = createPlugin(item, getExtractReviewContext);
    (plugin.app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
    let candidateCalls = 0;
    (plugin.getExtractReviewCandidates as jest.Mock).mockImplementation(() =>
        candidateCalls++ === 0 ? [item] : [],
    );
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

test("extract context reload does not overwrite newer local draft edits after save resolves", async () => {
    jest.useFakeTimers();
    const item = createExtractItem();
    const initialMarkdown = "before {{ir::target}} after";
    const initialContext = createManualExtractContext(initialMarkdown, 7, 21);
    const savedMarkdown = `${initialMarkdown}1`;
    const savedContext = {
        ...initialContext,
        markdown: savedMarkdown,
        sourceTo: savedMarkdown.length,
    };
    const getExtractReviewContext = jest
        .fn<Promise<ExtractReviewContext | null>, [string, string?]>()
        .mockResolvedValueOnce(initialContext)
        .mockResolvedValue(savedContext);
    const plugin = createPlugin(item, getExtractReviewContext);
    const updateDeferred = createDeferred<ExtractItem | null>();
    (plugin.updateExtractContextMarkdown as jest.Mock).mockReturnValue(updateDeferred.promise);
    const { container, root } = renderExtractReviewSession(plugin);

    try {
        await flushEffects();
        await flushEffects();

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
        });
        await flushEffects();

        const editorDom = container.querySelector<HTMLElement>(".cm-editor");
        const view = editorDom ? EditorView.findFromDOM(editorDom) : null;
        expect(view).not.toBeNull();

        act(() => {
            view?.dispatch({
                changes: { from: view.state.doc.length, insert: "1" },
            });
        });
        act(() => {
            jest.advanceTimersByTime(700);
        });
        await flushEffects();
        expect(plugin.updateExtractContextMarkdown).toHaveBeenCalledTimes(1);

        act(() => {
            view?.dispatch({
                changes: { from: view.state.doc.length, insert: "2" },
            });
        });

        await act(async () => {
            updateDeferred.resolve({ ...item, rawMarkdown: "target1" });
            await updateDeferred.promise;
        });
        await flushEffects();
        await flushEffects();

        expect(view?.state.doc.toString()).toBe(`${initialMarkdown}12`);
    } finally {
        act(() => root.unmount());
        jest.useRealTimers();
    }
});

test("extracts-updated during active context save keeps the hybrid editor mounted", async () => {
    jest.useFakeTimers();
    const item = createExtractItem();
    const initialMarkdown = "before {{ir::target}} after";
    const initialContext = createManualExtractContext(initialMarkdown, 7, 21);
    const savedMarkdown = `${initialMarkdown}!`;
    const savedContext = {
        ...initialContext,
        markdown: savedMarkdown,
        sourceTo: savedMarkdown.length,
    };
    const updatedItem = { ...item, rawMarkdown: "target!" };
    const plugin = createPlugin(
        item,
        jest
            .fn<Promise<ExtractReviewContext | null>, [string, string?]>()
            .mockResolvedValueOnce(initialContext)
            .mockResolvedValue(savedContext),
    );
    (plugin.updateExtractContextMarkdown as jest.Mock).mockImplementation(async () => {
        plugin.syncEvents.emit("extracts-updated");
        return updatedItem;
    });
    const { container, root } = renderExtractReviewSession(plugin);

    try {
        await flushEffects();
        await flushEffects();

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
        });
        await flushEffects();

        const editorBefore = container.querySelector<HTMLElement>(".cm-editor");
        const view = editorBefore ? EditorView.findFromDOM(editorBefore) : null;
        expect(editorBefore).not.toBeNull();
        expect(view).not.toBeNull();

        act(() => {
            view?.dispatch({
                changes: { from: view.state.doc.length, insert: "!" },
            });
        });
        act(() => {
            jest.advanceTimersByTime(700);
        });
        await flushEffects();
        await flushEffects();

        expect(plugin.updateExtractContextMarkdown).toHaveBeenCalledTimes(1);
        expect(container.querySelector(".cm-editor")).toBe(editorBefore);
        expect(container.querySelector(".sr-extract-content-ready")).not.toBeNull();
        expect(container.querySelector(".sr-extract-content-pending")).toBeNull();
        expect(view?.state.doc.toString()).toBe(savedMarkdown);
    } finally {
        act(() => root.unmount());
        jest.useRealTimers();
    }
});
