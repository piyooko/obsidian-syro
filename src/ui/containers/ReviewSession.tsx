/** @jsxImportSource react */
/**
 * ReviewSession coordinates the deck list and the active card review pane.
 * It rebuilds isolated deck branches for focused study and refreshes on sync updates.
 */


import React, { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Component, MarkdownRenderer, Notice, Platform, TFile, type Editor } from "obsidian";
import { t } from "src/lang/helpers";
import { ReviewContext } from "../context/ReviewContext";
import { DeckOptionsPanel } from "../components/DeckOptionsPanel";
import { DeckTree } from "../components/DeckTree";
import { LinearCard, CardState } from "../components/LinearCard";
import { deckToUIState, findDeckByPath, saveCollapseState } from "../adapters/deckAdapter";
import { DeckState } from "../types/deckTypes";
import type SRPlugin from "src/main";
import { IFlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import { Deck, DeckTreeFilter, CardListType } from "src/Deck";
import { ReviewResponse, textInterval } from "src/scheduling";
import { CardType } from "src/Question";
import { TopicPath } from "src/TopicPath";
import { CardFrontBackUtil } from "src/question-type";

// ==========================================
// Types
// ==========================================

type ViewType = "deck-list" | "review";

interface ReviewSessionProps {
    plugin: SRPlugin;
    sequencer: IFlashcardReviewSequencer;
    initialView?: ViewType;
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

// Rebuild the ancestor chain for an isolated deck so the sequencer keeps the original path.
function wrapDeckWithRoot(fullPath: string, isolatedDeck: Deck): Deck {
    const root = new Deck("Root", null);
    if (!fullPath || fullPath === "root") {
        return isolatedDeck;
    }

    const parts = fullPath.split("/").filter(Boolean);
    let current = root;

    // Rebuild ancestor nodes from the original deck path.
    for (let i = 0; i < parts.length - 1; i++) {
        const node = new Deck(parts[i], current);
        current.subdecks.push(node);
        current = node;
    }

    // Attach the filtered deck under the reconstructed parent chain.
    isolatedDeck.parent = current;
    current.subdecks.push(isolatedDeck);

    return root;
}

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

// ==========================================
// Review session
// ==========================================

export const ReviewSession: React.FC<ReviewSessionProps> = ({
    plugin,
    sequencer,
    initialView = "deck-list",
    onClose,
}) => {
    // View state
    const [view, setView] = useState<ViewType>(initialView);
    const [direction, setDirection] = useState(0); // 1 = Push, -1 = Pop
    const [tick, setTick] = useState(0); // Force rerenders after sync or deck updates.
    const [recentDeckPath, setRecentDeckPath] = useState<string | null>(null);
    const deckListScrollTopRef = useRef(0);

    const logRuntimeDebug = useCallback(
        (...args: unknown[]) => {
            if (plugin.data.settings.showRuntimeDebugMessages) {
                console.debug(...args);
            }
        },
        [plugin],
    );

    const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

    // Refresh when sync or deck stats change underneath the current view.
    useEffect(() => {
        logRuntimeDebug("[SR-DynSync] ReviewSession: subscribed to sync-complete & deck-stats-updated");

        const onSyncComplete = () => {
            logRuntimeDebug("[SR-DynSync] ReviewSession: sync-complete received");
            forceUpdate();
        };

        const onStatsUpdated = () => {
            forceUpdate();
        };

        const unsubSync = plugin.syncEvents.on("sync-complete", onSyncComplete);
        const unsubStats = plugin.syncEvents.on("deck-stats-updated", onStatsUpdated);

        return () => {
            logRuntimeDebug("[SR-DynSync] ReviewSession: unsubscribed from sync events");
            unsubSync();
            unsubStats();
        };
    }, [plugin, forceUpdate, logRuntimeDebug]);

    useEffect(() => {
        logRuntimeDebug(`[SR-DynSync] ReviewSession: tick=${tick}`);
    }, [tick, logRuntimeDebug]);
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
            const latestRemainingTree = plugin.remainingDeckTree;
            const latestFullTree = plugin.deckTree;

            const fullPath = deckState.fullPath || deckState.deckName;
            // Find the clicked deck in the latest remaining tree.
            const rawClickedDeck = findDeckByPath(latestRemainingTree, fullPath);

            if (rawClickedDeck) {
                // Reapply daily limits to the isolated branch.
                const isolatedContextDeck = DeckTreeFilter.filterByDailyLimits(
                    rawClickedDeck,
                    plugin,
                );

                // Rebuild the ancestor chain so the sequencer keeps the original path.
                const wrappedDeckTree = wrapDeckWithRoot(fullPath, isolatedContextDeck);

                // Swap the sequencer to the wrapped deck tree.
                sequencer.setDeckTree(latestFullTree, wrappedDeckTree, latestRemainingTree);
                sequencer.setCurrentDeck(TopicPath.emptyPath);

                logRuntimeDebug(`[V3-Scheduler] Clicked Deck: ${fullPath}, isolated new=${isolatedContextDeck.getCardCount(CardListType.NewCard, true)}, due=${isolatedContextDeck.getCardCount(CardListType.DueCard, true)}`);


                if (sequencer.hasCurrentCard) {
                    setRecentDeckPath(fullPath);
                    setDirection(1);
                    setView("review");
                } else {
                    new Notice(t("REVIEW_NO_CARDS"));
                }
            }
        },
        [sequencer, plugin, logRuntimeDebug],
    );

    // Return from card review to the deck list.
    const handleExitReview = useCallback(() => {
        plugin.setSRViewInFocus(false);
        setDirection(-1);
        setView("deck-list");
        void plugin.savePluginData();
        forceUpdate(); // Refresh deck counts after leaving review.
    }, [plugin, forceUpdate]);

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

            try {
                logRuntimeDebug("[SR-DynSync] ReviewSession: calling sequencer.processReview");
                await sequencer.processReview(responseMap[rating] ?? ReviewResponse.Good);
                logRuntimeDebug("[SR-DynSync] ReviewSession: sequencer.processReview completed");
            } catch (e) {
                console.error("[SR] processReview 鐎殿喖鍊搁悥?", e);
            }

            if (sequencer.hasCurrentCard) {
                logRuntimeDebug("[SR-DynSync] ReviewSession: current card remains, forceUpdate");
                forceUpdate();
            } else {
                logRuntimeDebug("[SR-DynSync] ReviewSession: sequencer exhausted, exiting review");
                handleExitReview();
            }
        },
        [sequencer, forceUpdate, handleExitReview, logRuntimeDebug],
    );


    const handleUndo = useCallback(async () => {
        if (!sequencer.canUndo) {
            new Notice(t("REVIEW_NO_UNDO"));
            return;
        }
        await sequencer.undoReview();
        forceUpdate();
    }, [sequencer, forceUpdate]);

    // Remove the current card from tracking and leave review if nothing remains.
    const handleDelete = useCallback(async () => {
        await sequencer.untrackCurrentCard();
        if (sequencer.hasCurrentCard) {
            forceUpdate();
        } else {
            handleExitReview();
        }
    }, [sequencer, forceUpdate, handleExitReview]);

    // Persist tree collapse changes.
    const handleCollapseChange = useCallback(
        (fullPath: string, isCollapsed: boolean) => {
            void saveCollapseState(plugin, fullPath, isCollapsed);
        },
        [plugin],
    );

    const isMobile = Platform.isMobile;

    // Use the simpler mobile animation set on phones and tablets.
    const activeVariants = isMobile ? mobileSlideVariants : slideVariants;

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
                            <CardReviewView
                                sequencer={sequencer}
                                plugin={plugin}
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
                            />
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

interface OpenDeckOptionsState {
    deckName: string;
    deckPath: string;
}


const DeckListView: React.FC<DeckListViewProps> = ({
    sequencer,
    plugin,
    onDeckClick,
    onCollapseChange,
    tick,
    recentDeckPath,
    initialScrollTop,
    onScrollTopChange,
}) => {
    const panelHostRef = useRef<HTMLDivElement>(null);
    const treeHostRef = useRef<HTMLDivElement>(null);
    const treeShellRef = useRef<HTMLDivElement>(null);
    const [openDeckOptions, setOpenDeckOptions] = useState<OpenDeckOptionsState | null>(null);
    const [isSyncing, setIsSyncing] = useState(plugin.syncLock);
    const initialTreeWidth = Number(plugin.data.settings.reactDeckTreeWidth ?? 860);
    const [treeWidth, setTreeWidth] = useState(initialTreeWidth);

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

        const result = remainingDeckTree.subdecks.map((deck: Deck) => deckToUIState(deck, plugin));
        if (plugin.data.settings.showRuntimeDebugMessages) {
            console.debug(`[V3-Scheduler] DeckListView render: tick=${tick}, decks=${result.length}`);
        }
        return result;
    }, [plugin.remainingDeckTree, plugin, tick]);

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

    const handleDeckSettingsClick = useCallback((deck: DeckState, _anchorEl: HTMLElement) => {
        setOpenDeckOptions({
            deckName: deck.deckName,
            deckPath: deck.fullPath || deck.deckName,
        });
    }, []);

    const handleTreeScroll = useCallback(() => {
        const host = treeHostRef.current;
        if (!host) return;
        onScrollTopChange(host.scrollTop);
    }, [onScrollTopChange]);

    const handleTreeResizeStart = useCallback(
        (event: React.MouseEvent | React.TouchEvent, direction: "w" | "e") => {
            event.preventDefault();
            event.stopPropagation();

            const host = treeHostRef.current;
            const shell = treeShellRef.current;
            if (!host || !shell) return;

            const isTouchEvent = "touches" in event;
            const startX = isTouchEvent ? event.touches[0].clientX : event.clientX;
            const startWidth = shell.offsetWidth || treeWidth;
            const minWidth = 320;
            const hostStyles = window.getComputedStyle(host);
            const hostPadding =
                parseFloat(hostStyles.paddingLeft || "0") + parseFloat(hostStyles.paddingRight || "0");
            const maxWidth = Math.max(minWidth, host.clientWidth - hostPadding);

            let currentWidth = startWidth;
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
        [plugin, treeWidth],
    );

    return (
        <div
            className="sr-deck-list-view"
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
                    style={{ width: `min(100%, ${treeWidth}px)` }}
                >
                    <div
                        className="sr-deck-tree-resize-handle sr-deck-tree-resize-handle--left"
                        onMouseDown={(e) => handleTreeResizeStart(e, "w")}
                        onTouchStart={(e) => handleTreeResizeStart(e, "w")}
                    />
                    <DeckTree
                        decks={decks}
                        onDeckClick={onDeckClick}
                        onSettingsClick={handleDeckSettingsClick}
                        onCollapseChange={onCollapseChange}
                        onSync={handleSync}
                        isSyncing={isSyncing}
                        recentDeckPath={recentDeckPath}
                    />
                    <div
                        className="sr-deck-tree-resize-handle sr-deck-tree-resize-handle--right"
                        onMouseDown={(e) => handleTreeResizeStart(e, "e")}
                        onTouchStart={(e) => handleTreeResizeStart(e, "e")}
                    />
                </div>
            </div>
            {openDeckOptions && (
                <DeckOptionsPanel
                    plugin={plugin}
                    deckName={openDeckOptions.deckName}
                    deckPath={openDeckOptions.deckPath}
                    containerElement={panelHostRef.current}
                    preferredWidth={Math.min(treeWidth, 760)}
                    onClose={() => setOpenDeckOptions(null)}
                    onSaved={() => {
                        if (plugin.data.settings.showRuntimeDebugMessages) {
                            console.debug("[ReviewSession] DeckOptions saved");
                        }
                    }}
                />
            )}
        </div>
    );
};

// ==========================================
// ?????????Card Review
// ==========================================

interface CardReviewViewProps {
    sequencer: IFlashcardReviewSequencer;
    plugin: SRPlugin;
    onAnswer: (rating: number) => void;
    onUndo: () => void;
    onDelete: () => void;
    onExit: () => void;
    tick: number;
}

const CardReviewView: React.FC<CardReviewViewProps> = ({
    sequencer,
    plugin,
    onAnswer,
    onUndo,
    onDelete,
    onExit,
    tick,
}) => {
    const markdownOwnerRef = useRef<Component | null>(null);
    const card = sequencer.currentCard;
    const question = sequencer.currentQuestion;
    const deck = sequencer.currentDeck;

    useEffect(() => {
        const owner = new Component();
        owner.load();
        markdownOwnerRef.current = owner;

        return () => {
            markdownOwnerRef.current = null;
            owner.unload();
        };
    }, []);

    // Guard against transient empty state while the sequencer updates.
    if (!card || !question || !deck) {
        return null;
    }

    const settings = plugin.data.settings;

    // Compute intervals for each response button using the current scheduling state.
    const intervals = [
        sequencer.determineCardSchedule(ReviewResponse.Reset, card).interval,
        sequencer.determineCardSchedule(ReviewResponse.Hard, card).interval,
        sequencer.determineCardSchedule(ReviewResponse.Good, card).interval,
        sequencer.determineCardSchedule(ReviewResponse.Easy, card).interval,
    ];

    // Convert intervals to button labels such as "1m" or "3d".
    const btnLabels = intervals.map((interval) => textInterval(interval, false));

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
    let front = expanded[cardIdx]?.front || "";
    let back = expanded[cardIdx]?.back || "";

    const cardState: CardState = {
        front,
        back,
        responseButtonLabels: btnLabels,
    };

    // Pull deck stats for the current topic path.
    const topicPath = deck.getTopicPath();
    const stats = sequencer.getDeckStats(topicPath);
    if (settings.showRuntimeDebugMessages) {
        console.debug(
            `[DEBUG_REVIEW_UI] Card Review UI counters for deck '${deck.deckName}' -> New: ${stats.newCount}, Learning: ${stats.learningCount}, Due: ${stats.dueCount}`,
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
    const breadcrumbs: string[] = question.questionContext || [];
    const filename = question.note?.file?.basename || "Unknown";

    // Read the active deck preset to decide auto-advance timing.
    const deckPath = deck.getTopicPath().path.join("/") || deck.deckName;
    const presetIndex = settings.deckPresetAssignment[deckPath] ?? 0;
    const preset = settings.deckOptionsPresets[presetIndex] || settings.deckOptionsPresets[0];
    const autoAdvanceSeconds = preset?.autoAdvance ? preset.autoAdvanceSeconds || 10 : 0;

    // Collect extra debug data for the review UI when needed.
    const getDebugInfo = () => {
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
            },
            data: item.data || {},
            trace: card.debugTrace || [],
        };
    };

    // Open the source note and focus the reviewed line in the editor.
    const handleOpenNote = async () => {
        const noteFile = resolveNoteFile(question.note?.file);
        if (!noteFile) return;

        const activeLeaf = plugin.app.workspace.getLeaf("tab");
        await activeLeaf.openFile(noteFile);

        // Give Obsidian time to finish opening the file before touching the editor.
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (hasEditor(activeLeaf.view)) {
            const editor = activeLeaf.view.editor;
            const lineNo = question.lineNo;

            // Highlight the reviewed line.
            const lineContent = editor.getLine(lineNo) || "";
            const from = { line: lineNo, ch: 0 };
            const to = { line: lineNo, ch: lineContent.length };

            // Move the cursor first so the editor focuses the reviewed line.
            editor.setCursor(from);

            // Center the reviewed line with the typed Obsidian editor API.
            editor.scrollIntoView({ from, to }, true);

            // Highlight the line after scrolling to it.
            editor.setSelection(from, to);

            // Restore a clean cursor after the highlight has been visible for a moment.
            setTimeout(() => {
                editor.setCursor(from);
            }, 1500);
        }
    };

    // Postpone the current card without opening the note.
    const handlePostpone = () => {
        new Notice(t("REVIEW_POSTPONED"));
        onAnswer(0);
    };

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
                stats={{
                    new: stats.newCount,
                    learning: stats.learningCount,
                    due: stats.dueCount,
                }}
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
                onAnswer={onAnswer}
                onShowAnswer={() => {}}
                onUndo={onUndo}
                onOpenNote={() => {
                    void handleOpenNote();
                }}
                onEditCard={() => {}}
                onPostpone={handlePostpone}
                onDelete={onDelete}
                onExit={onExit}
                onResize={handleResize}
                renderMarkdown={(text, el) => {
                    const sourcePath = question.note?.file?.path || "";
                    const owner = markdownOwnerRef.current;
                    if (!owner) {
                        return Promise.resolve();
                    }

                    return MarkdownRenderer.render(plugin.app, text, el, sourcePath, owner);
                }}
                width={settings.reactFlashcardWidth}
                height={settings.reactFlashcardHeight}
                debugInfo={getDebugInfo()}
                isMobile={Platform.isMobile}
                plugin={plugin}
                rawContent={question.questionText?.actualQuestion || ""}
                onUpdateContent={(text) => {
                    void sequencer.updateCurrentQuestionText(text);
                }}
            />
        </div>
    );
};

