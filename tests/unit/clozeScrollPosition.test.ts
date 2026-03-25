import {
    buildScrollPositionInput,
    getCenteredScrollTop,
    getEnsureVisibleScrollTop,
    getMixedCenterScrollTop,
    ScrollPositionInput,
} from "src/ui/components/clozeScrollPosition";

function createInput(overrides: Partial<ScrollPositionInput> = {}): ScrollPositionInput {
    return {
        scrollTop: 500,
        scrollHeight: 2000,
        clientHeight: 400,
        targetTop: 830,
        targetHeight: 40,
        safeTopInset: 50,
        safeBottomInset: 50,
        ...overrides,
    };
}

describe("clozeScrollPosition", () => {
    test("mixed centering moves a long-context cloze from the lower edge toward the viewport center", () => {
        const input = createInput();

        expect(getEnsureVisibleScrollTop(input)).toBe(520);
        expect(getMixedCenterScrollTop(input)).toBe(650);
    });

    test("mixed centering also re-centers a long-context cloze near the upper edge", () => {
        const input = createInput({
            scrollTop: 500,
            targetTop: 560,
            targetHeight: 40,
        });

        expect(getEnsureVisibleScrollTop(input)).toBe(500);
        expect(getMixedCenterScrollTop(input)).toBe(380);
    });

    test("short or edge-adjacent context falls back to simple visibility instead of fake centering", () => {
        const input = createInput({
            scrollTop: 0,
            scrollHeight: 500,
            clientHeight: 400,
            targetTop: 60,
            targetHeight: 30,
        });

        expect(getMixedCenterScrollTop(input)).toBe(0);
    });

    test("no scroll space keeps the current position", () => {
        const input = createInput({
            scrollTop: 0,
            scrollHeight: 400,
            clientHeight: 400,
            targetTop: 180,
            targetHeight: 20,
        });

        expect(getEnsureVisibleScrollTop(input)).toBe(0);
        expect(getMixedCenterScrollTop(input)).toBe(0);
    });

    test("clamped centering falls back to ensure-visible instead of pretending to center", () => {
        const input = createInput({
            scrollTop: 0,
            scrollHeight: 1200,
            clientHeight: 400,
            targetTop: 110,
            targetHeight: 20,
        });

        expect(getMixedCenterScrollTop(input)).toBe(0);
    });

    test("buildScrollPositionInput converts DOM geometry into scroll metrics for mixed centering", () => {
        const scrollContainer = document.createElement("div");
        const target = document.createElement("span");

        scrollContainer.scrollTop = 500;
        Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            value: 2000,
        });
        Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            value: 400,
        });

        scrollContainer.getBoundingClientRect = jest.fn(() => ({
            top: 100,
            left: 0,
            right: 300,
            bottom: 500,
            width: 300,
            height: 400,
            x: 0,
            y: 100,
            toJSON: () => undefined,
        }));

        target.getBoundingClientRect = jest.fn(() => ({
            top: 430,
            left: 0,
            right: 200,
            bottom: 470,
            width: 200,
            height: 40,
            x: 0,
            y: 430,
            toJSON: () => undefined,
        }));

        const input = buildScrollPositionInput(target, scrollContainer, { top: 50, bottom: 50 });

        expect(input).toMatchObject({
            scrollTop: 500,
            scrollHeight: 2000,
            clientHeight: 400,
            targetTop: 830,
            targetHeight: 40,
            safeTopInset: 50,
            safeBottomInset: 50,
        });
        expect(getMixedCenterScrollTop(input)).toBe(650);
    });

    test("code-block centering keeps using full-container centering semantics", () => {
        const input = createInput({
            scrollTop: 500,
            targetTop: 560,
            targetHeight: 40,
            safeTopInset: 72,
            safeBottomInset: 24,
        });

        expect(getCenteredScrollTop(input)).toBe(380);
    });
});
