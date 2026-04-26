import {
    clampIrExtractVerticalInsetsForAdjacentBlocks,
    containNestedIrExtractBlocks,
    findIrExtractEditingRoot,
    findIrExtractSourceMatches,
    getIrExtractLayerInset,
    getIrExtractLayerVerticalInset,
    getIrExtractLineRanges,
    getIrExtractRenderRange,
    getIrExtractVerticalInsetForMetrics,
    getIrExtractWrappedBlockPrefix,
    getIrExtractWrappedHeading,
    type RenderExtract,
} from "src/editor/ir-extract-decoration";
import { parseIrExtracts } from "src/util/irExtractParser";

describe("irExtractDecoration helpers", () => {
    test("keeps the first three extract layer insets fixed", () => {
        expect(getIrExtractLayerInset(1, 3)).toBe(18);
        expect(getIrExtractLayerInset(2, 3)).toBe(12);
        expect(getIrExtractLayerInset(3, 3)).toBe(6);
    });

    test("spreads deeper extract layers evenly between outer and inner inset", () => {
        expect([1, 2, 3, 4].map((depth) => getIrExtractLayerInset(depth, 4))).toEqual([
            18, 14, 10, 6,
        ]);
        expect([1, 2, 3, 4, 5].map((depth) => getIrExtractLayerInset(depth, 5))).toEqual([
            18, 15, 12, 9, 6,
        ]);
    });

    test("scales vertical inset with line-height breathing room", () => {
        expect(getIrExtractVerticalInsetForMetrics(50, [26])).toBe(8);
        expect(getIrExtractVerticalInsetForMetrics(34, [26])).toBe(4);
        expect(getIrExtractVerticalInsetForMetrics(28, [26])).toBe(1);
        expect(getIrExtractVerticalInsetForMetrics(26, [26])).toBe(0);
    });

    test("clamps same-depth vertical insets to adjacent block gaps", () => {
        const clamped = clampIrExtractVerticalInsetsForAdjacentBlocks([
            { rawTop: 0, rawBottom: 26, depth: 1, verticalInset: 8 },
            { rawTop: 30, rawBottom: 56, depth: 1, verticalInset: 8 },
            { rawTop: 30, rawBottom: 56, depth: 2, verticalInset: 4 },
        ]);

        expect(clamped).toEqual([2, 2, 4]);
    });

    test("expands parent blocks to contain nested child blocks", () => {
        const blocks = containNestedIrExtractBlocks([
            {
                start: 0,
                left: 10,
                top: 10,
                width: 90,
                height: 40,
                depth: 1,
                maxDepth: 2,
            },
            {
                start: 20,
                parentStart: 0,
                left: 0,
                top: 20,
                width: 130,
                height: 40,
                depth: 2,
                maxDepth: 2,
            },
        ]);

        expect(blocks[0]).toMatchObject({ left: -1, top: 10, width: 132, height: 51 });
    });

    test("separates nested extract vertical borders by depth", () => {
        expect([1, 2, 3].map((depth) => getIrExtractLayerVerticalInset(8, depth, 3))).toEqual([
            8, 5.33, 2.67,
        ]);
        expect([1, 2].map((depth) => getIrExtractLayerVerticalInset(1, depth, 2))).toEqual([
            1, 0.5,
        ]);
    });

    test("selects the smallest touched extract as the editing root", () => {
        const text = "{{ir::outer {{ir::inner}} text}}";
        const matches = parseIrExtracts(text);
        const cursor = text.indexOf("inner");
        const editingRoot = findIrExtractEditingRoot(matches, cursor, cursor);

        expect(editingRoot?.rawMarkdown).toBe("inner");
    });

    test("shows source for every extract layer touched by the cursor", () => {
        const text = "{{ir::outer {{ir::inner}} text}}";
        const matches = parseIrExtracts(text);
        const cursor = text.indexOf("inner");
        const sourceMatches = findIrExtractSourceMatches(text, matches, cursor, cursor);

        expect(sourceMatches.map((match) => match.rawMarkdown)).toEqual([
            "outer {{ir::inner}} text",
            "inner",
        ]);
    });

    test("shows source when the cursor is on an extract visual line but outside the extract syntax", () => {
        const text = "prefix {{ir::target}} suffix";
        const matches = parseIrExtracts(text);
        const cursor = text.indexOf("prefix");
        const sourceMatches = findIrExtractSourceMatches(text, matches, cursor, cursor);

        expect(sourceMatches.map((match) => match.rawMarkdown)).toEqual(["target"]);
    });

    test("selects the outer extract when the selection crosses an inner extract", () => {
        const text = "{{ir::outer {{ir::inner}} text}}";
        const matches = parseIrExtracts(text);
        const selectionFrom = text.indexOf("outer");
        const selectionTo = text.indexOf(" text") + " text".length;
        const editingRoot = findIrExtractEditingRoot(matches, selectionFrom, selectionTo);

        expect(editingRoot?.rawMarkdown).toBe("outer {{ir::inner}} text");
    });

    test("render range uses extract text normally and full source while editing", () => {
        const text = "before {{ir::one}} after";
        const [match] = parseIrExtracts(text);
        const hidden: RenderExtract = { match, depth: 1, maxDepth: 1, showSource: false };
        const editing: RenderExtract = { match, depth: 1, maxDepth: 1, showSource: true };

        expect(getIrExtractRenderRange(hidden)).toEqual({
            from: match.innerStart,
            to: match.innerEnd,
        });
        expect(text.slice(match.innerStart, match.innerEnd)).toBe("one");
        expect(getIrExtractRenderRange(editing)).toEqual({ from: match.start, to: match.end });
        expect(text.slice(match.start, match.end)).toBe("{{ir::one}}");
    });

    test("detects legacy IR-wrapped heading and list block prefixes", () => {
        const headingText = "{{ir::#### Area C}}";
        const [heading] = parseIrExtracts(headingText);
        expect(getIrExtractWrappedHeading(headingText, heading)).toMatchObject({
            level: 4,
            markerFrom: heading.innerStart,
            markerTo: heading.innerStart + "#### ".length,
            textFrom: heading.innerStart + "#### ".length,
        });

        const bulletText = "    {{ir::* Forecast chart}}";
        const [bullet] = parseIrExtracts(bulletText);
        expect(getIrExtractWrappedBlockPrefix(bulletText, bullet)).toMatchObject({
            kind: "unordered-list",
            markerFrom: bullet.innerStart,
            markerTo: bullet.innerStart + "* ".length,
            textFrom: bullet.innerStart + "* ".length,
        });
    });

    test("line coverage expands a partial extract to the touched source lines", () => {
        const text = "before {{ir::one}} after\n  second {{ir::two}}\nthird";
        const matches = parseIrExtracts(text);
        const firstLineEnd = text.indexOf("\n");
        const secondLineStart = firstLineEnd + 1;
        const secondLineEnd = text.indexOf("\n", secondLineStart);

        expect(getIrExtractLineRanges(text, matches[0])).toEqual([
            { from: 0, to: firstLineEnd, line: 1 },
        ]);
        expect(getIrExtractLineRanges(text, matches[1])).toEqual([
            { from: secondLineStart, to: secondLineEnd, line: 2 },
        ]);
    });

    test("line coverage includes every line touched by a multiline extract", () => {
        const text = "a\n{{ir::b\n  c\nd}}\ne";
        const [match] = parseIrExtracts(text);
        const lines = getIrExtractLineRanges(text, match);

        expect(lines.map((line) => text.slice(line.from, line.to))).toEqual([
            "{{ir::b",
            "  c",
            "d}}",
        ]);
        expect(lines.map((line) => line.line)).toEqual([2, 3, 4]);
    });
});
