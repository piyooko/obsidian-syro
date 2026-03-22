/**
 * 闁哄鏅滈悷銈夋煂濠婂牆妫橀柛銉檮椤愯棄鈽夐幘瀛橆潡妞も晪绠撳浼搭敍濮橆剙褰欐繛瀵稿Л閸嬫挸鈽夐弬璺ㄥⅱ婵炲牊鍨块弫?
 * 闁诲氦顫夐惌顔剧不閻斿摜顩查柛鈥崇箚閸嬫挸顭ㄩ崘鐐╂繛鎴炴⒒婵炩偓闁靛棗绉归崹?(RepetitionItem) 闂佹眹鍔岀€氼參寮抽悢鐓庣妞ゆ柧鑼庢笟鈧畷鍦偓锝冨妷閸?
 * 闁诲海鎳撻崯顖毼ｉ幖浣告瀬闁绘鐗嗙粊锕傚箹鐎涙ɑ灏柤鍨灩閳ь剚绋掗敋闁稿绉归幆鍐礋椤掍椒绮柣蹇撶箰缁绘劕鐣烽悢鐓庣闁告劘娉曠粈澶愭煕濞嗘ê鐏熷ù婊勫笧閳ь剛鏁搁幊鎾惰姳閸欏鈻旈柍褜鍓欓锝夋偐閹绘帒鑰块梺?(Card) 闂佺懓鐡ㄩ悧鏃傜博鐎电濮柛銉㈡櫇閹冲鎮?(Note)闂?
 * 闂佸憡鐗曢幊搴ㄥ箚閸喓顩查柛鈩冾殢濡茶鈽夐弮鍌毿㈢€圭顭峰畷锝囨嫚瑜忕粈鍕攽閳ュ啿鈧悂藝閸欏鈻曢柣妯诲墯閸嬔囨煛娴ｈ棄鐒介柍褜鍏涢悞锕傤敆濠婂懏鍏滄い鏃傜摂閸嬔囨煛娴ｇ绨荤紒杈ㄥ哺婵″瓨鎷呴悾灞绢啀闁硅壈鎻俊鍥ㄦ叏閹间礁绠戝〒姘功缁€鍕攽?NextReview, Ease, FSRS Data闂佹寧绋戦ˇ閬嶆偤閹达箑违?
 * 濠殿噯绲界换瀣煂濠婂嫬绶炵€广儱瀚惁搴☆渻閵堝懐绉洪柍褜鍓氭穱铏规崲?fileID闂佹寧绋戦悧鍡涘极椤旂晫鈻旈柍褜鍓涢埀顒佺⊕椤ㄥ牓顢栨担鍦枖閻犲泧鍛槴闂佺绻愰悿鍥ㄧ閸儱绀嗛柡澶庢硶閺嗗﹪鏌熺喊妯轰壕闁诲繒鍋熼崑鐔封枔閹达箑妫橀柛銉檮椤愪粙鏌ㄥ☉妯肩劮闁逞屽墮婵傛梻绮径鎰強妞ゆ牗绮嶉弳蹇涙煛娴ｇ懓顥嬬紒顔肩У缁嬪鈧綆鍋嗛崹濂告煥?
 * 闁哄鏅滈悷锕傛偋闁秴绫嶉柣妯硅閸熷牓鏌￠崒姘煑婵炲棎鍨介獮鈧幖瀛樼箘閻ゅ嫬顭胯閸嬫盯宕硅ぐ鎺戠闁圭儤鍨圭喊宥夋煥濞戞瀚伴柛娅诲洦鍤傞柡鍌氱仢瑜扮姷绱掗姘肩吋闁稿繑蓱缁嬪顓奸崟顓犵崶闂備焦瀵ч悷銈囩礊閸涙潙违?
 *
 * 闁诲海鎳撻崯顐耿椤忓懌浜滈柛锔诲幗缁愭鈽夐幙鍐ㄥ箹闁活偅蓱缁傚秵鎯旈婊呯崶闂佽桨鑳舵晶妤€鐣垫担鑲濈喖鍨惧畷鍥ｅ亾妞嬪簼娌?(Data Model Layer)
 *
 * 闁诲海鎳撻崯鈺冩娴煎瓨鍋ㄩ柕濞垮劚閻撳倿鏌涘┑鎰胺缂併劍妞藉顒勫炊閿旂瓔鍋ㄩ梺?
 * 1. src/algorithms/fsrs.ts (FSRS 缂備胶濮甸〃鍡欐兜閸洖鏋侀柣妤€鐗嗙粊锔剧磽娴ｈ灏伴柣?
 * 2. src/algorithms/anki.ts (Anki 缂備胶濮甸〃鍡欐兜閸洖鏋侀柣妤€鐗嗙粊锔剧磽娴ｈ灏伴柣?
 *
 * 闂佸憡绻嶆禍娆戣姳濞差亜妫橀柛銉檮椤愯棄霉閸忓吋鐨戦柡浣靛€濆畷姘跺级鐠恒劍娈滈梺?
 * 1. src/dataStore/data.ts (闁诲孩绋掗敋闁?Item 闂佸憡甯楅〃澶愬Υ?
 * 2. src/algorithms/*.ts (缂備胶濮甸〃鍡欐兜閸洘鍎庨悗娑櫭径宥夋煙閸喚小缂?Item 闂佹眹鍔岀€氼參寮抽悢鐓庣?
 */
/**
 * [闂佽桨鑳舵晶妤€鐣垫担杞版勃闁稿矉濡囩粣妤呮偣閹邦喖鏋欓柣顓燁殜瀵偊鎮ч崼婵堛偊闂佹眹鍔岀€氼厾鈧灚姊圭粙濠囧川椤撶儐鍤欓梺闈涙濞村洭顢氭导鏉戠煑闁哄诞鍕伅闂佸憡鍔曢幊搴ㄦ偤閵娾晜鍋愰柤鍝ヮ暯閸嬫挻鎷呮笟顖氭倎闂佽崵鍋涢幗?[濠碘槅鍨埀顒€纾埀顒傦功 闁诲氦顫夐惌顔剧不閻旂厧鐏虫繝濠傚枤濡茶鈽夐弮鍌氣枅闁靛棗绉归崹鎯р攽閸喓鏆犻梺杞拌兌婢ф鐣垫担铏圭＜闁规儳顕埀顒夊灦閺佸秹宕煎┑鍡氼唹婵炲濮伴崕鎻捨ｉ幖浣哥闁挎稑瀚。濠氭煥濞戞ê顨欑紒鈥冲暣瀹曪綁顢涘▎搴ｉ瀺闂佸搫瀚烽崹閬嶅汲閿濆洤濮柛銉㈡櫇閹冲鎮规担绋跨盎缂佽鲸宀告俊?
 */
import { Notice } from "obsidian";
import { AnkiData } from "src/algorithms/anki";
import { balance } from "src/algorithms/balance/balance";
import { FsrsData } from "src/algorithms/fsrs";
import { globalDateProvider } from "src/util/DateProvider";
import { DateUtils, debug } from "src/util/utils_recall";

export enum RPITEMTYPE {
    NOTE = "note",
    CARD = "card",
}

/**
 * Card queue state enum (mirrors Anki cards.proto CardQueue)
 */
export enum CardQueue {
    Suspended = -1,
    New = 0,
    Learn = 1,
    Review = 2,
}

export interface FsrsReviewEvent {
    reviewId: number;
    rating: number;
    reviewType: number;
    reviewState: number;
    newInterval: number;
    previousInterval: number;
    newFactor: number;
    reviewDuration: number;
}

// 闂佹眹鍨婚崰鎰板垂濮橆厽濮滃┑鐘宠壘濞呫倗绱掗悪娆忓€婚悷顒勬煕閻戝棗鐏熺紒鏃€鎸抽幆?UUID闂佹寧绋戞總鏃傛閵夛缚绻?"i_lq5j9z_xk3a9b"
function generateUUID(): string {
    return "i_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 8);
}

/**
 * ReviewResult.
 */
export interface ReviewResult {
    /**
     * @type {boolean}
     */
    correct: boolean;
    /**
     * @type {number}
     */
    nextReview: number;
    reviewEvent?: FsrsReviewEvent | null;
}

/**
 * RepetitionItem.
 */
export class RepetitionItem {
    /**
     * @type {number}
     */
    nextReview: number;
    /**
     * @type {number}
     */
    ID: number;
    /**
     * @type {string}
     */
    fileID: string;
    /**
     * @type {string}
     */
    uuid: string;
    /**
     * @type {RPITEMTYPE}
     */
    itemType: RPITEMTYPE;
    /**
     * @type {string}
     */
    deckName: string;
    /**
     * @type {number}
     */
    timesReviewed: number;
    /**
     * @type {number}
     */
    timesCorrect: number;
    /**
     * @type {number}
     */
    errorStreak: number; // Needed to calculate leeches later on.
    /**
     * The current step index in the learning steps array.
     * null if not in learning phase (New or Review).
     * @type {number | null}
     */
    learningStep: number | null = null;
    /**
     * Card queue state (Anki-style explicit field).
     * Single source of truth for card state.
     * @type {CardQueue}
     */
    queue: CardQueue = CardQueue.New;
    /**
     * Note priority (1-10)
     * @type {number}
     */
    priority: number = 5;
    /**
     * @type {any}
     */

    data: unknown; // Additional data, determined by the selected algorithm.

    static create(item: RepetitionItem) {
        const newItem = new RepetitionItem();
        Object.assign(newItem, item);

        if (!newItem.uuid) {
            newItem.uuid = generateUUID();
        }

        // Data migration: derive queue from legacy fields if missing
        if (newItem.queue === undefined || newItem.queue === null) {
            if (newItem.timesReviewed === 0) {
                newItem.queue = CardQueue.New;
            } else if (newItem.learningStep !== null && newItem.learningStep !== undefined) {
                newItem.queue = CardQueue.Learn;
            } else {
                newItem.queue = CardQueue.Review;
            }
        }

        // Restore nextReview from algorithm data if it's 0 but data has it
        if (newItem.isFsrs) {
            const data = newItem.data as FsrsData;
            if (typeof data.due === "string") data.due = new Date(data.due);
            if (typeof data.last_review === "string") data.last_review = new Date(data.last_review);

            if (newItem.nextReview === 0 && data.due && data.due.getTime() > 0) {
                newItem.nextReview = data.due.getTime();
            }
        } else if (newItem.itemType === RPITEMTYPE.CARD) {
            const data = newItem.data as AnkiData;
            const legacyItem = item as { nextReviewStr?: string };
            if (newItem.nextReview === 0 && legacyItem.nextReviewStr) {
                // Legacy support if needed
            }
        }

        return newItem;
    }

    constructor(
        id: number = -1,
        fileID: string = "",
        itemType: RPITEMTYPE = RPITEMTYPE.NOTE,
        deckName: string = "default",
        data: unknown = {},
    ) {
        this.nextReview = 0;
        this.ID = id;
        this.fileID = fileID;
        this.uuid = generateUUID();
        this.itemType = itemType;
        this.deckName = deckName;
        this.timesReviewed = 0;
        this.timesCorrect = 0;
        this.errorStreak = 0;
        this.queue = CardQueue.New;
        this.data = data;
    }

    /**
     * @param {ReviewResult} result
     * @return {*}
     */
    reviewUpdate(result: ReviewResult) {
        const old_nr = this.nextReview;
        const newitvl = balance(result.nextReview / DateUtils.DAYS_TO_MILLIS, this.itemType);
        this.nextReview = DateUtils.fromNow(newitvl * DateUtils.DAYS_TO_MILLIS).getTime();
        this.timesReviewed += 1;
        if (result.correct) {
            this.timesCorrect += 1;
            this.errorStreak = 0;
        } else {
            this.errorStreak += 1;
        }
        if (this.nextReview - Date.now() < 100) {
            new Notice(
                "Error: reviewUpdate: " +
                    this.nextReview +
                    "\t last:" +
                    old_nr +
                    "\t itvl:" +
                    result.nextReview +
                    "\t new itvl:" +
                    newitvl,
            );
        }
        // const dt = new Date(this.nextReview).toISOString();
        // debug("review result after:", [
        //     this.nextReview,
        //     dt,
        //     (this.nextReview - Date.now()) / DateUtils.DAYS_TO_MILLIS,
        //     result.nextReview / DateUtils.DAYS_TO_MILLIS,
        //     newitvl,
        // ]);
    }

    /**
     *
     * @returns ["due-interval-ease00", dueString, interval, ease] | null for new
     */
    getSched(): RegExpMatchArray | null {
        if (this.queue === CardQueue.New) {
            return null; // new card doesn't need schedinfo
        }

        let ease: number;
        let interval: number;

        if (this.isFsrs) {
            const data = this.data as FsrsData;
            interval = data.scheduled_days;
            // ease just used for StatsChart, not review scheduling.
            ease = data.state;
        } else {
            const data: AnkiData = this.data as AnkiData;
            ease = data.ease;
            interval = data.lastInterval;
            // const interval = this.data.iteration;
        }

        const sched = [this.ID, this.nextReview, interval, ease] as unknown as RegExpMatchArray;
        return sched;
    }

    get isFsrs(): boolean {
        const has = this.data && Object.prototype.hasOwnProperty.call(this.data, "state");
        if (this.ID === 4) {
            // console.debug(`[SR-Debug] item4.isFsrs check: hasState=${has}, data=`, this.data);
        }
        return !!has;
    }

    /**
     * Is the card in a learning phase? (Based on explicit queue field)
     */
    get isInLearningPhase(): boolean {
        return this.queue === CardQueue.Learn;
    }

    /**
     * Returns whether this learning card is reviewable in the current session.
     * The check intentionally matches FlashcardReviewSequencer.advanceToNextCard():
     * show learning cards only when they are due now or within the learn-ahead window.
     */
    isReviewableLearning(now: number = Date.now(), learnAheadMillis: number = 0): boolean {
        if (this.queue !== CardQueue.Learn) {
            return false;
        }

        return this.nextReview <= now + Math.max(0, learnAheadMillis);
    }

    getSchedDurAsStr() {
        const sched = this.getSched();
        if (sched == null) return null;

        const due = window.moment(this.nextReview);
        sched[1] = due.format("YYYY-MM-DD");
        sched[2] = parseFloat(sched[2]).toFixed(0);
        return sched;
    }

    updateSched(sched: RegExpMatchArray | number[] | string[], correct?: boolean) {
        const data: AnkiData = this.data as AnkiData;

        this.nextReview =
            typeof sched[1] == "number"
                ? Number(sched[1])
                : window
                      .moment(sched[1], ["YYYY-MM-DD", "DD-MM-YYYY", "ddd MMM DD YYYY"])
                      .valueOf();
        data.lastInterval = Number(sched[2]);
        data.ease = Number(sched[3]);

        if (correct != null) {
            this.timesReviewed += 1;
            if (correct) {
                this.timesCorrect += 1;
                this.errorStreak = 0;
            } else {
                this.errorStreak += 1;
            }
        }
    }

    get interval(): number {
        const sched = this.getSched();
        return sched ? Number(sched[2]) : 0;
    }

    updateDueByInterval(newitvl: number, newdue?: number) {
        // 240212-interval will be used to calc current retention, shoudn't update.
        const now = Date.now();
        const enableBalance = newdue == undefined;
        const oitvl = this.interval,
            odue = this.hasDue ? this.nextReview : now;

        if (this.isFsrs) {
            const data = this.data as FsrsData;

            newdue = newdue
                ? newdue
                : // : odue - (data.scheduled_days - newitvl) * DateUtils.DAYS_TO_MILLIS;
                  data.last_review.getTime() + newitvl * DateUtils.DAYS_TO_MILLIS;
            // data.scheduled_days = newitvl;
            data.due = new Date(newdue);
        } else {
            newdue = newdue ? newdue : odue - (this.interval - newitvl) * DateUtils.DAYS_TO_MILLIS;
            // (this.data as AnkiData).lastInterval = newitvl;
        }

        if (enableBalance) {
            let days = Math.max(0, newdue - now) / DateUtils.DAYS_TO_MILLIS;
            days = balance(days, this.itemType);
            console.debug("days:", days);
            const nextInterval = days * DateUtils.DAYS_TO_MILLIS;
            newdue = nextInterval + now;
        }

        console.debug({
            oitvl,
            newitvl,
            odue: new Date(this.nextReview).toISOString(),
            ndue: new Date(newdue).toISOString(),
        });
        if (this.isFsrs) {
            (this.data as FsrsData).due = new Date(newdue);
        }
        this.nextReview = newdue;
    }

    get ease(): number {
        const sched = this.getSched();
        return sched ? Number(sched[3]) : 0;
    }

    /**
     * Is this a new card? (Based on explicit queue field)
     */
    get isNew(): boolean {
        return this.queue === CardQueue.New;
    }

    /**
     * Should this card be reviewed right now? (Based on explicit queue field)
     */
    get isDue(): boolean {
        return this.queue === CardQueue.Review && this.nextReview <= Date.now();
    }

    get hasDue() {
        try {
            if (this.nextReview > 0 || this.timesReviewed > 0) {
                return true;
            } else {
                return false;
            }
        } catch (error) {
            return false;
        }
    }

    get isTracked() {
        return this.fileID !== "";
    }

    get isCard() {
        return this.itemType === RPITEMTYPE.CARD;
    }

    setTracked(fileID: string) {
        this.fileID = fileID;
    }

    setUntracked() {
        this.fileID = "";
    }

    /**
     * updateDeckName, if different, uupdate. Else do none thing.
     * @param deckName
     * @param isCard
     */
    updateDeckName(deckName: string, isCard: boolean) {
        if (this.deckName !== deckName) {
            this.deckName = deckName;
        }
        if (!Object.prototype.hasOwnProperty.call(this, "itemType")) {
            this.itemType = isCard ? RPITEMTYPE.CARD : RPITEMTYPE.NOTE;
        }
    }

    /**
     * updateItem AlgorithmData.
     * @param id
     * @param key
     * @param value
     */
    updateAlgorithmData(key: string, value: unknown) {
        try {
            if (value == null) {
                throw new Error("updateAlgorithmData get null value");
            }
            (this.data as Record<string, unknown>)[key] = value;
        } catch (error) {
            console.debug(error);
        }
    }
}

