import type { IrExtractMatch } from "src/util/irExtractParser";
import type { ExtractSliceRule, ExtractSourceAnchor } from "src/dataStore/extractStore";

export interface ExtractReviewContext {
    sourceFrom: number;
    sourceTo: number;
    markdown: string;
    currentOuterFrom: number;
    currentOuterTo: number;
    currentInnerFrom: number;
    currentInnerTo: number;
    currentOpenTokenFrom: number;
    currentOpenTokenTo: number;
    currentCloseTokenFrom: number;
    currentCloseTokenTo: number;
}

interface BlankBlockRange {
    from: number;
    to: number;
}

function getBlankBlockRanges(text: string): BlankBlockRange[] {
    const ranges: BlankBlockRange[] = [];
    const separator = /\r?\n[ \t]*\r?\n/g;
    let blockStart = 0;
    let match: RegExpExecArray | null;

    while ((match = separator.exec(text)) !== null) {
        const blockEnd = match.index;
        if (blockEnd > blockStart) {
            ranges.push({ from: blockStart, to: blockEnd });
        }
        blockStart = match.index + match[0].length;
    }

    if (blockStart < text.length) {
        ranges.push({ from: blockStart, to: text.length });
    }

    if (ranges.length === 0 && text.length > 0) {
        ranges.push({ from: 0, to: text.length });
    }

    return ranges;
}

export function buildExtractReviewContext(
    sourceText: string,
    match: IrExtractMatch,
): ExtractReviewContext {
    const blocks = getBlankBlockRanges(sourceText);
    const blockIndex = blocks.findIndex(
        (block) => match.start >= block.from && match.end <= block.to,
    );
    const currentIndex =
        blockIndex >= 0
            ? blockIndex
            : blocks.findIndex((block) => match.start < block.to && match.end > block.from);

    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const fromBlock = blocks[Math.max(0, safeIndex - 1)] ?? { from: 0, to: sourceText.length };
    const toBlock = blocks[Math.min(blocks.length - 1, safeIndex + 1)] ?? fromBlock;
    const sourceFrom = fromBlock.from;
    const sourceTo = toBlock.to;

    return {
        sourceFrom,
        sourceTo,
        markdown: sourceText.slice(sourceFrom, sourceTo),
        currentOuterFrom: match.start - sourceFrom,
        currentOuterTo: match.end - sourceFrom,
        currentInnerFrom: match.innerStart - sourceFrom,
        currentInnerTo: match.innerEnd - sourceFrom,
        currentOpenTokenFrom: match.start - sourceFrom,
        currentOpenTokenTo: match.innerStart - sourceFrom,
        currentCloseTokenFrom: match.innerEnd - sourceFrom,
        currentCloseTokenTo: match.end - sourceFrom,
    };
}

export function buildAutoExtractReviewContext(
    sourceText: string,
    anchor: ExtractSourceAnchor,
    sliceRule: ExtractSliceRule,
): ExtractReviewContext {
    const current = {
        start: Math.max(0, Math.min(anchor.start, sourceText.length)),
        end: Math.max(0, Math.min(anchor.end, sourceText.length)),
    };
    if (sliceRule !== "blank-block") {
        return {
            sourceFrom: current.start,
            sourceTo: current.end,
            markdown: sourceText.slice(current.start, current.end),
            currentOuterFrom: 0,
            currentOuterTo: current.end - current.start,
            currentInnerFrom: 0,
            currentInnerTo: current.end - current.start,
            currentOpenTokenFrom: 0,
            currentOpenTokenTo: 0,
            currentCloseTokenFrom: current.end - current.start,
            currentCloseTokenTo: current.end - current.start,
        };
    }

    const blocks = getBlankBlockRanges(sourceText);
    const blockIndex = blocks.findIndex(
        (block) => current.start >= block.from && current.end <= block.to,
    );
    const safeIndex =
        blockIndex >= 0
            ? blockIndex
            : Math.max(
                  0,
                  blocks.findIndex(
                      (block) => current.start < block.to && current.end > block.from,
                  ),
              );
    const fromBlock = blocks[Math.max(0, safeIndex - 1)] ?? { from: current.start, to: current.end };
    const toBlock =
        blocks[Math.min(blocks.length - 1, safeIndex + 1)] ?? fromBlock;
    const sourceFrom = fromBlock.from;
    const sourceTo = toBlock.to;
    const currentFrom = current.start - sourceFrom;
    const currentTo = current.end - sourceFrom;

    return {
        sourceFrom,
        sourceTo,
        markdown: sourceText.slice(sourceFrom, sourceTo),
        currentOuterFrom: currentFrom,
        currentOuterTo: currentTo,
        currentInnerFrom: currentFrom,
        currentInnerTo: currentTo,
        currentOpenTokenFrom: currentFrom,
        currentOpenTokenTo: currentFrom,
        currentCloseTokenFrom: currentTo,
        currentCloseTokenTo: currentTo,
    };
}

export function replaceExtractReviewContext(
    sourceText: string,
    context: Pick<ExtractReviewContext, "sourceFrom" | "sourceTo">,
    nextContextMarkdown: string,
): string {
    return (
        sourceText.slice(0, context.sourceFrom) +
        nextContextMarkdown +
        sourceText.slice(context.sourceTo)
    );
}

export function hasCurrentExtractWrapper(
    markdown: string,
    ranges: Pick<
        ExtractReviewContext,
        | "currentOpenTokenFrom"
        | "currentOpenTokenTo"
        | "currentCloseTokenFrom"
        | "currentCloseTokenTo"
    >,
): boolean {
    return (
        markdown.slice(ranges.currentOpenTokenFrom, ranges.currentOpenTokenTo) === "{{ir::" &&
        markdown.slice(ranges.currentCloseTokenFrom, ranges.currentCloseTokenTo) === "}}"
    );
}
