import {
    insertMarkdownTableColumn,
    insertMarkdownTableRow,
    moveMarkdownTableColumn,
    moveMarkdownTableRow,
    parseMarkdownTableBlock,
    updateMarkdownTableCell,
} from "src/editor/hybridMarkdownTable";

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

    test("inserts a body row below the selected row", () => {
        const updated = insertMarkdownTableRow("| A | B |\n| --- | --- |\n| 1 | two |", 1, "after");

        expect(updated).toBe("| A | B |\n| --- | --- |\n| 1 | two |\n|  |  |");
    });

    test("inserts a column to the right of the selected column", () => {
        const updated = insertMarkdownTableColumn(
            "| A | B |\n| --- | --- |\n| 1 | two |",
            0,
            "after",
        );

        expect(updated).toBe("| A |  | B |\n| --- | --- | --- |\n| 1 |  | two |");
    });

    test("moves table body rows", () => {
        const updated = moveMarkdownTableRow(
            "| A | B |\n| --- | --- |\n| 1 | one |\n| 2 | two |",
            2,
            1,
        );

        expect(updated).toBe("| A | B |\n| --- | --- |\n| 2 | two |\n| 1 | one |");
    });

    test("moves table columns including header delimiter and body cells", () => {
        const updated = moveMarkdownTableColumn(
            "| A | B | C |\n| --- | :---: | ---: |\n| 1 | two | 3 |",
            2,
            0,
        );

        expect(updated).toBe("| C | A | B |\n| ---: | --- | :---: |\n| 3 | 1 | two |");
    });
});
