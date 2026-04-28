import { parseMarkdownTableBlock, updateMarkdownTableCell } from "src/editor/hybridMarkdownTable";

describe("hybridMarkdownTable", () => {
    test("parses standard pipe tables", () => {
        const model = parseMarkdownTableBlock("| A | B |\n| --- | :---: |\n| 1 | two |");

        expect(model).toEqual({
            header: ["A", "B"],
            delimiter: ["---", ":---:"],
            rows: [["1", "two"]],
        });
    });

    test("updates a body cell and escapes pipe characters", () => {
        const updated = updateMarkdownTableCell(
            "| A | B |\n| --- | --- |\n| 1 | two |",
            1,
            1,
            "changed | value\nnext",
        );

        expect(updated).toBe("| A | B |\n| --- | --- |\n| 1 | changed \\| value next |");
    });

    test("updates header cells without changing row count", () => {
        const updated = updateMarkdownTableCell(
            "| A | B |\n| --- | --- |\n| 1 | two |",
            0,
            0,
            "Name",
        );

        expect(updated).toBe("| Name | B |\n| --- | --- |\n| 1 | two |");
    });
});
