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

    const lines = [
        serializeMarkdownTableRow(nextHeader),
        serializeMarkdownTableRow(model.delimiter),
        ...nextRows.map(serializeMarkdownTableRow),
    ];

    return lines.join("\n");
}
