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

import React, { useState, useMemo, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal, flushSync } from "react-dom";
import { App, Component, MarkdownRenderer } from "obsidian";
import { NoteReviewSection, NoteReviewItem, NoteReviewSidebarState } from "../types/noteReview";
import { ReviewCommitLog, type ReviewCommitEditPayload } from "src/dataStore/reviewCommitStore";
import "../styles/note-review-sidebar.css";
import { t } from "src/lang/helpers";
import { TimelineCodeMirror } from "./TimelineCodeMirror";
import {
    buildTimelineRenderModel,
    sanitizeTimelineInlineMarkdown,
    TimelineDisplayDuration,
    normalizeTimelineInlineLines,
} from "src/ui/timeline/timelineMessage";
import {
    buildTimelineCommitEditPayload,
    extractTimelineReviewResponseBody,
    getTimelineReviewResponsePillText,
    getTimelineReviewResponsePrefixText,
    materializeTimelineReviewResponseEditMessage,
} from "src/ui/timeline/reviewResponseTimeline";
import type { ExtractItem } from "src/dataStore/extractStore";
import type { SidebarProgressIndicatorMode, SidebarProgressRingDirection } from "src/settings";

const TIMELINE_MIN_HEIGHT_PX = 100;
export const MOBILE_TIMELINE_MIN_HEIGHT_PX = 64;
const TIMELINE_MAX_HEIGHT_VIEWPORT_RATIO = 0.8;
const TIMELINE_HEADER_DRAG_THRESHOLD_PX = 8;
const TIMELINE_TOUCH_BLOCK_COOLDOWN_MS = 120;
const MOBILE_DRAWER_HOST_CLASS = "sr-note-sidebar--mobile-drawer-host";
const MOBILE_DRAWER_SHELL_CLASS = "sr-note-sidebar--mobile-drawer-shell";
const TIMELINE_RESIZE_BODY_CLASS = "sr-timeline-resize-active";

type DocumentWithViewTransition = Document & {
    startViewTransition?: (callback: () => void) => void;
};

function getNotePathFromElement(element: Element | null): string | null {
    if (!(element instanceof HTMLElement)) {
        return null;
    }

    return element.dataset.notePath ?? null;
}

function findTouchByIdentifier(touchList: TouchList, identifier: number): Touch | null {
    for (let index = 0; index < touchList.length; index += 1) {
        const touch = touchList.item(index);
        if (touch?.identifier === identifier) {
            return touch;
        }
    }

    return null;
}

function isPhoneMobileDrawerLayout(): boolean {
    if (typeof document === "undefined") {
        return false;
    }

    const hasMobileClass =
        document.body.classList.contains("is-mobile") ||
        document.documentElement.classList.contains("is-mobile");
    const hasTabletClass =
        document.body.classList.contains("is-tablet") ||
        document.documentElement.classList.contains("is-tablet");

    return hasMobileClass && !hasTabletClass;
}

function canUseHoverPathTooltips(): boolean {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return false;
    }

    return (
        window.matchMedia("(any-hover: hover) and (any-pointer: fine)").matches ||
        window.matchMedia("(hover: hover) and (pointer: fine)").matches
    );
}

function escapeNotePathForSelector(path: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(path);
    }

    return path.replace(/["\\]/g, "\\$&");
}

function formatNotePathTooltip(path: string): string {
    return path.replace(/\.md$/i, "");
}

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
    isPhoneMobileDrawer?: boolean;
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
    totalCount: _totalCount,
    selectedTags,
    onToggleTag,
    onClearTags,
    sortMode,
    onSortModeChange,
    customOrder,
    onCustomOrderChange,
    height,
    onHeightChange: _onHeightChange,
    onDragTagStart,
    onIgnoreTag,
    onShowTagContextMenu,
    onMobileTagDrop,
    hideHeader = false,
    isPhoneMobileDrawer = false,
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

    const handleDragOver = useCallback((e: React.DragEvent, _tag: string) => {
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
                    const transitionDocument = document as DocumentWithViewTransition;
                    if (transitionDocument.startViewTransition) {
                        transitionDocument.startViewTransition(() => {
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
        (e: React.DragEvent, _targetTag: string) => {
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
                        const transitionDocument = document as DocumentWithViewTransition;
                        if (transitionDocument.startViewTransition) {
                            transitionDocument.startViewTransition(() => {
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
                    const notePath = getNotePathFromElement(
                        elementUnderTouch.closest(".sr-new-item"),
                    );
                    if (notePath && onMobileTagDrop) {
                        onMobileTagDrop(notePath, draggedTagRef.current);
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
            style={isPhoneMobileDrawer ? undefined : { height: `${height}px` }}
            onTouchMove={handleTouchMove}
        >
            {/* 头部区域：搜索框始终存在，菜单区域浮现在上层 */}
            {!hideHeader && (
                <div className="sr-filter-bar-header" style={{ position: "relative" }}>
                    <SortModeButton mode={sortMode} onModeChange={onSortModeChange} />
                    <div className="sr-filter-bar-search-group">
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
                    </div>

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
                style={isPhoneMobileDrawer ? { maxHeight: `${Math.max(0, height)}px` } : undefined}
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
            const startTouch = e.changedTouches[0] ?? e.touches[0];
            if (!startTouch) {
                return;
            }

            e.preventDefault();
            let lastY = startTouch.clientY;

            const handleTouchMove = (moveEvent: TouchEvent) => {
                const activeTouch = moveEvent.changedTouches[0] ?? moveEvent.touches[0];
                if (!activeTouch) {
                    return;
                }

                moveEvent.preventDefault();
                const delta = activeTouch.clientY - lastY;
                lastY = activeTouch.clientY;
                onResize(delta);
            };

            const cleanup = () => {
                document.removeEventListener("touchmove", handleTouchMove);
                document.removeEventListener("touchend", handleTouchEnd);
                document.removeEventListener("touchcancel", handleTouchEnd);
            };

            const handleTouchEnd = () => {
                cleanup();
                onResizeEnd();
            };

            document.addEventListener("touchmove", handleTouchMove, { passive: false });
            document.addEventListener("touchend", handleTouchEnd);
            document.addEventListener("touchcancel", handleTouchEnd);
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
    onHeaderClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
    isHeaderDragEnabled?: boolean;
    isHeaderDragging?: boolean;
    onHeaderMouseDown?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onHeaderTouchStart?: (event: React.TouchEvent<HTMLDivElement>) => void;
    selectedItem: NoteReviewItem | null;
    logs: ReviewCommitLog[];
    onCommit: (message: string) => void;
    onCommitContextMenu?: (e: React.MouseEvent, commitId: string) => void;
    editingId?: string | null;
    onEditCommit?: (commitId: string, payload: ReviewCommitEditPayload) => void;
    onStartEdit?: (commitId: string) => void;
    onCancelEdit?: () => void;
    onCommitSelect?: (log: ReviewCommitLog) => void;
    activeExtracts?: ExtractItem[];
    onExtractSelect?: (extract: ExtractItem) => void;
    onExtractPriorityChange?: (extract: ExtractItem, priority: number) => void;
    showScrollPercentage?: boolean;
}

const TimelineRenderedMessage: React.FC<{
    app: App;
    message: string;
    enableDurationPrefixSyntax: boolean;
    displayDuration?: TimelineDisplayDuration | null;
    reviewResponse?: ReviewCommitLog["reviewResponse"];
    durationPlacement?: "top" | "inline-after-label";
}> = ({
    app,
    message,
    enableDurationPrefixSyntax,
    displayDuration,
    reviewResponse,
    durationPlacement = "top",
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const reviewResponsePillText = useMemo(
        () =>
            reviewResponse && displayDuration
                ? getTimelineReviewResponsePillText(reviewResponse, displayDuration)
                : null,
        [displayDuration, reviewResponse],
    );
    const renderedMessage = useMemo(
        () =>
            reviewResponse && displayDuration
                ? extractTimelineReviewResponseBody({
                      message,
                      entryType: "review-response",
                      reviewResponse,
                      displayDuration,
                  })
                : message,
        [displayDuration, message, reviewResponse],
    );
    const renderModel = useMemo(
        () =>
            buildTimelineRenderModel({
                message: renderedMessage,
                enableDurationPrefixSyntax,
                displayDuration: reviewResponsePillText ? null : displayDuration,
            }),
        [displayDuration, enableDurationPrefixSyntax, renderedMessage, reviewResponsePillText],
    );
    const hasBody = renderModel.body.length > 0;
    const durationChip = renderModel.duration ? (
        <span className="sr-timeline-duration-pill" title={`${renderModel.duration.totalDays}d`}>
            {renderModel.duration.raw}
        </span>
    ) : null;
    const isInlineDuration = durationPlacement === "inline-after-label" && !!durationChip;

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.replaceChildren();
        if (!hasBody) return;
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
                    lineEl.textContent = "\u00A0";
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
            {durationChip && durationPlacement === "top" && durationChip}
            {reviewResponsePillText && (
                <div className="sr-timeline-review-response-pill-wrap">
                    <span className="sr-timeline-duration-pill" title={reviewResponsePillText}>
                        {reviewResponsePillText}
                    </span>
                </div>
            )}
            {(hasBody || durationPlacement === "inline-after-label") && (
                <div
                    className={`sr-timeline-message-content ${isInlineDuration ? "is-inline-duration" : ""}`}
                >
                    {hasBody && (
                        <div
                            className={`sr-timeline-message-content-text ${isInlineDuration ? "is-inline-duration" : ""}`}
                            ref={containerRef}
                        />
                    )}
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
    onHeaderClick,
    isHeaderDragEnabled = false,
    isHeaderDragging = false,
    onHeaderMouseDown,
    onHeaderTouchStart,
    selectedItem,
    logs,
    onCommit,
    onCommitContextMenu,
    editingId,
    onEditCommit,
    onStartEdit: _onStartEdit,
    onCancelEdit,
    onCommitSelect,
    activeExtracts = [],
    onExtractSelect,
    onExtractPriorityChange,
    showScrollPercentage = true,
}) => {
    const [message, setMessage] = useState("");
    const [editText, setEditText] = useState("");
    const editingLog = useMemo(
        () => logs.find((log) => log.id === editingId) ?? null,
        [editingId, logs],
    );
    const reviewResponsePrefixText = useMemo(
        () =>
            editingLog
                ? getTimelineReviewResponsePrefixText(
                      editingLog.reviewResponse,
                      editingLog.displayDuration,
                  )
                : null,
        [editingLog],
    );

    // 选中项变化时清空输入
    useEffect(() => {
        setMessage("");
    }, [selectedItem?.id]);

    // 进入编辑模式时初始化文本并聚焦
    useEffect(() => {
        if (editingLog) {
            setEditText(materializeTimelineReviewResponseEditMessage(editingLog));
        } else {
            setEditText("");
        }
    }, [editingLog]);

    const handleCommit = useCallback(() => {
        if (!message.trim()) return;
        onCommit(message.trim());
        setMessage("");
    }, [message, onCommit]);

    const submitEdit = useCallback(() => {
        if (editingId && onEditCommit && editingLog) {
            onEditCommit(editingId, buildTimelineCommitEditPayload(editingLog, editText));
        }
    }, [editText, editingId, editingLog, onEditCommit]);

    const handleEditBlur = useCallback(() => {
        submitEdit();
        if (onCancelEdit) onCancelEdit();
    }, [onCancelEdit, submitEdit]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
            {/* Header */}
            <div
                className={[
                    "sr-timeline-header",
                    isHeaderDragEnabled ? "sr-timeline-header--resizable" : "",
                    isHeaderDragging ? "sr-timeline-header--dragging" : "",
                ]
                    .filter(Boolean)
                    .join(" ")}
                onClick={onHeaderClick ?? onToggle}
                onMouseDown={isHeaderDragEnabled ? onHeaderMouseDown : undefined}
                onTouchStart={isHeaderDragEnabled ? onHeaderTouchStart : undefined}
            >
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
                    {t("TIMELINE_TITLE")}
                    {selectedItem ? `: ${selectedItem.title}` : ""}
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
                                        enableDurationPrefixSyntax={enableDurationPrefixSyntax}
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
                                    <span>{t("TIMELINE_COMMIT_BUTTON")}</span>
                                </button>
                            </div>

                            {/* Timeline List */}
                            <div className="sr-timeline-list-scroll">
                                <div className="sr-timeline-track">
                                    {activeExtracts.length > 0 && (
                                        <div className="sr-timeline-extracts">
                                            <div className="sr-timeline-extracts-title">
                                                {t("EXTRACT_TIMELINE_ACTIVE_TITLE")}
                                            </div>
                                            {activeExtracts.map((extract) => (
                                                <div
                                                    key={extract.uuid}
                                                    className="sr-timeline-extract-entry"
                                                    title={extract.rawMarkdown}
                                                    onClick={() => onExtractSelect?.(extract)}
                                                >
                                                    <div className="sr-timeline-dot sr-timeline-extract-dot" />
                                                    <div className="sr-timeline-extract-content">
                                                        <div className="sr-timeline-extract-text">
                                                            {extract.rawMarkdown}
                                                        </div>
                                                        {extract.memo.trim() && (
                                                            <div className="sr-timeline-extract-memo">
                                                                {extract.memo}
                                                            </div>
                                                        )}
                                                        <div className="sr-timeline-extract-meta">
                                                            <span>
                                                                {extract.sourceMode === "auto-slice"
                                                                    ? extract.sliceRule === "heading"
                                                                        ? t("EXTRACT_SOURCE_AUTO_HEADING")
                                                                        : t("EXTRACT_SOURCE_AUTO_PARAGRAPH")
                                                                    : t("EXTRACT_SOURCE_MANUAL")}
                                                            </span>
                                                            <span>
                                                                {formatTimestamp(extract.createdAt)}
                                                            </span>
                                                            <label
                                                                className="sr-timeline-extract-priority"
                                                                onClick={(event) =>
                                                                    event.stopPropagation()
                                                                }
                                                            >
                                                                <span>
                                                                    {t("EXTRACT_PRIORITY_LABEL")}
                                                                </span>
                                                                <select
                                                                    value={extract.priority}
                                                                    onChange={(event) =>
                                                                        onExtractPriorityChange?.(
                                                                            extract,
                                                                            Number(
                                                                                event.target.value,
                                                                            ),
                                                                        )
                                                                    }
                                                                >
                                                                    {Array.from(
                                                                        { length: 10 },
                                                                        (_, index) => index + 1,
                                                                    ).map((priority) => (
                                                                        <option
                                                                            key={priority}
                                                                            value={priority}
                                                                        >
                                                                            {priority}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </label>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
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
                                                            reviewResponsePrefixText={
                                                                reviewResponsePrefixText
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
                                                                reviewResponse={log.reviewResponse}
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
    activeItemPath?: string;
    ignoredTags: string[];
    showSidebarProgressIndicator: boolean;
    progressIndicatorMode: SidebarProgressIndicatorMode;
    progressRingDirection: SidebarProgressRingDirection;
    pathTooltipHoverEnabled: boolean;
    filePathTooltipEnabled: boolean;
    filePathTooltipDelayMs: number;
    onNoteClick: (item: NoteReviewItem, options?: { newTab?: boolean }) => void;
    onNoteDoubleClick?: (item: NoteReviewItem) => void;
    onNoteContextMenu: (item: NoteReviewItem, event: MouseEvent) => void;
    onTagDrop?: (item: NoteReviewItem, tag: string) => void;
    onPriorityChange?: (item: NoteReviewItem, newPriority: number) => void;
}

const SectionGroupModern: React.FC<SectionGroupModernProps> = ({
    section,
    activeItemPath,
    ignoredTags,
    showSidebarProgressIndicator,
    progressIndicatorMode,
    progressRingDirection,
    pathTooltipHoverEnabled,
    filePathTooltipEnabled,
    filePathTooltipDelayMs,
    onNoteClick,
    onNoteDoubleClick: _onNoteDoubleClick,
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
                        isActive={activeItemPath === item.path}
                        ignoredTags={ignoredTags}
                        showSidebarProgressIndicator={showSidebarProgressIndicator}
                        progressIndicatorMode={progressIndicatorMode}
                        progressRingDirection={progressRingDirection}
                        pathTooltipHoverEnabled={pathTooltipHoverEnabled}
                        filePathTooltipEnabled={filePathTooltipEnabled}
                        filePathTooltipDelayMs={filePathTooltipDelayMs}
                        onClick={() => onNoteClick(item)}
                        onMiddleClick={() => onNoteClick(item, { newTab: true })}
                        onDoubleClick={() => _onNoteDoubleClick && _onNoteDoubleClick(item)}
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
    showSidebarProgressIndicator: boolean;
    progressIndicatorMode: SidebarProgressIndicatorMode;
    progressRingDirection: SidebarProgressRingDirection;
    pathTooltipHoverEnabled: boolean;
    filePathTooltipEnabled: boolean;
    filePathTooltipDelayMs: number;
    onClick: () => void;
    onMiddleClick?: () => void;
    onDoubleClick?: () => void;
    onContextMenu: (event: MouseEvent) => void;
    onTagDrop?: (item: NoteReviewItem, tag: string) => void;
    onPriorityChange?: (item: NoteReviewItem, newPriority: number) => void;
}

const SIDEBAR_PROGRESS_RING_SIZE = 14;
const SIDEBAR_PROGRESS_RING_STROKE_WIDTH = 2;
const SIDEBAR_PROGRESS_RING_RADIUS =
    (SIDEBAR_PROGRESS_RING_SIZE - SIDEBAR_PROGRESS_RING_STROKE_WIDTH) / 2;
const SIDEBAR_PROGRESS_RING_CENTER = SIDEBAR_PROGRESS_RING_SIZE / 2;
const NOTE_PATH_TOOLTIP_ARROW_SIZE = 8;
const NOTE_PATH_TOOLTIP_ARROW_PADDING = 12;

function normalizeSidebarProgressPercentage(percentage?: number): number {
    return typeof percentage === "number" && Number.isFinite(percentage)
        ? Math.min(1, Math.max(0, percentage))
        : 0;
}

function formatSidebarProgressPercentage(percentage?: number): string {
    return `${Math.round(normalizeSidebarProgressPercentage(percentage) * 100)}%`;
}

function buildSidebarProgressRingPath(direction: SidebarProgressRingDirection): string {
    const startY = SIDEBAR_PROGRESS_RING_CENTER - SIDEBAR_PROGRESS_RING_RADIUS;
    const endY = SIDEBAR_PROGRESS_RING_CENTER + SIDEBAR_PROGRESS_RING_RADIUS;
    const sweepFlag = direction === "clockwise" ? 1 : 0;

    return [
        `M ${SIDEBAR_PROGRESS_RING_CENTER} ${startY}`,
        `A ${SIDEBAR_PROGRESS_RING_RADIUS} ${SIDEBAR_PROGRESS_RING_RADIUS} 0 0 ${sweepFlag} ${SIDEBAR_PROGRESS_RING_CENTER} ${endY}`,
        `A ${SIDEBAR_PROGRESS_RING_RADIUS} ${SIDEBAR_PROGRESS_RING_RADIUS} 0 0 ${sweepFlag} ${SIDEBAR_PROGRESS_RING_CENTER} ${startY}`,
    ].join(" ");
}

const SidebarProgressRing: React.FC<{
    percentage?: number;
    direction: SidebarProgressRingDirection;
}> = ({ percentage, direction }) => {
    const normalizedPercentage = normalizeSidebarProgressPercentage(percentage);
    const roundedPercentage = formatSidebarProgressPercentage(percentage);
    const hasProgress = normalizedPercentage > 0;
    const progressPath = buildSidebarProgressRingPath(direction);

    return (
        <span
            className="sr-new-item-progress-ring"
            title={roundedPercentage}
            data-progress-state={hasProgress ? "value" : "empty"}
        >
            <svg
                viewBox={`0 0 ${SIDEBAR_PROGRESS_RING_SIZE} ${SIDEBAR_PROGRESS_RING_SIZE}`}
                aria-hidden="true"
            >
                <circle
                    className="sr-new-item-progress-ring__track"
                    cx={SIDEBAR_PROGRESS_RING_CENTER}
                    cy={SIDEBAR_PROGRESS_RING_CENTER}
                    r={SIDEBAR_PROGRESS_RING_RADIUS}
                    strokeWidth={SIDEBAR_PROGRESS_RING_STROKE_WIDTH}
                />
                {hasProgress && (
                    <path
                        className="sr-new-item-progress-ring__value"
                        d={progressPath}
                        pathLength={100}
                        strokeWidth={SIDEBAR_PROGRESS_RING_STROKE_WIDTH}
                        strokeDasharray={`${normalizedPercentage * 100} 100`}
                    />
                )}
            </svg>
        </span>
    );
};

const SidebarProgressPercentage: React.FC<{
    percentage?: number;
}> = ({ percentage }) => {
    const normalizedPercentage = normalizeSidebarProgressPercentage(percentage);
    const label = formatSidebarProgressPercentage(percentage);

    return (
        <span
            className="sr-new-item-progress-percentage"
            title={label}
            data-progress-state={normalizedPercentage > 0 ? "value" : "empty"}
        >
            {label}
        </span>
    );
};

const SidebarProgressIndicator: React.FC<{
    visible: boolean;
    mode: SidebarProgressIndicatorMode;
    percentage?: number;
    direction: SidebarProgressRingDirection;
}> = ({ visible, mode, percentage, direction }) => {
    if (!visible) {
        return null;
    }

    return mode === "percentage" ? (
        <SidebarProgressPercentage percentage={percentage} />
    ) : (
        <SidebarProgressRing percentage={percentage} direction={direction} />
    );
};

interface NotePathTooltipPosition {
    top: number;
    left: number;
    maxWidth: number;
    arrowLeft: number;
    placement: "above" | "below";
}

const NotePathTooltip: React.FC<{
    anchorEl: HTMLElement | null;
    path: string;
    visible: boolean;
}> = ({ anchorEl, path, visible }) => {
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<NotePathTooltipPosition | null>(null);
    const displayPath = formatNotePathTooltip(path);

    const updatePosition = useCallback(() => {
        if (!anchorEl || !tooltipRef.current) {
            return;
        }

        const rect = anchorEl.getBoundingClientRect();
        const tooltipEl = tooltipRef.current;
        const viewportPadding = 12;
        const gap = 10;
        const maxWidth = Math.max(220, Math.min(520, window.innerWidth - viewportPadding * 2));
        const tooltipHeight = tooltipEl.offsetHeight;
        const tooltipWidth = Math.min(tooltipEl.offsetWidth || maxWidth, maxWidth);
        const anchorCenterX = rect.left + rect.width / 2;
        const left = Math.min(
            Math.max(rect.left + 12, viewportPadding),
            window.innerWidth - viewportPadding - tooltipWidth,
        );
        const minArrowLeft = NOTE_PATH_TOOLTIP_ARROW_PADDING;
        const maxArrowLeft = Math.max(
            minArrowLeft,
            tooltipWidth - NOTE_PATH_TOOLTIP_ARROW_PADDING - NOTE_PATH_TOOLTIP_ARROW_SIZE,
        );
        const arrowLeft = Math.min(
            Math.max(anchorCenterX - left - NOTE_PATH_TOOLTIP_ARROW_SIZE / 2, minArrowLeft),
            maxArrowLeft,
        );
        const aboveTop = rect.top - tooltipHeight - gap;
        const belowTop = rect.bottom + gap;
        const placeAbove =
            aboveTop >= viewportPadding ||
            belowTop + tooltipHeight > window.innerHeight - viewportPadding;
        const top = placeAbove
            ? Math.max(viewportPadding, aboveTop)
            : Math.min(window.innerHeight - viewportPadding - tooltipHeight, belowTop);

        setPosition({
            top,
            left,
            maxWidth,
            arrowLeft,
            placement: placeAbove ? "above" : "below",
        });
    }, [anchorEl]);

    useLayoutEffect(() => {
        if (!visible || !anchorEl) {
            setPosition(null);
            return;
        }

        const syncPosition = () => {
            window.requestAnimationFrame(updatePosition);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);

        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
        };
    }, [anchorEl, updatePosition, visible]);

    if (!visible || !anchorEl || !path) {
        return null;
    }

    return createPortal(
        <div
            ref={tooltipRef}
            className={`sr-note-path-tooltip ${position?.placement === "below" ? "is-below" : "is-above"}`}
            role="tooltip"
            style={{
                top: position ? `${position.top}px` : "0px",
                left: position ? `${position.left}px` : "0px",
                maxWidth: position ? `${position.maxWidth}px` : undefined,
                opacity: position ? 1 : 0,
                ["--sr-note-path-tooltip-arrow-left" as string]: position
                    ? `${position.arrowLeft}px`
                    : undefined,
            }}
        >
            {displayPath}
        </div>,
        document.body,
    );
};

const NoteItemModern: React.FC<NoteItemModernProps> = ({
    item,
    isActive,
    ignoredTags,
    showSidebarProgressIndicator,
    progressIndicatorMode,
    progressRingDirection,
    pathTooltipHoverEnabled,
    filePathTooltipEnabled,
    filePathTooltipDelayMs,
    onClick,
    onMiddleClick,
    onDoubleClick,
    onContextMenu,
    onTagDrop,
    onPriorityChange,
}) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const [isEditingPriority, setIsEditingPriority] = useState(false);
    const [isPathTooltipVisible, setIsPathTooltipVisible] = useState(false);
    const [editValue, setEditValue] = useState(String(item.priority));
    const itemRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const pathTooltipTimerRef = useRef<number | null>(null);

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

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (e.button !== 1) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();
            onMiddleClick?.();
        },
        [onMiddleClick],
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

    const clearPathTooltipTimer = useCallback(() => {
        if (pathTooltipTimerRef.current !== null) {
            window.clearTimeout(pathTooltipTimerRef.current);
            pathTooltipTimerRef.current = null;
        }
    }, []);

    const hidePathTooltip = useCallback(() => {
        clearPathTooltipTimer();
        setIsPathTooltipVisible(false);
    }, [clearPathTooltipTimer]);

    const queuePathTooltip = useCallback(() => {
        if (!pathTooltipHoverEnabled || !filePathTooltipEnabled || !item.path) {
            return;
        }

        clearPathTooltipTimer();
        const delayMs = Math.max(0, filePathTooltipDelayMs);

        if (delayMs === 0) {
            setIsPathTooltipVisible(true);
            return;
        }

        pathTooltipTimerRef.current = window.setTimeout(() => {
            pathTooltipTimerRef.current = null;
            setIsPathTooltipVisible(true);
        }, delayMs);
    }, [
        clearPathTooltipTimer,
        filePathTooltipDelayMs,
        filePathTooltipEnabled,
        item.path,
        pathTooltipHoverEnabled,
    ]);

    useEffect(() => {
        if (!pathTooltipHoverEnabled || !filePathTooltipEnabled || !item.path) {
            hidePathTooltip();
        }
    }, [filePathTooltipEnabled, hidePathTooltip, item.path, pathTooltipHoverEnabled]);

    useEffect(() => {
        return () => {
            clearPathTooltipTimer();
        };
    }, [clearPathTooltipTimer]);

    return (
        <>
            <div
                ref={itemRef}
                className={`sr-new-item ${isActive ? "sr-new-item--active" : ""} ${isDragOver ? "sr-new-item--drag-over" : ""}`}
                data-note-path={item.path}
                onClick={onClick}
                onMouseDown={handleMouseDown}
                onDoubleClick={onDoubleClick}
                onContextMenu={handleContextMenu}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onMouseEnter={queuePathTooltip}
                onMouseLeave={hidePathTooltip}
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
                        <SidebarProgressIndicator
                            visible={showSidebarProgressIndicator}
                            mode={progressIndicatorMode}
                            percentage={item.lastScrollPercentage}
                            direction={progressRingDirection}
                        />
                        <span className="sr-new-item-tag">
                            {displayTag || (
                                <span style={{ opacity: 0.3 }}>{t("SIDEBAR_NO_TAG")}</span>
                            )}
                        </span>
                    </div>
                </div>
            </div>
            <NotePathTooltip
                anchorEl={itemRef.current}
                path={item.path}
                visible={filePathTooltipEnabled && isPathTooltipVisible}
            />
        </>
    );
};

// ==========================================
// 主组件
// ==========================================
interface NoteReviewSidebarProps {
    app: App;
    data: NoteReviewSidebarState;
    activeFilePath?: string;
    autoRevealTargetPath?: string;
    autoRevealRequestKey?: number;
    onNoteClick: (item: NoteReviewItem, options?: { newTab?: boolean }) => void;
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
    onEditCommit?: (commitId: string, payload: ReviewCommitEditPayload) => void;
    onStartEdit?: (commitId: string) => void;
    onCancelEdit?: () => void;
    onCommitSelect?: (log: ReviewCommitLog) => void;
    activeExtracts?: ExtractItem[];
    onExtractSelect?: (extract: ExtractItem) => void;
    onExtractPriorityChange?: (extract: ExtractItem, priority: number) => void;
    isLoading?: boolean;
    showScrollPercentage?: boolean;
    enableDurationPrefixSyntax?: boolean;
    showSidebarProgressIndicator?: boolean;
    progressRingColor?: string;
    progressIndicatorMode?: SidebarProgressIndicatorMode;
    progressRingDirection?: SidebarProgressRingDirection;
    filePathTooltipEnabled?: boolean;
    filePathTooltipDelayMs?: number;
    isForegroundDrawerView?: boolean;
    autoRevealDebugSource?: string;
    debugRuntime?: boolean;
}

export const NoteReviewSidebar: React.FC<NoteReviewSidebarProps> = ({
    app,
    data,
    activeFilePath,
    autoRevealTargetPath,
    autoRevealRequestKey = 0,
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
    onNoteDoubleClick: _onNoteDoubleClick,
    onCommitContextMenu,
    editingId = null,
    onEditCommit,
    onStartEdit: _onStartEdit,
    onCancelEdit,
    onCommitSelect,
    activeExtracts = [],
    onExtractSelect,
    onExtractPriorityChange,
    isLoading: _isLoading = false,
    showScrollPercentage = true,
    enableDurationPrefixSyntax = false,
    showSidebarProgressIndicator = true,
    progressRingColor = "#a0b0a9",
    progressIndicatorMode = "ring",
    progressRingDirection = "counterclockwise",
    filePathTooltipEnabled = true,
    filePathTooltipDelayMs = 1000,
    isForegroundDrawerView = false,
    autoRevealDebugSource,
    debugRuntime = false,
}) => {
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const [currentHeight, setCurrentHeight] = useState(filterBarHeight);
    const [, setDraggedTag] = useState<string | null>(null);
    const sidebarRef = useRef<HTMLDivElement>(null);
    const [isInMobileDrawer, setIsInMobileDrawer] = useState(false);
    const [pathTooltipHoverEnabled, setPathTooltipHoverEnabled] = useState(() =>
        canUseHoverPathTooltips(),
    );
    const isPhoneMobileDrawer = isInMobileDrawer && isPhoneMobileDrawerLayout();
    const shouldUseTapToSelectOpen = isPhoneMobileDrawer;
    const isTimelinePinnedOpen = isInMobileDrawer;
    const effectiveTimelineOpen = isTimelinePinnedOpen || isTimelineOpen;
    const timelineMinHeightPx = isTimelinePinnedOpen
        ? MOBILE_TIMELINE_MIN_HEIGHT_PX
        : TIMELINE_MIN_HEIGHT_PX;
    const [isTimelineResizeActive, setIsTimelineResizeActive] = useState(false);
    const [isTimelineGestureBlocked, setIsTimelineGestureBlocked] = useState(false);
    const activeTimelineSessionCleanupRef = useRef<(() => void) | null>(null);
    const timelineTouchBlockCooldownRef = useRef<number | null>(null);
    const suppressNextTimelineHeaderClickRef = useRef(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const lastHandledAutoRevealRequestKeyRef = useRef(0);

    const logRuntimeDebug = useCallback(
        (message: string, details?: Record<string, unknown>) => {
            if (!debugRuntime) {
                return;
            }

            if (details) {
                console.debug(message, details);
                return;
            }

            console.debug(message);
        },
        [debugRuntime],
    );

    // 同步外部高度变化
    useEffect(() => {
        setCurrentHeight(filterBarHeight);
    }, [filterBarHeight]);

    // 动态检测状态栏高度并设置 CSS 变量
    useEffect(() => {
        const updateStatusBarOffset = () => {
            const statusBar = document.querySelector(".status-bar");
            const sidebar = sidebarRef.current;
            if (!statusBar || !sidebar) {
                sidebar?.setCssProps({ "--sr-statusbar-offset": "0px" });
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
                sidebar.setCssProps({ "--sr-statusbar-offset": `${statusBarRect.height}px` });
            } else {
                sidebar.setCssProps({ "--sr-statusbar-offset": "0px" });
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

    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
            setPathTooltipHoverEnabled(false);
            return;
        }

        const mediaQueries = [
            window.matchMedia("(any-hover: hover) and (any-pointer: fine)"),
            window.matchMedia("(hover: hover) and (pointer: fine)"),
        ];
        const updateHoverCapability = () => {
            setPathTooltipHoverEnabled(mediaQueries.some((query) => query.matches));
        };
        const cleanups = mediaQueries.map((query) => {
            query.addEventListener("change", updateHoverCapability);
            return () => query.removeEventListener("change", updateHoverCapability);
        });

        updateHoverCapability();

        return () => {
            cleanups.forEach((cleanup) => cleanup());
        };
    }, []);

    useEffect(() => {
        const sidebar = sidebarRef.current;
        if (!sidebar) {
            return;
        }

        let frameId = 0;
        let observedDrawerShell: HTMLElement | null = null;
        let observedDrawerInner: HTMLElement | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let mutationObserver: MutationObserver | null = null;

        const syncDrawerHostClass = (drawerInner: HTMLElement | null, enabled: boolean) => {
            if (!drawerInner) {
                return;
            }

            drawerInner.classList.toggle(MOBILE_DRAWER_HOST_CLASS, enabled);
        };

        const syncDrawerShellClass = (drawerShell: HTMLElement | null, enabled: boolean) => {
            if (!drawerShell) {
                return;
            }

            drawerShell.classList.toggle(MOBILE_DRAWER_SHELL_CLASS, enabled);
        };

        const observeTargets = (
            drawerInner: HTMLElement | null,
            activeTabContent: HTMLElement | null,
        ) => {
            resizeObserver?.disconnect();

            const statusBar = document.querySelector(".status-bar");
            const targets = [sidebar, statusBar, drawerInner, activeTabContent].filter(
                (value): value is HTMLElement => value instanceof HTMLElement,
            );

            Array.from(new Set(targets)).forEach((target) => resizeObserver?.observe(target));

            mutationObserver?.disconnect();
            if (drawerInner) {
                mutationObserver?.observe(drawerInner, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ["class"],
                });
            }
        };

        const updateSidebarChromeMetrics = () => {
            const currentSidebar = sidebarRef.current;
            if (!currentSidebar) {
                return;
            }

            const statusBar = document.querySelector(".status-bar");
            const nextDrawerShell = currentSidebar.closest(".workspace-drawer");
            const nextDrawerInner = currentSidebar.closest(".workspace-drawer-inner");
            const nextActiveTabContent = currentSidebar.closest(
                ".workspace-drawer-active-tab-content",
            );
            const drawerShell = nextDrawerShell instanceof HTMLElement ? nextDrawerShell : null;
            const drawerInner = nextDrawerInner instanceof HTMLElement ? nextDrawerInner : null;
            const activeTabContent =
                nextActiveTabContent instanceof HTMLElement ? nextActiveTabContent : null;
            const isMobileDrawer = drawerInner !== null && activeTabContent !== null;

            setIsInMobileDrawer((previousValue) =>
                previousValue === isMobileDrawer ? previousValue : isMobileDrawer,
            );

            if (observedDrawerShell !== drawerShell) {
                syncDrawerShellClass(observedDrawerShell, false);
                observedDrawerShell = drawerShell;
            }

            if (observedDrawerInner !== drawerInner) {
                syncDrawerHostClass(observedDrawerInner, false);
                observedDrawerInner = drawerInner;
            }

            if (statusBar instanceof HTMLElement) {
                const sidebarRect = currentSidebar.getBoundingClientRect();
                const statusBarRect = statusBar.getBoundingClientRect();
                const isOverlapping =
                    sidebarRect.bottom > statusBarRect.top &&
                    sidebarRect.right > statusBarRect.left &&
                    sidebarRect.left < statusBarRect.right;

                currentSidebar.setCssProps({
                    "--sr-statusbar-offset": isOverlapping ? `${statusBarRect.height}px` : "0px",
                });
            } else {
                currentSidebar.setCssProps({ "--sr-statusbar-offset": "0px" });
            }

            const shouldDecorateDrawer = Boolean(
                drawerShell && drawerInner && activeTabContent && isForegroundDrawerView,
            );
            syncDrawerShellClass(drawerShell, shouldDecorateDrawer);
            syncDrawerHostClass(drawerInner, shouldDecorateDrawer);
            observeTargets(drawerInner, activeTabContent);
        };

        const scheduleSidebarChromeMetricsUpdate = () => {
            if (frameId) {
                cancelAnimationFrame(frameId);
            }

            frameId = requestAnimationFrame(() => {
                frameId = 0;
                updateSidebarChromeMetrics();
            });
        };

        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(() => {
                scheduleSidebarChromeMetricsUpdate();
            });
        }

        mutationObserver = new MutationObserver(() => {
            scheduleSidebarChromeMetricsUpdate();
        });

        scheduleSidebarChromeMetricsUpdate();
        window.addEventListener("resize", scheduleSidebarChromeMetricsUpdate);
        window.addEventListener("orientationchange", scheduleSidebarChromeMetricsUpdate);

        return () => {
            if (frameId) {
                cancelAnimationFrame(frameId);
            }

            window.removeEventListener("resize", scheduleSidebarChromeMetricsUpdate);
            window.removeEventListener("orientationchange", scheduleSidebarChromeMetricsUpdate);
            resizeObserver?.disconnect();
            mutationObserver?.disconnect();
            syncDrawerShellClass(observedDrawerShell, false);
            syncDrawerHostClass(observedDrawerInner, false);
        };
    }, [isForegroundDrawerView]);

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

    useLayoutEffect(() => {
        if (!autoRevealTargetPath || autoRevealRequestKey <= 0) {
            logRuntimeDebug("[TimelineAutoFollow] sidebar:auto-reveal:skip", {
                reason: !autoRevealTargetPath ? "missingTargetPath" : "nonPositiveRequestKey",
                autoRevealTargetPath,
                autoRevealRequestKey,
                autoRevealDebugSource,
            });
            return;
        }

        if (autoRevealRequestKey <= lastHandledAutoRevealRequestKeyRef.current) {
            logRuntimeDebug("[TimelineAutoFollow] sidebar:auto-reveal:skip", {
                reason: "requestAlreadyHandled",
                autoRevealTargetPath,
                autoRevealRequestKey,
                autoRevealDebugSource,
            });
            return;
        }

        const contentEl = contentRef.current;
        const sidebarEl = sidebarRef.current;
        if (!(contentEl instanceof HTMLElement) || !(sidebarEl instanceof HTMLElement)) {
            logRuntimeDebug("[TimelineAutoFollow] sidebar:auto-reveal:skip", {
                reason: "missingSidebarElements",
                autoRevealTargetPath,
                autoRevealRequestKey,
                autoRevealDebugSource,
            });
            return;
        }

        const noteSelector = `[data-note-path="${escapeNotePathForSelector(autoRevealTargetPath)}"]`;
        const noteEl = sidebarEl.querySelector(noteSelector);
        if (!(noteEl instanceof HTMLElement)) {
            logRuntimeDebug("[TimelineAutoFollow] sidebar:auto-reveal:skip", {
                reason: "targetElementNotFound",
                autoRevealTargetPath,
                autoRevealRequestKey,
                autoRevealDebugSource,
                noteSelector,
            });
            return;
        }

        const contentRect = contentEl.getBoundingClientRect();
        const noteRect = noteEl.getBoundingClientRect();
        const visibilityPadding = 24;
        const isFullyVisible =
            noteRect.top >= contentRect.top + visibilityPadding &&
            noteRect.bottom <= contentRect.bottom - visibilityPadding;

        if (isFullyVisible) {
            lastHandledAutoRevealRequestKeyRef.current = autoRevealRequestKey;
            logRuntimeDebug("[TimelineAutoFollow] sidebar:auto-reveal:skip", {
                reason: "targetAlreadyVisible",
                autoRevealTargetPath,
                autoRevealRequestKey,
                autoRevealDebugSource,
            });
            return;
        }

        lastHandledAutoRevealRequestKeyRef.current = autoRevealRequestKey;
        logRuntimeDebug("[TimelineAutoFollow] sidebar:auto-reveal:scroll", {
            autoRevealTargetPath,
            autoRevealRequestKey,
            autoRevealDebugSource,
        });
        noteEl.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
        });
    }, [
        autoRevealDebugSource,
        autoRevealRequestKey,
        autoRevealTargetPath,
        filteredSections,
        logRuntimeDebug,
    ]);

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
    const clampTimelineHeight = useCallback(
        (height: number) => {
            return Math.max(
                timelineMinHeightPx,
                Math.min(height, window.innerHeight * TIMELINE_MAX_HEIGHT_VIEWPORT_RATIO),
            );
        },
        [timelineMinHeightPx],
    );

    const [localTimelineHeight, setLocalTimelineHeight] = useState(() =>
        clampTimelineHeight(timelineHeight),
    );
    const currentTimelineHeightRef = useRef(clampTimelineHeight(timelineHeight));

    useEffect(() => {
        const clampedHeight = clampTimelineHeight(timelineHeight);
        currentTimelineHeightRef.current = clampedHeight;
        setLocalTimelineHeight(clampedHeight);
    }, [clampTimelineHeight, timelineHeight]);

    useEffect(() => {
        currentTimelineHeightRef.current = localTimelineHeight;
    }, [localTimelineHeight]);

    const requestTimelineToggle = useCallback(() => {
        if (isTimelinePinnedOpen) {
            return;
        }

        onTimelineToggle?.();
    }, [isTimelinePinnedOpen, onTimelineToggle]);

    const clearTimelineTouchBlockCooldown = useCallback(() => {
        if (timelineTouchBlockCooldownRef.current !== null) {
            window.clearTimeout(timelineTouchBlockCooldownRef.current);
            timelineTouchBlockCooldownRef.current = null;
        }
    }, []);

    const activateTimelineGestureBlock = useCallback(() => {
        clearTimelineTouchBlockCooldown();
        setIsTimelineGestureBlocked(true);
    }, [clearTimelineTouchBlockCooldown]);

    const releaseTimelineGestureBlock = useCallback(
        (cooldownMs: number) => {
            clearTimelineTouchBlockCooldown();

            if (cooldownMs <= 0) {
                setIsTimelineGestureBlocked(false);
                return;
            }

            timelineTouchBlockCooldownRef.current = window.setTimeout(() => {
                timelineTouchBlockCooldownRef.current = null;
                setIsTimelineGestureBlocked(false);
            }, cooldownMs);
        },
        [clearTimelineTouchBlockCooldown],
    );

    const cleanupTimelineResizeSession = useCallback(() => {
        activeTimelineSessionCleanupRef.current?.();
        activeTimelineSessionCleanupRef.current = null;
        document.body.classList.remove(TIMELINE_RESIZE_BODY_CLASS);
        setIsTimelineResizeActive(false);
    }, []);

    useEffect(() => {
        return () => {
            activeTimelineSessionCleanupRef.current?.();
            activeTimelineSessionCleanupRef.current = null;
            document.body.classList.remove(TIMELINE_RESIZE_BODY_CLASS);
            clearTimelineTouchBlockCooldown();
        };
    }, [clearTimelineTouchBlockCooldown]);

    const applyTimelineHeight = useCallback(
        (nextHeight: number) => {
            const clamped = clampTimelineHeight(nextHeight);
            currentTimelineHeightRef.current = clamped;
            setLocalTimelineHeight(clamped);
            return clamped;
        },
        [clampTimelineHeight],
    );

    const startTimelineResizeSession = useCallback(
        ({
            startY,
            inputType,
            toggleOnTap,
            dragThreshold,
            touchId,
        }: {
            startY: number;
            inputType: "mouse" | "touch";
            toggleOnTap: boolean;
            dragThreshold: number;
            touchId?: number;
        }) => {
            cleanupTimelineResizeSession();

            if (inputType === "touch") {
                activateTimelineGestureBlock();
            } else {
                releaseTimelineGestureBlock(0);
            }

            const startHeight = currentTimelineHeightRef.current;
            let didResize = false;

            const promoteToResize = () => {
                if (didResize) {
                    return;
                }

                didResize = true;
                setIsTimelineResizeActive(true);
                if (inputType === "mouse") {
                    document.body.classList.add(TIMELINE_RESIZE_BODY_CLASS);
                }
            };

            const updateFromClientY = (clientY: number, nativeEvent?: Event) => {
                const movedDistance = Math.abs(clientY - startY);
                if (!didResize) {
                    if (toggleOnTap && movedDistance < dragThreshold) {
                        if (inputType === "touch") {
                            nativeEvent?.preventDefault();
                        }
                        return;
                    }

                    promoteToResize();
                }

                if (inputType === "touch") {
                    nativeEvent?.preventDefault();
                }

                applyTimelineHeight(startHeight + (startY - clientY));
            };

            const finishSession = (shouldToggleOnTap: boolean) => {
                cleanup();
                activeTimelineSessionCleanupRef.current = null;
                document.body.classList.remove(TIMELINE_RESIZE_BODY_CLASS);
                setIsTimelineResizeActive(false);
                releaseTimelineGestureBlock(
                    inputType === "touch" ? TIMELINE_TOUCH_BLOCK_COOLDOWN_MS : 0,
                );

                if (didResize) {
                    suppressNextTimelineHeaderClickRef.current = true;
                    window.setTimeout(() => {
                        suppressNextTimelineHeaderClickRef.current = false;
                    }, 0);
                    onTimelineHeightChange?.(currentTimelineHeightRef.current);
                } else if (shouldToggleOnTap && toggleOnTap) {
                    requestTimelineToggle();
                }
            };

            const cancelSession = () => {
                cleanup();
                activeTimelineSessionCleanupRef.current = null;
                document.body.classList.remove(TIMELINE_RESIZE_BODY_CLASS);
                setIsTimelineResizeActive(false);
                releaseTimelineGestureBlock(
                    inputType === "touch" ? TIMELINE_TOUCH_BLOCK_COOLDOWN_MS : 0,
                );
            };

            let cleanup = () => {};

            if (inputType === "mouse") {
                const handleMouseMove = (moveEvent: MouseEvent) => {
                    updateFromClientY(moveEvent.clientY, moveEvent);
                };

                const handleMouseUp = () => {
                    finishSession(true);
                };

                cleanup = () => {
                    document.removeEventListener("mousemove", handleMouseMove);
                    document.removeEventListener("mouseup", handleMouseUp);
                };

                document.addEventListener("mousemove", handleMouseMove);
                document.addEventListener("mouseup", handleMouseUp);
            } else {
                const activeTouchId = touchId ?? -1;

                const handleTouchMove = (moveEvent: TouchEvent) => {
                    const activeTouch =
                        findTouchByIdentifier(moveEvent.touches, activeTouchId) ??
                        findTouchByIdentifier(moveEvent.changedTouches, activeTouchId);

                    if (!activeTouch) {
                        return;
                    }

                    updateFromClientY(activeTouch.clientY, moveEvent);
                };

                const handleTouchEnd = (endEvent: TouchEvent) => {
                    const activeTouch = findTouchByIdentifier(
                        endEvent.changedTouches,
                        activeTouchId,
                    );
                    if (!activeTouch) {
                        return;
                    }

                    finishSession(true);
                };

                const handleTouchCancel = () => {
                    cancelSession();
                };

                cleanup = () => {
                    document.removeEventListener("touchmove", handleTouchMove);
                    document.removeEventListener("touchend", handleTouchEnd);
                    document.removeEventListener("touchcancel", handleTouchCancel);
                };

                document.addEventListener("touchmove", handleTouchMove, { passive: false });
                document.addEventListener("touchend", handleTouchEnd);
                document.addEventListener("touchcancel", handleTouchCancel);
            }

            activeTimelineSessionCleanupRef.current = cleanup;
        },
        [
            activateTimelineGestureBlock,
            applyTimelineHeight,
            cleanupTimelineResizeSession,
            onTimelineHeightChange,
            requestTimelineToggle,
            releaseTimelineGestureBlock,
        ],
    );

    const handleTimelineSashMouseDown = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
            startTimelineResizeSession({
                startY: event.clientY,
                inputType: "mouse",
                toggleOnTap: false,
                dragThreshold: 0,
            });
        },
        [startTimelineResizeSession],
    );

    const handleTimelineSashTouchStart = useCallback(
        (event: React.TouchEvent<HTMLDivElement>) => {
            const touch = event.changedTouches[0] ?? event.touches[0];
            if (!touch) {
                return;
            }

            event.stopPropagation();
            startTimelineResizeSession({
                startY: touch.clientY,
                inputType: "touch",
                toggleOnTap: false,
                dragThreshold: 0,
                touchId: touch.identifier,
            });
        },
        [startTimelineResizeSession],
    );

    const handleTimelineHeaderMouseDown = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (!effectiveTimelineOpen) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            startTimelineResizeSession({
                startY: event.clientY,
                inputType: "mouse",
                toggleOnTap: false,
                dragThreshold: TIMELINE_HEADER_DRAG_THRESHOLD_PX,
            });
        },
        [effectiveTimelineOpen, startTimelineResizeSession],
    );

    const handleTimelineHeaderTouchStart = useCallback(
        (event: React.TouchEvent<HTMLDivElement>) => {
            if (!effectiveTimelineOpen) {
                return;
            }

            const touch = event.changedTouches[0] ?? event.touches[0];
            if (!touch) {
                return;
            }

            event.stopPropagation();
            startTimelineResizeSession({
                startY: touch.clientY,
                inputType: "touch",
                toggleOnTap: false,
                dragThreshold: TIMELINE_HEADER_DRAG_THRESHOLD_PX,
                touchId: touch.identifier,
            });
        },
        [effectiveTimelineOpen, startTimelineResizeSession],
    );

    const handleTimelineHeaderClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (suppressNextTimelineHeaderClickRef.current) {
                suppressNextTimelineHeaderClickRef.current = false;
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            requestTimelineToggle();
        },
        [requestTimelineToggle],
    );

    // 单击 = 展开 Timeline + 打开文件
    const effectiveActiveItemPath =
        shouldUseTapToSelectOpen && selectedItem ? selectedItem.path : activeFilePath;

    const handleNoteSingleClick = useCallback(
        (item: NoteReviewItem, options?: { newTab?: boolean }) => {
            if (shouldUseTapToSelectOpen && !options?.newTab) {
                if (selectedItem?.path === item.path) {
                    onNoteClick?.(item);
                    return;
                }

                onNoteSelect?.(item);
                return;
            }

            onNoteSelect?.(item);
            onNoteClick?.(item, options);
        },
        [onNoteClick, onNoteSelect, selectedItem, shouldUseTapToSelectOpen],
    );

    // 双击保持原样或留空 (单击已处理打开文件)
    const handleNoteDoubleClick = useCallback((_item: NoteReviewItem) => {
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
        <div
            className={[
                "sr-note-sidebar",
                isInMobileDrawer ? "sr-note-sidebar--mobile-drawer" : "",
                isPhoneMobileDrawer ? "sr-note-sidebar--phone-mobile-drawer" : "",
            ]
                .filter(Boolean)
                .join(" ")}
            ref={sidebarRef}
            style={{
                ["--sr-sidebar-progress-ring-color" as string]: progressRingColor,
            }}
            data-progress-ring-direction={progressRingDirection}
        >
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
                        isPhoneMobileDrawer={isPhoneMobileDrawer}
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
            <div
                ref={contentRef}
                className={[
                    "sr-note-sidebar__content",
                    isTimelineGestureBlocked
                        ? "sr-note-sidebar__content--timeline-gesture-blocked"
                        : "",
                ]
                    .filter(Boolean)
                    .join(" ")}
            >
                {filteredSections.length === 0 ? (
                    <div className="sr-note-sidebar__empty">
                        {selectedTags.size > 0 ? (
                            <span>{t("SIDEBAR_NO_NOTES_WITH_SELECTED_TAGS")}</span>
                        ) : null}
                    </div>
                ) : (
                    <div className="sr-sections-container">
                        {filteredSections.map((section) => (
                            <SectionGroupModern
                                key={section.id}
                                section={section}
                                activeItemPath={effectiveActiveItemPath}
                                ignoredTags={ignoredTags}
                                showSidebarProgressIndicator={showSidebarProgressIndicator}
                                progressIndicatorMode={progressIndicatorMode}
                                progressRingDirection={progressRingDirection}
                                pathTooltipHoverEnabled={pathTooltipHoverEnabled}
                                filePathTooltipEnabled={filePathTooltipEnabled}
                                filePathTooltipDelayMs={filePathTooltipDelayMs}
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
            {effectiveTimelineOpen && (
                <div
                    className={[
                        "sr-timeline-sash",
                        isTimelineResizeActive ? "sr-timeline-sash--dragging" : "",
                    ]
                        .filter(Boolean)
                        .join(" ")}
                    onMouseDown={handleTimelineSashMouseDown}
                    onTouchStart={handleTimelineSashTouchStart}
                >
                    <div className="sr-timeline-sash-handle" />
                </div>
            )}

            <div
                className="sr-timeline-container"
                style={{
                    height: effectiveTimelineOpen ? `${localTimelineHeight}px` : "auto",
                }}
            >
                <TimelinePane
                    app={app}
                    enableDurationPrefixSyntax={enableDurationPrefixSyntax}
                    isOpen={effectiveTimelineOpen}
                    onToggle={requestTimelineToggle}
                    onHeaderClick={handleTimelineHeaderClick}
                    isHeaderDragEnabled={effectiveTimelineOpen}
                    isHeaderDragging={isTimelineResizeActive}
                    onHeaderMouseDown={handleTimelineHeaderMouseDown}
                    onHeaderTouchStart={handleTimelineHeaderTouchStart}
                    selectedItem={selectedItem}
                    logs={commitLogs}
                    onCommit={handleCommitMessage}
                    onCommitContextMenu={onCommitContextMenu}
                    editingId={editingId}
                    onEditCommit={onEditCommit}
                    onStartEdit={_onStartEdit}
                    onCancelEdit={onCancelEdit}
                    onCommitSelect={onCommitSelect}
                    activeExtracts={activeExtracts}
                    onExtractSelect={onExtractSelect}
                    onExtractPriorityChange={onExtractPriorityChange}
                    showScrollPercentage={showScrollPercentage}
                />
            </div>
        </div>
    );
};
