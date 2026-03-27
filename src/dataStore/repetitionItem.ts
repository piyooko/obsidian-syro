import { Notice } from "obsidian";
import { balance } from "src/algorithms/balance/balance";
import { FsrsData } from "src/algorithms/fsrs";
import { t } from "src/lang/helpers";
import { DateUtils } from "src/util/utils_recall";
import { isRecord } from "src/util/typeGuards";
import { State } from "ts-fsrs";

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

type LegacyScheduleData = {
    ease: number;
    lastInterval: number;
};

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

function mapFsrsStateToQueue(state: unknown): CardQueue {
    switch (state) {
        case State.Learning:
        case State.Relearning:
            return CardQueue.Learn;
        case State.Review:
            return CardQueue.Review;
        case State.New:
        default:
            return CardQueue.New;
    }
}

function getFsrsScheduledDays(data: FsrsData, fallbackMs?: number): number {
    if (data.due instanceof Date && data.last_review instanceof Date) {
        return Math.max(
            0,
            (data.due.getTime() - data.last_review.getTime()) / DateUtils.DAYS_TO_MILLIS,
        );
    }

    if (typeof data.scheduled_days === "number" && Number.isFinite(data.scheduled_days)) {
        return Math.max(0, data.scheduled_days);
    }

    if (typeof fallbackMs === "number" && Number.isFinite(fallbackMs)) {
        return Math.max(0, fallbackMs / DateUtils.DAYS_TO_MILLIS);
    }

    return 0;
}

function repairLegacyFsrsLearningState(item: RepetitionItem, data: FsrsData): void {
    if (
        item.queue !== CardQueue.Learn ||
        item.learningStep === null ||
        item.learningStep === undefined ||
        data.state !== State.Review
    ) {
        return;
    }

    data.state = State.Learning;

    if (item.nextReview > 0) {
        data.due = new Date(item.nextReview);
    }

    data.scheduled_days = getFsrsScheduledDays(
        data,
        data.last_review instanceof Date ? item.nextReview - data.last_review.getTime() : undefined,
    );
}

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
            if (newItem.isFsrs) {
                newItem.queue = mapFsrsStateToQueue((newItem.data as FsrsData).state);
            } else if (newItem.timesReviewed === 0) {
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
            repairLegacyFsrsLearningState(newItem, data);
            if (getFsrsScheduledDays(data) < 1) {
                data.scheduled_days = getFsrsScheduledDays(data);
            }

            if (newItem.nextReview === 0 && data.due && data.due.getTime() > 0) {
                newItem.nextReview = data.due.getTime();
            }
        } else if (newItem.itemType === RPITEMTYPE.CARD) {
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
        if (this.isFsrs) {
            this.reviewUpdateFsrs(result);
            return;
        }

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
                t("NOTICE_REVIEW_UPDATE_ERROR", {
                    nextReview: this.nextReview,
                    lastReview: old_nr,
                    reviewInterval: result.nextReview,
                    balancedInterval: newitvl,
                }),
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

    private reviewUpdateFsrs(result: ReviewResult) {
        const data = this.data as FsrsData;
        const scheduledDays = getFsrsScheduledDays(data, result.nextReview);

        if (scheduledDays < 1 || !Number.isFinite(data.scheduled_days)) {
            data.scheduled_days = scheduledDays;
        }

        this.nextReview =
            data.due instanceof Date
                ? data.due.getTime()
                : DateUtils.fromNow(result.nextReview).getTime();
        this.queue = mapFsrsStateToQueue(data.state);
        this.learningStep = null;
        this.timesReviewed += 1;

        if (result.correct) {
            this.timesCorrect += 1;
            this.errorStreak = 0;
        } else {
            this.errorStreak += 1;
        }
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
            const exactScheduledDays = getFsrsScheduledDays(data);
            interval =
                exactScheduledDays > 0 && exactScheduledDays < 1
                    ? exactScheduledDays
                    : data.scheduled_days;
            if (!Number.isFinite(interval)) {
                interval = exactScheduledDays;
            }
            // ease just used for StatsChart, not review scheduling.
            ease = data.state;
        } else {
            const data = this.data as LegacyScheduleData;
            ease = data.ease;
            interval = data.lastInterval;
            // const interval = this.data.iteration;
        }

        const sched = [this.ID, this.nextReview, interval, ease] as unknown as RegExpMatchArray;
        return sched;
    }

    get isFsrs(): boolean {
        const has = isRecord(this.data) && "state" in this.data;
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
        const data = this.data as LegacyScheduleData;

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
        } catch {
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
