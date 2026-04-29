import {
    buildExtractDueAtFromDelayDaysValue,
    configureExtractReviewDelayDaysInput,
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

    test("initializes the delay input to one day and disables browser restoration", () => {
        const input = document.createElement("input");
        input.value = "13";

        configureExtractReviewDelayDaysInput(input, getDefaultExtractReviewDelayDaysValue());

        expect(input.autocomplete).toBe("off");
        expect(input.value).toBe("1");
        expect(input.defaultValue).toBe("1");
        expect(input.getAttribute("value")).toBe("1");
    });
});
