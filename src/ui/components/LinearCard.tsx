/** @jsxImportSource react */
import React, {
    CSSProperties,
    useState,
    useEffect,
    useLayoutEffect,
    useCallback,
    useRef,
    Fragment,
    ReactNode,
} from "react";
import type { FC } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    RotateCcw,
    ThumbsDown,
    Check,
    Zap,
    ChevronRight,
    Eye,
    MoreHorizontal,
    FileText,
    Edit3,
    Info,
    Clock,
    Trash2,
    Undo2,
    ArrowLeft,
    Save,
} from "lucide-react";
import { CardDebugModal } from "./CardDebugModal";
import type { CardDebugData } from "./CardDebugModal";
import { CardEditorView } from "./CardEditorView";
import type SRPlugin from "src/main";
import type { CardReviewTarget } from "src/question-type";
import type { QuestionContextBreadcrumb } from "src/SRFile";
import "../styles/linear-card.css";
import { t } from "src/lang/helpers";
import { DEFAULT_PROGRESS_BAR_STYLE, type ProgressBarStyle } from "src/settings";
import { transformLatex } from "../../utils/latexTransformer";
import { createSanitizedHtmlFragment } from "src/util/safeHtml";
import {
    decodeUnifiedMarkerPayload,
    normalizeSrMarkers,
    postProcessMarkers,
    preTokenizeSrMarkers,
    toFallbackText,
    tryDecodeSrMarkerText,
} from "./linearCardMarkers";
import {
    buildScrollPositionInput,
    getCenteredScrollTop,
    getMixedCenterScrollTop,
} from "./clozeScrollPosition";

export interface CardState {
    front: string;
    back: string;
    review?: string;
    reviewTarget?: CardReviewTarget;
    responseButtonLabels?: string[];
}

export interface OpenNoteTargetOptions {
    newTab?: boolean;
}

type LinearCardReviewKind = "card" | "extract";

interface LinearCardProps {
    card?: CardState;
    uiResetToken?: number | string;
    deckPath?: string;
    stats?: { new: number; learning: number; due: number };
    reviewKind?: LinearCardReviewKind;
    type?: "basic" | "cloze";
    breadcrumbs?: QuestionContextBreadcrumb[];
    filename?: string;
    autoAdvanceSeconds?: number;
    showProgressBar?: boolean;
    progressBarStyle?: ProgressBarStyle;
    onAnswer?: (rating: number) => void;
    onShowAnswer?: () => void;
    onUndo?: () => void;
    onOpenNote?: (options?: OpenNoteTargetOptions) => void;
    onOpenBreadcrumb?: (
        breadcrumb: QuestionContextBreadcrumb,
        options?: OpenNoteTargetOptions,
    ) => void;
    onEditCard?: () => void;
    onPostpone?: () => void;
    onDelete?: () => void;
    onExit?: () => void;
    onResize?: (width: number, height: number) => void;
    renderMarkdown?: (content: string, el: HTMLElement) => Promise<void> | void;
    width?: number;
    height?: number;
    debugInfo?: CardDebugData | null;
    cardType?: "new" | "learning" | "due";
    isMobile?: boolean;
    allowResize?: boolean;
    overlayMobileNavbar?: boolean;
    rawContent?: string;
    plugin?: SRPlugin;
    onUpdateContent?: (text: string) => void;
}

interface InlineBreadcrumbsProps {
    breadcrumbs: QuestionContextBreadcrumb[];
    onOpenBreadcrumb?: (
        breadcrumb: QuestionContextBreadcrumb,
        options?: OpenNoteTargetOptions,
    ) => void;
    interactive?: boolean;
}

type ToastMsg = { icon: ReactNode; text: string; id: number };
type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type ClozeRenderFace = "single" | "front" | "back";
type HeaderBreadcrumbPlacement = "header" | "inline";
type HeaderBreadcrumbDisplay = "expanded" | "truncated";
type HeaderStatsMode = "regular" | "compact";

type HeaderLayoutState = {
    breadcrumbPlacement: HeaderBreadcrumbPlacement;
    breadcrumbDisplay: HeaderBreadcrumbDisplay;
    statsMode: HeaderStatsMode;
};

interface HeaderBreadcrumbsProps {
    breadcrumbs: QuestionContextBreadcrumb[];
    filename: string;
    showTrail: boolean;
    onOpenFile?: (options?: OpenNoteTargetOptions) => void;
    onOpenBreadcrumb?: (
        breadcrumb: QuestionContextBreadcrumb,
        options?: OpenNoteTargetOptions,
    ) => void;
    interactive?: boolean;
    expanded?: boolean;
}

interface HeaderStatsPanelProps {
    stats: { new: number; learning: number; due: number };
    currentType: "new" | "learning" | "due";
    compact?: boolean;
    animated?: boolean;
}

function BreadcrumbTrail({
    breadcrumbs,
    className,
    interactive = true,
    onOpenBreadcrumb,
    showLeadingSeparator = false,
    expanded = false,
}: {
    breadcrumbs: QuestionContextBreadcrumb[];
    className: string;
    interactive?: boolean;
    onOpenBreadcrumb?: (
        breadcrumb: QuestionContextBreadcrumb,
        options?: OpenNoteTargetOptions,
    ) => void;
    showLeadingSeparator?: boolean;
    expanded?: boolean;
}) {
    const canOpenBreadcrumbs = interactive && onOpenBreadcrumb;
    const createBreadcrumbMouseDownHandler = (breadcrumb: QuestionContextBreadcrumb) => {
        if (!canOpenBreadcrumbs) {
            return undefined;
        }

        return (event: React.MouseEvent<HTMLElement>) => {
            if (event.button !== 1) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            onOpenBreadcrumb(breadcrumb, { newTab: true });
        };
    };
    const createBreadcrumbClickHandler = (
        breadcrumb: QuestionContextBreadcrumb,
        newTab: boolean,
    ) => {
        if (!canOpenBreadcrumbs) {
            return undefined;
        }

        return (event: React.MouseEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenBreadcrumb(breadcrumb, newTab ? { newTab: true } : undefined);
        };
    };

    return (
        <div className={`${className}${expanded ? " sr-breadcrumbs-expanded" : ""}`}>
            {showLeadingSeparator && <ChevronRight size={10} className="sr-breadcrumb-separator" />}
            {breadcrumbs.map((crumb, index) => (
                <Fragment key={`${crumb.label}-${crumb.line}-${crumb.level}-${index}`}>
                    <span
                        className="sr-breadcrumb-item"
                        title={crumb.label}
                        onClick={createBreadcrumbClickHandler(crumb, false)}
                        onMouseDown={createBreadcrumbMouseDownHandler(crumb)}
                    >
                        {crumb.label}
                    </span>
                    {index < breadcrumbs.length - 1 && (
                        <ChevronRight size={10} className="sr-breadcrumb-separator" />
                    )}
                </Fragment>
            ))}
        </div>
    );
}

function HeaderBreadcrumbs({
    breadcrumbs,
    filename,
    showTrail,
    onOpenFile,
    onOpenBreadcrumb,
    interactive = true,
    expanded = false,
}: HeaderBreadcrumbsProps) {
    const fileNameLabel = filename.replace(/\.md$/i, "");
    const fileProps =
        interactive && onOpenFile
            ? {
                  onClick: (event: React.MouseEvent<HTMLElement>) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenFile();
                  },
                  onMouseDown: (event: React.MouseEvent<HTMLElement>) => {
                      if (event.button !== 1) {
                          return;
                      }
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenFile({ newTab: true });
                  },
                  title: t("UI_OPEN_FILE_LOCATION"),
              }
            : {};

    return (
        <div className="sr-breadcrumbs">
            <div className="sr-filename-badge" {...fileProps}>
                <FileText size={10} />
                <span>{fileNameLabel}</span>
            </div>
            {showTrail && breadcrumbs.length > 0 && (
                <BreadcrumbTrail
                    breadcrumbs={breadcrumbs}
                    className="sr-breadcrumbs-trail"
                    interactive={interactive}
                    onOpenBreadcrumb={onOpenBreadcrumb}
                    showLeadingSeparator
                    expanded={expanded}
                />
            )}
        </div>
    );
}

function StaticStatBadge({
    type,
    count,
    isActive,
}: {
    type: string;
    count: number;
    isActive: boolean;
}) {
    const colors: Record<string, string> = {
        new: "sr-stat-new",
        learn: "sr-stat-learning",
        due: "sr-stat-due",
    };

    return (
        <div className={`sr-stat-badge ${isActive ? "active" : ""}`}>
            <span className={`sr-stat-dot ${colors[type]}`} />
            <div className="sr-stat-info">
                <span className={`sr-stat-label ${colors[type]}`}>{type.toUpperCase()}</span>
                <span className="sr-stat-count">{count}</span>
            </div>
        </div>
    );
}

function HeaderStatsPanel({
    stats,
    currentType,
    compact = false,
    animated = true,
}: HeaderStatsPanelProps) {
    const BadgeComponent = animated ? StatBadge : StaticStatBadge;

    return (
        <div className={`sr-stats-panel ${compact ? "sr-stats-panel-compact" : ""}`}>
            <BadgeComponent type="new" count={stats.new} isActive={currentType === "new"} />
            <div className="sr-stats-divider" />
            <BadgeComponent
                type="learn"
                count={stats.learning}
                isActive={currentType === "learning"}
            />
            <div className="sr-stats-divider" />
            <BadgeComponent type="due" count={stats.due} isActive={currentType === "due"} />
        </div>
    );
}

export const LinearCard: FC<LinearCardProps> = ({
    card,
    uiResetToken,
    stats: initialStats = { new: 45, learning: 12, due: 68 },
    reviewKind = "card",
    type = "basic",
    breadcrumbs = [],
    filename = "Card.md",
    autoAdvanceSeconds = 10,
    showProgressBar = true,
    progressBarStyle = DEFAULT_PROGRESS_BAR_STYLE,
    onAnswer,
    onShowAnswer,
    onUndo,
    onOpenNote,
    onOpenBreadcrumb,
    onEditCard,
    onPostpone,
    onDelete,
    onExit,
    onResize,
    renderMarkdown,
    width = 720,
    height = 600,
    debugInfo,
    cardType,
    isMobile = false,
    allowResize = true,
    overlayMobileNavbar = false,
    rawContent = "",
    plugin,
    onUpdateContent,
}) => {
    const isExtractReview = reviewKind === "extract";
    const [size, setSize] = useState({ width, height });
    const wrapperRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const expandedRegularHeaderMeasureRef = useRef<HTMLDivElement>(null);
    const truncatedRegularHeaderMeasureRef = useRef<HTMLDivElement>(null);
    const inlineRegularHeaderMeasureRef = useRef<HTMLDivElement>(null);
    const inlineCompactHeaderMeasureRef = useRef<HTMLDivElement>(null);
    const contentScrollRef = useRef<HTMLDivElement>(null);
    const sizeRef = useRef({ width, height });
    const isResizingRef = useRef(false);

    useEffect(() => {
        const nextSize = { width, height };
        sizeRef.current = nextSize;
        if (isResizingRef.current) return;

        setSize(nextSize);
        if (cardRef.current) {
            cardRef.current.style.width = `min(100%, ${width}px)`;
            cardRef.current.style.height = `min(100%, ${height}px)`;
        }
    }, [width, height]);

    const [stats, setStats] = useState(initialStats);
    const [currentType, setCurrentType] = useState<"new" | "learning" | "due">(cardType || "due");
    const [headerLayout, setHeaderLayout] = useState<HeaderLayoutState>(() =>
        isMobile
            ? {
                  breadcrumbPlacement: "inline",
                  breadcrumbDisplay: "truncated",
                  statsMode: "compact",
              }
            : {
                  breadcrumbPlacement: "header",
                  breadcrumbDisplay: "expanded",
                  statsMode: "regular",
              },
    );
    const [isFlipped, setIsFlipped] = useState(false);
    const cardContentResetKey = [card?.front || "", card?.back || "", card?.review || ""].join(
        "\u001f",
    );
    const cardUiResetKey =
        uiResetToken === undefined
            ? cardContentResetKey
            : `${String(uiResetToken)}\u001f${cardContentResetKey}`;
    const lastCardUiResetKeyRef = useRef(cardUiResetKey);
    const isCardUiResetPending = lastCardUiResetKeyRef.current !== cardUiResetKey;
    const renderIsFlipped = isExtractReview || (isCardUiResetPending ? false : isFlipped);

    useEffect(() => {
        if (cardType) {
            setCurrentType(cardType);
        }
    }, [cardType]);

    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(rawContent);

    useEffect(() => {
        setEditText(rawContent);
    }, [rawContent]);

    const breadcrumbKey = breadcrumbs
        .map((crumb) => `${crumb.label}\u001e${crumb.line}\u001e${crumb.level}`)
        .join("\u001f");
    const shouldInlineBreadcrumbs = isMobile || headerLayout.breadcrumbPlacement === "inline";
    const shouldUseCompactStats = isMobile || headerLayout.statsMode === "compact";
    const shouldExpandHeaderBreadcrumbs =
        !shouldInlineBreadcrumbs && headerLayout.breadcrumbDisplay === "expanded";

    const recalculateHeaderLayout = useCallback(() => {
        if (isMobile) {
            setHeaderLayout((prev) =>
                prev.breadcrumbPlacement === "inline" &&
                prev.breadcrumbDisplay === "truncated" &&
                prev.statsMode === "compact"
                    ? prev
                    : {
                          breadcrumbPlacement: "inline",
                          breadcrumbDisplay: "truncated",
                          statsMode: "compact",
                      },
            );
            return;
        }

        const headerEl = headerRef.current;
        const expandedRegularMeasureEl = expandedRegularHeaderMeasureRef.current;
        const truncatedRegularMeasureEl = truncatedRegularHeaderMeasureRef.current;
        const inlineRegularMeasureEl = inlineRegularHeaderMeasureRef.current;
        const inlineCompactMeasureEl = inlineCompactHeaderMeasureRef.current;
        if (
            !headerEl ||
            !expandedRegularMeasureEl ||
            !truncatedRegularMeasureEl ||
            !inlineRegularMeasureEl ||
            !inlineCompactMeasureEl
        ) {
            return;
        }

        const availableWidth = Math.ceil(headerEl.getBoundingClientRect().width);
        if (availableWidth <= 0) {
            return;
        }

        const measurementOrder: Array<{
            state: HeaderLayoutState;
            width: number;
        }> = [
            {
                state: {
                    breadcrumbPlacement: "header",
                    breadcrumbDisplay: "expanded",
                    statsMode: "regular",
                },
                width: Math.ceil(expandedRegularMeasureEl.getBoundingClientRect().width),
            },
            {
                state: {
                    breadcrumbPlacement: "header",
                    breadcrumbDisplay: "truncated",
                    statsMode: "regular",
                },
                width: Math.ceil(truncatedRegularMeasureEl.getBoundingClientRect().width),
            },
            {
                state: {
                    breadcrumbPlacement: "inline",
                    breadcrumbDisplay: "truncated",
                    statsMode: "regular",
                },
                width: Math.ceil(inlineRegularMeasureEl.getBoundingClientRect().width),
            },
            {
                state: {
                    breadcrumbPlacement: "inline",
                    breadcrumbDisplay: "truncated",
                    statsMode: "compact",
                },
                width: Math.ceil(inlineCompactMeasureEl.getBoundingClientRect().width),
            },
        ];

        const nextLayout =
            measurementOrder.find((entry) => entry.width <= availableWidth)?.state ??
            measurementOrder[measurementOrder.length - 1].state;

        setHeaderLayout((prev) =>
            prev.breadcrumbPlacement === nextLayout.breadcrumbPlacement &&
            prev.breadcrumbDisplay === nextLayout.breadcrumbDisplay &&
            prev.statsMode === nextLayout.statsMode
                ? prev
                : nextLayout,
        );
    }, [isMobile]);

    useLayoutEffect(() => {
        const frameId = window.requestAnimationFrame(() => {
            recalculateHeaderLayout();
        });

        return () => window.cancelAnimationFrame(frameId);
    }, [
        recalculateHeaderLayout,
        breadcrumbKey,
        filename,
        stats.new,
        stats.learning,
        stats.due,
        currentType,
        onExit,
    ]);

    useEffect(() => {
        if (isMobile) {
            return;
        }

        const headerEl = headerRef.current;
        if (!headerEl) {
            return;
        }

        if (typeof ResizeObserver === "undefined") {
            recalculateHeaderLayout();
            return;
        }

        let frameId = 0;
        const observer = new ResizeObserver(() => {
            window.cancelAnimationFrame(frameId);
            frameId = window.requestAnimationFrame(() => {
                recalculateHeaderLayout();
            });
        });

        observer.observe(headerEl);

        return () => {
            observer.disconnect();
            window.cancelAnimationFrame(frameId);
        };
    }, [isMobile, recalculateHeaderLayout]);

    const handleResizeStart = (
        e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
        direction: ResizeDirection,
    ) => {
        if (!allowResize) return;
        e.preventDefault();
        e.stopPropagation();

        const host = wrapperRef.current;
        if (!host) return;

        const isTouchEvent = "touches" in e;
        const startX = isTouchEvent ? e.touches[0].clientX : e.clientX;
        const startY = isTouchEvent ? e.touches[0].clientY : e.clientY;
        const startWidth = sizeRef.current.width;
        const startHeight = sizeRef.current.height;
        const hostStyles = window.getComputedStyle(host);
        const hostPaddingX =
            parseFloat(hostStyles.paddingLeft || "0") + parseFloat(hostStyles.paddingRight || "0");
        const hostPaddingY =
            parseFloat(hostStyles.paddingTop || "0") + parseFloat(hostStyles.paddingBottom || "0");

        const maxW = Math.max(400, host.clientWidth - hostPaddingX);
        const maxH = Math.max(300, host.clientHeight - hostPaddingY);
        const minW = 400;
        const minH = 300;

        let currentW = startWidth;
        let currentH = startHeight;
        isResizingRef.current = true;
        cardRef.current?.classList.add("sr-is-resizing");

        const flushSize = () => {
            if (!cardRef.current) return;
            cardRef.current.style.width = `min(100%, ${currentW}px)`;
            cardRef.current.style.height = `min(100%, ${currentH}px)`;
        };

        const handleMove = (mv: MouseEvent | TouchEvent) => {
            mv.preventDefault();
            const clientX = "touches" in mv ? mv.touches[0].clientX : mv.clientX;
            const clientY = "touches" in mv ? mv.touches[0].clientY : mv.clientY;
            const deltaX = clientX - startX;
            const deltaY = clientY - startY;

            const signedDeltaX = direction.includes("e")
                ? deltaX
                : direction.includes("w")
                  ? -deltaX
                  : 0;
            const signedDeltaY = direction.includes("s")
                ? deltaY
                : direction.includes("n")
                  ? -deltaY
                  : 0;

            const nextWidth =
                direction.includes("e") || direction.includes("w")
                    ? startWidth + signedDeltaX * 2
                    : startWidth;
            const nextHeight =
                direction.includes("n") || direction.includes("s")
                    ? startHeight + signedDeltaY * 2
                    : startHeight;

            currentW = Math.max(minW, Math.min(nextWidth, maxW));
            currentH = Math.max(minH, Math.min(nextHeight, maxH));

            sizeRef.current = { width: currentW, height: currentH };
            flushSize();
        };

        const handleEnd = () => {
            document.removeEventListener("mousemove", handleMove);
            document.removeEventListener("mouseup", handleEnd);
            document.removeEventListener("touchmove", handleMove);
            document.removeEventListener("touchend", handleEnd);
            isResizingRef.current = false;
            cardRef.current?.classList.remove("sr-is-resizing");
            sizeRef.current = { width: currentW, height: currentH };
            setSize({ width: currentW, height: currentH });
            onResize?.(currentW, currentH);
        };

        document.addEventListener("mousemove", handleMove);
        document.addEventListener("mouseup", handleEnd);
        document.addEventListener("touchmove", handleMove, { passive: false });
        document.addEventListener("touchend", handleEnd);
    };
    const [showMenu, setShowMenu] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [toasts, setToasts] = useState<ToastMsg[]>([]);
    const [isDeleted, setIsDeleted] = useState(false);
    const [timeExpired, setTimeExpired] = useState(false);
    const [preservedFlipScrollTop, setPreservedFlipScrollTop] = useState<number | null>(null);

    useEffect(() => {
        if (!renderIsFlipped) {
            setTimeExpired(false);
        }
    }, [renderIsFlipped]);

    const revealAnswer = useCallback(() => {
        if (isExtractReview || renderIsFlipped) {
            return;
        }

        setPreservedFlipScrollTop(contentScrollRef.current?.scrollTop ?? null);
        setIsFlipped(true);
        onShowAnswer?.();
    }, [isExtractReview, onShowAnswer, renderIsFlipped]);

    useEffect(() => {
        if (renderIsFlipped || autoAdvanceSeconds <= 0) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setTimeExpired(true);
            revealAnswer();
        }, autoAdvanceSeconds * 1000);

        return () => window.clearTimeout(timeoutId);
    }, [autoAdvanceSeconds, renderIsFlipped, revealAnswer]);

    useLayoutEffect(() => {
        if (!renderIsFlipped || preservedFlipScrollTop === null) {
            return;
        }

        const applyPreservedScroll = () => {
            if (contentScrollRef.current) {
                contentScrollRef.current.scrollTop = preservedFlipScrollTop;
            }
        };

        applyPreservedScroll();

        const frameId = window.requestAnimationFrame(() => {
            applyPreservedScroll();
            setPreservedFlipScrollTop(null);
        });

        return () => window.cancelAnimationFrame(frameId);
    }, [preservedFlipScrollTop, renderIsFlipped]);

    useLayoutEffect(() => {
        if (lastCardUiResetKeyRef.current === cardUiResetKey) {
            return;
        }

        lastCardUiResetKeyRef.current = cardUiResetKey;
        setIsFlipped(false);
        setIsEditing(false);
        setShowMenu(false);
        setShowInfo(false);
        setToasts([]);
        setIsDeleted(false);
        setTimeExpired(false);
        setPreservedFlipScrollTop(null);
    }, [cardUiResetKey]);

    useEffect(() => {
        setStats(initialStats);
    }, [initialStats.new, initialStats.learning, initialStats.due]);

    const showToast = useCallback((text: string, icon: ReactNode) => {
        const id = Date.now();
        setToasts((prev) => [...prev, { text, icon, id }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 2000);
    }, []);

    const toggleEditMode = useCallback(() => {
        console.debug("[LinearCard] toggleEditMode called", {
            isEditing,
            plugin: !!plugin,
            rawContent: rawContent?.substring(0, 30),
        });

        if (isEditing) {
            setIsEditing(false);
            showToast(t("UI_EXIT_EDIT_MODE"), <Check size={14} />);
        } else {
            console.debug("[LinearCard] Entering edit mode, plugin:", plugin);
            setEditText(rawContent);
            setIsEditing(true);
            setIsFlipped(true);
            showToast(t("UI_ENTER_EDIT_MODE"), <Edit3 size={14} />);
        }
    }, [isEditing, rawContent, showToast, plugin]);

    const handleAnswerInternal = useCallback(
        (rating: number) => {
            if (plugin?.data?.settings?.showRuntimeDebugMessages) {
                console.debug("[SR Debug] handleAnswerInternal called", {
                    rating,
                    isDeleted,
                    hasOnAnswer: !!onAnswer,
                });
            }
            if (isDeleted) return;

            onAnswer?.(rating);
        },
        [isDeleted, onAnswer, plugin],
    );

    const handleMenuAction = useCallback(
        (action: string, options?: OpenNoteTargetOptions) => {
            setShowMenu(false);
            switch (action) {
                case "UNDO":
                    showToast(t("UI_UNDO_LAST_ACTION"), <Undo2 size={14} />);
                    onUndo?.();
                    break;
                case "OPEN":
                    showToast(t("UI_OPEN_IN_OBSIDIAN"), <FileText size={14} />);
                    onOpenNote?.(options);
                    break;
                case "INFO":
                    setShowInfo((prev) => !prev);
                    break;
                case "POSTPONE":
                    showToast(t("UI_CARD_POSTPONED"), <Clock size={14} />);
                    onPostpone?.();
                    break;
                case "DELETE":
                    setIsDeleted(true);
                    setTimeout(() => {
                        setIsDeleted(false);
                        showToast(t("UI_CARD_DELETED"), <Trash2 size={14} />);
                        onDelete?.();
                    }, 600);
                    break;
            }
        },
        [showToast, onUndo, onOpenNote, onEditCard, onPostpone, onDelete],
    );

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isEditing) return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
                return;

            switch (e.key.toLowerCase()) {
                case " ":
                    e.preventDefault();
                    if (isExtractReview) {
                        return;
                    }
                    if (!renderIsFlipped) {
                        revealAnswer();
                    } else {
                        handleAnswerInternal(2);
                    }
                    break;
                case "z":
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        handleMenuAction("UNDO");
                    }
                    break;
                case "1":
                    if (renderIsFlipped) handleAnswerInternal(0);
                    break;
                case "2":
                    if (renderIsFlipped) handleAnswerInternal(1);
                    break;
                case "3":
                    if (renderIsFlipped) handleAnswerInternal(2);
                    break;
                case "4":
                    if (renderIsFlipped) handleAnswerInternal(3);
                    break;
                case "o":
                    handleMenuAction("OPEN");
                    break;
                case "i":
                    handleMenuAction("INFO");
                    break;
                case "p":
                    handleMenuAction("POSTPONE");
                    break;
                case "delete":
                case "backspace":
                    handleMenuAction("DELETE");
                    break;
                case "escape":
                    if (showInfo) setShowInfo(false);
                    if (showMenu) setShowMenu(false);
                    break;
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        isEditing,
        handleAnswerInternal,
        handleMenuAction,
        isExtractReview,
        renderIsFlipped,
        revealAnswer,
        showInfo,
        showMenu,
    ]);

    const wrapperClassName = [
        "sr-linear-card-wrapper",
        isMobile ? "sr-phone-layout" : "",
        isMobile && allowResize ? "sr-mobile-resizable" : "",
        isMobile && !allowResize ? "sr-mobile-maximized" : "",
        overlayMobileNavbar ? "sr-overlay-mobile-navbar" : "",
    ]
        .filter(Boolean)
        .join(" ");
    const cardClassName = "sr-linear-card";

    return (
        <div className={wrapperClassName} ref={wrapperRef}>
            {isMobile && <div className="sr-absolute sr-inset-0 sr-bg-black/50" />}
            <div className="sr-toast-container">
                <AnimatePresence>
                    {toasts.map((toast) => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="sr-toast"
                        >
                            {toast.icon}
                            <span>{toast.text}</span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <motion.div
                ref={cardRef}
                animate={
                    isDeleted
                        ? {
                              opacity: 0,
                              scale: 0.9,
                              y: 20,
                              filter: "blur(8px)",
                          }
                        : {
                              opacity: 1,
                              scale: 1,
                              y: 0,
                              filter: "blur(0px)",
                          }
                }
                transition={{ duration: 0.2 }}
                className={cardClassName}
                style={{
                    width: `min(100%, ${size.width}px)`,
                    height: `min(100%, ${size.height}px)`,
                }}
            >
                {
                    <>
                        {allowResize && (
                            <>
                                <div
                                    className="sr-resize-handle-n"
                                    onMouseDown={(e) => handleResizeStart(e, "n")}
                                    onTouchStart={(e) => handleResizeStart(e, "n")}
                                />
                                <div
                                    className="sr-resize-handle-s"
                                    onMouseDown={(e) => handleResizeStart(e, "s")}
                                    onTouchStart={(e) => handleResizeStart(e, "s")}
                                />
                                <div
                                    className="sr-resize-handle-e"
                                    onMouseDown={(e) => handleResizeStart(e, "e")}
                                    onTouchStart={(e) => handleResizeStart(e, "e")}
                                />
                                <div
                                    className="sr-resize-handle-w"
                                    onMouseDown={(e) => handleResizeStart(e, "w")}
                                    onTouchStart={(e) => handleResizeStart(e, "w")}
                                />
                                <div
                                    className="sr-resize-handle-ne"
                                    onMouseDown={(e) => handleResizeStart(e, "ne")}
                                    onTouchStart={(e) => handleResizeStart(e, "ne")}
                                />
                                <div
                                    className="sr-resize-handle-nw"
                                    onMouseDown={(e) => handleResizeStart(e, "nw")}
                                    onTouchStart={(e) => handleResizeStart(e, "nw")}
                                />
                                <div
                                    className="sr-resize-handle-se"
                                    onMouseDown={(e) => handleResizeStart(e, "se")}
                                    onTouchStart={(e) => handleResizeStart(e, "se")}
                                />
                                <div
                                    className="sr-resize-handle-sw"
                                    onMouseDown={(e) => handleResizeStart(e, "sw")}
                                    onTouchStart={(e) => handleResizeStart(e, "sw")}
                                />
                            </>
                        )}

                        <div className="sr-card-highlight" />

                        {!isMobile && (
                            <div className="sr-header-measurements" aria-hidden="true">
                                <div
                                    ref={expandedRegularHeaderMeasureRef}
                                    className="sr-card-header sr-card-header-measure"
                                    data-sr-layout-measure="header-expanded-regular"
                                >
                                    <div className="sr-header-left">
                                        {onExit && (
                                            <button
                                                type="button"
                                                className="sr-header-btn"
                                                tabIndex={-1}
                                            >
                                                <ArrowLeft size={16} />
                                            </button>
                                        )}
                                        <HeaderBreadcrumbs
                                            breadcrumbs={breadcrumbs}
                                            filename={filename}
                                            showTrail={breadcrumbs.length > 0}
                                            expanded
                                            interactive={false}
                                        />
                                    </div>
                                    <div className="sr-header-right">
                                        <HeaderStatsPanel
                                            stats={stats}
                                            currentType={currentType}
                                            animated={false}
                                        />
                                        <button
                                            type="button"
                                            className="sr-header-btn"
                                            tabIndex={-1}
                                        >
                                            <Edit3 size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            className="sr-header-btn"
                                            tabIndex={-1}
                                        >
                                            <MoreHorizontal size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div
                                    ref={truncatedRegularHeaderMeasureRef}
                                    className="sr-card-header sr-card-header-measure"
                                    data-sr-layout-measure="header-truncated-regular"
                                >
                                    <div className="sr-header-left">
                                        {onExit && (
                                            <button
                                                type="button"
                                                className="sr-header-btn"
                                                tabIndex={-1}
                                            >
                                                <ArrowLeft size={16} />
                                            </button>
                                        )}
                                        <HeaderBreadcrumbs
                                            breadcrumbs={breadcrumbs}
                                            filename={filename}
                                            showTrail={breadcrumbs.length > 0}
                                            interactive={false}
                                        />
                                    </div>
                                    <div className="sr-header-right">
                                        <HeaderStatsPanel
                                            stats={stats}
                                            currentType={currentType}
                                            animated={false}
                                        />
                                        <button
                                            type="button"
                                            className="sr-header-btn"
                                            tabIndex={-1}
                                        >
                                            <Edit3 size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            className="sr-header-btn"
                                            tabIndex={-1}
                                        >
                                            <MoreHorizontal size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div
                                    ref={inlineRegularHeaderMeasureRef}
                                    className="sr-card-header sr-card-header-measure"
                                    data-sr-layout-measure="inline-regular"
                                >
                                    <div className="sr-header-left">
                                        {onExit && (
                                            <button
                                                type="button"
                                                className="sr-header-btn"
                                                tabIndex={-1}
                                            >
                                                <ArrowLeft size={16} />
                                            </button>
                                        )}
                                        <HeaderBreadcrumbs
                                            breadcrumbs={breadcrumbs}
                                            filename={filename}
                                            showTrail={false}
                                            interactive={false}
                                        />
                                    </div>
                                    <div className="sr-header-right">
                                        <HeaderStatsPanel
                                            stats={stats}
                                            currentType={currentType}
                                            animated={false}
                                        />
                                        <button
                                            type="button"
                                            className="sr-header-btn"
                                            tabIndex={-1}
                                        >
                                            <Edit3 size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            className="sr-header-btn"
                                            tabIndex={-1}
                                        >
                                            <MoreHorizontal size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div
                                    ref={inlineCompactHeaderMeasureRef}
                                    className="sr-card-header sr-card-header-measure"
                                    data-sr-layout-measure="inline-compact"
                                >
                                    <div className="sr-header-left">
                                        {onExit && (
                                            <button
                                                type="button"
                                                className="sr-header-btn"
                                                tabIndex={-1}
                                            >
                                                <ArrowLeft size={16} />
                                            </button>
                                        )}
                                        <HeaderBreadcrumbs
                                            breadcrumbs={breadcrumbs}
                                            filename={filename}
                                            showTrail={false}
                                            interactive={false}
                                        />
                                    </div>
                                    <div className="sr-header-right">
                                        <HeaderStatsPanel
                                            stats={stats}
                                            currentType={currentType}
                                            compact
                                            animated={false}
                                        />
                                        <button
                                            type="button"
                                            className="sr-header-btn"
                                            tabIndex={-1}
                                        >
                                            <Edit3 size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            className="sr-header-btn"
                                            tabIndex={-1}
                                        >
                                            <MoreHorizontal size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Header */}
                        <div
                            className="sr-card-header"
                            ref={headerRef}
                            data-sr-breadcrumb-placement={
                                shouldInlineBreadcrumbs ? "inline" : "header"
                            }
                            data-sr-breadcrumb-display={
                                shouldInlineBreadcrumbs
                                    ? "truncated"
                                    : shouldExpandHeaderBreadcrumbs
                                      ? "expanded"
                                      : "truncated"
                            }
                            data-sr-stats-mode={shouldUseCompactStats ? "compact" : "regular"}
                        >
                            <div className="sr-header-left">
                                {onExit && (
                                    <button
                                        type="button"
                                        className="sr-header-btn"
                                        onClick={onExit}
                                        title={t("UI_BACK")}
                                    >
                                        <ArrowLeft size={16} />
                                    </button>
                                )}
                                {(breadcrumbs.length > 0 || filename) && (
                                    <HeaderBreadcrumbs
                                        breadcrumbs={breadcrumbs}
                                        filename={filename}
                                        showTrail={!shouldInlineBreadcrumbs}
                                        onOpenFile={(options) => handleMenuAction("OPEN", options)}
                                        onOpenBreadcrumb={onOpenBreadcrumb}
                                        expanded={shouldExpandHeaderBreadcrumbs}
                                    />
                                )}
                            </div>

                            <div className="sr-header-right">
                                <HeaderStatsPanel
                                    stats={stats}
                                    currentType={currentType}
                                    compact={shouldUseCompactStats}
                                />

                                <button
                                    type="button"
                                    className={`sr-header-btn ${isEditing ? "active" : ""}`}
                                    onClick={toggleEditMode}
                                    title={
                                        isEditing
                                            ? t("UI_FINISH_EDITING")
                                            : isExtractReview
                                              ? t("EXTRACT_EDIT_BODY")
                                              : t("EDIT_CARD")
                                    }
                                >
                                    <Edit3 size={16} />
                                </button>

                                <div className="sr-menu-container">
                                    <button
                                        type="button"
                                        onClick={() => setShowMenu(!showMenu)}
                                        className={`sr-header-btn ${showMenu ? "active" : ""}`}
                                    >
                                        <MoreHorizontal size={16} />
                                    </button>

                                    <AnimatePresence>
                                        {showMenu && (
                                            <>
                                                <div
                                                    className="sr-menu-backdrop"
                                                    onClick={() => setShowMenu(false)}
                                                />
                                                <motion.div
                                                    initial={{
                                                        opacity: 0,
                                                        scale: 0.95,
                                                        y: 5,
                                                    }}
                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                                    transition={{ duration: 0.1 }}
                                                    className="sr-dropdown-menu"
                                                >
                                                    <>
                                                        <MenuItem
                                                            onClick={() => handleMenuAction("UNDO")}
                                                            icon={<Undo2 size={14} />}
                                                            label={t("UI_UNDO")}
                                                            kbd="Ctrl+Z"
                                                        />
                                                        <div className="sr-menu-divider" />
                                                        <MenuItem
                                                            onClick={() => handleMenuAction("OPEN")}
                                                            icon={<FileText size={14} />}
                                                            label={t("UI_OPEN_LOCATION")}
                                                            kbd="O"
                                                        />
                                                        <MenuItem
                                                            onClick={() => handleMenuAction("INFO")}
                                                            icon={<Info size={14} />}
                                                            label={t("UI_CARD_INFO")}
                                                            kbd="I"
                                                        />
                                                        <MenuItem
                                                            onClick={() =>
                                                                handleMenuAction("POSTPONE")
                                                            }
                                                            icon={<Clock size={14} />}
                                                            label={t("UI_POSTPONE_ONE_DAY")}
                                                            kbd="P"
                                                        />
                                                        <div className="sr-menu-divider" />
                                                        <MenuItem
                                                            onClick={() =>
                                                                handleMenuAction("DELETE")
                                                            }
                                                            icon={<Trash2 size={14} />}
                                                            label={t("UI_DELETE_CARD")}
                                                            intent="danger"
                                                            kbd="Del"
                                                        />
                                                    </>
                                                </motion.div>
                                            </>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </div>

                        <div
                            className="sr-timer-bar-container"
                            style={{ height: `${Math.max(progressBarStyle.height, 0)}px` }}
                        >
                            <AnimatePresence>
                                {!renderIsFlipped && autoAdvanceSeconds > 0 && showProgressBar && (
                                    <TimerBar
                                        duration={autoAdvanceSeconds}
                                        timeExpired={timeExpired}
                                        progressBarStyle={progressBarStyle}
                                    />
                                )}
                            </AnimatePresence>
                        </div>

                        <div className={`sr-card-content-area ${isEditing ? "sr-is-editing" : ""}`}>
                            {isEditing && plugin ? (
                                <CardEditorView
                                    value={editText}
                                    onChange={(val) => {
                                        setEditText(val);
                                        onUpdateContent?.(val);
                                    }}
                                    onExit={toggleEditMode}
                                    plugin={plugin}
                                />
                            ) : (
                                <div className="sr-card-content-scroll" ref={contentScrollRef}>
                                    {shouldInlineBreadcrumbs && (
                                        <InlineBreadcrumbs
                                            breadcrumbs={breadcrumbs}
                                            onOpenBreadcrumb={onOpenBreadcrumb}
                                        />
                                    )}
                                    {isExtractReview ? (
                                        <ExtractContent
                                            key={cardUiResetKey}
                                            content={card?.front || t("EXTRACT_NO_ACTIVE_ITEMS")}
                                            renderMarkdown={renderMarkdown}
                                        />
                                    ) : type === "cloze" ? (
                                        <ClozeContent
                                            key={cardUiResetKey}
                                            isFlipped={renderIsFlipped}
                                            card={card}
                                            renderMarkdown={renderMarkdown}
                                            showOtherAnkiClozeVisual={
                                                plugin
                                                    ? !plugin.data.settings
                                                          .convertAnkiClozesToClozes ||
                                                      plugin.data.settings.showOtherAnkiClozeVisual
                                                    : false
                                            }
                                            showOtherHighlightClozeVisual={
                                                plugin
                                                    ? !plugin.data.settings
                                                          .convertHighlightsToClozes ||
                                                      plugin.data.settings
                                                          .showOtherHighlightClozeVisual
                                                    : false
                                            }
                                            showOtherBoldClozeVisual={
                                                plugin
                                                    ? !plugin.data.settings
                                                          .convertBoldTextToClozes ||
                                                      plugin.data.settings.showOtherBoldClozeVisual
                                                    : false
                                            }
                                            preserveScrollOnFlip={preservedFlipScrollTop !== null}
                                        />
                                    ) : (
                                        <BasicContent
                                            key={cardUiResetKey}
                                            isFlipped={renderIsFlipped}
                                            card={card || { front: "Q", back: "A" }}
                                            renderMarkdown={renderMarkdown}
                                        />
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="sr-card-footer">
                            {isEditing ? (
                                <button
                                    onClick={toggleEditMode}
                                    className="sr-show-answer-btn sr-exit-edit-btn"
                                >
                                    <Save size={16} /> {t("UI_FINISH_EDITING")}{" "}
                                    <span className="sr-kbd">ESC</span>
                                </button>
                            ) : !renderIsFlipped ? (
                                <button onClick={revealAnswer} className="sr-show-answer-btn">
                                    <Eye size={16} /> {t("SHOW_ANSWER")}{" "}
                                    <span className="sr-kbd">SPACE</span>
                                </button>
                            ) : (
                                <div className="sr-rating-buttons">
                                    <LinearButton
                                        icon={<RotateCcw size={12} />}
                                        label={t("UI_RESET")}
                                        sub={card?.responseButtonLabels?.[0] || "1m"}
                                        shortcut="1"
                                        className="is-reset"
                                        variant="reset"
                                        onClick={() => handleAnswerInternal(0)}
                                    />
                                    <LinearButton
                                        icon={<ThumbsDown size={12} />}
                                        label={t("UI_HARD")}
                                        sub={card?.responseButtonLabels?.[1] || "10m"}
                                        shortcut="2"
                                        className="is-hard"
                                        variant="hard"
                                        onClick={() => handleAnswerInternal(1)}
                                    />
                                    <LinearButton
                                        icon={<Check size={12} />}
                                        label={t("UI_GOOD")}
                                        sub={card?.responseButtonLabels?.[2] || "3d"}
                                        shortcut="3"
                                        className="is-good"
                                        variant="good"
                                        onClick={() => handleAnswerInternal(2)}
                                    />
                                    <LinearButton
                                        icon={<Zap size={12} />}
                                        label={t("UI_EASY")}
                                        sub={card?.responseButtonLabels?.[3] || "7d"}
                                        shortcut="4"
                                        className="is-easy"
                                        variant="easy"
                                        onClick={() => handleAnswerInternal(3)}
                                    />
                                </div>
                            )}
                        </div>
                    </>
                }
            </motion.div>

            {/* Card Debug Modal */}
            {debugInfo && (
                <CardDebugModal
                    isOpen={showInfo}
                    onClose={() => setShowInfo(false)}
                    data={debugInfo}
                />
            )}
        </div>
    );
};

// ==========================================
// ==========================================

const TimerBar = ({
    duration,
    timeExpired,
    progressBarStyle,
}: {
    duration: number;
    timeExpired: boolean;
    progressBarStyle: ProgressBarStyle;
}) => (
    <motion.div
        initial={{ width: "0%", opacity: 1 }}
        animate={{
            width: "100%",
            backgroundColor: [
                "var(--sr-progress-bar-color)",
                "var(--sr-progress-bar-color)",
                "var(--sr-progress-bar-warning-color)",
            ],
        }}
        exit={
            timeExpired
                ? { opacity: 0, transition: { duration: 0.3 } }
                : { width: "0%", transition: { duration: 0.3, ease: "circOut" } }
        }
        transition={{
            width: { duration: duration, ease: "linear" },
            backgroundColor: { times: [0, 0.7, 1], duration: duration, ease: "linear" },
        }}
        className="sr-timer-bar"
        style={{
            backgroundColor: progressBarStyle.color,
            left: progressBarStyle.rightToLeft ? "auto" : "0",
            right: progressBarStyle.rightToLeft ? "0" : "auto",
            transformOrigin: progressBarStyle.rightToLeft ? "right center" : "left center",
            ["--sr-progress-bar-color" as string]: progressBarStyle.color,
            ["--sr-progress-bar-warning-color" as string]: progressBarStyle.warningColor,
        }}
    />
);

interface MenuItemProps {
    icon: React.ReactNode;
    label: string;
    kbd?: string;
    intent?: "neutral" | "danger";
    onClick: () => void;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, kbd, intent = "neutral", onClick }) => {
    // Exact UIsandbox styles for MenuItem
    const baseColors = intent === "danger" ? "sr-menu-item danger" : "sr-menu-item";

    return (
        <button onClick={onClick} className={baseColors}>
            <div className="sr-menu-item-content">
                <span className="sr-menu-item-icon">{icon}</span>
                <span>{label}</span>
            </div>
            {kbd && <span className="sr-menu-item-kbd">{kbd}</span>}
        </button>
    );
};

// ==========================================
// ==========================================
interface LinearButtonProps {
    icon: React.ReactNode;
    label: string;
    sub: string;
    shortcut: string;
    onClick: () => void;
    className?: string;
    colorClass?: string;
    variant?: "reset" | "hard" | "good" | "easy";
}

const LinearButton: FC<LinearButtonProps> = ({
    icon,
    label,
    sub,
    shortcut,
    onClick,
    colorClass = "text-zinc-400 group-hover/btn:text-zinc-200",
    variant,
}) => {
    // Map variants to CSS classes
    const variantClasses = {
        reset: "is-reset",
        hard: "is-hard",
        good: "is-good",
        easy: "is-easy",
    };

    const activeClass = variant ? variantClasses[variant] : "";

    return (
        <button
            onClick={onClick}
            className={`
                sr-linear-btn
                ${activeClass}
            `}
        >
            {/* Shortcut indicator */}
            <span className="sr-linear-btn-shortcut">{shortcut}</span>

            {/* Icon */}
            <div className={`sr-linear-btn-icon-wrapper ${colorClass}`}>{icon}</div>

            {/* Label + Sub (Stacked) */}
            <div className="sr-linear-btn-content">
                <span className="sr-linear-btn-label">{label}</span>
                <span className="sr-linear-btn-sub">{sub}</span>
            </div>
        </button>
    );
};

const StatBadge = ({
    type,
    count,
    isActive,
}: {
    type: string;
    count: number;
    isActive: boolean;
}) => {
    const colors: Record<string, string> = {
        new: "sr-stat-new",
        learn: "sr-stat-learning",
        due: "sr-stat-due",
    };
    const prevCountRef = useRef(count);
    const direction = count === prevCountRef.current ? 0 : count > prevCountRef.current ? 1 : -1;

    useEffect(() => {
        prevCountRef.current = count;
    }, [count]);

    return (
        <div className={`sr-stat-badge ${isActive ? "active" : ""}`}>
            <span className={`sr-stat-dot ${colors[type]}`} />
            <div className="sr-stat-info">
                <span className={`sr-stat-label ${colors[type]}`}>{type.toUpperCase()}</span>
                <AnimatePresence mode="wait" custom={direction}>
                    <motion.span
                        key={`${type}-${count}`}
                        custom={direction}
                        initial={{
                            y: direction > 0 ? -8 : direction < 0 ? 8 : 0,
                            opacity: direction === 0 ? 1 : 0,
                            scale: direction === 0 ? 1 : 0.97,
                        }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{
                            y: direction > 0 ? 7 : direction < 0 ? -7 : 0,
                            opacity: direction === 0 ? 1 : 0,
                            scale: direction === 0 ? 1 : 0.99,
                        }}
                        transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                        className="sr-stat-count"
                    >
                        {count}
                    </motion.span>
                </AnimatePresence>
            </div>
        </div>
    );
};

const MarkdownDisplay = ({
    content,
    renderMarkdown,
    onRendered,
    showAnswer = false,
}: {
    content: string;
    renderMarkdown?: (text: string, el: HTMLElement) => Promise<void> | void;
    onRendered?: (el: HTMLDivElement) => void;
    showAnswer?: boolean;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const renderGenerationRef = useRef(0);
    const onRenderedRef = useRef(onRendered);
    const shouldRefreshForFlip = requiresFlipAwareMathRender(content);

    useEffect(() => {
        onRenderedRef.current = onRendered;
    }, [onRendered]);

    useLayoutEffect(() => {
        let cancelled = false;
        const renderGeneration = renderGenerationRef.current + 1;
        renderGenerationRef.current = renderGeneration;

        const renderAsync = async () => {
            const target = ref.current;
            if (!target) return;
            const isRenderCurrent = () =>
                !cancelled &&
                ref.current === target &&
                renderGenerationRef.current === renderGeneration;

            const clozeMatch = content.match(/<!--SR_CODE_CLOZE:(\d+):(\d+)-->/);
            let clozeLine = clozeMatch ? parseInt(clozeMatch[1]) : null;
            let startLine = clozeMatch ? parseInt(clozeMatch[2]) : 1;

            let cleanContent = content.replace(/<!--SR_CODE_CLOZE:\d+:\d+-->\n?/, "");
            cleanContent = normalizeSrMarkers(cleanContent);

            const hasCodeBlock = cleanContent.includes("```") || cleanContent.includes("~~~");
            const hasPlaceholder =
                cleanContent.includes("««SR_CLOZE:") || cleanContent.includes("««SR_");

            if (!clozeMatch && hasCodeBlock && hasPlaceholder) {
                const lines = cleanContent.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes("««SR_CLOZE:") || lines[i].includes("««SR_")) {
                        clozeLine = i + 1;
                        break;
                    }
                }
                startLine = 1;
            }

            cleanContent = preprocessMathCloze(
                cleanContent,
                shouldRefreshForFlip ? (showAnswer ? "highlight" : "mask") : "highlight",
            );

            const fallbackText = toFallbackText(cleanContent, { showAnswer });
            const tokenizedContent = preTokenizeSrMarkers(cleanContent);

            if (!renderMarkdown) {
                if (!isRenderCurrent()) {
                    return;
                }
                target.replaceChildren(document.createTextNode(fallbackText));
                onRenderedRef.current?.(target);
                return;
            }

            const buffer = document.createElement("div");

            try {
                await renderMarkdown(tokenizedContent.content, buffer);

                if (!isRenderCurrent()) {
                    return;
                }

                await postProcessMarkers(buffer, renderMarkdown, tokenizedContent.tokens);

                if (!isRenderCurrent()) {
                    return;
                }

                if (clozeLine !== null || (hasCodeBlock && hasPlaceholder)) {
                    postProcessCodeBlock(buffer, clozeLine || 1, startLine);
                }

                const renderedNodes = Array.from(buffer.childNodes);
                if (renderedNodes.length > 0 || buffer.textContent?.trim()) {
                    target.replaceChildren(...renderedNodes);
                } else {
                    target.replaceChildren(document.createTextNode(fallbackText));
                }

                if (isRenderCurrent()) {
                    onRenderedRef.current?.(target);
                }
            } catch (error) {
                if (!isRenderCurrent()) {
                    return;
                }

                console.error("[LinearCard] Failed to render markdown", error);
                target.replaceChildren(document.createTextNode(fallbackText));
                onRenderedRef.current?.(target);
            }
        };

        void renderAsync();
        return () => {
            cancelled = true;
        };
    }, [content, renderMarkdown, shouldRefreshForFlip ? showAnswer : undefined]);

    return (
        <div
            className="sr-markdown-content markdown-preview-view markdown-rendered"
            style={{ textAlign: "left" }}
            ref={ref}
        />
    );
};

function containsMathExpression(content: string): boolean {
    return /\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)[^$\n]+?(?<!\\)\$(?!\$)/.test(content);
}

function requiresFlipAwareMathRender(content: string): boolean {
    const normalized = normalizeSrMarkers(content.replace(/<!--SR_CODE_CLOZE:\d+:\d+-->\n?/g, ""));
    return normalized.includes("««SR_C:") && containsMathExpression(normalized);
}

function preprocessMathCloze(
    content: string,
    latexMode: "highlight" | "mask" = "highlight",
): string {
    content = normalizeSrMarkers(content);

    const hasMath = content.includes("$");
    const hasMarker = content.includes("««SR_");
    const hasAnkiCloze = content.includes("{{c");
    if (!hasMath || (!hasMarker && !hasAnkiCloze)) return content;

    let result = content;

    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_fullMatch: string, inner: string) => {
        return `$$${transformLatex(inner, latexMode, null)}$$`;
    });

    result = result.replace(
        /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g,
        (_fullMatch: string, inner: string) => `$${transformLatex(inner, latexMode, null)}$`,
    );

    return result;
}

const CODE_LINE_HTML_OPTIONS = {
    allowedTags: ["span"],
    allowedAttributes: {
        span: ["class"],
    },
} as const;

function setCodeLineContent(target: HTMLElement, html: string) {
    if (!html) {
        target.textContent = " ";
        return;
    }

    const fragment = createSanitizedHtmlFragment(html, CODE_LINE_HTML_OPTIONS);
    if (!fragment.hasChildNodes()) {
        target.textContent = html;
        return;
    }

    target.replaceChildren(fragment);
}

function postProcessCodeBlock(container: HTMLElement, _clozeLine: number, startLine: number) {
    console.debug("[SR Debug] postProcessCodeBlock called");

    const preElements = container.querySelectorAll("pre");
    console.debug("[SR Debug] Found pre elements:", preElements.length);

    if (preElements.length === 0) {
        console.debug("[SR Debug] No pre elements, trying to process container directly");
        console.debug("[SR Debug] Container innerHTML:", container.innerHTML.substring(0, 500));
        return;
    }

    preElements.forEach((pre, preIndex) => {
        const codeEl = pre.querySelector("code");
        console.debug("[SR Debug] Pre", preIndex, "has code element:", !!codeEl);

        if (!codeEl) {
            console.debug("[SR Debug] No code element, using pre innerHTML");
        }

        let codeContent = codeEl ? codeEl.innerHTML : pre.innerHTML;
        console.debug("[SR Debug] Original codeContent:", codeContent.substring(0, 200));

        codeContent = codeContent
            .replace(/&laquo;/g, "«")
            .replace(/&raquo;/g, "»")
            .replace(/&#171;/g, "«")
            .replace(/&#187;/g, "»");

        console.debug("[SR Debug] After entity decode:", codeContent.substring(0, 200));
        console.debug(
            "[SR Debug] Contains placeholder marker:",
            codeContent.includes("««SR_CLOZE:"),
        );

        const clozeLineIndices: Set<number> = new Set();

        const rawLines = codeContent.split("\n");
        rawLines.forEach((line, idx) => {
            const cleanLine = line.replace(/<[^>]+>/g, "");
            if (cleanLine.includes("««SR_CLOZE:") || cleanLine.includes("««SR_C:")) {
                clozeLineIndices.add(idx);
            }
        });

        codeContent = codeContent.replace(/««[\s\S]*?»»/g, (match) => {
            const cleanMatch = match.replace(/<[^>]+>/g, "");
            if (cleanMatch.startsWith("««SR_CLOZE:")) {
                const encoded = cleanMatch.substring(11, cleanMatch.length - 2);
                const decoded = tryDecodeSrMarkerText(encoded);
                if (decoded === null) {
                    return match;
                }

                return `<span class="sr-cloze-wrapper"><span class="sr-cloze-placeholder">[...]</span><span class="sr-cloze-answer">${decoded}</span></span>`;
            }
            if (cleanMatch.startsWith("««SR_C:")) {
                const decoded = decodeUnifiedMarkerPayload(
                    cleanMatch.substring(6, cleanMatch.length - 2),
                );
                if (!decoded) {
                    return match;
                }

                return `<span class="sr-cloze-wrapper"><span class="sr-cloze-placeholder">${decoded.placeholderText}</span><span class="sr-cloze-answer">${decoded.answerText}</span></span>`;
            }
            return match;
        });

        codeContent = codeContent.replace(
            /««SR_CLOZE_FRONT»»/g,
            '<span class="sr-cloze-placeholder">[...]</span>',
        );
        codeContent = codeContent.replace(
            /««SR_CLOZE_BACK:([^»]+)»»/g,
            (match: string, encoded: string) => {
                try {
                    const decoded = decodeURIComponent(encoded);
                    return `<span class="sr-cloze-answer">${decoded}</span>`;
                } catch {
                    return match;
                }
            },
        );

        const lines = codeContent.split("\n");

        const wrapper = document.createElement("div");
        wrapper.className = "sr-code-block-card";

        let currentRealLine = startLine;
        let maxLineNumberDigits = 1;
        let firstClozeDiv: HTMLElement | null = null;

        lines.forEach((lineContent, index) => {
            const trimmedLine = lineContent.trim();
            if (trimmedLine.startsWith("```") || trimmedLine.startsWith("~~~")) {
                return;
            }

            if (trimmedLine.startsWith("// ...")) {
                const lineDiv = document.createElement("div");
                lineDiv.className = "sr-code-context-line sr-code-ellipsis";
                const lineNumSpan = document.createElement("span");
                lineNumSpan.className = "sr-code-line-number";

                const lineContentSpan = document.createElement("span");
                lineContentSpan.className = "sr-code-line-content sr-code-line-content-ellipsis";
                setCodeLineContent(lineContentSpan, lineContent);

                lineDiv.appendChild(lineNumSpan);
                lineDiv.appendChild(lineContentSpan);
                wrapper.appendChild(lineDiv);
                return;
            }

            const isCloze = clozeLineIndices.has(index);

            const lineDiv = document.createElement("div");
            lineDiv.className = isCloze ? "sr-code-cloze-line" : "sr-code-context-line";
            lineDiv.dataset.line = String(currentRealLine);

            const lineNumSpan = document.createElement("span");
            lineNumSpan.className = "sr-code-line-number";
            lineNumSpan.textContent = String(currentRealLine);
            maxLineNumberDigits = Math.max(maxLineNumberDigits, lineNumSpan.textContent.length);

            const lineContentSpan = document.createElement("span");
            lineContentSpan.className = "sr-code-line-content";
            setCodeLineContent(lineContentSpan, lineContent);

            lineDiv.appendChild(lineNumSpan);
            lineDiv.appendChild(lineContentSpan);
            wrapper.appendChild(lineDiv);

            if (isCloze && !firstClozeDiv) {
                firstClozeDiv = lineDiv;
            }

            currentRealLine++;
        });

        wrapper.style.setProperty("--sr-code-line-number-digits", String(maxLineNumberDigits));

        pre.parentNode?.replaceChild(wrapper, pre);

        if (firstClozeDiv) {
            setTimeout(() => {
                if (typeof firstClozeDiv.scrollIntoView === "function") {
                    firstClozeDiv.scrollIntoView({
                        block: "center",
                        behavior: "auto",
                    });
                }
            }, 10);
        }
    });
}

function getScrollContainer(container: HTMLElement | null): HTMLElement | null {
    return container?.closest(".sr-card-content-scroll") ?? null;
}

function findActiveClozeTarget(container: HTMLElement, isFlipped: boolean): HTMLElement | null {
    const selectors = isFlipped
        ? [
              ".sr-code-cloze-line",
              ".sr-cloze-answer",
              ".sr-cloze-shown.sr-is-active",
              ".sr-cloze-reveal",
              ".sr-cloze-shown",
          ]
        : [
              ".sr-code-cloze-line",
              ".sr-cloze-placeholder",
              ".sr-cloze-hidden",
              ".sr-cloze-mask",
              ".sr-cloze-highlight",
          ];

    for (const selector of selectors) {
        const target = container.querySelector<HTMLElement>(selector);
        if (target) return target;
    }

    return null;
}

function centerElementInScrollContainer(target: HTMLElement, scrollContainer: HTMLElement) {
    const input = buildScrollPositionInput(target, scrollContainer);
    scrollContainer.scrollTop = getCenteredScrollTop(input);
}

function getScrollContainerSafeInsets(scrollContainer: HTMLElement): {
    top: number;
    bottom: number;
} {
    const styles = window.getComputedStyle(scrollContainer);
    const scrollPaddingTop = Number.parseFloat(styles.scrollPaddingTop || "0");
    const scrollPaddingBottom = Number.parseFloat(styles.scrollPaddingBottom || "0");
    const paddingTop = Number.parseFloat(styles.paddingTop || "0");
    const paddingBottom = Number.parseFloat(styles.paddingBottom || "0");

    return {
        top: scrollPaddingTop > 0 ? scrollPaddingTop : Math.max(paddingTop, 24),
        bottom: scrollPaddingBottom > 0 ? scrollPaddingBottom : Math.max(paddingBottom, 24),
    };
}

function positionElementWithMixedCentering(target: HTMLElement, scrollContainer: HTMLElement) {
    const safeInsets = getScrollContainerSafeInsets(scrollContainer);
    const input = buildScrollPositionInput(target, scrollContainer, safeInsets);
    scrollContainer.scrollTop = getMixedCenterScrollTop(input);
}

function getClozeFaceHost(
    container: HTMLElement | null,
    face: ClozeRenderFace,
): HTMLElement | null {
    return container?.querySelector<HTMLElement>(`[data-sr-face="${face}"]`) ?? null;
}

function getClozeFaceShowAnswer(face: ClozeRenderFace, isFlipped: boolean): boolean {
    if (face === "front") {
        return false;
    }
    if (face === "back") {
        return true;
    }
    return isFlipped;
}

function getInactivePreRenderedFaceStyle(): CSSProperties {
    return {
        position: "absolute",
        inset: 0,
        visibility: "hidden",
        pointerEvents: "none",
        overflow: "hidden",
    };
}

const ClozeContent = ({
    isFlipped,
    card,
    renderMarkdown,
    showOtherAnkiClozeVisual = false,
    showOtherHighlightClozeVisual = false,
    showOtherBoldClozeVisual = false,
    preserveScrollOnFlip = false,
}: {
    isFlipped: boolean;
    card?: CardState;
    renderMarkdown?: (text: string, el: HTMLElement) => Promise<void> | void;
    showOtherAnkiClozeVisual?: boolean;
    showOtherHighlightClozeVisual?: boolean;
    showOtherBoldClozeVisual?: boolean;
    preserveScrollOnFlip?: boolean;
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number | null>(null);
    const preserveScrollOnFlipRef = useRef(preserveScrollOnFlip);
    preserveScrollOnFlipRef.current = preserveScrollOnFlip;
    const isCodeBlockCloze = (card?.front || "").includes("««SR_CLOZE:");
    const frontContent = card?.front || "";
    const backContent = card?.back || frontContent;
    const reviewContent = card?.review || "";
    const hasReviewContent = reviewContent.length > 0;
    const mathFlipContent = hasReviewContent ? reviewContent : frontContent;
    const shouldPreRenderMathFaces =
        !isCodeBlockCloze && requiresFlipAwareMathRender(mathFlipContent);
    const activeFace: ClozeRenderFace = shouldPreRenderMathFaces
        ? isFlipped
            ? "back"
            : "front"
        : "single";

    const positionActiveCloze = useCallback(() => {
        const container = containerRef.current;
        const activeHost = getClozeFaceHost(container, activeFace);
        const scrollContainer = getScrollContainer(container);
        if (!activeHost || !scrollContainer) return;

        const target = findActiveClozeTarget(
            activeHost,
            getClozeFaceShowAnswer(activeFace, isFlipped),
        );
        if (!target) return;

        if (isCodeBlockCloze) {
            centerElementInScrollContainer(target, scrollContainer);
            return;
        }

        positionElementWithMixedCentering(target, scrollContainer);
    }, [activeFace, isCodeBlockCloze, isFlipped]);

    const schedulePositionActiveCloze = useCallback(
        (face?: ClozeRenderFace) => {
            if (preserveScrollOnFlipRef.current) {
                return;
            }
            if (face && face !== activeFace) {
                return;
            }
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
            }

            frameRef.current = requestAnimationFrame(() => {
                positionActiveCloze();
                frameRef.current = null;
            });
        },
        [activeFace, positionActiveCloze],
    );

    useEffect(() => {
        if (containerRef.current) {
            const codeBlockCards = containerRef.current.querySelectorAll(".sr-code-block-card");
            codeBlockCards.forEach((cardEl) => {
                if (isFlipped) {
                    cardEl.classList.add("flipped");
                } else {
                    cardEl.classList.remove("flipped");
                }
            });
        }
    }, [isFlipped]);

    useEffect(() => {
        const activeHost = getClozeFaceHost(containerRef.current, activeFace);
        const scrollContainer = getScrollContainer(containerRef.current);
        if (!activeHost) return;
        if (!preserveScrollOnFlipRef.current) {
            schedulePositionActiveCloze(activeFace);
        }

        const mutationObserver = new MutationObserver(() => {
            schedulePositionActiveCloze(activeFace);
        });

        mutationObserver.observe(activeHost, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(() => {
                schedulePositionActiveCloze(activeFace);
            });
            resizeObserver.observe(activeHost);
            if (scrollContainer && scrollContainer !== activeHost) {
                resizeObserver.observe(scrollContainer);
            }
        }

        return () => {
            mutationObserver.disconnect();
            resizeObserver?.disconnect();
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, [activeFace, card?.front, card?.back, card?.review, isFlipped, schedulePositionActiveCloze]);

    const contentToRender = isCodeBlockCloze
        ? frontContent
        : hasReviewContent
          ? reviewContent
          : isFlipped
            ? backContent
            : frontContent;

    // [Mod] Filter out other clozes if setting is disabled.
    // DOM manipulation is used to handle styles added by Obsidian's post-processors.
    useEffect(() => {
        // [Change] Removed !isFlipped check to allow cleanup on the back side too.
        if (isCodeBlockCloze) return;

        const container = containerRef.current;
        if (!container) return;

        const wrapsActiveClozeNode = (element: Element): boolean => {
            return (
                element.matches(".sr-cloze-wrapper, .sr-cloze-answer, .sr-cloze-placeholder") ||
                element.querySelector(
                    ".sr-cloze-wrapper, .sr-cloze-answer, .sr-cloze-placeholder",
                ) !== null
            );
        };

        const cleanup = () => {
            if (!showOtherAnkiClozeVisual) {
                const highlights = container.querySelectorAll(".sr-cloze-highlight");
                highlights.forEach((span) => {
                    const text = span.textContent || "";
                    const textNode = document.createTextNode(text);
                    span.parentNode?.replaceChild(textNode, span);
                });
            }

            if (!showOtherHighlightClozeVisual) {
                const marks = container.querySelectorAll("mark");
                marks.forEach((mark) => {
                    if (wrapsActiveClozeNode(mark)) {
                        return;
                    }
                    const text = mark.textContent || "";
                    const textNode = document.createTextNode(text);
                    mark.parentNode?.replaceChild(textNode, mark);
                });
            }

            if (!showOtherBoldClozeVisual) {
                const bolds = container.querySelectorAll("strong, b");
                bolds.forEach((bold) => {
                    if (wrapsActiveClozeNode(bold)) {
                        return;
                    }
                    const text = bold.textContent || "";
                    const textNode = document.createTextNode(text);
                    bold.parentNode?.replaceChild(textNode, bold);
                });
            }

            // 3. Strip '.sr-cloze-shown'
            const showns = container.querySelectorAll(".sr-cloze-shown");
            showns.forEach((span) => {
                const isActive = span.classList.contains("sr-is-active");

                // Logic:
                // - On Front: Strip ALL shown clozes (answers should be hidden or [...] on front).
                // - On Back: Strip ONLY if it's NOT the active answer.
                //   Active answers are marked with 'sr-is-active' in question-type.ts.
                //   Any 'shown' cloze that lacks this marker is an "other" cloze leaking through.
                if (!isFlipped || (!isActive && isFlipped && !showOtherAnkiClozeVisual)) {
                    const text = span.textContent || "";
                    const textNode = document.createTextNode(text);
                    span.parentNode?.replaceChild(textNode, span);
                }
            });
        };

        // Initial cleanup
        cleanup();

        // Watch for changes
        const observer = new MutationObserver(() => {
            cleanup();
        });

        observer.observe(container, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [
        showOtherAnkiClozeVisual,
        showOtherHighlightClozeVisual,
        showOtherBoldClozeVisual,
        isFlipped,
        isCodeBlockCloze,
        card?.front,
        card?.back,
        card?.review,
    ]);

    return (
        <div
            className={`sr-cloze-content ${isFlipped ? "sr-flipped" : ""}`}
            ref={containerRef}
            style={shouldPreRenderMathFaces ? { position: "relative" } : undefined}
        >
            {shouldPreRenderMathFaces ? (
                <>
                    <div
                        data-sr-face="front"
                        data-sr-active={String(!isFlipped)}
                        aria-hidden={isFlipped}
                        style={isFlipped ? getInactivePreRenderedFaceStyle() : undefined}
                    >
                        <MarkdownDisplay
                            content={mathFlipContent}
                            renderMarkdown={renderMarkdown}
                            onRendered={() => schedulePositionActiveCloze("front")}
                            showAnswer={false}
                        />
                    </div>
                    <div
                        data-sr-face="back"
                        data-sr-active={String(isFlipped)}
                        aria-hidden={!isFlipped}
                        style={!isFlipped ? getInactivePreRenderedFaceStyle() : undefined}
                    >
                        <MarkdownDisplay
                            content={mathFlipContent}
                            renderMarkdown={renderMarkdown}
                            onRendered={() => schedulePositionActiveCloze("back")}
                            showAnswer={true}
                        />
                    </div>
                </>
            ) : (
                <div data-sr-face="single" data-sr-active="true">
                    <MarkdownDisplay
                        content={contentToRender}
                        renderMarkdown={renderMarkdown}
                        onRendered={() => schedulePositionActiveCloze("single")}
                        showAnswer={isFlipped}
                    />
                </div>
            )}
        </div>
    );
};

const BasicContent = ({
    isFlipped,
    card,
    renderMarkdown,
}: {
    isFlipped: boolean;
    card: CardState;
    renderMarkdown?: (text: string, el: HTMLElement) => Promise<void> | void;
}) => (
    <div className="sr-basic-content">
        <div>
            <div className="sr-content-label">{t("UI_QUESTION_LABEL")}</div>
            <div className="sr-content-text">
                <MarkdownDisplay
                    content={card.front || t("UI_QUESTION_CONTENT")}
                    renderMarkdown={renderMarkdown}
                />
            </div>
        </div>
        <AnimatePresence>
            {isFlipped && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="sr-answer-section"
                >
                    <>
                        <div className="sr-content-divider" />
                        <div className="sr-content-label">{t("UI_ANSWER_LABEL")}</div>
                        <div className="sr-content-text answer">
                            <MarkdownDisplay
                                content={card.back || t("UI_ANSWER_CONTENT")}
                                renderMarkdown={renderMarkdown}
                            />
                        </div>
                    </>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
);

const ExtractContent = ({
    content,
    renderMarkdown,
}: {
    content: string;
    renderMarkdown?: (text: string, el: HTMLElement) => Promise<void> | void;
}) => (
    <div className="sr-basic-content">
        <div className="sr-content-text">
            <MarkdownDisplay content={content} renderMarkdown={renderMarkdown} />
        </div>
    </div>
);

const InlineBreadcrumbs: FC<InlineBreadcrumbsProps> = ({
    breadcrumbs,
    onOpenBreadcrumb,
    interactive = true,
}) => {
    if (breadcrumbs.length === 0) {
        return null;
    }

    const canOpenBreadcrumbs = interactive && onOpenBreadcrumb;
    const createInlineBreadcrumbMouseDownHandler = (breadcrumb: QuestionContextBreadcrumb) => {
        if (!canOpenBreadcrumbs) {
            return undefined;
        }

        return (event: React.MouseEvent<HTMLElement>) => {
            if (event.button !== 1) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            onOpenBreadcrumb(breadcrumb, { newTab: true });
        };
    };
    const createInlineBreadcrumbClickHandler = (
        breadcrumb: QuestionContextBreadcrumb,
        newTab: boolean,
    ) => {
        if (!canOpenBreadcrumbs) {
            return undefined;
        }

        return (event: React.MouseEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenBreadcrumb(breadcrumb, newTab ? { newTab: true } : undefined);
        };
    };

    return (
        <div className="sr-inline-breadcrumbs">
            {breadcrumbs.map((crumb, index) => (
                <Fragment key={`${crumb.label}-${crumb.line}-${crumb.level}-${index}`}>
                    {index > 0 && " > "}
                    <span
                        className="sr-breadcrumb-item"
                        title={crumb.label}
                        onClick={createInlineBreadcrumbClickHandler(crumb, false)}
                        onMouseDown={createInlineBreadcrumbMouseDownHandler(crumb)}
                    >
                        {crumb.label}
                    </span>
                </Fragment>
            ))}
        </div>
    );
};
