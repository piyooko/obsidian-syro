import { findCodeContextSegments, isIndexInsideCodeContext } from "src/util/codeAwareCloze";
import { cyrb53 } from "src/util/utils";

export interface IrExtractAnchor {
    start: number;
    end: number;
    innerStart: number;
    innerEnd: number;
    startLine: number;
    endLine: number;
    contentHash: string;
}

export interface IrExtractMatch {
    start: number;
    end: number;
    innerStart: number;
    innerEnd: number;
    rawMarkdown: string;
    parentStart?: number;
    anchor: IrExtractAnchor;
}

interface OpenIrExtract {
    kind: "ir";
    start: number;
    innerStart: number;
    parentStart?: number;
}

interface OpenOtherBrace {
    kind: "other";
    start: number;
}

type OpenBraceSegment = OpenIrExtract | OpenOtherBrace;

const IR_OPEN = "{{ir::";
const IR_CLOSE = "}}";
const MARKDOWN_BLOCK_PREFIX =
    /^([ \t]*(?:(?:#{1,6}[ \t]+)|(?:[-+*][ \t]+\[[ xX]\][ \t]+)|(?:[-+*][ \t]+)|(?:\d{1,9}[.)][ \t]+)|(?:>[ \t]*)))/;

function countLinesBefore(text: string, offset: number): number {
    let line = 0;
    for (let index = 0; index < offset && index < text.length; index++) {
        if (text[index] === "\n") {
            line++;
        }
    }
    return line;
}

function createAnchor(text: string, start: number, end: number, innerStart: number, innerEnd: number): IrExtractAnchor {
    return {
        start,
        end,
        innerStart,
        innerEnd,
        startLine: countLinesBefore(text, start),
        endLine: countLinesBefore(text, end),
        contentHash: cyrb53(text.slice(innerStart, innerEnd)),
    };
}

export function parseIrExtracts(text: string): IrExtractMatch[] {
    const codeSegments = findCodeContextSegments(text);
    const stack: OpenBraceSegment[] = [];
    const matches: IrExtractMatch[] = [];
    let index = 0;

    while (index < text.length) {
        if (text.startsWith(IR_OPEN, index) && !isIndexInsideCodeContext(index, codeSegments)) {
            stack.push({
                kind: "ir",
                start: index,
                innerStart: index + IR_OPEN.length,
                parentStart: findOpenIrParentStart(stack),
            });
            index += IR_OPEN.length;
            continue;
        }

        if (text.startsWith("{{", index) && !isIndexInsideCodeContext(index, codeSegments)) {
            stack.push({ kind: "other", start: index });
            index += 2;
            continue;
        }

        if (
            text.startsWith(IR_CLOSE, index) &&
            stack.length > 0 &&
            !isIndexInsideCodeContext(index, codeSegments)
        ) {
            const opened = stack.pop();
            if (opened?.kind === "ir") {
                const end = index + IR_CLOSE.length;
                const rawMarkdown = text.slice(opened.innerStart, index);
                matches.push({
                    start: opened.start,
                    end,
                    innerStart: opened.innerStart,
                    innerEnd: index,
                    rawMarkdown,
                    parentStart: opened.parentStart,
                    anchor: createAnchor(text, opened.start, end, opened.innerStart, index),
                });
            }
            index += IR_CLOSE.length;
            continue;
        }

        index++;
    }

    return matches.sort((left, right) => left.start - right.start || right.end - left.end);
}

export function stripIrExtractSyntax(text: string): string {
    const matches = parseIrExtracts(text);
    if (matches.length === 0) {
        return text.replaceAll(IR_OPEN, "");
    }

    let result = text;
    const tokenRanges = matches.flatMap((match) => [
        { from: match.innerEnd, to: match.end },
        { from: match.start, to: match.innerStart },
    ]);
    for (const range of tokenRanges.sort((left, right) => right.from - left.from)) {
        result = result.slice(0, range.from) + result.slice(range.to);
    }
    return result.replaceAll(IR_OPEN, "");
}

function overlaps(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
    return leftStart < rightEnd && leftEnd > rightStart;
}

function contains(outerStart: number, outerEnd: number, innerStart: number, innerEnd: number): boolean {
    return outerStart <= innerStart && outerEnd >= innerEnd;
}

export function expandPartialOverlapSelectionToValidBoundary(
    text: string,
    from: number,
    to: number,
): { from: number; to: number } {
    let nextFrom = Math.max(0, Math.min(from, to));
    let nextTo = Math.min(text.length, Math.max(from, to));
    let changed = true;
    const matches = parseIrExtracts(text);

    while (changed) {
        changed = false;
        for (const match of matches) {
            if (!overlaps(nextFrom, nextTo, match.start, match.end)) {
                continue;
            }
            if (contains(match.innerStart, match.innerEnd, nextFrom, nextTo)) {
                continue;
            }
            if (contains(nextFrom, nextTo, match.start, match.end)) {
                continue;
            }
            nextFrom = Math.min(nextFrom, match.start);
            nextTo = Math.max(nextTo, match.end);
            changed = true;
        }
    }

    return { from: nextFrom, to: nextTo };
}

function containsUnmatchedClosingBraceToken(text: string): boolean {
    let depth = 0;
    let index = 0;
    while (index < text.length) {
        if (text.startsWith("{{", index)) {
            depth++;
            index += 2;
            continue;
        }
        if (text.startsWith(IR_CLOSE, index)) {
            if (depth === 0) {
                return true;
            }
            depth--;
            index += IR_CLOSE.length;
            continue;
        }
        index++;
    }
    return false;
}

function countIrOpenTokens(text: string): number {
    let count = 0;
    let index = 0;
    while (index < text.length) {
        if (text.startsWith(IR_OPEN, index)) {
            count++;
            index += IR_OPEN.length;
            continue;
        }
        index++;
    }
    return count;
}

function partiallyOverlaps(
    outerStart: number,
    outerEnd: number,
    innerStart: number,
    innerEnd: number,
): boolean {
    return overlaps(outerStart, outerEnd, innerStart, innerEnd) && !contains(outerStart, outerEnd, innerStart, innerEnd);
}

export function selectionContainsIrExtractBoundarySyntax(
    text: string,
    from: number,
    to: number,
): boolean {
    const selectionFrom = Math.max(0, Math.min(from, to));
    const selectionTo = Math.min(text.length, Math.max(from, to));
    if (selectionFrom === selectionTo) {
        return false;
    }

    const selected = text.slice(selectionFrom, selectionTo);
    if (containsUnmatchedClosingBraceToken(selected)) {
        return true;
    }

    if (countIrOpenTokens(selected) !== parseIrExtracts(selected).length) {
        return true;
    }

    return parseIrExtracts(text).some(
        (match) =>
            partiallyOverlaps(selectionFrom, selectionTo, match.start, match.innerStart) ||
            partiallyOverlaps(selectionFrom, selectionTo, match.innerEnd, match.end),
    );
}

export function wrapSelectionAsExtract(
    text: string,
    from: number,
    to: number,
): {
    text: string;
    from: number;
    to: number;
    replaceFrom: number;
    replaceTo: number;
    innerFrom: number;
    innerTo: number;
} {
    const expanded = expandPartialOverlapSelectionToValidBoundary(text, from, to);
    const selected = text.slice(expanded.from, expanded.to);
    const preservedPrefix = getPreservedBlockPrefixForExtractWrap(text, expanded.from, selected);
    const nextText =
        text.slice(0, expanded.from) +
        preservedPrefix +
        IR_OPEN +
        selected.slice(preservedPrefix.length) +
        IR_CLOSE +
        text.slice(expanded.to);
    const innerFrom = expanded.from + preservedPrefix.length + IR_OPEN.length;
    const innerTo = innerFrom + selected.length - preservedPrefix.length;
    return {
        text: nextText,
        from: expanded.from,
        to: expanded.to + IR_OPEN.length + IR_CLOSE.length,
        replaceFrom: expanded.from,
        replaceTo: expanded.to,
        innerFrom,
        innerTo,
    };
}

function findOpenIrParentStart(stack: OpenBraceSegment[]): number | undefined {
    for (let index = stack.length - 1; index >= 0; index--) {
        const entry = stack[index];
        if (entry.kind === "ir") {
            return entry.start;
        }
    }
    return undefined;
}

function getPreservedBlockPrefixForExtractWrap(text: string, from: number, selected: string): string {
    const lineStart = text.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
    const beforeSelection = text.slice(lineStart, from);
    if (!/^[ \t]{0,3}$/.test(beforeSelection)) {
        return "";
    }
    return selected.match(MARKDOWN_BLOCK_PREFIX)?.[0] ?? "";
}

export function replaceExtractInnerMarkdown(
    text: string,
    match: Pick<IrExtractMatch, "innerStart" | "innerEnd">,
    nextInnerMarkdown: string,
): string {
    return text.slice(0, match.innerStart) + nextInnerMarkdown + text.slice(match.innerEnd);
}

export function removeExtractWrapperKeepInnerContent(
    text: string,
    match: Pick<IrExtractMatch, "start" | "end" | "innerStart" | "innerEnd">,
): string {
    return text.slice(0, match.start) + text.slice(match.innerStart, match.innerEnd) + text.slice(match.end);
}

export function findIrExtractAtOffset(text: string, offset: number): IrExtractMatch | null {
    const matches = parseIrExtracts(text).filter((match) => match.start <= offset && match.end >= offset);
    if (matches.length === 0) {
        return null;
    }
    return matches.sort((left, right) => left.end - left.start - (right.end - right.start))[0];
}
