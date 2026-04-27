/** @jsxImportSource react */
/**
 * ReviewSession coordinates the deck list and the active card review pane.
 * It rebuilds isolated deck branches for focused study and refreshes on sync updates.
 */

import React, { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
    Component,
    MarkdownView,
    MarkdownRenderer,
    Notice,
    Platform,
    TFile,
    WorkspaceLeaf,
    type Editor,
} from "obsidian";
import { SR_TAB_VIEW } from "src/constants";
import { DataStore } from "src/dataStore/data";
import { t } from "src/lang/helpers";
import { ReviewContext } from "../context/ReviewContext";
import { DeckOptionsPanel } from "../components/DeckOptionsPanel";
import { DeckTree } from "../components/DeckTree";
import { LinearCard, CardState } from "../components/LinearCard";
import { deckToUIState, saveCollapseState } from "../adapters/deckAdapter";
import { DeckState } from "../types/deckTypes";
import { activateDeckReviewSession } from "../reviewDeckSession";
import type SRPlugin from "src/main";
import { FlashcardReviewMode, IFlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import { Deck } from "src/Deck";
import { ReviewResponse, textInterval } from "src/scheduling";
import { CardType } from "src/Question";
import { CardFrontBackUtil, type CardReviewTarget } from "src/question-type";
import type { QuestionContextBreadcrumb } from "src/SRFile";
import { resolveDeckOptionsPreset } from "src/settings";
import type { ExtractItem } from "src/dataStore/extractStore";
import {
    BookOpen,
    Check,
    Edit3,
    FileText,
    GraduationCap,
    RotateCcw,
    Save,
    TextSelect,
    ThumbsDown,
    Zap,
} from "lucide-react";
import {
    applyReviewMobileHeaderCover,
    applyReviewMobileNavbarCover,
    clearReviewMobileHeaderCover,
    clearReviewMobileNavbarCover,
    detectBlockingMobileNavbar,
} from "./reviewMobileChrome";

// ==========================================
// Types
// ==========================================

export type ReviewSessionView = "deck-list" | "review";
type ReviewEntrySource = "global-deck-list" | "manual-deck-click" | "in-note-auto-enter";
type ActiveReviewItem = { kind: "card" } | { kind: "extract"; uuid: string };

interface ReviewSessionProps {
    plugin: SRPlugin;
    sequencer: IFlashcardReviewSequencer;
    reviewMode: FlashcardReviewMode;
    hostLeaf: WorkspaceLeaf;
    markdownOwner: Component;
    initialView?: ReviewSessionView;
    initialTargetDeckPath?: string;
    onClose?: () => void;
}

// ==========================================
// Motion variants
// ==========================================

const slideVariants: Variants = {
    // Start hidden and let the active pane fade in.
    enter: () => ({
        x: 0,
        opacity: 0,
        zIndex: 1,
        boxShadow: "none",
    }),
    // Active pane.
    center: {
        x: 0,
        opacity: 1,
        zIndex: 1,
        boxShadow: "none",
        transition: { duration: 0.2, ease: "easeOut" },
    },
    // Fade out when switching panes.
    exit: () => ({
        x: 0,
        opacity: 0,
        zIndex: 0,
        boxShadow: "none",
        transition: { duration: 0.15, ease: "easeInOut" },
    }),
};

// Mobile uses a simpler fade because directional motion feels noisy on small screens.
const mobileSlideVariants: Variants = {
    enter: () => ({
        opacity: 0,
        zIndex: 1,
    }),
    center: {
        opacity: 1,
        zIndex: 1,
        transition: { duration: 0.15 },
    },
    exit: () => ({
        opacity: 0,
        zIndex: 0,
        transition: { duration: 0.1 },
    }),
};

// ==========================================
// Deck helpers
// ==========================================

function resolveNoteFile(noteFile: unknown): TFile | null {
    if (noteFile instanceof TFile) {
        return noteFile;
    }

    if (typeof noteFile === "object" && noteFile !== null && "file" in noteFile) {
        const nestedFile = Reflect.get(noteFile, "file");
        return nestedFile instanceof TFile ? nestedFile : null;
    }

    return null;
}

function hasEditor(view: unknown): view is { editor: Editor } {
    return typeof view === "object" && view !== null && "editor" in view;
}

function isMarkdownLeaf(leaf: WorkspaceLeaf | null | undefined): leaf is WorkspaceLeaf & {
    view: MarkdownView;
} {
    return Boolean(leaf?.view instanceof MarkdownView);
}

type ScrollInfo = {
    top: number;
    left: number;
    height: number;
    clientHeight: number;
};

type ScrollableEditor = Editor & {
    getScrollInfo?: () => ScrollInfo;
    scrollTo?: (x: number, y: number) => void;
};

type CodeMirrorScrollDOM = {
    scrollTop: number;
    clientHeight: number;
    scrollHeight: number;
};

type CodeMirrorRect = {
    top: number;
    bottom: number;
};

type InternalCodeMirrorEditor = Editor & {
    cm?: {
        scrollDOM: CodeMirrorScrollDOM;
        coordsAtPos: (pos: number) => CodeMirrorRect | null;
    };
};

type EditorCursorRange = {
    from: { line: number; ch: number };
    to: { line: number; ch: number };
};

function buildCursorRange(
    startLine: number,
    startCh: number = 0,
    endLine: number = startLine,
    endCh: number = startCh,
): EditorCursorRange {
    const safeStartLine = Math.max(0, Math.min(startLine, endLine));
    const safeEndLine = Math.max(safeStartLine, Math.max(startLine, endLine));
    return {
        from: { line: safeStartLine, ch: Math.max(0, startCh) },
        to: { line: safeEndLine, ch: Math.max(0, endCh) },
    };
}

function centerEditorLine(editor: Editor, lineNo: number): void {
    const internalEditor = editor as InternalCodeMirrorEditor;
    const safeLine = Math.max(0, Math.min(lineNo, Math.max(0, editor.lineCount() - 1)));
    const codeMirror = internalEditor.cm;

    if (codeMirror?.scrollDOM && codeMirror.scrollDOM.clientHeight > 0) {
        const lineStartOffset = editor.posToOffset({ line: safeLine, ch: 0 });
        const coords = codeMirror.coordsAtPos(lineStartOffset);
        if (coords) {
            const lineHeight = Math.max(1, coords.bottom - coords.top);
            const maxScrollTop = Math.max(
                0,
                codeMirror.scrollDOM.scrollHeight - codeMirror.scrollDOM.clientHeight,
            );
            const centeredTop = Math.max(
                0,
                Math.min(
                    codeMirror.scrollDOM.scrollTop +
                        coords.top -
                        codeMirror.scrollDOM.clientHeight / 2 +
                        lineHeight / 2,
                    maxScrollTop,
                ),
            );

            codeMirror.scrollDOM.scrollTop = centeredTop;
            return;
        }
    }

    const scrollableEditor = editor as ScrollableEditor;
    const scrollInfo = scrollableEditor.getScrollInfo?.() as ScrollInfo | undefined;

    if (!scrollInfo || !scrollableEditor.scrollTo) {
        return;
    }

    const lineCount = Math.max(1, editor.lineCount());
    const averageLineHeight = scrollInfo.height / lineCount;
    const approximateLineTop = averageLineHeight * lineNo;
    const maxScrollTop = Math.max(0, scrollInfo.height - scrollInfo.clientHeight);
    const centeredTop = Math.max(
        0,
        Math.min(
            approximateLineTop - scrollInfo.clientHeight / 2 + averageLineHeight / 2,
            maxScrollTop,
        ),
    );

    scrollableEditor.scrollTo(scrollInfo.left, centeredTop);
}

function resolveEditorTargetLine(editor: Editor, lineNo: number): number | null {
    const maxLineIndex = Math.max(0, editor.lineCount() - 1);

    // When the document has not finished loading, CodeMirror often reports a single line.
    if (lineNo > 0 && maxLineIndex === 0) {
        return null;
    }

    return Math.max(0, Math.min(lineNo, maxLineIndex));
}

function resolveEditorTargetRange(
    editor: Editor,
    startLine: number,
    endLine: number,
): CardReviewTarget | null {
    const safeStartLine = resolveEditorTargetLine(editor, startLine);
    const safeEndLine = resolveEditorTargetLine(editor, endLine);
    if (safeStartLine === null || safeEndLine === null) {
        return null;
    }

    return {
        startLine: Math.min(safeStartLine, safeEndLine),
        endLine: Math.max(safeStartLine, safeEndLine),
    };
}

function focusEditorRange(editor: Editor, target: CardReviewTarget): boolean {
    const safeRange = resolveEditorTargetRange(editor, target.startLine, target.endLine);
    if (safeRange === null) {
        return false;
    }

    const endLineContent = editor.getLine(safeRange.endLine) || "";
    const { from, to } = buildCursorRange(
        safeRange.startLine,
        0,
        safeRange.endLine,
        endLineContent.length,
    );

    editor.setSelection(from, to);
    editor.scrollIntoView({ from, to }, true);

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
            centerEditorLine(editor, safeRange.startLine);
        });
    } else {
        centerEditorLine(editor, safeRange.startLine);
    }

    return true;
}

function scheduleFocusEditorRange(editor: Editor, target: CardReviewTarget): void {
    const initialFocused = focusEditorRange(editor, target);
    const retryDelays = initialFocused ? [24, 72, 180] : [24, 72, 180, 320, 520, 800, 1200];

    retryDelays.forEach((delay) => {
        window.setTimeout(() => {
            focusEditorRange(editor, target);
        }, delay);
    });
}

function focusLeafEditorRange(leaf: WorkspaceLeaf, target: CardReviewTarget): void {
    const retryDelays = [0, 16, 48, 120, 240, 420, 700, 1100];

    const attemptFocus = (attemptIndex: number) => {
        if (hasEditor(leaf.view)) {
            const internalEditor = leaf.view.editor as InternalCodeMirrorEditor;
            const clientHeight = internalEditor.cm?.scrollDOM?.clientHeight ?? 1;
            if (clientHeight <= 0) {
                const nextDelay = retryDelays[attemptIndex + 1];
                if (nextDelay !== undefined) {
                    window.setTimeout(() => {
                        attemptFocus(attemptIndex + 1);
                    }, nextDelay);
                }
                return;
            }

            const didFocus = focusEditorRange(leaf.view.editor, target);
            if (didFocus) {
                scheduleFocusEditorRange(leaf.view.editor, target);
                return;
            }
        }

        const nextDelay = retryDelays[attemptIndex + 1];
        if (nextDelay === undefined) {
            return;
        }

        window.setTimeout(() => {
            attemptFocus(attemptIndex + 1);
        }, nextDelay);
    };

    attemptFocus(0);
}

function normalizeReviewTarget(
    target?: CardReviewTarget | null,
    fallbackLine: number = 0,
): CardReviewTarget {
    if (!target) {
        return {
            startLine: Math.max(0, fallbackLine),
            endLine: Math.max(0, fallbackLine),
        };
    }

    return {
        startLine: Math.max(0, Math.min(target.startLine, target.endLine)),
        endLine: Math.max(target.startLine, target.endLine, 0),
    };
}

function buildOpenStateForLine(lineNo: number) {
    return {
        eState: {
            cursor: buildCursorRange(lineNo),
        },
    };
}

function findOpenMarkdownLeafForFile(plugin: SRPlugin, noteFile: TFile): WorkspaceLeaf | null {
    const markdownLeaves = plugin.app.workspace.getLeavesOfType("markdown");
    for (const leaf of markdownLeaves) {
        if (!isMarkdownLeaf(leaf)) {
            continue;
        }

        if (leaf.view.file?.path === noteFile.path) {
            return leaf;
        }
    }

    return null;
}

function resolveNavigationLeaf(
    plugin: SRPlugin,
    noteFile: TFile,
    options?: { newTab?: boolean },
): WorkspaceLeaf {
    if (!options?.newTab) {
        const existingLeaf = findOpenMarkdownLeafForFile(plugin, noteFile);
        if (existingLeaf) {
            return existingLeaf;
        }
    }

    return plugin.app.workspace.getLeaf("tab");
}

function getDeckPath(deck: Deck | null | undefined): string | null {
    if (!deck) {
        return null;
    }

    const topicPath = deck.getTopicPath().path.join("/");
    if (topicPath.length > 0) {
        return topicPath;
    }

    return deck.isRootDeck ? "" : deck.deckName;
}

function createReviewItemDebugSnapshot(
    item:
        | {
              timesReviewed?: number | null;
              queue?: number | null;
              nextReview?: number | null;
          }
        | null
        | undefined,
) {
    if (!item) {
        return null;
    }

    return {
        timesReviewed: item.timesReviewed ?? null,
        queue: item.queue ?? null,
        nextReview: item.nextReview ?? null,
    };
}

function createDeckStatsDebugSnapshot(stats: {
    newCount: number;
    learningCount: number;
    dueCount: number;
    totalCount: number;
}) {
    return {
        newCount: stats.newCount,
        learningCount: stats.learningCount,
        dueCount: stats.dueCount,
        totalCount: stats.totalCount,
    };
}

function getExtractDueAt(item: ExtractItem): number {
    return item.timesReviewed === 0 || item.nextReview === 0 ? 0 : item.nextReview;
}

function getCurrentCardDueAt(plugin: SRPlugin, sequencer: IFlashcardReviewSequencer): number {
    const card = sequencer.currentCard;
    if (!card) {
        return Number.POSITIVE_INFINITY;
    }
    const item = plugin.store?.getItembyID(card.Id) ?? DataStore.getInstance().getItembyID(card.Id);
    if (!item || item.isNew) {
        return 0;
    }
    return item.nextReview || Date.now();
}

function getCurrentCardPriority(plugin: SRPlugin, sequencer: IFlashcardReviewSequencer): number {
    const card = sequencer.currentCard;
    if (!card) {
        return 5;
    }
    const item = plugin.store?.getItembyID(card.Id) ?? DataStore.getInstance().getItembyID(card.Id);
    return item?.priority ?? 5;
}

// ==========================================
// Review session
// ==========================================

export const ReviewSession: React.FC<ReviewSessionProps> = ({
    plugin,
    sequencer,
    reviewMode,
    hostLeaf,
    markdownOwner,
    initialView = "deck-list",
    initialTargetDeckPath,
    onClose: _onClose,
}) => {
    // View state
    const [view, setView] = useState<ReviewSessionView>(initialView);
    const [direction, setDirection] = useState(0); // 1 = Push, -1 = Pop
    const [tick, setTick] = useState(0); // Force rerenders after sync or deck updates.
    const [reviewUiResetToken, setReviewUiResetToken] = useState(0);
    const [recentDeckPath, setRecentDeckPath] = useState<string | null>(null);
    const [hasBlockingMobileNavbar, setHasBlockingMobileNavbar] = useState(() =>
        detectBlockingMobileNavbar(),
    );
    const handledInitialReviewEntryRef = useRef(false);
    const handledInitialTargetDeckRef = useRef(false);
    const reviewEntrySourceRef = useRef<ReviewEntrySource>(
        initialTargetDeckPath ? "in-note-auto-enter" : "global-deck-list",
    );
    const activeDeckPathRef = useRef<string | null>(initialTargetDeckPath ?? null);
    const [activeReviewItem, setActiveReviewItem] = useState<ActiveReviewItem | null>(() =>
        sequencer.hasCurrentCard ? { kind: "card" } : null,
    );
    const deckListScrollTopRef = useRef(0);
    const hostLeafId = useMemo(
        () => String((hostLeaf as WorkspaceLeaf & { id?: string | number }).id ?? "leaf"),
        [hostLeaf],
    );

    const logRuntimeDebug = useCallback(
        (...args: unknown[]) => {
            if (plugin.data.settings.showRuntimeDebugMessages) {
                console.debug(...args);
            }
        },
        [plugin],
    );

    const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

    const resolveNextReviewItem = useCallback(
        (deckPathOverride?: string | null): ActiveReviewItem | null => {
            const deckPath =
                deckPathOverride ??
                activeDeckPathRef.current ??
                getDeckPath(sequencer.currentDeck) ??
                null;
            const extract = plugin.getExtractReviewCandidates(
                deckPath,
                reviewMode !== FlashcardReviewMode.Cram,
            )[0];
            const hasCard = sequencer.hasCurrentCard;

            if (!hasCard && extract) {
                return { kind: "extract", uuid: extract.uuid };
            }
            if (hasCard && !extract) {
                return { kind: "card" };
            }
            if (hasCard && extract) {
                const cardDueAt = getCurrentCardDueAt(plugin, sequencer);
                const extractDueAt = getExtractDueAt(extract);
                if (extractDueAt < cardDueAt) {
                    return { kind: "extract", uuid: extract.uuid };
                }
                if (
                    extractDueAt === cardDueAt &&
                    extract.priority < getCurrentCardPriority(plugin, sequencer)
                ) {
                    return { kind: "extract", uuid: extract.uuid };
                }
                return { kind: "card" };
            }

            return null;
        },
        [plugin, reviewMode, sequencer],
    );

    const enterDeckReview = useCallback(
        (fullPath: string, source: ReviewEntrySource): boolean => {
            const isCramMode = reviewMode === FlashcardReviewMode.Cram;
            const sequencerReviewMode =
                (sequencer as IFlashcardReviewSequencer & { reviewMode?: FlashcardReviewMode })
                    .reviewMode ?? null;
            const sourceDeckTree = isCramMode ? plugin.deckTree : plugin.remainingDeckTree;
            const globalRemainingDeckTree = isCramMode ? undefined : plugin.remainingDeckTree;
            const activatedSession = activateDeckReviewSession({
                plugin,
                sequencer,
                fullPath,
                sourceDeckTree,
                fullDeckTree: plugin.deckTree,
                globalRemainingDeckTree,
                applyDailyLimits: !isCramMode,
            });

            if (!activatedSession) {
                logRuntimeDebug("[SR-Debug] enterDeckReview: activation failed", {
                    source,
                    reviewMode: FlashcardReviewMode[reviewMode],
                    sequencerReviewMode:
                        sequencerReviewMode === null
                            ? null
                            : FlashcardReviewMode[sequencerReviewMode],
                    fullPath,
                    sourceDeckTreePath: getDeckPath(sourceDeckTree),
                });
                new Notice(t("REVIEW_NO_CARDS"));
                return false;
            }

            const sessionStats = sequencer.getSessionDeckStats();
            reviewEntrySourceRef.current = source;
            if (sequencerReviewMode !== null && sequencerReviewMode !== reviewMode) {
                console.warn(
                    "[SR] enterDeckReview: review mode mismatch between view and sequencer",
                    {
                        source,
                        reviewMode: FlashcardReviewMode[reviewMode],
                        sequencerReviewMode: FlashcardReviewMode[sequencerReviewMode],
                        fullPath,
                    },
                );
            }

            logRuntimeDebug("[SR-Debug] enterDeckReview: activation succeeded", {
                source,
                reviewMode: FlashcardReviewMode[reviewMode],
                sequencerReviewMode:
                    sequencerReviewMode === null ? null : FlashcardReviewMode[sequencerReviewMode],
                fullPath,
                currentCardId: sequencer.currentCard?.Id ?? null,
                currentDeckPath: getDeckPath(sequencer.currentDeck),
                sessionStats: createDeckStatsDebugSnapshot(sessionStats),
            });

            activeDeckPathRef.current = fullPath;
            const nextReviewItem = resolveNextReviewItem(fullPath);
            if (!nextReviewItem) {
                new Notice(t("REVIEW_NO_CARDS"));
                return false;
            }

            setRecentDeckPath(fullPath);
            setActiveReviewItem(nextReviewItem);
            setReviewUiResetToken((value) => value + 1);
            setDirection(1);
            setView("review");
            return true;
        },
        [logRuntimeDebug, plugin, resolveNextReviewItem, reviewMode, sequencer],
    );

    useEffect(() => {
        if (
            handledInitialReviewEntryRef.current ||
            initialView !== "review" ||
            initialTargetDeckPath
        ) {
            return;
        }

        handledInitialReviewEntryRef.current = true;
        reviewEntrySourceRef.current = "global-deck-list";

        activeDeckPathRef.current = initialTargetDeckPath ?? null;
        const nextReviewItem = resolveNextReviewItem(initialTargetDeckPath ?? null);
        if (!nextReviewItem) {
            new Notice(t("REVIEW_NO_CARDS"));
            setView("deck-list");
            setActiveReviewItem(null);
            return;
        }
        setActiveReviewItem(nextReviewItem);
    }, [initialTargetDeckPath, initialView, resolveNextReviewItem, sequencer]);

    useEffect(() => {
        if (handledInitialTargetDeckRef.current || !initialTargetDeckPath) {
            return;
        }

        handledInitialTargetDeckRef.current = true;
        enterDeckReview(initialTargetDeckPath, "in-note-auto-enter");
    }, [enterDeckReview, initialTargetDeckPath]);

    // Refresh when sync or deck stats change underneath the current view.
    useEffect(() => {
        logRuntimeDebug(
            "[SR-DynSync] ReviewSession: subscribed to sync-complete & deck-stats-updated",
        );

        const onSyncComplete = () => {
            logRuntimeDebug("[SR-DynSync] ReviewSession: sync-complete received");
            forceUpdate();
        };

        const onStatsUpdated = () => {
            forceUpdate();
        };

        const unsubSync = plugin.syncEvents.on("sync-complete", onSyncComplete);
        const unsubStats = plugin.syncEvents.on("deck-stats-updated", onStatsUpdated);
        const unsubExtracts = plugin.syncEvents.on("extracts-updated", onStatsUpdated);

        return () => {
            logRuntimeDebug("[SR-DynSync] ReviewSession: unsubscribed from sync events");
            unsubSync();
            unsubStats();
            unsubExtracts();
        };
    }, [plugin, forceUpdate, logRuntimeDebug]);

    useEffect(() => {
        logRuntimeDebug(`[SR-DynSync] ReviewSession: tick=${tick}`);
    }, [tick, logRuntimeDebug]);
    useEffect(() => {
        return () => {
            void plugin.flushReviewPersistence(1200);
        };
    }, [plugin]);

    const applyReviewMobileChromeCover = useCallback(() => {
        applyReviewMobileNavbarCover(hostLeafId);
        applyReviewMobileHeaderCover(hostLeafId, hostLeaf);
    }, [hostLeaf, hostLeafId]);

    const clearReviewMobileChromeCover = useCallback(() => {
        clearReviewMobileNavbarCover(hostLeafId);
        clearReviewMobileHeaderCover(hostLeafId, hostLeaf);
    }, [hostLeaf, hostLeafId]);

    const syncReviewMobileChromeCover = useCallback(
        (blockingMobileNavbar = hasBlockingMobileNavbar) => {
            if (!Platform.isMobile || typeof document === "undefined") {
                clearReviewMobileChromeCover();
                return;
            }

            const activeLeaf = plugin.app.workspace.getMostRecentLeaf();
            const shouldCover =
                view === "review" &&
                blockingMobileNavbar &&
                activeLeaf === hostLeaf &&
                hostLeaf.view.getViewType() === SR_TAB_VIEW;

            if (shouldCover) {
                applyReviewMobileChromeCover();
                return;
            }

            clearReviewMobileChromeCover();
        },
        [
            applyReviewMobileChromeCover,
            clearReviewMobileChromeCover,
            hostLeaf,
            hasBlockingMobileNavbar,
            plugin.app.workspace,
            view,
        ],
    );

    useEffect(() => {
        if (!Platform.isMobile) {
            setHasBlockingMobileNavbar(false);
            return;
        }

        const observerTarget = document.querySelector(".app-container") ?? document.body;
        let frameId = 0;

        const scheduleRefresh = () => {
            window.cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(() => {
                const nextValue = detectBlockingMobileNavbar();
                setHasBlockingMobileNavbar((prev) => (prev === nextValue ? prev : nextValue));
                syncReviewMobileChromeCover(nextValue);
            });
        };

        scheduleRefresh();

        window.addEventListener("resize", scheduleRefresh);
        window.addEventListener("orientationchange", scheduleRefresh);

        const observer = new MutationObserver(() => {
            scheduleRefresh();
        });
        observer.observe(observerTarget, {
            attributes: true,
            attributeFilter: ["class"],
            childList: true,
            subtree: true,
        });

        return () => {
            window.removeEventListener("resize", scheduleRefresh);
            window.removeEventListener("orientationchange", scheduleRefresh);
            observer.disconnect();
            window.cancelAnimationFrame(frameId);
        };
    }, [syncReviewMobileChromeCover]);

    useEffect(() => {
        syncReviewMobileChromeCover();

        return () => {
            clearReviewMobileChromeCover();
        };
    }, [clearReviewMobileChromeCover, syncReviewMobileChromeCover]);

    useEffect(() => {
        if (!Platform.isMobile) {
            return;
        }

        const workspace = plugin.app.workspace;
        let frameId = 0;

        const syncAfterWorkspaceChange = () => {
            window.cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(() => {
                syncReviewMobileChromeCover();
            });
        };

        const activeLeafChangeRef = workspace.on("active-leaf-change", syncAfterWorkspaceChange);
        const fileOpenRef = workspace.on("file-open", syncAfterWorkspaceChange);
        const layoutChangeRef = workspace.on("layout-change", syncAfterWorkspaceChange);

        return () => {
            window.cancelAnimationFrame(frameId);
            workspace.offref(activeLeafChangeRef);
            workspace.offref(fileOpenRef);
            workspace.offref(layoutChangeRef);
        };
    }, [plugin.app.workspace, syncReviewMobileChromeCover]);
    const contextValue = useMemo(
        () => ({
            app: plugin.app,
            plugin,
            settings: plugin.data.settings,
            sequencer,
        }),
        [plugin, sequencer],
    );

    // Deck list handlers

    // Isolate the clicked deck, rebuild its root path, and enter review when cards remain.
    const handleDeckClick = useCallback(
        (deckState: DeckState) => {
            const fullPath = deckState.fullPath || deckState.deckName;
            const activatedSession = enterDeckReview(fullPath, "manual-deck-click");

            logRuntimeDebug(
                `[V3-Scheduler] Clicked Deck: ${fullPath}, activated=${String(activatedSession)}`,
            );
        },
        [enterDeckReview, logRuntimeDebug],
    );

    // Return from card review to the deck list.
    const handleExitReview = useCallback(() => {
        void plugin.flushReviewPersistence(1200);
        logRuntimeDebug("[SR-DailyState] review-exit-save-skipped", {
            reason: "flushReviewPersistence-already-covers-plugin-data",
        });
        clearReviewMobileChromeCover();
        plugin.setSRViewInFocus(false);
        setDirection(-1);
        setView("deck-list");
        setActiveReviewItem(null);
        forceUpdate(); // Refresh deck counts after leaving review.
    }, [clearReviewMobileChromeCover, forceUpdate, logRuntimeDebug, plugin]);

    // Submit a review response for the current card.
    const handleAnswer = useCallback(
        async (rating: number) => {
            logRuntimeDebug(`[SR-DynSync] ReviewSession: handleAnswer rating=${rating}`);
            const responseMap = [
                ReviewResponse.Reset,
                ReviewResponse.Hard,
                ReviewResponse.Good,
                ReviewResponse.Easy,
            ];
            const response = responseMap[rating] ?? ReviewResponse.Good;

            if (activeReviewItem?.kind === "extract") {
                try {
                    await plugin.reviewExtract(activeReviewItem.uuid, response);
                } catch (error) {
                    console.error("[SR-Extract] Failed to review extract", error);
                }

                const nextReviewItem = resolveNextReviewItem(activeDeckPathRef.current);
                if (nextReviewItem) {
                    setActiveReviewItem(nextReviewItem);
                    setReviewUiResetToken((value) => value + 1);
                    forceUpdate();
                    return;
                }

                handleExitReview();
                return;
            }

            const debugSequencer = sequencer as IFlashcardReviewSequencer & {
                sessionCounterDeckPath?: string | null;
                globalRemainingDeckTree?: Deck;
            };
            const currentCard = sequencer.currentCard;
            const sessionStatsBefore = sequencer.getSessionDeckStats();
            const pluginStoreItemBefore = currentCard
                ? (plugin.store?.getItembyID(currentCard.Id) ?? null)
                : null;
            const dataStoreItemBefore = currentCard
                ? DataStore.getInstance().getItembyID(currentCard.Id)
                : null;

            logRuntimeDebug("[SR-Debug] ReviewSession.handleAnswer before", {
                source: reviewEntrySourceRef.current,
                rating,
                response: ReviewResponse[response],
                cardId: currentCard?.Id ?? null,
                currentDeckPath: getDeckPath(sequencer.currentDeck),
                sessionCounterDeckPath: debugSequencer.sessionCounterDeckPath ?? null,
                hasGlobalRemainingDeckTree: Boolean(debugSequencer.globalRemainingDeckTree),
                pluginStoreItemExists: Boolean(pluginStoreItemBefore),
                dataStoreItemExists: Boolean(dataStoreItemBefore),
                sharedStoreItemRef:
                    pluginStoreItemBefore && dataStoreItemBefore
                        ? pluginStoreItemBefore === dataStoreItemBefore
                        : null,
                itemBefore: createReviewItemDebugSnapshot(
                    pluginStoreItemBefore ?? dataStoreItemBefore,
                ),
                sessionStatsBefore: createDeckStatsDebugSnapshot(sessionStatsBefore),
            });

            try {
                logRuntimeDebug("[SR-DynSync] ReviewSession: calling sequencer.processReview");
                sequencer.processReview(response);
                logRuntimeDebug("[SR-DynSync] ReviewSession: sequencer.processReview completed");
            } catch (e) {
                console.error("[SR] processReview 鐎殿喖鍊搁悥?", e);
            }

            const pluginStoreItemAfter = currentCard
                ? (plugin.store?.getItembyID(currentCard.Id) ?? null)
                : null;
            const dataStoreItemAfter = currentCard
                ? DataStore.getInstance().getItembyID(currentCard.Id)
                : null;
            const sessionStatsAfter = sequencer.getSessionDeckStats();

            logRuntimeDebug("[SR-Debug] ReviewSession.handleAnswer after", {
                source: reviewEntrySourceRef.current,
                rating,
                response: ReviewResponse[response],
                processedCardId: currentCard?.Id ?? null,
                nextCardId: sequencer.currentCard?.Id ?? null,
                currentDeckPath: getDeckPath(sequencer.currentDeck),
                sessionCounterDeckPath: debugSequencer.sessionCounterDeckPath ?? null,
                hasGlobalRemainingDeckTree: Boolean(debugSequencer.globalRemainingDeckTree),
                pluginStoreItemExists: Boolean(pluginStoreItemAfter),
                dataStoreItemExists: Boolean(dataStoreItemAfter),
                sharedStoreItemRef:
                    pluginStoreItemAfter && dataStoreItemAfter
                        ? pluginStoreItemAfter === dataStoreItemAfter
                        : null,
                itemBefore: createReviewItemDebugSnapshot(
                    pluginStoreItemBefore ?? dataStoreItemBefore,
                ),
                itemAfter: createReviewItemDebugSnapshot(
                    pluginStoreItemAfter ?? dataStoreItemAfter,
                ),
                sessionStatsBefore: createDeckStatsDebugSnapshot(sessionStatsBefore),
                sessionStatsAfter: createDeckStatsDebugSnapshot(sessionStatsAfter),
            });

            const nextReviewItem = resolveNextReviewItem(activeDeckPathRef.current);
            if (nextReviewItem) {
                logRuntimeDebug("[SR-DynSync] ReviewSession: current card remains, forceUpdate");
                setActiveReviewItem(nextReviewItem);
                setReviewUiResetToken((value) => value + 1);
                forceUpdate();
            } else {
                logRuntimeDebug("[SR-DynSync] ReviewSession: sequencer exhausted, exiting review");
                handleExitReview();
            }
        },
        [
            activeReviewItem,
            forceUpdate,
            handleExitReview,
            logRuntimeDebug,
            plugin,
            plugin.store,
            resolveNextReviewItem,
            sequencer,
        ],
    );

    const handleUndo = useCallback(() => {
        if (activeReviewItem?.kind === "extract") {
            new Notice(t("REVIEW_NO_UNDO"));
            return;
        }
        if (!sequencer.canUndo) {
            new Notice(t("REVIEW_NO_UNDO"));
            return;
        }
        sequencer.undoReview();
        setReviewUiResetToken((value) => value + 1);
        forceUpdate();
    }, [activeReviewItem, sequencer, forceUpdate]);

    // Remove the current card from tracking and leave review if nothing remains.
    const handleDelete = useCallback(async () => {
        if (activeReviewItem?.kind === "extract") {
            await plugin.graduateExtract(activeReviewItem.uuid);
            const nextReviewItem = resolveNextReviewItem(activeDeckPathRef.current);
            if (nextReviewItem) {
                setActiveReviewItem(nextReviewItem);
                setReviewUiResetToken((value) => value + 1);
                forceUpdate();
            } else {
                handleExitReview();
            }
            return;
        }
        await sequencer.untrackCurrentCard();
        if (sequencer.hasCurrentCard) {
            setActiveReviewItem(resolveNextReviewItem(activeDeckPathRef.current) ?? { kind: "card" });
            setReviewUiResetToken((value) => value + 1);
            forceUpdate();
        } else {
            handleExitReview();
        }
    }, [activeReviewItem, forceUpdate, handleExitReview, plugin, resolveNextReviewItem, sequencer]);

    // Persist tree collapse changes.
    const handleCollapseChange = useCallback(
        (fullPath: string, isCollapsed: boolean) => {
            void saveCollapseState(plugin, fullPath, isCollapsed);
        },
        [plugin],
    );

    const isPhoneLayout = Platform.isPhone;
    // Keep the simplified fade only on phones; tablets reuse the desktop pane motion.
    const activeVariants = isPhoneLayout ? mobileSlideVariants : slideVariants;
    const shouldOverlayMobileNavbarForReview =
        view === "review" &&
        hasBlockingMobileNavbar &&
        plugin.app.workspace.getMostRecentLeaf() === hostLeaf &&
        hostLeaf.view.getViewType() === SR_TAB_VIEW;

    return (
        <ReviewContext.Provider value={contextValue}>
            <div
                className="sr-review-session"
                style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    overflow: "hidden",
                    background: "var(--background-primary)",
                }}
            >
                <AnimatePresence initial={false} custom={direction} mode="popLayout">
                    {view === "deck-list" ? (
                        <motion.div
                            key="deck-list"
                            custom={direction}
                            variants={activeVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            style={{
                                position: "absolute",
                                width: "100%",
                                height: "100%",
                                background: "var(--background-primary)",
                                pointerEvents: "none",
                            }}
                        >
                            <DeckListView
                                sequencer={sequencer}
                                plugin={plugin}
                                onDeckClick={handleDeckClick}
                                onCollapseChange={(fullPath, isCollapsed) => {
                                    handleCollapseChange(fullPath, isCollapsed);
                                }}
                                tick={tick}
                                recentDeckPath={recentDeckPath}
                                initialScrollTop={deckListScrollTopRef.current}
                                onScrollTopChange={(scrollTop) => {
                                    deckListScrollTopRef.current = scrollTop;
                                }}
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="review-card"
                            custom={direction}
                            variants={activeVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            style={{
                                position: "absolute",
                                width: "100%",
                                height: "100%",
                                background: "var(--background-primary)",
                                pointerEvents: "none",
                            }}
                        >
                            {activeReviewItem?.kind === "extract" ? (
                                <ExtractReviewView
                                    plugin={plugin}
                                    extractUuid={activeReviewItem.uuid}
                                    deckPath={activeDeckPathRef.current}
                                    markdownOwner={markdownOwner}
                                    clearReviewMobileChromeCover={clearReviewMobileChromeCover}
                                    onAnswer={(rating) => {
                                        void handleAnswer(rating);
                                    }}
                                    onExit={handleExitReview}
                                    onGraduate={() => {
                                        void handleDelete();
                                    }}
                                    uiResetToken={reviewUiResetToken}
                                    overlayMobileNavbar={shouldOverlayMobileNavbarForReview}
                                />
                            ) : (
                                <CardReviewView
                                    sequencer={sequencer}
                                    plugin={plugin}
                                    clearReviewMobileChromeCover={clearReviewMobileChromeCover}
                                    markdownOwner={markdownOwner}
                                    onAnswer={(rating) => {
                                        void handleAnswer(rating);
                                    }}
                                    onUndo={() => {
                                        void handleUndo();
                                    }}
                                    onDelete={() => {
                                        void handleDelete();
                                    }}
                                    onExit={handleExitReview}
                                    tick={tick}
                                    uiResetToken={reviewUiResetToken}
                                    overlayMobileNavbar={shouldOverlayMobileNavbarForReview}
                                />
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </ReviewContext.Provider>
    );
};

// ==========================================
// Deck list view
// ==========================================

interface DeckListViewProps {
    sequencer: IFlashcardReviewSequencer;
    plugin: SRPlugin;
    onDeckClick: (deckState: DeckState) => void;
    onCollapseChange: (fullPath: string, isCollapsed: boolean) => void;
    tick: number;
    recentDeckPath: string | null;
    initialScrollTop: number;
    onScrollTopChange: (scrollTop: number) => void;
}

interface OpenDeckOptionsState {
    deckName: string;
    deckPath: string;
}

const DeckListView: React.FC<DeckListViewProps> = ({
    sequencer: _sequencer,
    plugin,
    onDeckClick,
    onCollapseChange,
    tick: _tick,
    recentDeckPath,
    initialScrollTop,
    onScrollTopChange,
}) => {
    const panelHostRef = useRef<HTMLDivElement>(null);
    const treeHostRef = useRef<HTMLDivElement>(null);
    const treeShellRef = useRef<HTMLDivElement>(null);
    const [openDeckOptions, setOpenDeckOptions] = useState<OpenDeckOptionsState | null>(null);
    const [isSyncing, setIsSyncing] = useState(plugin.syncLock);
    const isPhoneLayout = Platform.isPhone;
    const isTouchLayout = Platform.isMobile;
    const initialTreeWidth = Number(plugin.data.settings.reactDeckTreeWidth ?? 860);
    const [treeWidth, setTreeWidth] = useState(initialTreeWidth);
    const deckListClassName = [
        "sr-deck-list-view",
        isPhoneLayout ? "sr-phone-layout" : "",
        isTouchLayout ? "sr-touch-layout" : "",
    ]
        .filter(Boolean)
        .join(" ");
    const shellWidth = isPhoneLayout ? "100%" : `min(100%, ${treeWidth}px)`;

    useLayoutEffect(() => {
        const host = treeHostRef.current;
        if (!host) return;
        host.scrollTop = initialScrollTop;
    }, [initialScrollTop]);

    // Build the list from remainingDeckTree so the UI always reflects current limits.
    const decks = useMemo(() => {
        const remainingDeckTree = plugin.remainingDeckTree;
        if (!remainingDeckTree?.subdecks) {
            if (plugin.data.settings.showRuntimeDebugMessages) {
                console.warn("[V3-Scheduler] DeckListView: remainingDeckTree not ready");
            }
            return [];
        }

        const result = remainingDeckTree.subdecks.map((deck: Deck) => deckToUIState(deck, plugin));
        if (plugin.data.settings.showRuntimeDebugMessages) {
            console.debug(
                `[V3-Scheduler] DeckListView render: tick=${_tick}, decks=${result.length}`,
            );
        }
        return result;
    }, [plugin.remainingDeckTree, plugin, _tick]);

    useEffect(() => {
        const unsubStart = plugin.syncEvents.on("sync-start", () => setIsSyncing(true));
        const unsubFinished = plugin.syncEvents.on("sync-finished", () => setIsSyncing(false));

        return () => {
            unsubStart();
            unsubFinished();
        };
    }, [plugin]);

    const handleSync = useCallback(() => {
        if (plugin.syncLock) {
            return;
        }
        setIsSyncing(true);
        void plugin.requestSync({ trigger: "manual" }).catch(() => setIsSyncing(false));
    }, [plugin]);

    const handleDeckSettingsClick = useCallback((deck: DeckState, _anchorEl: HTMLElement) => {
        setOpenDeckOptions({
            deckName: deck.deckName,
            deckPath: deck.fullPath || deck.deckName,
        });
    }, []);

    const handleTreeScroll = useCallback(() => {
        const host = treeHostRef.current;
        if (!host) return;
        onScrollTopChange(host.scrollTop);
    }, [onScrollTopChange]);

    const handleTreeResizeStart = useCallback(
        (event: React.MouseEvent | React.TouchEvent, direction: "w" | "e") => {
            if (isPhoneLayout) return;
            event.preventDefault();
            event.stopPropagation();

            const host = treeHostRef.current;
            const shell = treeShellRef.current;
            if (!host || !shell) return;

            const isTouchEvent = "touches" in event;
            const startX = isTouchEvent ? event.touches[0].clientX : event.clientX;
            const startWidth = Number(shell.offsetWidth || treeWidth);
            const minWidth = 320;
            const hostStyles = window.getComputedStyle(host);
            const hostPadding =
                parseFloat(hostStyles.paddingLeft || "0") +
                parseFloat(hostStyles.paddingRight || "0");
            const maxWidth = Math.max(minWidth, host.clientWidth - hostPadding);

            let currentWidth: number = startWidth;
            shell.classList.add("sr-deck-tree-shell--resizing");

            const applyTreeRect = () => {
                shell.style.width = `min(100%, ${currentWidth}px)`;
            };

            const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
                if ("preventDefault" in moveEvent) moveEvent.preventDefault();
                const clientX =
                    "touches" in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
                const deltaX = clientX - startX;

                const signedDelta = direction === "w" ? -deltaX : deltaX;
                const nextWidth = startWidth + signedDelta * 2;
                currentWidth = Math.max(minWidth, Math.min(nextWidth, maxWidth));
                applyTreeRect();
            };

            const handleEnd = () => {
                document.removeEventListener("mousemove", handleMove);
                document.removeEventListener("mouseup", handleEnd);
                document.removeEventListener("touchmove", handleMove);
                document.removeEventListener("touchend", handleEnd);
                shell.classList.remove("sr-deck-tree-shell--resizing");
                setTreeWidth(currentWidth);
                plugin.data.settings.reactDeckTreeWidth = currentWidth;
                void plugin.savePluginData();
            };

            document.addEventListener("mousemove", handleMove);
            document.addEventListener("mouseup", handleEnd);
            document.addEventListener("touchmove", handleMove, { passive: false });
            document.addEventListener("touchend", handleEnd);
        },
        [isPhoneLayout, plugin, treeWidth],
    );

    return (
        <div
            className={deckListClassName}
            ref={panelHostRef}
            style={{
                height: "100%",
                position: "relative",
                overflow: "hidden",
                pointerEvents: "auto",
            }}
        >
            <div className="sr-deck-list-scroll" ref={treeHostRef} onScroll={handleTreeScroll}>
                <div
                    className="sr-deck-tree-shell"
                    ref={treeShellRef}
                    style={{ width: shellWidth }}
                >
                    {!isPhoneLayout && (
                        <div
                            className="sr-deck-tree-resize-handle sr-deck-tree-resize-handle--left"
                            onMouseDown={(e) => handleTreeResizeStart(e, "w")}
                            onTouchStart={(e) => handleTreeResizeStart(e, "w")}
                        />
                    )}
                    <DeckTree
                        decks={decks}
                        onDeckClick={onDeckClick}
                        onSettingsClick={handleDeckSettingsClick}
                        onCollapseChange={onCollapseChange}
                        onSync={handleSync}
                        isSyncing={isSyncing}
                        recentDeckPath={recentDeckPath}
                    />
                    {!isPhoneLayout && (
                        <div
                            className="sr-deck-tree-resize-handle sr-deck-tree-resize-handle--right"
                            onMouseDown={(e) => handleTreeResizeStart(e, "e")}
                            onTouchStart={(e) => handleTreeResizeStart(e, "e")}
                        />
                    )}
                </div>
            </div>
            {openDeckOptions && (
                <DeckOptionsPanel
                    plugin={plugin}
                    deckName={openDeckOptions.deckName}
                    deckPath={openDeckOptions.deckPath}
                    containerElement={panelHostRef.current}
                    preferredWidth={Math.min(
                        isPhoneLayout ? (panelHostRef.current?.clientWidth ?? 420) : treeWidth,
                        760,
                    )}
                    onClose={() => setOpenDeckOptions(null)}
                    onSaved={() => {
                        if (plugin.data.settings.showRuntimeDebugMessages) {
                            console.debug("[ReviewSession] DeckOptions saved");
                        }
                    }}
                />
            )}
        </div>
    );
};

// ==========================================
// Extract Review
// ==========================================

interface ExtractReviewViewProps {
    plugin: SRPlugin;
    extractUuid: string;
    deckPath: string | null;
    markdownOwner: Component;
    clearReviewMobileChromeCover: () => void;
    onAnswer: (rating: number) => void;
    onExit: () => void;
    onGraduate: () => void;
    uiResetToken: number;
    overlayMobileNavbar: boolean;
}

const ExtractMarkdownPreview: React.FC<{
    plugin: SRPlugin;
    markdownOwner: Component;
    sourcePath: string;
    content: string;
}> = ({ plugin, markdownOwner, sourcePath, content }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        container.replaceChildren();
        const renderComponent = new Component();
        renderComponent.load();
        let cancelled = false;

        const render = async () => {
            const buffer = document.createElement("div");
            await MarkdownRenderer.render(plugin.app, content, buffer, sourcePath, markdownOwner);
            if (cancelled) {
                return;
            }
            container.replaceChildren(...Array.from(buffer.childNodes));
        };

        void render().catch((error) => {
            if (cancelled) {
                return;
            }
            console.error("[SR-Extract] Failed to render extract markdown", error);
            container.textContent = content;
        });

        return () => {
            cancelled = true;
            renderComponent.unload();
        };
    }, [content, markdownOwner, plugin.app, sourcePath]);

    return (
        <div
            className="sr-extract-markdown markdown-preview-view markdown-rendered"
            ref={containerRef}
        />
    );
};

const ExtractReviewButton: React.FC<{
    icon: React.ReactNode;
    label: string;
    sub: string;
    shortcut: string;
    variant: "reset" | "hard" | "good" | "easy";
    onClick: () => void;
}> = ({ icon, label, sub, shortcut, variant, onClick }) => (
    <button
        type="button"
        className={`sr-linear-btn is-${variant} sr-extract-review-button sr-extract-review-button--${variant}`}
        onClick={onClick}
    >
        <span className="sr-linear-btn-shortcut sr-extract-review-button__shortcut">
            {shortcut}
        </span>
        <span className="sr-linear-btn-icon-wrapper sr-extract-review-button__icon">
            {icon}
        </span>
        <span className="sr-linear-btn-content sr-extract-review-button__text">
            <span className="sr-linear-btn-label">{label}</span>
            <span className="sr-linear-btn-sub">{sub}</span>
        </span>
    </button>
);

const ExtractReviewView: React.FC<ExtractReviewViewProps> = ({
    plugin,
    extractUuid,
    deckPath,
    markdownOwner,
    clearReviewMobileChromeCover,
    onAnswer,
    onExit,
    onGraduate,
    uiResetToken,
    overlayMobileNavbar,
}) => {
    const extract = plugin.extractStore?.get(extractUuid) ?? null;
    const [body, setBody] = useState(extract?.rawMarkdown ?? "");
    const [memo, setMemo] = useState(extract?.memo ?? "");
    const [priority, setPriority] = useState(extract?.priority ?? 5);
    const [isEditingBody, setIsEditingBody] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
    const bodyValueRef = useRef(body);
    const memoValueRef = useRef(memo);
    const bodyDirtyRef = useRef(false);
    const memoDirtyRef = useRef(false);
    const bodySaveTimerRef = useRef<number | null>(null);
    const memoSaveTimerRef = useRef<number | null>(null);

    const sourcePath = extract?.sourcePath ?? "";
    const reviewIntervals = useMemo(
        () => plugin.getExtractReviewIntervals(extractUuid),
        [extractUuid, plugin, uiResetToken],
    );
    const extractStats = useMemo(() => {
        const stats = plugin.extractStore?.getStats(deckPath) ?? {
            newCount: 0,
            dueCount: 0,
            totalCount: 0,
        };
        return stats;
    }, [deckPath, plugin.extractStore, uiResetToken]);

    useEffect(() => {
        const nextExtract = plugin.extractStore?.get(extractUuid) ?? null;
        setBody(nextExtract?.rawMarkdown ?? "");
        setMemo(nextExtract?.memo ?? "");
        setPriority(nextExtract?.priority ?? 5);
        setIsEditingBody(false);
        bodyValueRef.current = nextExtract?.rawMarkdown ?? "";
        memoValueRef.current = nextExtract?.memo ?? "";
        bodyDirtyRef.current = false;
        memoDirtyRef.current = false;
    }, [extractUuid, plugin.extractStore, uiResetToken]);

    useEffect(() => {
        bodyValueRef.current = body;
    }, [body]);

    useEffect(() => {
        memoValueRef.current = memo;
    }, [memo]);

    const clearSaveTimer = useCallback((ref: { current: number | null }) => {
        if (ref.current !== null) {
            window.clearTimeout(ref.current);
            ref.current = null;
        }
    }, []);

    const saveBodyNow = useCallback(async () => {
        clearSaveTimer(bodySaveTimerRef);
        if (!bodyDirtyRef.current) {
            return;
        }
        bodyDirtyRef.current = false;
        setIsSaving(true);
        try {
            const updated = await plugin.updateExtractRawMarkdown(extractUuid, bodyValueRef.current);
            if (updated) {
                setBody(updated.rawMarkdown);
                bodyValueRef.current = updated.rawMarkdown;
            }
        } finally {
            setIsSaving(false);
        }
    }, [clearSaveTimer, extractUuid, plugin]);

    const saveMemoNow = useCallback(async () => {
        clearSaveTimer(memoSaveTimerRef);
        if (!memoDirtyRef.current) {
            return;
        }
        memoDirtyRef.current = false;
        setIsSaving(true);
        try {
            const updated = await plugin.updateExtractMemo(extractUuid, memoValueRef.current);
            if (updated) {
                setMemo(updated.memo);
                memoValueRef.current = updated.memo;
            }
        } finally {
            setIsSaving(false);
        }
    }, [clearSaveTimer, extractUuid, plugin]);

    const flushSaves = useCallback(async () => {
        await saveBodyNow();
        await saveMemoNow();
    }, [saveBodyNow, saveMemoNow]);

    useEffect(() => {
        return () => {
            clearSaveTimer(bodySaveTimerRef);
            clearSaveTimer(memoSaveTimerRef);
        };
    }, [clearSaveTimer]);

    const scheduleBodySave = useCallback(
        (value: string) => {
            setBody(value);
            bodyValueRef.current = value;
            bodyDirtyRef.current = true;
            clearSaveTimer(bodySaveTimerRef);
            bodySaveTimerRef.current = window.setTimeout(() => {
                void saveBodyNow().catch((error) => {
                    console.error("[SR-Extract] Failed to save extract body", error);
                    new Notice(t("EXTRACT_SAVE_FAILED"));
                });
            }, 700);
        },
        [clearSaveTimer, saveBodyNow],
    );

    const scheduleMemoSave = useCallback(
        (value: string) => {
            setMemo(value);
            memoValueRef.current = value;
            memoDirtyRef.current = true;
            clearSaveTimer(memoSaveTimerRef);
            memoSaveTimerRef.current = window.setTimeout(() => {
                void saveMemoNow().catch((error) => {
                    console.error("[SR-Extract] Failed to save extract memo", error);
                    new Notice(t("EXTRACT_SAVE_FAILED"));
                });
            }, 500);
        },
        [clearSaveTimer, saveMemoNow],
    );

    const handlePriorityChange = useCallback(
        (event: React.ChangeEvent<HTMLSelectElement>) => {
            const nextPriority = Number(event.target.value);
            setPriority(nextPriority);
            void plugin.updateExtractPriority(extractUuid, nextPriority).catch((error) => {
                console.error("[SR-Extract] Failed to update priority", error);
                new Notice(t("EXTRACT_SAVE_FAILED"));
            });
        },
        [extractUuid, plugin],
    );

    const handleAnswer = useCallback(
        async (rating: number) => {
            try {
                await flushSaves();
            } catch (error) {
                console.error("[SR-Extract] Failed to flush before review", error);
                new Notice(t("EXTRACT_SAVE_FAILED"));
            }
            onAnswer(rating);
        },
        [flushSaves, onAnswer],
    );

    const handleContinueExtract = useCallback(async () => {
        const textarea = bodyTextareaRef.current;
        if (!textarea || textarea.selectionStart === textarea.selectionEnd) {
            new Notice(t("EXTRACT_SELECT_TEXT_REQUIRED"));
            return;
        }

        try {
            const updated = await plugin.createNestedExtractFromRawRange(
                extractUuid,
                textarea.selectionStart,
                textarea.selectionEnd,
            );
            if (updated) {
                setBody(updated.rawMarkdown);
                bodyValueRef.current = updated.rawMarkdown;
                bodyDirtyRef.current = false;
            }
            new Notice(t("EXTRACT_NESTED_CREATED"));
        } catch (error) {
            console.error("[SR-Extract] Failed to create nested extract", error);
            new Notice(t("EXTRACT_SAVE_FAILED"));
        }
    }, [extractUuid, plugin]);

    const handleOpenSource = useCallback(
        async (options?: { newTab?: boolean }) => {
            if (!extract) {
                return;
            }
            const abstractFile = plugin.app.vault.getAbstractFileByPath(extract.sourcePath);
            if (!(abstractFile instanceof TFile)) {
                new Notice(t("EXTRACT_SOURCE_MISSING"));
                return;
            }

            clearReviewMobileChromeCover();
            const leaf = resolveNavigationLeaf(plugin, abstractFile, options);
            const sourceText = await plugin.app.vault.read(abstractFile);
            const line = sourceText.slice(0, extract.sourceAnchor.start).split("\n").length - 1;
            await leaf.openFile(abstractFile, buildOpenStateForLine(Math.max(0, line)));
            await plugin.app.workspace.revealLeaf?.(leaf);
            plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
            if (hasEditor(leaf.view)) {
                const offset = Math.max(
                    0,
                    Math.min(extract.sourceAnchor.start, leaf.view.editor.getValue().length),
                );
                const cursor = leaf.view.editor.offsetToPos(offset);
                leaf.view.editor.setCursor(cursor);
                leaf.view.editor.scrollIntoView({ from: cursor, to: cursor }, true);
            }
        },
        [clearReviewMobileChromeCover, extract, plugin],
    );

    const handleGraduate = useCallback(async () => {
        try {
            await flushSaves();
        } catch (error) {
            console.error("[SR-Extract] Failed to flush before graduation", error);
            new Notice(t("EXTRACT_SAVE_FAILED"));
        }
        onGraduate();
    }, [flushSaves, onGraduate]);

    useEffect(() => {
        const keyHandler = (event: KeyboardEvent) => {
            if (event.defaultPrevented) {
                return;
            }
            const activeElement = document.activeElement;
            if (
                activeElement instanceof HTMLTextAreaElement ||
                activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLSelectElement
            ) {
                return;
            }
            if (event.key === "1") {
                event.preventDefault();
                void handleAnswer(0);
            } else if (event.key === "2") {
                event.preventDefault();
                void handleAnswer(1);
            } else if (event.key === "3") {
                event.preventDefault();
                void handleAnswer(2);
            } else if (event.key === "4") {
                event.preventDefault();
                void handleAnswer(3);
            }
        };
        window.addEventListener("keydown", keyHandler);
        return () => window.removeEventListener("keydown", keyHandler);
    }, [handleAnswer]);

    if (!extract) {
        return (
            <div className="sr-card-review-view sr-extract-review-view">
                <div
                    className={[
                        "sr-linear-card-wrapper",
                        "sr-extract-linear-card-wrapper",
                        Platform.isPhone ? "sr-phone-layout sr-mobile-maximized" : "",
                        overlayMobileNavbar ? "sr-overlay-mobile-navbar" : "",
                    ]
                        .filter(Boolean)
                        .join(" ")}
                >
                    <div className="sr-linear-card sr-extract-card sr-extract-card--empty">
                        {t("EXTRACT_NO_ACTIVE_ITEMS")}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={[
                "sr-card-review-view",
                "sr-extract-review-view",
                Platform.isPhone ? "sr-extract-review-view--phone" : "",
                overlayMobileNavbar ? "sr-extract-review-view--overlay-mobile-navbar" : "",
            ]
                .filter(Boolean)
                .join(" ")}
        >
            <div
                className={[
                    "sr-linear-card-wrapper",
                    "sr-extract-linear-card-wrapper",
                    Platform.isPhone ? "sr-phone-layout sr-mobile-maximized" : "",
                    overlayMobileNavbar ? "sr-overlay-mobile-navbar" : "",
                ]
                    .filter(Boolean)
                    .join(" ")}
            >
                <div className="sr-linear-card sr-extract-card">
                    <div className="sr-card-highlight" />
                    <header className="sr-card-header sr-extract-header">
                        <div className="sr-header-left sr-extract-header-left">
                            <button
                                type="button"
                                className="sr-filename-badge sr-extract-source"
                                onClick={() => {
                                    void handleOpenSource();
                                }}
                                onMouseDown={(event) => {
                                    if (event.button !== 1) {
                                        return;
                                    }
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void handleOpenSource({ newTab: true });
                                }}
                                title={t("EXTRACT_OPEN_SOURCE")}
                            >
                                <FileText size={14} />
                                <span>{sourcePath || t("EXTRACT_SOURCE_MISSING")}</span>
                            </button>
                        </div>
                        <div className="sr-header-right sr-extract-header-stats">
                            <span>
                                {t("EXTRACT_STATS_LABEL", { count: extractStats.totalCount })}
                            </span>
                            <button
                                type="button"
                                className="sr-header-btn sr-extract-header-button"
                                onClick={onExit}
                            >
                                {t("BACK")}
                            </button>
                        </div>
                    </header>

                    <section className="sr-card-content-area sr-extract-content-area">
                        <div className="sr-card-content-scroll sr-extract-content-scroll">
                            <section className="sr-extract-meta-row">
                                <label className="sr-extract-priority-control">
                                    <span>{t("EXTRACT_PRIORITY_LABEL")}</span>
                                    <select value={priority} onChange={handlePriorityChange}>
                                        {Array.from(
                                            { length: 10 },
                                            (_, index) => index + 1,
                                        ).map((value) => (
                                            <option key={value} value={value}>
                                                {value}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <span className="sr-extract-save-state">
                                    {isSaving ? t("EXTRACT_SAVING") : t("EXTRACT_SAVED")}
                                </span>
                            </section>

                            <section className="sr-extract-memo-section">
                                <label>{t("EXTRACT_MEMO_LABEL")}</label>
                                <textarea
                                    value={memo}
                                    onChange={(event) => scheduleMemoSave(event.target.value)}
                                    placeholder={t("EXTRACT_MEMO_PLACEHOLDER")}
                                />
                            </section>

                            <section className="sr-extract-body-section">
                                <div className="sr-extract-section-title">
                                    <span>{t("EXTRACT_BODY_LABEL")}</span>
                                    <div className="sr-extract-actions">
                                        <button
                                            type="button"
                                            className="sr-header-btn sr-extract-action-button"
                                            onClick={() => setIsEditingBody((value) => !value)}
                                        >
                                            {isEditingBody ? (
                                                <Save size={14} />
                                            ) : (
                                                <Edit3 size={14} />
                                            )}
                                            <span>
                                                {isEditingBody
                                                    ? t("EXTRACT_FINISH_EDIT")
                                                    : t("EXTRACT_EDIT_BODY")}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            className="sr-header-btn sr-extract-action-button"
                                            onClick={() => {
                                                void handleContinueExtract();
                                            }}
                                        >
                                            <TextSelect size={14} />
                                            <span>{t("EXTRACT_CONTINUE_EXTRACT")}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="sr-header-btn sr-extract-action-button"
                                            onClick={() => {
                                                void handleGraduate();
                                            }}
                                        >
                                            <GraduationCap size={14} />
                                            <span>{t("EXTRACT_GRADUATE")}</span>
                                        </button>
                                    </div>
                                </div>
                                {isEditingBody ? (
                                    <textarea
                                        ref={bodyTextareaRef}
                                        className="sr-extract-body-editor"
                                        value={body}
                                        onChange={(event) => scheduleBodySave(event.target.value)}
                                    />
                                ) : (
                                    <ExtractMarkdownPreview
                                        plugin={plugin}
                                        markdownOwner={markdownOwner}
                                        sourcePath={sourcePath}
                                        content={body}
                                    />
                                )}
                            </section>
                        </div>
                    </section>

                    <footer className="sr-card-footer sr-extract-footer">
                        <div className="sr-rating-buttons sr-extract-rating-buttons">
                            <ExtractReviewButton
                                icon={<RotateCcw size={13} />}
                                label={t("UI_RESET")}
                                sub={reviewIntervals[0] ?? "-"}
                                shortcut="1"
                                variant="reset"
                                onClick={() => {
                                    void handleAnswer(0);
                                }}
                            />
                            <ExtractReviewButton
                                icon={<ThumbsDown size={13} />}
                                label={t("UI_HARD")}
                                sub={reviewIntervals[1] ?? "-"}
                                shortcut="2"
                                variant="hard"
                                onClick={() => {
                                    void handleAnswer(1);
                                }}
                            />
                            <ExtractReviewButton
                                icon={<Check size={13} />}
                                label={t("UI_GOOD")}
                                sub={reviewIntervals[2] ?? "-"}
                                shortcut="3"
                                variant="good"
                                onClick={() => {
                                    void handleAnswer(2);
                                }}
                            />
                            <ExtractReviewButton
                                icon={<Zap size={13} />}
                                label={t("UI_EASY")}
                                sub={reviewIntervals[3] ?? "-"}
                                shortcut="4"
                                variant="easy"
                                onClick={() => {
                                    void handleAnswer(3);
                                }}
                            />
                        </div>
                        <button
                            type="button"
                            className="sr-linear-btn sr-extract-open-source-button"
                            onClick={() => {
                                void handleOpenSource();
                            }}
                        >
                            <span className="sr-linear-btn-icon-wrapper">
                                <BookOpen size={14} />
                            </span>
                            <span className="sr-linear-btn-content">
                                <span className="sr-linear-btn-label">
                                    {t("EXTRACT_OPEN_SOURCE")}
                                </span>
                            </span>
                        </button>
                    </footer>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// ?????????Card Review
// ==========================================

interface CardReviewViewProps {
    sequencer: IFlashcardReviewSequencer;
    plugin: SRPlugin;
    clearReviewMobileChromeCover: () => void;
    markdownOwner: Component;
    onAnswer: (rating: number) => void;
    onUndo: () => void;
    onDelete: () => void;
    onExit: () => void;
    tick: number;
    uiResetToken: number;
    overlayMobileNavbar: boolean;
}

const CardReviewView: React.FC<CardReviewViewProps> = ({
    sequencer,
    plugin,
    clearReviewMobileChromeCover,
    markdownOwner,
    onAnswer,
    onUndo,
    onDelete,
    onExit,
    tick: _tick,
    uiResetToken,
    overlayMobileNavbar,
}) => {
    const card = sequencer.currentCard;
    const question = sequencer.currentQuestion;
    const deck = sequencer.currentDeck;

    // Guard against transient empty state while the sequencer updates.
    if (!card || !question || !deck) {
        return null;
    }

    const settings = plugin.data.settings;

    // Compute response labels once per card to avoid churning card props and re-render loops.
    const btnLabels = useMemo(
        () =>
            [
                sequencer.determineCardSchedule(ReviewResponse.Reset, card).interval,
                sequencer.determineCardSchedule(ReviewResponse.Hard, card).interval,
                sequencer.determineCardSchedule(ReviewResponse.Good, card).interval,
                sequencer.determineCardSchedule(ReviewResponse.Easy, card).interval,
            ].map((interval) => textInterval(interval, false)),
        [sequencer, card],
    );

    // Expand the current card text before rendering.
    const sourceText =
        question.questionText?.actualQuestion || question.parsedQuestionInfo?.text || "";
    const expanded = CardFrontBackUtil.expand(
        question.questionType,
        sourceText,
        settings,
        question.lineNo,
        {
            noteText: question.note?.reviewFileText || question.note?.fileText,
            firstLineNum: question.parsedQuestionInfo?.firstLineNum,
            lastLineNum: question.parsedQuestionInfo?.lastLineNum,
        },
    );
    const cardIdx = card.cardIdx;
    const front = expanded[cardIdx]?.front || "";
    const back = expanded[cardIdx]?.back || "";
    const review = expanded[cardIdx]?.review;
    const reviewTarget = normalizeReviewTarget(expanded[cardIdx]?.reviewTarget, question.lineNo);

    const cardState: CardState = useMemo(
        () => ({
            front,
            back,
            review,
            reviewTarget,
            responseButtonLabels: btnLabels,
        }),
        [front, back, review, reviewTarget, btnLabels],
    );

    // Pull counters from the deck session the user entered from.
    const stats = sequencer.getSessionDeckStats();
    if (settings.showRuntimeDebugMessages) {
        console.debug(
            `[DEBUG_REVIEW_UI] Card Review UI counters for deck '${deck.deckName}' -> New: ${stats.newCount}, Learning: ${stats.learningCount}, Due: ${stats.dueCount}`,
        );
    }
    let cardType: "new" | "learning" | "due" = "due";
    if (sequencer.isCurrentCardFromLearningQueue) {
        cardType = "learning";
    } else {
        const item = plugin.store?.getItembyID(card.Id);
        if (item?.isInLearningPhase) {
            cardType = "learning";
        } else if (card.isNew) {
            cardType = "new";
        }
    }

    // Breadcrumbs and deck-specific timing settings.
    const breadcrumbs = useMemo(() => question.questionContext || [], [question.questionContext]);
    const filename = question.note?.file?.basename || "Unknown";

    // Read the active deck preset to decide auto-advance timing.
    const deckPath = deck.getTopicPath().path.join("/") || deck.deckName;
    const preset = resolveDeckOptionsPreset(settings, deckPath);
    const autoAdvanceSeconds = preset?.autoAdvance ? preset.autoAdvanceSeconds || 10 : 0;
    const showAutoAdvanceProgressBar = preset?.showProgressBar ?? true;
    const progressBarStyle = settings.progressBarStyle;

    // Collect extra debug data for the review UI when needed.
    const debugInfo = useMemo(() => {
        const item = plugin.store?.getItembyID(card.Id);
        if (!item) return null;
        return {
            basic: {
                ID: card.Id,
                fileID: item.fileID,
                itemType: "card",
                deckName: deck.deckName,
                timesReviewed: item.timesReviewed || 0,
                timesCorrect: item.timesCorrect || 0,
                errorStreak: item.errorStreak || 0,
                priority: item.priority || 0,
            },
            data: item.data || {},
        };
    }, [plugin.store, card.Id, deck.deckName]);

    // Open the source note and focus the reviewed line in the editor.
    const handleOpenNote = async (options?: { newTab?: boolean }) => {
        const noteFile = resolveNoteFile(question.note?.file);
        if (!noteFile) return;

        clearReviewMobileChromeCover();
        const activeLeaf = resolveNavigationLeaf(plugin, noteFile, options);
        await activeLeaf.openFile(noteFile, buildOpenStateForLine(reviewTarget.startLine));
        await plugin.app.workspace.revealLeaf?.(activeLeaf);
        plugin.app.workspace.setActiveLeaf(activeLeaf, { focus: true });
        focusLeafEditorRange(activeLeaf, reviewTarget);
    };

    const handleOpenBreadcrumb = async (
        breadcrumb: QuestionContextBreadcrumb,
        options?: { newTab?: boolean },
    ) => {
        const noteFile = resolveNoteFile(question.note?.file);
        if (!noteFile) return;

        clearReviewMobileChromeCover();
        const activeLeaf = resolveNavigationLeaf(plugin, noteFile, options);
        await activeLeaf.openFile(noteFile, buildOpenStateForLine(breadcrumb.line));
        await plugin.app.workspace.revealLeaf?.(activeLeaf);
        plugin.app.workspace.setActiveLeaf(activeLeaf, { focus: true });
        const safeLine =
            hasEditor(activeLeaf.view) && activeLeaf.view.editor.lineCount() > 0
                ? Math.max(
                      0,
                      Math.min(
                          breadcrumb.line,
                          Math.max(0, activeLeaf.view.editor.lineCount() - 1),
                      ),
                  )
                : Math.max(0, breadcrumb.line);
        focusLeafEditorRange(activeLeaf, { startLine: safeLine, endLine: safeLine });
    };

    // Postpone the current card without opening the note.
    const handlePostpone = () => {
        onAnswer(0);
    };

    const reviewStats = useMemo(
        () => ({
            new: stats.newCount,
            learning: stats.learningCount,
            due: stats.dueCount,
        }),
        [stats.newCount, stats.learningCount, stats.dueCount],
    );

    const sourcePath = question.note?.file?.path || "";
    useEffect(() => {
        plugin.setTimelineReviewCardPath(sourcePath || null);

        return () => {
            if (plugin.getTimelineReviewCardPath() === (sourcePath || null)) {
                plugin.setTimelineReviewCardPath(null);
            }
        };
    }, [plugin, sourcePath]);

    const renderCardMarkdown = useCallback(
        (text: string, el: HTMLElement) =>
            MarkdownRenderer.render(plugin.app, text, el, sourcePath, markdownOwner),
        [plugin.app, sourcePath, markdownOwner],
    );
    const isPhoneLayout = Platform.isPhone;
    const allowResize = !isPhoneLayout;

    // Persist resized card dimensions.
    const handleResize = (width: number, height: number) => {
        settings.reactFlashcardWidth = width;
        settings.reactFlashcardHeight = height;
        void plugin.savePluginData();
    };

    return (
        <div
            className="sr-card-review-view"
            style={{
                height: "100%",
                display: "flex",
                justifyContent: "center",
                pointerEvents: "auto",
                alignItems: "center",
            }}
        >
            <LinearCard
                card={cardState}
                uiResetToken={uiResetToken}
                stats={reviewStats}
                cardType={cardType}
                type={
                    question.questionType === CardType.Cloze ||
                    question.questionType === CardType.AnkiCloze
                        ? "cloze"
                        : "basic"
                }
                filename={filename}
                breadcrumbs={breadcrumbs}
                autoAdvanceSeconds={autoAdvanceSeconds}
                showProgressBar={showAutoAdvanceProgressBar}
                progressBarStyle={progressBarStyle}
                onAnswer={onAnswer}
                onShowAnswer={() => {}}
                onUndo={onUndo}
                onOpenNote={(options) => {
                    void handleOpenNote(options);
                }}
                onOpenBreadcrumb={(breadcrumb, options) => {
                    void handleOpenBreadcrumb(breadcrumb, options);
                }}
                onEditCard={() => {}}
                onPostpone={handlePostpone}
                onDelete={onDelete}
                onExit={onExit}
                onResize={handleResize}
                renderMarkdown={renderCardMarkdown}
                width={settings.reactFlashcardWidth}
                height={settings.reactFlashcardHeight}
                debugInfo={debugInfo}
                isMobile={isPhoneLayout}
                allowResize={allowResize}
                overlayMobileNavbar={overlayMobileNavbar}
                plugin={plugin}
                rawContent={question.questionText?.actualQuestion || ""}
                onUpdateContent={(text) => {
                    void sequencer.updateCurrentQuestionText(text);
                }}
            />
        </div>
    );
};
