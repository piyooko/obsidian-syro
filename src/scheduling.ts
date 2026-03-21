import { SRSettings } from "src/settings";
import { t } from "src/lang/helpers";

export enum ReviewResponse {
    Reset,
    Hard,
    Good,
    Easy,
}

export enum FlashcardReviewMode {
    Cram,
    Review,
}

/**
 * 解析间隔字符串，返回分钟数的数组
 * 输入: "1m 10m 1d"
 * 输出: [1, 10, 1440]
 *
 * 支持的单位：s(秒) m(分) h(时) d(天)
 * 默认单位为分钟
 */
export function parseSteps(stepsStr: string): number[] {
    if (!stepsStr || stepsStr.trim() === "") return [];

    return stepsStr
        .split(/\s+/)
        .map((step) => {
            const match = step.match(/^(\d+(?:\.\d+)?)\s*([smhd]?)$/i);
            if (!match) return 0;

            const value = parseFloat(match[1]);
            const unit = match[2].toLowerCase();

            switch (unit) {
                case "s":
                    return value / 60; // 秒转分
                case "m":
                    return value; // 分
                case "h":
                    return value * 60; // 时转分
                case "d":
                    return value * 1440; // 天转分
                default:
                    return value; // 默认分钟
            }
        })
        .filter((v) => v > 0);
}

/**
 * 将分钟数转换为天数（interval 字段使用天数）
 */
// Flashcards

export function schedule(
    response: ReviewResponse,
    interval: number,
    ease: number,
    delayBeforeReview: number,
    settingsObj: SRSettings,
    dueDates?: Record<number, number>,
): Record<string, number> {
    delayBeforeReview = Math.max(0, Math.floor(delayBeforeReview / (24 * 3600 * 1000)));

    if (response === ReviewResponse.Easy) {
        ease += 20;
        interval = ((interval + delayBeforeReview) * ease) / 100;
        interval *= settingsObj.easyBonus;
    } else if (response === ReviewResponse.Good) {
        interval = ((interval + delayBeforeReview / 2) * ease) / 100;
    } else if (response === ReviewResponse.Hard) {
        ease = Math.max(130, ease - 20);
        interval = Math.max(
            1,
            (interval + delayBeforeReview / 4) * settingsObj.lapsesIntervalChange,
        );
    }

    // replaces random fuzz with load balancing over the fuzz interval
    if (dueDates !== undefined) {
        interval = Math.round(interval);
        if (!Object.prototype.hasOwnProperty.call(dueDates, interval)) {
            dueDates[interval] = 0;
        } else {
            // disable fuzzing for small intervals
            if (interval > 4) {
                let fuzz = 0;
                if (interval < 7) fuzz = 1;
                else if (interval < 30) fuzz = Math.max(2, Math.floor(interval * 0.15));
                else fuzz = Math.max(4, Math.floor(interval * 0.05));

                const originalInterval = interval;
                outer: for (let i = 1; i <= fuzz; i++) {
                    for (const ivl of [originalInterval - i, originalInterval + i]) {
                        if (!Object.prototype.hasOwnProperty.call(dueDates, ivl)) {
                            dueDates[ivl] = 0;
                            interval = ivl;
                            break outer;
                        }
                        if (dueDates[ivl] < dueDates[interval]) interval = ivl;
                    }
                }
            }
        }

        dueDates[interval]++;
    }

    interval = Math.min(interval, settingsObj.maximumInterval);

    return { interval: Math.round(interval * 10) / 10, ease };
}

export function textInterval(interval: number, isMobile: boolean): string {
    if (interval === undefined) {
        return t("NEW");
    }

    const m: number = Math.round(interval / 3.04375) / 10,
        y: number = Math.round(interval / 36.525) / 10;

    let h = 24,
        min = 60;
    if (interval < 1) {
        h = interval * 24;
        if (h < 1) {
            min = Math.round(h * 60 * 10) / 10;
        } else {
            h = Math.round(h * 10) / 10;
        }
    }
    if (isMobile) {
        if (h < 1) return t("MINUTES_STR_IVL_MOBILE", { interval: min });
        if (interval < 1) return t("HOURS_STR_IVL_MOBILE", { interval: h });
        if (m < 1.0) return t("DAYS_STR_IVL_MOBILE", { interval });
        else if (y < 1.0) return t("MONTHS_STR_IVL_MOBILE", { interval: m });
        else return t("YEARS_STR_IVL_MOBILE", { interval: y });
    } else {
        if (h < 1) return t("MINUTES_STR_IVL", { interval: min });
        if (interval < 1) return t("HOURS_STR_IVL", { interval: h });
        if (m < 1.0) return t("DAYS_STR_IVL", { interval });
        else if (y < 1.0) return t("MONTHS_STR_IVL", { interval: m });
        else return t("YEARS_STR_IVL", { interval: y });
    }
}
