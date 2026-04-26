import {
    parseIrExtracts,
    removeExtractWrapperKeepInnerContent,
    replaceExtractInnerMarkdown,
    wrapSelectionAsExtract,
} from "src/util/irExtractParser";

describe("irExtractParser", () => {
    test("parses multiline and cross-paragraph extracts", () => {
        const text = "before\n{{ir::first line\n\nsecond paragraph}}\nafter";
        const matches = parseIrExtracts(text);

        expect(matches).toHaveLength(1);
        expect(matches[0].rawMarkdown).toBe("first line\n\nsecond paragraph");
        expect(matches[0].anchor.startLine).toBe(1);
        expect(matches[0].anchor.endLine).toBe(3);
    });

    test("parses nested extracts as independent matches", () => {
        const matches = parseIrExtracts("{{ir::{{ir::{{ir::t}}e}}st}}");

        expect(matches.map((match) => match.rawMarkdown)).toEqual([
            "{{ir::{{ir::t}}e}}st",
            "{{ir::t}}e",
            "t",
        ]);
        expect(matches[1].parentStart).toBe(matches[0].start);
        expect(matches[2].parentStart).toBe(matches[1].start);
    });

    test("ignores extract markers inside code contexts", () => {
        const text = [
            "`{{ir::inline}}`",
            "",
            "```ts",
            "{{ir::block}}",
            "```",
            "",
            "{{ir::real}}",
        ].join("\n");

        expect(parseIrExtracts(text).map((match) => match.rawMarkdown)).toEqual(["real"]);
    });

    test("wraps partial overlap selections at valid extract boundaries", () => {
        const text = "a {{ir::one}} b";
        const from = text.indexOf("one");
        const to = text.indexOf(" b");
        const wrapped = wrapSelectionAsExtract(text, from, to);

        expect(wrapped.text).toBe("a {{ir::{{ir::one}}}} b");
    });

    test("replaces inner markdown and removes only the current wrapper", () => {
        const text = "{{ir::outer {{ir::inner}}}}";
        const [outer] = parseIrExtracts(text);
        const replaced = replaceExtractInnerMarkdown(text, outer, "updated {{ir::inner}}");
        const [updatedOuter] = parseIrExtracts(replaced);

        expect(updatedOuter.rawMarkdown).toBe("updated {{ir::inner}}");
        expect(removeExtractWrapperKeepInnerContent(replaced, updatedOuter)).toBe(
            "updated {{ir::inner}}",
        );
    });
});
