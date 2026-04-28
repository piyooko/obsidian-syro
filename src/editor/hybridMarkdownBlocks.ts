export type HybridMarkdownBlockKind =
    | "blank"
    | "blockquote"
    | "code"
    | "heading"
    | "list"
    | "paragraph"
    | "table";

export interface HybridMarkdownBlock {
    kind: HybridMarkdownBlockKind;
    from: number;
    lineFrom: number;
    lineTo: number;
    markerFrom?: number;
    markerTo?: number;
    depth?: number;
    renderMode: "line" | "widget";
    to: number;
    markdown: string;
}

interface MarkdownLine {
    from: number;
    to: number;
    text: string;
}

function getMarkdownLines(markdown: string): MarkdownLine[] {
    if (markdown.length === 0) {
        return [];
    }

    const lines: MarkdownLine[] = [];
    const linePattern = /.*(?:\r?\n|$)/g;
    let match: RegExpExecArray | null;

    while ((match = linePattern.exec(markdown)) !== null) {
        if (match[0].length === 0) {
            break;
        }

        const from = match.index;
        const to = from + match[0].length;
        lines.push({
            from,
            to,
            text: match[0].replace(/\r?\n$/, ""),
        });

        if (to >= markdown.length) {
            break;
        }
    }

    return lines;
}

function isFenceStart(line: string): { marker: string; length: number } | null {
    const match = line.match(/^\s*(`{3,}|~{3,})/);
    if (!match) {
        return null;
    }

    return { marker: match[1][0], length: match[1].length };
}

function isFenceEnd(line: string, fence: { marker: string; length: number }): boolean {
    const pattern = new RegExp(`^\\s*\\${fence.marker}{${fence.length},}\\s*$`);
    return pattern.test(line);
}

function isHeading(line: string): boolean {
    return /^\s{0,3}#{1,6}\s+\S/.test(line);
}

function isListLine(line: string): boolean {
    return /^\s{0,6}(?:[-+*]|\d+[.)])\s+\S/.test(line);
}

function isBlockquoteLine(line: string): boolean {
    return /^\s{0,3}>\s?/.test(line);
}

function getLeadingWhitespaceLength(line: string): number {
    return line.match(/^\s*/)?.[0].length ?? 0;
}

function getLineDepth(line: string): number {
    const indent = getLeadingWhitespaceLength(line.replace(/\t/g, "    "));
    return Math.max(1, Math.floor(indent / 2) + 1);
}

function getMarkerRange(
    kind: HybridMarkdownBlockKind,
    line: MarkdownLine,
): Pick<HybridMarkdownBlock, "depth" | "markerFrom" | "markerTo"> {
    if (kind === "heading") {
        const match = line.text.match(/^(\s{0,3})(#{1,6}\s+)/);
        if (!match) {
            return {};
        }
        return {
            depth: match[2].trim().length,
            markerFrom: line.from + match[1].length,
            markerTo: line.from + match[1].length + match[2].length,
        };
    }

    if (kind === "list") {
        const match = line.text.match(/^(\s{0,6})((?:[-+*]|\d+[.)])\s+)/);
        if (!match) {
            return {};
        }
        return {
            depth: getLineDepth(match[1]),
            markerFrom: line.from + match[1].length,
            markerTo: line.from + match[1].length + match[2].length,
        };
    }

    if (kind === "blockquote") {
        const match = line.text.match(/^(\s{0,3})(>\s?)/);
        if (!match) {
            return {};
        }
        return {
            depth: 1,
            markerFrom: line.from + match[1].length,
            markerTo: line.from + match[1].length + match[2].length,
        };
    }

    return {};
}

function hasPipeTableDelimiter(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.includes("|")) {
        return false;
    }

    return /^\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)+\|?$/.test(trimmed);
}

function looksLikeTableHeader(line: string, nextLine?: string): boolean {
    if (!nextLine || !line.includes("|")) {
        return false;
    }

    return hasPipeTableDelimiter(nextLine);
}

function createBlock(
    kind: HybridMarkdownBlockKind,
    lines: MarkdownLine[],
    markdown: string,
    fromIndex: number,
    toIndexExclusive: number,
): HybridMarkdownBlock {
    const from = lines[fromIndex].from;
    const to = lines[toIndexExclusive - 1].to;
    const marker = getMarkerRange(kind, lines[fromIndex]);

    return {
        kind,
        from,
        lineFrom: fromIndex,
        lineTo: toIndexExclusive - 1,
        ...marker,
        renderMode: kind === "table" || kind === "code" ? "widget" : "line",
        to,
        markdown: markdown.slice(from, to),
    };
}

export function findHybridMarkdownBlocks(markdown: string): HybridMarkdownBlock[] {
    const lines = getMarkdownLines(markdown);
    const blocks: HybridMarkdownBlock[] = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.text.trim();

        if (trimmed.length === 0) {
            blocks.push(createBlock("blank", lines, markdown, index, index + 1));
            index++;
            continue;
        }

        const fence = isFenceStart(line.text);
        if (fence) {
            let endIndex = index + 1;
            while (endIndex < lines.length) {
                if (isFenceEnd(lines[endIndex].text, fence)) {
                    endIndex++;
                    break;
                }
                endIndex++;
            }
            blocks.push(createBlock("code", lines, markdown, index, endIndex));
            index = endIndex;
            continue;
        }

        if (looksLikeTableHeader(line.text, lines[index + 1]?.text)) {
            let endIndex = index + 2;
            while (endIndex < lines.length) {
                const row = lines[endIndex].text;
                if (row.trim().length === 0 || !row.includes("|")) {
                    break;
                }
                endIndex++;
            }
            blocks.push(createBlock("table", lines, markdown, index, endIndex));
            index = endIndex;
            continue;
        }

        if (isHeading(line.text)) {
            blocks.push(createBlock("heading", lines, markdown, index, index + 1));
            index++;
            continue;
        }

        if (isListLine(line.text)) {
            let endIndex = index + 1;
            while (endIndex < lines.length) {
                const row = lines[endIndex].text;
                if (row.trim().length === 0) {
                    break;
                }
                if (!isListLine(row) && !/^\s{2,}\S/.test(row)) {
                    break;
                }
                endIndex++;
            }
            blocks.push(createBlock("list", lines, markdown, index, endIndex));
            index = endIndex;
            continue;
        }

        if (isBlockquoteLine(line.text)) {
            let endIndex = index + 1;
            while (endIndex < lines.length && isBlockquoteLine(lines[endIndex].text)) {
                endIndex++;
            }
            blocks.push(createBlock("blockquote", lines, markdown, index, endIndex));
            index = endIndex;
            continue;
        }

        let endIndex = index + 1;
        while (endIndex < lines.length) {
            const row = lines[endIndex].text;
            if (
                row.trim().length === 0 ||
                isFenceStart(row) ||
                looksLikeTableHeader(row, lines[endIndex + 1]?.text) ||
                isHeading(row) ||
                isListLine(row) ||
                isBlockquoteLine(row)
            ) {
                break;
            }
            endIndex++;
        }

        blocks.push(createBlock("paragraph", lines, markdown, index, endIndex));
        index = endIndex;
    }

    return blocks;
}
