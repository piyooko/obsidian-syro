import { ClozeContextMode, ClozeContextPerformanceMode } from "src/settings";

const TRIMMED_TOP_MARKER = "... 上文已折叠 ...";
const TRIMMED_BOTTOM_MARKER = "... 下文已折叠 ...";

export interface ClozeReviewContextSettings {
    clozeContextMode: ClozeContextMode;
    clozeContextPerformanceMode: ClozeContextPerformanceMode;
    clozeContextSoftLimitLines: number;
}

export interface ClozeReviewContextInput {
    noteText?: string;
    questionText: string;
    firstLineNum?: number;
    activeLinesInQuestion: number[];
    settings: ClozeReviewContextSettings;
}

interface LineRange {
    start: number;
    end: number;
}

interface ExtractedContext {
    text: string;
    startLine: number;
    endLine: number;
    activeStartLine: number;
    activeEndLine: number;
}

export function resolveClozeReviewContext(input: ClozeReviewContextInput): string {
    const mode = input.settings.clozeContextMode ?? "single";
    const performanceMode = input.settings.clozeContextPerformanceMode ?? "off";
    const softLimitLines = Math.max(1, input.settings.clozeContextSoftLimitLines ?? 15);

    const extracted = extractContextByMode(input, mode);
    if (performanceMode === "off") {
        return extracted.text;
    }

    return applySafeTrim(extracted, softLimitLines);
}

function extractContextByMode(
    input: ClozeReviewContextInput,
    mode: ClozeContextMode,
): ExtractedContext {
    const fallback = buildFallbackContext(input);
    if (
        !input.noteText ||
        input.firstLineNum === undefined ||
        input.activeLinesInQuestion.length === 0
    ) {
        return fallback;
    }

    const noteLines = splitLines(input.noteText);
    if (noteLines.length === 0) {
        return fallback;
    }

    const activeAbsoluteLines = input.activeLinesInQuestion
        .map((line) => input.firstLineNum + Math.max(0, line - 1))
        .filter((line) => line >= 0 && line < noteLines.length);

    if (activeAbsoluteLines.length === 0) {
        return fallback;
    }

    let range: LineRange;
    switch (mode) {
        case "double-break":
            range = findBreakDelimitedRange(noteLines, activeAbsoluteLines[0], 2);
            break;
        case "expanded":
            range = findExpandedParagraphRange(noteLines, activeAbsoluteLines[0]);
            break;
        case "full":
            range = { start: 0, end: noteLines.length - 1 };
            break;
        case "single":
        default:
            range = findBreakDelimitedRange(noteLines, activeAbsoluteLines[0], 1);
            break;
    }

    return {
        text: joinLines(noteLines, range),
        startLine: range.start,
        endLine: range.end,
        activeStartLine: Math.min(...activeAbsoluteLines),
        activeEndLine: Math.max(...activeAbsoluteLines),
    };
}

function buildFallbackContext(input: ClozeReviewContextInput): ExtractedContext {
    const questionLines = splitLines(input.questionText);
    const activeLines = input.activeLinesInQuestion.length > 0 ? input.activeLinesInQuestion : [1];
    const startLine = input.firstLineNum ?? 0;

    return {
        text: input.questionText,
        startLine,
        endLine: startLine + Math.max(0, questionLines.length - 1),
        activeStartLine: startLine + Math.max(0, Math.min(...activeLines) - 1),
        activeEndLine: startLine + Math.max(0, Math.max(...activeLines) - 1),
    };
}

function findBreakDelimitedRange(
    lines: string[],
    anchor: number,
    breakThreshold: number,
): LineRange {
    let start = anchor;
    while (start > 0) {
        const separatorEnd = findSeparatorEndingAt(lines, start - 1, breakThreshold);
        if (separatorEnd !== -1) {
            break;
        }
        start--;
    }

    let end = anchor;
    while (end < lines.length - 1) {
        const separatorStart = findSeparatorStartingAt(lines, end + 1, breakThreshold);
        if (separatorStart !== -1) {
            break;
        }
        end++;
    }

    return clampRange(lines, { start, end });
}

function findExpandedParagraphRange(lines: string[], anchor: number): LineRange {
    const paragraphs = getParagraphRanges(lines);
    if (paragraphs.length === 0) {
        return { start: anchor, end: anchor };
    }

    const currentIndex = paragraphs.findIndex(
        (paragraph) => anchor >= paragraph.start && anchor <= paragraph.end,
    );
    if (currentIndex === -1) {
        return { start: anchor, end: anchor };
    }

    const firstIndex = Math.max(0, currentIndex - 1);
    const lastIndex = Math.min(paragraphs.length - 1, currentIndex + 1);
    return {
        start: paragraphs[firstIndex].start,
        end: paragraphs[lastIndex].end,
    };
}

function getParagraphRanges(lines: string[]): LineRange[] {
    const result: LineRange[] = [];
    let line = 0;
    while (line < lines.length) {
        while (line < lines.length && isBlankLine(lines[line])) {
            line++;
        }

        if (line >= lines.length) {
            break;
        }

        const start = line;
        while (line + 1 < lines.length && !isBlankLine(lines[line + 1])) {
            line++;
        }

        result.push({ start, end: line });
        line++;
    }

    return result;
}

function findSeparatorEndingAt(lines: string[], index: number, threshold: number): number {
    if (index - threshold + 1 < 0) {
        return -1;
    }

    for (let i = 0; i < threshold; i++) {
        if (!isBlankLine(lines[index - i])) {
            return -1;
        }
    }

    return index - threshold + 1;
}

function findSeparatorStartingAt(lines: string[], index: number, threshold: number): number {
    if (index + threshold - 1 >= lines.length) {
        return -1;
    }

    for (let i = 0; i < threshold; i++) {
        if (!isBlankLine(lines[index + i])) {
            return -1;
        }
    }

    return index + threshold - 1;
}

function clampRange(lines: string[], range: LineRange): LineRange {
    let start = Math.max(0, Math.min(range.start, lines.length - 1));
    let end = Math.max(start, Math.min(range.end, lines.length - 1));

    while (start < end && isBlankLine(lines[start])) {
        start++;
    }
    while (end > start && isBlankLine(lines[end])) {
        end--;
    }

    return { start, end };
}

function applySafeTrim(context: ExtractedContext, softLimitLines: number): string {
    const lines = splitLines(context.text);
    if (lines.length === 0) {
        return context.text;
    }

    const activeStart = Math.max(0, context.activeStartLine - context.startLine);
    const activeEnd = Math.max(activeStart, context.activeEndLine - context.startLine);
    const preferredStart = Math.max(0, activeStart - softLimitLines);
    const preferredEnd = Math.min(lines.length - 1, activeEnd + softLimitLines);

    if (preferredStart === 0 && preferredEnd === lines.length - 1) {
        return context.text;
    }

    let trimStart = preferredStart;
    let trimEnd = preferredEnd;

    trimStart = expandStartForFences(lines, trimStart);
    trimEnd = expandEndForFences(lines, trimEnd);
    trimStart = expandStartForMathBlocks(lines, trimStart);
    trimEnd = expandEndForMathBlocks(lines, trimEnd);

    const tableRangeAtStart = findTableRange(lines, trimStart);
    if (tableRangeAtStart) {
        trimStart = tableRangeAtStart.start;
    }

    const tableRangeAtEnd = findTableRange(lines, trimEnd);
    if (tableRangeAtEnd) {
        trimEnd = tableRangeAtEnd.end;
    }

    const trimmedLines: string[] = [];
    if (trimStart > 0) {
        trimmedLines.push(TRIMMED_TOP_MARKER);
        trimmedLines.push("");
    }

    trimmedLines.push(...lines.slice(trimStart, trimEnd + 1));

    if (trimEnd < lines.length - 1) {
        trimmedLines.push("");
        trimmedLines.push(TRIMMED_BOTTOM_MARKER);
    }

    return trimmedLines.join("\n");
}

function expandStartForFences(lines: string[], start: number): number {
    let insideFence = false;
    let fenceStart = -1;

    for (let i = 0; i < start; i++) {
        if (isFenceLine(lines[i])) {
            insideFence = !insideFence;
            fenceStart = insideFence ? i : -1;
        }
    }

    return insideFence && fenceStart !== -1 ? fenceStart : start;
}

function expandEndForFences(lines: string[], end: number): number {
    let insideFence = false;
    for (let i = 0; i <= end; i++) {
        if (isFenceLine(lines[i])) {
            insideFence = !insideFence;
        }
    }

    if (!insideFence) {
        return end;
    }

    for (let i = end + 1; i < lines.length; i++) {
        if (isFenceLine(lines[i])) {
            return i;
        }
    }

    return lines.length - 1;
}

function expandStartForMathBlocks(lines: string[], start: number): number {
    let insideMath = false;
    let mathStart = -1;

    for (let i = 0; i < start; i++) {
        if (isMathFenceLine(lines[i])) {
            insideMath = !insideMath;
            mathStart = insideMath ? i : -1;
        }
    }

    return insideMath && mathStart !== -1 ? mathStart : start;
}

function expandEndForMathBlocks(lines: string[], end: number): number {
    let insideMath = false;
    for (let i = 0; i <= end; i++) {
        if (isMathFenceLine(lines[i])) {
            insideMath = !insideMath;
        }
    }

    if (!insideMath) {
        return end;
    }

    for (let i = end + 1; i < lines.length; i++) {
        if (isMathFenceLine(lines[i])) {
            return i;
        }
    }

    return lines.length - 1;
}

function findTableRange(lines: string[], index: number): LineRange | null {
    if (!isTableLine(lines[index])) {
        return null;
    }

    let start = index;
    let end = index;

    while (start > 0 && isTableLine(lines[start - 1])) {
        start--;
    }
    while (end < lines.length - 1 && isTableLine(lines[end + 1])) {
        end++;
    }

    return { start, end };
}

function isBlankLine(line: string): boolean {
    return line.trim().length === 0;
}

function isFenceLine(line: string): boolean {
    const trimmed = line.trimStart();
    return /^```/.test(trimmed) || /^~~~/.test(trimmed);
}

function isMathFenceLine(line: string): boolean {
    return line.trim() === "$$";
}

function isTableLine(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.length === 0 || !trimmed.includes("|")) {
        return false;
    }

    return /^\|?.*\|.*$/.test(trimmed);
}

function splitLines(text: string): string[] {
    return text.replaceAll("\r\n", "\n").split("\n");
}

function joinLines(lines: string[], range: LineRange): string {
    return lines.slice(range.start, range.end + 1).join("\n");
}
