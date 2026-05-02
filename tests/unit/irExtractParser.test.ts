import {
    parseIrExtracts,
    removeExtractWrapperKeepInnerContent,
    replaceExtractInnerMarkdown,
    selectionContainsIrExtractBoundarySyntax,
    stripIrExtractSyntax,
    wrapSelectionAsExtract,
} from "src/util/irExtractParser";
import { summarizeIrExtractMatchesForDebug } from "src/util/irExtractDebug";

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

    test("strips only IR wrapper syntax while preserving heading and cloze text", () => {
        expect(stripIrExtractSyntax("{{ir::#### Area C}}")).toBe("#### Area C");
        expect(stripIrExtractSyntax("#### {{ir::Area D}}")).toBe("#### Area D");
        expect(stripIrExtractSyntax("{{ir::outer {{ir::inner}} {{c1::cloze}}}}")).toBe(
            "outer inner {{c1::cloze}}",
        );
        expect(stripIrExtractSyntax("{{ir::Unclosed heading")).toBe("Unclosed heading");
    });

    test("does not close an outer extract at a cloze close marker", () => {
        const text = ["{{ir::outer {{ir::inner}}", "with {{c1::cloze}} text", "}}"].join("\n");
        const matches = parseIrExtracts(text);

        expect(matches.map((match) => match.rawMarkdown)).toEqual([
            ["outer {{ir::inner}}", "with {{c1::cloze}} text", ""].join("\n"),
            "inner",
        ]);
        expect(matches[0].end).toBe(text.length);
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

    test("allows selections that contain complete existing IR wrappers", () => {
        const text = "before {{ir::one}} after";

        expect(
            selectionContainsIrExtractBoundarySyntax(
                text,
                text.indexOf("{{ir::"),
                text.indexOf(" after"),
            ),
        ).toBe(false);
    });

    test("blocks selections that contain only a partial IR boundary", () => {
        const text = "before {{ir::one}} after";

        expect(
            selectionContainsIrExtractBoundarySyntax(
                text,
                text.indexOf("one"),
                text.indexOf(" after"),
            ),
        ).toBe(true);
        expect(
            selectionContainsIrExtractBoundarySyntax(
                text,
                text.indexOf("{{ir::"),
                text.indexOf("one") + 1,
            ),
        ).toBe(true);
    });

    test("wraps only the selected inner text when selecting inside an existing extract", () => {
        const text = ["4. {{ir::**Step four**", "    * first item", "    * second item}}"].join(
            "\n",
        );
        const from = text.indexOf("first item");
        const to = from + "first item".length;
        const wrapped = wrapSelectionAsExtract(text, from, to);

        expect(wrapped.text).toBe(
            ["4. {{ir::**Step four**", "    * {{ir::first item}}", "    * second item}}"].join(
                "\n",
            ),
        );
    });

    test("preserves heading and list block prefixes outside newly wrapped extracts", () => {
        const heading = "#### Area C";
        const wrappedHeading = wrapSelectionAsExtract(heading, 0, heading.length);
        expect(wrappedHeading.text).toBe("#### {{ir::Area C}}");

        const bullet = "    * Forecast chart";
        const wrappedBullet = wrapSelectionAsExtract(bullet, 0, bullet.length);
        expect(wrappedBullet.text).toBe("    * {{ir::Forecast chart}}");

        const task = "- [ ] Review extract rendering";
        const wrappedTask = wrapSelectionAsExtract(task, 0, task.length);
        expect(wrappedTask.text).toBe("- [ ] {{ir::Review extract rendering}}");
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

    test("summarizes detected extracts for runtime debug output", () => {
        const matches = parseIrExtracts("before {{ir::outer {{ir::inner}} text}} after");

        expect(summarizeIrExtractMatchesForDebug(matches)).toEqual([
            {
                ordinal: 0,
                start: 7,
                end: 39,
                innerStart: 13,
                innerEnd: 37,
                startLine: 0,
                endLine: 0,
                depth: 0,
                parentOrdinal: null,
                parentStart: null,
                rawMarkdownLength: 24,
                rawMarkdownPreview: "outer {{ir::inner}} text",
            },
            {
                ordinal: 1,
                start: 19,
                end: 32,
                innerStart: 25,
                innerEnd: 30,
                startLine: 0,
                endLine: 0,
                depth: 1,
                parentOrdinal: 0,
                parentStart: 7,
                rawMarkdownLength: 5,
                rawMarkdownPreview: "inner",
            },
        ]);
    });
});
