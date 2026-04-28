import { findHybridMarkdownBlocks } from "src/editor/hybridMarkdownBlocks";

describe("findHybridMarkdownBlocks", () => {
    test("splits headings, paragraphs, tables, lists, blockquotes and fenced code", () => {
        const markdown = [
            "# Title",
            "",
            "Paragraph one",
            "still paragraph",
            "",
            "| A | B |",
            "| - | - |",
            "| 1 | 2 |",
            "",
            "- item",
            "  continuation",
            "",
            "> quote",
            "> next",
            "",
            "```ts",
            "| not | table |",
            "```",
        ].join("\n");

        const blocks = findHybridMarkdownBlocks(markdown).filter((block) => block.kind !== "blank");

        expect(blocks.map((block) => block.kind)).toEqual([
            "heading",
            "paragraph",
            "table",
            "list",
            "blockquote",
            "code",
        ]);
        expect(blocks[2].markdown).toContain("| 1 | 2 |");
        expect(blocks[5].markdown).toContain("| not | table |");
    });

    test("preserves source ranges for replacement widgets", () => {
        const markdown = "before\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\nafter";
        const table = findHybridMarkdownBlocks(markdown).find((block) => block.kind === "table");

        expect(table).toBeDefined();
        expect(markdown.slice(table!.from, table!.to)).toBe(table!.markdown);
    });

    test("marks only table and fenced code blocks as widgets", () => {
        const markdown = [
            "## Heading",
            "1. item",
            "> quote",
            "",
            "| A | B |",
            "| - | - |",
            "| 1 | 2 |",
            "",
            "```",
            "code",
            "```",
        ].join("\n");

        const blocks = findHybridMarkdownBlocks(markdown).filter((block) => block.kind !== "blank");

        expect(blocks.map((block) => [block.kind, block.renderMode])).toEqual([
            ["heading", "line"],
            ["list", "line"],
            ["blockquote", "line"],
            ["table", "widget"],
            ["code", "widget"],
        ]);
        expect(blocks[0].markerFrom).toBe(0);
        expect(blocks[0].markerTo).toBe(3);
        expect(blocks[1].markerFrom).toBe(markdown.indexOf("1."));
        expect(blocks[1].markerTo).toBe(markdown.indexOf("item"));
    });
});
