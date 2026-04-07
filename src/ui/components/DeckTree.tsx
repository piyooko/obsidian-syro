/** @jsxImportSource react */
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Platform } from "obsidian";
import { DeckState } from "../types/deckTypes";
import "../styles/deck-tree.css";
import { t } from "src/lang/helpers";

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

const SYNC_ICON_SPIN_DURATION_MS = 900;

const SyncIcon: React.FC<{ isSyncing?: boolean }> = ({ isSyncing = false }) => {
    const [shouldSpin, setShouldSpin] = useState(isSyncing);
    const spinStartedAtRef = useRef<number | null>(isSyncing ? Date.now() : null);

    useEffect(() => {
        if (isSyncing) {
            spinStartedAtRef.current = Date.now();
            setShouldSpin(true);
            return;
        }

        if (!shouldSpin || spinStartedAtRef.current === null) {
            setShouldSpin(false);
            spinStartedAtRef.current = null;
            return;
        }

        const elapsed = Date.now() - spinStartedAtRef.current;
        const cycleCount = Math.max(1, Math.ceil(elapsed / SYNC_ICON_SPIN_DURATION_MS));
        const remaining = cycleCount * SYNC_ICON_SPIN_DURATION_MS - elapsed;

        if (remaining <= 0) {
            setShouldSpin(false);
            spinStartedAtRef.current = null;
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setShouldSpin(false);
            spinStartedAtRef.current = null;
        }, remaining);

        return () => window.clearTimeout(timeoutId);
    }, [isSyncing, shouldSpin]);

    return (
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
            className={`sr-sync-icon ${shouldSpin ? "is-spinning" : ""}`}
        >
            <path d="M18.6 8.11A7 7 0 0 0 6.12 9" />
            <path d="M5 5v4h4" />
            <path d="M5.4 15.89A7 7 0 0 0 17.88 15" />
            <path d="M19 19v-4h-4" />
        </svg>
    );
};

// ==========================================
// ==========================================
interface DeckHeaderProps {
    totalNew: number;
    totalLearn: number;
    totalDue: number;
    onSync?: () => void;
    isSyncing?: boolean;
    compact?: boolean;
}

const DeckHeader: React.FC<DeckHeaderProps> = ({
    totalNew,
    totalLearn,
    totalDue,
    onSync,
    isSyncing = false,
    compact = false,
}) => (
    <div
        className={`sr-deck-header sr-deck-header-desktop ${compact ? "sr-deck-header-compact" : ""}`}
    >
        {compact ? (
            <div className="sr-deck-header-name sr-deck-header-name-compact">
                {onSync && (
                    <button
                        type="button"
                        className={`sr-deck-sync-btn sr-deck-sync-btn--compact-header ${isSyncing ? "is-syncing" : ""}`}
                        onClick={onSync}
                        disabled={isSyncing}
                        aria-label={t("DECK_TREE_FULL_SYNC_TITLE")}
                    >
                        <SyncIcon isSyncing={isSyncing} />
                    </button>
                )}
                <span className="sr-deck-header-name-label">DECK</span>
            </div>
        ) : (
            <div className="sr-deck-header-name">DECK</div>
        )}
        <div className={`sr-deck-header-stat new ${totalNew === 0 ? "dimmed" : ""}`}>
            {t("DECK_TREE_HEADER_NEW")}
        </div>
        <div className={`sr-deck-header-stat learning ${totalLearn === 0 ? "dimmed" : ""}`}>
            {t("DECK_TREE_HEADER_LEARN")}
        </div>
        <div className={`sr-deck-header-stat due ${totalDue === 0 ? "dimmed" : ""}`}>
            {t("DECK_TREE_HEADER_DUE")}
        </div>
        {!compact && (
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
        )}
    </div>
);

// ==========================================
// ==========================================
function calculateTotalStats(decks: DeckState[]): { new: number; learn: number; due: number } {
    const stats = { new: 0, learn: 0, due: 0 };
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
// ==========================================
function sortDecksWithFoldersFirst(decks: DeckState[]): DeckState[] {
    return [...decks].sort((a, b) => {
        const aHasChildren = a.subdecks && a.subdecks.length > 0;
        const bHasChildren = b.subdecks && b.subdecks.length > 0;

        if (aHasChildren && !bHasChildren) return -1;
        if (!aHasChildren && bHasChildren) return 1;

        return a.deckName.localeCompare(b.deckName);
    });
}

// ==========================================
// ==========================================
interface DeckRowProps {
    deck: DeckState;
    onDeckClick?: (deck: DeckState) => void;
    onSettingsClick?: (deck: DeckState, anchorEl: HTMLElement) => void;
    onCollapseChange?: (fullPath: string, isCollapsed: boolean) => void;
    onSync?: () => void;
    recentDeckPath?: string | null;
    compact?: boolean;
}

const DeckRow: React.FC<DeckRowProps> = ({
    deck,
    onDeckClick,
    onSettingsClick,
    onCollapseChange,
    recentDeckPath,
    compact = false,
}) => {
    const [isCollapsed, setIsCollapsed] = useState(deck.isCollapsed);
    const hasChildren = deck.subdecks && deck.subdecks.length > 0;
    const isRecentlyReviewed = !!recentDeckPath && deck.fullPath === recentDeckPath;

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
            <div
                onClick={compact ? undefined : handleRowClick}
                className={`sr-deck-row ${compact ? "sr-deck-row-compact" : ""} ${isRecentlyReviewed ? "sr-deck-row-recent" : ""}`}
            >
                <div
                    onClick={compact ? handleRowClick : undefined}
                    className={`sr-deck-name-col ${compact ? "sr-deck-name-col-clickable" : ""}`}
                >
                    <span
                        onClick={hasChildren ? toggleCollapse : undefined}
                        className={`sr-deck-collapse-btn ${hasChildren ? (isCollapsed ? "sr-collapsed" : "sr-expanded") : "sr-no-children"}`}
                    >
                        {hasChildren && <CollapseIcon isCollapsed={isCollapsed} />}
                    </span>

                    <span className="sr-deck-name">{deck.deckName}</span>
                </div>

                {compact ? (
                    <button
                        type="button"
                        onClick={handleSettingsClick}
                        className="sr-deck-stats-group sr-deck-stats-trigger"
                        aria-label={t("DECK_TREE_OPTIONS_TITLE")}
                    >
                        <span className={`sr-deck-stat new ${deck.newCount === 0 ? "zero" : ""}`}>
                            {deck.newCount}
                        </span>
                        <span
                            className={`sr-deck-stat learning ${deck.learningCount === 0 ? "zero" : ""}`}
                        >
                            {deck.learningCount}
                        </span>
                        <span className={`sr-deck-stat due ${deck.dueCount === 0 ? "zero" : ""}`}>
                            {deck.dueCount}
                        </span>
                    </button>
                ) : (
                    <div className="sr-deck-stats-group">
                        <span className={`sr-deck-stat new ${deck.newCount === 0 ? "zero" : ""}`}>
                            {deck.newCount}
                        </span>
                        <span
                            className={`sr-deck-stat learning ${deck.learningCount === 0 ? "zero" : ""}`}
                        >
                            {deck.learningCount}
                        </span>
                        <span className={`sr-deck-stat due ${deck.dueCount === 0 ? "zero" : ""}`}>
                            {deck.dueCount}
                        </span>
                    </div>
                )}

                {!compact && (
                    <button
                        type="button"
                        onClick={handleSettingsClick}
                        className="sr-deck-settings-btn"
                        aria-label={t("DECK_TREE_OPTIONS_TITLE")}
                    >
                        <SettingsIcon />
                    </button>
                )}
            </div>

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
                                compact={compact}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ==========================================
// ==========================================
interface DeckTreeProps {
    decks: DeckState[];
    onDeckClick?: (deck: DeckState) => void;
    onSettingsClick?: (deck: DeckState, anchorEl: HTMLElement) => void;
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
    const isPhoneLayout = Platform.isPhone;

    const sortedDecks = useMemo(() => sortDecksWithFoldersFirst(decks), [decks]);

    const totalStats = useMemo(() => calculateTotalStats(decks), [decks]);

    return (
        <div className="sr-deck-tree">
            <DeckHeader
                totalNew={totalStats.new}
                totalLearn={totalStats.learn}
                totalDue={totalStats.due}
                onSync={onSync}
                isSyncing={isSyncing}
                compact={isPhoneLayout}
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
                        compact={isPhoneLayout}
                    />
                ))}
            </div>
        </div>
    );
};
