import { moment } from "obsidian";
import {
    LEGACY_SCHEDULING_EXTRACTOR,
    MULTI_SCHEDULING_EXTRACTOR,
    TICKS_PER_DAY,
} from "./constants";
import { formatDate_YYYY_MM_DD } from "./util/utils";
import { DateUtil, globalDateProvider, type MomentValue } from "./util/DateProvider";

const momentFactory = moment as unknown as (...args: unknown[]) => MomentValue;

export class CardScheduleInfo {
    dueDate: MomentValue;
    interval: number;
    ease: number;
    delayBeforeReviewTicks: number;

    private static dummyDueDateForNewCard = "2000-01-01";

    constructor(
        dueDate: MomentValue,
        interval: number,
        ease: number,
        delayBeforeReviewTicks: number,
    ) {
        this.dueDate = dueDate;
        this.interval = interval;
        this.ease = ease;
        this.delayBeforeReviewTicks = delayBeforeReviewTicks;
    }

    get delayBeforeReviewDaysInt(): number {
        return Math.ceil(this.delayBeforeReviewTicks / TICKS_PER_DAY);
    }

    isDue(): boolean {
        return (
            this.dueDate.isSameOrBefore(globalDateProvider.today) ||
            (this.dueDate.isSameOrBefore(globalDateProvider.endofToday) && this.interval >= 1)
        );
    }

    isDummyScheduleForNewCard(): boolean {
        const dueDateVal = this.dueDate.valueOf();
        const dummyDateVal = DateUtil.dateStrToMoment(
            CardScheduleInfo.dummyDueDateForNewCard,
        ).valueOf();

        if (dueDateVal === dummyDateVal) {
            return true;
        }
        return isNaN(this.interval) || isNaN(this.ease);
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
    ): CardScheduleInfo {
        const dueDateTicks = DateUtil.dateStrToMoment(dueDateStr);
        return new CardScheduleInfo(dueDateTicks, interval, ease, delayBeforeReviewTicks);
    }

    static fromDueDateMoment(
        dueDateTicks: MomentValue,
        interval: number,
        ease: number,
        delayBeforeReviewTicks: number,
    ): CardScheduleInfo {
        return new CardScheduleInfo(dueDateTicks, interval, ease, delayBeforeReviewTicks);
    }

    static get initialInterval(): number {
        return 1.0;
    }

    formatDueDate(): string {
        return formatDate_YYYY_MM_DD(this.dueDate);
    }

    formatSchedule(): string {
        return `!${this.formatDueDate()},${this.interval},${this.ease}`;
    }
}

export class NoteCardScheduleParser {
    static createCardScheduleInfoList(questionText: string): CardScheduleInfo[] {
        let scheduling = [...questionText.matchAll(MULTI_SCHEDULING_EXTRACTOR)];
        if (scheduling.length === 0) {
            scheduling = [...questionText.matchAll(LEGACY_SCHEDULING_EXTRACTOR)];
        }

        return this.createInfoList(scheduling);
    }

    static createInfo_algo(scheduling: RegExpMatchArray | null): CardScheduleInfo | null {
        if (scheduling == null) {
            return null;
        }
        return this.createInfoList_algo([scheduling])[0] ?? null;
    }

    static createInfoList(scheduling: RegExpMatchArray[]): CardScheduleInfo[] {
        const result: CardScheduleInfo[] = [];
        for (const match of scheduling) {
            const dueDateStr = match[1];
            const interval = parseInt(match[2]);
            const ease = parseInt(match[3]);
            const dueDate = DateUtil.dateStrToMoment(dueDateStr);
            const delayBeforeReviewTicks = dueDate.valueOf() - globalDateProvider.today.valueOf();

            result.push(new CardScheduleInfo(dueDate, interval, ease, delayBeforeReviewTicks));
        }
        return result;
    }

    static createInfoList_algo(scheduling: RegExpMatchArray[]): CardScheduleInfo[] {
        const result: CardScheduleInfo[] = [];
        for (const match of scheduling) {
            if (match == null) {
                result.push(CardScheduleInfo.getDummyScheduleForNewCard(0));
                continue;
            }

            const dueDateNum = Number(match[1]);
            const interval = Number(match[2]);
            const ease = Number(match[3]);
            const dueDate = momentFactory(dueDateNum);
            const delayBeforeReviewTicks = dueDateNum - globalDateProvider.today.valueOf();

            result.push(new CardScheduleInfo(dueDate, interval, ease, delayBeforeReviewTicks));
        }
        return result;
    }

    static removeCardScheduleInfo(questionText: string): string {
        return questionText.replace(/<!--SR:.+-->/gm, "");
    }
}
