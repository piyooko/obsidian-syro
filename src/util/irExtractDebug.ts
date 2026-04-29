import type { IrExtractMatch } from "src/util/irExtractParser";

export interface IrExtractDebugSummary {
    ordinal: number;
    start: number;
    end: number;
    innerStart: number;
    innerEnd: number;
    startLine: number;
    endLine: number;
    depth: number;
    parentOrdinal: number | null;
    parentStart: number | null;
    rawMarkdownLength: number;
    rawMarkdownPreview: string;
}

const DEFAULT_PREVIEW_LENGTH = 120;

export function formatIrExtractDebugPreview(
    markdown: string,
    maxLength = DEFAULT_PREVIEW_LENGTH,
): string {
    const normalized = markdown.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function getDebugDepth(
    match: IrExtractMatch,
    matchByStart: ReadonlyMap<number, IrExtractMatch>,
): number {
    let depth = 0;
    let parentStart = match.parentStart;
    while (parentStart !== undefined) {
        const parent = matchByStart.get(parentStart);
        if (!parent) {
            break;
        }
        depth++;
        parentStart = parent.parentStart;
    }
    return depth;
}

export function summarizeIrExtractMatchesForDebug(
    matches: readonly IrExtractMatch[],
): IrExtractDebugSummary[] {
    const matchByStart = new Map(matches.map((match) => [match.start, match]));
    const ordinalByStart = new Map(matches.map((match, ordinal) => [match.start, ordinal]));

    return matches.map((match, ordinal) => ({
        ordinal,
        start: match.start,
        end: match.end,
        innerStart: match.innerStart,
        innerEnd: match.innerEnd,
        startLine: match.anchor.startLine,
        endLine: match.anchor.endLine,
        depth: getDebugDepth(match, matchByStart),
        parentOrdinal:
            match.parentStart === undefined
                ? null
                : (ordinalByStart.get(match.parentStart) ?? null),
        parentStart: match.parentStart ?? null,
        rawMarkdownLength: match.rawMarkdown.length,
        rawMarkdownPreview: formatIrExtractDebugPreview(match.rawMarkdown),
    }));
}
