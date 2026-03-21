/**
 * 这个文件主要是干什么的：
 * 负责把不同类型的卡片（比如单行卡、多行卡、完形填空卡）的原始文本内容，
 * 拆分成“正面”和“背面”两部分，方便复习时显示。
 * 简单来说，就是卡片内容的“切割器”和“格式化器”。
 *
 * 它在项目中属于：逻辑层 (Logic Layer)
 *
 * 它会用到哪些文件：
 * 1. src/Question.ts (定义了卡片类型 CardType)
 * 2. src/settings.ts (获取用户的设置，比如分隔符)
 * 3. src/util/utils.ts (一些通用的工具函数)
 * 4. clozecraft (外部库，专门处理完形填空)
 *
 * 哪些文件会用到它：
 * 1. src/NoteQuestionParser.ts (解析笔记时，用它来生成卡片内容)
 * 2. src/FlashcardReviewSequencer.ts (虽然不直接引用，但通过 Question 和 Card 间接使用其生成的结构)
 */
import { ClozeCrafter, IClozeFormatter } from "clozecraft";

import { CardType } from "src/Question";
import { SRSettings } from "src/settings";
import { resolveClozeReviewContext } from "src/util/cloze-review-context";
import { findLineIndexOfSearchStringIgnoringWs } from "src/util/utils";

export class CardFrontBack {
    front: string;
    back: string;

    // The caller is responsible for any required trimming of leading/trailing spaces
    constructor(front: string, back: string) {
        this.front = front;
        this.back = back;
    }
}

export interface CardExpansionContext {
    noteText?: string;
    firstLineNum?: number;
    lastLineNum?: number;
}

export class CardFrontBackUtil {
    static expand(
        questionType: CardType,
        questionText: string,
        settings: SRSettings,
        lineOffset: number = 0,
        context?: CardExpansionContext,
    ): CardFrontBack[] {
        const handler: IQuestionTypeHandler = QuestionTypeFactory.create(questionType);
        if (questionType === CardType.AnkiCloze) {
            return (handler as QuestionTypeAnkiCloze).expand(
                questionText,
                settings,
                lineOffset,
                context,
            );
        }
        return handler.expand(questionText, settings);
    }
}

export interface IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[];
}

class QuestionTypeSingleLineBasic implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        const idx: number = questionText.indexOf(settings.singleLineCardSeparator);
        const item: CardFrontBack = new CardFrontBack(
            questionText.substring(0, idx),
            questionText.substring(idx + settings.singleLineCardSeparator.length),
        );
        const result: CardFrontBack[] = [item];
        return result;
    }
}

class QuestionTypeSingleLineReversed implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        const idx: number = questionText.indexOf(settings.singleLineReversedCardSeparator);
        const side1: string = questionText.substring(0, idx),
            side2: string = questionText.substring(
                idx + settings.singleLineReversedCardSeparator.length,
            );
        const result: CardFrontBack[] = [
            new CardFrontBack(side1, side2),
            new CardFrontBack(side2, side1),
        ];
        return result;
    }
}

class QuestionTypeMultiLineBasic implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        // We don't need to worry about "\r\n", as multi line questions processed by parse() concatenates lines explicitly with "\n"
        const questionLines = questionText.split("\n");
        const lineIdx = findLineIndexOfSearchStringIgnoringWs(
            questionLines,
            settings.multilineCardSeparator,
        );
        const side1: string = questionLines.slice(0, lineIdx).join("\n");
        const side2: string = questionLines.slice(lineIdx + 1).join("\n");

        const result: CardFrontBack[] = [new CardFrontBack(side1, side2)];
        return result;
    }
}

class QuestionTypeMultiLineReversed implements IQuestionTypeHandler {
    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        // We don't need to worry about "\r\n", as multi line questions processed by parse() concatenates lines explicitly with "\n"
        const questionLines = questionText.split("\n");
        const lineIdx = findLineIndexOfSearchStringIgnoringWs(
            questionLines,
            settings.multilineReversedCardSeparator,
        );
        const side1: string = questionLines.slice(0, lineIdx).join("\n");
        const side2: string = questionLines.slice(lineIdx + 1).join("\n");

        const result: CardFrontBack[] = [
            new CardFrontBack(side1, side2),
            new CardFrontBack(side2, side1),
        ];
        return result;
    }
}

class QuestionTypeCloze implements IQuestionTypeHandler {
    private shouldKeepOtherHighlightClozeVisual(settings: SRSettings): boolean {
        return !settings.convertHighlightsToClozes || settings.showOtherHighlightClozeVisual;
    }

    private shouldKeepOtherBoldClozeVisual(settings: SRSettings): boolean {
        return !settings.convertBoldTextToClozes || settings.showOtherBoldClozeVisual;
    }

    private extractStandardClozeMatches(
        questionText: string,
        settings: SRSettings,
    ): { type: "highlight" | "bold"; text: string; fullMatch: string; index: number }[] {
        const matches: {
            type: "highlight" | "bold";
            text: string;
            fullMatch: string;
            index: number;
        }[] = [];

        if (settings.convertHighlightsToClozes) {
            for (const match of questionText.matchAll(/==(.*?)==/g)) {
                if (match.index === undefined) continue;
                matches.push({
                    type: "highlight",
                    text: match[1],
                    fullMatch: match[0],
                    index: match.index,
                });
            }
        }

        if (settings.convertBoldTextToClozes) {
            for (const match of questionText.matchAll(/\*\*(.*?)\*\*/g)) {
                if (match.index === undefined) continue;
                matches.push({
                    type: "bold",
                    text: match[1],
                    fullMatch: match[0],
                    index: match.index,
                });
            }
        }

        matches.sort((a, b) => a.index - b.index);
        return matches;
    }

    private keepStandardMatchVisual(
        match: { type: "highlight" | "bold"; text: string; fullMatch: string },
        settings: SRSettings,
    ): string {
        if (match.type === "highlight") {
            return this.shouldKeepOtherHighlightClozeVisual(settings)
                ? match.fullMatch
                : match.text;
        }

        return this.shouldKeepOtherBoldClozeVisual(settings) ? match.fullMatch : match.text;
    }

    private expandStandardClozes(
        questionText: string,
        matches: { type: "highlight" | "bold"; text: string; fullMatch: string; index: number }[],
        settings: SRSettings,
    ): CardFrontBack[] {
        return matches.map((activeMatch, activeIndex) => {
            let front = "";
            let back = "";
            let lastEnd = 0;

            matches.forEach((match, index) => {
                front += questionText.substring(lastEnd, match.index);
                back += questionText.substring(lastEnd, match.index);

                if (index === activeIndex) {
                    front += `««SR_H:${encodeURIComponent("[...]")}»»`;
                    back += `««SR_S:${encodeURIComponent(match.text)}»»`;
                } else {
                    const rendered = this.keepStandardMatchVisual(match, settings);
                    front += rendered;
                    back += rendered;
                }

                lastEnd = match.index + match.fullMatch.length;
            });

            front += questionText.substring(lastEnd);
            back += questionText.substring(lastEnd);
            return new CardFrontBack(front, back);
        });
    }

    expand(questionText: string, settings: SRSettings): CardFrontBack[] {
        const standardMatches = this.extractStandardClozeMatches(questionText, settings);
        const clozecrafter = new ClozeCrafter(settings.clozePatterns);
        const clozeNote = clozecrafter.createClozeNote(questionText);

        // Standard highlight/bold clozes need the original markdown wrappers preserved
        // so review rendering can keep "other cloze" visuals just like Anki clozes.
        if (standardMatches.length > 0 && clozeNote.numCards === standardMatches.length) {
            return this.expandStandardClozes(questionText, standardMatches, settings);
        }

        const clozeFormatter = new QuestionTypeClozeFormatter();

        let front: string, back: string;
        const result: CardFrontBack[] = [];
        for (let i = 0; i < clozeNote.numCards; i++) {
            front = clozeNote.getCardFront(i, clozeFormatter);
            back = clozeNote.getCardBack(i, clozeFormatter);
            result.push(new CardFrontBack(front, back));
        }

        return result;
    }
}

export class QuestionTypeClozeFormatter implements IClozeFormatter {
    asking(answer?: string, hint?: string): string {
        const h = !hint ? "[...]" : `[${hint}]`;
        return `««SR_H:${encodeURIComponent(h)}»»`;
    }

    showingAnswer(answer: string, _hint?: string): string {
        return `««SR_S:${encodeURIComponent(answer)}»»`;
    }

    hiding(answer?: string, hint?: string): string {
        const h = !hint ? "[...]" : `[${hint}]`;
        return `««SR_H:${encodeURIComponent(h)}»»`;
    }
}

/**
 * Anki 风格挖空解析器
 * 支持 {{c1::content}} 语法，同 ID 在同一张卡片上同时挖空
 *
 * 两种内容类型的特殊处理：
 * 1. 代码块（```...```）：使用特殊占位符 ««SR_CLOZE:encoded»»
 * 2. 普通文本（包含 LaTeX）：使用 HTML <span> 标签，卡片渲染侧会后处理 LaTeX 公式
 *
 * 渲染规则：
 * - 正面：当前 cN 显示 [...] (蓝色)，其他 cM 显示为纯文本（无格式）
 * - 背面：当前 cN 高亮显示答案 (蓝色)，其他 cM 显示为纯文本（无格式）
 */
class QuestionTypeAnkiCloze implements IQuestionTypeHandler {
    private shouldKeepOtherAnkiClozeVisual(settings: SRSettings): boolean {
        return !settings.convertAnkiClozesToClozes || settings.showOtherAnkiClozeVisual;
    }

    private shouldKeepOtherHighlightClozeVisual(settings: SRSettings): boolean {
        return !settings.convertHighlightsToClozes || settings.showOtherHighlightClozeVisual;
    }

    private shouldKeepOtherBoldClozeVisual(settings: SRSettings): boolean {
        return !settings.convertBoldTextToClozes || settings.showOtherBoldClozeVisual;
    }

    expand(
        questionText: string,
        settings: SRSettings,
        lineOffset: number = 0,
        context?: CardExpansionContext,
    ): CardFrontBack[] {
        const result: CardFrontBack[] = [];
        const isCodeBlock = this.isCodeBlockQuestion(questionText);

        // 1. 提取所有挖空信息
        const clozeInfos = this.extractClozeInfos(questionText);

        if (isCodeBlock) {
            // === 核心逻辑变更：按 (ID + 行号) 分组 ===
            // 只要行号不同，哪怕 ID 相同，也是不同的卡片

            // 数据结构：Map<ID, Map<LineIndex, ClozeInfo[]>>
            const groups = new Map<number, Map<number, typeof clozeInfos>>();

            clozeInfos.forEach((info) => {
                if (!groups.has(info.id)) {
                    groups.set(info.id, new Map());
                }
                const lineGroup = groups.get(info.id)!;
                // info.lineNum 是相对代码块的行号(从1开始)
                if (!lineGroup.has(info.lineNum)) {
                    lineGroup.set(info.lineNum, []);
                }
                lineGroup.get(info.lineNum)!.push(info);
            });

            // 遍历所有分组生成卡片
            // 排序：先按 ID 排序，再按行号排序
            const sortedIds = Array.from(groups.keys()).sort((a, b) => a - b);

            sortedIds.forEach((activeId) => {
                const lineMap = groups.get(activeId)!;
                const sortedLines = Array.from(lineMap.keys()).sort((a, b) => a - b);

                sortedLines.forEach((activeLine) => {
                    // 当前卡片只关注：特定的 ID + 特定的行
                    const activeClozes = lineMap.get(activeLine)!;

                    // 1. 提前处理替换，严格隔离出当前行的 active 挖空，其他同 ID 的作为文本显示
                    let processedFullText = "";
                    let lastEnd = 0;

                    clozeInfos.forEach((info) => {
                        processedFullText += questionText.substring(lastEnd, info.start);

                        const isActive = activeClozes.some((active) => active.start === info.start);

                        if (isActive) {
                            const encoded = encodeURIComponent(info.content);
                            // 补偿被 encodeURIComponent 吞没的换行符，保证 lineNum 绝对稳定不出偏差
                            const newlineCount = (info.content.match(/\n/g) || []).length;
                            processedFullText +=
                                `««SR_CLOZE:${encoded}»»` + "\n".repeat(newlineCount);
                        } else {
                            processedFullText += info.content;
                        }
                        lastEnd = info.end;
                    });
                    processedFullText += questionText.substring(lastEnd);

                    // 2. 获取上下文窗口 (基于已经完成了独立占位符替换的安全全量代码)
                    const contextSize = settings.codeContextLines || 15;
                    const { windowedText, startSliceIndex, activeLineRelative } =
                        this.getWindowedCode(processedFullText, activeClozes, contextSize);

                    // 3. 计算绝对真实行号 (用于 UI 显示)
                    const realStartLine = lineOffset + 1 + startSliceIndex + 1;

                    // 4. 生成卡片内容
                    const meta = `<!--SR_CODE_CLOZE:${activeLineRelative}:${realStartLine}-->\n`;

                    const finalContent = meta + windowedText;

                    result.push(new CardFrontBack(finalContent, finalContent));
                });
            });
        } else {
            // 普通文本逻辑：根据设置解析不同范围的上下文
            const uniqueIds = [...new Set(clozeInfos.map((info) => info.id))].sort((a, b) => a - b);
            uniqueIds.forEach((activeId) => {
                const activeInfos = clozeInfos.filter((info) => info.id === activeId);
                const contextText = this.resolveTextContext(
                    questionText,
                    activeInfos.map((info) => info.lineNum),
                    settings,
                    context,
                );
                const contextInfos = this.extractClozeInfos(contextText);
                const front = this.generateFront(contextText, contextInfos, activeId, settings);
                const back = this.generateBack(contextText, contextInfos, activeId, settings);
                result.push(new CardFrontBack(front, back));
            });
        }

        // 2. 同时提取普通高亮/粗体
        const standardClozeMatches: {
            text: string;
            fullMatch: string;
            lineNum: number;
            type: "highlight" | "bold";
        }[] = [];

        if (settings.convertHighlightsToClozes) {
            const matches = [...questionText.matchAll(/==(.*?)==/g)];
            matches.forEach((m) =>
                standardClozeMatches.push({
                    text: m[1],
                    fullMatch: m[0],
                    lineNum: this.getLineNumberFromIndex(questionText, m.index ?? 0),
                    type: "highlight",
                }),
            );
        }
        if (settings.convertBoldTextToClozes) {
            const matches = [...questionText.matchAll(/\*\*(.*?)\*\*/g)];
            matches.forEach((m) =>
                standardClozeMatches.push({
                    text: m[1],
                    fullMatch: m[0],
                    lineNum: this.getLineNumberFromIndex(questionText, m.index ?? 0),
                    type: "bold",
                }),
            );
        }

        // 为每个普通挖空生成卡片
        standardClozeMatches.forEach((match) => {
            const contextText = this.resolveTextContext(
                questionText,
                [match.lineNum],
                settings,
                context,
            );
            const activeMatch = this.findActiveStandardMatch(contextText, match.type, match.text);
            if (!activeMatch) {
                return;
            }

            const front = this.applyOtherClozeVisibility(
                this.replaceMatchAt(
                    contextText,
                    activeMatch.start,
                    activeMatch.end,
                    `««SR_H:${encodeURIComponent("[...]")}»»`,
                ),
                settings,
            );
            const back = this.applyOtherClozeVisibility(
                this.replaceMatchAt(
                    contextText,
                    activeMatch.start,
                    activeMatch.end,
                    `««SR_S:${encodeURIComponent(match.text)}»»`,
                ),
                settings,
            );
            result.push(new CardFrontBack(front, back));
        });

        return result;
    }

    /**
     * 检测问题是否为代码块
     */
    private isCodeBlockQuestion(text: string): boolean {
        const trimmed = text.trim();
        return (
            (trimmed.startsWith("```") || trimmed.startsWith("~~~")) &&
            (trimmed.endsWith("```") || trimmed.endsWith("~~~"))
        );
    }

    /**
     * 获取裁剪后的代码块上下文
     */
    private getWindowedCode(
        fullText: string,
        targetClozes: any[], // 仅包含当前卡片关注的挖空
        contextSize: number,
    ): { windowedText: string; startSliceIndex: number; activeLineRelative: number } {
        const lines = fullText.split("\n");
        const header = lines[0];
        const footer = lines[lines.length - 1];
        const codeLines = lines.slice(1, -1);

        // 目标行号 (0-based relative to code block body)
        // targetClozes[0].lineNum 是 header+body 的 1-based 索引
        // 所以: lineNum - 1 (header) - 1 (to 0-based) = lineNum - 2
        const targetLineIndex = targetClozes[0].lineNum - 2;

        // 计算裁剪窗口
        const startSlice = Math.max(0, targetLineIndex - contextSize);
        const endSlice = Math.min(codeLines.length, targetLineIndex + contextSize + 1);

        const windowedBody = codeLines.slice(startSlice, endSlice);

        // 可选：添加省略号标记
        if (startSlice > 0) windowedBody.unshift("// ... (上文省略)");
        if (endSlice < codeLines.length) windowedBody.push("// ... (下文省略)");

        const windowedText = header + "\n" + windowedBody.join("\n") + "\n" + footer;

        // 计算高亮行在 *新窗口* 中的位置
        // 如果加了省略号，需要 +1
        const offsetDueToEllipsis = startSlice > 0 ? 1 : 0;

        // Header占1行 + 省略号占n行 + 相对偏移 + 1(转1-based)
        const activeLineRelative = 1 + offsetDueToEllipsis + (targetLineIndex - startSlice) + 1;

        // 真实代码行的偏移量 (用于行号计算)
        // 省略号行不应计入真实行号，所以这里只返回代码切片的偏移
        return { windowedText, startSliceIndex: startSlice, activeLineRelative };
    }

    /**
     * 使用括号计数算法提取 Cloze 信息
     * 优化：支持中文冒号，忽略大小写，提高解析稳定性
     */
    private extractClozeInfos(
        text: string,
    ): { id: number; content: string; start: number; end: number; lineNum: number }[] {
        const infos: {
            id: number;
            content: string;
            start: number;
            end: number;
            lineNum: number;
        }[] = [];

        // 支持中文冒号，忽略大小写
        const regex = /\{\{c(\d+)(?:::|：：)/gi;

        let match;
        while ((match = regex.exec(text)) !== null) {
            const id = parseInt(match[1]);
            const startPos = match.index;
            const contentStart = startPos + match[0].length;

            let braceDepth = 0;
            let endPos = -1;

            // 寻找闭合的 }}
            for (let j = contentStart; j < text.length; j++) {
                if (braceDepth === 0 && text.startsWith("}}", j)) {
                    endPos = j;
                    break;
                }
                if (text[j] === "{") braceDepth++;
                else if (text[j] === "}") {
                    if (braceDepth > 0) braceDepth--;
                }
            }

            if (endPos !== -1) {
                // 计算行号
                let lineNum = 1;
                for (let k = 0; k < startPos; k++) {
                    if (text[k] === "\n") lineNum++;
                }

                const content = text.substring(contentStart, endPos);
                infos.push({
                    id,
                    content,
                    start: startPos,
                    end: endPos + 2,
                    lineNum,
                });

                // 跳过当前挖空，避免正则索引错误
                regex.lastIndex = endPos + 2;
            }
        }
        return infos;
    }

    private resolveTextContext(
        questionText: string,
        activeLines: number[],
        settings: SRSettings,
        context?: CardExpansionContext,
    ): string {
        return resolveClozeReviewContext({
            noteText: context?.noteText,
            questionText,
            firstLineNum: context?.firstLineNum,
            activeLinesInQuestion: activeLines,
            settings: {
                clozeContextMode: settings.clozeContextMode,
                clozeContextPerformanceMode: settings.clozeContextPerformanceMode,
                clozeContextSoftLimitLines: settings.clozeContextSoftLimitLines,
            },
        });
    }

    private getLineNumberFromIndex(text: string, index: number): number {
        let lineNum = 1;
        for (let i = 0; i < index; i++) {
            if (text[i] === "\n") {
                lineNum++;
            }
        }
        return lineNum;
    }

    private findActiveStandardMatch(
        text: string,
        type: "highlight" | "bold",
        targetContent: string,
    ): { start: number; end: number } | null {
        const regex = type === "highlight" ? /==(.*?)==/g : /\*\*(.*?)\*\*/g;
        for (const match of text.matchAll(regex)) {
            if (match[1] === targetContent && match.index !== undefined) {
                return {
                    start: match.index,
                    end: match.index + match[0].length,
                };
            }
        }

        return null;
    }

    private replaceMatchAt(text: string, start: number, end: number, replacement: string): string {
        return text.substring(0, start) + replacement + text.substring(end);
    }

    /**
     * 生成卡片正面：
     * - activeId 挖空显示 [...] (蓝色，与普通 Cloze 一致)
     * - 其他 cN 去掉格式，只显示纯文本内容
     */
    private generateFront(
        text: string,
        infos: { id: number; content: string; start: number; end: number }[],
        activeId: number,
        settings: SRSettings,
    ): string {
        let result = "";
        let lastEnd = 0;

        for (const info of infos) {
            result += text.substring(lastEnd, info.start);
            if (info.id === activeId) {
                // 当前 ID：使用标记
                result += `««SR_H:${encodeURIComponent("[...]")}»»`;
            } else {
                // 其他 ID：去掉 {{cN::...}} 格式，只显示纯文本内容
                result += this.shouldKeepOtherAnkiClozeVisual(settings)
                    ? text.substring(info.start, info.end)
                    : info.content;
            }
            lastEnd = info.end;
        }

        result += text.substring(lastEnd);
        return result;
    }

    /**
     * 生成卡片背面：
     * - activeId 高亮显示答案 (蓝色，与普通 Cloze 一致)
     * - 其他 cN 去掉格式，只显示纯文本内容
     */
    private generateBack(
        text: string,
        infos: { id: number; content: string; start: number; end: number }[],
        activeId: number,
        settings: SRSettings,
    ): string {
        let result = "";
        let lastEnd = 0;

        for (const info of infos) {
            result += text.substring(lastEnd, info.start);
            if (info.id === activeId) {
                // 当前 ID：使用标记
                result += `««SR_S:${encodeURIComponent(info.content)}»»`;
            } else {
                // 其他 ID：去掉格式，只显示纯文本内容
                result += this.shouldKeepOtherAnkiClozeVisual(settings)
                    ? text.substring(info.start, info.end)
                    : info.content;
            }
            lastEnd = info.end;
        }

        result += text.substring(lastEnd);
        return result;
    }

    private applyOtherClozeVisibility(text: string, settings: SRSettings): string {
        let result = text;

        if (!this.shouldKeepOtherAnkiClozeVisual(settings)) {
            result = result.replace(/\{\{c(\d+)(?:::|：：)(.*?)(?:::|：：)?\}\}/gi, "$2");
        }

        if (!this.shouldKeepOtherHighlightClozeVisual(settings)) {
            result = result.replace(/==(.*?)==/g, "$1");
        }

        if (!this.shouldKeepOtherBoldClozeVisual(settings)) {
            result = result.replace(/\*\*(.*?)\*\*/g, "$1");
        }

        return result;
    }
}

export class QuestionTypeFactory {
    static create(questionType: CardType): IQuestionTypeHandler {
        let handler: IQuestionTypeHandler;
        switch (questionType) {
            case CardType.SingleLineBasic:
                handler = new QuestionTypeSingleLineBasic();
                break;
            case CardType.SingleLineReversed:
                handler = new QuestionTypeSingleLineReversed();
                break;
            case CardType.MultiLineBasic:
                handler = new QuestionTypeMultiLineBasic();
                break;
            case CardType.MultiLineReversed:
                handler = new QuestionTypeMultiLineReversed();
                break;
            case CardType.Cloze:
                handler = new QuestionTypeCloze();
                break;
            case CardType.AnkiCloze:
                handler = new QuestionTypeAnkiCloze();
                break;
        }
        return handler;
    }
}
