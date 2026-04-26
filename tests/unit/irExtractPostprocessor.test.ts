import { renderIrExtractsInReadingMode } from "src/editor/ir-extract-postprocessor";

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
});
