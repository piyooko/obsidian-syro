/**
 * [核心 UI] 新版牌组树状列表。
 */
/**
 * React DeckTree 组件
 *
 * 显示牌组树状结构，支持折叠/展开、点击进入复习
 * 采用嵌套 DOM + 左侧边框实现树状导引线 (Obsidian 风格)
 */
/** @jsxImportSource react */
import React, { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DeckState } from "../types/deckTypes";
import "../styles/deck-tree.css";
import { t } from "src/lang/helpers";

// 内联 SVG 图标 (使用 framer-motion 实现旋转动画)
const CollapseIcon: React.FC<{ isCollapsed: boolean; className?: string }> = ({
    isCollapsed,
    className,
}) => (
    <motion.svg
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        style={{
            width: "12px",
            height: "12px",
            display: "block",
        }}
        initial={false}
        animate={{ rotate: isCollapsed ? 0 : 90 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className={className}
    >
        {/* V形箭头 (Chevron Right)，旋转90度变成向下 */}
        <path
            d="M9 18L15 12L9 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </motion.svg>
);

// 齿轮图标
const SettingsIcon: React.FC = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: "block" }}
    >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

// 鍚屾鍥炬爣
const SyncIcon: React.FC<{ isSyncing?: boolean }> = ({ isSyncing = false }) => (
    <motion.svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: "block" }}
        initial={false}
        animate={isSyncing ? { rotate: 360 } : { rotate: 0 }}
        transition={
            isSyncing
                ? { duration: 0.9, ease: "linear", repeat: Infinity }
                : { duration: 0.2, ease: "easeOut" }
        }
    >
        <path d="M18.6 8.11A7 7 0 0 0 6.12 9" />
        <path d="M5 5v4h4" />
        <path d="M5.4 15.89A7 7 0 0 0 17.88 15" />
        <path d="M19 19v-4h-4" />
    </motion.svg>
);

// ==========================================
// 表头组件
// ==========================================
interface DeckHeaderProps {
    totalNew: number;
    totalLearn: number;
    totalDue: number;
    onSync?: () => void;
    isSyncing?: boolean;
}

const DeckHeader: React.FC<DeckHeaderProps> = ({
    totalNew,
    totalLearn,
    totalDue,
    onSync,
    isSyncing = false,
}) => (
    <div className="sr-deck-header sr-deck-header-desktop">
        <div className="sr-deck-header-name">{t("DECK_TREE_HEADER_DECK")}</div>
        <div className={`sr-deck-header-stat new ${totalNew === 0 ? "dimmed" : ""}`}>
            {t("DECK_TREE_HEADER_NEW")}
        </div>
        <div className={`sr-deck-header-stat learning ${totalLearn === 0 ? "dimmed" : ""}`}>
            {t("DECK_TREE_HEADER_LEARN")}
        </div>
        <div className={`sr-deck-header-stat due ${totalDue === 0 ? "dimmed" : ""}`}>
            {t("DECK_TREE_HEADER_DUE")}
        </div>
        <div className="sr-deck-header-action">
            {onSync && (
                <button
                    type="button"
                    className={`sr-deck-sync-btn ${isSyncing ? "is-syncing" : ""}`}
                    onClick={onSync}
                    disabled={isSyncing}
                    aria-label={t("DECK_TREE_FULL_SYNC_TITLE")}
                >
                    <SyncIcon isSyncing={isSyncing} />
                </button>
            )}
        </div>
    </div>
);

// ==========================================
// 辅助函数：计算总计统计数据
// ==========================================
function calculateTotalStats(decks: DeckState[]): { new: number; learn: number; due: number } {
    let stats = { new: 0, learn: 0, due: 0 };
    for (const deck of decks) {
        stats.new += deck.newCount;
        stats.learn += deck.learningCount;
        stats.due += deck.dueCount;
        if (deck.subdecks && deck.subdecks.length > 0) {
            const subStats = calculateTotalStats(deck.subdecks);
            stats.new += subStats.new;
            stats.learn += subStats.learn;
            stats.due += subStats.due;
        }
    }
    return stats;
}

// ==========================================
// 排序函数：文件夹优先，文件在后
// ==========================================
function sortDecksWithFoldersFirst(decks: DeckState[]): DeckState[] {
    return [...decks].sort((a, b) => {
        const aHasChildren = a.subdecks && a.subdecks.length > 0;
        const bHasChildren = b.subdecks && b.subdecks.length > 0;

        // 文件夹优先
        if (aHasChildren && !bHasChildren) return -1;
        if (!aHasChildren && bHasChildren) return 1;

        // 同类型按名称排序
        return a.deckName.localeCompare(b.deckName);
    });
}

// ==========================================
// 单行牌组组件 (递归核心 - 嵌套 DOM 结构)
// ==========================================
interface DeckRowProps {
    deck: DeckState;
    onDeckClick?: (deck: DeckState) => void;
    onSettingsClick?: (deck: DeckState, anchorEl: HTMLElement) => void;
    onCollapseChange?: (fullPath: string, isCollapsed: boolean) => void;
    onSync?: () => void;
    recentDeckPath?: string | null;
}

const DeckRow: React.FC<DeckRowProps> = ({
    deck,
    onDeckClick,
    onSettingsClick,
    onCollapseChange,
    recentDeckPath,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(deck.isCollapsed);
    const hasChildren = deck.subdecks && deck.subdecks.length > 0;
    const isRecentlyReviewed = !!recentDeckPath && deck.fullPath === recentDeckPath;

    // 排序后的子牌组
    const sortedSubdecks = useMemo(() => {
        if (!hasChildren) return [];
        return sortDecksWithFoldersFirst(deck.subdecks);
    }, [deck.subdecks, hasChildren]);

    const toggleCollapse = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            const newState = !isCollapsed;
            setIsCollapsed(newState);
            if (onCollapseChange && deck.fullPath) {
                onCollapseChange(deck.fullPath, newState);
            }
        },
        [isCollapsed, deck.fullPath, onCollapseChange],
    );

    const handleRowClick = useCallback(() => {
        onDeckClick?.(deck);
    }, [deck, onDeckClick]);

    const handleSettingsClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            onSettingsClick?.(deck, e.currentTarget as HTMLElement);
        },
        [deck, onSettingsClick],
    );

    return (
        <div className="sr-deck-node">
            {/* 行内容 */}
            <div
                onClick={handleRowClick}
                className={`sr-deck-row ${isRecentlyReviewed ? "sr-deck-row-recent" : ""}`}
            >
                {/* 牌组名称列 */}
                <div className="sr-deck-name-col">
                    {/* 折叠箭头区域 - 固定宽度占位 */}
                    <span
                        onClick={hasChildren ? toggleCollapse : undefined}
                        className={`sr-deck-collapse-btn ${hasChildren ? (isCollapsed ? "sr-collapsed" : "sr-expanded") : "sr-no-children"}`}
                    >
                        {hasChildren && <CollapseIcon isCollapsed={isCollapsed} />}
                    </span>

                    {/* 牌组名 */}
                    <span className="sr-deck-name">{deck.deckName}</span>
                </div>

                {/* 统计数字 */}
                <div className="sr-deck-stats-group">
                    <div className={`sr-deck-stat new ${deck.newCount === 0 ? "zero" : ""}`}>
                        {deck.newCount}
                    </div>
                    <div
                        className={`sr-deck-stat learning ${deck.learningCount === 0 ? "zero" : ""}`}
                    >
                        {deck.learningCount}
                    </div>
                    <div className={`sr-deck-stat due ${deck.dueCount === 0 ? "zero" : ""}`}>
                        {deck.dueCount}
                    </div>
                </div>

                {/* 设置齿轮 */}
                <button
                    type="button"
                    onClick={handleSettingsClick}
                    className="sr-deck-settings-btn"
                    aria-label={t("DECK_TREE_OPTIONS_TITLE")}
                >
                    <SettingsIcon />
                </button>
            </div>

            {/* 子牌组容器 - 嵌套结构 + 左侧导引线 */}
            <AnimatePresence initial={false}>
                {!isCollapsed && hasChildren && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="sr-deck-children"
                    >
                        {sortedSubdecks.map((subdeck) => (
                            <DeckRow
                                key={subdeck.fullPath || subdeck.deckName}
                                deck={subdeck}
                                onDeckClick={onDeckClick}
                                onSettingsClick={onSettingsClick}
                                onCollapseChange={onCollapseChange}
                                recentDeckPath={recentDeckPath}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ==========================================
// 主容器组件
// ==========================================
interface DeckTreeProps {
    /** 牌组列表 */
    decks: DeckState[];
    /** 点击牌组回调 */
    onDeckClick?: (deck: DeckState) => void;
    /** 点击设置按钮回调 */
    onSettingsClick?: (deck: DeckState, anchorEl: HTMLElement) => void;
    /** 折叠状态变化回调 (用于持久化) */
    onCollapseChange?: (fullPath: string, isCollapsed: boolean) => void;
    onSync?: () => void;
    isSyncing?: boolean;
    recentDeckPath?: string | null;
}

export const DeckTree: React.FC<DeckTreeProps> = ({
    decks,
    onDeckClick,
    onSettingsClick,
    onCollapseChange,
    onSync,
    isSyncing = false,
    recentDeckPath,
}) => {
    // 排序：文件夹优先
    const sortedDecks = useMemo(() => sortDecksWithFoldersFirst(decks), [decks]);

    // 计算总计统计数据 (用于表头颜色控制)
    const totalStats = useMemo(() => calculateTotalStats(decks), [decks]);

    return (
        <div className="sr-deck-tree">
            <DeckHeader
                totalNew={totalStats.new}
                totalLearn={totalStats.learn}
                totalDue={totalStats.due}
                onSync={onSync}
                isSyncing={isSyncing}
            />
            <div className="sr-deck-list">
                {sortedDecks.map((deck) => (
                    <DeckRow
                        key={deck.fullPath || deck.deckName}
                        deck={deck}
                        onDeckClick={onDeckClick}
                        onSettingsClick={onSettingsClick}
                        onCollapseChange={onCollapseChange}
                        recentDeckPath={recentDeckPath}
                    />
                ))}
            </div>
        </div>
    );
};
