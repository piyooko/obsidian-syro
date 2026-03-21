/**
 * 这个文件主要是干什么的：
 * [逻辑] 统计数据计算核心。
 * 定义了 `Stats` 类，用于在内存中实时维护和计算复习统计数据（如 Ease 分布、Interval 分布、New/Mature 计数等）。
 * 这些数据通常用于在统计弹窗中展示。
 *
 * 它在项目中属于：逻辑层 (Logic) / 统计 (Statistics)
 *
 * 它会用到哪些文件：
 * 1. src/dataStore/repetitionItem.ts
 * 2. src/util/NumberCountDict.ts
 *
 * 哪些文件会用到它：
 * 1. src/main.ts (持有 Stats 实例)
 * 2. src/ui/views/StatsModal.ts (展示数据)
 */
/**
 * [逻辑] 统计数据计算。
 */
import { CardListType } from "./Deck";
import { RepetitionItem } from "./dataStore/repetitionItem";
import { ValueCountDict } from "./util/NumberCountDict";
import { DateUtils } from "./util/utils_recall";

export class Stats {
    eases: ValueCountDict = new ValueCountDict();
    intervals: ValueCountDict = new ValueCountDict();
    delayedDays: ValueCountDict = new ValueCountDict();
    newCount: number = 0;
    onDueCount: number = 0;
    youngCount: number = 0;
    matureCount: number = 0;

    get totalCount(): number {
        return this.youngCount + this.matureCount;
    }

    public getTotalCount(cardListType: CardListType = CardListType.All): number {
        let result: number = 0;
        if (cardListType == CardListType.NewCard || cardListType == CardListType.All)
            result += this.newCount;
        if (cardListType == CardListType.DueCard || cardListType == CardListType.All)
            result += this.youngCount + this.matureCount;

        return result;
    }

    incrementNew() {
        this.newCount++;
    }

    private decrementNew() {
        if (this.newCount > 0) {
            this.newCount--;
        }
    }

    incrementOnDue() {
        this.onDueCount++;
    }

    private decrementOnDue() {
        if (this.onDueCount > 0) {
            this.onDueCount--;
        }
    }

    update(delayedDays: number, interval: number, ease: number) {
        this.intervals.incrementCount(interval);
        this.eases.incrementCount(ease);
        this.delayedDays.incrementCount(delayedDays);
        if (delayedDays <= 0) {
            this.incrementOnDue();
        }
        if (interval >= 32) {
            this.matureCount++;
        } else {
            this.youngCount++;
        }
    }

    updateStats(item: RepetitionItem, now?: number) {
        const scheduling = item?.getSched();
        if (item == null || !item.hasDue || scheduling == null) {
            this.incrementNew();
            return;
        }
        if (now == undefined) {
            now = Date.now();
        }

        const interval: number = parseInt(scheduling[2]),
            ease: number = parseFloat(scheduling[3]);
        const delayedDays: number = Math.ceil(
            (parseFloat(scheduling[1]) - now) / DateUtils.DAYS_TO_MILLIS,
        );
        this.update(delayedDays, interval, ease);
    }

    /**
     * decrementStats
     * should only use before save review response, before single note sync.
     * @param item
     * @param now
     * @returns
     */
    decrementStats(item: RepetitionItem, now?: number) {
        const scheduling = item.getSched();
        if (item == null) {
            return;
        }

        if (now == undefined) {
            now = Date.now();
        }
        if (item.hasDue && item.nextReview - now < 0) {
            this.decrementOnDue();
        } else if (item.isNew) {
            this.decrementNew();
            return;
        } else {
            return;
        }

        const interval: number = parseInt(scheduling[2]),
            ease: number = parseFloat(scheduling[3]);
        const delayedDays: number = Math.ceil(
            (window
                .moment(scheduling[1], ["YYYY-MM-DD", "DD-MM-YYYY", "ddd MMM DD YYYY"])
                .valueOf() -
                now) /
                DateUtils.DAYS_TO_MILLIS,
        );
        this.intervals.decrementCount(interval);
        this.eases.decrementCount(ease);
        this.delayedDays.decrementCount(delayedDays);

        if (interval >= 32) {
            this.matureCount--;
        } else {
            this.youngCount--;
        }
    }

    getMaxInterval(): number {
        return this.intervals.getMaxValue();
    }

    getAverageInterval(): number {
        return this.intervals.getTotalOfValueMultiplyCount() / this.totalCount;
    }

    getAverageEases(): number {
        return this.eases.getTotalOfValueMultiplyCount() / this.totalCount;
    }
}
