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

export function parseSteps(stepsStr: string): number[] {
    if (!stepsStr || stepsStr.trim() === "") {
        return [];
    }

    return stepsStr
        .split(/\s+/)
        .map((step) => {
            const match = step.match(/^(\d+(?:\.\d+)?)\s*([smhd]?)$/i);
            if (!match) {
                return 0;
            }

            const value = parseFloat(match[1]);
            const unit = match[2].toLowerCase();

            switch (unit) {
                case "s":
                    return value / 60;
                case "m":
                    return value;
                case "h":
                    return value * 60;
                case "d":
                    return value * 1440;
                default:
                    return value;
            }
        })
        .filter((value) => value > 0);
}

export function textInterval(interval: number, isMobile: boolean): string {
    if (interval === undefined) {
        return t("NEW");
    }

    const m = Math.round(interval / 3.04375) / 10;
    const y = Math.round(interval / 36.525) / 10;

    let h = 24;
    let min = 60;
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
        if (y < 1.0) return t("MONTHS_STR_IVL_MOBILE", { interval: m });
        return t("YEARS_STR_IVL_MOBILE", { interval: y });
    }

    if (h < 1) return t("MINUTES_STR_IVL", { interval: min });
    if (interval < 1) return t("HOURS_STR_IVL", { interval: h });
    if (m < 1.0) return t("DAYS_STR_IVL", { interval });
    if (y < 1.0) return t("MONTHS_STR_IVL", { interval: m });
    return t("YEARS_STR_IVL", { interval: y });
}
