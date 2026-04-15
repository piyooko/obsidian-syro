import { Card } from "./Card";
import { CardListType, Deck } from "./Deck";
import { Question, QuestionText } from "./Question";
import { ReviewResponse, FlashcardReviewMode } from "./scheduling";
import {
    DeckOptionsPreset,
    FsrsSettings,
    resolveDeckFsrsSettings,
    resolveDeckOptionsPreset,
    SRSettings,
} from "./settings";
import { TopicPath } from "./TopicPath";
import { CardScheduleInfo, NoteCardScheduleParser } from "./CardSchedule";
import { Note } from "./Note";
import { IDeckTreeIterator } from "./DeckTreeIterator";
import { IQuestionPostponementList } from "./QuestionPostponementList";
import { DataStore, type TrackedCardSnapshot } from "./dataStore/data";
import { DataLocation } from "./dataStore/dataLocation";
import { RPITEMTYPE, CardQueue, RepetitionItem, ReviewResult } from "./dataStore/repetitionItem";
import { Notice } from "obsidian";
import SRPlugin from "./main";
import { DeckStatsService } from "./dataStore/deckStatsService";
import { t } from "src/lang/helpers";
import { stripPlainCurlyClozeSyntax } from "src/util/curlyCloze";

interface CardScheduleSnapshot {
    dueDate: number | null;
    interval: number;
    ease: number;
    delayBeforeReviewTicks: number;
}

interface ReviewHistoryItem {
    card: Card;
    initialSchedule: CardScheduleSnapshot | null;
    originalDeck: Deck;
    wasNew: boolean;
    previousListType: CardListType;
    fromLearningQueue: boolean;
    counterDeckPath: string;
    itemSnapshot?: Pick<
        RepetitionItem,
        "timesReviewed" | "timesCorrect" | "errorStreak" | "nextReview" | "queue" | "data"
    >;
    learningStepSnapshot?: number | null;
}

interface CardReviewContext {
    deckPath: string | null;
    preset: DeckOptionsPreset;
    fsrsSettings: FsrsSettings;
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
    get isLearning(): boolean;
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
        sessionCounterDeckPath?: string | null,
    ): void;
    setCurrentDeck(topicPath: TopicPath): void;
    getDeckStats(topicPath: TopicPath): DeckStats;
    getSessionDeckStats(): DeckStats;
    skipCurrentCard(): void;
    determineCardSchedule(response: ReviewResponse, card: Card): CardScheduleInfo;
    processReview(response: ReviewResponse): void;
    updateCurrentQuestionText(text: string): Promise<void>;
    undoReview(): void;
    untrackCurrentCard(): Promise<void>;
}

export class FlashcardReviewSequencer implements IFlashcardReviewSequencer {
    private _originalDeckTree: Deck;
    private remainingDeckTree: Deck; // This holds isolatedContextDeck during reviews
    private globalRemainingDeckTree?: Deck; // Optional global reference to sync deletes
    private reviewMode: FlashcardReviewMode;
    private cardSequencer: IDeckTreeIterator;
    private settings: SRSettings;
    private questionPostponementList: IQuestionPostponementList;
    private history: ReviewHistoryItem[] = [];
    private sessionCounterDeckPath: string | null = null;

    private _currentCard: Card | null = null;
    private _isLearning: boolean = false;
    private _nextWaitTime: number | null = null;
    private shouldLogRuntimeDebug(): boolean {
        return this.settings.showRuntimeDebugMessages;
    }

    private logRuntimeDebug(...args: unknown[]): void {
        if (this.shouldLogRuntimeDebug()) {
            console.debug(...args);
        }
    }
    private _selectedTopicPath: TopicPath = TopicPath.emptyPath;

    private getLearnAheadMillis(): number {
        return Math.max(0, this.settings.learnAheadMinutes) * 60 * 1000;
    }

    private queueReviewOverlayFlush(item: RepetitionItem | null | undefined): void {
        const store = DataStore.getInstance();
        store.stageReviewItemDelta(item);
        store.requestFlushReviewOverlay();
    }

    private queueQuestionWrite(question: Question): void {
        const plugin = SRPlugin.getInstance();
        if (plugin?.reviewPersistenceCoordinator) {
            plugin.reviewPersistenceCoordinator.queueQuestionWrite(question, this.settings);
            return;
        }

        void question.writeQuestion(this.settings).catch((error) => {
            console.error("[SR] background question write failed", error);
        });
    }

    private queueSyroCardSession(
        label: string,
        action: Promise<boolean> | null | undefined,
    ): void {
        if (action == null) {
            return;
        }

        void action.catch((error) => {
            console.error(`[SR-Syro] Failed to append cards ${label} session`, error);
        });
    }

    private queueSyroCardUpsert(snapshot: TrackedCardSnapshot | null, opType: string): void {
        const plugin = SRPlugin.getInstance();
        if (!plugin || !snapshot) {
            return;
        }

        this.queueSyroCardSession(opType, plugin.appendSyroCardUpsert(snapshot, opType));
    }

    private queueSyroCardRemove(snapshot: TrackedCardSnapshot | null, opType: string): void {
        const plugin = SRPlugin.getInstance();
        if (!plugin || !snapshot) {
            return;
        }

        this.queueSyroCardSession(opType, plugin.appendSyroCardRemove(snapshot, opType));
    }

    private refreshGlobalStatusBar(): void {
        SRPlugin.getInstance()?.updateStatusBar?.();
    }

    constructor(
        reviewMode: FlashcardReviewMode,
        cardSequencer: IDeckTreeIterator,
        settings: SRSettings,
        questionPostponementList: IQuestionPostponementList,
    ) {
        this.reviewMode = reviewMode;
        this.cardSequencer = cardSequencer;
        this.settings = settings;
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
    }
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

        if (this._selectedTopicPath && !this._selectedTopicPath.isEmptyPath) {
            return this.remainingDeckTree.getDeck(this._selectedTopicPath);
        }

        return this.remainingDeckTree;
    }

    private getDeckPath(deck: Deck | null | undefined): string | null {
        if (!deck) {
            return null;
        }

        const topicPath = deck.getTopicPath().path.join("/");
        if (topicPath.length > 0) {
            return topicPath;
        }

        return deck.isRootDeck ? "" : deck.deckName;
    }

    private findRemainingDeckByPath(deckPath: string | null | undefined): Deck | null {
        if (!this.remainingDeckTree || deckPath == null) {
            return null;
        }

        const normalizedDeckPath = deckPath === "root" ? "" : deckPath;
        if (normalizedDeckPath === "") {
            return this.remainingDeckTree;
        }

        return (
            this.remainingDeckTree
                .toDeckArray()
                .find((deck) => this.getDeckPath(deck) === normalizedDeckPath) ?? null
        );
    }

    private resolveCardDeckPath(card: Card | null | undefined): string | null {
        const cardDeck = card ? this.findDeckForCard(card) : null;
        const deckPath = this.getDeckPath(cardDeck ?? this.currentDeck);
        if (deckPath) {
            return deckPath;
        }

        const topicDeckPath = card?.question?.topicPathList?.list[0]?.path.join("/");
        return topicDeckPath && topicDeckPath.length > 0 ? topicDeckPath : null;
    }

    private resolveCardReviewContext(card: Card | null | undefined): CardReviewContext {
        const deckPath = this.resolveCardDeckPath(card);
        return {
            deckPath,
            preset: resolveDeckOptionsPreset(this.settings, deckPath),
            fsrsSettings: resolveDeckFsrsSettings(this.settings, deckPath),
        };
    }

    private configureCardAlgorithm(fsrsSettings: FsrsSettings): void {
        const plugin = SRPlugin.getInstance();
        plugin?.cardAlgorithm?.updateSettings(fsrsSettings);
    }

    private createPreviewItem(card: Card, item: RepetitionItem | null): RepetitionItem {
        if (item) {
            return item;
        }

        const plugin = SRPlugin.getInstance();
        const previewItem = new RepetitionItem(
            card.Id,
            "",
            RPITEMTYPE.CARD,
            this.resolveCardDeckPath(card) ?? "default",
            plugin?.cardAlgorithm?.defaultData?.() ?? {},
        );

        previewItem.queue =
            card.cardListType === CardListType.LearningCard
                ? CardQueue.Learn
                : card.cardListType === CardListType.DueCard
                  ? CardQueue.Review
                  : CardQueue.New;

        return previewItem;
    }

    private createDeckStats(deck: Deck | null | undefined): DeckStats {
        if (!deck) {
            return new DeckStats(0, 0, 0, 0);
        }

        const newCount = deck.getDistinctCardCount(CardListType.NewCard, true);
        const dueCount = deck.getDistinctCardCount(CardListType.DueCard, true);
        const learningCount = deck.getAvailableLearningCardCount(true, this.getLearnAheadMillis());

        return new DeckStats(
            dueCount,
            newCount,
            newCount + dueCount + learningCount,
            learningCount,
        );
    }

    private createDebugDeckStatsSnapshot(stats: DeckStats) {
        return {
            dueCount: stats.dueCount,
            newCount: stats.newCount,
            totalCount: stats.totalCount,
            learningCount: stats.learningCount,
        };
    }

    private createDebugItemSnapshot(item: RepetitionItem | null | undefined) {
        if (!item) {
            return null;
        }

        return {
            timesReviewed: item.timesReviewed ?? null,
            queue: item.queue ?? null,
            nextReview: item.nextReview ?? null,
        };
    }

    private resolveReviewCounterDeckPath(card: Card | null, fallbackDeck: Deck | null): string {
        if (this.sessionCounterDeckPath != null) {
            return this.sessionCounterDeckPath;
        }

        const cardDeckPath = card?.question?.topicPathList?.list[0]?.path.join("/");
        if (cardDeckPath && cardDeckPath.length > 0) {
            return cardDeckPath;
        }

        const fallbackDeckPath = this.getDeckPath(fallbackDeck);
        return fallbackDeckPath ?? "default";
    }

    setDeckTree(
        originalDeckTree: Deck,
        isolatedContextDeck: Deck,
        globalRemainingDeckTree?: Deck,
        sessionCounterDeckPath?: string | null,
    ): void {
        this.cardSequencer.setBaseDeck(isolatedContextDeck);
        this._originalDeckTree = originalDeckTree;
        this.remainingDeckTree = isolatedContextDeck;
        this.globalRemainingDeckTree = globalRemainingDeckTree;
        this.sessionCounterDeckPath = sessionCounterDeckPath ?? null;
        this.setCurrentDeck(TopicPath.emptyPath);
    }

    setCurrentDeck(topicPath: TopicPath): void {
        this._selectedTopicPath = topicPath;
        this.cardSequencer.setIteratorTopicPath(topicPath);
        this.advanceToNextCard();
    }

    getDeckStats(topicPath: TopicPath): DeckStats {
        const deck = topicPath.isEmptyPath
            ? this.remainingDeckTree
            : this.remainingDeckTree.getDeck(topicPath);

        return this.createDeckStats(deck);
    }

    getSessionDeckStats(): DeckStats {
        const sessionDeck = this.findRemainingDeckByPath(this.sessionCounterDeckPath);
        return this.createDeckStats(sessionDeck ?? this.currentDeck);
    }

    skipCurrentCard(): void {
        if (!this._isLearning) {
            this.cardSequencer.deleteCurrentQuestionFromAllDecks();
        }
        this.advanceToNextCard();
    }

    // ============================================================
    // ============================================================
    private advanceToNextCard(): void {
        this._currentCard = null;
        this._isLearning = false;
        this._nextWaitTime = null;

        const now = Date.now();
        const learnAheadTime = this.getLearnAheadMillis();

        const validLearningCards = this.currentDeck.getFlattenedCardArray(
            CardListType.LearningCard,
            true,
        );

        const validLearningItems = validLearningCards.map((card) => {
            return {
                card: card,
                dueTime: card.repetitionItem?.nextReview || 0,
            };
        });

        validLearningItems.sort((a, b) => a.dueTime - b.dueTime);

        if (validLearningItems.length > 0 && validLearningItems[0].dueTime <= now) {
            this.logRuntimeDebug(
                `[SR-Debug] advanceToNextCard: Next is Leanring Card (Strictly due), ID=${validLearningItems[0].card.Id}, dueTime=${new Date(validLearningItems[0].dueTime).toISOString()}`,
            );
            this.setLearningCardAsCurrent(validLearningItems[0]);
            return;
        }

        if (this.cardSequencer.hasCurrentCard) {
            this._currentCard = this.cardSequencer.currentCard;
            return;
        }

        const nextResult = this.cardSequencer.nextCard();
        if (nextResult) {
            this.logRuntimeDebug(
                `[SR-Debug] advanceToNextCard: Next is Main Queue Card, ID=${this.cardSequencer.currentCard.Id}, isDue=${String(this.cardSequencer.currentCard.isDue)}, isNew=${String(this.cardSequencer.currentCard.isNew)}`,
            );
            this._currentCard = this.cardSequencer.currentCard;
            return;
        }

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
    // ============================================================
    processReview(response: ReviewResponse): void {
        this.logRuntimeDebug(
            `[SR-DynSync] sequencer.processReview: 鍝嶅簲=${ReviewResponse[response]}`,
        );
        const card = this.currentCard;
        if (!card) {
            console.error("[SR] processReview called but currentCard is null");
            return;
        }
        const store = DataStore.getInstance();
        const item = store.getItembyID(card.Id);
        const pluginStoreItemBefore = SRPlugin.getInstance()?.store?.getItembyID(card.Id) ?? null;
        const sessionStatsBefore = this.getSessionDeckStats();
        this.logRuntimeDebug(
            `[SR-Debug] processReview: ID=${card.Id}, isLearning=${String(this._isLearning)}, response=${ReviewResponse[response]}, currentStep=${item?.learningStep}`,
        );
        this.logRuntimeDebug("[SR-Debug] processReview: before", {
            reviewMode: FlashcardReviewMode[this.reviewMode],
            cardId: card.Id,
            currentDeckPath: this.getDeckPath(this.currentDeck),
            cardDeckPath: this.resolveCardDeckPath(card),
            sessionCounterDeckPath: this.sessionCounterDeckPath,
            hasGlobalRemainingDeckTree: Boolean(this.globalRemainingDeckTree),
            pluginStoreItemExists: Boolean(pluginStoreItemBefore),
            dataStoreItemExists: Boolean(item),
            sharedStoreItemRef:
                pluginStoreItemBefore && item ? pluginStoreItemBefore === item : null,
            itemBefore: this.createDebugItemSnapshot(item ?? pluginStoreItemBefore),
            sessionStatsBefore: this.createDebugDeckStatsSnapshot(sessionStatsBefore),
        });
        const counterDeckPath =
            this.resolveCardDeckPath(card) ??
            this.resolveReviewCounterDeckPath(card, this.currentDeck);

        const historyItem: ReviewHistoryItem = {
            card: card,
            initialSchedule:
                card.hasSchedule && card.scheduleInfo
                    ? {
                          dueDate: card.scheduleInfo.dueDate?.valueOf() ?? null,
                          interval: card.scheduleInfo.interval,
                          ease: card.scheduleInfo.ease,
                          delayBeforeReviewTicks: card.scheduleInfo.delayBeforeReviewTicks,
                      }
                    : null,
            originalDeck: this.currentDeck,
            wasNew: card.isNew,
            previousListType: this._isLearning ? CardListType.LearningCard : card.cardListType,
            fromLearningQueue: this._isLearning,
            counterDeckPath,
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

        if (this.reviewMode === FlashcardReviewMode.Review) {
            const plugin = SRPlugin.getInstance();
            if (this._isLearning) {
                plugin.incrementDeviceReviewCount();
            } else {
                plugin.incrementDailyCounts(historyItem.counterDeckPath, historyItem.wasNew);
            }
        }

        if (this.reviewMode === FlashcardReviewMode.Review) {
            this.processReview_ReviewMode(response, item);
        } else {
            this.processReview_CramMode(response);
        }
        const itemAfter = store.getItembyID(card.Id);
        const pluginStoreItemAfter = SRPlugin.getInstance()?.store?.getItembyID(card.Id) ?? null;
        const sessionStatsAfter = this.getSessionDeckStats();
        const itemBeforeSnapshot = this.createDebugItemSnapshot(item ?? pluginStoreItemBefore);
        const itemAfterSnapshot = this.createDebugItemSnapshot(itemAfter ?? pluginStoreItemAfter);
        this.logRuntimeDebug("[SR-Debug] processReview: after", {
            reviewMode: FlashcardReviewMode[this.reviewMode],
            response: ReviewResponse[response],
            processedCardId: card.Id,
            nextCardId: this.currentCard?.Id ?? null,
            currentDeckPath: this.getDeckPath(this.currentDeck),
            cardDeckPath: this.resolveCardDeckPath(this.currentCard),
            sessionCounterDeckPath: this.sessionCounterDeckPath,
            hasGlobalRemainingDeckTree: Boolean(this.globalRemainingDeckTree),
            pluginStoreItemExists: Boolean(pluginStoreItemAfter),
            dataStoreItemExists: Boolean(itemAfter),
            sharedStoreItemRef:
                pluginStoreItemAfter && itemAfter ? pluginStoreItemAfter === itemAfter : null,
            itemBefore: itemBeforeSnapshot,
            itemAfter: itemAfterSnapshot,
            sessionStatsBefore: this.createDebugDeckStatsSnapshot(sessionStatsBefore),
            sessionStatsAfter: this.createDebugDeckStatsSnapshot(sessionStatsAfter),
        });
        if (
            this.reviewMode === FlashcardReviewMode.Review &&
            itemBeforeSnapshot &&
            itemAfterSnapshot &&
            itemBeforeSnapshot.timesReviewed === itemAfterSnapshot.timesReviewed &&
            itemBeforeSnapshot.queue === itemAfterSnapshot.queue &&
            itemBeforeSnapshot.nextReview === itemAfterSnapshot.nextReview
        ) {
            console.warn("[SR] processReview: review completed without observable item changes", {
                cardId: card.Id,
                response: ReviewResponse[response],
                sessionCounterDeckPath: this.sessionCounterDeckPath,
                currentDeckPath: this.getDeckPath(this.currentDeck),
            });
        }
        if (this.reviewMode === FlashcardReviewMode.Review) {
            this.queueSyroCardUpsert(store.getCardSnapshot(card.Id), "review");
        }
        this.logRuntimeDebug("[SR-DynSync] sequencer.processReview: completed");
    }

    processReview_ReviewMode(response: ReviewResponse, item: RepetitionItem | null): void {
        const card = this.currentCard;
        const reviewContext = this.resolveCardReviewContext(card);
        const reviewResult = this._processReviewbyAlgo(response, reviewContext.fsrsSettings);
        const resolvedItem = item ?? DataStore.getInstance().getItembyID(card.Id);

        if (!reviewResult) {
            console.warn("[SR] processReview_ReviewMode: algorithm returned null", {
                cardId: card.Id,
                response: ReviewResponse[response],
                currentDeckPath: this.getDeckPath(this.currentDeck),
                sessionCounterDeckPath: this.sessionCounterDeckPath,
            });
        }

        if (!resolvedItem) {
            console.warn("[SR] processReview_ReviewMode: item missing after review", {
                cardId: card.Id,
                response: ReviewResponse[response],
                currentDeckPath: this.getDeckPath(this.currentDeck),
                sessionCounterDeckPath: this.sessionCounterDeckPath,
                pluginStoreItemExists: Boolean(SRPlugin.getInstance()?.store?.getItembyID(card.Id)),
                dataStoreItemExists: Boolean(DataStore.getInstance().getItembyID(card.Id)),
            });
            this.advanceToNextCard();
            return;
        }

        card.scheduleInfo = NoteCardScheduleParser.createInfo_algo(resolvedItem.getSched() ?? null);

        if (!this._isLearning) {
            this.cardSequencer.deleteCurrentCardFromAllDecks();
        }

        const deck = this.findDeckForCard(card);
        if (deck) {
            deck.removeCard(card);

            if (resolvedItem.queue === CardQueue.Learn && !deck.learningFlashcards.includes(card)) {
                deck.learningFlashcards.push(card);
            } else if (resolvedItem.queue === CardQueue.New && !deck.newFlashcards.includes(card)) {
                deck.newFlashcards.push(card);
            }
        }

        if (
            resolvedItem.queue === CardQueue.Review &&
            this.settings.dataLocation === DataLocation.SaveOnNoteFile
        ) {
            this.queueQuestionWrite(card.question);
        }

        this.queueReviewOverlayFlush(resolvedItem);
        this.syncGlobalRemainingDeckTree(card, resolvedItem.queue);

        if (this._isLearning) this._currentCard = null;

        const deckToRecalc = this.findDeckForCard(card) || this.currentDeck;
        this.logRuntimeDebug(
            `[SR-DynSync] processReview_ReviewMode: preparing deck [${deckToRecalc?.deckName}] stats recalculation`,
        );
        DeckStatsService.getInstance().recalculateDeck(deckToRecalc, this.getLearnAheadMillis());

        this.advanceToNextCard();
    }

    private findDeckForCard(card: Card): Deck | null {
        if (card.question?.topicPathList?.list.length > 0) {
            return this.remainingDeckTree.getDeck(card.question.topicPathList.list[0]);
        }
        return null;
    }

    private syncGlobalRemainingDeckTree(card: Card, targetQueue: CardQueue | null | undefined) {
        if (!this.globalRemainingDeckTree) return;

        // Remove from all old locations in the global tree
        this.globalRemainingDeckTree.deleteCardFromAllDecks(card, false);

        const topicPath = card.question?.topicPathList?.list[0] || this.currentDeck?.getTopicPath();
        if (!topicPath) {
            this.refreshGlobalStatusBar();
            return;
        }

        const globalDeck = this.globalRemainingDeckTree.getDeck(topicPath);
        if (!globalDeck) {
            this.refreshGlobalStatusBar();
            return;
        }

        if (targetQueue === CardQueue.Learn && !globalDeck.learningFlashcards.includes(card)) {
            globalDeck.learningFlashcards.push(card);
        } else if (targetQueue === CardQueue.New && !globalDeck.newFlashcards.includes(card)) {
            globalDeck.newFlashcards.push(card);
        }

        this.refreshGlobalStatusBar();
    }

    private restoreGlobalRemainingDeckTree(card: Card, historyItem: ReviewHistoryItem) {
        if (!this.globalRemainingDeckTree) return;

        this.globalRemainingDeckTree.deleteCardFromAllDecks(card, false);

        const topicPath =
            card.question?.topicPathList?.list[0] || historyItem.originalDeck?.getTopicPath();
        if (!topicPath) {
            this.refreshGlobalStatusBar();
            return;
        }

        const globalDeck = this.globalRemainingDeckTree.getDeck(topicPath);
        if (!globalDeck) {
            this.refreshGlobalStatusBar();
            return;
        }

        if (historyItem.fromLearningQueue) {
            globalDeck.learningFlashcards.unshift(card);
        } else if (historyItem.wasNew) {
            globalDeck.newFlashcards.unshift(card);
        } else {
            globalDeck.dueFlashcards.unshift(card);
        }

        this.refreshGlobalStatusBar();
    }

    private _processReviewbyAlgo(
        response: ReviewResponse,
        fsrsSettings: FsrsSettings,
    ): ReviewResult | null {
        const store = DataStore.getInstance();
        const item = store.getItembyID(this.currentCard.Id);

        if (!item) {
            console.warn(
                "[SR] _processReviewbyAlgo: item not found for card Id =",
                this.currentCard.Id,
            );
            return null;
        }

        if (!this._isLearning) {
            store.updateReviewedCounts(this.currentCard.Id, RPITEMTYPE.CARD);
        }
        return store.reviewId(this.currentCard.Id, response, fsrsSettings);
    }

    processReview_CramMode(response: ReviewResponse): void {
        if (response == ReviewResponse.Easy) this.cardSequencer.deleteCurrentCardFromAllDecks();
        else {
            this.cardSequencer.moveCurrentCardToEndOfList();
            this.cardSequencer.nextCard();
        }
        this.logRuntimeDebug("[SR-DynSync] processReview_CramMode: preparing stats recalculation");
        DeckStatsService.getInstance().recalculateDeck(
            this.currentDeck,
            this.getLearnAheadMillis(),
        );
        this.advanceToNextCard();
    }

    determineCardSchedule(response: ReviewResponse, card: Card): CardScheduleInfo {
        const store = DataStore.getInstance();
        const item = store.getItembyID(card.Id);
        const reviewContext = this.resolveCardReviewContext(card);
        const plugin = SRPlugin.getInstance();
        this.configureCardAlgorithm(reviewContext.fsrsSettings);

        const previewItem = this.createPreviewItem(card, item);
        const previewIntervals = plugin.cardAlgorithm.calcAllOptsIntervals(previewItem);
        const calculatedInterval = previewIntervals[response] ?? 1;

        return CardScheduleInfo.fromDueDateMoment(
            window.moment().add(calculatedInterval, "d"),
            calculatedInterval,
            0,
            0,
        );
    }

    async updateCurrentQuestionText(text: string): Promise<void> {
        const q: QuestionText = this.currentQuestion.questionText;
        q.actualQuestion = text;
        await this.currentQuestion.writeQuestion(this.settings);
    }

    undoReview(): void {
        if (this.history.length === 0) {
            new Notice(t("REVIEW_NO_UNDO"));
            return;
        }

        const lastAction = this.history.pop();
        const card = lastAction.card;

        if (lastAction.initialSchedule) {
            const saved = lastAction.initialSchedule;
            const dueMoment = saved.dueDate
                ? window.moment(new Date(saved.dueDate))
                : window.moment();
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
        this.queueReviewOverlayFlush(item);

        const deck = lastAction.originalDeck;

        // 2. Revert Daily Counts
        if (this.reviewMode === FlashcardReviewMode.Review && !lastAction.fromLearningQueue) {
            const plugin = SRPlugin.getInstance();
            plugin.decrementDailyCounts(lastAction.counterDeckPath, lastAction.wasNew);
        }

        // 3. Restore to Queues
        if (lastAction.fromLearningQueue) {
            // --- Case: Was in Learning Queue ---
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
                `[SR-DynSync] undoReview: preparing deck [${deckToRecalc.deckName}] stats recalculation`,
            );
            DeckStatsService.getInstance().recalculateDeck(
                deckToRecalc,
                this.getLearnAheadMillis(),
            );
        }

        this.queueSyroCardUpsert(store.getCardSnapshot(card.Id), "undo");
    }

    async untrackCurrentCard(): Promise<void> {
        const card = this.currentCard;
        const question = this.currentQuestion;
        const settings = this.settings;
        let text = question.questionText.actualQuestion;

        if (settings.convertHighlightsToClozes) text = text.replace(/==(.*?)==/gm, "$1");
        if (settings.convertBoldTextToClozes) text = text.replace(/\*\*(.*?)\*\*/gm, "$1");
        if (settings.convertCurlyBracketsToClozes) {
            text = stripPlainCurlyClozeSyntax(text);
        }

        const newText = text.trim();
        const noteFile = question.note.file;
        let fileText = await noteFile.read();
        const originalText = question.questionText.original;
        if (fileText.includes(originalText)) {
            fileText = fileText.replace(originalText, newText);
            await noteFile.write(fileText);
        }

        const store = DataStore.getInstance();
        const removedSnapshot = store.getCardSnapshot(card.Id);
        store.unTrackItem(card.Id);
        await store.save();
        this.queueSyroCardRemove(removedSnapshot, "remove");

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
        DeckStatsService.getInstance().recalculateDeck(
            deckToRecalculate,
            this.getLearnAheadMillis(),
        );
        this.refreshGlobalStatusBar();
        this.advanceToNextCard();
    }
}
