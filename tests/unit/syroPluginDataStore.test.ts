import {
    createDefaultDailyState,
    diffDailyState,
    parseDailyState,
} from "src/dataStore/syroPluginDataStore";

describe("syroPluginDataStore daily-state device review count", () => {
    test("parseDailyState defaults deviceReviewCount to zero when the field is missing", () => {
        const parsed = parseDailyState({
            version: 1,
            buryDate: "2026-04-15",
            buryList: [],
            dailyDeckStats: {
                date: "2026-04-15",
                counts: {},
            },
            appliedOpIds: {},
        });

        expect(parsed?.deviceReviewCount).toBe(0);
    });

    test("diffDailyState ignores deviceReviewCount-only changes", () => {
        const previous = {
            ...createDefaultDailyState(),
            buryDate: "2026-04-15",
            dailyDeckStats: {
                date: "2026-04-15",
                counts: {},
            },
            deviceReviewCount: 2,
        };
        const next = {
            ...previous,
            deviceReviewCount: 9,
        };

        expect(diffDailyState(previous, next)).toEqual([]);
    });
});
