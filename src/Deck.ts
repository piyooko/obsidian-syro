/**
 * 杩欎釜鏂囦欢涓昏鏄共浠€涔堢殑锛?
 * 瀹氫箟浜嗏€滅墝缁勨€?Deck) 鐨勬暟鎹粨鏋勩€?
 * 杩欐槸涓€涓爲鐘剁粨鏋勶紝鏀寔瀛愮墝缁?(Subdecks)銆傛瘡涓墝缁勫寘鍚柊鍗°€佸埌鏈熷崱鍜屽涔犱腑鍗＄墖鐨勫垪琛ㄣ€?
 * 瀹冩槸缁勭粐鍗＄墖鐨勫鍣ㄣ€?
 *
 * 瀹冨湪椤圭洰涓睘浜庯細妯″瀷灞?(Model Layer)
 *
 * 瀹冧細鐢ㄥ埌鍝簺鏂囦欢锛?
 * 1. src/Card.ts (鐗岀粍鍐呭瓨鏀剧殑瀵硅薄)
 * 2. src/TopicPath.ts (鐗岀粍鐨勮矾寰?Tag 瀹氫箟)
 *
 * 鍝簺鏂囦欢浼氱敤鍒板畠锛?
 * 1. src/DeckTreeIterator.ts (閬嶅巻鐗岀粍鏍戣繘琛屽涔?
 * 2. src/FlashcardReviewSequencer.ts (鑾峰彇褰撳墠澶嶄範鐨勭墝缁勪笂涓嬫枃)
 * 3. src/NoteQuestionParser.ts (灏嗚В鏋愬嚭鐨勫崱鐗囨斁鍏ュ搴旂墝缁?
 */
/**
 * [妯″瀷] 浠ｈ〃涓€涓墝缁勶紝鍖呭惈瀛愮墝缁勫拰鍗＄墖鍒楄〃銆?
 */
import { Card } from "./Card";
// import { FlashcardReviewMode } from "./FlashcardReviewSequencer";
import { FlashcardReviewMode } from "./scheduling";
import { Question } from "./Question";
import { IQuestionPostponementList } from "./QuestionPostponementList";
import { SRSettings } from "./settings";
import { TopicPath, TopicPathList } from "./TopicPath";
import type SRPlugin from "./main";

export enum CardListType {
    NewCard,
    DueCard,
    All,
    LearningCard,
}

//
// The same card can be added to multiple decks e.g.
//      #flashcards/language/words
//      #flashcards/trivia
// To simplify certain functions (e.g. getDistinctCardCount), we explicitly use the same card object (and not a copy)
//
export class Deck {
    public deckName: string;
    public newFlashcards: Card[];
    public dueFlashcards: Card[];
    public learningFlashcards: Card[]; // Intraday learning cards
    public subdecks: Deck[];
    public parent: Deck | null;

    constructor(deckName: string, parent: Deck | null) {
        this.deckName = deckName;
        this.newFlashcards = [];
        this.dueFlashcards = [];
        this.learningFlashcards = [];
        this.subdecks = [];
        this.parent = parent;
    }

    public getCardCount(cardListType: CardListType, includeSubdeckCounts: boolean): number {
        let result: number = 0;
        if (cardListType == CardListType.NewCard || cardListType == CardListType.All)
            result += this.newFlashcards.length;
        if (cardListType == CardListType.DueCard || cardListType == CardListType.All)
            result += this.dueFlashcards.length;
        if (cardListType == CardListType.LearningCard || cardListType == CardListType.All)
            result += this.learningFlashcards.length;

        if (includeSubdeckCounts) {
            for (const deck of this.subdecks) {
                result += deck.getCardCount(cardListType, includeSubdeckCounts);
            }
        }
        return result;
    }

    public getRobustStats(
        plugin: SRPlugin,
        store: {
            getAllItemsForTopicPath(topicPath: TopicPath, includeSubdecks: boolean): Card[];
            getItembyID(id: number): {
                isInLearningPhase: boolean;
                isNew: boolean;
                isDue: boolean;
            } | null;
        },
    ): { due: number; new: number; learning: number; total: number } {
        const topicPath = this.getTopicPath();

        const learningCardIds = new Set<number>();
        const newCardIds = new Set<number>();
        const dueCardIds = new Set<number>();

        if (plugin?.learningQueue) {
            for (const item of plugin.learningQueue) {
                const card = item.card;
                const cardTopicPath = card.question?.topicPathList?.list[0];

                if (cardTopicPath && topicPath.isSameOrAncestorOf(cardTopicPath)) {
                    learningCardIds.add(card.Id);
                }
            }
        }

        const traverseAndCount = (currentDeck: Deck) => {
            if (!currentDeck) return;

            const allPotentialCards = [
                ...currentDeck.newFlashcards,
                ...currentDeck.dueFlashcards,
                ...currentDeck.learningFlashcards,
            ];

            for (const card of allPotentialCards) {
                if (learningCardIds.has(card.Id)) continue;
                if (newCardIds.has(card.Id) || dueCardIds.has(card.Id)) continue;

                const item = store.getItembyID(card.Id);
                if (!item) continue;

                if (item.isInLearningPhase) {
                    learningCardIds.add(card.Id);
                } else if (item.isNew) {
                    newCardIds.add(card.Id);
                } else if (item.isDue) {
                    dueCardIds.add(card.Id);
                }
            }

            for (const subdeck of currentDeck.subdecks) {
                traverseAndCount(subdeck);
            }
        };

        traverseAndCount(this);

        return {
            due: dueCardIds.size,
            new: newCardIds.size,
            learning: learningCardIds.size,
            total: 0,
        };
    }

    public getDistinctCardCount(cardListType: CardListType, includeSubdeckCounts: boolean): number {
        const cardList: Card[] = this.getFlattenedCardArray(cardListType, includeSubdeckCounts);

        // The following selects distinct cards from cardList (based on reference equality)
        const distinctCardSet = new Set(cardList);
        return distinctCardSet.size;
    }

    public getAvailableLearningCardCount(
        includeSubdeckCounts: boolean,
        learnAheadMillis: number,
        now: number = Date.now(),
    ): number {
        const cardList: Card[] = this.getFlattenedCardArray(
            CardListType.LearningCard,
            includeSubdeckCounts,
        );
        const availableLearningCards = cardList.filter((card) =>
            card.repetitionItem?.isReviewableLearning(now, learnAheadMillis),
        );

        return new Set(availableLearningCards).size;
    }

    public getFlattenedCardArray(
        cardListType: CardListType,
        includeSubdeckCounts: boolean,
    ): Card[] {
        let result: Card[] = [] as Card[];
        switch (cardListType) {
            case CardListType.NewCard:
                result = this.newFlashcards;
                break;
            case CardListType.DueCard:
                result = this.dueFlashcards;
                break;
            case CardListType.LearningCard:
                result = this.learningFlashcards;
                break;
            case CardListType.All:
                result = this.newFlashcards
                    .concat(this.dueFlashcards)
                    .concat(this.learningFlashcards);
        }

        if (includeSubdeckCounts) {
            for (const subdeck of this.subdecks) {
                result = result.concat(
                    subdeck.getFlattenedCardArray(cardListType, includeSubdeckCounts),
                );
            }
        }
        return result;
    }

    //
    // Returns a count of the number of this question's cards are present in this deck.
    // (The returned value would be <= question.cards.length)
    //
    public getQuestionCardCount(question: Question): number {
        let result: number = 0;
        result += this.getQuestionCardCountForCardListType(question, this.newFlashcards);
        result += this.getQuestionCardCountForCardListType(question, this.dueFlashcards);
        result += this.getQuestionCardCountForCardListType(question, this.learningFlashcards);
        return result;
    }

    private getQuestionCardCountForCardListType(question: Question, cards: Card[]): number {
        let result: number = 0;
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            if (Object.is(question, cards[i].question)) result++;
        }
        return result;
    }

    static get emptyDeck(): Deck {
        return new Deck("Root", null);
    }

    get isRootDeck() {
        return this.parent == null;
    }

    getDeckByTopicTag(tag: string): Deck {
        return this.getDeck(TopicPath.getTopicPathFromTag(tag));
    }

    getDeck(topicPath: TopicPath): Deck {
        return this._getOrCreateDeck(topicPath, false);
    }

    getOrCreateDeck(topicPath: TopicPath): Deck {
        return this._getOrCreateDeck(topicPath, true);
    }

    private _getOrCreateDeck(topicPath: TopicPath, createAllowed: boolean): Deck {
        if (!topicPath.hasPath) {
            return this;
        }
        const t: TopicPath = topicPath.clone();
        const deckName: string = t.shift();
        for (const subdeck of this.subdecks) {
            if (deckName === subdeck.deckName) {
                return subdeck._getOrCreateDeck(t, createAllowed);
            }
        }

        let result: Deck = null;
        if (createAllowed) {
            const subdeck: Deck = new Deck(deckName, this /* parent */);
            this.subdecks.push(subdeck);
            result = subdeck._getOrCreateDeck(t, createAllowed);
        }
        return result;
    }

    getTopicPath(): TopicPath {
        if (this.isRootDeck) {
            return new TopicPath([]);
        }
        const parentPath = this.parent.getTopicPath();
        return new TopicPath([...parentPath.path, this.deckName]);
    }

    getRootDeck(): Deck {
        return this.isRootDeck ? this : this.parent.getRootDeck();
    }

    getCard(index: number, cardListType: CardListType): Card {
        const cardList: Card[] = this.getCardListForCardType(cardListType);
        return cardList[index];
    }

    getCardListForCardType(cardListType: CardListType): Card[] {
        switch (cardListType) {
            case CardListType.DueCard:
                return this.dueFlashcards;
            case CardListType.LearningCard:
                return this.learningFlashcards;
            case CardListType.NewCard:
            default:
                return this.newFlashcards;
        }
    }

    appendCard(topicPathList: TopicPathList, cardObj: Card): void {
        if (topicPathList.list.length == 0) {
            this.appendCardToRootDeck(cardObj);
        } else {
            // We explicitly are adding the same card object to each of the specified decks
            // This is required by getDistinctCardCount()
            for (const topicPath of topicPathList.list) {
                this.appendCard_SingleTopic(topicPath, cardObj);
            }
        }
    }

    appendCardToRootDeck(cardObj: Card): void {
        this.appendCard_SingleTopic(TopicPath.emptyPath, cardObj);
    }

    appendCard_SingleTopic(topicPath: TopicPath, cardObj: Card): void {
        const deck: Deck = this.getOrCreateDeck(topicPath);
        const cardList: Card[] = deck.getCardListForCardType(cardObj.cardListType);

        cardList.push(cardObj);
    }

    //
    // The question lists all the topics in which this card is included.
    // The topics are relative to the base deck, and this method must be called on that deck
    //
    deleteQuestionFromAllDecks(question: Question, exceptionIfMissing: boolean): void {
        for (const card of question.cards) {
            this.deleteCardFromAllDecks(card, exceptionIfMissing);
        }
    }

    deleteQuestion(question: Question, exceptionIfMissing: boolean): void {
        for (const card of question.cards) {
            this.deleteCardFromThisDeck(card, exceptionIfMissing);
        }
    }

    //
    // The card's question lists all the topics in which this card is included.
    // The topics are relative to the base deck, and this method must be called on that deck
    //
    deleteCardFromAllDecks(card: Card, exceptionIfMissing: boolean): void {
        for (const topicPath of card.question.topicPathList.list) {
            const deck: Deck = this.getDeck(topicPath);
            deck.deleteCardFromThisDeck(card, exceptionIfMissing);
        }
    }

    deleteCardFromThisDeck(card: Card, exceptionIfMissing: boolean): void {
        const newIdx = this.newFlashcards.indexOf(card);
        if (newIdx != -1) this.newFlashcards.splice(newIdx, 1);
        const dueIdx = this.dueFlashcards.indexOf(card);
        if (dueIdx != -1) this.dueFlashcards.splice(dueIdx, 1);
        const lrnIdx = this.learningFlashcards.indexOf(card);
        if (lrnIdx != -1) this.learningFlashcards.splice(lrnIdx, 1);
        if (newIdx == -1 && dueIdx == -1 && lrnIdx == -1 && exceptionIfMissing) {
            throw new Error(`deleteCardFromThisDeck: Card not found in deck: ${this.deckName}`);
        }
    }

    public removeCard(card: Card): void {
        this.deleteCardFromThisDeck(card, false);
    }

    deleteCardAtIndex(index: number, cardListType: CardListType): void {
        const cardList: Card[] = this.getCardListForCardType(cardListType);
        cardList.splice(index, 1);
    }

    toDeckArray(): Deck[] {
        const result: Deck[] = [];
        result.push(this);
        for (const subdeck of this.subdecks) {
            result.push(...subdeck.toDeckArray());
        }
        return result;
    }

    sortSubdecksList(): void {
        this.subdecks.sort((a, b) => {
            if (a.deckName < b.deckName) {
                return -1;
            } else if (a.deckName > b.deckName) {
                return 1;
            }
            return 0;
        });

        for (const deck of this.subdecks) {
            deck.sortSubdecksList();
        }
    }

    debugLogToConsole(desc: string = null, indent: number = 0) {
        let str: string = desc != null ? `${desc}: ` : "";
        console.debug((str += this.toString(indent)));
    }

    toString(indent: number = 0): string {
        let result: string = "";
        let indentStr: string = " ".repeat(indent * 4);

        result += `${indentStr}${this.deckName}\r\n`;
        indentStr += "  ";
        for (let i = 0; i < this.newFlashcards.length; i++) {
            const card = this.newFlashcards[i];
            result += `${indentStr}New: ${i}: cardId=${card.Id}\r\n`;
        }
        for (let i = 0; i < this.dueFlashcards.length; i++) {
            const card = this.dueFlashcards[i];
            const s = card.isDue ? "Due" : "Not due";
            result += `${indentStr}${s}: ${i}: cardId=${card.Id}\r\n`;
        }

        for (const subdeck of this.subdecks) {
            result += subdeck.toString(indent + 1);
        }
        return result;
    }

    clone(): Deck {
        return this.copyWithCardFilter(() => true);
    }

    copyWithCardFilter(predicate: (value: Card) => boolean, parent: Deck = null): Deck {
        const result: Deck = new Deck(this.deckName, parent);
        result.newFlashcards = [...this.newFlashcards.filter((card) => predicate(card))];
        result.dueFlashcards = [...this.dueFlashcards.filter((card) => predicate(card))];
        // 瀛︿範鍗＄墖涓嶅彈杩囨护鏉′欢褰卞搷锛岀洿鎺ュ鍒?
        // 杩欑‘淇濆湪 filterForRemainingCards 鏃跺涔犲崱鐗囦笉浼氬洜 isNew/isDue 鏉′欢琚涪寮?
        result.learningFlashcards = [...this.learningFlashcards];

        for (const s of this.subdecks) {
            const newParent = result;
            const newDeck = s.copyWithCardFilter(predicate, newParent);
            result.subdecks.push(newDeck);
        }
        return result;
    }

    static otherListType(cardListType: CardListType): CardListType {
        let result: CardListType;
        if (cardListType == CardListType.NewCard) result = CardListType.DueCard;
        else if (cardListType == CardListType.DueCard) result = CardListType.NewCard;
        else throw new Error("Invalid cardListType");
        return result;
    }
}

interface DeckLimits {
    newCards: number;
    dueCards: number;
}

export class DeckTreeFilter {
    static filterForReviewableCards(reviewableDeckTree: Deck): Deck {
        return reviewableDeckTree.copyWithCardFilter((card) => !card.question.hasEditLaterTag);
    }

    static filterForRemainingCards(
        questionPostponementList: IQuestionPostponementList,
        deckTree: Deck,
        reviewMode: FlashcardReviewMode,
    ): Deck {
        return deckTree.copyWithCardFilter((card) => {
            const isNewVal = card.isNew;
            const isDueVal = card.isDue;
            const isLearning = card.isLearning;
            const notBury = card.getIsNotBury(questionPostponementList);
            const pass =
                (reviewMode == FlashcardReviewMode.Cram || isNewVal || isDueVal || isLearning) &&
                notBury;
            return pass;
        });
    }

    /**
     * 搴旂敤姣忔棩涓婇檺杩囨护锛圓nki V3 璋冨害鍣ㄩ鏍?- 鑷《鍚戜笅婕忔枟鎴柇锛?
     *
     * 閲囩敤涓ユ牸鐨勮嚜椤跺悜涓嬶紙Top-Down锛夋湪妗跺師鐞嗭細
     * 1. 鍒濆浠庢棤闄愬ぇ棰濆害寮€濮嬨€?
     * 2. 鏌ヨ褰撳墠鑺傜偣鐨勮嚜韬彲鐢ㄩ檺棰濄€?
     * 3. 灏嗕紶鍏ョ殑鐖堕檺棰濅笌褰撳墠闄愰鍙栬緝灏忓€硷紝浣滀负瀹為檯鏈夋晥闄愰銆?
     * 4. 鎸夊疄闄呴檺棰濇敹闆嗗綋鍓嶈妭鐐圭洿灞炲崱鐗囷紝骞剁洿鎺ユ墸鍑忓紩鐢ㄥ璞′腑鐨勯檺棰濄€?
     * 5. 灏嗗悓灞炰簬杩欎竴灞傜骇鐨勫墿浣欓檺棰濆悜涓嬩紶閫掞紝璁╁瓙鑺傜偣浜夋姠銆?
     *
     * @param node 褰撳墠澶勭悊鐨勭墝缁勮妭鐐?
     * @param plugin 鎻掍欢瀹炰緥
     * @returns 搴旂敤闄愬埗鍚庣殑鏂扮墝缁勬爲
     */
    static filterByDailyLimits(node: Deck, plugin: SRPlugin): Deck {
        plugin.loadDailyDeckStats();
        // 浣跨敤鏃犻檺澶х殑鍒濆闄愰锛屼唬琛ㄦ鏃惰妭鐐规槸鏈€澶栧眰璧风偣
        const initialLimits: DeckLimits = { newCards: Infinity, dueCards: Infinity };
        return this._applyTopDownLimits(node, plugin, initialLimits);
    }

    private static _applyTopDownLimits(
        node: Deck,
        plugin: SRPlugin,
        currentLimits: DeckLimits,
    ): Deck {
        const settings = plugin.data.settings;

        const deckPath = node.getTopicPath().path.join("/") || node.deckName;
        const persistent = plugin.getDailyCounts(deckPath);

        const presetIndex = settings.deckPresetAssignment?.[deckPath] ?? 0;
        const preset = settings.deckOptionsPresets?.[presetIndex] || settings.deckOptionsPresets[0];

        // 1. 璁＄畻褰撳墠鑺傜偣鑷韩鐨勭粷瀵瑰墿浣欓厤棰?
        const myNewQuota = Math.max(0, (preset?.maxNewCards ?? 20) - persistent.new);
        const myDueQuota = Math.max(0, (preset?.maxReviews ?? 200) - persistent.review);

        // 2. 涓庣埗绾т紶涓嬫潵鐨勯厤棰濊繘琛屾瘮杈冿紝鍙栬緝灏忓€?(鏍稿績锛氱埗鐗岀粍鐨勬紡鏂楀彲浠ュ崱浣忓瓙鐗岀粍)
        currentLimits.newCards = Math.min(currentLimits.newCards, myNewQuota);
        currentLimits.dueCards = Math.min(currentLimits.dueCards, myDueQuota);

        if (settings.showRuntimeDebugMessages) {
            console.debug(
                `[SR-Debug] _applyTopDownLimits: deck='${deckPath}', myQuota={new:${myNewQuota}, due:${myDueQuota}}, effectiveLimit={new:${currentLimits.newCards}, due:${currentLimits.dueCards}}`,
            );
        }

        const result = new Deck(node.deckName, null);
        // 瀛︿範涓殑鍗＄墖閫氬父涓嶈闄愶紝鍏ㄩ儴鏀捐
        result.learningFlashcards = [...node.learningFlashcards];

        // 3. 浼樺厛鎷胯嚜宸辫繖灞傦紙鐩村睘鑺傜偣锛夌殑鍗＄墖锛屽苟瀹炴椂鎵ｅ噺鍙敤闄愰
        for (const card of node.newFlashcards) {
            if (currentLimits.newCards > 0) {
                result.newFlashcards.push(card);
                currentLimits.newCards--;
            }
        }
        for (const card of node.dueFlashcards) {
            if (currentLimits.dueCards > 0) {
                result.dueFlashcards.push(card);
                currentLimits.dueCards--;
            }
        }

        // 4. 鍚戝瓙鑺傜偣浼犻€掑墿浣欓厤棰?
        for (const child of node.subdecks) {
            // 銆愰噸瑕併€戝湪 JS 涓?currentLimits 鏄璞″紩鐢ㄤ紶閫掞紒
            // 杩欐剰鍛崇潃 child1 娑堣€楀畬閰嶉鍚庯紝child2 鐪嬪埌鐨?currentLimits 浼氱浉搴斿噺灏戯紝
            // 杩欏畬缇庢ā鎷熶簡 Anki 涓悓绾у瓙鐗岀粍鎸夌収椤哄簭娑堣€楃埗绾ч厤棰濈殑閫昏緫銆?
            const cappedChild = this._applyTopDownLimits(child, plugin, currentLimits);
            cappedChild.parent = result;
            result.subdecks.push(cappedChild);
        }

        return result;
    }
}

