import type { AutoExtractRule } from "src/settings";
import type { IrExtractAnchor } from "src/util/irExtractParser";
import { cyrb53 } from "src/util/utils";

export interface AutoExtractSlice {
    key: string;
    rule: "heading" | "blank-block";
    rawMarkdown: string;
    sourceAnchor: IrExtractAnchor;
    headingPath?: string[];
}

interface HeadingToken {
    level: number;
    title: string;
    start: number;
    end: number;
}

interface BlankBlockRange {
    from: number;
    to: number;
}

const CONTEXT_RADIUS = 80;
const BLANK_BLOCK_SEPARATOR = /\r?\n[ \t]*\r?\n/g;
const HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/;

function countLinesBefore(text: string, offset: number): number {
    let line = 0;
    for (let index = 0; index < offset && index < text.length; index++) {
        if (text[index] === "\n") {
            line++;
        }
    }
    return line;
}

function createAutoAnchor(text: string, start: number, end: number): IrExtractAnchor {
    return {
        start,
        end,
        innerStart: start,
        innerEnd: end,
        startLine: countLinesBefore(text, start),
        endLine: countLinesBefore(text, end),
        prefix: text.slice(Math.max(0, start - CONTEXT_RADIUS), start),
        suffix: text.slice(end, Math.min(text.length, end + CONTEXT_RADIUS)),
        contentHash: cyrb53(text.slice(start, end).trim()),
    };
}

function normalizeTitle(title: string): string {
    return title.replace(/\s+/g, " ").trim();
}

function parseHeadings(text: string): HeadingToken[] {
    const headings: HeadingToken[] = [];
    let offset = 0;
    let inFence = false;

    for (const line of text.split(/(\n)/)) {
        if (line === "\n") {
            offset += line.length;
            continue;
        }

        const trimmed = line.trim();
        if (/^(```|~~~)/.test(trimmed)) {
            inFence = !inFence;
        }

        if (!inFence) {
            const match = line.match(HEADING_RE);
            if (match) {
                headings.push({
                    level: match[1].length,
                    title: normalizeTitle(match[2]),
                    start: offset,
                    end: offset + line.length,
                });
            }
        }
        offset += line.length;
    }

    return headings;
}

function buildHeadingSlices(text: string, headingLevel: number): AutoExtractSlice[] {
    const headings = parseHeadings(text);
    const stack: HeadingToken[] = [];
    const duplicateCounts = new Map<string, number>();
    const slices: AutoExtractSlice[] = [];

    headings.forEach((heading, index) => {
        while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
            stack.pop();
        }
        stack.push(heading);

        if (heading.level !== headingLevel) {
            return;
        }

        const nextBoundary = headings
            .slice(index + 1)
            .find((candidate) => candidate.level <= headingLevel);
        const end = nextBoundary?.start ?? text.length;
        const rawMarkdown = text.slice(heading.start, end).trim();
        if (!rawMarkdown) {
            return;
        }

        const path = stack.map((entry) => entry.title);
        const duplicateBase = `heading:${heading.level}:${path.join("/")}`;
        const duplicateIndex = duplicateCounts.get(duplicateBase) ?? 0;
        duplicateCounts.set(duplicateBase, duplicateIndex + 1);

        slices.push({
            key: `${duplicateBase}:${duplicateIndex}`,
            rule: "heading",
            rawMarkdown,
            sourceAnchor: createAutoAnchor(text, heading.start, end),
            headingPath: path,
        });
    });

    return slices;
}

function getBlankBlockRanges(text: string): BlankBlockRange[] {
    const ranges: BlankBlockRange[] = [];
    let blockStart = 0;
    let match: RegExpExecArray | null;

    while ((match = BLANK_BLOCK_SEPARATOR.exec(text)) !== null) {
        const blockEnd = match.index;
        if (blockEnd > blockStart && text.slice(blockStart, blockEnd).trim()) {
            ranges.push({ from: blockStart, to: blockEnd });
        }
        blockStart = match.index + match[0].length;
    }

    if (blockStart < text.length && text.slice(blockStart).trim()) {
        ranges.push({ from: blockStart, to: text.length });
    }

    return ranges;
}

function buildBlankBlockSlices(text: string): AutoExtractSlice[] {
    const duplicateCounts = new Map<string, number>();
    return getBlankBlockRanges(text).map((range) => {
        const rawMarkdown = text.slice(range.from, range.to).trim();
        const hash = cyrb53(rawMarkdown);
        const duplicateIndex = duplicateCounts.get(hash) ?? 0;
        duplicateCounts.set(hash, duplicateIndex + 1);

        return {
            key: `blank-block:${hash}:${duplicateIndex}`,
            rule: "blank-block",
            rawMarkdown,
            sourceAnchor: createAutoAnchor(text, range.from, range.to),
        };
    });
}

export function buildAutoExtractSlices(text: string, rule: AutoExtractRule): AutoExtractSlice[] {
    if (!rule.enabled) {
        return [];
    }
    if (rule.rule === "heading") {
        const headingLevel = Math.max(1, Math.min(6, Math.round(rule.headingLevel ?? 1)));
        return buildHeadingSlices(text, headingLevel);
    }
    return buildBlankBlockSlices(text);
}

