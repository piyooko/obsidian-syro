/**
 * [辅助] 推迟复习的计算逻辑。
 */
import { RepetitionItem } from "src/dataStore/repetitionItem";
import { globalDateProvider } from "src/util/DateProvider";
import { DateUtils, debug } from "src/util/utils_recall";
import { FsrsData } from "../fsrs";
import { AnkiData } from "../anki";
import { WMSData } from "../weightedMultiplier";

export function postponeItems(items: RepetitionItem[], days?: number): RepetitionItem[] {
    const now = Date.now();
    const newdue: number = days ? now + days * DateUtils.DAYS_TO_MILLIS : undefined;

    if (days && days > 0) {
        manualPostpone(items, days);
        return items;
    }

    let fltItems = items.filter((item) => item.isTracked);
    const safe_fltItems = fltItems
        .filter((item) => item.nextReview < globalDateProvider.startofToday.valueOf())
        .sort((a, b) => currentRetention(a) - currentRetention(b))
        // https://github.com/open-spaced-repetition/fsrs4anki-helper/blob/58bcfcf8b5eeb60835c5cbde1d0d0ef769af62b0/schedule/postpone.py#L73
        .filter((item) => {
            // currentR>0.65
            console.debug("current R:", currentRetention(item), 1 / currentRetention(item) - 1);
            return currentRetention(item) > 0.65;
        });
    const safe_cnt = safe_fltItems.length;
    fltItems = days > 0 ? fltItems : safe_fltItems;
    debug("postpone", 0, { safe_cnt, days });
    postpone(fltItems, newdue);
    return items;
}

function manualPostpone(items: RepetitionItem[], days: number) {
    const now = Date.now();
    const newdue = now + days * DateUtils.DAYS_TO_MILLIS;

    items.forEach((item) => {
        if (!item.isTracked) return;

        item.nextReview = newdue;

        if (item.isFsrs) {
            const data = item.data as FsrsData;
            data.due = new Date(newdue);
            data.scheduled_days = days;
            // 将"上次复习时间"更新为现在，这意味着此次操作被视为一次手动调度
            // 下次复习时，elapsed_days 将基于这个新的 last_review 计算
            data.last_review = new Date(now);
        } else if (Object.prototype.hasOwnProperty.call(item.data, "currentInterval")) {
            // WeightedMultiplier 算法：间隔继承机制
            // 关键：更新 currentInterval，使算法基于新间隔计算下次复习
            const data = item.data as WMSData;
            data.currentInterval = days;
        } else {
            const data = item.data as AnkiData;
            data.lastInterval = days;
        }
    });
}

function elapsed_days(item: RepetitionItem) {
    const delay = (Date.now() - item.nextReview) / DateUtils.DAYS_TO_MILLIS;
    return item.interval + delay;
}
function currentRetention(item: RepetitionItem) {
    // from fsrs.js repeat retrievability
    return Math.pow(1 + elapsed_days(item) / (9 * item.interval), -1);
}

function postpone(items: RepetitionItem[], newdue?: number): RepetitionItem[] {
    let cnt = 0;
    items.map((item) => {
        let newitvl: number;
        const olastview = item.hasDue
            ? item.nextReview - item.interval * DateUtils.DAYS_TO_MILLIS
            : Date.now();

        if (newdue) {
            newitvl = newdue - olastview;
        } else {
            const delay = (Date.now() - olastview) / DateUtils.DAYS_TO_MILLIS - item.interval;
            newitvl = Math.min(
                Math.max(1, Math.ceil(item.interval * (1.05 + 0.05 * Math.random())) + delay),
                36500,
            );
        }
        // newdue = newdue ? newdue : Date.now() + newitvl * DateUtils.DAYS_TO_MILLIS;
        if (newdue || newitvl !== item.interval) {
            cnt++;
            item.updateDueByInterval(newitvl, newdue);
        }
        console.debug(newdue, newitvl, item.interval);
    });
    debug("postpone", 0, { cnt });
    return items;
}
