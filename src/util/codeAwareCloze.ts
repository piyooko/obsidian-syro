import { ClozeCrafter } from "clozecraft";

export type StandardClozeType = "highlight" | "bold";

export interface StandardClozeMatch {
    type: StandardClozeType;
    start: number;
    end: number;
    delimiter: string;
    fullMatch: string;
    innerText: string;
}

export interface CodeContextSegment {
    start: number;
    end: number;
    kind: "inline" | "fenced";
}

interface MaskedCodeContextEntry {
    masked: string;
    original: string;
}

export interface CodeContextMask {
    maskedText: string;
    entries: MaskedCodeContextEntry[];
}

type ClozeNote = NonNullable<ReturnType<ClozeCrafter["createClozeNote"]>>;

export const DEFAULT_STANDARD_CLOZE_PATTERNS = new Set([
    "==[123;;]answer[;;hint]==",
    "**[123;;]answer[;;hint]**",
]);

const STANDARD_CLOZE_REGEXES: Record<StandardClozeType, RegExp> = {
    highlight: /==(.*?)==/g,
    bold: /\*\*(.*?)\*\*/g,
};

const STANDARD_CLOZE_DELIMITERS: Record<StandardClozeType, string> = {
    highlight: "==",
    bold: "**",
};

const MASK_CHAR_START = 0xe000;
const MASK_CHAR_END = 0xf8ff;
const MASK_CHAR_RANGE = MASK_CHAR_END - MASK_CHAR_START + 1;

function countRepeatedChars(text: string, index: number, char: string): number {
    let count = 0;
    while (index + count < text.length && text[index + count] === char) {
        count++;
    }

    return count;
}

function isLineStart(text: string, index: number): boolean {
    return index === 0 || text[index - 1] === "\n";
}

function findNextLineStart(text: string, index: number): number {
    const newlineIndex = text.indexOf("\n", index);
    return newlineIndex === -1 ? text.length : newlineIndex + 1;
}

function findFenceSegment(text: string, start: number): CodeContextSegment | null {
    if (!isLineStart(text, start)) {
        return null;
    }

    const fenceChar = text[start];
    if (fenceChar !== "`" && fenceChar !== "~") {
        return null;
    }

    const fenceLength = countRepeatedChars(text, start, fenceChar);
    if (fenceLength < 3) {
        return null;
    }

    const fence = fenceChar.repeat(fenceLength);
    let lineStart = findNextLineStart(text, start);

    while (lineStart < text.length) {
        if (text.startsWith(fence, lineStart)) {
            return {
                start,
                end: findNextLineStart(text, lineStart),
                kind: "fenced",
            };
        }

        lineStart = findNextLineStart(text, lineStart);
    }

    return {
        start,
        end: text.length,
        kind: "fenced",
    };
}

function findInlineCodeSegment(text: string, start: number): CodeContextSegment | null {
    if (text[start] !== "`") {
        return null;
    }

    const delimiterLength = countRepeatedChars(text, start, "`");
    const delimiter = "`".repeat(delimiterLength);
    const closingIndex = text.indexOf(delimiter, start + delimiterLength);

    if (closingIndex === -1) {
        return null;
    }

    return {
        start,
        end: closingIndex + delimiterLength,
        kind: "inline",
    };
}

function getMaskCharacter(index: number): string {
    return String.fromCharCode(MASK_CHAR_START + (index % MASK_CHAR_RANGE));
}

function buildMaskReplacement(original: string, maskChar: string): string {
    const chars = original.split("");

    for (let index = 0; index < chars.length; index++) {
        if (chars[index] === "\n") {
            continue;
        }

        chars[index] = maskChar;
    }

    return chars.join("");
}

export function findCodeContextSegments(text: string): CodeContextSegment[] {
    const segments: CodeContextSegment[] = [];
    let index = 0;

    while (index < text.length) {
        const fenceSegment = findFenceSegment(text, index);
        if (fenceSegment) {
            segments.push(fenceSegment);
            index = fenceSegment.end;
            continue;
        }

        const inlineSegment = findInlineCodeSegment(text, index);
        if (inlineSegment) {
            segments.push(inlineSegment);
            index = inlineSegment.end;
            continue;
        }

        index++;
    }

    return segments;
}

export function isIndexInsideCodeContext(index: number, segments: CodeContextSegment[]): boolean {
    return segments.some((segment) => index >= segment.start && index < segment.end);
}

export function createCodeContextMask(text: string): CodeContextMask {
    const segments = findCodeContextSegments(text);
    if (segments.length === 0) {
        return { maskedText: text, entries: [] };
    }

    const entries: MaskedCodeContextEntry[] = [];
    let maskedText = text;

    for (let index = segments.length - 1; index >= 0; index--) {
        const segment = segments[index];
        const original = text.slice(segment.start, segment.end);
        const masked = buildMaskReplacement(original, getMaskCharacter(index));

        maskedText =
            maskedText.slice(0, segment.start) + masked + maskedText.slice(segment.end);
        entries.unshift({ masked, original });
    }

    return { maskedText, entries };
}

export function restoreCodeContextMask(text: string, mask: CodeContextMask): string {
    return mask.entries.reduce((currentText, entry) => {
        return currentText.split(entry.masked).join(entry.original);
    }, text);
}

export function extractStandardClozeMatches(text: string): StandardClozeMatch[] {
    const mask = createCodeContextMask(text);
    const matches: StandardClozeMatch[] = [];

    for (const [type, regex] of Object.entries(STANDARD_CLOZE_REGEXES) as Array<
        [StandardClozeType, RegExp]
    >) {
        for (const match of mask.maskedText.matchAll(regex)) {
            if (match.index === undefined) {
                continue;
            }

            const start = match.index;
            const end = start + match[0].length;
            const delimiter = STANDARD_CLOZE_DELIMITERS[type];

            matches.push({
                type,
                start,
                end,
                delimiter,
                fullMatch: text.slice(start, end),
                innerText: text.slice(start + delimiter.length, end - delimiter.length),
            });
        }
    }

    return matches.sort((a, b) => a.start - b.start || b.end - a.end);
}

export function getNonStandardClozePatterns(patterns: string[]): string[] {
    return (patterns ?? []).filter((pattern) => !DEFAULT_STANDARD_CLOZE_PATTERNS.has(pattern));
}

export function hasStandardClozeOutsideCode(text: string, patterns: string[]): boolean {
    const standardMatches = extractStandardClozeMatches(text);
    return standardMatches.some((match) =>
        patterns.includes(
            match.type === "highlight"
                ? "==[123;;]answer[;;hint]=="
                : "**[123;;]answer[;;hint]**",
        ),
    );
}

export function hasNonStandardClozeOutsideCode(text: string, patterns: string[]): boolean {
    const nonStandardPatterns = getNonStandardClozePatterns(patterns);
    if (nonStandardPatterns.length === 0) {
        return false;
    }

    const mask = createCodeContextMask(text);
    const clozeNote = new ClozeCrafter(nonStandardPatterns).createClozeNote(mask.maskedText);
    return Boolean(clozeNote && clozeNote.numCards > 0);
}

export function createCodeAwareClozeNote(
    text: string,
    patterns: string[],
): { note: ClozeNote; mask: CodeContextMask } | null {
    const mask = createCodeContextMask(text);
    const clozeNote = new ClozeCrafter(patterns).createClozeNote(mask.maskedText);

    if (!clozeNote) {
        return null;
    }

    return {
        note: clozeNote,
        mask,
    };
}
