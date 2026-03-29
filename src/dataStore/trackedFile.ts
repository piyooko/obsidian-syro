import { SRSettings } from "src/settings";
import { CardType, QuestionText } from "src/Question";
import { parse, ParsedQuestionInfo } from "src/parser";
import { RPITEMTYPE } from "./repetitionItem";
import { DEFAULT_DECKNAME } from "src/constants";

// ============================================================================
// ============================================================================

// 记录卡片/挖空在整个笔记文件中的绝对位置（字符偏移量）
export interface TrackedSpan {
    startOffset: number; // 答案的起始位置
    endOffset: number;   // 答案的结束位置
    blockStartOffset: number; // 整个题目块的起始位置
    blockEndOffset: number;   // 整个题目块的结束位置
}

// 每张具体的卡片（或单个挖空）的“户口本”
export class TrackedItem {
    fingerprint: string; // 特征指纹（通常是答案的文本，或用于匹配的唯一标识）
    reviewId: number;    // 对应的底层复习进度 ID。如果是 -1，说明这是一张新卡，未进入复习系统
    lineNo: number;      // 该卡片所在的行号
    context: string;     // 挖空前后的上下文文本（用于在笔记修改后找回这张卡片）
    cardType: CardType;  // 卡片类型（问答、Anki挖空、普通挖空等）
    clozeId: string | null; // 挖空编号！这是关键！例如 "c1" 或代码块里的 "c1_l0"
    span: TrackedSpan;   // 偏移量信息

    constructor(
        fingerprint: string,
        lineNo: number,
        context: string,
        cardType: CardType,
        span: TrackedSpan,
        clozeId: string | null = null,
        reviewId: number = -1,
    ) {
        this.fingerprint = fingerprint;
        this.lineNo = lineNo;
        this.context = context;
        this.cardType = cardType;
        this.span = span;
        this.clozeId = clozeId;
        this.reviewId = reviewId;
    }
}

export type CardInfo = TrackedItem;

export interface ITrackedFile {
    path: string;
    items: Record<string, number>;
    trackedItems?: TrackedItem[];
    tags: string[];
}

// ============================================================================
// ============================================================================

export interface CardItemSummary {
    lineNo: number;
    itemMap: Record<string, number>; // key 是 clozeId (如 c1), value 是 reviewId
}

// 记录一个笔记文件里所有复习项（笔记复习 + 闪卡复习）的容器类
export class TrackedFile implements ITrackedFile {
    path: string;
    items: Record<string, number>; // 存笔记级的复习 ID，通常是 { file: 123 }
    trackedItems?: TrackedItem[];  // 存该文件下所有的闪卡项
    tags: string[];

    // 把 flat 数组形式的 trackedItems 按行号(lineNo)聚合并映射为 { "c1": reviewId } 的形式
    // 这里如果 trackedItem 本身的 clozeId 错了，这里映射出来的 key 也会错
    get cardItems(): CardItemSummary[] {
        const groupedItems = new Map<number, Record<string, number>>();

        for (const trackedItem of this.trackedItems ?? []) {
            const itemMap = groupedItems.get(trackedItem.lineNo) ?? {};
            const fallbackKey = `c${Object.keys(itemMap).length + 1}`;
            // [DEBUG 建议]: 如果你发现旧版卡片的复习进度丢失，可以在这里打印 trackedItem.clozeId 看看是不是由于代码块原因，格式变成了 c1_l0 导致匹配不上
            const key = trackedItem.clozeId ?? (itemMap["c1"] === undefined ? "c1" : fallbackKey);
            itemMap[key] = trackedItem.reviewId;
            groupedItems.set(trackedItem.lineNo, itemMap);
        }

        return [...groupedItems.entries()]
            .sort(([left], [right]) => left - right)
            .map(([lineNo, itemMap]) => ({ lineNo, itemMap }));
    }

    static create(data: ITrackedFile): TrackedFile {
        const tf = new TrackedFile(data.path);
        const type = (data.tags?.[0] as RPITEMTYPE) || RPITEMTYPE.NOTE;
        const dname = data.tags?.[1];
        tf.setTracked(type, dname);
        tf.items = data.items || { file: -1 };

        if (data.trackedItems) {
            tf.trackedItems = data.trackedItems.map(
                (item) =>
                    new TrackedItem(
                        item.fingerprint,
                        item.lineNo,
                        item.context,
                        item.cardType,
                        item.span,
                        item.clozeId,
                        item.reviewId,
                    ),
            );
        } else {
            tf.trackedItems = [];
        }

        tf.tags = data.tags || [];
        return tf;
    }

    constructor(path: string = "", type: RPITEMTYPE = RPITEMTYPE.NOTE, dname?: string) {
        this.path = path;
        this.items = {};
        if (type === RPITEMTYPE.CARD) {
            this.trackedItems = [];
        }
        this.setTracked(type, dname);
    }

    rename(newPath: string) {
        const old = this.path;
        this.path = newPath;
        console.debug(`[TrackedFile] Renamed: ${old} -> ${newPath}`);
    }

    get hasCards() {
        return Array.isArray(this.trackedItems) && this.trackedItems.length > 0;
    }

    get lastTag(): string | undefined {
        return this.tags?.[this.tags.length - 1];
    }

    get isDefault(): boolean {
        return this.tags?.includes(DEFAULT_DECKNAME) || this.tags?.length === 1;
    }

    get isTrackedNote(): boolean {
        return String(this.tags?.[0]) === String(RPITEMTYPE.NOTE);
    }

    get itemIDs(): number[] {
        const ids = [this.items.file];
        if (this.hasCards) {
            this.trackedItems.forEach((item) => {
                if (item.reviewId >= 0) ids.push(item.reviewId);
            });
        }
        return ids.filter((id) => id !== undefined && id >= 0);
    }

    setTracked(type: RPITEMTYPE, dname?: string) {
        this.tags = [type];
        if (dname !== undefined) {
            this.tags.push(dname);
        } else if (type === RPITEMTYPE.NOTE) {
            this.tags.push(DEFAULT_DECKNAME);
        }
    }

    setUnTracked() {
        this.tags = [this.tags[0]];
    }

    // 根据行号和 clozeId 寻找对应的追踪卡片
    getTrackedItem(lineNo: number, clozeId: string): TrackedItem | undefined {
        if (!this.trackedItems) return undefined;
        const normCloze = (id: string | null | undefined) =>
            id === null || id === undefined ? "c1" : id;
        const targetCloze = normCloze(clozeId);

        // 优先精准匹配：行号和 clozeId 都相同
        let item = this.trackedItems.find(
            (i) => i.lineNo === lineNo && normCloze(i.clozeId) === targetCloze,
        );

        // 如果找不到，尝试容错匹配（可能在笔记里加了空行，导致行号偏移）
        if (!item) {
            const candidates = this.trackedItems.filter(
                (i) => normCloze(i.clozeId) === targetCloze,
            );
            if (candidates.length > 0) {
                // 找行号最近的那个
                item = candidates.reduce((a, b) =>
                    Math.abs(a.lineNo - lineNo) < Math.abs(b.lineNo - lineNo) ? a : b,
                );

                // 如果行号差了 5 行以上，认为不是同一张卡片，放弃匹配
                if (item && Math.abs(item.lineNo - lineNo) > 5) {
                    item = undefined;
                }
            }
        }
        return item;
    }

    // 核心函数：同步笔记中的卡片与 JSON 存储中的数据
    // 每次笔记修改或请求同步时都会调用
    syncNoteCardsIndex(
        fileText: string,
        settings: SRSettings,
        callback?: (cardText: string, cardInfo: unknown) => void,
    ): { hasChange: boolean; removedIds: number[] } {
        const oldIdSet = new Set<number>();
        if (this.trackedItems) {
            this.trackedItems.forEach((item) => {
                if (item.reviewId >= 0) oldIdSet.add(item.reviewId);
            });
        }

        // 1. 调用底层 Parser 解析出所有的题目块 (ParsedQuestionInfo)
        const parsedQuestions: ParsedQuestionInfo[] = parse(fileText, settings);

        // [DEBUG 建议]: 这里可以 console.log(parsedQuestions) 看看有没有把代码块正确解析为 AnkiCloze
        
        // 2. 将大的题目块展开为一个个具体的挖空候选项 (candidates)
        const candidates = expandToCandidates(parsedQuestions, fileText, settings);

        if (!this.trackedItems) this.trackedItems = [];
        const oldCardCount = this.trackedItems.length;

        // 3. 将现有的卡片(oldItems)与新提取出的卡片(candidates)进行差异对比(Diff匹配)，继承 reviewId
        this.trackedItems = matchItems(this.trackedItems, candidates);

        // 按行号排序
        this.trackedItems.sort((a, b) => a.lineNo - b.lineNo);

        const newIdSet = new Set<number>();
        this.trackedItems.forEach((item) => {
            if (item.reviewId >= 0) newIdSet.add(item.reviewId);
        });

        // 找出哪些卡片在本次同步中被删除了
        const removedIds: number[] = [];
        for (const id of oldIdSet) {
            if (!newIdSet.has(id)) removedIds.push(id);
        }

        // 触发旧版调度的回调（如果有的话）
        if (callback && parsedQuestions.length > 0) {
            parsedQuestions.forEach((pq) => {
                const itemMap: Record<string, number> = {};
                const relatedItems = (this.trackedItems || []).filter(
                    (ti) => ti.lineNo === pq.firstLineNum,
                );
                relatedItems.forEach((ri) => {
                    if (ri.clozeId) itemMap[ri.clozeId] = ri.reviewId;
                    else itemMap["c1"] = ri.reviewId;
                });
                callback(pq.text, { lineNo: pq.firstLineNum, itemMap: itemMap });
            });
        }

        const hasNewCards = this.trackedItems.some((i) => i.reviewId === -1);
        const hasChange =
            oldCardCount !== this.trackedItems.length || hasNewCards || removedIds.length > 0;

        return { hasChange, removedIds };
    }
}

// ============================================================================
// ============================================================================

// 将 Parser 解析出的大块问题（可能包含多个挖空），展开为一个个单独的 TrackedItem
function expandToCandidates(
    parsedQuestions: ParsedQuestionInfo[],
    fileText: string,
    settings: SRSettings,
): TrackedItem[] {
    const candidates: TrackedItem[] = [];

    const lineBreakLen = fileText.includes("\r\n") ? 2 : 1;
    const lines = fileText.split(/\r?\n/);

    for (const question of parsedQuestions) {
        if (question.text.includes(settings.editLaterTag)) continue;

        // 计算当前问题块在全文中的绝对起始和结束 offset
        let blockStartOffset = 0;
        for (let i = 0; i < question.firstLineNum && i < lines.length; i++) {
            blockStartOffset += lines[i].length + lineBreakLen;
        }
        let blockEndOffset = blockStartOffset;
        for (let i = question.firstLineNum; i <= question.lastLineNum && i < lines.length; i++) {
            blockEndOffset += lines[i].length + lineBreakLen;
        }
        if (blockEndOffset > blockStartOffset) blockEndOffset -= lineBreakLen;

        const cleanText = QuestionText.splitText(question.text, settings)[1];

        // 处理挖空题：一个大块里可能有多个挖空
        if (question.cardType === CardType.Cloze || question.cardType === CardType.AnkiCloze) {
            
            // [关键环节] 这里提取所有挖空的具体位置和内容
            const holes = extractHolesWithOffsets(cleanText, settings);

            for (const hole of holes) {
                const startOffset = blockStartOffset + hole.localStart;
                const endOffset = blockStartOffset + hole.localEnd;

                // [DEBUG 建议]: 这里可以 console.log(hole.clozeId) 
                // 看看为你的代码块 {{c1::}} 生成的 ID 到底是不是 c1_l0 还是普通的 c1。
                // 导致复习失效的元凶极有可能就是这里生成的 ID 与 ItemTrans 中需要的不匹配。
                candidates.push(
                    new TrackedItem(
                        hole.answerText,         // fingerprint 指纹通常就是挖空内的答案
                        question.firstLineNum,
                        extractContext(fileText, startOffset, endOffset),
                        CardType.Cloze,
                        { startOffset, endOffset, blockStartOffset, blockEndOffset },
                        hole.clozeId,            // 将计算出的 clozeId 塞进去
                        -1,
                    ),
                );
            }
        } else {
            // 普通问答题，仅一个 candidate
            const answerText = extractQAAnswer(cleanText, settings, question.cardType);

            const answerIndex = cleanText.indexOf(answerText);
            const startOffset =
                answerIndex !== -1 ? blockStartOffset + answerIndex : blockStartOffset;
            const endOffset = startOffset + answerText.length;

            candidates.push(
                new TrackedItem(
                    cleanText,
                    question.firstLineNum,
                    extractContext(fileText, startOffset, endOffset),
                    question.cardType,
                    { startOffset, endOffset, blockStartOffset, blockEndOffset },
                    "c1", // 普通问答题固定为 c1
                    -1,
                ),
            );
        }
    }

    return candidates;
}

// ============================================================================
// ============================================================================

// 卡片匹配算法：在文本编辑后，根据指纹、上下文相似度和行号，尽量认出原本的卡片
function matchItems(oldItems: TrackedItem[], candidates: TrackedItem[]): TrackedItem[] {
    // 1. 按指纹 (fingerprint，通常是答案内容) 分组
    const oldByFp = new Map<string, TrackedItem[]>();
    for (const old of oldItems) {
        if (!oldByFp.has(old.fingerprint)) oldByFp.set(old.fingerprint, []);
        oldByFp.get(old.fingerprint).push(old);
    }

    const newByFp = new Map<string, TrackedItem[]>();
    for (const cand of candidates) {
        if (!newByFp.has(cand.fingerprint)) newByFp.set(cand.fingerprint, []);
        newByFp.get(cand.fingerprint).push(cand);
    }

    const result: TrackedItem[] = [];
    const usedNew = new Set<TrackedItem>();

    // 2. 遍历所有旧分组进行匹配
    for (const [fp, oldGroup] of oldByFp.entries()) {
        const newGroup = (newByFp.get(fp) || []).filter((c) => !usedNew.has(c));

        if (newGroup.length === 0) continue; // 如果新文本里没这个指纹了，说明这卡被删了或被改了答案

        // 简单情况：旧的只有一张，新的也只有一张，完美匹配，直接继承 reviewId
        if (oldGroup.length === 1 && newGroup.length === 1) {
            const oldC = oldGroup[0];
            const newC = newGroup[0];
            usedNew.add(newC);
            newC.reviewId = oldC.reviewId;
            result.push(newC);
            continue;
        }

        // 复杂情况：同一个笔记里有多个答案相同的卡片（比如挖了好几个空都是 "Apple"）
        // 这时候需要通过打分系统（上下文相似度 + 行号偏移）来做最佳匹配
        type Pair = { old: TrackedItem; cand: TrackedItem; score: number };
        const allPairs: Pair[] = [];

        for (const oldC of oldGroup) {
            const lineScores = calculateLineScores(oldC.lineNo, newGroup);
            for (const newC of newGroup) {
                const ctxScore = stringSimilarity(oldC.context, newC.context) * 50; // 上下文相似度权重 50 分
                const lineScore = lineScores.get(newC) || 0;                        // 行号距离权重 50 分

                // [DEBUG 建议]: 如果你发现相同答案的卡片被错乱匹配，可以检查这里的 tieBreaker。
                // 如果旧卡的 clozeId 是 "c1"，新卡的 clozeId 却是 "c1_l0"，这里就拿不到加分，甚至可能错乱。
                const tieBreaker = oldC.clozeId === newC.clozeId ? 1 : 0;

                allPairs.push({ old: oldC, cand: newC, score: ctxScore + lineScore + tieBreaker });
            }
        }

        // 按得分从高到低排序
        allPairs.sort((a, b) => b.score - a.score);

        const matchedOld = new Set<TrackedItem>();
        for (const pair of allPairs) {
            if (matchedOld.has(pair.old) || usedNew.has(pair.cand)) continue;

            matchedOld.add(pair.old);
            usedNew.add(pair.cand);
            pair.cand.reviewId = pair.old.reviewId; // 继承 ID
            result.push(pair.cand);
        }
    }

    // 3. 把没被匹配上的新候选卡片加进来，它们就是纯粹的新卡（reviewId 为 -1）
    for (const cand of candidates) {
        if (!usedNew.has(cand)) {
            result.push(cand);
        }
    }

    return result;
}

// ============================================================================
// ============================================================================

function extractContext(fileText: string, startOffset: number, endOffset: number): string {
    const preContext = fileText.substring(Math.max(0, startOffset - 50), startOffset);
    const postContext = fileText.substring(endOffset, Math.min(fileText.length, endOffset + 50));
    return preContext + postContext;
}

// 核心函数：利用括号深度匹配逻辑，把字符串里的 {{c1::xxxx}} 全部找出来
function extractHolesWithOffsets(
    cleanText: string,
    settings: SRSettings,
): Array<{ answerText: string; localStart: number; localEnd: number; clozeId: string }> {
    const holes: Array<{
        answerText: string;
        localStart: number;
        localEnd: number;
        clozeId: string;
    }> = [];

    // [修正]: 判断当前提取的是否为代码块，用来给后面添加正确的 _lX 行号后缀
    const isCodeBlock = (cleanText.startsWith("```") || cleanText.startsWith("~~~")) && settings.parseClozesInCodeBlocks;

    const regex = /\{\{c(\d+)(?:::|：：)/gi;
    let match;
    // 使用 while 和 indexOf 进行深度括号匹配，防止被嵌套的 } 打断
    while ((match = regex.exec(cleanText)) !== null) {
        const id = match[1];
        const startPos = match.index;
        const contentStart = startPos + match[0].length;

        let braceDepth = 0;
        let endPos = -1;

        for (let j = contentStart; j < cleanText.length; j++) {
            if (braceDepth === 0 && cleanText.startsWith("}}", j)) {
                endPos = j;
                break;
            }
            if (cleanText[j] === "{") braceDepth++;
            else if (cleanText[j] === "}") {
                if (braceDepth > 0) braceDepth--;
            }
        }

        if (endPos !== -1) {
            const rawContent = cleanText.substring(contentStart, endPos);
            // 处理可选的 ::hint
            const hintSeparatorIndex = rawContent.indexOf("::");
            let answerText = rawContent;
            if (hintSeparatorIndex !== -1) {
                answerText = rawContent.substring(0, hintSeparatorIndex);
            } else {
                const altHintSeparatorIndex = rawContent.indexOf("：：");
                if (altHintSeparatorIndex !== -1) {
                    answerText = rawContent.substring(0, altHintSeparatorIndex);
                }
            }

            const answerOffset = cleanText.substring(startPos, endPos).indexOf(answerText);
            
            // [修正]: 为代码块加上正确的行号标识 (例如 c1_l0)。
            // 因为 `ItemTrans.ts` 和 `utils_recall.ts` 期望代码块里的特征键带有行号以防重名
            const lineIndex = cleanText.substring(0, startPos).split("\n").length - 1;
            const clozeId = isCodeBlock ? `c${id}_l${lineIndex}` : `c${id}`;

            holes.push({
                answerText,
                localStart: startPos + answerOffset,
                localEnd: startPos + answerOffset + answerText.length,
                clozeId,
            });

            regex.lastIndex = endPos + 2;
        }
    }

    // 处理普通的 ==高亮==
    if (settings.convertHighlightsToClozes) {
        const highlightMatches = [...cleanText.matchAll(/==(.*?)==/g)];
        highlightMatches.forEach((match, index) => {
            const answerText = match[1];
            holes.push({
                answerText,
                localStart: match.index + 2,
                localEnd: match.index + 2 + answerText.length,
                clozeId: `hl${index}`,
            });
        });
    }

    // 处理普通的 **加粗**
    if (settings.convertBoldTextToClozes) {
        const boldMatches = [...cleanText.matchAll(/\*\*(.*?)\*\*/g)];
        boldMatches.forEach((match, index) => {
            const answerText = match[1];
            holes.push({
                answerText,
                localStart: match.index + 2,
                localEnd: match.index + 2 + answerText.length,
                clozeId: `bd${index}`,
            });
        });
    }

    return holes;
}

function extractQAAnswer(cleanText: string, settings: SRSettings, _type: CardType): string {
    const parts = cleanText.split(settings.singleLineCardSeparator);
    if (parts.length > 1) return parts[1].trim();
    return cleanText;
}

// ============================================================================
// ============================================================================

// 比较两段上下文的相似度（基于 Bigram 算法）
function stringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length < 2 || str2.length < 2) return 0;
    const getBigrams = (str: string) => {
        const bigrams = new Map<string, number>();
        for (let i = 0; i < str.length - 1; i++) {
            const bigram = str.substring(i, i + 2);
            bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
        }
        return bigrams;
    };
    const b1 = getBigrams(str1),
        b2 = getBigrams(str2);
    let intersection = 0;
    for (const [bg, count] of b1) {
        if (b2.has(bg)) intersection += Math.min(count, b2.get(bg));
    }
    return (2 * intersection) / (str1.length - 1 + (str2.length - 1));
}

// 根据候选卡片距离目标行号的远近打分（越近分数越高，满分 50 分）
function calculateLineScores(
    targetLineNo: number,
    candidates: TrackedItem[],
): Map<TrackedItem, number> {
    const scores = new Map<TrackedItem, number>();
    if (candidates.length === 0) return scores;

    const distances = candidates.map((c) => ({ cand: c, dist: Math.abs(c.lineNo - targetLineNo) }));
    const allDists = distances.map((d) => d.dist);
    const minDist = Math.min(...allDists);
    const maxDist = Math.max(...allDists);

    if (maxDist === minDist) {
        for (const c of candidates) scores.set(c, 50);
        return scores;
    }

    const MIN_SCORE = 5;
    for (const { cand, dist } of distances) {
        const normalized = (dist - minDist) / (maxDist - minDist);
        scores.set(cand, MIN_SCORE + (50 - MIN_SCORE) * (1 - normalized));
    }
    return scores;
}
