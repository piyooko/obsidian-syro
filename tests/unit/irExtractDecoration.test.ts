import {
    findIrExtractEditingRoot,
    getIrExtractLayerInset,
    getIrExtractLineRanges,
    getIrExtractRenderRange,
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

    test("selects the smallest touched extract as the editing root", () => {
        const text = "{{ir::outer {{ir::inner}} text}}";
        const matches = parseIrExtracts(text);
        const cursor = text.indexOf("inner");
        const editingRoot = findIrExtractEditingRoot(matches, cursor, cursor);

        expect(editingRoot?.rawMarkdown).toBe("inner");
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
