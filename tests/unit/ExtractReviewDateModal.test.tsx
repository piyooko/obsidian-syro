import {
    buildExtractDueAtFromDateValue,
    getDefaultExtractReviewDateValue,
} from "src/ui/modals/ExtractReviewDateModal";

describe("ExtractReviewDateModal date helpers", () => {
    test("converts a date value to local 04:00", () => {
        const dueAt = buildExtractDueAtFromDateValue("2026-04-28");
        const date = new Date(dueAt);

        expect(date.getFullYear()).toBe(2026);
        expect(date.getMonth()).toBe(3);
        expect(date.getDate()).toBe(28);
        expect(date.getHours()).toBe(4);
        expect(date.getMinutes()).toBe(0);
    });

    test("defaults to today before 04:00 and tomorrow after 04:00", () => {
        expect(getDefaultExtractReviewDateValue(new Date(2026, 3, 27, 3, 59))).toBe(
            "2026-04-27",
        );
        expect(getDefaultExtractReviewDateValue(new Date(2026, 3, 27, 4, 0))).toBe(
            "2026-04-28",
        );
    });
});
