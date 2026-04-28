export interface MarkdownTableModel {
    header: string[];
    delimiter: string[];
    rows: string[][];
}

function splitMarkdownTableRow(line: string): string[] {
    let trimmed = line.trim();
    if (trimmed.startsWith("|")) {
        trimmed = trimmed.slice(1);
    }
    if (trimmed.endsWith("|")) {
        trimmed = trimmed.slice(0, -1);
    }

    const cells: string[] = [];
    let current = "";
    let escaped = false;

    for (const char of trimmed) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }

        if (char === "\\") {
            current += char;
            escaped = true;
            continue;
        }

        if (char === "|") {
            cells.push(current.trim());
            current = "";
            continue;
        }

        current += char;
    }

    cells.push(current.trim());
    return cells;
}

function isDelimiterRow(line: string): boolean {
    const cells = splitMarkdownTableRow(line);
    return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell.replace(/\s+/g, "")));
}

function escapeMarkdownTableCell(value: string): string {
    return value
        .replace(/\r?\n/g, " ")
        .replace(/(?<!\\)\|/g, "\\|")
        .trim();
}

function serializeMarkdownTableRow(cells: string[]): string {
    return `| ${cells.map(escapeMarkdownTableCell).join(" | ")} |`;
}

function getTableColumnCount(model: MarkdownTableModel): number {
    return Math.max(
        model.header.length,
        model.delimiter.length,
        ...model.rows.map((row) => row.length),
    );
}

function normalizeCells(cells: string[], count: number, fill = ""): string[] {
    const normalized = cells.slice(0, count);
    while (normalized.length < count) {
        normalized.push(fill);
    }
    return normalized;
}

function serializeMarkdownTableModel(model: MarkdownTableModel): string {
    const columnCount = getTableColumnCount(model);
    const header = normalizeCells(model.header, columnCount);
    const delimiter = normalizeCells(model.delimiter, columnCount, "---");
    const rows = model.rows.map((row) => normalizeCells(row, columnCount));

    return [
        serializeMarkdownTableRow(header),
        serializeMarkdownTableRow(delimiter),
        ...rows.map(serializeMarkdownTableRow),
    ].join("\n");
}

export function parseMarkdownTableBlock(markdown: string): MarkdownTableModel | null {
    const lines = markdown
        .replace(/\r\n/g, "\n")
        .split("\n")
        .filter((line) => line.trim().length > 0);

    if (lines.length < 2 || !lines[0].includes("|") || !isDelimiterRow(lines[1])) {
        return null;
    }

    const header = splitMarkdownTableRow(lines[0]);
    const delimiter = splitMarkdownTableRow(lines[1]);
    const rows = lines.slice(2).map(splitMarkdownTableRow);

    return { header, delimiter, rows };
}

export function updateMarkdownTableCell(
    markdown: string,
    row: number,
    col: number,
    value: string,
): string {
    const model = parseMarkdownTableBlock(markdown);
    if (!model) {
        return markdown;
    }

    if (row < 0 || col < 0) {
        return markdown;
    }

    const nextHeader = [...model.header];
    const nextRows = model.rows.map((cells) => [...cells]);

    if (row === 0) {
        if (col >= nextHeader.length) {
            return markdown;
        }
        nextHeader[col] = value;
    } else {
        const bodyRow = nextRows[row - 1];
        if (!bodyRow || col >= bodyRow.length) {
            return markdown;
        }
        bodyRow[col] = value;
    }

    return serializeMarkdownTableModel({
        delimiter: model.delimiter,
        header: nextHeader,
        rows: nextRows,
    });
}

export function insertMarkdownTableRow(
    markdown: string,
    row: number,
    where: "before" | "after",
): string {
    const model = parseMarkdownTableBlock(markdown);
    if (!model) {
        return markdown;
    }

    const columnCount = getTableColumnCount(model);
    const insertIndex =
        where === "before"
            ? Math.max(0, Math.min(model.rows.length, row - 1))
            : Math.max(0, Math.min(model.rows.length, row));
    const rows = model.rows.map((cells) => [...cells]);
    rows.splice(
        insertIndex,
        0,
        Array.from({ length: columnCount }, () => ""),
    );

    return serializeMarkdownTableModel({ ...model, rows });
}

export function insertMarkdownTableColumn(
    markdown: string,
    col: number,
    where: "before" | "after",
): string {
    const model = parseMarkdownTableBlock(markdown);
    if (!model) {
        return markdown;
    }

    const columnCount = getTableColumnCount(model);
    const insertIndex =
        where === "before"
            ? Math.max(0, Math.min(columnCount, col))
            : Math.max(0, Math.min(columnCount, col + 1));
    const insertCell = (cells: string[], value = "") => {
        const normalized = normalizeCells(cells, columnCount);
        normalized.splice(insertIndex, 0, value);
        return normalized;
    };

    return serializeMarkdownTableModel({
        header: insertCell(model.header),
        delimiter: insertCell(model.delimiter, "---"),
        rows: model.rows.map((row) => insertCell(row)),
    });
}

export function moveMarkdownTableRow(markdown: string, fromRow: number, toRow: number): string {
    const model = parseMarkdownTableBlock(markdown);
    if (!model || fromRow <= 0 || toRow <= 0) {
        return markdown;
    }

    const rows = model.rows.map((cells) => [...cells]);
    const fromIndex = fromRow - 1;
    const toIndex = toRow - 1;
    if (
        fromIndex < 0 ||
        fromIndex >= rows.length ||
        toIndex < 0 ||
        toIndex >= rows.length ||
        fromIndex === toIndex
    ) {
        return markdown;
    }

    const [moved] = rows.splice(fromIndex, 1);
    rows.splice(toIndex, 0, moved);
    return serializeMarkdownTableModel({ ...model, rows });
}

export function moveMarkdownTableColumn(markdown: string, fromCol: number, toCol: number): string {
    const model = parseMarkdownTableBlock(markdown);
    if (!model) {
        return markdown;
    }

    const columnCount = getTableColumnCount(model);
    if (
        fromCol < 0 ||
        fromCol >= columnCount ||
        toCol < 0 ||
        toCol >= columnCount ||
        fromCol === toCol
    ) {
        return markdown;
    }

    const moveCell = (cells: string[], fill = "") => {
        const normalized = normalizeCells(cells, columnCount, fill);
        const [moved] = normalized.splice(fromCol, 1);
        normalized.splice(toCol, 0, moved);
        return normalized;
    };

    return serializeMarkdownTableModel({
        header: moveCell(model.header),
        delimiter: moveCell(model.delimiter, "---"),
        rows: model.rows.map((row) => moveCell(row)),
    });
}
