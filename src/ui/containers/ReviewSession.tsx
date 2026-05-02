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
import { t } from "src/lang/helpers";
import { ReviewContext } from "../context/ReviewContext";
import { DeckTree } from "../components/DeckTree";
import { LinearCard, CardState } from "../components/LinearCard";
import { buildDeckTreeUIState, saveCollapseState } from "../adapters/deckAdapter";
import { DeckState } from "../types/deckTypes";
import { activateDeckReviewSession } from "../reviewDeckSession";
import { DeckOptionsModal, getDeckOptionsModalAnchorRect } from "../modals/DeckOptionsModal";
import type SRPlugin from "src/main";
import type { ExtractReviewUndoAction } from "src/main";
import { FlashcardReviewMode, IFlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import { Deck } from "src/Deck";
import { ReviewResponse, textInterval } from "src/scheduling";
import type { ExtractContextUpdate } from "src/editor/extract-context-decoration";
import type { ExtractReviewContext } from "src/util/irExtractContext";
import { ExtractReviewDateModal } from "src/ui/modals/ExtractReviewDateModal";
import { CardType } from "src/Question";
import { CardFrontBackUtil, type CardReviewTarget } from "src/question-type";
import { SrTFile, type QuestionContextBreadcrumb } from "src/SRFile";
import {
    normalizeInterleaveFlashcardCount,
    resolveDeckOptionsPreset,
    type ReviewQueueMode,
} from "src/settings";
import type { ExtractItem } from "src/dataStore/extractStore";
import {
    applyReviewMobileHeaderCover,
    applyReviewMobileNavbarCover,
    clearReviewMobileHeaderCover,
    clearReviewMobileNavbarCover,
    detectBlockingMobileNavbar,
} from "./reviewMobileChrome";
import {
    REVIEW_EDIT_MODE_TOGGLE_EVENT,
    type ReviewEditModeToggleDetail,
} from "../reviewEditModeEvents";

// ==========================================
// Types
// ==========================================

export type ReviewSessionView = "deck-list" | "review";
type ReviewEntrySource = "global-deck-list" | "manual-deck-click" | "in-note-auto-enter";
export type ActiveReviewItem = { kind: "card" } | { kind: "extract"; uuid: string };

interface ReviewQueueSelectionInput {
    hasCard: boolean;
    extractUuid: string | null;
    reviewQueueMode: ReviewQueueMode;
    interleaveFlashcardCount: number;
    interleavedFlashcardRun: number;
    isCurrentCardLearnAhead: boolean;
}

interface ReviewQueueSelectionResult {
    item: ActiveReviewItem | null;
    interleavedFlashcardRun: number;
}

export function resolveActiveReviewItemByQueue({
    hasCard,
    extractUuid,
    reviewQueueMode,
    interleaveFlashcardCount,
    interleavedFlashcardRun,
    isCurrentCardLearnAhead,
}: ReviewQueueSelectionInput): ReviewQueueSelectionResult {
    const hasExtract = extractUuid != null;
    const normalizedRun = Math.max(0, Math.floor(interleavedFlashcardRun));

    if (!hasCard && hasExtract) {
        return {
            item: { kind: "extract", uuid: extractUuid },
            interleavedFlashcardRun: 0,
        };
    }

    if (hasCard && !hasExtract) {
        return {
            item: { kind: "card" },
            interleavedFlashcardRun: normalizedRun,
        };
    }

    if (hasCard && hasExtract) {
        if (isCurrentCardLearnAhead) {
            return {
                item: { kind: "extract", uuid: extractUuid },
                interleavedFlashcardRun: 0,
            };
        }

        if (reviewQueueMode === "flashcard-first") {
            return {
                item: { kind: "card" },
                interleavedFlashcardRun: 0,
            };
        }

        if (reviewQueueMode === "interleaved") {
            const flashcardCount = normalizeInterleaveFlashcardCount(interleaveFlashcardCount);
            if (normalizedRun >= flashcardCount) {
                return {
                    item: { kind: "extract", uuid: extractUuid },
                    interleavedFlashcardRun: 0,
                };
            }
            return {
                item: { kind: "card" },
                interleavedFlashcardRun: normalizedRun,
            };
        }

        return {
            item: { kind: "extract", uuid: extractUuid },
            interleavedFlashcardRun: 0,
        };
    }

    return {
        item: null,
        interleavedFlashcardRun: normalizedRun,
    };
}

function isCurrentCardLearnAhead(sequencer: IFlashcardReviewSequencer): boolean {
    if (!sequencer.isCurrentCardFromLearningQueue) {
        return false;
    }

    const nextReview = sequencer.currentCard?.repetitionItem?.nextReview;
    return typeof nextReview === "number" && nextReview > Date.now();
}

function isReviewHostLeafActive(plugin: SRPlugin, hostLeaf: WorkspaceLeaf): boolean {
    const workspace = (
        plugin.app as unknown as {
            workspace?: {
                activeLeaf?: WorkspaceLeaf | null;
                getMostRecentLeaf?: () => WorkspaceLeaf | null;
            } & Record<string, unknown>;
        }
    ).workspace;
    const activeLeaf =
        workspace?.activeLeaf ??
        (typeof workspace?.getMostRecentLeaf === "function" ? workspace.getMostRecentLeaf() : null);
    if (!activeLeaf) {
        return true;
    }

    if (activeLeaf === hostLeaf) {
        return true;
    }

    const activeLeafId = (activeLeaf as WorkspaceLeaf & { id?: unknown }).id;
    const hostLeafId = (hostLeaf as WorkspaceLeaf & { id?: unknown }).id;
    return activeLeafId !== undefined && activeLeafId === hostLeafId;
}

type ReviewUndoStackEntry =
    | { kind: "card" }
    | { kind: "extract"; action: ExtractReviewUndoAction }
    | { kind: "extract-move-to-end"; uuid: string; sourcePath: string | null };

interface PreparedExtractReview {
    uuid: string;
    rawMarkdown: string;
    context: ExtractReviewContext;
    draft: ExtractContextUpdate;
    sourcePath: string | null;
    versionKey: string;
}

interface CachedSourceText {
    mtime: number;
    text: string;
}

interface InvalidatePreparedExtractOptions {
    preservePrepared?: boolean;
    preservePreparing?: boolean;
}

interface ReviewSessionProps {
    plugin: SRPlugin;
    sequencer: IFlashcardReviewSequencer;
    reviewMode: FlashcardReviewMode;
    hostLeaf: WorkspaceLeaf;
    markdownOwner: Component;
    initialView?: ReviewSessionView;
    initialTargetDeckPath?: string;
    editModeRequestTarget?: EventTarget;
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

function combineCardAndExtractReviewStats(
    cardStats: { newCount: number; learningCount: number; dueCount: number },
    extractStats: { newCount: number; dueCount: number },
) {
    return {
        new: cardStats.newCount + extractStats.newCount,
        learning: cardStats.learningCount,
        due: cardStats.dueCount + extractStats.dueCount,
    };
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
    editModeRequestTarget,
    onClose: _onClose,
}) => {
    // View state
    const [view, setView] = useState<ReviewSessionView>(initialView);
    const [direction, setDirection] = useState(0); // 1 = Push, -1 = Pop
    const [tick, setTick] = useState(0); // Force rerenders after sync or deck updates.
    const [reviewUiResetToken, setReviewUiResetToken] = useState(0);
    const [reviewEditModeToggleToken, setReviewEditModeToggleToken] = useState(0);
    const [activeExtractRefreshToken, setActiveExtractRefreshToken] = useState(0);
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

    const shouldHandleReviewHotkeys = useCallback(
        () => isReviewHostLeafActive(plugin, hostLeaf),
        [hostLeaf, plugin],
    );

    const forceUpdate = useCallback(() => setTick((t) => t + 1), []);
    const preparedExtractsRef = useRef(new Map<string, PreparedExtractReview>());
    const preparingExtractsRef = useRef(new Map<string, Promise<PreparedExtractReview | null>>());
    const sourceTextCacheRef = useRef(new Map<string, CachedSourceText>());
    const reviewUndoStackRef = useRef<ReviewUndoStackEntry[]>([]);
    const movedExtractsToEndRef = useRef<string[]>([]);
    const [, setPreparedExtractVersion] = useState(0);
    const interleavedFlashcardRunRef = useRef(0);

    useEffect(() => {
        if (!editModeRequestTarget) {
            return;
        }

        const handleToggleEditModeRequest = (event: Event) => {
            if (!shouldHandleReviewHotkeys() || view !== "review" || !activeReviewItem) {
                return;
            }
            const detail = (event as CustomEvent<ReviewEditModeToggleDetail>).detail;
            if (detail) {
                detail.handled = true;
            }
            setReviewEditModeToggleToken((token) => token + 1);
        };

        editModeRequestTarget.addEventListener(
            REVIEW_EDIT_MODE_TOGGLE_EVENT,
            handleToggleEditModeRequest,
        );
        return () => {
            editModeRequestTarget.removeEventListener(
                REVIEW_EDIT_MODE_TOGGLE_EVENT,
                handleToggleEditModeRequest,
            );
        };
    }, [activeReviewItem, editModeRequestTarget, shouldHandleReviewHotkeys, view]);

    const getExtractVersionKey = useCallback(
        (item: ExtractItem | null): string => {
            if (!item) {
                return "missing";
            }
            const abstractFile = plugin.app.vault.getAbstractFileByPath(item.sourcePath);
            const mtime = abstractFile instanceof TFile ? abstractFile.stat.mtime : 0;
            return [
                item.uuid,
                item.stage,
                item.sourcePath,
                mtime,
                item.sourceAnchor.start,
                item.sourceAnchor.end,
                item.rawMarkdown,
            ].join("\u001f");
        },
        [plugin.app.vault],
    );

    const invalidatePreparedExtract = useCallback(
        (
            uuid?: string | null,
            sourcePath?: string | null,
            options: InvalidatePreparedExtractOptions = {},
        ) => {
            if (uuid) {
                const preservedPrepared = options.preservePrepared
                    ? preparedExtractsRef.current.get(uuid)
                    : undefined;
                const preservedPreparing = options.preservePreparing
                    ? preparingExtractsRef.current.get(uuid)
                    : undefined;
                preparedExtractsRef.current.delete(uuid);
                preparingExtractsRef.current.delete(uuid);
                if (preservedPrepared) {
                    preparedExtractsRef.current.set(uuid, preservedPrepared);
                }
                if (preservedPreparing !== undefined) {
                    preparingExtractsRef.current.set(uuid, preservedPreparing);
                }
            } else {
                preparedExtractsRef.current.clear();
                preparingExtractsRef.current.clear();
            }
            if (sourcePath) {
                sourceTextCacheRef.current.delete(sourcePath);
            } else if (!uuid) {
                sourceTextCacheRef.current.clear();
            }
            setPreparedExtractVersion((value) => value + 1);
        },
        [],
    );

    const invalidatePreparedExtractsPreserving = useCallback((uuid: string) => {
        const preservedPrepared = preparedExtractsRef.current.get(uuid);
        const preservedPreparing = preparingExtractsRef.current.get(uuid);
        preparedExtractsRef.current.clear();
        preparingExtractsRef.current.clear();
        if (preservedPrepared) {
            preparedExtractsRef.current.set(uuid, preservedPrepared);
        }
        if (preservedPreparing !== undefined) {
            preparingExtractsRef.current.set(uuid, preservedPreparing);
        }
        sourceTextCacheRef.current.clear();
        setPreparedExtractVersion((value) => value + 1);
    }, []);

    const cloneExtractItem = useCallback((item: ExtractItem): ExtractItem => {
        const clone = JSON.parse(JSON.stringify(item)) as ExtractItem;
        return clone;
    }, []);

    const getReviewableExtractCandidates = useCallback(
        (deckPath: string | null | undefined): ExtractItem[] => {
            const candidates = plugin
                .getExtractReviewCandidates(
                    deckPath ?? null,
                    reviewMode !== FlashcardReviewMode.Cram,
                )
                .filter((item) => item.stage === "active");
            const candidateUuids = new Set(candidates.map((item) => item.uuid));
            movedExtractsToEndRef.current = movedExtractsToEndRef.current.filter((uuid) =>
                candidateUuids.has(uuid),
            );
            if (movedExtractsToEndRef.current.length === 0) {
                return candidates;
            }

            const movedOrderByUuid = new Map(
                movedExtractsToEndRef.current.map((uuid, index) => [uuid, index]),
            );
            const normalCandidates: ExtractItem[] = [];
            const movedCandidates: Array<{ item: ExtractItem; order: number }> = [];
            for (const item of candidates) {
                const order = movedOrderByUuid.get(item.uuid);
                if (order === undefined) {
                    normalCandidates.push(item);
                } else {
                    movedCandidates.push({ item, order });
                }
            }
            movedCandidates.sort((left, right) => left.order - right.order);
            return [...normalCandidates, ...movedCandidates.map((entry) => entry.item)];
        },
        [plugin, reviewMode],
    );

    const getCachedSourceText = useCallback(
        async (item: ExtractItem): Promise<string | undefined> => {
            const abstractFile = plugin.app.vault.getAbstractFileByPath(item.sourcePath);
            if (!(abstractFile instanceof TFile)) {
                return undefined;
            }
            const cached = sourceTextCacheRef.current.get(item.sourcePath);
            if (cached && cached.mtime === abstractFile.stat.mtime) {
                return cached.text;
            }
            const text = await plugin.app.vault.read(abstractFile);
            sourceTextCacheRef.current.set(item.sourcePath, {
                mtime: abstractFile.stat.mtime,
                text,
            });
            return text;
        },
        [plugin.app.vault],
    );

    const prepareExtractReview = useCallback(
        async (uuid: string): Promise<PreparedExtractReview | null> => {
            const item = plugin.extractStore?.get(uuid) ?? null;
            if (!item || item.stage !== "active") {
                preparedExtractsRef.current.delete(uuid);
                preparingExtractsRef.current.delete(uuid);
                if (item?.sourcePath) {
                    sourceTextCacheRef.current.delete(item.sourcePath);
                }
                setPreparedExtractVersion((value) => value + 1);
                return null;
            }
            const sourceFile = plugin.app.vault.getAbstractFileByPath(item.sourcePath);
            if (!(sourceFile instanceof TFile)) {
                preparedExtractsRef.current.delete(uuid);
                preparingExtractsRef.current.delete(uuid);
                sourceTextCacheRef.current.delete(item.sourcePath);
                setPreparedExtractVersion((value) => value + 1);
                return null;
            }
            const versionKey = getExtractVersionKey(item);
            const cached = preparedExtractsRef.current.get(uuid);
            if (cached && cached.versionKey === versionKey) {
                return cached;
            }

            const pending = preparingExtractsRef.current.get(uuid);
            if (pending !== undefined) {
                return pending;
            }

            const promise = (async () => {
                const latestItem = plugin.extractStore?.get(uuid) ?? null;
                if (!latestItem || latestItem.stage !== "active") {
                    preparedExtractsRef.current.delete(uuid);
                    if (latestItem?.sourcePath) {
                        sourceTextCacheRef.current.delete(latestItem.sourcePath);
                    }
                    setPreparedExtractVersion((value) => value + 1);
                    return null;
                }
                const latestSourceFile = plugin.app.vault.getAbstractFileByPath(
                    latestItem.sourcePath,
                );
                if (!(latestSourceFile instanceof TFile)) {
                    preparedExtractsRef.current.delete(uuid);
                    sourceTextCacheRef.current.delete(latestItem.sourcePath);
                    setPreparedExtractVersion((value) => value + 1);
                    return null;
                }
                const latestVersionKey = getExtractVersionKey(latestItem);
                const sourceText = latestItem ? await getCachedSourceText(latestItem) : undefined;
                const context = await plugin.getExtractReviewContext(uuid, sourceText);
                if (!context) {
                    preparedExtractsRef.current.delete(uuid);
                    if (latestItem?.sourcePath) {
                        sourceTextCacheRef.current.delete(latestItem.sourcePath);
                    }
                    setPreparedExtractVersion((value) => value + 1);
                    return null;
                }
                const prepared: PreparedExtractReview = {
                    uuid,
                    rawMarkdown: context.markdown,
                    context,
                    draft: { markdown: context.markdown, ranges: context },
                    sourcePath: latestItem?.sourcePath ?? null,
                    versionKey: latestVersionKey,
                };
                preparedExtractsRef.current.set(uuid, prepared);
                setPreparedExtractVersion((value) => value + 1);
                return prepared;
            })().finally(() => {
                preparingExtractsRef.current.delete(uuid);
            });

            preparingExtractsRef.current.set(uuid, promise);
            return promise;
        },
        [getCachedSourceText, getExtractVersionKey, plugin],
    );

    const getExtractLookaheadUuids = useCallback(
        (currentUuid: string): string[] => {
            const candidates = getReviewableExtractCandidates(activeDeckPathRef.current);
            const uuids = candidates.map((item) => item.uuid);
            const currentIndex = uuids.indexOf(currentUuid);
            const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
            return uuids.slice(startIndex, startIndex + 2);
        },
        [getReviewableExtractCandidates],
    );

    const resolveNextReviewItem = useCallback(
        (deckPathOverride?: string | null): ActiveReviewItem | null => {
            const deckPath =
                deckPathOverride ??
                activeDeckPathRef.current ??
                getDeckPath(sequencer.currentDeck) ??
                null;
            const hasCard = sequencer.hasCurrentCard;
            const candidates = getReviewableExtractCandidates(deckPath);
            const extract =
                hasCard &&
                candidates[0] &&
                movedExtractsToEndRef.current.includes(candidates[0].uuid)
                    ? undefined
                    : candidates[0];
            const preset = resolveDeckOptionsPreset(plugin.data.settings, deckPath);
            const selection = resolveActiveReviewItemByQueue({
                hasCard,
                extractUuid: extract?.uuid ?? null,
                reviewQueueMode: preset.reviewQueueMode,
                interleaveFlashcardCount: preset.interleaveFlashcardCount,
                interleavedFlashcardRun: interleavedFlashcardRunRef.current,
                isCurrentCardLearnAhead: isCurrentCardLearnAhead(sequencer),
            });

            interleavedFlashcardRunRef.current = selection.interleavedFlashcardRun;
            return selection.item;
        },
        [getReviewableExtractCandidates, plugin, sequencer],
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
                new Notice(t("REVIEW_NO_CARDS"));
                return false;
            }

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

            activeDeckPathRef.current = fullPath;
            reviewUndoStackRef.current = [];
            movedExtractsToEndRef.current = [];
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

    const refreshActiveDeckReviewSession = useCallback((): boolean => {
        const fullPath = activeDeckPathRef.current;
        if (!fullPath || view !== "review") {
            return false;
        }

        const isCramMode = reviewMode === FlashcardReviewMode.Cram;
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
            return false;
        }

        logRuntimeDebug("[SR-DynSync] ReviewSession: active deck session refreshed", {
            fullPath,
            view,
            activeKind: activeReviewItem?.kind ?? null,
        });
        return true;
    }, [activeReviewItem, logRuntimeDebug, plugin, reviewMode, sequencer, view]);

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
        reviewUndoStackRef.current = [];
        movedExtractsToEndRef.current = [];
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
            if (activeReviewItem?.kind === "extract") {
                refreshActiveDeckReviewSession();
            }
            forceUpdate();
        };

        const onStatsUpdated = () => {
            invalidatePreparedExtract();
            forceUpdate();
        };

        const onExtractsUpdated = () => {
            if (activeReviewItem?.kind === "extract") {
                logRuntimeDebug("[SR-ExtractSave] ReviewSession received extracts-updated", {
                    activeExtractUuid: activeReviewItem.uuid,
                    activeDeckPath: activeDeckPathRef.current,
                    view,
                });
                invalidatePreparedExtractsPreserving(activeReviewItem.uuid);
                setActiveExtractRefreshToken((value) => value + 1);
            } else {
                invalidatePreparedExtract();
            }
            forceUpdate();
        };

        const unsubSync = plugin.syncEvents.on("sync-complete", onSyncComplete);
        const unsubStats = plugin.syncEvents.on("deck-stats-updated", onStatsUpdated);
        const unsubExtracts = plugin.syncEvents.on("extracts-updated", onExtractsUpdated);

        return () => {
            logRuntimeDebug("[SR-DynSync] ReviewSession: unsubscribed from sync events");
            unsubSync();
            unsubStats();
            unsubExtracts();
        };
    }, [
        activeReviewItem,
        forceUpdate,
        invalidatePreparedExtract,
        invalidatePreparedExtractsPreserving,
        logRuntimeDebug,
        plugin,
        refreshActiveDeckReviewSession,
        view,
    ]);

    useEffect(() => {
        if (activeReviewItem?.kind !== "extract") {
            return;
        }
        const currentExtract = plugin.extractStore?.get(activeReviewItem.uuid) ?? null;
        const currentExtractSource = currentExtract
            ? plugin.app.vault.getAbstractFileByPath(currentExtract.sourcePath)
            : null;
        if (
            !currentExtract ||
            currentExtract.stage !== "active" ||
            !(currentExtractSource instanceof TFile)
        ) {
            invalidatePreparedExtract(activeReviewItem.uuid, currentExtract?.sourcePath ?? null);
            const nextReviewItem = resolveNextReviewItem(activeDeckPathRef.current);
            if (nextReviewItem) {
                setActiveReviewItem(nextReviewItem);
                setReviewUiResetToken((value) => value + 1);
                forceUpdate();
            } else {
                void plugin.flushReviewPersistence(1200);
                reviewUndoStackRef.current = [];
                plugin.setSRViewInFocus(false);
                setDirection(-1);
                setView("deck-list");
                setActiveReviewItem(null);
                forceUpdate();
            }
            return;
        }
        let cancelled = false;
        void prepareExtractReview(activeReviewItem.uuid).then(() => {
            if (!cancelled) {
                forceUpdate();
            }
        });
        return () => {
            cancelled = true;
        };
    }, [
        activeReviewItem,
        forceUpdate,
        plugin,
        plugin.extractStore,
        prepareExtractReview,
        resolveNextReviewItem,
        reviewUiResetToken,
    ]);

    useEffect(() => {
        if (activeReviewItem?.kind !== "extract") {
            return;
        }
        if (!preparedExtractsRef.current.has(activeReviewItem.uuid)) {
            return;
        }

        const lookaheadUuids = getExtractLookaheadUuids(activeReviewItem.uuid);
        const preload = () => {
            lookaheadUuids.forEach((uuid) => {
                void prepareExtractReview(uuid).catch((error) => {
                    console.error("[SR-Extract] Failed to preload extract review", error);
                });
            });
        };

        const requestIdle =
            typeof window.requestIdleCallback === "function" ? window.requestIdleCallback : null;
        if (requestIdle) {
            const idleId = requestIdle(preload, { timeout: 800 });
            return () => window.cancelIdleCallback?.(idleId);
        }

        const timeoutId = window.setTimeout(preload, 0);
        return () => window.clearTimeout(timeoutId);
    }, [
        activeReviewItem,
        getExtractLookaheadUuids,
        prepareExtractReview,
        reviewUiResetToken,
        tick,
    ]);

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
        movedExtractsToEndRef.current = [];
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
            const extractResponseMap = [ReviewResponse.Reset, ReviewResponse.Good];
            const response =
                activeReviewItem?.kind === "extract"
                    ? (extractResponseMap[rating] ?? ReviewResponse.Good)
                    : (responseMap[rating] ?? ReviewResponse.Good);

            if (activeReviewItem?.kind === "extract") {
                interleavedFlashcardRunRef.current = 0;
                const reviewedExtract = plugin.extractStore?.get(activeReviewItem.uuid) ?? null;
                let reviewed: ExtractItem | null = null;
                try {
                    reviewed = await plugin.reviewExtract(
                        activeReviewItem.uuid,
                        response,
                        activeDeckPathRef.current,
                    );
                } catch (error) {
                    console.error("[SR-Extract] Failed to review extract", error);
                }
                if (reviewed && reviewedExtract) {
                    reviewUndoStackRef.current.push({
                        kind: "extract",
                        action: {
                            snapshot: { item: reviewedExtract },
                            countDeckName: activeDeckPathRef.current,
                        },
                    });
                }
                invalidatePreparedExtract(
                    activeReviewItem.uuid,
                    reviewedExtract?.sourcePath ?? null,
                );

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

            try {
                logRuntimeDebug("[SR-DynSync] ReviewSession: calling sequencer.processReview");
                sequencer.processReview(response);
                reviewUndoStackRef.current.push({ kind: "card" });
                interleavedFlashcardRunRef.current += 1;
                logRuntimeDebug("[SR-DynSync] ReviewSession: sequencer.processReview completed");
            } catch (e) {
                console.error("[SR] processReview 鐎殿喖鍊搁悥?", e);
            }

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
            invalidatePreparedExtract,
            resolveNextReviewItem,
            sequencer,
        ],
    );

    const handleUndo = useCallback(async () => {
        const undoEntry = reviewUndoStackRef.current.pop();
        if (!undoEntry) {
            if (!sequencer.canUndo) {
                new Notice(t("REVIEW_NO_UNDO"));
                return;
            }
            sequencer.undoReview();
            setReviewUiResetToken((value) => value + 1);
            forceUpdate();
            return;
        }

        if (undoEntry.kind === "card") {
            if (!sequencer.canUndo) {
                reviewUndoStackRef.current.push(undoEntry);
                new Notice(t("REVIEW_NO_UNDO"));
                return;
            }
            sequencer.undoReview();
            setReviewUiResetToken((value) => value + 1);
            forceUpdate();
            return;
        }

        if (undoEntry.kind === "extract-move-to-end") {
            movedExtractsToEndRef.current = movedExtractsToEndRef.current.filter(
                (uuid) => uuid !== undoEntry.uuid,
            );
            const restoredItem = plugin.extractStore?.get(undoEntry.uuid) ?? null;
            if (!restoredItem || restoredItem.stage !== "active") {
                new Notice(t("REVIEW_NO_UNDO"));
                forceUpdate();
                return;
            }
            invalidatePreparedExtract(undoEntry.uuid, undoEntry.sourcePath);
            try {
                await prepareExtractReview(undoEntry.uuid);
            } catch (error) {
                console.error("[SR-Extract] Failed to prepare moved extract after undo", error);
            }
            setActiveReviewItem({ kind: "extract", uuid: undoEntry.uuid });
            setReviewUiResetToken((value) => value + 1);
            forceUpdate();
            return;
        }

        invalidatePreparedExtract(
            undoEntry.action.snapshot.item.uuid,
            undoEntry.action.snapshot.item.sourcePath,
        );
        const restoredItem = await plugin.undoExtractReviewAction(undoEntry.action);
        if (!restoredItem) {
            reviewUndoStackRef.current.push(undoEntry);
            new Notice(t("REVIEW_NO_UNDO"));
            return;
        }
        invalidatePreparedExtract(restoredItem.uuid, restoredItem.sourcePath);
        try {
            await prepareExtractReview(restoredItem.uuid);
        } catch (error) {
            console.error("[SR-Extract] Failed to prepare restored extract after undo", error);
        }
        setActiveReviewItem({ kind: "extract", uuid: restoredItem.uuid });
        setReviewUiResetToken((value) => value + 1);
        forceUpdate();
    }, [forceUpdate, invalidatePreparedExtract, plugin, prepareExtractReview, sequencer]);

    const handleMoveExtractToEnd = useCallback(() => {
        if (activeReviewItem?.kind !== "extract") {
            return;
        }
        const movedExtract = plugin.extractStore?.get(activeReviewItem.uuid) ?? null;
        if (!movedExtract || movedExtract.stage !== "active") {
            new Notice(t("REVIEW_NO_CARDS"));
            return;
        }

        movedExtractsToEndRef.current = movedExtractsToEndRef.current
            .filter((uuid) => uuid !== movedExtract.uuid)
            .concat(movedExtract.uuid);
        reviewUndoStackRef.current.push({
            kind: "extract-move-to-end",
            uuid: movedExtract.uuid,
            sourcePath: movedExtract.sourcePath,
        });

        const nextReviewItem = resolveNextReviewItem(activeDeckPathRef.current);
        if (nextReviewItem) {
            setActiveReviewItem(nextReviewItem);
            setReviewUiResetToken((value) => value + 1);
            forceUpdate();
            return;
        }

        handleExitReview();
    }, [activeReviewItem, forceUpdate, handleExitReview, plugin, resolveNextReviewItem]);

    // Remove the current card from tracking and leave review if nothing remains.
    const handleDelete = useCallback(async () => {
        if (activeReviewItem?.kind === "extract") {
            const deletedExtract = plugin.extractStore?.get(activeReviewItem.uuid) ?? null;
            if (!deletedExtract || deletedExtract.stage !== "active") {
                invalidatePreparedExtract(
                    activeReviewItem.uuid,
                    deletedExtract?.sourcePath ?? null,
                );
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

            const snapshot = cloneExtractItem(deletedExtract);
            const action: ExtractReviewUndoAction = {
                snapshot: { item: snapshot },
                countDeckName: activeDeckPathRef.current,
            };
            let graduated: ExtractItem | null = null;
            try {
                graduated = await plugin.graduateExtract(
                    activeReviewItem.uuid,
                    activeDeckPathRef.current,
                );
            } catch (error) {
                console.error("[SR-Extract] Failed to graduate extract", error);
                new Notice(t("EXTRACT_SAVE_FAILED"));
                return;
            }
            if (graduated) {
                reviewUndoStackRef.current.push({
                    kind: "extract",
                    action,
                });
            }
            invalidatePreparedExtract(activeReviewItem.uuid, deletedExtract?.sourcePath ?? null);
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
            setActiveReviewItem(
                resolveNextReviewItem(activeDeckPathRef.current) ?? { kind: "card" },
            );
            setReviewUiResetToken((value) => value + 1);
            forceUpdate();
        } else {
            handleExitReview();
        }
    }, [
        activeReviewItem,
        cloneExtractItem,
        forceUpdate,
        handleExitReview,
        invalidatePreparedExtract,
        plugin,
        resolveNextReviewItem,
        sequencer,
    ]);

    const handleSetExtractDate = useCallback(
        async (dueAt: number) => {
            if (activeReviewItem?.kind !== "extract") {
                return;
            }
            const updatedExtract = plugin.extractStore?.get(activeReviewItem.uuid) ?? null;
            const updated = await plugin.setExtractReviewDate(
                activeReviewItem.uuid,
                dueAt,
                activeDeckPathRef.current,
            );
            if (updated && updatedExtract) {
                reviewUndoStackRef.current.push({
                    kind: "extract",
                    action: {
                        snapshot: { item: updatedExtract },
                        countDeckName: activeDeckPathRef.current,
                    },
                });
            }
            invalidatePreparedExtract(activeReviewItem.uuid, updatedExtract?.sourcePath ?? null);
            const nextReviewItem = resolveNextReviewItem(activeDeckPathRef.current);
            if (nextReviewItem) {
                setActiveReviewItem(nextReviewItem);
                setReviewUiResetToken((value) => value + 1);
                forceUpdate();
            } else {
                handleExitReview();
            }
        },
        [
            activeReviewItem,
            forceUpdate,
            handleExitReview,
            invalidatePreparedExtract,
            plugin,
            resolveNextReviewItem,
        ],
    );

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
                                <ExtractLinearCardReview
                                    plugin={plugin}
                                    sequencer={sequencer}
                                    extractUuid={activeReviewItem.uuid}
                                    preparedExtract={
                                        preparedExtractsRef.current.get(activeReviewItem.uuid) ??
                                        null
                                    }
                                    prepareExtractReview={prepareExtractReview}
                                    invalidatePreparedExtract={invalidatePreparedExtract}
                                    preparedRefreshToken={activeExtractRefreshToken}
                                    deckPath={activeDeckPathRef.current}
                                    applyExtractDailyLimits={
                                        reviewMode !== FlashcardReviewMode.Cram
                                    }
                                    markdownOwner={markdownOwner}
                                    clearReviewMobileChromeCover={clearReviewMobileChromeCover}
                                    onAnswer={(rating) => {
                                        void handleAnswer(rating);
                                    }}
                                    onUndo={() => {
                                        void handleUndo();
                                    }}
                                    onMoveToEnd={() => {
                                        void handleMoveExtractToEnd();
                                    }}
                                    onDelete={() => {
                                        void handleDelete();
                                    }}
                                    onSetExtractDate={(dueAt) => {
                                        void handleSetExtractDate(dueAt);
                                    }}
                                    onExit={handleExitReview}
                                    uiResetToken={reviewUiResetToken}
                                    editModeToggleToken={reviewEditModeToggleToken}
                                    shouldHandleReviewHotkeys={shouldHandleReviewHotkeys}
                                    overlayMobileNavbar={shouldOverlayMobileNavbarForReview}
                                />
                            ) : (
                                <CardReviewView
                                    sequencer={sequencer}
                                    plugin={plugin}
                                    clearReviewMobileChromeCover={clearReviewMobileChromeCover}
                                    markdownOwner={markdownOwner}
                                    applyExtractDailyLimits={
                                        reviewMode !== FlashcardReviewMode.Cram
                                    }
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
                                    editModeToggleToken={reviewEditModeToggleToken}
                                    shouldHandleReviewHotkeys={shouldHandleReviewHotkeys}
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

        const result = buildDeckTreeUIState(remainingDeckTree, plugin);
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

    const handleDeckSettingsClick = useCallback(
        (deck: DeckState, anchorEl: HTMLElement) => {
            new DeckOptionsModal(plugin.app, {
                plugin,
                deckName: deck.deckName,
                deckPath: deck.fullPath || deck.deckName,
                anchorRect: isPhoneLayout ? null : getDeckOptionsModalAnchorRect(anchorEl),
                onSaved: () => {
                    if (plugin.data.settings.showRuntimeDebugMessages) {
                        console.debug("[ReviewSession] DeckOptions saved");
                    }
                },
            }).open();
        },
        [isPhoneLayout, plugin],
    );

    const handleTreeScroll = useCallback(() => {
        const host = treeHostRef.current;
        if (!host) return;
        onScrollTopChange(host.scrollTop);
    }, [onScrollTopChange]);

    const handleTreeResizeStart = useCallback(
        (event: React.MouseEvent | React.TouchEvent, direction: "w" | "e") => {
            if (isPhoneLayout) return;
            const isTouchEvent = "touches" in event;
            if (!isTouchEvent) {
                event.preventDefault();
            }
            event.stopPropagation();

            const host = treeHostRef.current;
            const shell = treeShellRef.current;
            if (!host || !shell) return;

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
        </div>
    );
};

// ==========================================
// Extract Review adapter
// ==========================================

interface ExtractLinearCardReviewProps {
    plugin: SRPlugin;
    sequencer: IFlashcardReviewSequencer;
    extractUuid: string;
    preparedExtract: PreparedExtractReview | null;
    prepareExtractReview: (uuid: string) => Promise<PreparedExtractReview | null>;
    invalidatePreparedExtract: (
        uuid?: string | null,
        sourcePath?: string | null,
        options?: InvalidatePreparedExtractOptions,
    ) => void;
    preparedRefreshToken: number;
    deckPath: string | null;
    applyExtractDailyLimits: boolean;
    markdownOwner: Component;
    clearReviewMobileChromeCover: () => void;
    onAnswer: (rating: number) => void;
    onUndo: () => void;
    onMoveToEnd: () => void;
    onDelete: () => void;
    onSetExtractDate: (dueAt: number) => void;
    onExit: () => void;
    uiResetToken: number;
    editModeToggleToken: number;
    shouldHandleReviewHotkeys: () => boolean;
    overlayMobileNavbar: boolean;
}

function basenameFromPath(path: string, fallback: string): string {
    const normalizedPath = path.replace(/\\/g, "/");
    const basename = normalizedPath.split("/").filter(Boolean).pop();
    return (basename || fallback).replace(/\.md$/i, "");
}

const ExtractLinearCardReview: React.FC<ExtractLinearCardReviewProps> = ({
    plugin,
    sequencer,
    extractUuid,
    preparedExtract,
    prepareExtractReview,
    invalidatePreparedExtract,
    preparedRefreshToken,
    deckPath,
    applyExtractDailyLimits,
    markdownOwner,
    clearReviewMobileChromeCover,
    onAnswer,
    onUndo,
    onMoveToEnd,
    onDelete,
    onSetExtractDate,
    onExit,
    uiResetToken,
    editModeToggleToken,
    shouldHandleReviewHotkeys,
    overlayMobileNavbar,
}) => {
    const extract = plugin.extractStore?.get(extractUuid) ?? null;
    const [body, setBody] = useState(preparedExtract?.rawMarkdown ?? extract?.rawMarkdown ?? "");
    const [memo, setMemo] = useState(extract?.memo ?? "");
    const [context, setContext] = useState<ExtractReviewContext | null>(
        preparedExtract?.context ?? null,
    );
    const [contextDraft, setContextDraft] = useState<ExtractContextUpdate | null>(
        preparedExtract?.draft ?? null,
    );
    const [contextLoadError, setContextLoadError] = useState<string | null>(null);
    const [contextRetryToken, setContextRetryToken] = useState(0);
    const bodyValueRef = useRef(body);
    const bodyDirtyRef = useRef(false);
    const memoValueRef = useRef(extract?.memo ?? "");
    const memoDirtyRef = useRef(false);
    const memoSaveTimerRef = useRef<number | null>(null);
    const contextRef = useRef<ExtractReviewContext | null>(null);
    const contextDraftRef = useRef<ExtractContextUpdate | null>(null);
    const contextDirtyRef = useRef(false);
    const contextSaveInFlightDraftRef = useRef<ExtractContextUpdate | null>(null);
    const contextIdentityRef = useRef({ extractUuid, uiResetToken });
    const preparedRefreshTokenRef = useRef(preparedRefreshToken);
    const bodySaveTimerRef = useRef<number | null>(null);
    const [extractPriority, setExtractPriority] = useState(extract?.priority ?? 5);
    const [priorityRefreshToken, setPriorityRefreshToken] = useState(0);
    const logRuntimeDebug = useCallback(
        (...args: unknown[]) => {
            if (plugin.data.settings.showRuntimeDebugMessages) {
                console.debug(...args);
            }
        },
        [plugin],
    );

    const sourcePath = extract?.sourcePath ?? "";
    const sourceFile = useMemo(() => {
        if (!sourcePath) {
            return null;
        }
        const abstractFile = plugin.app.vault.getAbstractFileByPath(sourcePath);
        return abstractFile instanceof TFile ? abstractFile : null;
    }, [plugin.app.vault, sourcePath]);
    const anchorLine = Math.max(0, extract?.sourceAnchor.startLine ?? 0);
    const filename =
        sourceFile?.basename ?? basenameFromPath(sourcePath, t("EXTRACT_SOURCE_MISSING"));

    const reviewIntervals = useMemo(
        () => plugin.getExtractReviewIntervals(extractUuid),
        [extractUuid, plugin, priorityRefreshToken, uiResetToken],
    );
    const extractReviewButtonLabels = useMemo(
        () => [reviewIntervals[0] ?? "", reviewIntervals[2] ?? reviewIntervals[1] ?? ""],
        [reviewIntervals],
    );
    const cardStats = sequencer.getSessionDeckStats();
    const extractStats = useMemo(
        () => plugin.getExtractReviewStats(deckPath, applyExtractDailyLimits),
        [applyExtractDailyLimits, deckPath, plugin, uiResetToken],
    );
    const breadcrumbs = useMemo(() => {
        if (!sourceFile) {
            return [];
        }
        return new SrTFile(
            plugin.app.vault,
            plugin.app.metadataCache,
            sourceFile,
        ).getQuestionContext(anchorLine);
    }, [anchorLine, plugin.app.metadataCache, plugin.app.vault, sourceFile]);

    useEffect(() => {
        setExtractPriority(extract?.priority ?? 5);
    }, [extract?.priority, extractUuid]);

    useEffect(() => {
        let cancelled = false;
        let retryTimerId: number | null = null;
        const previousIdentity = contextIdentityRef.current;
        const identityChanged =
            previousIdentity.extractUuid !== extractUuid ||
            previousIdentity.uiResetToken !== uiResetToken;
        contextIdentityRef.current = { extractUuid, uiResetToken };
        const refreshTokenChanged = preparedRefreshTokenRef.current !== preparedRefreshToken;
        preparedRefreshTokenRef.current = preparedRefreshToken;
        const nextExtract = plugin.extractStore?.get(extractUuid) ?? null;
        const nextPrepared =
            preparedExtract && preparedExtract.uuid === extractUuid ? preparedExtract : null;
        const nextBody = nextPrepared?.rawMarkdown ?? nextExtract?.rawMarkdown ?? "";
        const draftAtLoadStart = contextDraftRef.current;
        const canKeepExistingContext =
            !identityChanged && contextRef.current !== null && contextDraftRef.current !== null;
        const applyBody = (value: string) => {
            setBody(value);
            bodyValueRef.current = value;
            bodyDirtyRef.current = false;
        };
        const clearContext = () => {
            contextRef.current = null;
            contextDraftRef.current = null;
            contextDirtyRef.current = false;
            setContext(null);
            setContextDraft(null);
        };
        setContextLoadError(null);
        if (nextPrepared && !refreshTokenChanged) {
            applyBody(nextBody);
            if (identityChanged || !contextDirtyRef.current || contextDraftRef.current === null) {
                contextRef.current = nextPrepared.context;
                contextDraftRef.current = nextPrepared.draft;
                contextDirtyRef.current = false;
                setContext(nextPrepared.context);
                setContextDraft(nextPrepared.draft);
            } else {
                logRuntimeDebug("[SR-ExtractSave] extract context prepared-skip-active-draft", {
                    extractUuid,
                    reason: "newer-local-draft",
                    draftLength: contextDraftRef.current.markdown.length,
                });
            }
            return () => {
                cancelled = true;
            };
        }
        if (!nextExtract || nextExtract.stage !== "active") {
            applyBody(nextBody);
            clearContext();
            return () => {
                cancelled = true;
            };
        }
        if (!sourceFile) {
            applyBody(nextBody);
            clearContext();
            return () => {
                cancelled = true;
            };
        }
        applyBody(nextBody);
        if (!canKeepExistingContext) {
            clearContext();
        }
        logRuntimeDebug("[SR-ExtractSave] extract context load:start", {
            extractUuid,
            uiResetToken,
            sourcePath: nextExtract?.sourcePath ?? null,
            sourceMode: nextExtract?.sourceMode ?? null,
        });
        void prepareExtractReview(extractUuid)
            .then((prepared) => {
                if (cancelled) {
                    return;
                }
                if (!prepared) {
                    if (!canKeepExistingContext) {
                        clearContext();
                    }
                    retryTimerId = window.setTimeout(() => {
                        if (!cancelled) {
                            setContextRetryToken((value) => value + 1);
                        }
                    }, 250);
                    return;
                }
                const nextContext = prepared.context;
                const nextDraft = prepared.draft;
                setBody(prepared.rawMarkdown);
                bodyValueRef.current = prepared.rawMarkdown;
                bodyDirtyRef.current = false;
                if (
                    contextSaveInFlightDraftRef.current === null &&
                    !contextDirtyRef.current &&
                    contextDraftRef.current === draftAtLoadStart
                ) {
                    setContext(nextContext);
                    contextRef.current = nextContext;
                    setContextDraft(nextDraft);
                    contextDraftRef.current = nextDraft;
                    contextDirtyRef.current = false;
                } else {
                    logRuntimeDebug("[SR-ExtractSave] extract context background-reload-skipped", {
                        extractUuid,
                        reason:
                            contextSaveInFlightDraftRef.current !== null
                                ? "context-save-in-flight"
                                : "newer-local-draft",
                        draftLength: contextDraftRef.current?.markdown.length ?? null,
                    });
                }
                logRuntimeDebug("[SR-ExtractSave] extract context load:done", {
                    extractUuid,
                    hasContext: nextContext !== null,
                    markdownLength: nextContext?.markdown.length ?? 0,
                    currentOuterFrom: nextContext?.currentOuterFrom ?? null,
                    currentOuterTo: nextContext?.currentOuterTo ?? null,
                });
            })
            .catch((error) => {
                if (cancelled) {
                    return;
                }
                setContextLoadError(error instanceof Error ? error.message : String(error));
                console.error("[SR-Extract] Failed to prepare extract review", error);
            });
        return () => {
            cancelled = true;
            if (retryTimerId !== null) {
                window.clearTimeout(retryTimerId);
            }
        };
    }, [
        contextRetryToken,
        extractUuid,
        logRuntimeDebug,
        plugin.extractStore,
        prepareExtractReview,
        preparedExtract,
        preparedRefreshToken,
        sourceFile,
        uiResetToken,
    ]);

    useEffect(() => {
        bodyValueRef.current = body;
    }, [body]);

    useEffect(() => {
        const nextMemo = extract?.memo ?? "";
        setMemo(nextMemo);
        memoValueRef.current = nextMemo;
        memoDirtyRef.current = false;
        if (memoSaveTimerRef.current !== null) {
            window.clearTimeout(memoSaveTimerRef.current);
            memoSaveTimerRef.current = null;
        }
    }, [extractUuid, extract?.memo]);

    const clearSaveTimer = useCallback(() => {
        if (bodySaveTimerRef.current !== null) {
            window.clearTimeout(bodySaveTimerRef.current);
            bodySaveTimerRef.current = null;
        }
    }, []);

    const clearMemoSaveTimer = useCallback(() => {
        if (memoSaveTimerRef.current !== null) {
            window.clearTimeout(memoSaveTimerRef.current);
            memoSaveTimerRef.current = null;
        }
    }, []);

    const saveBodyNow = useCallback(async () => {
        clearSaveTimer();
        logRuntimeDebug("[SR-ExtractSave] saveBodyNow:enter", {
            extractUuid,
            hasContextDirty: contextDirtyRef.current,
            hasBodyDirty: bodyDirtyRef.current,
            hasContext: contextRef.current !== null,
            hasContextDraft: contextDraftRef.current !== null,
            bodyLength: bodyValueRef.current.length,
            draftLength: contextDraftRef.current?.markdown.length ?? null,
        });
        if (contextDirtyRef.current && contextRef.current && contextDraftRef.current) {
            const contextToSave = contextRef.current;
            const draftToSave = contextDraftRef.current;
            contextDirtyRef.current = false;
            logRuntimeDebug("[SR-ExtractSave] saveBodyNow:context-save-start", {
                extractUuid,
                markdownLength: draftToSave.markdown.length,
                currentOuterFrom: draftToSave.ranges.currentOuterFrom,
                currentOuterTo: draftToSave.ranges.currentOuterTo,
            });
            contextSaveInFlightDraftRef.current = draftToSave;
            try {
                const updated = await plugin.updateExtractContextMarkdown(
                    extractUuid,
                    contextToSave,
                    draftToSave,
                );
                if (updated) {
                    invalidatePreparedExtract(extractUuid, updated.sourcePath, {
                        preservePrepared: true,
                        preservePreparing: true,
                    });
                    logRuntimeDebug("[SR-ExtractSave] saveBodyNow:context-save-success", {
                        extractUuid,
                        rawMarkdownLength: updated.rawMarkdown.length,
                        stage: updated.stage,
                    });
                    setBody(updated.rawMarkdown);
                    bodyValueRef.current = updated.rawMarkdown;
                    if (!contextDirtyRef.current && contextDraftRef.current === draftToSave) {
                        const nextContext = await plugin.getExtractReviewContext(extractUuid);
                        if (!contextDirtyRef.current && contextDraftRef.current === draftToSave) {
                            setContext(nextContext);
                            contextRef.current = nextContext;
                            const nextDraft = nextContext
                                ? { markdown: nextContext.markdown, ranges: nextContext }
                                : null;
                            setContextDraft(nextDraft);
                            contextDraftRef.current = nextDraft;
                            logRuntimeDebug("[SR-ExtractSave] saveBodyNow:context-reloaded", {
                                extractUuid,
                                hasContext: nextContext !== null,
                                markdownLength: nextContext?.markdown.length ?? 0,
                            });
                        } else {
                            logRuntimeDebug("[SR-ExtractSave] saveBodyNow:context-reload-skipped", {
                                extractUuid,
                                reason:
                                    contextDraftRef.current === null
                                        ? "active-context-cleared-by-refresh"
                                        : "newer-local-draft-after-reload",
                                draftLength: contextDraftRef.current?.markdown.length ?? null,
                            });
                        }
                    } else {
                        logRuntimeDebug("[SR-ExtractSave] saveBodyNow:context-reload-skipped", {
                            extractUuid,
                            reason:
                                contextDraftRef.current === null
                                    ? "active-context-cleared-by-refresh"
                                    : "newer-local-draft",
                            draftLength: contextDraftRef.current?.markdown.length ?? null,
                        });
                    }
                } else {
                    logRuntimeDebug("[SR-ExtractSave] saveBodyNow:context-save-null", {
                        extractUuid,
                        sourcePath: extract?.sourcePath ?? null,
                    });
                }
            } finally {
                if (contextSaveInFlightDraftRef.current === draftToSave) {
                    contextSaveInFlightDraftRef.current = null;
                }
            }
            return;
        }
        if (!bodyDirtyRef.current) {
            logRuntimeDebug("[SR-ExtractSave] saveBodyNow:skip-no-dirty", {
                extractUuid,
            });
            return;
        }
        bodyDirtyRef.current = false;
        logRuntimeDebug("[SR-ExtractSave] saveBodyNow:raw-save-start", {
            extractUuid,
            bodyLength: bodyValueRef.current.length,
        });
        const updated = await plugin.updateExtractRawMarkdown(extractUuid, bodyValueRef.current);
        if (updated) {
            invalidatePreparedExtract(extractUuid, updated.sourcePath);
            logRuntimeDebug("[SR-ExtractSave] saveBodyNow:raw-save-success", {
                extractUuid,
                rawMarkdownLength: updated.rawMarkdown.length,
            });
            setBody(updated.rawMarkdown);
            bodyValueRef.current = updated.rawMarkdown;
        } else {
            logRuntimeDebug("[SR-ExtractSave] saveBodyNow:raw-save-null", {
                extractUuid,
                sourcePath: extract?.sourcePath ?? null,
            });
        }
    }, [
        clearSaveTimer,
        extract?.sourcePath,
        extractUuid,
        invalidatePreparedExtract,
        logRuntimeDebug,
        plugin,
    ]);

    const saveMemoNow = useCallback(async () => {
        clearMemoSaveTimer();
        if (!memoDirtyRef.current) {
            return;
        }
        const memoToSave = memoValueRef.current;
        logRuntimeDebug("[SR-ExtractMemo] saveMemoNow:start", {
            extractUuid,
            memoLength: memoToSave.length,
        });
        const updated = await plugin.updateExtractMemo(extractUuid, memoToSave);
        if (memoValueRef.current === memoToSave) {
            memoDirtyRef.current = false;
        }
        if (updated) {
            logRuntimeDebug("[SR-ExtractMemo] saveMemoNow:success", {
                extractUuid,
                memoLength: updated.memo.length,
            });
        } else {
            logRuntimeDebug("[SR-ExtractMemo] saveMemoNow:null", {
                extractUuid,
            });
        }
    }, [clearMemoSaveTimer, extractUuid, logRuntimeDebug, plugin]);

    const flushBodySave = useCallback(async () => {
        await saveBodyNow();
    }, [saveBodyNow]);

    const flushMemoSave = useCallback(async () => {
        await saveMemoNow();
    }, [saveMemoNow]);

    useEffect(() => {
        return () => {
            clearSaveTimer();
            clearMemoSaveTimer();
        };
    }, [clearMemoSaveTimer, clearSaveTimer]);

    const scheduleBodySave = useCallback(
        (value: string) => {
            setBody(value);
            bodyValueRef.current = value;
            bodyDirtyRef.current = true;
            clearSaveTimer();
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
            clearMemoSaveTimer();
            memoSaveTimerRef.current = window.setTimeout(() => {
                void saveMemoNow().catch((error) => {
                    console.error("[SR-Extract] Failed to save extract memo", error);
                    new Notice(t("EXTRACT_SAVE_FAILED"));
                });
            }, 700);
        },
        [clearMemoSaveTimer, saveMemoNow],
    );

    const handleUpdateExtractPriority = useCallback(
        (priority: number) => {
            setExtractPriority(priority);
            void plugin
                .updateExtractPriority(extractUuid, priority)
                .then((updated) => {
                    if (updated) {
                        setExtractPriority(updated.priority);
                        setPriorityRefreshToken((token) => token + 1);
                    }
                })
                .catch((error) => {
                    console.error("[SR-Extract] Failed to save extract priority", error);
                    new Notice(t("EXTRACT_SAVE_FAILED"));
                });
        },
        [extractUuid, plugin],
    );

    const scheduleContextSave = useCallback(
        (update: ExtractContextUpdate) => {
            const hadTimer = bodySaveTimerRef.current !== null;
            const wasDirty = contextDirtyRef.current;
            setContextDraft(update);
            contextDraftRef.current = update;
            contextDirtyRef.current = true;
            clearSaveTimer();
            if (!wasDirty || !hadTimer) {
                logRuntimeDebug("[SR-ExtractSave] scheduleContextSave", {
                    extractUuid,
                    markdownLength: update.markdown.length,
                    currentOuterFrom: update.ranges.currentOuterFrom,
                    currentOuterTo: update.ranges.currentOuterTo,
                    hadTimer,
                    wasDirty,
                });
            }
            bodySaveTimerRef.current = window.setTimeout(() => {
                logRuntimeDebug("[SR-ExtractSave] scheduleContextSave:timer-fired", {
                    extractUuid,
                    markdownLength: contextDraftRef.current?.markdown.length ?? null,
                });
                void saveBodyNow().catch((error) => {
                    console.error("[SR-Extract] Failed to save extract context", error);
                    logRuntimeDebug("[SR-ExtractSave] scheduleContextSave:timer-failed", {
                        extractUuid,
                        message: error instanceof Error ? error.message : String(error),
                    });
                    new Notice(t("EXTRACT_CONTEXT_SAVE_FAILED"));
                });
            }, 700);
        },
        [clearSaveTimer, extractUuid, logRuntimeDebug, saveBodyNow],
    );

    const handleAnswer = useCallback(
        async (rating: number) => {
            try {
                await flushMemoSave();
                await flushBodySave();
            } catch (error) {
                console.error("[SR-Extract] Failed to flush before review", error);
                new Notice(t("EXTRACT_SAVE_FAILED"));
            }
            onAnswer(rating);
        },
        [flushBodySave, flushMemoSave, onAnswer],
    );

    const handleDelete = useCallback(async () => {
        try {
            await flushMemoSave();
            await flushBodySave();
        } catch (error) {
            console.error("[SR-Extract] Failed to flush before graduation", error);
            new Notice(t("EXTRACT_SAVE_FAILED"));
        }
        onDelete();
    }, [flushBodySave, flushMemoSave, onDelete]);

    const handleSetExtractDate = useCallback(() => {
        new ExtractReviewDateModal(plugin.app, (dueAt) => {
            void (async () => {
                try {
                    await flushMemoSave();
                    await flushBodySave();
                } catch (error) {
                    console.error("[SR-Extract] Failed to flush before custom review date", error);
                    new Notice(t("EXTRACT_SAVE_FAILED"));
                    return;
                }
                onSetExtractDate(dueAt);
            })();
        }).open();
    }, [flushBodySave, flushMemoSave, onSetExtractDate, plugin.app]);

    const handleMoveToEnd = useCallback(async () => {
        try {
            await flushMemoSave();
            await flushBodySave();
        } catch (error) {
            console.error("[SR-Extract] Failed to flush before moving extract to end", error);
            new Notice(t("EXTRACT_SAVE_FAILED"));
            return;
        }
        onMoveToEnd();
    }, [flushBodySave, flushMemoSave, onMoveToEnd]);

    const handleOpenSource = useCallback(
        async (options?: { newTab?: boolean }) => {
            if (!extract || !sourceFile) {
                new Notice(t("EXTRACT_SOURCE_MISSING"));
                return;
            }

            clearReviewMobileChromeCover();
            const leaf = resolveNavigationLeaf(plugin, sourceFile, options);
            await leaf.openFile(sourceFile, buildOpenStateForLine(anchorLine));
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
        [anchorLine, clearReviewMobileChromeCover, extract, plugin, sourceFile],
    );

    const handleOpenBreadcrumb = useCallback(
        async (breadcrumb: QuestionContextBreadcrumb, options?: { newTab?: boolean }) => {
            if (!sourceFile) {
                new Notice(t("EXTRACT_SOURCE_MISSING"));
                return;
            }

            clearReviewMobileChromeCover();
            const activeLeaf = resolveNavigationLeaf(plugin, sourceFile, options);
            await activeLeaf.openFile(sourceFile, buildOpenStateForLine(breadcrumb.line));
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
        },
        [clearReviewMobileChromeCover, plugin, sourceFile],
    );

    const renderExtractMarkdown = useCallback(
        (text: string, el: HTMLElement) =>
            MarkdownRenderer.render(plugin.app, text, el, sourcePath, markdownOwner),
        [markdownOwner, plugin.app, sourcePath],
    );

    const cardState: CardState = useMemo(
        () => ({
            front: body || t("EXTRACT_NO_ACTIVE_ITEMS"),
            back: "",
            responseButtonLabels: extractReviewButtonLabels,
        }),
        [body, extractReviewButtonLabels],
    );
    const reviewStats = useMemo(
        () => combineCardAndExtractReviewStats(cardStats, extractStats),
        [
            cardStats.dueCount,
            cardStats.learningCount,
            cardStats.newCount,
            extractStats.dueCount,
            extractStats.newCount,
        ],
    );
    const settings = plugin.data.settings;
    const isPhoneLayout = Platform.isPhone;
    const allowResize = !isPhoneLayout;
    const hasReviewIntervals = reviewIntervals.some((label) => label !== "-");
    const cardType: "new" | "learning" | "due" | undefined =
        extract && extract.stage === "active" && hasReviewIntervals
            ? extract.timesReviewed === 0 || extract.nextReview === 0
                ? "new"
                : "due"
            : undefined;
    const extractDebugStatus =
        context && contextDraft
            ? null
            : {
                  stage: contextLoadError
                      ? "context-load-error"
                      : preparedExtract
                        ? "prepared-context-missing"
                        : "context-loading",
                  detail: {
                      extractUuid,
                      sourcePath: sourcePath || null,
                      hasExtract: !!extract,
                      hasPreparedExtract: !!preparedExtract,
                      rawMarkdownLength: body.length,
                  },
                  error: contextLoadError ?? undefined,
              };

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
                reviewKind="extract"
                card={cardState}
                uiResetToken={uiResetToken}
                extractIdentityKey={extractUuid}
                editModeToggleToken={editModeToggleToken}
                shouldHandleReviewHotkeys={shouldHandleReviewHotkeys}
                deckPath={deckPath ?? undefined}
                stats={reviewStats}
                cardType={cardType}
                type="basic"
                filename={filename}
                breadcrumbs={breadcrumbs}
                autoAdvanceSeconds={0}
                showProgressBar={false}
                progressBarStyle={settings.progressBarStyle}
                onAnswer={(rating) => {
                    void handleAnswer(rating);
                }}
                onUndo={onUndo}
                onMoveToEnd={() => {
                    void handleMoveToEnd();
                }}
                onOpenNote={(options) => {
                    void handleOpenSource(options);
                }}
                onOpenBreadcrumb={(breadcrumb, options) => {
                    void handleOpenBreadcrumb(breadcrumb, options);
                }}
                onDelete={() => {
                    void handleDelete();
                }}
                onSetExtractDate={handleSetExtractDate}
                onExit={onExit}
                onResize={handleResize}
                renderMarkdown={renderExtractMarkdown}
                width={settings.reactFlashcardWidth}
                height={settings.reactFlashcardHeight}
                isMobile={isPhoneLayout}
                allowResize={allowResize}
                overlayMobileNavbar={overlayMobileNavbar}
                plugin={plugin}
                rawContent={body}
                onUpdateContent={scheduleBodySave}
                extractMemo={memo}
                onUpdateExtractMemo={scheduleMemoSave}
                extractPriority={extractPriority}
                onUpdateExtractPriority={handleUpdateExtractPriority}
                extractContext={context}
                extractContextDraft={contextDraft}
                extractDebugStatus={extractDebugStatus}
                onUpdateExtractContext={scheduleContextSave}
                extractActionLabels={{
                    again: t("EXTRACT_REVIEW_AGAIN"),
                    good: t("EXTRACT_REVIEW_GOOD"),
                    set: t("EXTRACT_REVIEW_SET_DATE"),
                    graduate: t("EXTRACT_REVIEW_GRADUATE"),
                }}
            />
        </div>
    );
};

// ==========================================
// Card Review
// ==========================================

interface CardReviewViewProps {
    sequencer: IFlashcardReviewSequencer;
    plugin: SRPlugin;
    clearReviewMobileChromeCover: () => void;
    markdownOwner: Component;
    applyExtractDailyLimits: boolean;
    onAnswer: (rating: number) => void;
    onUndo: () => void;
    onDelete: () => void;
    onExit: () => void;
    tick: number;
    uiResetToken: number;
    editModeToggleToken: number;
    shouldHandleReviewHotkeys: () => boolean;
    overlayMobileNavbar: boolean;
}

const CardReviewView: React.FC<CardReviewViewProps> = ({
    sequencer,
    plugin,
    clearReviewMobileChromeCover,
    markdownOwner,
    applyExtractDailyLimits,
    onAnswer,
    onUndo,
    onDelete,
    onExit,
    tick,
    uiResetToken,
    editModeToggleToken,
    shouldHandleReviewHotkeys,
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

    const deckPath = deck.getTopicPath().path.join("/") || deck.deckName;

    // Pull counters from the deck session the user entered from.
    const cardStats = sequencer.getSessionDeckStats();
    const extractStats = useMemo(
        () => plugin.getExtractReviewStats(deckPath, applyExtractDailyLimits),
        [applyExtractDailyLimits, deckPath, plugin, tick, uiResetToken],
    );
    if (settings.showRuntimeDebugMessages) {
        console.debug(
            `[DEBUG_REVIEW_UI] Card Review UI counters for deck '${deck.deckName}' -> New: ${cardStats.newCount}, Learning: ${cardStats.learningCount}, Due: ${cardStats.dueCount}, ExtractNew: ${extractStats.newCount}, ExtractDue: ${extractStats.dueCount}`,
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
                queue: item.queue ?? "",
                nextReview: item.nextReview ?? 0,
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
        () => combineCardAndExtractReviewStats(cardStats, extractStats),
        [
            cardStats.dueCount,
            cardStats.learningCount,
            cardStats.newCount,
            extractStats.dueCount,
            extractStats.newCount,
        ],
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
                editModeToggleToken={editModeToggleToken}
                shouldHandleReviewHotkeys={shouldHandleReviewHotkeys}
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
