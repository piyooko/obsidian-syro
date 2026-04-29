import {
    buildExtractDueAtFromDelayDaysValue,
    getDefaultExtractReviewDelayDaysValue,
} from "src/ui/modals/ExtractReviewDateModal";

describe("ExtractReviewDateModal delay helpers", () => {
    test("converts a day delay to local 04:00 on the target day", () => {
        const dueAt = buildExtractDueAtFromDelayDaysValue("22", new Date(2026, 3, 29, 12, 0));
        const date = new Date(dueAt);

        expect(date.getFullYear()).toBe(2026);
        expect(date.getMonth()).toBe(4);
        expect(date.getDate()).toBe(21);
        expect(date.getHours()).toBe(4);
        expect(date.getMinutes()).toBe(0);
    });

    test("rejects non-positive or non-integer delays", () => {
        expect(buildExtractDueAtFromDelayDaysValue("0")).toBeNaN();
        expect(buildExtractDueAtFromDelayDaysValue("-1")).toBeNaN();
        expect(buildExtractDueAtFromDelayDaysValue("1.5")).toBeNaN();
        expect(buildExtractDueAtFromDelayDaysValue("abc")).toBeNaN();
    });

    test("defaults to one day", () => {
        expect(getDefaultExtractReviewDelayDaysValue()).toBe("1");
    });
});
