/**
 * 杩欎釜鏂囦欢涓昏鏄共浠€涔堢殑锛?
 * [鏍稿績] 澶嶄範娴佺▼鐨勬€诲婕?(Sequencer)銆?
 * 瀹冭繛鎺ヤ簡 UI銆佹暟鎹瓨鍌ㄧ畻娉曞拰璋冨害閫昏緫銆傝礋璐ｅ鐞嗙敤鎴峰鍗＄墖鐨勮瘎鍒嗭紙Easy/Good/Hard锛夛紝鎵ц鎾ら攢鎿嶄綔锛岀鐞嗗涔犻槦鍒?(Learning Queue)锛屽苟鏇存柊鍗＄墖鏁版嵁銆?
 *
 * 瀹冨湪椤圭洰涓睘浜庯細鎺у埗鍣?鏍稿績閫昏緫 (Controller/Core Logic)
 *
 * 瀹冧細鐢ㄥ埌鍝簺鏂囦欢锛?
 * 1. src/DeckTreeIterator.ts (鑾峰彇涓嬩竴寮犲崱)
 * 2. src/CardSchedule.ts (璁＄畻璋冨害)
 * 3. src/dataStore/data.ts (鎸佷箙鍖栧涔犵粨鏋?
 * 4. src/algorithms/*.ts (FSRS/Anki 绠楁硶)
 *
 * 鍝簺鏂囦欢浼氱敤鍒板畠锛?
 * 1. src/main.ts (鎻掍欢涓诲叆鍙ｏ紝鍒濆鍖栧拰绠＄悊澶嶄範)
 * 2. src/ui/views/FlashcardModal.tsx (澶嶄範寮圭獥)
 * 3. src/ui/views/reviewView.ts (鏃х増澶嶄範瑙嗗浘)
 * 4. src/ui/ReactReviewApp.tsx (React 澶嶄範搴旂敤鍏ュ彛)
 * 5. src/ui/containers/ReviewSession.tsx (澶嶄範浼氳瘽瀹瑰櫒)
 */
/**
 * [鎺у埗鍣?鏍稿績] 澶嶄範娴佺▼鐨勬€诲婕斻€傝繛鎺?UI銆佺畻娉曞拰鏁版嵁锛屽鐞嗙敤鎴疯瘎鍒嗐€佹挙閿€銆佽烦杩囩瓑鎿嶄綔銆?
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
import { RPITEMTYPE, CardQueue, RepetitionItem, ReviewResult } from "./dataStore/repetitionItem";
import { Notice } from "obsidian";
import SRPlugin from "./main";
import { FsrsData } from "./algorithms/fsrs";
import { DeckStatsService } from "./dataStore/deckStatsService";

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
    itemSnapshot?: Pick<
        RepetitionItem,
        "timesReviewed" | "timesCorrect" | "errorStreak" | "nextReview" | "queue" | "data"
    >;
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
    get isLearning(): boolean; // 鍒悕锛岀敤浜嶶I鍒ゆ柇褰撳墠鍗＄墖鏄惁鏉ヨ嚜瀛︿範闃熷垪
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
            console.debug(...args);
        }
    }
    private _selectedTopicPath: TopicPath = TopicPath.emptyPath; // 淇濆瓨鐢ㄦ埛閫夋嫨鐨勫崱缁勮矾寰?

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
    } // UI 浣跨敤
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

        // [淇] 濡傛灉杩唬鍣ㄥ拰褰撳墠鍗＄墖閮芥棤娉曟彁渚涚墝缁勪笂涓嬫枃锛?
        // 鍒欏繀椤诲洖閫€鍒扮敤鎴烽€夊畾鐨勫崱缁勮矾寰勶紝鑰屼笉鏄洿鎺ュ洖閫€鍒版牴鑺傜偣銆?
        // 杩欑‘淇濇姢浜嗗涔犻槦鍒楀湪 advanceToNextCard 鏃跺彧鎵弿褰撳墠閫夊畾鐨勫崱缁勩€?
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
        this._selectedTopicPath = topicPath; // 淇濆瓨鐢ㄦ埛閫夋嫨鐨勫崱缁勮矾寰?
        this.cardSequencer.setIteratorTopicPath(topicPath);
        this.advanceToNextCard();
    }

    /**
     * 鑾峰彇鐗岀粍缁熻锛堜娇鐢?DeckStatsService 浜嬩欢椹卞姩妯″紡锛?
     *
     * 閫氳繃 DeckStatsService 璇诲彇缁熻鏁版嵁銆傛瘡娆″涔犲悗 processReview_ReviewMode 浼氳皟鐢?
     * DeckStatsService.recalculateDeck()锛屽悗鑰呬細瑙﹀彂 "deck-stats-updated" 浜嬩欢锛?
     * 浠庤€岄┍鍔?ReviewSession 鐨?forceUpdate() 鈫?tick++ 鈫?UI 閲嶆覆鏌撱€?
     * 杩欐潯浜嬩欢閾炬槸澶嶄範鐣岄潰璁℃暟鍣ㄥ姩鎬佹洿鏂扮殑鍞竴閫氳矾锛屼笉鑳界粫杩囥€?
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
        const learningCount = deck.getAvailableLearningCardCount(
            true,
            this.getLearnAheadMillis(),
        );

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
    // 鏍稿績閫昏緫锛氳幏鍙栦笅涓€寮犲崱鐗?(澧炲姞鍗＄粍杩囨护)
    // ============================================================
    private advanceToNextCard(): void {
        this._currentCard = null;
        this._isLearning = false;
        this._nextWaitTime = null;

        const now = Date.now();
        const learnAheadTime = this.getLearnAheadMillis();

        // 1. 鑾峰彇褰撳墠鐗岀粍鍙婂叾鎵€鏈夊瓙鐗岀粍涓殑瀛︿範涓崱鐗?
        const validLearningCards = this.currentDeck.getFlattenedCardArray(
            CardListType.LearningCard,
            true,
        );

        // 2. 灏嗗畠浠牸寮忓寲涓哄甫鏈?dueTime 鐨勫璞′互渚挎帓搴?
        const validLearningItems = validLearningCards.map((card) => {
            return {
                card: card,
                dueTime: card.repetitionItem?.nextReview || 0,
            };
        });

        validLearningItems.sort((a, b) => a.dueTime - b.dueTime);

        // 3. 妫€鏌?Strictly Due (鍒版湡鏃堕棿 <= Now)
        if (validLearningItems.length > 0 && validLearningItems[0].dueTime <= now) {
            this.logRuntimeDebug(
                `[SR-Debug] advanceToNextCard: Next is Leanring Card (Strictly due), ID=${validLearningItems[0].card.Id}, dueTime=${new Date(validLearningItems[0].dueTime).toISOString()}`,
            );
            this.setLearningCardAsCurrent(validLearningItems[0]);
            return;
        }

        // 4. 妫€鏌?Main Queue
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

        // 5. 妫€鏌?Learn Ahead
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
    // 鏍稿績閫昏緫锛氬鐞嗗涔?
    // ============================================================
    async processReview(response: ReviewResponse): Promise<void> {
        this.logRuntimeDebug(`[SR-DynSync] sequencer.processReview: 鍝嶅簲=${ReviewResponse[response]}`);
        const card = this.currentCard;
        if (!card) {
            console.error("[SR] processReview called but currentCard is null");
            return;
        }
        const store = DataStore.getInstance();
        const item = store.getItembyID(card.Id);

        if (this.settings.enableCardLevelTrace) {
            card.addDebugLog("Scheduler", "鏀跺埌璇勭骇鍝嶅簲", {
                response: ReviewResponse[response],
                wasNew: card.isNew,
                isLearning: this._isLearning,
                itemId: item?.ID,
                currentStep: item?.learningStep,
            });
        }
        this.logRuntimeDebug(
            `[SR-Debug] processReview: ID=${card.Id}, isLearning=${String(this._isLearning)}, response=${ReviewResponse[response]}, currentStep=${item?.learningStep}`,
        );

        // 璁板綍鍘嗗彶
        const historyItem: ReviewHistoryItem = {
            card: card,
            initialSchedule:
                card.hasSchedule && card.scheduleInfo
                      ? ({
                          dueDate: card.scheduleInfo.dueDate?.valueOf() ?? null,
                          interval: card.scheduleInfo.interval,
                          ease: card.scheduleInfo.ease,
                          delayBeforeReviewTicks: card.scheduleInfo.delayBeforeReviewTicks,
                      })
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

        // 璁℃暟
        if (this.reviewMode === FlashcardReviewMode.Review && !this._isLearning) {
            const plugin = SRPlugin.getInstance();
            const deckName = card.question.topicPathList?.list[0]?.path.join("/") || "default";
            plugin.incrementDailyCounts(deckName, historyItem.wasNew);
        }

        if (this.reviewMode === FlashcardReviewMode.Review) {
            await this.processReview_ReviewMode(response, item);
        } else {
            this.processReview_CramMode(response);
        }
        this.logRuntimeDebug("[SR-DynSync] sequencer.processReview: completed");
    }

    async processReview_ReviewMode(
        response: ReviewResponse,
        item: RepetitionItem | null,
    ): Promise<void> {
        const card = this.currentCard;
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

        // FSRS 鏇存柊鐘舵€?
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
                // < 1澶╋紝Intraday
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

                // [淇] 鏃犺涔嬪墠鏄惁宸茬粡鏄涔犱腑锛岄兘瑕佸己鍒舵鏌ュ苟鍔犲叆 Deck 鐨?learningFlashcards 鍒楄〃
                // 杩欒В鍐充簡 UI 璁℃暟鍣ㄥ彲鑳戒笌瀹為檯鐘舵€侊紙鍏ㄥ眬闃熷垪锛変笉鍚屾鐨勯棶棰?
                const deck = this.findDeckForCard(card);

                if (!this._isLearning) {
                    this.cardSequencer.deleteCurrentCardFromAllDecks();
                }

                if (deck) {
                    const newIdx = deck.newFlashcards.indexOf(card);
                    if (newIdx !== -1) {
                        deck.newFlashcards.splice(newIdx, 1);
                    }
                    // 鏍稿績淇鐐癸細鍗充娇 _isLearning 涓?true锛屽鏋滃畠涓嶅湪鍒楄〃閲岋紙姣斿鍥犱负涔嬪墠鐨勬暟鎹笉涓€鑷达級锛屼篃瑕佸姞杩涘幓
                    // 濡傛灉杩樺湪瀛︿範闃舵锛岄噸鏂版斁鍏?learningFlashcards 鍒楄〃
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
                this.queueReviewOverlayFlush(item);
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

                this.queueReviewOverlayFlush(item);
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
                this.queueQuestionWrite(card.question);
            }
            this.queueReviewOverlayFlush(item);

            if (!this._isLearning) this.cardSequencer.deleteCurrentCardFromAllDecks();
            const deck = this.findDeckForCard(card);
            if (deck) deck.removeCard(card);
            this.syncGlobalRemainingDeckTree(card, false);
        }

        if (this._isLearning) this._currentCard = null;

        // [鏍稿績淇] 蹇呴』閲嶆柊璁＄畻璇ュ崱鐗囩湡姝ｆ墍灞炵殑鐗岀粍鐨勭粺璁?
        const deckToRecalc = this.findDeckForCard(card) || this.currentDeck;
        this.logRuntimeDebug(
            `[SR-DynSync] processReview_ReviewMode: 鍑嗗涓虹墝缁?[${deckToRecalc?.deckName}] 閲嶆柊璁＄畻缁熻`,
        );
        DeckStatsService.getInstance().recalculateDeck(
            deckToRecalc,
            this.getLearnAheadMillis(),
        );

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

    private _processReviewbyAlgo(response: ReviewResponse): ReviewResult | null {
        const store = DataStore.getInstance();
        const item = store.getItembyID(this.currentCard.Id);

        // 闃插尽锛氬鏋?DataStore 涓壘涓嶅埌璇ュ崱鐗囩殑 item锛岃烦杩囪鏁版洿鏂?
        // 锛堥伩鍏?updateReviewedCounts 涓?item.isDue 绌烘寚閽堝穿婧冿級
        if (!item) {
            console.warn(
                "[SR] _processReviewbyAlgo: item not found for card Id =",
                this.currentCard.Id,
            );
            return null;
        }

        // 鍙湪棣栨澶嶄範锛堥潪瀛︿範闃舵锛夋椂鏇存柊璁℃暟
        // 瀛︿範涓殑鍗＄墖涓嶅簲璇ラ噸澶嶈鍏?new/due 璁℃暟
        if (!this._isLearning) {
            store.updateReviewedCounts(this.currentCard.Id, RPITEMTYPE.CARD);
        }
        return store.reviewId(this.currentCard.Id, response);
    }

    processReview_CramMode(response: ReviewResponse): void {
        if (response == ReviewResponse.Easy) this.cardSequencer.deleteCurrentCardFromAllDecks();
        else {
            this.cardSequencer.moveCurrentCardToEndOfList();
            this.cardSequencer.nextCard();
        }
        this.logRuntimeDebug(`[SR-DynSync] processReview_CramMode: 鍑嗗閲嶆柊璁＄畻缁熻`);
        DeckStatsService.getInstance().recalculateDeck(
            this.currentDeck,
            this.getLearnAheadMillis(),
        );
        this.advanceToNextCard();
    }

    // 淇锛氭寜閽椂闂存樉绀哄簲璇ヤ笌瀹為檯閫昏緫涓€鑷?
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

        // 鍒ゆ柇鏄惁鏄凡瀛︿範杩囩殑澶嶄範鍗★紙Due Card锛岄潪瀛︿範涓級
        const isReviewCard = card.cardListType === CardListType.DueCard && !this._isLearning;

        // 鍒ゆ柇鍗＄墖鏄惁姝ｅ湪瀛︿範闃舵
        const isInLearningPhase = item?.learningStep !== undefined && item?.learningStep !== null;

        // 閫夋嫨浣跨敤鐨勬楠?
        let steps = learningSteps;
        if (isReviewCard && response === ReviewResponse.Reset) {
            steps = lapseSteps;
        }

        // 鍏抽敭淇锛欴ue 鍗＄墖锛堥潪瀛︿範涓級鐐瑰嚮 Good/Easy 搴旂洿鎺ユ瘯涓?
        // 浣嗗繀椤荤‘淇?item 瀛樺湪鎵嶈兘璋冪敤 FSRS
        if (isReviewCard && !isInLearningPhase && item) {
            // 澶嶄範鍗＄洿鎺ヤ娇鐢?FSRS
            const algoIntervals = plugin.cardAlgorithm.calcAllOptsIntervals(item);
            const calculatedInterval = algoIntervals[response] || 1;
            return CardScheduleInfo.fromDueDateMoment(
                window.moment().add(calculatedInterval, "d"),
                calculatedInterval,
                0,
                0,
            );
        }

        // 鏂板崱鐗囨垨姝ｅ湪瀛︿範涓殑鍗＄墖锛氫娇鐢ㄥ涔犳楠ら€昏緫
        if (response === ReviewResponse.Reset) {
            interval = steps[0] || 1;
        } else if (response === ReviewResponse.Hard) {
            interval = steps[currentStep] || 1;
        } else if (response === ReviewResponse.Good) {
            const nextStep = currentStep + 1;
            if (nextStep >= steps.length) {
                // 姣曚笟锛氫娇鐢?cardAlgorithm (FSRS)
                // 瀹夊叏妫€鏌ワ細濡傛灉 item 涓嶅瓨鍦紝浣跨敤榛樿闂撮殧
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
            // Easy: 鐩存帴姣曚笟
            // 瀹夊叏妫€鏌ワ細濡傛灉 item 涓嶅瓨鍦紝浣跨敤榛樿闂撮殧
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

        // 瀛︿範闃舵鍒嗛挓绾ц皟搴?
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
            new Notice("No review action to undo.");
            return;
        }

        const lastAction = this.history.pop();
        const card = lastAction.card;

        // 閲嶅缓 CardScheduleInfo 瀹炰緥锛岄槻姝㈡柟娉曚涪澶?
        if (lastAction.initialSchedule) {
            const saved = lastAction.initialSchedule;
            // 妫€鏌?dueDate 鏄惁鏈夋晥
            const dueMoment = saved.dueDate ? window.moment(new Date(saved.dueDate)) : window.moment();
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
            // 蹇呴』浣跨敤涓?incrementDailyCounts 鐩稿悓鐨勬牸寮?(鏃?# 璺緞)
            const deckName =
                card.question.topicPathList?.list[0]?.path.join("/") ||
                deck.getTopicPath().path.join("/") ||
                "default";
            plugin.decrementDailyCounts(deckName, lastAction.wasNew);
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
                `[SR-DynSync] undoReview: 鍑嗗涓虹墝缁?[${deckToRecalc.deckName}] 閲嶆柊璁＄畻缁熻`,
            );
            DeckStatsService.getInstance().recalculateDeck(
                deckToRecalc,
                this.getLearnAheadMillis(),
            );
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
        await store.save();

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
        this.advanceToNextCard();
    }
}

