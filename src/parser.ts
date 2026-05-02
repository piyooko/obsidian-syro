import { CardType } from "src/Question";
import {
    findCodeContextSegments,
    hasNonStandardClozeOutsideCode,
    hasStandardClozeOutsideCode,
    isIndexInsideCodeContext,
} from "src/util/codeAwareCloze";
import { parseIrExtracts, stripIrExtractSyntax } from "src/util/irExtractParser";

export let debugParser = false;

export interface ParserOptions {
    singleLineCardSeparator: string;
    singleLineReversedCardSeparator: string;
    multilineCardSeparator: string;
    multilineReversedCardSeparator: string;
    multilineCardEndMarker: string;
    clozePatterns: string[];
    convertAnkiClozesToClozes?: boolean;
    parseClozesInCodeBlocks?: boolean;
}

export function setDebugParser(value: boolean) {
    debugParser = value;
}

export class ParsedQuestionInfo {
    cardType: CardType;
    text: string;

    // Line numbers start at 0
    firstLineNum: number;
    lastLineNum: number;

    constructor(cardType: CardType, text: string, firstLineNum: number, lastLineNum: number) {
        this.cardType = cardType;
        this.text = text;
        this.firstLineNum = firstLineNum;
        this.lastLineNum = lastLineNum;
    }

    isQuestionLineNum(lineNum: number): boolean {
        return lineNum >= this.firstLineNum && lineNum <= this.lastLineNum;
    }
}

interface ExcludedRange {
    start: number;
    end: number;
}

function isIndexInsideExcludedRange(index: number, excludedRanges: ExcludedRange[]): boolean {
    return excludedRanges.some((range) => index >= range.start && index < range.end);
}

function hasInlineMarker(
    text: string,
    marker: string,
    lineStartOffset: number,
    excludedRanges: ExcludedRange[],
): boolean {
    if (marker.length == 0) return false;

    let startIndex = 0;
    const codeContexts = findCodeContextSegments(text);

    for (;;) {
        const markerIdx = text.indexOf(marker, startIndex);

        if (markerIdx === -1) return false;

        const absoluteMarkerIdx = lineStartOffset + markerIdx;
        const isInsideCode = isIndexInsideCodeContext(markerIdx, codeContexts);
        const isInsideExcludedRange = isIndexInsideExcludedRange(absoluteMarkerIdx, excludedRanges);

        const prefix = text.substring(0, markerIdx);
        const isInsideReservedCurlyPrefix = /\{\{(?:c\d+|ir)$/i.test(prefix);

        if (!isInsideCode && !isInsideReservedCurlyPrefix && !isInsideExcludedRange) {
            return true;
        }

        startIndex = markerIdx + marker.length;
    }
}

/**
 * Returns flashcards found in `text`
 *
 * It is best that the text does not contain frontmatter, see extractFrontmatter for reasoning
 *
 * @param text - The text to extract flashcards from
 * @param ParserOptions - Parser options
 * @returns An array of parsed question information
 */
export function parse(text: string, options: ParserOptions): ParsedQuestionInfo[] {
    if (debugParser) {
        console.debug("Text to parse:\n<<<" + text + ">>>");
    }

    // Sort inline separators by length, longest first
    const inlineSeparators = [
        { separator: options.singleLineCardSeparator, type: CardType.SingleLineBasic },
        { separator: options.singleLineReversedCardSeparator, type: CardType.SingleLineReversed },
    ];
    inlineSeparators.sort((a, b) => b.separator.length - a.separator.length);

    const cards: ParsedQuestionInfo[] = [];
    let cardText = "";
    let cardType: CardType | null = null;
    let firstLineNo = 0,
        lastLineNo = 0;

    const normalizedText = text.replaceAll("\r\n", "\n");
    const irExtractRanges = parseIrExtracts(normalizedText).map((match) => ({
        start: match.start,
        end: match.end,
    }));
    const lines: string[] = normalizedText.split("\n");
    const lineStartOffsets: number[] = [];
    let lineStartOffset = 0;
    for (const line of lines) {
        lineStartOffsets.push(lineStartOffset);
        lineStartOffset += line.length + 1;
    }
    for (let i = 0; i < lines.length; i++) {
        const currentLine = lines[i],
            currentTrimmed = lines[i].trim();
        const currentLineStartOffset = lineStartOffsets[i] ?? 0;
        const currentTrimmedOffset = currentLine.indexOf(currentTrimmed);
        const currentTrimmedStartOffset =
            currentLineStartOffset + Math.max(0, currentTrimmedOffset);
        const isTrimmedMarkerInsideIr = isIndexInsideExcludedRange(
            currentTrimmedStartOffset,
            irExtractRanges,
        );

        // Skip everything in HTML comments
        if (currentLine.startsWith("<!--") && !currentLine.startsWith("<!--SR:")) {
            while (i + 1 < lines.length && !currentLine.includes("-->")) i++;
            i++;
            continue;
        }

        // Have we reached the end of a card?
        const isEmptyLine = currentTrimmed.length == 0;
        const hasMultilineCardEndMarker =
            options.multilineCardEndMarker && currentTrimmed == options.multilineCardEndMarker;
        if (
            // We've probably reached the end of a card
            (isEmptyLine && !options.multilineCardEndMarker) ||
            // Empty line & we're not picking up any card
            (isEmptyLine && cardType == null) ||
            // We've reached the end of a multi line card &
            //  we're using custom end markers
            hasMultilineCardEndMarker
        ) {
            if (cardType) {
                // Create a new card
                lastLineNo = i - 1;
                cards.push(
                    new ParsedQuestionInfo(cardType, cardText.trimEnd(), firstLineNo, lastLineNo),
                );
                cardType = null;
            }

            cardText = "";
            firstLineNo = i + 1;
            continue;
        }

        // Update card text
        if (cardText.length > 0) {
            cardText += "\n";
        }
        cardText += currentLine.trimEnd();

        if (
            options.convertAnkiClozesToClozes &&
            cardType === null &&
            /\{\{c\d+::/.test(currentLine)
        ) {
            cardType = CardType.AnkiCloze;
        }

        if (cardType === null) {
            for (const { separator, type } of inlineSeparators) {
                if (
                    hasInlineMarker(currentLine, separator, currentLineStartOffset, irExtractRanges)
                ) {
                    cardType = type;
                    break;
                }
            }
        }

        if (cardType == CardType.SingleLineBasic || cardType == CardType.SingleLineReversed) {
            cardText = currentLine;
            firstLineNo = i;

            // Pick up scheduling information if present
            if (i + 1 < lines.length && lines[i + 1].startsWith("<!--SR:")) {
                cardText += "\n" + lines[i + 1];
                i++;
            }

            lastLineNo = i;
            cards.push(new ParsedQuestionInfo(cardType, cardText, firstLineNo, lastLineNo));

            cardType = null;
            cardText = "";
        } else if (currentTrimmed === options.multilineCardSeparator && !isTrimmedMarkerInsideIr) {
            // Ignore card if the front of the card is empty
            if (cardText.length > 1) {
                // Pick up multiline basic cards
                cardType = CardType.MultiLineBasic;
            }
        } else if (
            currentTrimmed === options.multilineReversedCardSeparator &&
            !isTrimmedMarkerInsideIr
        ) {
            // Ignore card if the front of the card is empty
            if (cardText.length > 1) {
                // Pick up multiline basic cards
                cardType = CardType.MultiLineReversed;
            }
        } else if (currentLine.startsWith("```") || currentLine.startsWith("~~~")) {
            const codeBlockClose = currentLine.match(/`+|~+/)[0];
            const codeBlockStart = currentLine;

            let codeBlockContent = "";
            const startLine = i;

            i++;

            while (i < lines.length && !lines[i].startsWith(codeBlockClose)) {
                codeBlockContent += lines[i] + "\n";
                i++;
            }

            const endLine = i;

            if (
                options.parseClozesInCodeBlocks &&
                options.convertAnkiClozesToClozes &&
                /\{\{c\d+::/.test(codeBlockContent)
            ) {
                cardType = CardType.AnkiCloze;
                cardText = codeBlockStart + "\n" + codeBlockContent + codeBlockClose;

                firstLineNo = startLine;
                lastLineNo = endLine;

                cards.push(
                    new ParsedQuestionInfo(CardType.AnkiCloze, cardText, firstLineNo, lastLineNo),
                );

                cardType = null;
                cardText = "";
            } else if (cardType !== null) {
                // Keep ordinary code block contents inside a multi-line card.
                cardText += "\n" + codeBlockContent + codeBlockClose;
            }
        } else if (cardType === null) {
            const clozeDetectionLine = stripIrExtractSyntax(currentLine);
            if (
                hasStandardClozeOutsideCode(clozeDetectionLine, options.clozePatterns) ||
                hasNonStandardClozeOutsideCode(clozeDetectionLine, options.clozePatterns)
            ) {
                cardType = CardType.Cloze;
            }
        }
    }

    // Do we have a card left in the queue?
    if (cardType && cardText) {
        lastLineNo = lines.length - 1;
        cards.push(new ParsedQuestionInfo(cardType, cardText.trimEnd(), firstLineNo, lastLineNo));
    }

    if (debugParser) {
        console.debug("Parsed cards:\n", cards);
    }

    return cards;
}
