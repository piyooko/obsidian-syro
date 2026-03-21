/** @jsxImportSource react */
/**
 * 线性卡片组件 (LinearCard Component)
 *
 * 这个文件是核心 UI 组件，负责渲染类似于 UIsandbox 风格的线性复习卡片界面。
 * 它在项目中属于：界面层 (UI Layer)
 *
 * 它依赖于：
 * - src/ui/styles/linear-card.css (样式定义)
 * - src/ui/components/CardEditorView (卡片编辑器)
 * - src/ui/components/CardDebugModal (调试模态框)
 *
 * 它主要实现的功能：
 * - 显示问题和答案（支持 Markdown 和代码块高亮）
 * - 提供评分按钮（重来/较难/记得/简单）
 * - 提供更多选项菜单（撤销/编辑/推迟/删除等）
 * - 响应式设计，适配桌面和移动端
 */
import React, { useState, useEffect, useCallback, useRef, Fragment, ReactNode } from "react";
import type { FC, PropsWithChildren } from "react";
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
import { CardEditorView } from "./CardEditorView";
import type SRPlugin from "src/main";
import "../styles/linear-card.css";
import { t } from "src/lang/helpers";
import { transformLatex } from "../../utils/latexTransformer";

// 卡片状态类型
export interface CardState {
    front: string;
    back: string;
    responseButtonLabels?: string[];
}

interface LinearCardProps {
    card?: CardState;
    deckPath?: string;
    stats?: { new: number; learning: number; due: number };
    type?: "basic" | "cloze";
    breadcrumbs?: string[];
    filename?: string;
    autoAdvanceSeconds?: number;
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
    debugInfo?: any;
    cardType?: "new" | "learning" | "due";
    /** 是否为移动端，用于应用全屏样式 */
    isMobile?: boolean;
    /** 原始 Markdown 内容，用于编辑 */
    rawContent?: string;
    /** 插件实例，用于访问 app.hotkeyManager */
    plugin?: SRPlugin;
    /** 内容更新回调 */
    onUpdateContent?: (text: string) => void;
}

type ToastMsg = { icon: ReactNode; text: string; id: number };

export const LinearCard: FC<LinearCardProps> = ({
    card,
    stats: initialStats = { new: 45, learning: 12, due: 68 },
    type = "basic",
    breadcrumbs = [],
    filename = "Card.md",
    autoAdvanceSeconds = 10,
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
    // 内部状态用于平滑调整大小
    const [size, setSize] = useState({ width, height });
    const wrapperRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const sizeRef = useRef({ width, height });
    const isResizingRef = useRef(false);

    // 当 props 更新时同步（如果未在拖拽中）
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

    // 同步 cardType prop 的变化
    useEffect(() => {
        if (cardType) {
            setCurrentType(cardType);
        }
    }, [cardType]);

    // 编辑状态
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(rawContent);

    // 同步 rawContent prop 变化
    useEffect(() => {
        setEditText(rawContent);
    }, [rawContent]);

    // Resize Logic (支持鼠标和触摸)
    const handleResizeStart = (e: any, direction: string) => {
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

        // 最大边界约束 (保证卡片不超出页面)
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

            // 约束最大值
            sizeRef.current = { width: currentW, height: currentH };
            flushSize();
        };

        const handleEnd = () => {
            document.removeEventListener("mousemove", handleMove);
            document.removeEventListener("mouseup", handleEnd);
            document.removeEventListener("touchmove", handleMove);
            document.removeEventListener("touchend", handleEnd);
            // 保存最终尺寸
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

    // 重置卡片相关的局部 UI 状态，避免切卡后残留上一张卡的菜单/提示/删除态
    useEffect(() => {
        setIsFlipped(false);
        setIsEditing(false);
        setShowMenu(false);
        setShowInfo(false);
        setToasts([]);
        setIsDeleted(false);
        setTimeExpired(false);
    }, [card]);

    useEffect(() => {
        setStats(initialStats);
    }, [initialStats]);

    const showToast = useCallback((text: string, icon: ReactNode) => {
        const id = Date.now();
        setToasts((prev) => [...prev, { text, icon, id }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 2000);
    }, []);

    // 切换编辑模式
    const toggleEditMode = useCallback(() => {
        console.log("[LinearCard] toggleEditMode called", {
            isEditing,
            plugin: !!plugin,
            rawContent: rawContent?.substring(0, 30),
        });

        if (isEditing) {
            // 退出编辑模式
            setIsEditing(false);
            showToast(t("UI_EXIT_EDIT_MODE"), (<Check size={14} />) as any);
        } else {
            // 进入编辑模式
            console.log("[LinearCard] Entering edit mode, plugin:", plugin);
            setEditText(rawContent);
            setIsEditing(true);
            setIsFlipped(true); // 确保显示背面
            showToast(t("UI_ENTER_EDIT_MODE"), <Edit3 size={14} />);
        }
    }, [isEditing, rawContent, showToast, plugin]);

    const handleAnswerInternal = useCallback(
        (rating: number) => {
            if (plugin?.data?.settings?.showRuntimeDebugMessages) {
                console.log("[SR Debug] handleAnswerInternal called", {
                    rating,
                    isDeleted,
                    hasOnAnswer: !!onAnswer,
                });
            }
            if (isDeleted) return;

            // 不再进行乐观更新：
            // Learn 卡片在步骤未完成时计数不变，乐观更新会导致动画先减后恢复
            // 现在完全由后端状态驱动 UI 变化，确保数字只在真正变化时才触发动画
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

    // 键盘快捷键
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 编辑模式下不处理复习快捷键（让编辑器自己处理）
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

    // 移动端全屏 wrapper 类名
    const wrapperClassName = isMobile
        ? "sr-linear-card-wrapper sr-fixed sr-inset-0 sr-z-50 sr-w-full sr-h-full sr-flex sr-items-center sr-justify-center"
        : "sr-linear-card-wrapper";

    return (
        <div className={wrapperClassName} ref={wrapperRef}>
            {/* 移动端背景遮罩 */}
            {isMobile && <div className="sr-absolute sr-inset-0 sr-bg-black/50" />}
            {/* Toast 容器 */}
            <div className="sr-toast-container">
                <AnimatePresence>
                    {
                        toasts.map((toast) => (
                            <motion.div
                                key={toast.id}
                                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="sr-toast"
                            >
                                {toast.icon as any}
                                <span>{toast.text}</span>
                            </motion.div>
                        )) as any
                    }
                </AnimatePresence>
            </div>

            {/* 卡片本体 */}
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
                    (
                        <>
                            {/* Resize Handles (支持鼠标和触摸) */}
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

                            {/* 顶部高光线 */}
                            <div className="sr-card-highlight" />

                            {/* Header */}
                            <div className="sr-card-header">
                                {/* 左侧：返回与面包屑 */}
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

                                            {breadcrumbs.map(
                                                (crumb, index) =>
                                                    (
                                                        <Fragment key={index}>
                                                            <span className="sr-breadcrumb-item">
                                                                {crumb}
                                                            </span>
                                                            {index < breadcrumbs.length - 1 &&
                                                                ((
                                                                    <ChevronRight
                                                                        size={10}
                                                                        className="sr-breadcrumb-separator"
                                                                    />
                                                                ) as any)}
                                                        </Fragment>
                                                    ) as any,
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* 右侧：统计与菜单 */}
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
                                            {
                                                (showMenu && (
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
                                                            {
                                                                (
                                                                    <>
                                                                        <MenuItem
                                                                            onClick={() =>
                                                                                handleMenuAction(
                                                                                    "UNDO",
                                                                                )
                                                                            }
                                                                            icon={
                                                                                <Undo2 size={14} />
                                                                            }
                                                                            label={t("UI_UNDO")}
                                                                            kbd="Ctrl+Z"
                                                                        />
                                                                        <div className="sr-menu-divider" />
                                                                        <MenuItem
                                                                            onClick={() =>
                                                                                handleMenuAction(
                                                                                    "OPEN",
                                                                                )
                                                                            }
                                                                            icon={
                                                                                <FileText
                                                                                    size={14}
                                                                                />
                                                                            }
                                                                            label={t(
                                                                                "UI_OPEN_LOCATION",
                                                                            )}
                                                                            kbd="O"
                                                                        />
                                                                        <MenuItem
                                                                            onClick={() =>
                                                                                handleMenuAction(
                                                                                    "INFO",
                                                                                )
                                                                            }
                                                                            icon={
                                                                                <Info size={14} />
                                                                            }
                                                                            label={t(
                                                                                "UI_CARD_INFO",
                                                                            )}
                                                                            kbd="I"
                                                                        />
                                                                        <MenuItem
                                                                            onClick={() =>
                                                                                handleMenuAction(
                                                                                    "POSTPONE",
                                                                                )
                                                                            }
                                                                            icon={
                                                                                <Clock size={14} />
                                                                            }
                                                                            label={t(
                                                                                "UI_POSTPONE_ONE_DAY",
                                                                            )}
                                                                            kbd="P"
                                                                        />
                                                                        <div className="sr-menu-divider" />
                                                                        <MenuItem
                                                                            onClick={() =>
                                                                                handleMenuAction(
                                                                                    "DELETE",
                                                                                )
                                                                            }
                                                                            icon={
                                                                                <Trash2 size={14} />
                                                                            }
                                                                            label={t(
                                                                                "UI_DELETE_CARD",
                                                                            )}
                                                                            intent="danger"
                                                                            kbd="Del"
                                                                        />
                                                                    </>
                                                                ) as any
                                                            }
                                                        </motion.div>
                                                    </>
                                                )) as any
                                            }
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>

                            {/* 计时器进度条 */}
                            <div className="sr-timer-bar-container">
                                <AnimatePresence mode="wait">
                                    {
                                        (!isFlipped && autoAdvanceSeconds > 0 && (
                                            <TimerBar
                                                duration={autoAdvanceSeconds}
                                                onComplete={() => {
                                                    setTimeExpired(true);
                                                    setIsFlipped(true);
                                                    onShowAnswer?.();
                                                }}
                                                timeExpired={timeExpired}
                                            />
                                        )) as any
                                    }
                                </AnimatePresence>
                            </div>

                            {/* 内容区域 */}
                            <div
                                className={`sr-card-content-area ${isEditing ? "sr-is-editing" : ""}`}
                            >
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
                                                isFlipped={isFlipped}
                                                card={card}
                                                renderMarkdown={renderMarkdown}
                                                showOtherAnkiClozeVisual={
                                                    plugin
                                                        ? !plugin.data.settings
                                                              .convertAnkiClozesToClozes ||
                                                          plugin.data.settings
                                                              .showOtherAnkiClozeVisual
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
                                                          plugin.data.settings
                                                              .showOtherBoldClozeVisual
                                                        : false
                                                }
                                            />
                                        ) : (
                                            <BasicContent
                                                isFlipped={isFlipped}
                                                card={card || { front: "Q", back: "A" }}
                                                renderMarkdown={renderMarkdown}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Footer - 编辑模式下显示退出按钮 */}
                            <div className="sr-card-footer">
                                <AnimatePresence mode="wait" initial={false}>
                                    {
                                        (isEditing ? (
                                            <motion.div
                                                key="edit-footer"
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -5 }}
                                                transition={{ duration: 0.1 }}
                                            >
                                                {
                                                    (
                                                        <button
                                                            onClick={toggleEditMode}
                                                            className="sr-show-answer-btn sr-exit-edit-btn"
                                                        >
                                                            <Save size={16} /> 完成编辑{" "}
                                                            <span className="sr-kbd">ESC</span>
                                                        </button>
                                                    ) as any
                                                }
                                            </motion.div>
                                        ) : !isFlipped ? (
                                            <motion.div
                                                key="show-answer"
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -5 }}
                                                transition={{ duration: 0.1 }}
                                            >
                                                {
                                                    (
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
                                                    ) as any
                                                }
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
                                                    (
                                                        <>
                                                            <LinearButton
                                                                icon={<RotateCcw size={12} />}
                                                                label={t("UI_RESET")}
                                                                sub={
                                                                    card
                                                                        ?.responseButtonLabels?.[0] ||
                                                                    "1m"
                                                                }
                                                                shortcut="1"
                                                                className="is-reset"
                                                                variant="reset"
                                                                onClick={() =>
                                                                    handleAnswerInternal(0)
                                                                }
                                                            />
                                                            <LinearButton
                                                                icon={<ThumbsDown size={12} />}
                                                                label={t("UI_HARD")}
                                                                sub={
                                                                    card
                                                                        ?.responseButtonLabels?.[1] ||
                                                                    "10m"
                                                                }
                                                                shortcut="2"
                                                                className="is-hard"
                                                                variant="hard"
                                                                onClick={() =>
                                                                    handleAnswerInternal(1)
                                                                }
                                                            />
                                                            <LinearButton
                                                                icon={<Check size={12} />}
                                                                label={t("UI_GOOD")}
                                                                sub={
                                                                    card
                                                                        ?.responseButtonLabels?.[2] ||
                                                                    "3d"
                                                                }
                                                                shortcut="3"
                                                                className="is-good"
                                                                variant="good"
                                                                onClick={() =>
                                                                    handleAnswerInternal(2)
                                                                }
                                                            />
                                                            <LinearButton
                                                                icon={<Zap size={12} />}
                                                                label={t("UI_EASY")}
                                                                sub={
                                                                    card
                                                                        ?.responseButtonLabels?.[3] ||
                                                                    "7d"
                                                                }
                                                                shortcut="4"
                                                                className="is-easy"
                                                                variant="easy"
                                                                onClick={() =>
                                                                    handleAnswerInternal(3)
                                                                }
                                                            />
                                                        </>
                                                    ) as any
                                                }
                                            </motion.div>
                                        )) as any
                                    }
                                </AnimatePresence>
                            </div>
                        </>
                    ) as any
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
// 辅助组件
// ==========================================

const TimerBar = ({
    duration,
    onComplete,
    timeExpired,
}: {
    duration: number;
    onComplete: () => void;
    timeExpired: boolean;
}) => (
    <motion.div
        initial={{ width: "0%", opacity: 1 }}
        animate={{
            width: "100%",
            backgroundColor: ["#3b82f6", "#3b82f6", "#ef4444"],
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
        onAnimationComplete={(definition) => {
            if (
                definition === "animate" ||
                (typeof definition === "object" &&
                    "width" in definition &&
                    definition.width === "100%")
            ) {
                onComplete();
            }
        }}
        className="sr-timer-bar"
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
// 修改后的 LinearButton - 水平布局，图标在左
// 严格匹配 UIsandbox 结构
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
}: {
    content: string;
    renderMarkdown?: (text: string, el: HTMLElement) => Promise<void> | void;
    onRendered?: (el: HTMLDivElement) => void;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const renderAsync = async () => {
            if (!ref.current) return;

            // 检查是否有代码块 cloze 标记
            const clozeMatch = content.match(/<!--SR_CODE_CLOZE:(\d+):(\d+)-->/);
            let clozeLine = clozeMatch ? parseInt(clozeMatch[1]) : null;
            let startLine = clozeMatch ? parseInt(clozeMatch[2]) : 1;

            // 移除标记后渲染
            let cleanContent = content.replace(/<!--SR_CODE_CLOZE:\d+:\d+-->\n?/, "");
            cleanContent = normalizeSrMarkers(cleanContent);

            // 【增强】：如果没有显式标记，但内容包含代码块和占位符，自动检测
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

            // 【LaTeX 填空处理】在渲染前，将数学公式中的 marker 转为 LaTeX \color{} 命令
            cleanContent = preprocessMathCloze(cleanContent);

            if (renderMarkdown) {
                // 1. 创建离线缓冲区
                const buffer = document.createElement("div");

                // 2. 异步渲染 Markdown 到缓冲区
                await renderMarkdown(cleanContent, buffer);

                // 3. 同步执行所有后处理器
                postProcessMarkers(buffer);

                // 如果是代码块 cloze，进行额外处理（行号、高亮等）
                if (clozeLine !== null || (hasCodeBlock && hasPlaceholder)) {
                    postProcessCodeBlock(buffer, clozeLine || 1, startLine);
                }

                // 4. 原子级内容替换（原子交换，消除中间态闪烁）
                if (ref.current) {
                    ref.current.innerHTML = "";
                    while (buffer.firstChild) {
                        ref.current.appendChild(buffer.firstChild);
                    }
                    onRendered?.(ref.current);
                }
            } else {
                ref.current.textContent = cleanContent;
                onRendered?.(ref.current);
            }
        };

        renderAsync();
    }, [content, renderMarkdown, onRendered]);

    return (
        <div
            className="sr-markdown-content markdown-preview-view markdown-rendered"
            ref={ref}
            style={{ textAlign: "left" }}
        />
    );
};

/**
 * 预处理数学公式中的 cloze HTML 标签
 *
 * 问题：question-type.ts 生成的卡片内容中，cloze 使用 HTML <span> 标签标记。
 * MathJax 无法解析 HTML 标签，导致公式渲染出乱码。
 *
 * 解决：在 renderMarkdown 调用前，扫描所有 $...$ / $$...$$ 公式块，
 * 将其中的 cloze HTML 标签转换为 LaTeX \color{} 命令。
 *
 * 这样 MathJax 收到的是纯 LaTeX 代码，能正确渲染带颜色的填空效果。
 * 复用了 latex-cloze-preprocessor.ts 的渲染思路。
 */
function preprocessMathCloze(content: string): string {
    content = normalizeSrMarkers(content);

    // 快速检查：如果不包含数学定界符或 marker 标记，直接返回
    const hasMath = content.includes("$");
    const hasMarker = content.includes("««SR_");
    const hasAnkiCloze = content.includes("{{c");
    if (!hasMath || (!hasMarker && !hasAnkiCloze)) return content;

    let result = content;

    // 处理块级公式 $$...$$
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (fullMatch, inner) => {
        // 使用 transformLatex 替代脆弱的正则替换
        // 在卡片复习场景下，不需要区分 activeId，因为 question-type 已经处理好了
        return `$$${transformLatex(inner, "highlight", null)}$$`;
    });

    // 处理行内公式 $...$（避免匹配 $$）
    result = result.replace(/(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g, (fullMatch, inner) => {
        return `$${transformLatex(inner, "highlight", null)}$`;
    });

    return result;
}

function normalizeSrMarkers(text: string): string {
    return text
        .replace(/&laquo;/g, "«")
        .replace(/&raquo;/g, "»")
        .replace(/&#171;/g, "«")
        .replace(/&#187;/g, "»")
        .replace(/芦芦/g, "««")
        .replace(/禄禄/g, "»»");
}

/**
 * 将公式中的 cloze HTML span 标签转换为 LaTeX \color{} 命令
 *
 * 输入：  <span class='sr-cloze-hidden'>[...]</span> + y
 * 输出：  {\color{#3b82f6}[\ldots]} + y
 *
 * 输入：  <span class='sr-cloze-shown'>x^2</span> + y
 * 输出：  {\color{#60a5fa}x^2} + y
 */

/**
 * 全局后处理器：将所有标记替换为带样式的 HTML
 * 运行在 Markdown 渲染之后，确保标记不会被 Obsidian 转义
 */
function postProcessMarkers(container: HTMLElement) {
    // 处理所有文本节点（更安全，不会破坏已有 DOM 结构）
    const walk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let node;
    const nodesToReplace: { node: Text; fragments: (Text | HTMLElement)[] }[] = [];

    while ((node = walk.nextNode() as Text)) {
        let text = normalizeSrMarkers(node.textContent || "");

        if (!text.includes("««SR_")) continue;

        const fragments: (Text | HTMLElement)[] = [];
        let lastEnd = 0;
        const regex = /««SR_([HS]):([^»]+)»»/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            // 前面的普通文本
            if (match.index > lastEnd) {
                fragments.push(document.createTextNode(text.substring(lastEnd, match.index)));
            }

            const type = match[1];
            const encoded = match[2];
            try {
                const content = decodeURIComponent(encoded);
                const span = document.createElement("span");
                if (type === "H") {
                    span.className = "sr-cloze-hidden";
                    span.textContent = content;
                } else {
                    span.className = "sr-cloze-shown sr-is-active";
                    span.textContent = content;
                }
                fragments.push(span);
            } catch {
                fragments.push(document.createTextNode(match[0]));
            }
            lastEnd = regex.lastIndex;
        }

        if (lastEnd < text.length) {
            fragments.push(document.createTextNode(text.substring(lastEnd)));
        }

        if (fragments.length > 0) {
            nodesToReplace.push({ node, fragments });
        }
    }

    // 执行替换
    nodesToReplace.forEach(({ node, fragments }) => {
        const parent = node.parentNode;
        if (parent) {
            fragments.forEach((frag) => parent.insertBefore(frag, node));
            parent.removeChild(node);
        }
    });
}

/**
 * 后处理代码块：添加行号、高亮所有 cloze 行、替换占位符
 *
 * 高亮规则：所有包含 ««SR_CLOZE:...»» 占位符的行都应高亮
 * 滚动规则：第一个高亮行滚动到视口垂直中心
 */
function postProcessCodeBlock(container: HTMLElement, _clozeLine: number, startLine: number) {
    console.log("[SR Debug] postProcessCodeBlock called");

    const preElements = container.querySelectorAll("pre");
    console.log("[SR Debug] Found pre elements:", preElements.length);

    if (preElements.length === 0) {
        // 如果没有找到 pre 元素，尝试直接处理容器内容
        console.log("[SR Debug] No pre elements, trying to process container directly");
        console.log("[SR Debug] Container innerHTML:", container.innerHTML.substring(0, 500));
        return;
    }

    preElements.forEach((pre, preIndex) => {
        const codeEl = pre.querySelector("code");
        console.log("[SR Debug] Pre", preIndex, "has code element:", !!codeEl);

        if (!codeEl) {
            // 某些情况下可能没有 code 元素，直接使用 pre 的内容
            console.log("[SR Debug] No code element, using pre innerHTML");
        }

        // 获取代码内容（优先使用 code 元素，否则使用 pre）
        let codeContent = codeEl ? codeEl.innerHTML : pre.innerHTML;
        console.log("[SR Debug] Original codeContent:", codeContent.substring(0, 200));

        // 先将 HTML 实体转换回 Unicode 字符（Obsidian 渲染后可能会转义）
        codeContent = codeContent
            .replace(/&laquo;/g, "«")
            .replace(/&raquo;/g, "»")
            .replace(/&#171;/g, "«")
            .replace(/&#187;/g, "»");

        console.log("[SR Debug] After entity decode:", codeContent.substring(0, 200));
        console.log("[SR Debug] Contains placeholder marker:", codeContent.includes("««SR_CLOZE:"));

        // 记录包含占位符的行索引（用于多行高亮）
        const clozeLineIndices: Set<number> = new Set();

        // 先找出所有占位符所在的行（容忍内部有任何 HTML 标签碎片）
        const rawLines = codeContent.split("\n");
        rawLines.forEach((line, idx) => {
            const cleanLine = line.replace(/<[^>]+>/g, "");
            if (cleanLine.includes("««SR_CLOZE:")) {
                clozeLineIndices.add(idx);
            }
        });

        codeContent = codeContent.replace(/««[\s\S]*?»»/g, (match) => {
            const cleanMatch = match.replace(/<[^>]+>/g, "");
            if (cleanMatch.startsWith("««SR_CLOZE:")) {
                const encoded = cleanMatch.substring(11, cleanMatch.length - 2);
                try {
                    const decoded = decodeURIComponent(encoded);
                    return `<span class="sr-cloze-wrapper"><span class="sr-cloze-placeholder">[...]</span><span class="sr-cloze-answer">${decoded}</span></span>`;
                } catch {
                    return match;
                }
            }
            return match;
        });

        // 兼容旧格式
        codeContent = codeContent.replace(
            /««SR_CLOZE_FRONT»»/g,
            '<span class="sr-cloze-placeholder">[...]</span>',
        );
        codeContent = codeContent.replace(/««SR_CLOZE_BACK:([^»]+)»»/g, (match, encoded) => {
            try {
                const decoded = decodeURIComponent(encoded);
                return `<span class="sr-cloze-answer">${decoded}</span>`;
            } catch {
                return match;
            }
        });

        const lines = codeContent.split("\n");

        // 创建新的容器
        const wrapper = document.createElement("div");
        wrapper.className = "sr-code-block-card";

        let currentRealLine = startLine;
        let firstClozeDiv: HTMLElement | null = null;

        lines.forEach((lineContent, index) => {
            const trimmedLine = lineContent.trim();
            // 跳过代码块开始和结束标记行
            if (trimmedLine.startsWith("```") || trimmedLine.startsWith("~~~")) {
                return; // 不显示标记行
            }

            // 处理省略号行
            if (trimmedLine.startsWith("// ...")) {
                const lineDiv = document.createElement("div");
                lineDiv.className = "sr-code-context-line sr-code-ellipsis";
                lineDiv.innerHTML = `<span class="sr-code-line-number"></span><span class="sr-code-line-content" style="opacity:0.5; font-style:italic;">${lineContent}</span>`;
                wrapper.appendChild(lineDiv);
                return;
            }

            const isCloze = clozeLineIndices.has(index);

            const lineDiv = document.createElement("div");
            lineDiv.className = isCloze ? "sr-code-cloze-line" : "sr-code-context-line";
            lineDiv.dataset.line = String(currentRealLine);

            // 行号
            const lineNumSpan = document.createElement("span");
            lineNumSpan.className = "sr-code-line-number";
            lineNumSpan.textContent = String(currentRealLine);

            // 行内容
            const lineContentSpan = document.createElement("span");
            lineContentSpan.className = "sr-code-line-content";
            lineContentSpan.innerHTML = lineContent || " ";

            lineDiv.appendChild(lineNumSpan);
            lineDiv.appendChild(lineContentSpan);
            wrapper.appendChild(lineDiv);

            // 记录第一个高亮行用于滚动
            if (isCloze && !firstClozeDiv) {
                firstClozeDiv = lineDiv;
            }

            currentRealLine++; // 只有真实代码行才递增
        });

        // 替换原来的 pre
        pre.parentNode?.replaceChild(wrapper, pre);

        // 滚动到第一个 cloze 行（居中显示）
        if (firstClozeDiv) {
            setTimeout(() => {
                (firstClozeDiv as HTMLElement).scrollIntoView({
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
    const scrollRect = scrollContainer.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const delta = targetRect.top + targetRect.height / 2 - (scrollRect.top + scrollRect.height / 2);
    const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    const nextScrollTop = Math.max(0, Math.min(scrollContainer.scrollTop + delta, maxScrollTop));

    scrollContainer.scrollTop = nextScrollTop;
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
    renderMarkdown?: (text: string, el: HTMLElement) => void;
    showOtherAnkiClozeVisual?: boolean;
    showOtherHighlightClozeVisual?: boolean;
    showOtherBoldClozeVisual?: boolean;
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number | null>(null);

    const centerActiveCloze = useCallback(() => {
        const container = containerRef.current;
        const scrollContainer = getScrollContainer(container);
        if (!container || !scrollContainer) return;

        const target = findActiveClozeTarget(container, isFlipped);
        if (!target) return;

        centerElementInScrollContainer(target, scrollContainer);
    }, [isFlipped]);

    const scheduleCenterActiveCloze = useCallback(() => {
        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current);
        }

        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = requestAnimationFrame(() => {
                centerActiveCloze();
                frameRef.current = null;
            });
        });
    }, [centerActiveCloze]);

    // 检测是否为代码块类型的 Cloze（包含特殊占位符）
    const isCodeBlockCloze = (card?.front || "").includes("««SR_CLOZE:");

    // 翻面时更新容器的 class（仅用于代码块 Cloze）
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

    // 滚动到第一个填空位置
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        scheduleCenterActiveCloze();

        const observer = new MutationObserver(() => {
            scheduleCenterActiveCloze();
        });

        observer.observe(container, { childList: true, subtree: true, characterData: true });

                // 优先查找 cloze 占位符 class

                // 兼容旧格式：查找带有蓝色样式的 [...] span
        return () => {
            observer.disconnect();
            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, [card, isFlipped, scheduleCenterActiveCloze]);

    // 根据是否为代码块 Cloze 选择渲染策略
    let contentToRender = isCodeBlockCloze
        ? (card as any)?.front || ""
        : isFlipped
          ? (card as any)?.back || (card as any)?.front || ""
          : (card as any)?.front || "";

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
        card,
    ]);

    return (
        <div className={`sr-cloze-content ${isFlipped ? "sr-flipped" : ""}`} ref={containerRef}>
            <MarkdownDisplay
                content={contentToRender}
                renderMarkdown={renderMarkdown}
                onRendered={scheduleCenterActiveCloze}
            />
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
    renderMarkdown?: (text: string, el: HTMLElement) => void;
}) => (
    <div className="sr-basic-content">
        <div>
            <div className="sr-content-label">Question</div>
            <div className="sr-content-text">
                <MarkdownDisplay
                    content={card.front || "Question Content"}
                    renderMarkdown={renderMarkdown}
                />
            </div>
        </div>
        <AnimatePresence>
            {
                (isFlipped && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="sr-answer-section"
                    >
                        {
                            (
                                <>
                                    <div className="sr-content-divider" />
                                    <div className="sr-content-label">Answer</div>
                                    <div className="sr-content-text answer">
                                        <MarkdownDisplay
                                            content={card.back || "Answer Content"}
                                            renderMarkdown={renderMarkdown}
                                        />
                                    </div>
                                </>
                            ) as any
                        }
                    </motion.div>
                )) as any
            }
        </AnimatePresence>
    </div>
);
