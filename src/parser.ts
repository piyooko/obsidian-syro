/**
 * [核心] 解析卡片语法（::, ???, cloze），将文本转换为 Question 对象。
 *
 * 属于：逻辑层
 *
 * 用到：
 * - clozecraft (处理挖空)
 * - src/Question (卡片类型定义)
 *
 * 被用到：
 * - 负责提取卡片的核心模块
 */
import { ClozeCrafter } from "clozecraft";

import { CardType } from "src/Question";

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

function markerInsideCodeBlock(text: string, marker: string, markerIndex: number): boolean {
    let goingBack = markerIndex - 1,
        goingForward = markerIndex + marker.length;
    let backTicksBefore = 0,
        backTicksAfter = 0;

    while (goingBack >= 0) {
        if (text[goingBack] === "`") backTicksBefore++;
        goingBack--;
    }

    while (goingForward < text.length) {
        if (text[goingForward] === "`") backTicksAfter++;
        goingForward++;
    }

    // If there's an odd number of backticks before and after,
    //  the marker is inside an inline code block
    return backTicksBefore % 2 === 1 && backTicksAfter % 2 === 1;
}

function hasInlineMarker(text: string, marker: string): boolean {
    // 没有标记直接返回
    if (marker.length == 0) return false;

    // 从位置 0 开始查找
    let startIndex = 0;

    while (true) {
        const markerIdx = text.indexOf(marker, startIndex);

        // 如果找不到分隔符了，返回 false
        if (markerIdx === -1) return false;

        // 1. 检查是否在代码块 (Inline Code Block) 中
        const isInsideCode = markerInsideCodeBlock(text, marker, markerIdx);

        // 2. 检查是否在 Anki 挖空格式 ({{c1::...}}) 中
        // 逻辑：截取分隔符前面的字符串，看结尾是否匹配 "{{c" + 数字
        const prefix = text.substring(0, markerIdx);
        // 正则解释：\{\{c 转义{{c，\d+ 匹配一个或多个数字，$ 表示匹配字符串结尾
        const isInsideAnki = /\{\{c\d+$/.test(prefix);

        // 只有当它既不在代码块里，也不在 Anki 挖空格式里，才是真正的分隔符
        if (!isInsideCode && !isInsideAnki) {
            return true;
        }

        // 如果当前找到的这个 :: 无效（在代码块或Anki里），
        // 就从当前位置之后继续找下一个 ::
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
        console.log("Text to parse:\n<<<" + text + ">>>");
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

    const clozecrafter = new ClozeCrafter(options.clozePatterns);
    const lines: string[] = text.replaceAll("\r\n", "\n").split("\n");
    for (let i = 0; i < lines.length; i++) {
        const currentLine = lines[i],
            currentTrimmed = lines[i].trim();

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

        // ★ 关键：优先检测 Anki 风格挖空 {{c1::...}}
        // 必须在 inline separator 检测之前，否则 :: 会被误识别为 SingleLineBasic
        if (
            options.convertAnkiClozesToClozes &&
            cardType === null &&
            /\{\{c\d+::/.test(currentLine)
        ) {
            cardType = CardType.AnkiCloze;
        }

        // Pick up inline cards (只有当不是 AnkiCloze 时才检测)
        if (cardType === null) {
            for (const { separator, type } of inlineSeparators) {
                if (hasInlineMarker(currentLine, separator)) {
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
        } else if (currentTrimmed === options.multilineCardSeparator) {
            // Ignore card if the front of the card is empty
            if (cardText.length > 1) {
                // Pick up multiline basic cards
                cardType = CardType.MultiLineBasic;
            }
        } else if (currentTrimmed === options.multilineReversedCardSeparator) {
            // Ignore card if the front of the card is empty
            if (cardText.length > 1) {
                // Pick up multiline basic cards
                cardType = CardType.MultiLineReversed;
            }
        } else if (currentLine.startsWith("```") || currentLine.startsWith("~~~")) {
            const codeBlockClose = currentLine.match(/`+|~+/)[0];
            const codeBlockStart = currentLine;

            // 1. 直接读取整个代码块，不再拆分段落
            let codeBlockContent = "";
            let startLine = i;

            // 跳过首行
            i++;

            while (i < lines.length && !lines[i].startsWith(codeBlockClose)) {
                codeBlockContent += lines[i] + "\n";
                i++;
            }

            // 此时 i 指向结束标记行
            let endLine = i;

            // 2. 检查是否有 Anki 挖空
            if (
                options.parseClozesInCodeBlocks &&
                options.convertAnkiClozesToClozes &&
                /\{\{c\d+::/.test(codeBlockContent)
            ) {
                cardType = CardType.AnkiCloze;
                // 拼接完整的代码块字符串
                // 注意：我们这里保留完整内容，"裁剪"工作交给 QuestionTypeAnkiCloze 去做
                cardText = codeBlockStart + "\n" + codeBlockContent + codeBlockClose;

                // 记录正确的起止行号
                firstLineNo = startLine;
                lastLineNo = endLine;

                cards.push(
                    new ParsedQuestionInfo(CardType.AnkiCloze, cardText, firstLineNo, lastLineNo),
                );

                // 重置状态
                cardType = null;
                cardText = "";
            } else if (cardType !== null) {
                // Keep ordinary code block contents inside a multi-line card.
                cardText += "\n" + codeBlockContent + codeBlockClose;
            }
        } else if (cardType === null && clozecrafter.isClozeNote(currentLine)) {
            // Pick up cloze cards (普通 Cloze 格式，AnkiCloze 已在前面检测)
            cardType = CardType.Cloze;
        }
    }

    // Do we have a card left in the queue?
    if (cardType && cardText) {
        lastLineNo = lines.length - 1;
        cards.push(new ParsedQuestionInfo(cardType, cardText.trimEnd(), firstLineNo, lastLineNo));
    }

    if (debugParser) {
        console.log("Parsed cards:\n", cards);
    }

    return cards;
}
