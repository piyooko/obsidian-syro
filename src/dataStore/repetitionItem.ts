/**
 * 这个文件主要是干什么的：
 * 定义了“复习项” (RepetitionItem) 的数据模型。
 * 它是数据库中存储的最小单元，可以对应一张卡片 (Card) 或一篇笔记 (Note)。
 * 包含了复习历史（如复习次数、正确次数）、调度状态（如 NextReview, Ease, FSRS Data）等。
 * 每个复习项通过 fileID（唯一字符串）关联到它所属的文件，而不是用数组下标，
 * 这样无论文件怎么增删排序，关联关系都不会错位。
 *
 * 它在项目中属于：数据模型层 (Data Model Layer)
 *
 * 它会用到哪些文件：
 * 1. src/algorithms/fsrs.ts (FSRS 算法数据结构)
 * 2. src/algorithms/anki.ts (Anki 算法数据结构)
 *
 * 哪些文件会用到它：
 * 1. src/dataStore/data.ts (存储 Item 列表)
 * 2. src/algorithms/*.ts (算法直接操作 Item 的数据)
 */
/**
 * [数据层：负责数据的持久化、读取和内存状态管理] [模型] 定义“复习项”的数据结构（可以是卡片，也可以是整篇笔记）。
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

// 生成轻量级且唯一的 UUID，例如 "i_lq5j9z_xk3a9b"
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
            if (newItem.nextReview === 0 && (item as any).nextReviewStr) {
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
            // console.log(`[SR-Debug] item4.isFsrs check: hasState=${has}, data=`, this.data);
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
     * Is the card displayable as "learning" in the UI?
     */
    get isDisplayableLearning(): boolean {
        return (
            this.queue === CardQueue.Learn &&
            this.nextReview <= globalDateProvider.endofToday.valueOf()
        );
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
        this.isFsrs ? ((this.data as FsrsData).due = new Date(newdue)) : null;
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
                throw new Error("updateAlgorithmData get null value: " + value);
            }
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            this.data[key] = value;
        } catch (error) {
            console.log(error);
        }
    }
}
