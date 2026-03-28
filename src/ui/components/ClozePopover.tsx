/** @jsxImportSource react */
import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Platform } from "obsidian";
import { X, Merge, SplitSquareHorizontal, Layers } from "lucide-react";
import "../styles/cloze-popover.css";
import { t } from "src/lang/helpers";

// =========================================
// =========================================
interface ClozeGroup {
    id: string;
    content: string;
    count: number;
}

interface Segment {
    id: string;
    text: string;
    clozeId?: string;
}

interface ClozePopoverProps {
    anchorElement: HTMLElement;
    currentId: string;
    currentContent: string;
    otherGroups: ClozeGroup[];
    segments: Segment[];
    onMerge: (targetId: string) => void;
    onSplit: () => void;
    onMergeAll: () => void;
    onClose: () => void;
    renderMarkdown: (text: string, el: HTMLElement) => void;
    storage: {
        load: (key: string) => string | null | Promise<string | null>;
        save: (key: string, value: string) => void | Promise<void>;
    };
}

const SIZE_STORAGE_KEY = "sr-cloze-popover-size";

const DEFAULT_WIDTH = 680;
const DEFAULT_HEIGHT = 420;

// =========================================
// =========================================
const MarkdownBlock: React.FC<{
    content: string;
    renderMarkdown: (text: string, el: HTMLElement) => void;
    className?: string;
}> = ({ content, renderMarkdown, className }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.replaceChildren();
            renderMarkdown(content, containerRef.current);
        }
    }, [content, renderMarkdown]);

    return <span ref={containerRef} className={`sr-markdown-inline ${className || ""}`} />;
};

// =========================================
// =========================================
const PreviewCard: React.FC<{
    activeClozeId: string;
    segments: Segment[];
    renderMarkdown: (text: string, el: HTMLElement) => void;
}> = ({ activeClozeId, segments, renderMarkdown }) => {
    const [showAnswer, setShowAnswer] = useState(false);

    const content = useMemo(() => {
        return segments
            .map((seg) => {
                if (seg.clozeId === activeClozeId) {
                    return showAnswer
                        ? `<span class="sr-cloze-active-answer">${seg.text}</span>`
                        : '<span class="sr-cloze-active-blank">[ ... ]</span>';
                } else if (seg.clozeId) {
                    return `<span class="sr-cloze-inactive">${seg.text}</span>`;
                }
                return seg.text;
            })
            .join("");
    }, [segments, activeClozeId, showAnswer]);

    return (
        <div
            className="sr-preview-card-minimal"
            onClick={() => setShowAnswer(!showAnswer)}
            title="Click to toggle answer preview"
        >
            <div className="sr-preview-card-body">
                <MarkdownBlock content={content} renderMarkdown={renderMarkdown} />
            </div>

            <div className="sr-preview-card-footer-minimal">{activeClozeId}</div>
        </div>
    );
};

// =========================================
// =========================================
export const ClozePopover: React.FC<ClozePopoverProps> = ({
    anchorElement,
    currentId,
    currentContent,
    otherGroups,
    segments,
    onMerge,
    onSplit,
    onMergeAll,
    onClose,
    renderMarkdown,
    storage,
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    const isResizing = useRef(false);
    const sizeRef = useRef(size);

    const alignmentRef = useRef<"top" | "bottom" | null>(null);

    const uniqueClozeIds = useMemo(() => {
        const ids = new Set<string>();
        segments.forEach((s) => {
            if (s.clozeId) ids.add(s.clozeId);
        });
        return Array.from(ids).sort((a, b) => parseInt(a) - parseInt(b));
    }, [segments]);

    useEffect(() => {
        sizeRef.current = size;
    }, [size]);

    useEffect(() => {
        let isMounted = true;

        void Promise.resolve(storage.load(SIZE_STORAGE_KEY))
            .then((saved) => {
                if (!isMounted || !saved) {
                    return;
                }

                const parsed = JSON.parse(saved) as Partial<typeof size>;
                if (parsed.width && parsed.height) {
                    setSize({ width: parsed.width, height: parsed.height });
                }
            })
            .catch(() => {
                return;
            });

        return () => {
            isMounted = false;
        };
    }, [storage]);

    const updatePosition = useCallback(() => {
        if (!anchorElement) return;

        const anchorRect = anchorElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 12;

        let left: number;
        let top: number;

        if (alignmentRef.current === null) {
            const spaceAbove = anchorRect.top;
            const spaceBelow = viewportHeight - anchorRect.bottom;

            if (spaceBelow < size.height + padding && spaceAbove > size.height + padding) {
                alignmentRef.current = "top";
            } else {
                alignmentRef.current = "bottom";
            }
        }

        if (alignmentRef.current === "top") {
            top = anchorRect.top - size.height - padding;
        } else {
            top = anchorRect.bottom + padding;
        }

        left = anchorRect.left;

        if (left + size.width > viewportWidth - padding) {
            left = viewportWidth - size.width - padding;
        }
        if (left < padding) {
            left = padding;
        }

        setPosition({ top, left });
    }, [anchorElement, size]);

    useEffect(() => {
        updatePosition();

        const handleScroll = () => {
            updatePosition();
        };

        window.addEventListener("scroll", handleScroll, true);

        return () => {
            window.removeEventListener("scroll", handleScroll, true);
        };
    }, [updatePosition]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (isResizing.current) return;
            if (
                popoverRef.current &&
                !popoverRef.current.contains(e.target as Node) &&
                !anchorElement.contains(e.target as Node)
            ) {
                onClose();
            }
        };

        const timer = setTimeout(() => {
            document.addEventListener("mousedown", handleClickOutside);
        }, 50);

        return () => {
            clearTimeout(timer);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [onClose, anchorElement]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    const handleResizeStart = (e: React.MouseEvent, direction: string) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing.current = true;

        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = size.width;
        const startHeight = size.height;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            let newWidth = startWidth;
            let newHeight = startHeight;

            if (direction.includes("e"))
                newWidth = Math.max(400, startWidth + (moveEvent.clientX - startX));
            if (direction.includes("w"))
                newWidth = Math.max(400, startWidth - (moveEvent.clientX - startX));
            if (direction.includes("s"))
                newHeight = Math.max(300, startHeight + (moveEvent.clientY - startY));
            if (direction.includes("n"))
                newHeight = Math.max(300, startHeight - (moveEvent.clientY - startY));

            setSize({ width: newWidth, height: newHeight });
        };

        const handleMouseUp = () => {
            isResizing.current = false;
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
            void Promise.resolve(
                storage.save(SIZE_STORAGE_KEY, JSON.stringify(sizeRef.current)),
            ).catch(() => {
                return;
            });
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };

    const isMobile = window.innerWidth <= 480 || Platform.isPhone || Platform.isTablet;

    if (isMobile) {
        return (
            <>
                <div className="sr-mobile-cloze-backdrop" onClick={onClose} />
                <div className="sr-mobile-cloze-menu">
                    <div className="sr-mobile-menu-header">
                        <span className="sr-mobile-menu-title">c{currentId}</span>
                        <span className="sr-mobile-menu-content-preview">{currentContent}</span>
                    </div>

                    <div className="sr-mobile-menu-list">
                        <div className="sr-mobile-menu-item" onClick={onSplit}>
                            <SplitSquareHorizontal size={18} />
                            <span>{t("CLOZE_SPLIT_THIS_PART")}</span>
                        </div>

                        <div className="sr-mobile-menu-item" onClick={onMergeAll}>
                            <Layers size={18} />
                            <span>{t("CLOZE_MERGE_ALL")}</span>
                        </div>

                        {otherGroups.length > 0 && <div className="sr-mobile-menu-divider" />}

                        {otherGroups.map((group) => (
                            <div
                                key={group.id}
                                className="sr-mobile-menu-item"
                                onClick={() => onMerge(group.id)}
                            >
                                <Merge size={18} />
                                <span>{t("CLOZE_MERGE_WITH_ID", { id: group.id })}</span>
                                <span className="sr-mobile-menu-subtext">
                                    {group.content.substring(0, 10)}
                                    {group.content.length > 10 ? "..." : ""}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </>
        );
    }

    return (
        <div
            ref={popoverRef}
            className="sr-cloze-popover"
            style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                width: size.width,
                height: size.height,
                zIndex: 1000,
            }}
        >
            <div
                className="sr-popover-resize-handle sr-resize-e"
                onMouseDown={(e) => handleResizeStart(e, "e")}
            />
            <div
                className="sr-popover-resize-handle sr-resize-s"
                onMouseDown={(e) => handleResizeStart(e, "s")}
            />
            <div
                className="sr-popover-resize-handle sr-resize-se"
                onMouseDown={(e) => handleResizeStart(e, "se")}
            />

            <div
                className={`sr-popover-body ${uniqueClozeIds.length <= 1 ? "sr-single-cloze" : ""}`}
            >
                <div className="sr-popover-left">
                    <div className="sr-popover-left-header">
                        <h2 className="sr-popover-title">{t("CLOZE_MANAGE_TITLE")}</h2>
                        <button onClick={onClose} className="sr-popover-close-btn">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="sr-popover-scroll-content">
                        <div className="sr-popover-section">
                            <label className="sr-popover-label">
                                {t("CLOZE_CURRENT_SELECTION")}
                            </label>
                            <div className="sr-popover-current-item">
                                <span className="sr-popover-cloze-id">c{currentId}</span>
                                <span className="sr-popover-cloze-text">{currentContent}</span>
                            </div>
                        </div>

                        {otherGroups.length > 0 && (
                            <div className="sr-popover-section">
                                <label className="sr-popover-label">
                                    {t("CLOZE_MERGE_TO_OTHER")}
                                </label>
                                <div className="sr-popover-merge-list">
                                    {otherGroups.map((group) => (
                                        <button
                                            key={group.id}
                                            onClick={() => onMerge(group.id)}
                                            className="sr-popover-merge-item"
                                        >
                                            <span className="sr-popover-merge-id">c{group.id}</span>
                                            <span className="sr-popover-merge-text">
                                                {group.content}
                                            </span>
                                            <Merge size={14} className="sr-popover-merge-icon" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="sr-popover-actions">
                            <button onClick={onSplit} className="sr-popover-btn-secondary">
                                <SplitSquareHorizontal size={14} />
                                {t("CLOZE_SPLIT")}
                            </button>
                            <button onClick={onMergeAll} className="sr-popover-btn-secondary">
                                <Layers size={14} />
                                {t("CLOZE_MERGE_ALL_SHORT")}
                            </button>
                        </div>
                    </div>
                </div>

                {uniqueClozeIds.length > 1 && (
                    <div className="sr-popover-right-minimal">
                        <div className="sr-popover-preview-cards-container">
                            {uniqueClozeIds.map((id) => (
                                <PreviewCard
                                    key={id}
                                    activeClozeId={id}
                                    segments={segments}
                                    renderMarkdown={renderMarkdown}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
