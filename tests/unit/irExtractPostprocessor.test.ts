import {
    finalizeIrExtractSyntaxOnlyInRenderedMarkdown,
    irExtractPostProcessor,
    renderIrExtractsInReadingMode,
    SR_IR_POSTPROCESS_SKIP_ATTR,
} from "src/editor/ir-extract-postprocessor";

describe("irExtractPostProcessor", () => {
    test("removes visible extract wrappers in reading mode", () => {
        const root = document.createElement("div");
        root.textContent = "before {{ir::text}} after";

        expect(renderIrExtractsInReadingMode(root)).toBe(1);
        expect(root.textContent).toBe("before text after");
    });

    test("removes nested extract wrappers without dropping content", () => {
        const root = document.createElement("div");
        root.textContent = "{{ir::{{ir::t}}e}}";

        expect(renderIrExtractsInReadingMode(root)).toBe(2);
        expect(root.textContent).toBe("te");
    });

    test("preserves markdown-rendered inline elements inside extract content", () => {
        const root = document.createElement("div");
        root.append(document.createTextNode("{{ir::"));
        const strong = document.createElement("strong");
        strong.textContent = "bold";
        root.append(strong, document.createTextNode("}}"));

        expect(renderIrExtractsInReadingMode(root)).toBe(1);
        expect(root.textContent).toBe("bold");
        expect(root.querySelector("strong")?.textContent).toBe("bold");
    });

    test("skips extract markers inside code and pre elements", () => {
        const root = document.createElement("div");
        const code = document.createElement("code");
        code.textContent = "{{ir::code}}";
        const paragraph = document.createElement("p");
        paragraph.textContent = "{{ir::real}}";
        root.append(code, paragraph);

        expect(renderIrExtractsInReadingMode(root)).toBe(1);
        expect(code.textContent).toBe("{{ir::code}}");
        expect(paragraph.textContent).toBe("real");
    });

    test("skips markdown roots marked for deferred final rendering", () => {
        const root = document.createElement("div");
        root.setAttribute(SR_IR_POSTPROCESS_SKIP_ATTR, "true");
        root.textContent = "before {{ir::text}} after";

        irExtractPostProcessor(root, {} as never);

        expect(root.textContent).toBe("before {{ir::text}} after");
        expect(root.classList.contains("sr-ir-reading-root")).toBe(false);
    });

    test("marks final rendered roots with reading extract styling", () => {
        const root = document.createElement("div");
        root.textContent = "before {{ir::text}} after";

        expect(renderIrExtractsInReadingMode(root)).toBe(1);

        expect(root.textContent).toBe("before text after");
        expect(root.classList.contains("sr-ir-reading-root")).toBe(true);
    });

    test("can strip extract syntax without drawing reading blocks", () => {
        const root = document.createElement("div");
        root.setAttribute(SR_IR_POSTPROCESS_SKIP_ATTR, "true");
        root.textContent = "before {{ir::text}} after";

        finalizeIrExtractSyntaxOnlyInRenderedMarkdown(root);

        expect(root.textContent).toBe("before text after");
        expect(root.hasAttribute(SR_IR_POSTPROCESS_SKIP_ATTR)).toBe(false);
        expect(root.classList.contains("sr-ir-reading-root")).toBe(false);
        expect(root.querySelector(".sr-ir-reading-overlay")).toBeNull();
    });

    test("draws reading blocks with the extract review content frame", async () => {
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        const originalCancelAnimationFrame = window.cancelAnimationFrame;
        const originalGetClientRects = Range.prototype.getClientRects;
        const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
        const rangeRect = {
            bottom: 70,
            height: 20,
            left: 140,
            right: 240,
            top: 50,
            width: 100,
            x: 140,
            y: 50,
            toJSON: () => ({}),
        } as DOMRect;
        const rootRect = {
            bottom: 220,
            height: 200,
            left: 100,
            right: 500,
            top: 20,
            width: 400,
            x: 100,
            y: 20,
            toJSON: () => ({}),
        } as DOMRect;
        const root = document.createElement("div");
        root.style.lineHeight = "28px";
        root.textContent = "before {{ir::target}} after";
        document.body.append(root);

        window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
            window.setTimeout(
                () => cb(performance.now()),
                0,
            )) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = ((id: number) => {
            window.clearTimeout(id);
        }) as typeof window.cancelAnimationFrame;
        Range.prototype.getClientRects = () => [rangeRect] as unknown as DOMRectList;
        HTMLElement.prototype.getBoundingClientRect = function () {
            return this === root ? rootRect : originalGetBoundingClientRect.call(this);
        };

        try {
            expect(renderIrExtractsInReadingMode(root)).toBe(1);

            await new Promise((resolve) => window.setTimeout(resolve, 0));

            const block = root.querySelector<HTMLElement>(".sr-ir-reading-block");
            expect(block).not.toBeNull();
            expect(block?.style.left).toBe("-6px");
            expect(block?.style.width).toBe("412px");
            expect(block?.style.top).toBe("26px");
            expect(block?.style.height).toBe("28px");
        } finally {
            Range.prototype.getClientRects = originalGetClientRects;
            HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
            root.remove();
        }
    });
});
