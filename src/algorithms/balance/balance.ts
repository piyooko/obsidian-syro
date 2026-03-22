/**
 * 这个文件主要是干什么的：
 * [算法层] 负载均衡 (Load Balancing) 辅助逻辑。
 * 用于在计算出的复习日期的基础上，微调日期（Fuzzing），避免某一天复习量过大，将复习均匀分散到邻近的日期。
 *
 * 它在项目中属于：算法层 (Algorithms) / 辅助 (Helper)
 *
 * 它会用到哪些文件：
 * 1. src/dataStore/repetitionItem.ts
 *
 * 哪些文件会用到它：
 * 1. src/algorithms/scheduling_default.ts
 * 2. src/algorithms/anki.ts (可能被调用)
 */
/**
 * [辅助] 负载均衡逻辑，防止某一天的复习量过大。
 */
import { RPITEMTYPE } from "src/dataStore/repetitionItem";

let dueDatesDict: { [type: string]: Record<number, number> };

export function setDueDates(
    notedueDates: Record<number, number>,
    carddueDates: Record<number, number>,
) {
    dueDatesDict = {};
    dueDatesDict[RPITEMTYPE.NOTE] = notedueDates;
    dueDatesDict[RPITEMTYPE.CARD] = carddueDates;
}

function getDueDates(itemType: string) {
    return dueDatesDict && itemType in dueDatesDict ? dueDatesDict[itemType] : undefined;
}

/**
 * balance review counts in a day, return new interval day.
 * @param interval days till next review
 * @param type: RPITEMTYPE,
 * @param maximumInterval default = 36525
 * @returns
 */
export function balance(
    interval: number,
    type: RPITEMTYPE,
    maximumInterval: number = 36525,
    lowestCount: number = 10,
    tolerance: number = 5,
): number {
    // replaces random fuzz with load balancing over the fuzz interval
    const beforeIntvl = interval;
    let isChange = false;
    const dueDates = dueDatesDict[type];
    if (dueDates !== undefined) {
        interval = Math.round(interval);
        // const due = window.moment().add(interval,"days");
        // const nowToday = window.moment().endOf("day").valueOf();
        // interval= Math.ceil((due.valueOf() - nowToday) / DateUtils.DAYS_TO_MILLIS);
        if (!Object.prototype.hasOwnProperty.call(dueDates, interval)) {
            dueDates[interval] = 0;
        } else if (dueDates[interval] >= lowestCount) {
            // disable fuzzing for small intervals
            if (interval >= 3) {
                const fuzz = getFuzz(interval);

                const originalInterval = interval;
                outer: for (let i = 1; i <= fuzz; i++) {
                    for (const ivl of [originalInterval + i, originalInterval - i]) {
                        if (!Object.prototype.hasOwnProperty.call(dueDates, ivl)) {
                            dueDates[ivl] = 0;
                            interval = ivl;
                            isChange = true;
                            break outer;
                        }
                        if (dueDates[ivl] < dueDates[interval] - tolerance) {
                            interval = ivl;
                            isChange = true;
                        }
                    }
                }
            }
        }

        dueDates[interval]++;
    }
    interval = Math.min(interval, maximumInterval);
    if (isChange) {
        const msg = `balance: interval from ${beforeIntvl} balance to ${interval} days.`;
        console.debug(msg);
    } else {
        interval = beforeIntvl;
    }
    return interval;
}

function getFuzz(interval: number) {
    let fuzz = 0;
    if (interval < 7) fuzz = 1;
    else if (interval < 30) fuzz = Math.max(2, Math.floor(interval * 0.15));
    else fuzz = Math.max(4, Math.floor(interval * 0.05));
    return fuzz;
}
