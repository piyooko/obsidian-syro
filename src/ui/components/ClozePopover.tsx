/** @jsxImportSource react */
import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Platform } from "obsidian";
import { X, Merge, SplitSquareHorizontal, Layers } from "lucide-react";
import "../styles/cloze-popover.css";
import { t } from "src/lang/helpers";

// =========================================
// 缂侇偉顕ч悗椋庘偓瑙勭煯缁?
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
}

// 閻庢稒锚閸嬪秶浜搁崫鍕靛殶闁?key
const SIZE_STORAGE_KEY = "sr-cloze-popover-size";

// 濮掓稒顭堥鑽や焊閸濆嫷鍤?
const DEFAULT_WIDTH = 680;
const DEFAULT_HEIGHT = 420;

// =========================================
// Markdown 婵炴挸寮堕悡瀣磼閸曨亝顐?
// =========================================
const MarkdownBlock: React.FC<{
    content: string;
    renderMarkdown: (text: string, el: HTMLElement) => void;
    className?: string;
}> = ({ content, renderMarkdown, className }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.innerHTML = "";
            renderMarkdown(content, containerRef.current);
        }
    }, [content, renderMarkdown]);

    return <span ref={containerRef} className={`sr-markdown-inline ${className || ""}`} />;
};

// =========================================
// 濡澘瀚～宥夊础閿涘嫬顣荤紓浣稿濞?(闁哄鑳堕悾婵堟媼閹规劦鍚€)
// =========================================
const PreviewCard: React.FC<{
    activeClozeId: string;
    segments: Segment[];
    renderMarkdown: (text: string, el: HTMLElement) => void;
}> = ({ activeClozeId, segments, renderMarkdown }) => {
    const [showAnswer, setShowAnswer] = useState(false);

    // 闁哄瀚伴埀顒傚Х閺併倖绂嶆惔銏♀枖缂佲偓閾忚鐣遍柡鍌氭处濠€浼村礃閸涱収鍟?
    const content = useMemo(() => {
        return segments
            .map((seg) => {
                if (seg.clozeId === activeClozeId) {
                    return showAnswer
                        ? `<span class="sr-cloze-active-answer">${seg.text}</span>`
                        : `<span class="sr-cloze-active-blank">[ ... ]</span>`;
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
            {/* 闁告绱曟晶鏍礃閸涱収鍟囧☉鎾诡唺缂?*/}
            <div className="sr-preview-card-body">
                <MarkdownBlock content={content} renderMarkdown={renderMarkdown} />
            </div>

            {/* 閹煎瓨娲熼崕瀛樸亜閻㈢數鍨抽柟绋挎川閵?*/}
            <div className="sr-preview-card-footer-minimal">{activeClozeId}</div>
        </div>
    );
};

// =========================================
// Popover 濞戞捁宕电划宥嗙?
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
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    const isResizing = useRef(false);

    // 闂佸じ绀侀悾鍓р偓闈涚秺缂嶅牓寮悷鐗堝€?
    const alignmentRef = useRef<"top" | "bottom" | null>(null);

    // 閻犱緤绱曢悾濠氬箥閳ь剟寮垫径濠冩殰濞戞挴鍋撻柣?cloze ID
    const uniqueClozeIds = useMemo(() => {
        const ids = new Set<string>();
        segments.forEach((s) => {
            if (s.clozeId) ids.add(s.clozeId);
        });
        return Array.from(ids).sort((a, b) => parseInt(a) - parseInt(b));
    }, [segments]);

    // 闁告梻濮惧ù鍥╂媼閺夎法绠撻柣銊ュ閺勫倻鈧?
    useEffect(() => {
        try {
            const saved = localStorage.getItem(SIZE_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.width && parsed.height) {
                    setSize({ width: parsed.width, height: parsed.height });
                }
            }
        } catch (e) {
            // ignore
        }
    }, []);

    // 閻犱緤绱曢悾鑽も偓瑙勭煯缂嶅懘鏁嶅棰濇禃婵炲棌鍓濆▍銈夋嚄閽樺鐏查柡鍌ゅ弿缁辨繃绋婄€ｎ亝鍊甸梺澶哥閻ｉ箖寮悷鐗堝€?
    const updatePosition = useCallback(() => {
        if (!anchorElement) return;

        const anchorRect = anchorElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 12;

        let left: number;
        let top: number;

        // 1. 缁绢収鍠栭悾楣冨垂閸屾粍绾悗闈涚秺缂嶅牓寮悷鎵闁挎稑鐗呯划搴純閺嶎煈鍋ч柨?
        if (alignmentRef.current === null) {
            const spaceAbove = anchorRect.top;
            const spaceBelow = viewportHeight - anchorRect.bottom;

            if (spaceBelow < size.height + padding && spaceAbove > size.height + padding) {
                alignmentRef.current = "top";
            } else {
                alignmentRef.current = "bottom";
            }
        }

        // 2. 闁哄秷顫夊畵渚€鏌ㄦ担鍝ユ毎闁汇劌瀚顔筋瀲閹邦厽鐓欑€殿喖绻楅鍝ョ不濡も偓濞兼寮?
        if (alignmentRef.current === "top") {
            top = anchorRect.top - size.height - padding;
        } else {
            top = anchorRect.bottom + padding;
        }

        // 3. 婵ɑ娼欓柦鈺冣偓瑙勭煯缂?(鐎归潻绠戦顔筋瀲閹板墎绀夐悽顖ょ畳缁旂喖鎮剧仦缁㈡⒕闁?
        left = anchorRect.left;

        if (left + size.width > viewportWidth - padding) {
            left = viewportWidth - size.width - padding;
        }
        if (left < padding) {
            left = padding;
        }

        setPosition({ top, left });
    }, [anchorElement, size]);

    // 闁告帗绻傞～鎰偓瑙勭煯缂?+ 婵犲﹥鑹炬慨鈺冩崉閻斿吋顓?
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

    // 闁绘劗鎳撻崵顔藉緞閺嶎厼鍔ラ柛蹇斿▕濡?
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

    // ESC 闁稿繑濞婂Λ?
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    // 閻犲鍟弳锝嗗緞瑜嶉惃顒佸緞閸曨厽鍊?
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
            try {
                localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(size));
            } catch {
                return;
            }
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };

    // 缂佸顕ф慨鈺冪博椤栨侗姊炬繛?
    const isMobile =
        window.innerWidth <= 480 ||
        Platform.isPhone ||
        Platform.isTablet;

    if (isMobile) {
        return (
            <>
                <div className="sr-mobile-cloze-backdrop" onClick={onClose} />
                <div className="sr-mobile-cloze-menu">
                    {/* 鐟滅増鎸告晶鐘绘焻婢跺鍘柣銊ュ閻ｆ繄鎲版担铚傜箚闁?(闁告瑯鍨堕埀顒€顧€缁辨繃鎷呭鈧拹鐔煎冀閸ヮ剦鏆柟瀛樼墬瑜颁胶绮? */}
                    <div className="sr-mobile-menu-header">
                        <span className="sr-mobile-menu-title">c{currentId}</span>
                        <span className="sr-mobile-menu-content-preview">{currentContent}</span>
                    </div>

                    {/* 闁瑰灝绉崇紞鏃堝礆濡ゅ嫨鈧?*/}
                    <div className="sr-mobile-menu-list">
                        {/* 闁瑰嘲妫楅崹搴㈢箙椤愩倐鏁?*/}
                        <div className="sr-mobile-menu-item" onClick={onSplit}>
                            <SplitSquareHorizontal size={18} />
                            <span>{t("CLOZE_SPLIT_THIS_PART")}</span>
                        </div>

                        {/* 闁告艾鐗嗛懟鐔煎箥閳ь剟寮?*/}
                        <div className="sr-mobile-menu-item" onClick={onMergeAll}>
                            <Layers size={18} />
                            <span>{t("CLOZE_MERGE_ALL")}</span>
                        </div>

                        {/* 闁告帒妫濆▓褏鐥?*/}
                        {otherGroups.length > 0 && <div className="sr-mobile-menu-divider" />}

                        {/* 闁告艾鐗嗛懟鐔兼焻婢舵劑鈧?*/}
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
            {/* 閻犲鍟弳锝嗗緞瑜嶉惃顒勫箥鐎ｎ偆鍔?*/}
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

            {/* Body: 闁告瑥鏈悥顔炬暜閸愩劎婀?*/}
            <div
                className={`sr-popover-body ${uniqueClozeIds.length <= 1 ? "sr-single-cloze" : ""}`}
            >
                {/* 鐎归潻闄勯悥顕€鏁嶅顓熸儥濞达絾绮岀亸?*/}
                <div className="sr-popover-left">
                    <div className="sr-popover-left-header">
                        <h2 className="sr-popover-title">{t("CLOZE_MANAGE_TITLE")}</h2>
                        <button onClick={onClose} className="sr-popover-close-btn">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="sr-popover-scroll-content">
                        {/* 鐎垫澘鎳庨幃搴ㄧ嵁鐠虹尨缍栫紒?*/}
                        <div className="sr-popover-section">
                            <label className="sr-popover-label">
                                {t("CLOZE_CURRENT_SELECTION")}
                            </label>
                            <div className="sr-popover-current-item">
                                <span className="sr-popover-cloze-id">c{currentId}</span>
                                <span className="sr-popover-cloze-text">{currentContent}</span>
                            </div>
                        </div>

                        {/* 濞?..闁告艾鐗嗛懟?*/}
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

                        {/* 闁瑰灝绉崇紞鏃堝箰婢舵劖灏?*/}
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

                {/* 闁告瑨娅曢悥顕€鏁嶅顓犫偓顒傜不閳ь剚锛愰崟顕呮綌闁?- 闁告瑯浜濆﹢浣瑰緞濮橆偊鍤嬪┑澶樺亞閳规牠寮懜鍨枖缂佲偓?*/}
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
