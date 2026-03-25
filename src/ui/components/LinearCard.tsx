/** @jsxImportSource react */
/**
 * 绾挎€у崱鐗囩粍浠?(LinearCard Component)
 *
 * 杩欎釜鏂囦欢鏄牳蹇?UI 缁勪欢锛岃礋璐ｆ覆鏌撶被浼间簬 UIsandbox 椋庢牸鐨勭嚎鎬у涔犲崱鐗囩晫闈€?
 * 瀹冨湪椤圭洰涓睘浜庯細鐣岄潰灞?(UI Layer)
 *
 * 瀹冧緷璧栦簬锛?
 * - src/ui/styles/linear-card.css (鏍峰紡瀹氫箟)
 * - src/ui/components/CardEditorView (鍗＄墖缂栬緫鍣?
 * - src/ui/components/CardDebugModal (璋冭瘯妯℃€佹)
 *
 * 瀹冧富瑕佸疄鐜扮殑鍔熻兘锛?
 * - 鏄剧ず闂鍜岀瓟妗堬紙鏀寔 Markdown 鍜屼唬鐮佸潡楂樹寒锛?
 * - 鎻愪緵璇勫垎鎸夐挳锛堥噸鏉?杈冮毦/璁板緱/绠€鍗曪級
 * - 鎻愪緵鏇村閫夐」鑿滃崟锛堟挙閿€/缂栬緫/鎺ㄨ繜/鍒犻櫎绛夛級
 * - 鍝嶅簲寮忚璁★紝閫傞厤妗岄潰鍜岀Щ鍔ㄧ
 */
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

// 鍗＄墖鐘舵€佺被鍨?
export interface CardState {
    front: string;
    back: string;
    review?: string;
    responseButtonLabels?: string[];
}

interface LinearCardProps {
    card?: CardState;
    uiResetToken?: number | string;
    deckPath?: string;
    stats?: { new: number; learning: number; due: number };
    type?: "basic" | "cloze";
    breadcrumbs?: string[];
    filename?: string;
    autoAdvanceSeconds?: number;
    showProgressBar?: boolean;
    progressBarStyle?: ProgressBarStyle;
    onAnswer?: (rating: number) => void;
    onShowAnswer?: () => void;
    onUndo?: () => void;
    onOpenNote?: () => void;
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
    /** 鏄惁涓虹Щ鍔ㄧ锛岀敤浜庡簲鐢ㄥ叏灞忔牱寮?*/
    isMobile?: boolean;
    /** 鍘熷 Markdown 鍐呭锛岀敤浜庣紪杈?*/
    rawContent?: string;
    /** 鎻掍欢瀹炰緥锛岀敤浜庤闂?app.hotkeyManager */
    plugin?: SRPlugin;
    /** 鍐呭鏇存柊鍥炶皟 */
    onUpdateContent?: (text: string) => void;
}

type ToastMsg = { icon: ReactNode; text: string; id: number };
type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type ClozeRenderFace = "single" | "front" | "back";

export const LinearCard: FC<LinearCardProps> = ({
    card,
    uiResetToken,
    stats: initialStats = { new: 45, learning: 12, due: 68 },
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
    rawContent = "",
    plugin,
    onUpdateContent,
}) => {
    // 鍐呴儴鐘舵€佺敤浜庡钩婊戣皟鏁村ぇ灏?
    const [size, setSize] = useState({ width, height });
    const wrapperRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const sizeRef = useRef({ width, height });
    const isResizingRef = useRef(false);

    // 褰?props 鏇存柊鏃跺悓姝ワ紙濡傛灉鏈湪鎷栨嫿涓級
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
    const renderIsFlipped = isCardUiResetPending ? false : isFlipped;

    // 鍚屾 cardType prop 鐨勫彉鍖?
    useEffect(() => {
        if (cardType) {
            setCurrentType(cardType);
        }
    }, [cardType]);

    // 缂栬緫鐘舵€?
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(rawContent);

    // 鍚屾 rawContent prop 鍙樺寲
    useEffect(() => {
        setEditText(rawContent);
    }, [rawContent]);

    // Resize Logic (鏀寔榧犳爣鍜岃Е鎽?
    const handleResizeStart = (
        e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
        direction: ResizeDirection,
    ) => {
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

        // 鏈€澶ц竟鐣岀害鏉?(淇濊瘉鍗＄墖涓嶈秴鍑洪〉闈?
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

            // 绾︽潫鏈€澶у€?
            sizeRef.current = { width: currentW, height: currentH };
            flushSize();
        };

        const handleEnd = () => {
            document.removeEventListener("mousemove", handleMove);
            document.removeEventListener("mouseup", handleEnd);
            document.removeEventListener("touchmove", handleMove);
            document.removeEventListener("touchend", handleEnd);
            // 淇濆瓨鏈€缁堝昂瀵?
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

    useEffect(() => {
        if (!isFlipped) {
            setTimeExpired(false);
        }
    }, [isFlipped]);

    useEffect(() => {
        if (renderIsFlipped || autoAdvanceSeconds <= 0) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setTimeExpired(true);
            setIsFlipped(true);
            onShowAnswer?.();
        }, autoAdvanceSeconds * 1000);

        return () => window.clearTimeout(timeoutId);
    }, [autoAdvanceSeconds, onShowAnswer, renderIsFlipped]);

    // 閲嶇疆鍗＄墖鐩稿叧鐨勫眬閮?UI 鐘舵€侊紝閬垮厤鍒囧崱鍚庢畫鐣欎笂涓€寮犲崱鐨勮彍鍗?鎻愮ず/鍒犻櫎鎬?
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

    // 鍒囨崲缂栬緫妯″紡
    const toggleEditMode = useCallback(() => {
        console.debug("[LinearCard] toggleEditMode called", {
            isEditing,
            plugin: !!plugin,
            rawContent: rawContent?.substring(0, 30),
        });

        if (isEditing) {
            // 閫€鍑虹紪杈戞ā寮?
            setIsEditing(false);
            showToast(t("UI_EXIT_EDIT_MODE"), <Check size={14} />);
        } else {
            // 杩涘叆缂栬緫妯″紡
            console.debug("[LinearCard] Entering edit mode, plugin:", plugin);
            setEditText(rawContent);
            setIsEditing(true);
            setIsFlipped(true); // 纭繚鏄剧ず鑳岄潰
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

            // 涓嶅啀杩涜涔愯鏇存柊锛?
            // Learn 鍗＄墖鍦ㄦ楠ゆ湭瀹屾垚鏃惰鏁颁笉鍙橈紝涔愯鏇存柊浼氬鑷村姩鐢诲厛鍑忓悗鎭㈠
            // 鐜板湪瀹屽叏鐢卞悗绔姸鎬侀┍鍔?UI 鍙樺寲锛岀‘淇濇暟瀛楀彧鍦ㄧ湡姝ｅ彉鍖栨椂鎵嶈Е鍙戝姩鐢?
            onAnswer?.(rating);
        },
        [isDeleted, onAnswer, plugin],
    );

    const handleMenuAction = useCallback(
        (action: string) => {
            setShowMenu(false);
            switch (action) {
                case "UNDO":
                    showToast(t("UI_UNDO_LAST_ACTION"), <Undo2 size={14} />);
                    onUndo?.();
                    break;
                case "OPEN":
                    showToast(t("UI_OPEN_IN_OBSIDIAN"), <FileText size={14} />);
                    onOpenNote?.();
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

    // 閿洏蹇嵎閿?
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 缂栬緫妯″紡涓嬩笉澶勭悊澶嶄範蹇嵎閿紙璁╃紪杈戝櫒鑷繁澶勭悊锛?
            if (isEditing) return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
                return;

            switch (e.key.toLowerCase()) {
                case " ":
                    e.preventDefault();
                    if (!isFlipped) {
                        setIsFlipped(true);
                        onShowAnswer?.();
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
                    if (isFlipped) handleAnswerInternal(0);
                    break;
                case "2":
                    if (isFlipped) handleAnswerInternal(1);
                    break;
                case "3":
                    if (isFlipped) handleAnswerInternal(2);
                    break;
                case "4":
                    if (isFlipped) handleAnswerInternal(3);
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
        isFlipped,
        isEditing,
        handleAnswerInternal,
        handleMenuAction,
        onShowAnswer,
        showInfo,
        showMenu,
    ]);

    // 绉诲姩绔叏灞?wrapper 绫诲悕
    const wrapperClassName = isMobile
        ? "sr-linear-card-wrapper sr-fixed sr-inset-0 sr-z-50 sr-w-full sr-h-full sr-flex sr-items-center sr-justify-center"
        : "sr-linear-card-wrapper";

    return (
        <div className={wrapperClassName} ref={wrapperRef}>
            {/* 绉诲姩绔儗鏅伄缃?*/}
            {isMobile && <div className="sr-absolute sr-inset-0 sr-bg-black/50" />}
            {/* Toast 瀹瑰櫒 */}
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

            {/* 鍗＄墖鏈綋 */}
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
                className="sr-linear-card"
                style={{
                    width: `min(100%, ${size.width}px)`,
                    height: `min(100%, ${size.height}px)`,
                }}
            >
                {
                    <>
                        {/* Resize Handles (鏀寔榧犳爣鍜岃Е鎽? */}
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

                        {/* 椤堕儴楂樺厜绾?*/}
                        <div className="sr-card-highlight" />

                        {/* Header */}
                        <div className="sr-card-header">
                            {/* 宸︿晶锛氳繑鍥炰笌闈㈠寘灞?*/}
                            <div className="sr-header-left">
                                {onExit && (
                                    <button
                                        className="sr-header-btn"
                                        onClick={onExit}
                                        title={t("UI_BACK")}
                                    >
                                        <ArrowLeft size={16} />
                                    </button>
                                )}
                                {(breadcrumbs.length > 0 || filename) && (
                                    <div className="sr-breadcrumbs">
                                        <div
                                            className="sr-filename-badge"
                                            onClick={() => handleMenuAction("OPEN")}
                                            title={t("UI_OPEN_FILE_LOCATION")}
                                        >
                                            <FileText size={10} />
                                            <span>{filename.replace(/\.md$/i, "")}</span>
                                        </div>

                                        {breadcrumbs.length > 0 && (
                                            <ChevronRight
                                                size={10}
                                                className="sr-breadcrumb-separator"
                                            />
                                        )}

                                        {breadcrumbs.map((crumb, index) => (
                                            <Fragment key={index}>
                                                <span className="sr-breadcrumb-item">{crumb}</span>
                                                {index < breadcrumbs.length - 1 && (
                                                    <ChevronRight
                                                        size={10}
                                                        className="sr-breadcrumb-separator"
                                                    />
                                                )}
                                            </Fragment>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 鍙充晶锛氱粺璁′笌鑿滃崟 */}
                            <div className="sr-header-right">
                                <div className="sr-stats-panel">
                                    <StatBadge
                                        type="new"
                                        count={stats.new}
                                        isActive={currentType === "new"}
                                    />
                                    <div className="sr-stats-divider" />
                                    <StatBadge
                                        type="learn"
                                        count={stats.learning}
                                        isActive={currentType === "learning"}
                                    />
                                    <div className="sr-stats-divider" />
                                    <StatBadge
                                        type="due"
                                        count={stats.due}
                                        isActive={currentType === "due"}
                                    />
                                </div>

                                <div className="sr-menu-container">
                                    <button
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

                        {/* 璁℃椂鍣ㄨ繘搴︽潯 */}
                        <div
                            className="sr-timer-bar-container"
                            style={{ height: `${Math.max(progressBarStyle.height, 0)}px` }}
                        >
                            <AnimatePresence initial={false}>
                                {!renderIsFlipped && autoAdvanceSeconds > 0 && showProgressBar && (
                                    <TimerBar
                                        duration={autoAdvanceSeconds}
                                        timeExpired={timeExpired}
                                        progressBarStyle={progressBarStyle}
                                    />
                                )}
                            </AnimatePresence>
                        </div>

                        {/* 鍐呭鍖哄煙 */}
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
                                <div className="sr-card-content-scroll">
                                    {type === "cloze" ? (
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

                        {/* Footer - 缂栬緫妯″紡涓嬫樉绀洪€€鍑烘寜閽?*/}
                        <div className="sr-card-footer">
                            <AnimatePresence initial={false}>
                                {isEditing ? (
                                    <motion.div
                                        key="edit-footer"
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -5 }}
                                        transition={{ duration: 0.1 }}
                                    >
                                        <button
                                            onClick={toggleEditMode}
                                            className="sr-show-answer-btn sr-exit-edit-btn"
                                        >
                                            <Save size={16} /> {t("UI_FINISH_EDITING")}{" "}
                                            <span className="sr-kbd">ESC</span>
                                        </button>
                                    </motion.div>
                                ) : !renderIsFlipped ? (
                                    <motion.div
                                        key="show-answer"
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -5 }}
                                        transition={{ duration: 0.1 }}
                                    >
                                        <button
                                            onClick={() => {
                                                setIsFlipped(true);
                                                onShowAnswer?.();
                                            }}
                                            className="sr-show-answer-btn"
                                        >
                                            <Eye size={16} /> {t("SHOW_ANSWER")}{" "}
                                            <span className="sr-kbd">SPACE</span>
                                        </button>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="rating-buttons"
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.1 }}
                                        className="sr-rating-buttons"
                                    >
                                        {
                                            <>
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
                                            </>
                                        }
                                    </motion.div>
                                )}
                            </AnimatePresence>
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
// 杈呭姪缁勪欢
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
// 淇敼鍚庣殑 LinearButton - 姘村钩甯冨眬锛屽浘鏍囧湪宸?
// 涓ユ牸鍖归厤 UIsandbox 缁撴瀯
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

            // 妫€鏌ユ槸鍚︽湁浠ｇ爜鍧?cloze 鏍囪
            const clozeMatch = content.match(/<!--SR_CODE_CLOZE:(\d+):(\d+)-->/);
            let clozeLine = clozeMatch ? parseInt(clozeMatch[1]) : null;
            let startLine = clozeMatch ? parseInt(clozeMatch[2]) : 1;

            // 绉婚櫎鏍囪鍚庢覆鏌?
            let cleanContent = content.replace(/<!--SR_CODE_CLOZE:\d+:\d+-->\n?/, "");
            cleanContent = normalizeSrMarkers(cleanContent);

            // 銆愬寮恒€戯細濡傛灉娌℃湁鏄惧紡鏍囪锛屼絾鍐呭鍖呭惈浠ｇ爜鍧楀拰鍗犱綅绗︼紝鑷姩妫€娴?
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

            // 銆怢aTeX 濉┖澶勭悊銆戝湪娓叉煋鍓嶏紝灏嗘暟瀛﹀叕寮忎腑鐨?marker 杞负 LaTeX \color{} 鍛戒护
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
                await renderMarkdown(tokenizedContent, buffer);

                if (!isRenderCurrent()) {
                    return;
                }

                // 3. 鍚屾鎵ц鎵€鏈夊悗澶勭悊鍣?
                await postProcessMarkers(buffer, renderMarkdown);

                if (!isRenderCurrent()) {
                    return;
                }

                // 濡傛灉鏄唬鐮佸潡 cloze锛岃繘琛岄澶栧鐞嗭紙琛屽彿銆侀珮浜瓑锛?
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

/**
 * 棰勫鐞嗘暟瀛﹀叕寮忎腑鐨?cloze HTML 鏍囩
 *
 * 闂锛歲uestion-type.ts 鐢熸垚鐨勫崱鐗囧唴瀹逛腑锛宑loze 浣跨敤 HTML <span> 鏍囩鏍囪銆?
 * MathJax 鏃犳硶瑙ｆ瀽 HTML 鏍囩锛屽鑷村叕寮忔覆鏌撳嚭涔辩爜銆?
 *
 * 瑙ｅ喅锛氬湪 renderMarkdown 璋冪敤鍓嶏紝鎵弿鎵€鏈?$...$ / $$...$$ 鍏紡鍧楋紝
 * 灏嗗叾涓殑 cloze HTML 鏍囩杞崲涓?LaTeX \color{} 鍛戒护銆?
 *
 * 杩欐牱 MathJax 鏀跺埌鐨勬槸绾?LaTeX 浠ｇ爜锛岃兘姝ｇ‘娓叉煋甯﹂鑹茬殑濉┖鏁堟灉銆?
 * 澶嶇敤浜?latex-cloze-preprocessor.ts 鐨勬覆鏌撴€濊矾銆?
 */
function preprocessMathCloze(
    content: string,
    latexMode: "highlight" | "mask" = "highlight",
): string {
    content = normalizeSrMarkers(content);

    // 蹇€熸鏌ワ細濡傛灉涓嶅寘鍚暟瀛﹀畾鐣岀鎴?marker 鏍囪锛岀洿鎺ヨ繑鍥?
    const hasMath = content.includes("$");
    const hasMarker = content.includes("««SR_");
    const hasAnkiCloze = content.includes("{{c");
    if (!hasMath || (!hasMarker && !hasAnkiCloze)) return content;

    let result = content;

    // 澶勭悊鍧楃骇鍏紡 $$...$$
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_fullMatch: string, inner: string) => {
        // 浣跨敤 transformLatex 鏇夸唬鑴嗗急鐨勬鍒欐浛鎹?
        // 鍦ㄥ崱鐗囧涔犲満鏅笅锛屼笉闇€瑕佸尯鍒?activeId锛屽洜涓?question-type 宸茬粡澶勭悊濂戒簡
        return `$$${transformLatex(inner, latexMode, null)}$$`;
    });

    // 澶勭悊琛屽唴鍏紡 $...$锛堥伩鍏嶅尮閰?$$锛?
    result = result.replace(
        /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g,
        (_fullMatch: string, inner: string) => `$${transformLatex(inner, latexMode, null)}$`,
    );

    return result;
}

/**
 * 灏嗗叕寮忎腑鐨?cloze HTML span 鏍囩杞崲涓?LaTeX \color{} 鍛戒护
 *
 * 杈撳叆锛? <span class='sr-cloze-hidden'>[...]</span> + y
 * 杈撳嚭锛? {\color{#3b82f6}[\ldots]} + y
 *
 * 杈撳叆锛? <span class='sr-cloze-shown'>x^2</span> + y
 * 杈撳嚭锛? {\color{#60a5fa}x^2} + y
 */

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

/**
 * 鍚庡鐞嗕唬鐮佸潡锛氭坊鍔犺鍙枫€侀珮浜墍鏈?cloze 琛屻€佹浛鎹㈠崰浣嶇
 *
 * 楂樹寒瑙勫垯锛氭墍鏈夊寘鍚?芦芦SR_CLOZE:...禄禄 鍗犱綅绗︾殑琛岄兘搴旈珮浜?
 * 婊氬姩瑙勫垯锛氱涓€涓珮浜婊氬姩鍒拌鍙ｅ瀭鐩翠腑蹇?
 */
function postProcessCodeBlock(container: HTMLElement, _clozeLine: number, startLine: number) {
    console.debug("[SR Debug] postProcessCodeBlock called");

    const preElements = container.querySelectorAll("pre");
    console.debug("[SR Debug] Found pre elements:", preElements.length);

    if (preElements.length === 0) {
        // 濡傛灉娌℃湁鎵惧埌 pre 鍏冪礌锛屽皾璇曠洿鎺ュ鐞嗗鍣ㄥ唴瀹?
        console.debug("[SR Debug] No pre elements, trying to process container directly");
        console.debug("[SR Debug] Container innerHTML:", container.innerHTML.substring(0, 500));
        return;
    }

    preElements.forEach((pre, preIndex) => {
        const codeEl = pre.querySelector("code");
        console.debug("[SR Debug] Pre", preIndex, "has code element:", !!codeEl);

        if (!codeEl) {
            // 鏌愪簺鎯呭喌涓嬪彲鑳芥病鏈?code 鍏冪礌锛岀洿鎺ヤ娇鐢?pre 鐨勫唴瀹?
            console.debug("[SR Debug] No code element, using pre innerHTML");
        }

        // 鑾峰彇浠ｇ爜鍐呭锛堜紭鍏堜娇鐢?code 鍏冪礌锛屽惁鍒欎娇鐢?pre锛?
        let codeContent = codeEl ? codeEl.innerHTML : pre.innerHTML;
        console.debug("[SR Debug] Original codeContent:", codeContent.substring(0, 200));

        // 鍏堝皢 HTML 瀹炰綋杞崲鍥?Unicode 瀛楃锛圤bsidian 娓叉煋鍚庡彲鑳戒細杞箟锛?
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

        // 璁板綍鍖呭惈鍗犱綅绗︾殑琛岀储寮曪紙鐢ㄤ簬澶氳楂樹寒锛?
        const clozeLineIndices: Set<number> = new Set();

        // 鍏堟壘鍑烘墍鏈夊崰浣嶇鎵€鍦ㄧ殑琛岋紙瀹瑰繊鍐呴儴鏈変换浣?HTML 鏍囩纰庣墖锛?
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

        // 鍏煎鏃ф牸寮?
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

        // 鍒涘缓鏂扮殑瀹瑰櫒
        const wrapper = document.createElement("div");
        wrapper.className = "sr-code-block-card";

        let currentRealLine = startLine;
        let firstClozeDiv: HTMLElement | null = null;

        lines.forEach((lineContent, index) => {
            const trimmedLine = lineContent.trim();
            // 璺宠繃浠ｇ爜鍧楀紑濮嬪拰缁撴潫鏍囪琛?
            if (trimmedLine.startsWith("```") || trimmedLine.startsWith("~~~")) {
                return; // 涓嶆樉绀烘爣璁拌
            }

            // 澶勭悊鐪佺暐鍙疯
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

            // 琛屽彿
            const lineNumSpan = document.createElement("span");
            lineNumSpan.className = "sr-code-line-number";
            lineNumSpan.textContent = String(currentRealLine);

            // 琛屽唴瀹?
            const lineContentSpan = document.createElement("span");
            lineContentSpan.className = "sr-code-line-content";
            setCodeLineContent(lineContentSpan, lineContent);

            lineDiv.appendChild(lineNumSpan);
            lineDiv.appendChild(lineContentSpan);
            wrapper.appendChild(lineDiv);

            // 璁板綍绗竴涓珮浜鐢ㄤ簬婊氬姩
            if (isCloze && !firstClozeDiv) {
                firstClozeDiv = lineDiv;
            }

            currentRealLine++; // 鍙湁鐪熷疄浠ｇ爜琛屾墠閫掑
        });

        // 鏇挎崲鍘熸潵鐨?pre
        pre.parentNode?.replaceChild(wrapper, pre);

        // 婊氬姩鍒扮涓€涓?cloze 琛岋紙灞呬腑鏄剧ず锛?
        if (firstClozeDiv) {
            setTimeout(() => {
                firstClozeDiv.scrollIntoView({
                    block: "center",
                    behavior: "auto",
                });
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
}: {
    isFlipped: boolean;
    card?: CardState;
    renderMarkdown?: (text: string, el: HTMLElement) => Promise<void> | void;
    showOtherAnkiClozeVisual?: boolean;
    showOtherHighlightClozeVisual?: boolean;
    showOtherBoldClozeVisual?: boolean;
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number | null>(null);
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

    // 缈婚潰鏃舵洿鏂板鍣ㄧ殑 class锛堜粎鐢ㄤ簬浠ｇ爜鍧?Cloze锛?
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

    // 婊氬姩鍒扮涓€涓～绌轰綅缃?
    useEffect(() => {
        const activeHost = getClozeFaceHost(containerRef.current, activeFace);
        if (!activeHost) return;
        schedulePositionActiveCloze(activeFace);

        const observer = new MutationObserver(() => {
            schedulePositionActiveCloze(activeFace);
        });

        observer.observe(activeHost, { childList: true, subtree: true, characterData: true });

        // 浼樺厛鏌ユ壘 cloze 鍗犱綅绗?class

        // 鍏煎鏃ф牸寮忥細鏌ユ壘甯︽湁钃濊壊鏍峰紡鐨?[...] span
        return () => {
            observer.disconnect();
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, [activeFace, card?.front, card?.back, card?.review, isFlipped, schedulePositionActiveCloze]);

    // 鏍规嵁鏄惁涓轰唬鐮佸潡 Cloze 閫夋嫨娓叉煋绛栫暐
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
                    const text = mark.textContent || "";
                    const textNode = document.createTextNode(text);
                    mark.parentNode?.replaceChild(textNode, mark);
                });
            }

            if (!showOtherBoldClozeVisual) {
                const bolds = container.querySelectorAll("strong, b");
                bolds.forEach((bold) => {
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
