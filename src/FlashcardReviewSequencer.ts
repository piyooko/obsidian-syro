/**
 * 这个文件主要是干什么的：
 * [核心] 复习流程的总导演 (Sequencer)。
 * 它连接了 UI、数据存储算法和调度逻辑。负责处理用户对卡片的评分（Easy/Good/Hard），执行撤销操作，管理学习队列 (Learning Queue)，并更新卡片数据。
 *
 * 它在项目中属于：控制器/核心逻辑 (Controller/Core Logic)
 *
 * 它会用到哪些文件：
 * 1. src/DeckTreeIterator.ts (获取下一张卡)
 * 2. src/CardSchedule.ts (计算调度)
 * 3. src/dataStore/data.ts (持久化复习结果)
 * 4. src/algorithms/*.ts (FSRS/Anki 算法)
 *
 * 哪些文件会用到它：
 * 1. src/main.ts (插件主入口，初始化和管理复习)
 * 2. src/ui/views/FlashcardModal.tsx (复习弹窗)
 * 3. src/ui/views/reviewView.ts (旧版复习视图)
 * 4. src/ui/ReactReviewApp.tsx (React 复习应用入口)
 * 5. src/ui/containers/ReviewSession.tsx (复习会话容器)
 */
/**
 * [控制器/核心] 复习流程的总导演。连接 UI、算法和数据，处理用户评分、撤销、跳过等操作。
 */
import { Card } from "./Card";
import { CardListType, Deck } from "./Deck";
import { Question, QuestionText } from "./Question";
import { ReviewResponse, parseSteps, FlashcardReviewMode } from "./scheduling";
import { SRSettings, DEFAULT_DECK_OPTIONS_PRESET } from "./settings";
import { TopicPath } from "./TopicPath";
import { CardScheduleInfo, ICardScheduleCalculator, NoteCardScheduleParser } from "./CardSchedule";
import { Note } from "./Note";
import { IDeckTreeIterator } from "./DeckTreeIterator";
import { IQuestionPostponementList } from "./QuestionPostponementList";
import { DataStore } from "./dataStore/data";
import { DataLocation } from "./dataStore/dataLocation";
import { RPITEMTYPE, CardQueue } from "./dataStore/repetitionItem";
import { Notice } from "obsidian";
import SRPlugin, { LearningQueueItem } from "./main";
import { FsrsData } from "./algorithms/fsrs";
import { DeckStatsService } from "./dataStore/deckStatsService";
interface ReviewHistoryItem {
    card: Card;
    initialSchedule: CardScheduleInfo | null;
    originalDeck: Deck;
    wasNew: boolean;
    previousListType: CardListType;
    fromLearningQueue: boolean;
    itemSnapshot?: any;
    learningStepSnapshot?: number;
}

export class DeckStats {
    dueCount: number;
    newCount: number;
    totalCount: number;
    learningCount: number;

    constructor(dueCount: number, newCount: number, totalCount: number, learningCount: number = 0) {
        this.dueCount = dueCount;
        this.newCount = newCount;
        this.totalCount = totalCount;
        this.learningCount = learningCount;
    }
}

export { FlashcardReviewMode };

export interface IFlashcardReviewSequencer {
    get hasCurrentCard(): boolean;
    get isCurrentCardFromLearningQueue(): boolean;
    get isLearning(): boolean; // 别名，用于UI判断当前卡片是否来自学习队列
    get currentCard(): Card;
    get currentQuestion(): Question;
    get currentNote(): Note;
    get currentDeck(): Deck;
    get originalDeckTree(): Deck;
    get canUndo(): boolean;
    get nextWaitTime(): number | null;

    setDeckTree(
        originalDeckTree: Deck,
        isolatedContextDeck: Deck,
        globalRemainingDeckTree?: Deck,
    ): void;
    setCurrentDeck(topicPath: TopicPath): void;
    getDeckStats(topicPath: TopicPath): DeckStats;
    skipCurrentCard(): void;
    determineCardSchedule(response: ReviewResponse, card: Card): CardScheduleInfo;
    processReview(response: ReviewResponse): Promise<void>;
    updateCurrentQuestionText(text: string): Promise<void>;
    undoReview(): Promise<void>;
    untrackCurrentCard(): Promise<void>;
}

export class FlashcardReviewSequencer implements IFlashcardReviewSequencer {
    private _originalDeckTree: Deck;
    private remainingDeckTree: Deck; // This holds isolatedContextDeck during reviews
    private globalRemainingDeckTree?: Deck; // Optional global reference to sync deletes
    private reviewMode: FlashcardReviewMode;
    private cardSequencer: IDeckTreeIterator;
    private settings: SRSettings;
    private cardScheduleCalculator: ICardScheduleCalculator;
    private questionPostponementList: IQuestionPostponementList;
    private history: ReviewHistoryItem[] = [];

    private _currentCard: Card | null = null;
    private _isLearning: boolean = false;
    private _nextWaitTime: number | null = null;
    private shouldLogRuntimeDebug(): boolean {
        return this.settings.showRuntimeDebugMessages;
    }

    private logRuntimeDebug(...args: unknown[]): void {
        if (this.shouldLogRuntimeDebug()) {
            console.log(...args);
        }
    }
    private _selectedTopicPath: TopicPath = TopicPath.emptyPath; // 保存用户选择的卡组路径

    constructor(
        reviewMode: FlashcardReviewMode,
        cardSequencer: IDeckTreeIterator,
        settings: SRSettings,
        cardScheduleCalculator: ICardScheduleCalculator,
        questionPostponementList: IQuestionPostponementList,
    ) {
        this.reviewMode = reviewMode;
        this.cardSequencer = cardSequencer;
        this.settings = settings;
        this.cardScheduleCalculator = cardScheduleCalculator;
        this.questionPostponementList = questionPostponementList;
    }

    get canUndo(): boolean {
        return this.history.length > 0;
    }
    get hasCurrentCard(): boolean {
        return this._currentCard != null;
    }
    get isCurrentCardFromLearningQueue(): boolean {
        return this._isLearning;
    }
    get isLearning(): boolean {
        return this._isLearning;
    } // UI 使用
    get currentCard(): Card {
        return this._currentCard;
    }
    get currentQuestion(): Question {
        return this._currentCard?.question;
    }
    get currentNote(): Note {
        return this.currentQuestion?.note;
    }
    get nextWaitTime(): number | null {
        return this._nextWaitTime;
    }
    get originalDeckTree(): Deck {
        return this._originalDeckTree;
    }

    get currentDeck(): Deck {
        if (this.cardSequencer.currentDeck) return this.cardSequencer.currentDeck;
        if (this._currentCard) {
            const path = this._currentCard.question?.topicPathList?.list[0];
            if (path)
                return this.remainingDeckTree.getDeck(path) || this._originalDeckTree.getDeck(path);
        }

        // [修复] 如果迭代器和当前卡片都无法提供牌组上下文，
        // 则必须回退到用户选定的卡组路径，而不是直接回退到根节点。
        // 这确保护了学习队列在 advanceToNextCard 时只扫描当前选定的卡组。
        if (this._selectedTopicPath && !this._selectedTopicPath.isEmptyPath) {
            return this.remainingDeckTree.getDeck(this._selectedTopicPath);
        }

        return this.remainingDeckTree;
    }

    setDeckTree(
        originalDeckTree: Deck,
        isolatedContextDeck: Deck,
        globalRemainingDeckTree?: Deck,
    ): void {
        this.cardSequencer.setBaseDeck(isolatedContextDeck);
        this._originalDeckTree = originalDeckTree;
        this.remainingDeckTree = isolatedContextDeck;
        this.globalRemainingDeckTree = globalRemainingDeckTree;
        this.setCurrentDeck(TopicPath.emptyPath);
    }

    setCurrentDeck(topicPath: TopicPath): void {
        this._selectedTopicPath = topicPath; // 保存用户选择的卡组路径
        this.cardSequencer.setIteratorTopicPath(topicPath);
        this.advanceToNextCard();
    }

    /**
     * 获取牌组统计（使用 DeckStatsService 事件驱动模式）
     *
     * 通过 DeckStatsService 读取统计数据。每次复习后 processReview_ReviewMode 会调用
     * DeckStatsService.recalculateDeck()，后者会触发 "deck-stats-updated" 事件，
     * 从而驱动 ReviewSession 的 forceUpdate() → tick++ → UI 重渲染。
     * 这条事件链是复习界面计数器动态更新的唯一通路，不能绕过。
     */
    getDeckStats(topicPath: TopicPath): DeckStats {
        const deck = topicPath.isEmptyPath
            ? this.remainingDeckTree
            : this.remainingDeckTree.getDeck(topicPath);

        if (!deck) {
            return new DeckStats(0, 0, 0, 0);
        }

        const newCount = deck.getDistinctCardCount(CardListType.NewCard, true);
        const dueCount = deck.getDistinctCardCount(CardListType.DueCard, true);
        const learningCount = deck.getDistinctCardCount(CardListType.LearningCard, true);

        return new DeckStats(
            dueCount,
            newCount,
            newCount + dueCount + learningCount,
            learningCount,
        );
    }

    skipCurrentCard(): void {
        if (!this._isLearning) {
            this.cardSequencer.deleteCurrentQuestionFromAllDecks();
        }
        this.advanceToNextCard();
    }

    // ============================================================
    // 核心逻辑：获取下一张卡片 (增加卡组过滤)
    // ============================================================
    private advanceToNextCard(): void {
        this._currentCard = null;
        this._isLearning = false;
        this._nextWaitTime = null;

        const now = Date.now();
        const learnAheadTime = this.settings.learnAheadMinutes * 60 * 1000;

        // 1. 获取当前牌组及其所有子牌组中的学习中卡片
        const validLearningCards = this.currentDeck.getFlattenedCardArray(
            CardListType.LearningCard,
            true,
        );

        // 2. 将它们格式化为带有 dueTime 的对象以便排序
        const validLearningItems = validLearningCards.map((card) => {
            return {
                card: card,
                dueTime: card.repetitionItem?.nextReview || 0,
            };
        });

        validLearningItems.sort((a, b) => a.dueTime - b.dueTime);

        // 3. 检查 Strictly Due (到期时间 <= Now)
        if (validLearningItems.length > 0 && validLearningItems[0].dueTime <= now) {
            this.logRuntimeDebug(
                `[SR-Debug] advanceToNextCard: Next is Leanring Card (Strictly due), ID=${validLearningItems[0].card.Id}, dueTime=${new Date(validLearningItems[0].dueTime).toISOString()}`,
            );
            this.setLearningCardAsCurrent(validLearningItems[0]);
            return;
        }

        // 4. 检查 Main Queue
        if (this.cardSequencer.hasCurrentCard) {
            this._currentCard = this.cardSequencer.currentCard;
            return;
        }

        const nextResult = this.cardSequencer.nextCard();
        if (nextResult) {
            this.logRuntimeDebug(
                `[SR-Debug] advanceToNextCard: Next is Main Queue Card, ID=${this.cardSequencer.currentCard.Id}, isDue=${this.cardSequencer.currentCard.isDue}, isNew=${this.cardSequencer.currentCard.isNew}`,
            );
            this._currentCard = this.cardSequencer.currentCard;
            return;
        }

        // 5. 检查 Learn Ahead
        if (validLearningItems.length > 0) {
            const firstItem = validLearningItems[0];
            const timeLeft = firstItem.dueTime - now;

            if (timeLeft <= learnAheadTime) {
                this.setLearningCardAsCurrent(firstItem);
                return;
            } else {
                this._nextWaitTime = Math.ceil(timeLeft / 1000);
                return;
            }
        }
    }

    private setLearningCardAsCurrent(item: { card: Card; dueTime: number }) {
        this._currentCard = item.card;
        this._isLearning = true;
    }

    // ============================================================
    // 核心逻辑：处理复习
    // ============================================================
    async processReview(response: ReviewResponse): Promise<void> {
        this.logRuntimeDebug(`[SR-DynSync] sequencer.processReview: 响应=${ReviewResponse[response]}`);
        const card = this.currentCard;
        if (!card) {
            console.error("[SR] processReview called but currentCard is null");
            return;
        }
        const store = DataStore.getInstance();
        const item = store.getItembyID(card.Id);

        if (this.settings.enableCardLevelTrace) {
            card.addDebugLog("Scheduler", "收到评级响应", {
                response: ReviewResponse[response],
                wasNew: card.isNew,
                isLearning: this._isLearning,
                itemId: item?.ID,
                currentStep: item?.learningStep,
            });
        }
        this.logRuntimeDebug(
            `[SR-Debug] processReview: ID=${card.Id}, isLearning=${this._isLearning}, response=${ReviewResponse[response]}, currentStep=${item?.learningStep}`,
        );

        // 记录历史
        const historyItem: ReviewHistoryItem = {
            card: card,
            initialSchedule:
                card.hasSchedule && card.scheduleInfo
                    ? ({
                          dueDate: card.scheduleInfo.dueDate?.valueOf(),
                          interval: card.scheduleInfo.interval,
                          ease: card.scheduleInfo.ease,
                          delayBeforeReviewTicks: card.scheduleInfo.delayBeforeReviewTicks,
                      } as any)
                    : null,
            originalDeck: this.currentDeck,
            wasNew: card.isNew,
            previousListType: this._isLearning ? CardListType.LearningCard : card.cardListType,
            fromLearningQueue: this._isLearning,
            learningStepSnapshot: item?.learningStep,
        };
        if (item) {
            historyItem.itemSnapshot = {
                timesReviewed: item.timesReviewed,
                timesCorrect: item.timesCorrect,
                errorStreak: item.errorStreak,
                nextReview: item.nextReview,
                queue: item.queue,
                data: JSON.parse(JSON.stringify(item.data)),
            };
        }
        this.history.push(historyItem);

        // 计数
        if (this.reviewMode === FlashcardReviewMode.Review && !this._isLearning) {
            const plugin = SRPlugin.getInstance();
            const deckName = card.question.topicPathList?.list[0]?.path.join("/") || "default";
            await plugin.incrementDailyCounts(deckName, historyItem.wasNew);
        }

        if (this.reviewMode === FlashcardReviewMode.Review) {
            await this.processReview_ReviewMode(response, item);
        } else {
            await this.processReview_CramMode(response);
        }
        this.logRuntimeDebug(`[SR-DynSync] sequencer.processReview: 处理完成`);
    }

    async processReview_ReviewMode(response: ReviewResponse, item: any): Promise<void> {
        const card = this.currentCard;
        const store = DataStore.getInstance();
        const currentStep = item?.learningStep ?? 0;

        const deckPath =
            this.currentDeck?.getTopicPath().path.join("/") ||
            this.currentDeck?.deckName ||
            "default";
        const presetIndex = this.settings.deckPresetAssignment?.[deckPath] ?? 0;
        const preset =
            this.settings.deckOptionsPresets?.[presetIndex] || DEFAULT_DECK_OPTIONS_PRESET;
        const learningSteps = parseSteps(preset.learningSteps);
        const lapseSteps = parseSteps(preset.lapseSteps);

        const isReviewCard = card.cardListType === CardListType.DueCard && !this._isLearning;
        const isInLearningPhase = item?.learningStep !== undefined && item?.learningStep !== null;

        let steps = learningSteps;
        if (isReviewCard && response === ReviewResponse.Reset) {
            steps = lapseSteps;
        } else if (isInLearningPhase) {
            steps = learningSteps;
        }

        // FSRS 更新状态
        this._processReviewbyAlgo(response);

        let nextStep: number | null = currentStep;
        let nextIntervalMinutes: number = 0;
        let isGraduated = false;

        if (isReviewCard && !isInLearningPhase) {
            if (response === ReviewResponse.Reset) {
                nextStep = 0;
                nextIntervalMinutes = lapseSteps[0] || 1;
            } else {
                isGraduated = true;
            }
        } else {
            if (response === ReviewResponse.Reset) {
                nextStep = 0;
                nextIntervalMinutes = steps[0] || 1;
            } else if (response === ReviewResponse.Hard) {
                nextStep = currentStep;
                nextIntervalMinutes = steps[currentStep] || 1;
            } else if (response === ReviewResponse.Good) {
                nextStep = currentStep + 1;
                if (nextStep >= steps.length) {
                    isGraduated = true;
                } else {
                    nextIntervalMinutes = steps[nextStep];
                }
            } else if (response === ReviewResponse.Easy) {
                isGraduated = true;
            }
        }

        if (!isGraduated) {
            // === Stay in Learning ===
            if (item) {
                item.queue = CardQueue.Learn;
                item.learningStep = nextStep;
            }
            if (item?.isFsrs) (item.data as FsrsData).scheduled_days = nextIntervalMinutes / 1440;

            if (nextIntervalMinutes < 1440) {
                // < 1天，Intraday
                const dueTime = Date.now() + nextIntervalMinutes * 60 * 1000;
                const cardDeckName =
                    card.question?.topicPathList?.list[0]?.formatAsTag() ||
                    this.currentDeck?.getTopicPath().formatAsTag() ||
                    "default";

                const plugin = SRPlugin.getInstance();
                if (item) {
                    plugin.cardAlgorithm.onSelection(
                        item,
                        plugin.cardAlgorithm.srsOptions()[response],
                        plugin.data.settings.repeatItems,
                    );
                } else {
                    console.warn("[SR] item is null, skipping cardAlgorithm.onSelection");
                }

                // [修复] 无论之前是否已经是学习中，都要强制检查并加入 Deck 的 learningFlashcards 列表
                // 这解决了 UI 计数器可能与实际状态（全局队列）不同步的问题
                const deck = this.findDeckForCard(card);

                if (!this._isLearning) {
                    this.cardSequencer.deleteCurrentCardFromAllDecks();
                }

                if (deck) {
                    const newIdx = deck.newFlashcards.indexOf(card);
                    if (newIdx !== -1) {
                        deck.newFlashcards.splice(newIdx, 1);
                    }
                    // 核心修复点：即使 _isLearning 为 true，如果它不在列表里（比如因为之前的数据不一致），也要加进去
                    // 如果还在学习阶段，重新放入 learningFlashcards 列表
                    if (nextStep !== null) {
                        this.logRuntimeDebug(
                            `[SR-Debug] processReview: Card ID=${card.Id} remains in learning phase (Step ${nextStep}), nextReview=${new Date(item.nextReview).toISOString()}`,
                        );
                        // Ensure the card is in the learningFlashcards list if it's still learning
                        if (!deck.learningFlashcards.includes(card)) {
                            deck.learningFlashcards.push(card);
                        }
                    } else {
                        this.logRuntimeDebug(
                            `[SR-Debug] processReview: Card ID=${card.Id} graduated from learning phase`,
                        );
                        // If graduated, remove from learningFlashcards if present
                        const learningIdx = deck.learningFlashcards.indexOf(card);
                        if (learningIdx !== -1) {
                            deck.learningFlashcards.splice(learningIdx, 1);
                        }
                    }
                }
                await store.saveReviewItemDelta(item);
                this.syncGlobalRemainingDeckTree(card, nextStep !== null);
            } else {
                if (item) {
                    item.queue = CardQueue.Review;
                    item.learningStep = undefined;
                    item.nextReview = Date.now() + nextIntervalMinutes * 60 * 1000;
                }
                card.scheduleInfo = NoteCardScheduleParser.createInfo_algo(
                    item?.getSched() ?? null,
                );

                await store.saveReviewItemDelta(item);
                if (!this._isLearning) this.cardSequencer.deleteCurrentCardFromAllDecks();

                const deck = this.findDeckForCard(card);
                if (deck) deck.removeCard(card);
                this.syncGlobalRemainingDeckTree(card, false);
            }
        } else {
            // === Graduate ===
            if (item) {
                item.queue = CardQueue.Review;
                item.learningStep = undefined;
            }

            card.scheduleInfo = NoteCardScheduleParser.createInfo_algo(item?.getSched() ?? null);
            if (this.settings.dataLocation === DataLocation.SaveOnNoteFile) {
                await card.question.writeQuestion(this.settings);
            }
            await store.saveReviewItemDelta(item);

            if (!this._isLearning) this.cardSequencer.deleteCurrentCardFromAllDecks();
            const deck = this.findDeckForCard(card);
            if (deck) deck.removeCard(card);
            this.syncGlobalRemainingDeckTree(card, false);
        }

        if (this._isLearning) this._currentCard = null;

        // [核心修复] 必须重新计算该卡片真正所属的牌组的统计
        const deckToRecalc = this.findDeckForCard(card) || this.currentDeck;
        this.logRuntimeDebug(
            `[SR-DynSync] processReview_ReviewMode: 准备为牌组 [${deckToRecalc?.deckName}] 重新计算统计`,
        );
        DeckStatsService.getInstance().recalculateDeck(deckToRecalc);

        this.advanceToNextCard();
    }

    private findDeckForCard(card: Card): Deck | null {
        if (card.question?.topicPathList?.list.length > 0) {
            return this.remainingDeckTree.getDeck(card.question.topicPathList.list[0]);
        }
        return null;
    }

    private syncGlobalRemainingDeckTree(card: Card, isStayingInLearning: boolean) {
        if (!this.globalRemainingDeckTree) return;

        // Remove from all old locations in the global tree
        this.globalRemainingDeckTree.deleteCardFromAllDecks(card, false);

        // If it stays in learning for today, push to learningFlashcards
        if (isStayingInLearning) {
            const topicPath =
                card.question?.topicPathList?.list[0] || this.currentDeck?.getTopicPath();
            if (topicPath) {
                const globalDeck = this.globalRemainingDeckTree.getDeck(topicPath);
                if (globalDeck && !globalDeck.learningFlashcards.includes(card)) {
                    globalDeck.learningFlashcards.push(card);
                }
            }
        }
    }

    private restoreGlobalRemainingDeckTree(card: Card, historyItem: ReviewHistoryItem) {
        if (!this.globalRemainingDeckTree) return;

        this.globalRemainingDeckTree.deleteCardFromAllDecks(card, false);

        const topicPath =
            card.question?.topicPathList?.list[0] || historyItem.originalDeck?.getTopicPath();
        if (!topicPath) return;

        const globalDeck = this.globalRemainingDeckTree.getDeck(topicPath);
        if (!globalDeck) return;

        if (historyItem.fromLearningQueue) {
            globalDeck.learningFlashcards.unshift(card);
        } else if (historyItem.wasNew) {
            globalDeck.newFlashcards.unshift(card);
        } else {
            globalDeck.dueFlashcards.unshift(card);
        }
    }

    private _processReviewbyAlgo(response: ReviewResponse) {
        const store = DataStore.getInstance();
        const item = store.getItembyID(this.currentCard.Id);

        // 防御：如果 DataStore 中找不到该卡片的 item，跳过计数更新
        // （避免 updateReviewedCounts 中 item.isDue 空指针崩溃）
        if (!item) {
            console.warn(
                "[SR] _processReviewbyAlgo: item not found for card Id =",
                this.currentCard.Id,
            );
            return;
        }

        // 只在首次复习（非学习阶段）时更新计数
        // 学习中的卡片不应该重复计入 new/due 计数
        if (!this._isLearning) {
            store.updateReviewedCounts(this.currentCard.Id, RPITEMTYPE.CARD);
        }
        store.reviewId(this.currentCard.Id, response);
    }

    async processReview_CramMode(response: ReviewResponse): Promise<void> {
        if (response == ReviewResponse.Easy) this.cardSequencer.deleteCurrentCardFromAllDecks();
        else {
            this.cardSequencer.moveCurrentCardToEndOfList();
            this.cardSequencer.nextCard();
        }
        this.logRuntimeDebug(`[SR-DynSync] processReview_CramMode: 准备重新计算统计`);
        DeckStatsService.getInstance().recalculateDeck(this.currentDeck);
        this.advanceToNextCard();
    }

    // 修复：按钮时间显示应该与实际逻辑一致
    determineCardSchedule(response: ReviewResponse, card: Card): CardScheduleInfo {
        const store = DataStore.getInstance();
        const item = store.getItembyID(card.Id);
        const currentStep = item?.learningStep ?? 0;

        const deckPath =
            this.currentDeck?.getTopicPath().path.join("/") ||
            this.currentDeck?.deckName ||
            "default";
        const presetIndex = this.settings.deckPresetAssignment?.[deckPath] ?? 0;
        const preset =
            this.settings.deckOptionsPresets?.[presetIndex] || DEFAULT_DECK_OPTIONS_PRESET;
        const learningSteps = parseSteps(preset.learningSteps);
        const lapseSteps = parseSteps(preset.lapseSteps);

        let interval = 0;
        const plugin = SRPlugin.getInstance();

        // 判断是否是已学习过的复习卡（Due Card，非学习中）
        const isReviewCard = card.cardListType === CardListType.DueCard && !this._isLearning;

        // 判断卡片是否正在学习阶段
        const isInLearningPhase = item?.learningStep !== undefined && item?.learningStep !== null;

        // 选择使用的步骤
        let steps = learningSteps;
        if (isReviewCard && response === ReviewResponse.Reset) {
            steps = lapseSteps;
        }

        // 关键修复：Due 卡片（非学习中）点击 Good/Easy 应直接毕业
        // 但必须确保 item 存在才能调用 FSRS
        if (isReviewCard && !isInLearningPhase && item) {
            // 复习卡直接使用 FSRS
            const algoIntervals = plugin.cardAlgorithm.calcAllOptsIntervals(item);
            const calculatedInterval = algoIntervals[response] || 1;
            return CardScheduleInfo.fromDueDateMoment(
                window.moment().add(calculatedInterval, "d"),
                calculatedInterval,
                0,
                0,
            );
        }

        // 新卡片或正在学习中的卡片：使用学习步骤逻辑
        if (response === ReviewResponse.Reset) {
            interval = steps[0] || 1;
        } else if (response === ReviewResponse.Hard) {
            interval = steps[currentStep] || 1;
        } else if (response === ReviewResponse.Good) {
            const nextStep = currentStep + 1;
            if (nextStep >= steps.length) {
                // 毕业：使用 cardAlgorithm (FSRS)
                // 安全检查：如果 item 不存在，使用默认间隔
                if (!item) {
                    return CardScheduleInfo.fromDueDateMoment(window.moment().add(1, "d"), 1, 0, 0);
                }
                const algoIntervals = plugin.cardAlgorithm.calcAllOptsIntervals(item);
                return CardScheduleInfo.fromDueDateMoment(
                    window.moment().add(algoIntervals[2], "d"),
                    algoIntervals[2],
                    0,
                    0,
                );
            }
            interval = steps[nextStep];
        } else if (response === ReviewResponse.Easy) {
            // Easy: 直接毕业
            // 安全检查：如果 item 不存在，使用默认间隔
            if (!item) {
                return CardScheduleInfo.fromDueDateMoment(window.moment().add(4, "d"), 4, 0, 0);
            }
            const algoIntervals = plugin.cardAlgorithm.calcAllOptsIntervals(item);
            return CardScheduleInfo.fromDueDateMoment(
                window.moment().add(algoIntervals[3], "d"),
                algoIntervals[3],
                0,
                0,
            );
        }

        // 学习阶段分钟级调度
        const due = Date.now() + interval * 60 * 1000;
        return CardScheduleInfo.fromDueDateMoment(window.moment(due), interval / 1440, 0, 0);
    }

    async updateCurrentQuestionText(text: string): Promise<void> {
        const q: QuestionText = this.currentQuestion.questionText;
        q.actualQuestion = text;
        await this.currentQuestion.writeQuestion(this.settings);
    }

    async undoReview(): Promise<void> {
        if (this.history.length === 0) {
            new Notice("没有可撤销的操作");
            return;
        }

        const lastAction = this.history.pop();
        const card = lastAction.card;

        // 重建 CardScheduleInfo 实例，防止方法丢失
        if (lastAction.initialSchedule) {
            const saved = lastAction.initialSchedule;
            // 检查 dueDate 是否有效
            const dueMoment = saved.dueDate ? window.moment(saved.dueDate) : window.moment();
            card.scheduleInfo = new CardScheduleInfo(
                dueMoment,
                saved.interval,
                saved.ease,
                saved.delayBeforeReviewTicks,
            );
        } else {
            card.scheduleInfo = null;
        }

        const store = DataStore.getInstance();
        const item = store.getItembyID(card.Id);

        // 1. Revert Data Store
        if (item && lastAction.itemSnapshot) {
            Object.assign(item, lastAction.itemSnapshot);
            item.learningStep = lastAction.learningStepSnapshot;
        }
        await store.saveReviewItemDelta(item);

        const deck = lastAction.originalDeck;

        // 2. Revert Daily Counts
        if (this.reviewMode === FlashcardReviewMode.Review && !lastAction.fromLearningQueue) {
            const plugin = SRPlugin.getInstance();
            // 必须使用与 incrementDailyCounts 相同的格式 (无 # 路径)
            const deckName =
                card.question.topicPathList?.list[0]?.path.join("/") ||
                deck.getTopicPath().path.join("/") ||
                "default";
            await plugin.decrementDailyCounts(deckName, lastAction.wasNew);
        }

        // 3. Restore to Queues
        if (lastAction.fromLearningQueue) {
            // --- Case: Was in Learning Queue ---
            const deckPath = deck?.getTopicPath().formatAsTag() || "default";

            // Fix: Add back to Deck's learning list (for UI counters) if missing
            // (e.g., if it graduated and was removed from the deck list)
            if (deck && !deck.learningFlashcards.includes(card)) {
                deck.learningFlashcards.push(card);
            }

            this._currentCard = card;
            this._isLearning = true;
        } else {
            // --- Case: Was New or Due ---
            const targetList = deck.getCardListForCardType(lastAction.previousListType);

            // Add back to original list (New or Due)
            if (!targetList.includes(card)) {
                targetList.unshift(card);
            }

            this.cardSequencer.setCurrentCard(card, deck);
            this._currentCard = card;
            this._isLearning = false;

            // Fix: Remove from Learning lists (Deck & Global)
            // If the action we are undoing moved it to Learning, we must reverse that.
            if (deck) {
                const learnIdx = deck.learningFlashcards.indexOf(card);
                if (learnIdx !== -1) {
                    deck.learningFlashcards.splice(learnIdx, 1);
                }
            }
        }

        this.restoreGlobalRemainingDeckTree(card, lastAction);

        const deckToRecalc = deck || lastAction.originalDeck || this.currentDeck;
        if (deckToRecalc) {
            this.logRuntimeDebug(
                `[SR-DynSync] undoReview: 准备为牌组 [${deckToRecalc.deckName}] 重新计算统计`,
            );
            DeckStatsService.getInstance().recalculateDeck(deckToRecalc);
        }
    }

    async untrackCurrentCard(): Promise<void> {
        const card = this.currentCard;
        const question = this.currentQuestion;
        const settings = this.settings;
        let text = question.questionText.actualQuestion;

        if (settings.convertHighlightsToClozes) text = text.replace(/==(.*?)==/gm, "$1");
        if (settings.convertBoldTextToClozes) text = text.replace(/\*\*(.*?)\*\*/gm, "$1");
        if (settings.convertCurlyBracketsToClozes) text = text.replace(/{{(.*?)}}/gm, "$1");

        let newText = text.trim();
        const noteFile = question.note.file;
        let fileText = await noteFile.read();
        const originalText = question.questionText.original;
        if (fileText.includes(originalText)) {
            fileText = fileText.replace(originalText, newText);
            await noteFile.write(fileText);
        }

        const store = DataStore.getInstance();
        store.unTrackItem(this.currentCard.Id);
        store.save();

        if (this._isLearning) {
            const deck = this.findDeckForCard(card);
            if (deck) {
                const learnIdx = deck.learningFlashcards.indexOf(card);
                if (learnIdx !== -1) {
                    deck.learningFlashcards.splice(learnIdx, 1);
                }
            }
            if (this.globalRemainingDeckTree) {
                this.globalRemainingDeckTree.deleteCardFromAllDecks(card, false);
            }
        } else {
            this.cardSequencer.deleteCurrentQuestionFromAllDecks();
            if (this.globalRemainingDeckTree) {
                this.globalRemainingDeckTree.deleteCardFromAllDecks(card, false);
            }
        }

        const deckToRecalculate = this.findDeckForCard(card) || this.currentDeck;
        DeckStatsService.getInstance().recalculateDeck(deckToRecalculate);
        this.advanceToNextCard();
    }
}
