/**
 * Scheduling model and helpers for flashcards.
 * This file parses `<!--SR:...-->` comments and computes updated schedule values.
 */








import { Moment } from "moment";
import {
    LEGACY_SCHEDULING_EXTRACTOR,
    MULTI_SCHEDULING_EXTRACTOR,
    TICKS_PER_DAY,
} from "./constants";
import { INoteEaseList } from "./NoteEaseList";
import { ReviewResponse, schedule } from "./scheduling";
import { SRSettings } from "./settings";
import { formatDate_YYYY_MM_DD } from "./util/utils";
import { DateUtil, globalDateProvider } from "./util/DateProvider";

export class CardScheduleInfo {
    dueDate: Moment;
    interval: number;
    ease: number;
    delayBeforeReviewTicks: number;

    // A question can have multiple cards. The schedule info for all sibling cards are formatted together
    // in a single <!--SR: --> comment, such as:
    // <!--SR:!2023-09-02,4,270!2023-09-02,5,270!2023-09-02,6,270!2023-09-02,7,270-->
    //
    // However, not all sibling cards may have been reviewed. Therefore we need a method of indicating that a particular card
    // has not been reviewed, and should be considered "new"
    // This is done by using this magic value for the date
    private static dummyDueDateForNewCard: string = "2000-01-01";

    constructor(dueDate: Moment, interval: number, ease: number, delayBeforeReviewTicks: number) {
        this.dueDate = dueDate;
        this.interval = interval;
        this.ease = ease;
        this.delayBeforeReviewTicks = delayBeforeReviewTicks;
    }

    get delayBeforeReviewDaysInt(): number {
        return Math.ceil(this.delayBeforeReviewTicks / TICKS_PER_DAY);
    }

    isDue(): boolean {
        // return this.dueDate.isSameOrBefore(globalDateProvider.today);
        return (
            this.dueDate.isSameOrBefore(globalDateProvider.today) ||
            (this.dueDate.isSameOrBefore(globalDateProvider.endofToday) && this.interval >= 1)
        );
    }

    isDummyScheduleForNewCard(): boolean {
        // 1. 原始判断：魔法日期 2000-01-01
        // 注意：dueDate 也可能是数字时间戳 (number)
        const dueDateVal = this.dueDate.valueOf();
        const dummyDateVal = DateUtil.dateStrToMoment(
            CardScheduleInfo.dummyDueDateForNewCard,
        ).valueOf();

        if (dueDateVal === dummyDateVal) {
            return true;
        }
        // 2. interval 或 ease 为 NaN → 调度数据损坏，视为新卡
        if (isNaN(this.interval) || isNaN(this.ease)) {
            return true;
        }
        return false;
    }

    static getDummyScheduleForNewCard(baseEase: number): CardScheduleInfo {
        return CardScheduleInfo.fromDueDateStr(
            CardScheduleInfo.dummyDueDateForNewCard,
            CardScheduleInfo.initialInterval,
            baseEase,
            0,
        );
    }

    static fromDueDateStr(
        dueDateStr: string,
        interval: number,
        ease: number,
        delayBeforeReviewTicks: number,
    ) {
        const dueDateTicks: Moment = DateUtil.dateStrToMoment(dueDateStr);
        return new CardScheduleInfo(dueDateTicks, interval, ease, delayBeforeReviewTicks);
    }

    static fromDueDateMoment(
        dueDateTicks: Moment,
        interval: number,
        ease: number,
        delayBeforeReviewTicks: number,
    ) {
        return new CardScheduleInfo(dueDateTicks, interval, ease, delayBeforeReviewTicks);
    }

    static get initialInterval(): number {
        return 1.0;
    }

    formatDueDate(): string {
        return formatDate_YYYY_MM_DD(this.dueDate);
    }

    formatSchedule() {
        return `!${this.formatDueDate()},${this.interval},${this.ease}`;
    }
}

export interface ICardScheduleCalculator {
    getResetCardSchedule(): CardScheduleInfo;
    getNewCardSchedule(
        response: ReviewResponse,
        notePath: string,
        learningStepsMinutes?: number[],
    ): CardScheduleInfo;
    calcUpdatedSchedule(
        response: ReviewResponse,
        schedule: CardScheduleInfo,
        lapseStepsMinutes?: number[],
    ): CardScheduleInfo;
}

export class CardScheduleCalculator {
    settings: SRSettings;
    noteEaseList: INoteEaseList;
    dueDatesFlashcards: Record<number, number> = {}; // Record<# of days in future, due count>

    constructor(settings: SRSettings, noteEaseList: INoteEaseList) {
        this.settings = settings;
        this.noteEaseList = noteEaseList;
    }

    getResetCardSchedule(): CardScheduleInfo {
        const interval = CardScheduleInfo.initialInterval;
        const ease = this.settings.baseEase;
        const dueDate = globalDateProvider.today.add(interval, "d");
        const delayBeforeReview = 0;
        return CardScheduleInfo.fromDueDateMoment(dueDate, interval, ease, delayBeforeReview);
    }

    /**
     * Schedule a new card, optionally using preset learning steps.
     */



    getNewCardSchedule(
        response: ReviewResponse,
        notePath: string,
        learningStepsMinutes?: number[],
    ): CardScheduleInfo {
        let initial_ease: number = this.settings.baseEase;
        if (this.noteEaseList.hasEaseForPath(notePath)) {
            initial_ease = Math.round(this.noteEaseList.getEaseByPath(notePath));
        }
        const delayBeforeReview = 0;

        // Use learning steps when the preset provides them.
        if (learningStepsMinutes && learningStepsMinutes.length > 0) {
            let intervalMinutes: number;

            if (response === ReviewResponse.Reset || response === ReviewResponse.Hard) {
                // Reset/Hard uses the first step.
                intervalMinutes = learningStepsMinutes[0];
            } else if (response === ReviewResponse.Good) {
                // Good prefers the second step when available.
                intervalMinutes =
                    learningStepsMinutes.length > 1
                        ? learningStepsMinutes[1]
                        : learningStepsMinutes[0];
            } else {
                // Easy uses the final learning step.
                intervalMinutes = learningStepsMinutes[learningStepsMinutes.length - 1];
            }

            // 转换为天数（interval 字段以天为单位）
            const intervalDays = intervalMinutes / 1440;
            // Keep minute-level precision for short learning steps.
            const dueDate = window.moment().add(intervalMinutes, "minutes");
            return CardScheduleInfo.fromDueDateMoment(
                dueDate,
                intervalDays,
                initial_ease,
                delayBeforeReview,
            );
        }

        // Fall back to the global scheduling algorithm when no preset steps exist.
        const schedObj: Record<string, number> = schedule(
            response,
            CardScheduleInfo.initialInterval,
            initial_ease,
            delayBeforeReview,
            this.settings,
            this.dueDatesFlashcards,
        );

        const interval = schedObj.interval;
        const ease = schedObj.ease;
        const dueDate = globalDateProvider.today.add(interval, "d");
        return CardScheduleInfo.fromDueDateMoment(dueDate, interval, ease, delayBeforeReview);
    }

    /**
     * Update a review card schedule, optionally using preset relearning steps.
     */



    calcUpdatedSchedule(
        response: ReviewResponse,
        cardSchedule: CardScheduleInfo,
        lapseStepsMinutes?: number[],
    ): CardScheduleInfo {
        // Only Reset uses the explicit relearning step; Hard still uses the normal algorithm.
        if (
            response === ReviewResponse.Reset &&
            lapseStepsMinutes &&
            lapseStepsMinutes.length > 0
        ) {
            const intervalMinutes = lapseStepsMinutes[0];
            const intervalDays = intervalMinutes / 1440;
            const ease = Math.max(130, cardSchedule.ease - 20); // 降低 ease
            const dueDate = window.moment().add(intervalMinutes, "minutes");
            return CardScheduleInfo.fromDueDateMoment(dueDate, intervalDays, ease, 0);
        }

        // 原有调度逻辑
        const schedObj: Record<string, number> = schedule(
            response,
            cardSchedule.interval,
            cardSchedule.ease,
            cardSchedule.delayBeforeReviewTicks,
            this.settings,
            this.dueDatesFlashcards,
        );
        const interval = schedObj.interval;
        const ease = schedObj.ease;
        const dueDate = globalDateProvider.today.add(interval, "d");
        const delayBeforeReview = 0;
        return CardScheduleInfo.fromDueDateMoment(dueDate, interval, ease, delayBeforeReview);
    }
}

export class NoteCardScheduleParser {
    static createCardScheduleInfoList(questionText: string): CardScheduleInfo[] {
        let scheduling: RegExpMatchArray[] = [...questionText.matchAll(MULTI_SCHEDULING_EXTRACTOR)];
        if (scheduling.length === 0)
            scheduling = [...questionText.matchAll(LEGACY_SCHEDULING_EXTRACTOR)];

        return this.createInfoList(scheduling);
    }

    static createInfo_algo(scheduling: RegExpMatchArray | null): CardScheduleInfo | null {
        if (scheduling == null) {
            return null;
        }
        return this.createInfoList_algo([scheduling])[0] ?? null;
    }

    static createInfoList(scheduling: RegExpMatchArray[]) {
        const result: CardScheduleInfo[] = [];
        for (let i = 0; i < scheduling.length; i++) {
            const match: RegExpMatchArray = scheduling[i];
            const dueDateStr = match[1];
            const interval = parseInt(match[2]);
            const ease = parseInt(match[3]);
            const dueDate: Moment = DateUtil.dateStrToMoment(dueDateStr);
            const delayBeforeReviewTicks: number =
                dueDate.valueOf() - globalDateProvider.today.valueOf();

            const info: CardScheduleInfo = new CardScheduleInfo(
                dueDate,
                interval,
                ease,
                delayBeforeReviewTicks,
            );
            result.push(info);
        }
        return result;
    }

    static createInfoList_algo(scheduling: RegExpMatchArray[]) {
        const result: CardScheduleInfo[] = [];
        for (let i = 0; i < scheduling.length; i++) {
            const match: RegExpMatchArray = scheduling[i];
            if (match == null) {
                result.push(CardScheduleInfo.getDummyScheduleForNewCard(0));
            } else {
                const dueDateNum = Number(match[1]);
                const interval = Number(match[2]);
                const ease = Number(match[3]);
                const dueDate: Moment = window.moment(dueDateNum);
                const delayBeforeReviewTicks: number =
                    dueDateNum - globalDateProvider.today.valueOf();

                // console.log(`[SR-Debug] createInfoList_algo: duoNum=${dueDateNum}, today=${globalDateProvider.today.valueOf()}, delay=${delayBeforeReviewTicks}`);

                const info: CardScheduleInfo = new CardScheduleInfo(
                    dueDate,
                    interval,
                    ease,
                    delayBeforeReviewTicks,
                );
                result.push(info);
            }
        }
        return result;
    }

    static removeCardScheduleInfo(questionText: string): string {
        return questionText.replace(/<!--SR:.+-->/gm, "");
    }
}
