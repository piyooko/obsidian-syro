/** @jsxImportSource react */
/**
 * 这个文件主要是干什么的：
 * 笔记复习侧边栏的核心界面组件。
 * 上半部分展示标签筛选栏和待复习的笔记列表，
 * 底部有一个可折叠的“提交信息”抽屉，用户可以给选中的笔记写提交记录，
 * 这些记录会以时间线的形式展示，方便追踪自己的复习历程。
 *
 * 它在项目中属于：界面层
 *
 * 它会用到哪些文件：
 * 1. src/ui/types/noteReview.ts
 * 2. src/ui/styles/note-review-sidebar.css
 * 3. src/dataStore/reviewCommitStore.ts
 *
 * 哪些文件会用到它：
 * 1. src/ui/views/ReactNoteReviewView.tsx
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { flushSync } from "react-dom";
import { App, Component, MarkdownRenderer } from "obsidian";
import { NoteReviewSection, NoteReviewItem, NoteReviewSidebarState } from "../types/noteReview";
import { ReviewCommitLog } from "src/dataStore/reviewCommitStore";
import { ArrowDownAZ, BarChart3, GripVertical, Menu } from "lucide-react";
import "../styles/note-review-sidebar.css";
import { t } from "src/lang/helpers";
import { TimelineCodeMirror } from "./TimelineCodeMirror";
import {
    buildTimelineRenderModel,
    sanitizeTimelineInlineMarkdown,
    TimelineDisplayDuration,
    normalizeTimelineInlineLines,
} from "src/ui/timeline/timelineMessage";

// ==========================================
// 类型定义
// ==========================================
type SortMode = "a-z" | "frequency" | "custom";

interface FilterBarProps {
    tags: { tag: string; count: number }[];
    totalCount: number;
    selectedTags: Set<string>;
    onToggleTag: (tag: string, multiSelect: boolean) => void;
    onClearTags: () => void;
    sortMode: SortMode;
    onSortModeChange: (mode: SortMode) => void;
    customOrder: string[];
    onCustomOrderChange: (order: string[]) => void;
    height: number;
    onHeightChange: (height: number) => void;
    onDragTagStart: (tag: string) => void;
    onIgnoreTag?: (tag: string) => void;
    onShowTagContextMenu?: (e: React.MouseEvent, tag: string) => void;
    onMobileTagDrop?: (notePath: string, tag: string) => void;
    hideHeader?: boolean;
}

// ==========================================
// Sort Mode Button
// ==========================================
// 内联 SVG 图标 - lucide 风格
const iconStyle = { width: "12px", height: "12px", minWidth: "12px", minHeight: "12px" };
const SortIcons = {
    "a-z": (
        // ArrowDownAZ - 字母排序
        <svg
            style={iconStyle}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="m3 16 4 4 4-4" />
            <path d="M7 20V4" />
            <path d="M20 8h-5" />
            <path d="M15 10V6.5a2.5 2.5 0 0 1 5 0V10" />
            <path d="M15 14h5l-5 6h5" />
        </svg>
    ),
    frequency: (
        // BarChart3 - 频率柱状图
        <svg
            style={iconStyle}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 3v18h18" />
            <path d="M18 17V9" />
            <path d="M13 17V5" />
            <path d="M8 17v-3" />
        </svg>
    ),
    custom: (
        // GripVertical - 拖拽手柄
        <svg
            style={iconStyle}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="9" cy="12" r="1" />
            <circle cx="9" cy="5" r="1" />
            <circle cx="9" cy="19" r="1" />
            <circle cx="15" cy="12" r="1" />
            <circle cx="15" cy="5" r="1" />
            <circle cx="15" cy="19" r="1" />
        </svg>
    ),
};

const SortModeButton: React.FC<{
    mode: SortMode;
    onModeChange: (mode: SortMode) => void;
}> = ({ mode, onModeChange }) => {
    const cycleMode = () => {
        const modes: SortMode[] = ["frequency", "a-z", "custom"];
        const currentIndex = modes.indexOf(mode);
        const nextMode = modes[(currentIndex + 1) % modes.length];
        onModeChange(nextMode);
    };

    const modeLabels = {
        "a-z": t("SORT_AZ"),
        frequency: t("SORT_FREQUENCY"),
        custom: t("SORT_CUSTOM"),
    };

    return (
        <button className="sr-sort-mode-btn" onClick={cycleMode} title={modeLabels[mode]}>
            {SortIcons[mode]}
        </button>
    );
};

// ==========================================
// Filter Bar (增强版)
// ==========================================
const FilterBar: React.FC<FilterBarProps> = ({
    tags,
    totalCount,
    selectedTags,
    onToggleTag,
    onClearTags,
    sortMode,
    onSortModeChange,
    customOrder,
    onCustomOrderChange,
    height,
    onHeightChange,
    onDragTagStart,
    onIgnoreTag,
    onShowTagContextMenu,
    onMobileTagDrop,
    hideHeader = false,
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const menuZoneRef = useRef<HTMLDivElement>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [draggedTag, setDraggedTag] = useState<string | null>(null);
    const draggedTagRef = useRef<string | null>(null);
    const [localCustomOrder, setLocalCustomOrder] = useState<string[]>(customOrder);
    const didDrop = useRef(false);
    const [isOverMenuZone, setIsOverMenuZone] = useState(false);
    // 移动端拖动位置追踪
    const [touchPosition, setTouchPosition] = useState<{ x: number; y: number } | null>(null);
    // 拖动元素的初始位置偏移
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

    useEffect(() => {
        setLocalCustomOrder(customOrder);
    }, [customOrder]);
    const longPressTimer = useRef<number | null>(null);

    // 滚轮横向滚动逻辑
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        let animationId: number | null = null;
        let targetScrollLeft = el.scrollLeft;

        const smoothScroll = () => {
            const diff = targetScrollLeft - el.scrollLeft;
            if (Math.abs(diff) > 1) {
                el.scrollLeft += diff * 0.15;
                animationId = requestAnimationFrame(smoothScroll);
            } else {
                el.scrollLeft = targetScrollLeft;
                animationId = null;
            }
        };

        const handleWheel = (e: WheelEvent) => {
            if (el.scrollWidth > el.clientWidth) {
                if (e.deltaY !== 0) {
                    e.preventDefault();
                    targetScrollLeft = Math.max(
                        0,
                        Math.min(el.scrollWidth - el.clientWidth, targetScrollLeft + e.deltaY),
                    );
                    if (!animationId) {
                        animationId = requestAnimationFrame(smoothScroll);
                    }
                }
            }
        };

        el.addEventListener("wheel", handleWheel, { passive: false });
        return () => {
            el.removeEventListener("wheel", handleWheel);
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, []);

    // 标签排序
    const sortedTags = useMemo(() => {
        let filtered = tags;
        if (searchTerm) {
            filtered = tags.filter((t) => t.tag.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        switch (sortMode) {
            case "a-z":
                return [...filtered].sort((a, b) => a.tag.localeCompare(b.tag));
            case "frequency":
                return [...filtered].sort((a, b) => b.count - a.count);
            case "custom":
                return [...filtered].sort((a, b) => {
                    const aIndex = localCustomOrder.indexOf(a.tag);
                    const bIndex = localCustomOrder.indexOf(b.tag);
                    if (aIndex === -1 && bIndex === -1) return b.count - a.count;
                    if (aIndex === -1) return 1;
                    if (bIndex === -1) return -1;
                    return aIndex - bIndex;
                });
            default:
                return filtered;
        }
    }, [tags, searchTerm, sortMode, localCustomOrder]);

    // 标签点击
    const handleTagClick = useCallback(
        (e: React.MouseEvent, tag: string) => {
            e.preventDefault();
            onToggleTag(tag, e.ctrlKey || e.metaKey);
        },
        [onToggleTag],
    );

    // 右键菜单
    const handleContextMenu = useCallback(
        (e: React.MouseEvent, tag: string) => {
            e.preventDefault();
            if (onShowTagContextMenu) {
                onShowTagContextMenu(e, tag);
            } else if (onIgnoreTag) {
                // 回退：如果没有提供 onShowTagContextMenu，直接忽略
                onIgnoreTag(tag);
            }
        },
        [onShowTagContextMenu, onIgnoreTag],
    );

    // 桌面端拖拽 - 始终允许拖拽标签到笔记
    const handleDragStart = useCallback(
        (e: React.DragEvent, tag: string) => {
            e.dataTransfer.setData("text/plain", tag);
            e.dataTransfer.effectAllowed = sortMode === "custom" ? "copyMove" : "copy";

            draggedTagRef.current = tag; // Ref update is immediate
            didDrop.current = false;

            // Defer state update to allow browser to generate drag image
            setTimeout(() => {
                setDraggedTag(tag);
            }, 0);

            onDragTagStart(tag);
        },
        [sortMode, onDragTagStart],
    );

    const handleDragOver = useCallback((e: React.DragEvent, tag: string) => {
        // 允许放置
        e.preventDefault();
    }, []);

    const handleDragEnter = useCallback(
        (e: React.DragEvent, targetTag: string) => {
            // 禁止在搜索状态下排序，以免导致隐藏的标签顺序丢失
            if (searchTerm) return;

            const currentDraggedTag = draggedTagRef.current;
            if (sortMode === "custom" && currentDraggedTag && currentDraggedTag !== targetTag) {
                e.preventDefault();

                // 使用当前的视觉顺序(sortedTags)作为基准，这样即使标签还没在 customOrder 中也能正确处理
                const currentFullOrder = sortedTags.map((t) => t.tag);
                const fromIndex = currentFullOrder.indexOf(currentDraggedTag);
                const toIndex = currentFullOrder.indexOf(targetTag);

                if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
                    const newOrder = [...currentFullOrder];
                    newOrder.splice(fromIndex, 1);
                    newOrder.splice(toIndex, 0, currentDraggedTag);

                    // Use View Transitions API for smooth animation if available
                    if ((document as any).startViewTransition) {
                        (document as any).startViewTransition(() => {
                            flushSync(() => {
                                setLocalCustomOrder(newOrder);
                            });
                        });
                    } else {
                        setLocalCustomOrder(newOrder);
                    }
                }
            }
        },
        [sortMode, sortedTags, searchTerm],
    );

    const handleDrop = useCallback(
        (e: React.DragEvent, targetTag: string) => {
            if (sortMode === "custom") {
                const currentDragged = draggedTagRef.current;
                if (currentDragged) {
                    e.preventDefault();
                    didDrop.current = true;

                    // 在 drop 时，直接保存当前的 sortedTags 顺序
                    // 因为 handleDragEnter 已经实时更新了 localCustomOrder，
                    // 而 sortedTags 是基于 localCustomOrder 渲染的，所以它们是一致的。
                    // 直接使用 localCustomOrder 也是可以的，但为了保险，我们重新构建一次完整列表。
                    const finalOrder = sortedTags.map((t) => t.tag);
                    onCustomOrderChange(finalOrder);
                }
            }
            setDraggedTag(null);
        },
        [sortMode, sortedTags, onCustomOrderChange],
    );

    const handleDragEnd = useCallback(() => {
        setDraggedTag(null);
        draggedTagRef.current = null;
        if (!didDrop.current) {
            // 如果没有成功放置（例如拖到了笔记上或外面），恢复原状
            setLocalCustomOrder(customOrder);
        }
    }, [customOrder]);

    // 移动端长按拖动
    const handleTouchStart = useCallback((e: React.TouchEvent, tag: string) => {
        const touch = e.touches[0];
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();

        // 记录触摸点相对于标签左上角的偏移
        const offsetX = touch.clientX - rect.left;
        const offsetY = touch.clientY - rect.top;

        const timer = window.setTimeout(() => {
            setIsDragging(true);
            setDraggedTag(tag);
            draggedTagRef.current = tag;
            setTouchPosition({ x: touch.clientX, y: touch.clientY });
            setDragOffset({ x: offsetX, y: offsetY });
            // 触发震动反馈
            if (navigator.vibrate) navigator.vibrate(50);
        }, 300);

        longPressTimer.current = timer;
    }, []);

    // 移动端拖动中 - 检测菜单区域、标签重排序、笔记添加
    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (!isDragging || !draggedTagRef.current) return;

            const touch = e.touches[0];
            setTouchPosition({ x: touch.clientX, y: touch.clientY });

            // 检测是否在菜单区域
            const menuZone = menuZoneRef.current;
            if (menuZone) {
                const rect = menuZone.getBoundingClientRect();
                const isOver =
                    touch.clientX >= rect.left &&
                    touch.clientX <= rect.right &&
                    touch.clientY >= rect.top &&
                    touch.clientY <= rect.bottom;
                setIsOverMenuZone(isOver);
                if (isOver) return; // 在菜单区域时不处理排序逻辑
            }

            // 使用 elementFromPoint 检测当前触摸位置下的元素
            const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
            if (!elementUnderTouch) return;

            // 检测是否悬停在其他标签上（用于排序）
            const tagPill = elementUnderTouch.closest(".sr-tag-pill");
            if (tagPill && sortMode === "custom") {
                // 从标签内容获取标签名
                const tagText = tagPill.textContent?.split(" ")[0]?.replace("#", "") || "";
                if (tagText && tagText !== draggedTagRef.current) {
                    // 复用 PC 端的重排序逻辑
                    const currentDraggedTag = draggedTagRef.current;
                    const currentFullOrder = sortedTags.map((t) => t.tag);
                    const fromIndex = currentFullOrder.indexOf(currentDraggedTag);
                    const toIndex = currentFullOrder.indexOf(tagText);

                    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
                        const newOrder = [...currentFullOrder];
                        newOrder.splice(fromIndex, 1);
                        newOrder.splice(toIndex, 0, currentDraggedTag);

                        // Use View Transitions API for smooth animation (same as PC)
                        if ((document as any).startViewTransition) {
                            (document as any).startViewTransition(() => {
                                flushSync(() => {
                                    setLocalCustomOrder(newOrder);
                                });
                            });
                        } else {
                            setLocalCustomOrder(newOrder);
                        }
                    }
                }
            }
        },
        [isDragging, sortMode, sortedTags],
    );

    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }

            const touch = e.changedTouches[0];

            // 如果在菜单区域内松手，触发右键菜单
            if (isOverMenuZone && draggedTagRef.current && onShowTagContextMenu) {
                const fakeEvent = {
                    preventDefault: () => {},
                    nativeEvent: {
                        clientX: touch.clientX,
                        clientY: touch.clientY,
                    } as MouseEvent,
                } as React.MouseEvent;
                onShowTagContextMenu(fakeEvent, draggedTagRef.current);
            } else if (draggedTagRef.current) {
                // 检测是否放在笔记上（添加标签）
                const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
                if (elementUnderTouch) {
                    const noteItem = elementUnderTouch.closest(".sr-new-item") as HTMLElement;
                    if (noteItem && noteItem.dataset.notePath && onMobileTagDrop) {
                        onMobileTagDrop(noteItem.dataset.notePath, draggedTagRef.current);
                    }
                }

                // 保存排序结果
                if (sortMode === "custom") {
                    const finalOrder = sortedTags.map((t) => t.tag);
                    onCustomOrderChange(finalOrder);
                }
            }

            setIsDragging(false);
            setDraggedTag(null);
            draggedTagRef.current = null;
            setIsOverMenuZone(false);
            setTouchPosition(null);
            setDragOffset(null);
        },
        [isOverMenuZone, onShowTagContextMenu, sortMode, sortedTags, onCustomOrderChange],
    );

    return (
        <div
            className="sr-filter-bar"
            ref={containerRef}
            style={{ height: `${height}px` }}
            onTouchMove={handleTouchMove}
        >
            {/* 头部区域：搜索框始终存在，菜单区域浮现在上层 */}
            {!hideHeader && (
                <div className="sr-filter-bar-header" style={{ position: "relative" }}>
                    <SortModeButton mode={sortMode} onModeChange={onSortModeChange} />
                    <input
                        type="text"
                        className="sr-tag-search-input"
                        placeholder={t("FILTER_PLACEHOLDER")}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {selectedTags.size > 0 && (
                        <button className="sr-clear-tags-btn" onClick={onClearTags}>
                            ✕
                        </button>
                    )}

                    {/* 移动端菜单触发区域 - 浮现在搜索框上层 */}
                    {isDragging && (
                        <div
                            ref={menuZoneRef}
                            className={`sr-menu-drop-zone ${isOverMenuZone ? "active" : ""}`}
                        >
                            <span className="sr-menu-drop-zone-text">
                                {isOverMenuZone ? t("DROP_TO_OPEN_MENU") : t("DRAG_UP_FOR_MENU")}
                            </span>
                        </div>
                    )}
                </div>
            )}
            <div
                className="sr-tag-scroll-container"
                ref={scrollRef}
                onDragOver={(e) => {
                    e.preventDefault(); // 必须阻止默认行为才能接收 drop 事件
                }}
                onDrop={(e) => {
                    // 容器级别的 drop 处理：确保在标签间隙松手也能保存
                    if (sortMode === "custom" && draggedTagRef.current) {
                        e.preventDefault();
                        didDrop.current = true;
                        const finalOrder = sortedTags.map((t) => t.tag);
                        onCustomOrderChange(finalOrder);
                    }
                    setDraggedTag(null);
                }}
            >
                {sortedTags.map(({ tag, count }) => (
                    <div
                        key={tag}
                        className={`sr-tag-pill ${selectedTags.has(tag) ? "active" : ""} ${sortMode === "custom" && draggedTag === tag ? "dragging" : ""}`}
                        onClick={(e) => handleTagClick(e, tag)}
                        draggable
                        onDragStart={(e) => handleDragStart(e, tag)}
                        onDragOver={(e) => {
                            handleDragOver(e, tag);
                            // Use ref for latest value
                            const currentDragged = draggedTagRef.current;
                            if (sortMode === "custom" && currentDragged && currentDragged !== tag) {
                                handleDragEnter(e, tag);
                            }
                        }}
                        onDragEnter={(e) => {
                            // Also call handleDragEnter directly
                            handleDragEnter(e, tag);
                        }}
                        onDrop={(e) => handleDrop(e, tag)}
                        onDragEnd={handleDragEnd}
                        onContextMenu={(e) => {
                            // 移动端拖拽状态下禁止默认右键菜单
                            if (isDragging) {
                                e.preventDefault();
                                e.stopPropagation();
                            } else {
                                handleContextMenu(e, tag);
                            }
                        }}
                        onTouchStart={(e) => handleTouchStart(e, tag)}
                        onTouchEnd={handleTouchEnd}
                        style={
                            {
                                // Assign unique view-transition-name for smooth sorting animation
                                viewTransitionName:
                                    sortMode === "custom" ? `sr-tag-${CSS.escape(tag)}` : undefined,
                                // 移动端拖动时，原元素保持在流中，但降低透明度
                                ...(isDragging && draggedTag === tag
                                    ? {
                                          opacity: 0.3,
                                          filter: "grayscale(100%)",
                                      }
                                    : {}),
                            } as React.CSSProperties
                        }
                    >
                        #{tag} <span className="sr-tag-count">{count}</span>
                    </div>
                ))}
            </div>

            {/* 移动端拖动时的浮动克隆元素 - 位于 sidebar 容器末尾 */}
            {isDragging && draggedTag && touchPosition && dragOffset && (
                <div
                    className="sr-tag-pill active dragging"
                    style={{
                        position: "fixed",
                        left: touchPosition.x - dragOffset.x,
                        top: touchPosition.y - dragOffset.y,
                        zIndex: 9999,
                        pointerEvents: "none",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                        transform: "scale(1.05)",
                        margin: 0,
                    }}
                >
                    #{draggedTag}{" "}
                    <span className="sr-tag-count">
                        {tags.find((t) => t.tag === draggedTag)?.count}
                    </span>
                </div>
            )}
        </div>
    );
};

// ==========================================
// Resizable Divider
// ==========================================
const ResizableDivider: React.FC<{
    onResize: (delta: number) => void;
    onResizeEnd: () => void;
}> = ({ onResize, onResizeEnd }) => {
    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            let lastY = e.clientY;

            const handleMouseMove = (moveEvent: MouseEvent) => {
                const delta = moveEvent.clientY - lastY;
                lastY = moveEvent.clientY;
                onResize(delta);
            };

            const handleMouseUp = () => {
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
                onResizeEnd();
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        },
        [onResize, onResizeEnd],
    );

    // 移动端触摸支持
    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            let lastY = e.touches[0].clientY;

            const handleTouchMove = (moveEvent: TouchEvent) => {
                const delta = moveEvent.touches[0].clientY - lastY;
                lastY = moveEvent.touches[0].clientY;
                onResize(delta);
            };

            const handleTouchEnd = () => {
                document.removeEventListener("touchmove", handleTouchMove);
                document.removeEventListener("touchend", handleTouchEnd);
                onResizeEnd();
            };

            document.addEventListener("touchmove", handleTouchMove);
            document.addEventListener("touchend", handleTouchEnd);
        },
        [onResize, onResizeEnd],
    );

    return (
        <div
            className="sr-resizable-divider"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
        >
            <div className="sr-divider-handle" />
        </div>
    );
};

// ==========================================
// Timeline Pane (底部提交信息抽屉)
// ==========================================

interface TimelinePaneProps {
    app: App;
    enableDurationPrefixSyntax: boolean;
    isOpen: boolean;
    onToggle: () => void;
    selectedItem: NoteReviewItem | null;
    logs: ReviewCommitLog[];
    onCommit: (message: string) => void;
    onCommitContextMenu?: (e: React.MouseEvent, commitId: string) => void;
    editingId?: string | null;
    onEditCommit?: (commitId: string, newMessage: string) => void;
    onStartEdit?: (commitId: string) => void;
    onCancelEdit?: () => void;
    onCommitSelect?: (log: ReviewCommitLog) => void;
    showScrollPercentage?: boolean;
}

const TimelineRenderedMessage: React.FC<{
    app: App;
    message: string;
    enableDurationPrefixSyntax: boolean;
    displayDuration?: TimelineDisplayDuration | null;
    durationPlacement?: "top" | "inline-after-label";
}> = ({
    app,
    message,
    enableDurationPrefixSyntax,
    displayDuration,
    durationPlacement = "top",
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const renderModel = useMemo(
        () =>
            buildTimelineRenderModel({
                message,
                enableDurationPrefixSyntax,
                displayDuration,
            }),
        [displayDuration, enableDurationPrefixSyntax, message],
    );
    const hasBody = renderModel.body.length > 0;
    const durationChip = renderModel.duration ? (
        <span className="sr-timeline-duration-pill" title={`${renderModel.duration.totalDays}d`}>
            {renderModel.duration.raw}
        </span>
    ) : null;
    const isInlineDuration = durationPlacement === "inline-after-label" && !!durationChip;
    const inlineDurationChip =
        isInlineDuration && renderModel.duration ? (
            <span
                className="sr-timeline-duration-pill"
                title={`${renderModel.duration.totalDays}d`}
            >
                {`${renderModel.body} ${renderModel.duration.raw}`.trim()}
            </span>
        ) : null;

    useEffect(() => {
        const container = containerRef.current;
        if (!container || !hasBody) return;

        container.replaceChildren();
        const renderComponent = new Component();
        renderComponent.load();
        let cancelled = false;

        const render = async () => {
            const lines = normalizeTimelineInlineLines(renderModel.body);

            for (const line of lines) {
                if (cancelled) return;

                const lineEl = document.createElement("div");
                lineEl.className = "sr-timeline-message-line";

                if (!line) {
                    lineEl.classList.add("is-empty");
                    lineEl.innerHTML = "&nbsp;";
                    container.appendChild(lineEl);
                    continue;
                }

                container.appendChild(lineEl);
                await MarkdownRenderer.render(
                    app,
                    sanitizeTimelineInlineMarkdown(line),
                    lineEl,
                    "",
                    renderComponent,
                );
            }
        };

        void render();

        return () => {
            cancelled = true;
            renderComponent.unload();
        };
    }, [app, hasBody, renderModel.body]);

    return (
        <div className="sr-timeline-message-rendered">
            {inlineDurationChip}
            {durationChip && durationPlacement === "top" && durationChip}
            {!inlineDurationChip && hasBody && (
                <div
                    className={`sr-timeline-message-content ${isInlineDuration ? "is-inline-duration" : ""}`}
                >
                    <div
                        className={`sr-timeline-message-content-text ${isInlineDuration ? "is-inline-duration" : ""}`}
                        ref={containerRef}
                    />
                    {durationChip && durationPlacement === "inline-after-label" && (
                        <div className="sr-timeline-inline-duration-wrap">{durationChip}</div>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * 格式化时间戳为可读的相对时间或日期字符串
 */
function formatTimestamp(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return t("TIME_JUST_NOW");
    if (minutes < 60) return t("TIME_MINUTES_AGO", { minutes });
    if (hours < 24) return t("TIME_HOURS_AGO", { hours });
    if (days < 7) return t("TIME_DAYS_AGO", { days });
    if (days < 30) return t("TIME_WEEKS_AGO", { weeks: Math.floor(days / 7) });

    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const TimelinePane: React.FC<TimelinePaneProps> = ({
    app,
    enableDurationPrefixSyntax,
    isOpen,
    onToggle,
    selectedItem,
    logs,
    onCommit,
    onCommitContextMenu,
    editingId,
    onEditCommit,
    onStartEdit,
    onCancelEdit,
    onCommitSelect,
    showScrollPercentage = true,
}) => {
    const [message, setMessage] = useState("");
    const [editText, setEditText] = useState("");

    // 选中项变化时清空输入
    useEffect(() => {
        setMessage("");
    }, [selectedItem?.id]);

    // 进入编辑模式时初始化文本并聚焦
    useEffect(() => {
        if (editingId) {
            const log = logs.find((l) => l.id === editingId);
            if (log) {
                setEditText(log.message);
            }
        }
    }, [editingId, logs]);

    const handleCommit = useCallback(() => {
        if (!message.trim()) return;
        onCommit(message.trim());
        setMessage("");
    }, [message, onCommit]);

    const submitEdit = useCallback(() => {
        if (editingId && onEditCommit) {
            const trimmed = editText.trim();
            if (trimmed) {
                onEditCommit(editingId, trimmed);
            }
        }
    }, [editText, editingId, onEditCommit]);

    const handleEditBlur = useCallback(() => {
        submitEdit();
        if (onCancelEdit) onCancelEdit();
    }, [onCancelEdit, submitEdit]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
            {/* Header */}
            <div className="sr-timeline-header" onClick={onToggle}>
                <div className="sr-timeline-header-icon">
                    <svg
                        className={`sr-timeline-header-chevron ${isOpen ? "open" : ""}`}
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </div>
                <span className="sr-timeline-header-title">
                    Timeline{selectedItem ? `: ${selectedItem.title}` : ""}
                </span>
            </div>

            {/* Body */}
            {isOpen && (
                <div className="sr-timeline-body">
                    {!selectedItem ? (
                        <div className="sr-timeline-empty">{t("TIMELINE_SELECT_NOTE")}</div>
                    ) : (
                        <>
                            {/* Input Area */}
                            <div className="sr-timeline-input-area">
                                <div className="sr-timeline-textarea-wrap">
                                    <TimelineCodeMirror
                                        app={app}
                                        value={message}
                                        onChange={setMessage}
                                        placeholder={t("TIMELINE_INPUT_PLACEHOLDER")}
                                        enableDurationPrefixSyntax={
                                            enableDurationPrefixSyntax
                                        }
                                        className="sr-timeline-textarea"
                                        onSubmit={handleCommit}
                                    />
                                </div>
                                <button
                                    onClick={handleCommit}
                                    disabled={!message.trim()}
                                    className={`sr-timeline-commit-btn ${message.trim() ? "active" : "disabled"}`}
                                >
                                    <svg
                                        width="12"
                                        height="12"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Commit (Ctrl+Enter)</span>
                                </button>
                            </div>

                            {/* Timeline List */}
                            <div className="sr-timeline-list-scroll">
                                <div className="sr-timeline-track">
                                    {logs.map((log) => {
                                        const isEditing = editingId === log.id;
                                        return (
                                            <div
                                                key={log.id}
                                                className={`sr-timeline-entry ${isEditing ? "editing" : ""} ${
                                                    log.entryType === "review-response"
                                                        ? "is-review-response"
                                                        : ""
                                                }`}
                                                onClick={() =>
                                                    onCommitSelect && onCommitSelect(log)
                                                }
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (onCommitContextMenu) {
                                                        onCommitContextMenu(e, log.id);
                                                    }
                                                }}
                                            >
                                                <div className="sr-timeline-dot" />
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        flex: 1,
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    {isEditing ? (
                                                        <TimelineCodeMirror
                                                            app={app}
                                                            value={editText}
                                                            onChange={setEditText}
                                                            enableDurationPrefixSyntax={
                                                                enableDurationPrefixSyntax
                                                            }
                                                            className="sr-timeline-edit-textarea"
                                                            maxHeight={150}
                                                            minHeight={32}
                                                            autoFocus={true}
                                                            onSubmit={submitEdit}
                                                            onCancel={onCancelEdit}
                                                            onBlur={handleEditBlur}
                                                        />
                                                    ) : (
                                                        <div className="sr-timeline-message">
                                                            <TimelineRenderedMessage
                                                                app={app}
                                                                message={log.message}
                                                                enableDurationPrefixSyntax={
                                                                    enableDurationPrefixSyntax
                                                                }
                                                                displayDuration={
                                                                    log.displayDuration
                                                                }
                                                                durationPlacement={
                                                                    log.displayDuration
                                                                        ? "inline-after-label"
                                                                        : "top"
                                                                }
                                                            />
                                                        </div>
                                                    )}
                                                    <span className="sr-timeline-time">
                                                        {showScrollPercentage &&
                                                            log.scrollPercentage !== undefined && (
                                                                <>
                                                                    {Math.round(
                                                                        log.scrollPercentage * 100,
                                                                    )}
                                                                    % ·{" "}
                                                                </>
                                                            )}
                                                        {formatTimestamp(log.timestamp)}
                                                        {log.lastEdited &&
                                                            ` (${t("TIMELINE_EDITED_AT")} ${formatTimestamp(log.lastEdited)})`}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {logs.length === 0 && (
                                        <div className="sr-timeline-no-history">
                                            {t("TIMELINE_NO_HISTORY")}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// ==========================================
// Modern Section Group (极简版)
// ==========================================
interface SectionGroupModernProps {
    section: NoteReviewSection;
    activeFilePath?: string;
    ignoredTags: string[];
    onNoteClick: (item: NoteReviewItem) => void;
    onNoteDoubleClick?: (item: NoteReviewItem) => void;
    onNoteContextMenu: (item: NoteReviewItem, event: MouseEvent) => void;
    onTagDrop?: (item: NoteReviewItem, tag: string) => void;
    onPriorityChange?: (item: NoteReviewItem, newPriority: number) => void;
}

const SectionGroupModern: React.FC<SectionGroupModernProps> = ({
    section,
    activeFilePath,
    ignoredTags,
    onNoteClick,
    onNoteDoubleClick,
    onNoteContextMenu,
    onTagDrop,
    onPriorityChange,
}) => {
    let titleText = section.title.toUpperCase();
    let titleColorClass = "text-zinc-500";

    if (section.id === "new") {
        titleText = t("SECTION_NEW_NOTES");
        titleColorClass = "text-blue-400";
    } else if (section.id.startsWith("day-")) {
        const dayNum = parseInt(section.id.replace("day-", ""));

        if (dayNum < 0) {
            const absDay = Math.abs(dayNum);
            titleText =
                absDay === 1
                    ? t("SECTION_OVERDUE_1_DAY")
                    : t("SECTION_OVERDUE_DAYS", { days: absDay });
            titleColorClass =
                absDay > 5 ? "text-red-500" : absDay > 2 ? "text-red-400" : "text-orange-400";
        } else if (dayNum === 0) {
            titleText = t("SECTION_DUE_TODAY");
            titleColorClass = "text-green-500";
        } else {
            titleText =
                dayNum === 1
                    ? t("SECTION_DUE_TOMORROW")
                    : t("SECTION_DUE_FUTURE", { days: dayNum });
            titleColorClass = "text-zinc-500";
        }
    }

    return (
        <div className="sr-section-modern">
            <div className="sr-section-header-modern">
                <span className={`sr-section-title-text ${titleColorClass}`}>{titleText}</span>
            </div>

            <div className="sr-section-items-modern">
                {section.items.map((item) => (
                    <NoteItemModern
                        key={item.id}
                        item={item}
                        isActive={activeFilePath === item.path}
                        ignoredTags={ignoredTags}
                        onClick={() => onNoteClick(item)}
                        onDoubleClick={() => onNoteDoubleClick && onNoteDoubleClick(item)}
                        onContextMenu={(e) => onNoteContextMenu(item, e)}
                        onTagDrop={onTagDrop}
                        onPriorityChange={onPriorityChange}
                    />
                ))}
            </div>
        </div>
    );
};

// ==========================================
// Modern Note Item (带内联编辑重要性)
// ==========================================
interface NoteItemModernProps {
    item: NoteReviewItem;
    isActive: boolean;
    ignoredTags: string[];
    onClick: () => void;
    onDoubleClick?: () => void;
    onContextMenu: (event: MouseEvent) => void;
    onTagDrop?: (item: NoteReviewItem, tag: string) => void;
    onPriorityChange?: (item: NoteReviewItem, newPriority: number) => void;
}

const NoteItemModern: React.FC<NoteItemModernProps> = ({
    item,
    isActive,
    ignoredTags,
    onClick,
    onDoubleClick,
    onContextMenu,
    onTagDrop,
    onPriorityChange,
}) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const [isEditingPriority, setIsEditingPriority] = useState(false);
    const [editValue, setEditValue] = useState(String(item.priority));
    const inputRef = useRef<HTMLInputElement>(null);

    // 过滤掉忽略的标签
    const visibleTags = useMemo(() => {
        if (!item.tags || item.tags.length === 0) return [];
        return item.tags.filter((tag) => !ignoredTags.includes(tag));
    }, [item.tags, ignoredTags]);

    const displayTag = visibleTags.length > 0 ? visibleTags.join(" · ") : null;

    const handleContextMenu = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            onContextMenu(e.nativeEvent);
        },
        [onContextMenu],
    );

    // 拖拽相关
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragOver(false);
            const tag = e.dataTransfer.getData("text/plain");
            if (tag && onTagDrop) {
                onTagDrop(item, tag);
            }
        },
        [item, onTagDrop],
    );

    // 重要性编辑
    const handlePriorityClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            setEditValue(String(item.priority));
            setIsEditingPriority(true);
        },
        [item.priority],
    );

    useEffect(() => {
        if (isEditingPriority && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditingPriority]);

    const savePriority = useCallback(() => {
        const newPriority = parseInt(editValue) || item.priority;
        setIsEditingPriority(false);
        if (newPriority !== item.priority && onPriorityChange) {
            onPriorityChange(item, newPriority);
        }
    }, [editValue, item, onPriorityChange]);

    const handlePriorityKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                savePriority();
            } else if (e.key === "Escape") {
                setIsEditingPriority(false);
            }
        },
        [savePriority],
    );

    return (
        <div
            className={`sr-new-item ${isActive ? "sr-new-item--active" : ""} ${isDragOver ? "sr-new-item--drag-over" : ""}`}
            data-note-path={item.path}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            onContextMenu={handleContextMenu}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            tabIndex={0}
        >
            {/* Left: Priority Badge (可编辑) */}
            <div
                className={`sr-new-item-priority-box ${isEditingPriority ? "editing" : ""}`}
                onClick={handlePriorityClick}
            >
                {isEditingPriority ? (
                    <input
                        ref={inputRef}
                        type="number"
                        className="sr-priority-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={savePriority}
                        onKeyDown={handlePriorityKeyDown}
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <span className="sr-new-item-priority-text">{item.priority}</span>
                )}
            </div>

            {/* Right: Content */}
            <div className="sr-new-item-content">
                <div className="sr-new-item-title-row">
                    <span className="sr-new-item-title">{item.title}</span>
                </div>

                <div className="sr-new-item-meta-row">
                    <span className="sr-new-item-tag" title={displayTag || ""}>
                        {displayTag || <span style={{ opacity: 0.3 }}>No tag</span>}
                    </span>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// 主组件
// ==========================================
interface NoteReviewSidebarProps {
    app: App;
    data: NoteReviewSidebarState;
    activeFilePath?: string;
    onNoteClick: (item: NoteReviewItem) => void;
    onNoteContextMenu: (item: NoteReviewItem, event: MouseEvent) => void;
    onTagDrop?: (item: NoteReviewItem, tag: string) => void;
    onPriorityChange?: (item: NoteReviewItem, newPriority: number) => void;
    // 设置相关
    ignoredTags?: string[];
    sortMode?: SortMode;
    onSortModeChange?: (mode: SortMode) => void;
    customTagOrder?: string[];
    onCustomTagOrderChange?: (order: string[]) => void;
    filterBarHeight?: number;
    onFilterBarHeightChange?: (height: number) => void;
    onIgnoreTag?: (tag: string) => void;
    onShowTagContextMenu?: (e: React.MouseEvent, tag: string) => void;
    hideFilterBarHeader?: boolean;
    // Timeline 抽屉相关
    selectedItem?: NoteReviewItem | null;
    commitLogs?: ReviewCommitLog[];
    onCommit?: (path: string, message: string) => void;
    isTimelineOpen?: boolean;
    onTimelineToggle?: () => void;
    timelineHeight?: number;
    onTimelineHeightChange?: (height: number) => void;
    onNoteSelect?: (item: NoteReviewItem) => void;
    onNoteDoubleClick?: (item: NoteReviewItem) => void;
    onCommitContextMenu?: (e: React.MouseEvent, commitId: string) => void;
    editingId?: string | null;
    onEditCommit?: (commitId: string, newMessage: string) => void;
    onStartEdit?: (commitId: string) => void;
    onCancelEdit?: () => void;
    onCommitSelect?: (log: ReviewCommitLog) => void;
    isLoading?: boolean;
    showScrollPercentage?: boolean;
    enableDurationPrefixSyntax?: boolean;
}

export const NoteReviewSidebar: React.FC<NoteReviewSidebarProps> = ({
    app,
    data,
    activeFilePath,
    onNoteClick,
    onNoteContextMenu,
    onTagDrop,
    onPriorityChange,
    ignoredTags = [],
    sortMode = "frequency",
    onSortModeChange,
    customTagOrder = [],
    onCustomTagOrderChange,
    filterBarHeight = 80,
    onFilterBarHeightChange,
    onIgnoreTag,
    onShowTagContextMenu,
    hideFilterBarHeader = false,
    // Timeline 抽屉相关
    selectedItem = null,
    commitLogs = [],
    onCommit,
    isTimelineOpen = false,
    onTimelineToggle,
    timelineHeight = 300,
    onTimelineHeightChange,
    onNoteSelect,
    onNoteDoubleClick,
    onCommitContextMenu,
    editingId = null,
    onEditCommit,
    onStartEdit,
    onCancelEdit,
    onCommitSelect,
    isLoading = false,
    showScrollPercentage = true,
    enableDurationPrefixSyntax = false,
}) => {
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [currentHeight, setCurrentHeight] = useState(filterBarHeight);
    const [draggedTag, setDraggedTag] = useState<string | null>(null);
    const sidebarRef = useRef<HTMLDivElement>(null);

    // 同步外部高度变化
    useEffect(() => {
        setCurrentHeight(filterBarHeight);
    }, [filterBarHeight]);

    // 动态检测状态栏高度并设置 CSS 变量
    useEffect(() => {
        const updateStatusBarOffset = () => {
            const statusBar = document.querySelector(".status-bar") as HTMLElement;
            const sidebar = sidebarRef.current;
            if (!statusBar || !sidebar) {
                sidebar?.style.setProperty("--sr-statusbar-offset", "0px");
                return;
            }
            const sidebarRect = sidebar.getBoundingClientRect();
            const statusBarRect = statusBar.getBoundingClientRect();
            // 判断是否被遮挡：侧边栏底部与状态栏有重叠
            const isOverlapping =
                sidebarRect.bottom > statusBarRect.top &&
                sidebarRect.right > statusBarRect.left &&
                sidebarRect.left < statusBarRect.right;
            if (isOverlapping) {
                sidebar.style.setProperty("--sr-statusbar-offset", `${statusBarRect.height}px`);
            } else {
                sidebar.style.setProperty("--sr-statusbar-offset", "0px");
            }
        };
        // 初始检测 + 窗口变化时重新检测
        updateStatusBarOffset();
        window.addEventListener("resize", updateStatusBarOffset);
        // 使用 MutationObserver 监听状态栏变化（主题可能修改它）
        const statusBar = document.querySelector(".status-bar");
        let observer: MutationObserver | null = null;
        if (statusBar) {
            observer = new MutationObserver(updateStatusBarOffset);
            observer.observe(statusBar, { attributes: true, childList: true, subtree: true });
        }
        return () => {
            window.removeEventListener("resize", updateStatusBarOffset);
            if (observer) observer.disconnect();
        };
    }, []);

    // 1. 提取所有标签并计数 (排除忽略的标签)
    const allTags = useMemo(() => {
        const tagMap = new Map<string, number>();
        let totalItems = 0;
        data.sections.forEach((section) => {
            section.items.forEach((item) => {
                totalItems++;
                if (item.tags && item.tags.length > 0) {
                    item.tags.forEach((tag) => {
                        if (!ignoredTags.includes(tag)) {
                            tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
                        }
                    });
                }
            });
        });
        const sortedTags = Array.from(tagMap.entries()).map(([tag, count]) => ({ tag, count }));
        return { tags: sortedTags, total: totalItems };
    }, [data, ignoredTags]);
    const hasTagFilters = allTags.tags.length > 0;

    useEffect(() => {
        if (!hasTagFilters && selectedTags.size > 0) {
            setSelectedTags(new Set());
        }
    }, [hasTagFilters, selectedTags]);

    // 2. 过滤数据
    const filteredSections = useMemo(() => {
        let sections = data.sections;

        if (selectedTags.size > 0) {
            sections = sections
                .map((section) => ({
                    ...section,
                    items: section.items.filter(
                        (item) => item.tags && item.tags.some((tag) => selectedTags.has(tag)),
                    ),
                }))
                .filter((section) => section.items.length > 0);
        }

        return sections;
    }, [data, selectedTags]);

    // 标签切换
    const handleToggleTag = useCallback((tag: string, multiSelect: boolean) => {
        setSelectedTags((prev) => {
            const next = new Set(multiSelect ? prev : []);
            if (prev.has(tag)) {
                next.delete(tag);
            } else {
                next.add(tag);
            }
            return next;
        });
    }, []);

    const handleClearTags = useCallback(() => {
        setSelectedTags(new Set());
    }, []);

    // 高度调整 - 无上限，最小可以为0
    const handleResize = useCallback((delta: number) => {
        setCurrentHeight((h) => Math.max(0, h + delta));
    }, []);

    // 高度调整结束时保存
    const handleResizeEnd = useCallback(() => {
        if (onFilterBarHeightChange) {
            onFilterBarHeightChange(currentHeight);
        }
    }, [currentHeight, onFilterBarHeightChange]);

    // --- Timeline 抽屉拖拽逻辑 ---
    const [localTimelineHeight, setLocalTimelineHeight] = useState(timelineHeight);
    const isDraggingTimelineRef = useRef(false);
    const startYTimelineRef = useRef(0);
    const startHeightTimelineRef = useRef(0);

    useEffect(() => {
        setLocalTimelineHeight(timelineHeight);
    }, [timelineHeight]);

    const handleTimelineSashMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            isDraggingTimelineRef.current = true;
            startYTimelineRef.current = e.clientY;
            startHeightTimelineRef.current = localTimelineHeight;
            document.body.style.cursor = "row-resize";

            const handleMouseMove = (moveEvent: MouseEvent) => {
                if (!isDraggingTimelineRef.current) return;
                const deltaY = startYTimelineRef.current - moveEvent.clientY;
                const newHeight = startHeightTimelineRef.current + deltaY;
                const clamped = Math.max(100, Math.min(newHeight, window.innerHeight * 0.8));
                setLocalTimelineHeight(clamped);
            };

            const handleMouseUp = () => {
                isDraggingTimelineRef.current = false;
                document.body.style.cursor = "";
                document.removeEventListener("mousemove", handleMouseMove);
                document.removeEventListener("mouseup", handleMouseUp);
                if (onTimelineHeightChange) {
                    onTimelineHeightChange(localTimelineHeight);
                }
            };

            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        },
        [localTimelineHeight, onTimelineHeightChange],
    );

    // 单击 = 展开 Timeline + 打开文件
    const handleNoteSingleClick = useCallback(
        (item: NoteReviewItem) => {
            if (onNoteSelect) {
                onNoteSelect(item);
            }
            if (onNoteClick) {
                onNoteClick(item);
            }
        },
        [onNoteSelect, onNoteClick],
    );

    // 双击保持原样或留空 (单击已处理打开文件)
    const handleNoteDoubleClick = useCallback((item: NoteReviewItem) => {
        // 单击已处理
    }, []);

    const handleCommitMessage = useCallback(
        (message: string) => {
            if (selectedItem && onCommit) {
                onCommit(selectedItem.path, message);
            }
        },
        [selectedItem, onCommit],
    );

    return (
        <div className="sr-note-sidebar" ref={sidebarRef}>
            {hasTagFilters && (
                <>
                    {/* Tag Filter Bar */}
                    <FilterBar
                        tags={allTags.tags}
                        totalCount={allTags.total}
                        selectedTags={selectedTags}
                        onToggleTag={handleToggleTag}
                        onClearTags={handleClearTags}
                        sortMode={hideFilterBarHeader ? "custom" : sortMode}
                        onSortModeChange={onSortModeChange || (() => {})}
                        customOrder={customTagOrder}
                        onCustomOrderChange={onCustomTagOrderChange || (() => {})}
                        height={currentHeight}
                        onHeightChange={setCurrentHeight}
                        onDragTagStart={setDraggedTag}
                        onIgnoreTag={onIgnoreTag}
                        onShowTagContextMenu={onShowTagContextMenu}
                        hideHeader={hideFilterBarHeader}
                        onMobileTagDrop={(notePath, tag) => {
                            if (onTagDrop) {
                                for (const section of filteredSections) {
                                    const item = section.items.find((i) => i.path === notePath);
                                    if (item) {
                                        onTagDrop(item, tag);
                                        break;
                                    }
                                }
                            }
                        }}
                    />

                    {/* Resizable Divider */}
                    <ResizableDivider onResize={handleResize} onResizeEnd={handleResizeEnd} />
                </>
            )}

            {/* List Content */}
            <div className="sr-note-sidebar__content">
                {filteredSections.length === 0 ? (
                    <div className="sr-note-sidebar__empty">
                        {selectedTags.size > 0 ? <span>No notes with selected tags</span> : null}
                    </div>
                ) : (
                    <div className="sr-sections-container">
                        {filteredSections.map((section) => (
                            <SectionGroupModern
                                key={section.id}
                                section={section}
                                activeFilePath={activeFilePath}
                                ignoredTags={ignoredTags}
                                onNoteClick={handleNoteSingleClick}
                                onNoteDoubleClick={handleNoteDoubleClick}
                                onNoteContextMenu={onNoteContextMenu}
                                onTagDrop={onTagDrop}
                                onPriorityChange={onPriorityChange}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Timeline Drawer */}
            {isTimelineOpen && (
                <div className="sr-timeline-sash" onMouseDown={handleTimelineSashMouseDown}>
                    <div className="sr-timeline-sash-handle" />
                </div>
            )}

            <div
                className="sr-timeline-container"
                style={{
                    height: isTimelineOpen ? `${localTimelineHeight}px` : "auto",
                }}
            >
                <TimelinePane
                    app={app}
                    enableDurationPrefixSyntax={enableDurationPrefixSyntax}
                    isOpen={isTimelineOpen}
                    onToggle={onTimelineToggle || (() => {})}
                    selectedItem={selectedItem}
                    logs={commitLogs}
                    onCommit={handleCommitMessage}
                    onCommitContextMenu={onCommitContextMenu}
                    editingId={editingId}
                    onEditCommit={onEditCommit}
                    onStartEdit={onStartEdit}
                    onCancelEdit={onCancelEdit}
                    onCommitSelect={onCommitSelect}
                    showScrollPercentage={showScrollPercentage}
                />
            </div>
        </div>
    );
};
