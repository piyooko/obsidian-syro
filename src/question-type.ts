/**
 * 杩欎釜鏂囦欢涓昏鏄共浠€涔堢殑锛?
 * 璐熻矗鎶婁笉鍚岀被鍨嬬殑鍗＄墖锛堟瘮濡傚崟琛屽崱銆佸琛屽崱銆佸畬褰㈠～绌哄崱锛夌殑鍘熷鏂囨湰鍐呭锛?
 * 鎷嗗垎鎴愨€滄闈⑩€濆拰鈥滆儗闈⑩€濅袱閮ㄥ垎锛屾柟渚垮涔犳椂鏄剧ず銆?
 * 绠€鍗曟潵璇达紝灏辨槸鍗＄墖鍐呭鐨勨€滃垏鍓插櫒鈥濆拰鈥滄牸寮忓寲鍣ㄢ€濄€?
 *
 * 瀹冨湪椤圭洰涓睘浜庯細閫昏緫灞?(Logic Layer)
 *
 * 瀹冧細鐢ㄥ埌鍝簺鏂囦欢锛?
 * 1. src/Question.ts (瀹氫箟浜嗗崱鐗囩被鍨?CardType)
 * 2. src/settings.ts (鑾峰彇鐢ㄦ埛鐨勮缃紝姣斿鍒嗛殧绗?
 * 3. src/util/utils.ts (涓€浜涢€氱敤鐨勫伐鍏峰嚱鏁?
 * 4. clozecraft (澶栭儴搴擄紝涓撻棬澶勭悊瀹屽舰濉┖)
 *
 * 鍝簺鏂囦欢浼氱敤鍒板畠锛?
 * 1. src/NoteQuestionParser.ts (瑙ｆ瀽绗旇鏃讹紝鐢ㄥ畠鏉ョ敓鎴愬崱鐗囧唴瀹?
 * 2. src/FlashcardReviewSequencer.ts (铏界劧涓嶇洿鎺ュ紩鐢紝浣嗛€氳繃 Question 鍜?Card 闂存帴浣跨敤鍏剁敓鎴愮殑缁撴瀯)
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
 * Anki 椋庢牸鎸栫┖瑙ｆ瀽鍣?
 * 鏀寔 {{c1::content}} 璇硶锛屽悓 ID 鍦ㄥ悓涓€寮犲崱鐗囦笂鍚屾椂鎸栫┖
 *
 * 涓ょ鍐呭绫诲瀷鐨勭壒娈婂鐞嗭細
 * 1. 浠ｇ爜鍧楋紙```...```锛夛細浣跨敤鐗规畩鍗犱綅绗?芦芦SR_CLOZE:encoded禄禄
 * 2. 鏅€氭枃鏈紙鍖呭惈 LaTeX锛夛細浣跨敤 HTML <span> 鏍囩锛屽崱鐗囨覆鏌撲晶浼氬悗澶勭悊 LaTeX 鍏紡
 *
 * 娓叉煋瑙勫垯锛?
 * - 姝ｉ潰锛氬綋鍓?cN 鏄剧ず [...] (钃濊壊)锛屽叾浠?cM 鏄剧ず涓虹函鏂囨湰锛堟棤鏍煎紡锛?
 * - 鑳岄潰锛氬綋鍓?cN 楂樹寒鏄剧ず绛旀 (钃濊壊)锛屽叾浠?cM 鏄剧ず涓虹函鏂囨湰锛堟棤鏍煎紡锛?
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

        // 1. 鎻愬彇鎵€鏈夋寲绌轰俊鎭?
        const clozeInfos = this.extractClozeInfos(questionText);

        if (isCodeBlock) {
            // === 鏍稿績閫昏緫鍙樻洿锛氭寜 (ID + 琛屽彿) 鍒嗙粍 ===
            // 鍙琛屽彿涓嶅悓锛屽摢鎬?ID 鐩稿悓锛屼篃鏄笉鍚岀殑鍗＄墖

            // 鏁版嵁缁撴瀯锛歁ap<ID, Map<LineIndex, ClozeInfo[]>>
            const groups = new Map<number, Map<number, typeof clozeInfos>>();

            clozeInfos.forEach((info) => {
                if (!groups.has(info.id)) {
                    groups.set(info.id, new Map());
                }
                const lineGroup = groups.get(info.id);
                // info.lineNum 鏄浉瀵逛唬鐮佸潡鐨勮鍙?浠?寮€濮?
                if (!lineGroup.has(info.lineNum)) {
                    lineGroup.set(info.lineNum, []);
                }
                lineGroup.get(info.lineNum).push(info);
            });

            // 閬嶅巻鎵€鏈夊垎缁勭敓鎴愬崱鐗?
            // 鎺掑簭锛氬厛鎸?ID 鎺掑簭锛屽啀鎸夎鍙锋帓搴?
            const sortedIds = Array.from(groups.keys()).sort((a, b) => a - b);

            sortedIds.forEach((activeId) => {
                const lineMap = groups.get(activeId);
                const sortedLines = Array.from(lineMap.keys()).sort((a, b) => a - b);

                sortedLines.forEach((activeLine) => {
                    // 褰撳墠鍗＄墖鍙叧娉細鐗瑰畾鐨?ID + 鐗瑰畾鐨勮
                    const activeClozes = lineMap.get(activeLine);

                    // 1. 鎻愬墠澶勭悊鏇挎崲锛屼弗鏍奸殧绂诲嚭褰撳墠琛岀殑 active 鎸栫┖锛屽叾浠栧悓 ID 鐨勪綔涓烘枃鏈樉绀?
                    let processedFullText = "";
                    let lastEnd = 0;

                    clozeInfos.forEach((info) => {
                        processedFullText += questionText.substring(lastEnd, info.start);

                        const isActive = activeClozes.some((active) => active.start === info.start);

                        if (isActive) {
                            const encoded = encodeURIComponent(info.content);
                            // 琛ュ伩琚?encodeURIComponent 鍚炴病鐨勬崲琛岀锛屼繚璇?lineNum 缁濆绋冲畾涓嶅嚭鍋忓樊
                            const newlineCount = (info.content.match(/\n/g) || []).length;
                            processedFullText +=
                                `««SR_CLOZE:${encoded}»»` + "\n".repeat(newlineCount);
                        } else {
                            processedFullText += info.content;
                        }
                        lastEnd = info.end;
                    });
                    processedFullText += questionText.substring(lastEnd);

                    // 2. 鑾峰彇涓婁笅鏂囩獥鍙?(鍩轰簬宸茬粡瀹屾垚浜嗙嫭绔嬪崰浣嶇鏇挎崲鐨勫畨鍏ㄥ叏閲忎唬鐮?
                    const contextSize = settings.codeContextLines || 15;
                    const { windowedText, startSliceIndex, activeLineRelative } =
                        this.getWindowedCode(processedFullText, activeClozes, contextSize);

                    // 3. 璁＄畻缁濆鐪熷疄琛屽彿 (鐢ㄤ簬 UI 鏄剧ず)
                    const realStartLine = lineOffset + 1 + startSliceIndex + 1;

                    // 4. 鐢熸垚鍗＄墖鍐呭
                    const meta = `<!--SR_CODE_CLOZE:${activeLineRelative}:${realStartLine}-->\n`;

                    const finalContent = meta + windowedText;

                    result.push(new CardFrontBack(finalContent, finalContent));
                });
            });
        } else {
            // 鏅€氭枃鏈€昏緫锛氭牴鎹缃В鏋愪笉鍚岃寖鍥寸殑涓婁笅鏂?
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

        // 2. 鍚屾椂鎻愬彇鏅€氶珮浜?绮椾綋
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

        // 涓烘瘡涓櫘閫氭寲绌虹敓鎴愬崱鐗?
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
     * 妫€娴嬮棶棰樻槸鍚︿负浠ｇ爜鍧?
     */
    private isCodeBlockQuestion(text: string): boolean {
        const trimmed = text.trim();
        return (
            (trimmed.startsWith("```") || trimmed.startsWith("~~~")) &&
            (trimmed.endsWith("```") || trimmed.endsWith("~~~"))
        );
    }

    /**
     * 鑾峰彇瑁佸壀鍚庣殑浠ｇ爜鍧椾笂涓嬫枃
     */
    private getWindowedCode(
        fullText: string,
        targetClozes: Array<{ lineNum: number }>, // 浠呭寘鍚綋鍓嶅崱鐗囧叧娉ㄧ殑鎸栫┖
        contextSize: number,
    ): { windowedText: string; startSliceIndex: number; activeLineRelative: number } {
        const lines = fullText.split("\n");
        const header = lines[0];
        const footer = lines[lines.length - 1];
        const codeLines = lines.slice(1, -1);

        // 鐩爣琛屽彿 (0-based relative to code block body)
        // targetClozes[0].lineNum 鏄?header+body 鐨?1-based 绱㈠紩
        // 鎵€浠? lineNum - 1 (header) - 1 (to 0-based) = lineNum - 2
        const targetLineIndex = targetClozes[0].lineNum - 2;

        // 璁＄畻瑁佸壀绐楀彛
        const startSlice = Math.max(0, targetLineIndex - contextSize);
        const endSlice = Math.min(codeLines.length, targetLineIndex + contextSize + 1);

        const windowedBody = codeLines.slice(startSlice, endSlice);

        // 鍙€夛細娣诲姞鐪佺暐鍙锋爣璁?
        if (startSlice > 0) windowedBody.unshift("// ... (涓婃枃鐪佺暐)");
        if (endSlice < codeLines.length) windowedBody.push("// ... (涓嬫枃鐪佺暐)");

        const windowedText = header + "\n" + windowedBody.join("\n") + "\n" + footer;

        // 璁＄畻楂樹寒琛屽湪 *鏂扮獥鍙? 涓殑浣嶇疆
        // 濡傛灉鍔犱簡鐪佺暐鍙凤紝闇€瑕?+1
        const offsetDueToEllipsis = startSlice > 0 ? 1 : 0;

        // Header鍗?琛?+ 鐪佺暐鍙峰崰n琛?+ 鐩稿鍋忕Щ + 1(杞?-based)
        const activeLineRelative = 1 + offsetDueToEllipsis + (targetLineIndex - startSlice) + 1;

        // 鐪熷疄浠ｇ爜琛岀殑鍋忕Щ閲?(鐢ㄤ簬琛屽彿璁＄畻)
        // 鐪佺暐鍙疯涓嶅簲璁″叆鐪熷疄琛屽彿锛屾墍浠ヨ繖閲屽彧杩斿洖浠ｇ爜鍒囩墖鐨勫亸绉?
        return { windowedText, startSliceIndex: startSlice, activeLineRelative };
    }

    /**
     * 浣跨敤鎷彿璁℃暟绠楁硶鎻愬彇 Cloze 淇℃伅
     * 浼樺寲锛氭敮鎸佷腑鏂囧啋鍙凤紝蹇界暐澶у皬鍐欙紝鎻愰珮瑙ｆ瀽绋冲畾鎬?
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

        // 鏀寔涓枃鍐掑彿锛屽拷鐣ュぇ灏忓啓
        const regex = /\{\{c(\d+)(?:::|锛氾細)/gi;

        let match;
        while ((match = regex.exec(text)) !== null) {
            const id = parseInt(match[1]);
            const startPos = match.index;
            const contentStart = startPos + match[0].length;

            let braceDepth = 0;
            let endPos = -1;

            // 瀵绘壘闂悎鐨?}}
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
                // 璁＄畻琛屽彿
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

                // 璺宠繃褰撳墠鎸栫┖锛岄伩鍏嶆鍒欑储寮曢敊璇?
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
     * 鐢熸垚鍗＄墖姝ｉ潰锛?
     * - activeId 鎸栫┖鏄剧ず [...] (钃濊壊锛屼笌鏅€?Cloze 涓€鑷?
     * - 鍏朵粬 cN 鍘绘帀鏍煎紡锛屽彧鏄剧ず绾枃鏈唴瀹?
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
                // 褰撳墠 ID锛氫娇鐢ㄦ爣璁?
                result += `««SR_H:${encodeURIComponent("[...]")}»»`;
            } else {
                // 鍏朵粬 ID锛氬幓鎺?{{cN::...}} 鏍煎紡锛屽彧鏄剧ず绾枃鏈唴瀹?
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
     * 鐢熸垚鍗＄墖鑳岄潰锛?
     * - activeId 楂樹寒鏄剧ず绛旀 (钃濊壊锛屼笌鏅€?Cloze 涓€鑷?
     * - 鍏朵粬 cN 鍘绘帀鏍煎紡锛屽彧鏄剧ず绾枃鏈唴瀹?
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
                // 褰撳墠 ID锛氫娇鐢ㄦ爣璁?
                result += `««SR_S:${encodeURIComponent(info.content)}»»`;
            } else {
                // 鍏朵粬 ID锛氬幓鎺夋牸寮忥紝鍙樉绀虹函鏂囨湰鍐呭
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
            result = result.replace(/\{\{c(\d+)(?:::|锛氾細)(.*?)(?:::|锛氾細)?\}\}/gi, "$2");
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
