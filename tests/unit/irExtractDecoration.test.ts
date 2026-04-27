import {
    alignNestedIrExtractBlocksHorizontally,
    clampIrExtractVerticalInsetsForAdjacentBlocks,
    containNestedIrExtractBlocks,
    findActiveIrExtractSourceMatch,
    buildIrExtractRenderExtractsForTest,
    findIrExtractEditingRoot,
    findIrExtractSourceMatches,
    findIrExtractSourceMatchesAtPoint,
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

    test("aligns nested extract horizontal edges to the parent frame", () => {
        const blocks = alignNestedIrExtractBlocksHorizontally([
            {
                start: 0,
                left: 20,
                top: 0,
                width: 220,
                height: 80,
                depth: 1,
                maxDepth: 3,
            },
            {
                start: 30,
                parentStart: 0,
                left: 120,
                top: 20,
                width: 80,
                height: 30,
                depth: 2,
                maxDepth: 3,
            },
            {
                start: 50,
                parentStart: 30,
                left: 150,
                top: 28,
                width: 40,
                height: 18,
                depth: 3,
                maxDepth: 3,
            },
        ]);

        expect(blocks[1]).toMatchObject({ left: 26, width: 208 });
        expect(blocks[2]).toMatchObject({ left: 32, width: 196 });
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

    test("selects the innermost active source wrapper for token highlighting", () => {
        const text = "{{ir::outer {{ir::inner}}}}";
        const matches = parseIrExtracts(text);
        const cursor = text.indexOf("inner");
        const active = findActiveIrExtractSourceMatch(text, matches, cursor, cursor);

        expect(active?.rawMarkdown).toBe("inner");
        expect(active ? text.slice(active.innerEnd, active.end) : "").toBe("}}");
        expect(active?.end).toBeLessThan(text.length);
    });

    test("uses the matched IR close token instead of the nearest double brace", () => {
        const text = "{{ir::outer {{ir::inner {{c1::cloze}} and {{plain}} end}}}}";
        const matches = parseIrExtracts(text);
        const cursor = text.indexOf("inner");
        const active = findActiveIrExtractSourceMatch(text, matches, cursor, cursor);

        expect(active?.rawMarkdown).toBe("inner {{c1::cloze}} and {{plain}} end");
        expect(active ? text.slice(active.innerEnd, active.end) : "").toBe("}}");
        expect(active?.end).toBe(text.length - 2);
    });

    test("shows source for every extract on the current source line", () => {
        const text = "prefix {{ir::one}} middle {{ir::two}} suffix";
        const matches = parseIrExtracts(text);
        const cursor = text.indexOf("prefix");
        const sourceMatches = findIrExtractSourceMatches(text, matches, cursor, cursor);

        expect(sourceMatches.map((match) => match.rawMarkdown)).toEqual(["one", "two"]);
        expect(findActiveIrExtractSourceMatch(text, matches, cursor, cursor)).toBeNull();
    });

    test("shows source only for extract blocks hit by the cursor point", () => {
        const text = "prefix {{ir::one}} middle {{ir::two}} suffix";
        const matches = parseIrExtracts(text);
        const blocks = [
            { start: matches[0].start, left: 10, top: 0, width: 30, height: 20 },
            { start: matches[1].start, left: 60, top: 0, width: 30, height: 20 },
        ];

        expect(findIrExtractSourceMatchesAtPoint(matches, blocks, 45, 10)).toEqual([]);
        expect(
            findIrExtractSourceMatchesAtPoint(matches, blocks, 65, 10).map(
                (match) => match.rawMarkdown,
            ),
        ).toEqual(["two"]);
    });

    test("shows source for nested extract blocks hit by the cursor point", () => {
        const text = "{{ir::outer {{ir::inner}} text}}";
        const matches = parseIrExtracts(text);
        const blocks = [
            { start: matches[0].start, left: 0, top: 0, width: 100, height: 40 },
            { start: matches[1].start, left: 20, top: 10, width: 50, height: 20 },
        ];

        expect(
            findIrExtractSourceMatchesAtPoint(matches, blocks, 30, 20).map(
                (match) => match.rawMarkdown,
            ),
        ).toEqual(["outer {{ir::inner}} text", "inner"]);
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

    test("excludes the current outer extract block while keeping nested extract blocks", () => {
        const source = "before {{ir::outer {{ir::inner}} text}} after";
        const matches = parseIrExtracts(source);

        const renderExtracts = buildIrExtractRenderExtractsForTest(source, matches, {
            excludedStarts: new Set([matches[0].start]),
        });

        expect(renderExtracts.map((item) => item.start)).toEqual([matches[1].start]);
    });
});
