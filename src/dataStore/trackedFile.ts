/**
 * ============================================================================
 * 文件：TrackedFile.ts
 * ============================================================================
 *
 * 【全新架构：以指纹为核心的孔级追踪系统】
 *
 * 这个文件是"卡片追踪"的核心，做了两件大事：
 * 1. 管理哪些文件被追踪（TrackedFile），并将文件内容拆解为最细粒度的“孔（TrackedItem）”。
 * 2. 通过"明文指纹匹配 + 局部上下文消歧"的方式，把旧的复习记录和新的孔内容对应起来。
 *
 * ============================================================================
 * 核心设计理念（与旧版的区别）：
 * ============================================================================
 *
 * 1. 【孔级粒度】：
 *    以前一条记录代表“一整行/段落”（包含多个孔），现在一条记录（TrackedItem）只代表“一个孔”或“一个答案”。
 *    如果一段话有3个填空，就会生成3条独立的 TrackedItem。
 *
 * 2. 【明文指纹，拒绝哈希】：
 *    指纹（fingerprint）不再是压缩后的8位哈希字符，而是孔/答案的**纯明文**。
 *    例如：`卡片信{{c2::息}}` 的指纹就是 `"息"`。
 *    问答卡的指纹就是 `"答案全文"`。
 *
 * 3. 【局部上下文（Context）】：
 *    上下文不再是整个段落的前后，而是**紧贴指纹所在位置**的前50个字符和后50个字符。
 *    这使得同一行里出现两个相同的词（如两个"是"）也能被完美区分。
 *
 * 4. 【精确坐标（Span）与回退机制】：
 *    引入了 span（字符偏移量）记录指纹在文件中的精确位置，方便复习时高亮/遮罩。
 *    如果在复习时发现 span 处的文字变了（用户编辑了文件导致偏移），
 *    系统会利用 RepetitionItem（复习调度数据）中保存的 lastKnown(锚点) 重新打分，
 *    找到它现在的新位置，并自动修复 span。
 *
 * ============================================================================
 */

import { SRSettings } from "src/settings";
import { CardType, QuestionText } from "src/Question";
import { parse, ParsedQuestionInfo } from "src/parser";
import { RPITEMTYPE } from "./repetitionItem";
import { DEFAULT_DECKNAME } from "src/constants";
import { Tags } from "src/tags";

// ============================================================================
// 类型定义区域
// ============================================================================

/**
 * TrackedSpan —— 精确的物理坐标
 *
 * 用于记录该指纹在 Markdown 文件中的具体字符起止位置。
 * - 为什么要记录 block 的坐标？ 为了复习时能把整句话/整个块取出来展示。
 * - 为什么要记录 start/end Offset？ 为了在整句话里精准地把这个孔挖掉/高亮。
 */
export interface TrackedSpan {
    startOffset: number; // 指纹(孔)本身的起始字符索引（相对于全文件）
    endOffset: number; // 指纹(孔)本身的结束字符索引
    blockStartOffset: number; // 该卡片所在段落/块的起始字符索引
    blockEndOffset: number; // 该卡片所在段落/块的结束字符索引
}

/**
 * TrackedItem —— 最细粒度的追踪单元（孔/答案）
 *
 * 彻底取代了旧的 CardInfo。
 * 一条 TrackedItem = 一个独立的复习实体。
 */
export class TrackedItem {
    fingerprint: string; // 核心：明文指纹（如 "习"、"问答卡的答案"）
    reviewId: number; // 全局复习项 ID（-1 表示新发现的、还没进队列的新卡）
    lineNo: number; // 所在行号（用于初步打分和定位）
    context: string; // 局部上下文（紧贴指纹的前50 + 后50字符）
    cardType: CardType; // 类型：CLOZE 或 QA
    clozeId: string | null; // 仅用于 CLOZE，如 "c1"、"c2"，显示时使用，不参与匹配
    span: TrackedSpan; // 精确的物理坐标

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

/**
 * ITrackedFile 接口（用于 JSON 序列化）
 */
export interface ITrackedFile {
    path: string;
    items: Record<string, number>; // 笔记级别的复习 ID
    trackedItems?: TrackedItem[]; // 取代了旧的 cardItems
    tags: string[];
}

// ============================================================================
// TrackedFile 类 —— 文件追踪的核心类
// ============================================================================

export class TrackedFile implements ITrackedFile {
    path: string;
    items: Record<string, number>;
    trackedItems?: TrackedItem[];
    tags: string[];

    static create(data: ITrackedFile): TrackedFile {
        let tf = new TrackedFile(data.path);
        const type = (data.tags?.[0] as RPITEMTYPE) || RPITEMTYPE.NOTE;
        const dname = data.tags?.[1];
        tf.setTracked(type, dname);
        tf.items = data.items || { file: -1 };

        // 实例化 TrackedItems
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
        console.log(`[TrackedFile] Renamed: ${old} -> ${newPath}`);
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
        return this.tags?.[0] === RPITEMTYPE.NOTE;
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

    /**
     * 获取指定行号和 holeId 的 TrackedItem（新架构用于映射复习对象的入口）
     */
    getTrackedItem(lineNo: number, clozeId: string): TrackedItem | undefined {
        if (!this.trackedItems) return undefined;
        // 兼容处理：对于旧数据或没有孔位的问答卡，它的 clozeId 可能是 null 或 undefined。统一看作 "c1"
        const normCloze = (id: string | null | undefined) =>
            id === null || id === undefined ? "c1" : id;
        const targetCloze = normCloze(clozeId);

        // 先精确匹配：行号 + clozeId
        let item = this.trackedItems.find(
            (i) => i.lineNo === lineNo && normCloze(i.clozeId) === targetCloze,
        );

        // 如果存在轻微错行，允许一定范围的弹性查找
        // 关键修复：弹性层查找必须严格匹配 clozeId，否则同一个问答题的多个挖空请求会全挤到同一个 reviewId 上（因为距离相等）
        if (!item) {
            const candidates = this.trackedItems.filter(
                (i) => normCloze(i.clozeId) === targetCloze,
            );
            if (candidates.length > 0) {
                // 寻找距离最近的
                item = candidates.reduce((a, b) =>
                    Math.abs(a.lineNo - lineNo) < Math.abs(b.lineNo - lineNo) ? a : b,
                );

                // 为了防止多重挖空时的恶性合并，如果找到的对象距离目标行太远（如 > 5 行），拒绝吸附
                if (item && Math.abs(item.lineNo - lineNo) > 5) {
                    item = undefined;
                }
            }
        }
        return item;
    }

    /**
     * 【核心入口】同步文件中的所有孔级记录
     *
     * 1. 解析文件获取新数据 -> expandToCandidates 将段落拆分成一个个的孔
     * 2. 旧记录 vs 新候选人 -> matchItems 执行 指纹匹配+打分消歧
     * 3. 计算删除了哪些复习记录
     *
     * @returns { hasChange, removedIds }
     */
    syncNoteCardsIndex(
        fileText: string,
        settings: SRSettings,
        callback?: (cardText: string, cardInfo: any) => void,
    ): { hasChange: boolean; removedIds: number[] } {
        // 1. 记录同步前的有效复习 ID
        const oldIdSet = new Set<number>();
        if (this.trackedItems) {
            this.trackedItems.forEach((item) => {
                if (item.reviewId >= 0) oldIdSet.add(item.reviewId);
            });
        }

        // 2. 调用 parser.ts 解析（获取段落级的卡片结构）
        // 这里沿用旧逻辑，屏蔽了 HTML 调度注释
        const parsedQuestions: ParsedQuestionInfo[] = parse(fileText, settings);

        // 3. 将“段落级”结果，展开为“孔级”的候选者 (Candidate Items)
        const candidates = expandToCandidates(parsedQuestions, fileText, settings);

        if (!this.trackedItems) this.trackedItems = [];
        const oldCardCount = this.trackedItems.length;

        // 4. 执行核心匹配算法：旧记录 与 新候选 进行匹配
        this.trackedItems = matchItems(this.trackedItems, candidates);

        // 按行号排序，保持物理顺序
        this.trackedItems.sort((a, b) => a.lineNo - b.lineNo);

        // 5. 计算被删除的 ID（以前有，现在匹配不上了 = 幽灵卡/已被删）
        const newIdSet = new Set<number>();
        this.trackedItems.forEach((item) => {
            if (item.reviewId >= 0) newIdSet.add(item.reviewId);
        });

        const removedIds: number[] = [];
        for (const id of oldIdSet) {
            if (!newIdSet.has(id)) removedIds.push(id);
        }

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

        // 发现新卡（reviewId == -1）或数量变化或有删除，都算有变化
        const hasNewCards = this.trackedItems.some((i) => i.reviewId === -1);
        const hasChange =
            oldCardCount !== this.trackedItems.length || hasNewCards || removedIds.length > 0;

        return { hasChange, removedIds };
    }
}

// ============================================================================
// 第一阶段：将解析结果展开为孔级（Candidate）
// ============================================================================

/**
 * 将解析出的段落级 Question 展开为一个个独立的“孔候选者”
 */
function expandToCandidates(
    parsedQuestions: ParsedQuestionInfo[],
    fileText: string,
    settings: SRSettings,
): TrackedItem[] {
    const candidates: TrackedItem[] = [];

    // 检测换行符长度以精确计算偏移
    const lineBreakLen = fileText.includes("\r\n") ? 2 : 1;
    const lines = fileText.split(/\r?\n/);

    for (const question of parsedQuestions) {
        if (question.text.includes(settings.editLaterTag)) continue;

        // 计算这个块（段落）的精确起始和结束偏移量
        let blockStartOffset = 0;
        for (let i = 0; i < question.firstLineNum && i < lines.length; i++) {
            blockStartOffset += lines[i].length + lineBreakLen;
        }
        let blockEndOffset = blockStartOffset;
        for (let i = question.firstLineNum; i <= question.lastLineNum && i < lines.length; i++) {
            blockEndOffset += lines[i].length + lineBreakLen;
        }
        if (blockEndOffset > blockStartOffset) blockEndOffset -= lineBreakLen;

        const cleanText = QuestionText.splitText(question.text, settings)[1]; // 剥离调度信息

        if (question.cardType === CardType.Cloze || question.cardType === CardType.AnkiCloze) {
            // 提取所有填空孔。假设内部辅助函数能提取出孔的内容和局部偏移
            const holes = extractHolesWithOffsets(cleanText, settings);

            for (const hole of holes) {
                // 计算该孔在全文中的绝对偏移
                const startOffset = blockStartOffset + hole.localStart;
                const endOffset = blockStartOffset + hole.localEnd;

                candidates.push(
                    new TrackedItem(
                        hole.answerText, // 指纹：孔的明文内容
                        question.firstLineNum,
                        extractContext(fileText, startOffset, endOffset), // 紧贴孔的前后 50 字符
                        CardType.Cloze,
                        { startOffset, endOffset, blockStartOffset, blockEndOffset },
                        hole.clozeId,
                        -1, // 新候选者尚未分配 reviewId
                    ),
                );
            }
        } else {
            // 问答卡 (QA / Reversed QA)
            // 指纹直接使用“答案全文”
            const answerText = extractQAAnswer(cleanText, settings, question.cardType);

            // 为了简化，问答卡的孔坐标就设为整个块的后半部分或整体
            // (如果需要高亮整个答案，可以在这里做精准查找答案所在的 localOffset)
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
                    "c1",
                    -1,
                ),
            );
        }
    }

    return candidates;
}

// ============================================================================
// 第二阶段：核心匹配打分算法（matchItems）
// ============================================================================

/**
 * 将现有的旧记录与新解析的候选记录进行匹配，继承复习进度（reviewId）
 */
function matchItems(oldItems: TrackedItem[], candidates: TrackedItem[]): TrackedItem[] {
    // 1. 分别按 fingerprint 进行分组
    const oldByFp = new Map<string, TrackedItem[]>();
    for (const old of oldItems) {
        if (!oldByFp.has(old.fingerprint)) oldByFp.set(old.fingerprint, []);
        oldByFp.get(old.fingerprint)!.push(old);
    }

    const newByFp = new Map<string, TrackedItem[]>();
    for (const cand of candidates) {
        if (!newByFp.has(cand.fingerprint)) newByFp.set(cand.fingerprint, []);
        newByFp.get(cand.fingerprint)!.push(cand);
    }

    const result: TrackedItem[] = [];
    const usedNew = new Set<TrackedItem>();

    // 2. 在同指纹组内进行匹配
    for (const [fp, oldGroup] of oldByFp.entries()) {
        const newGroup = (newByFp.get(fp) || []).filter((c) => !usedNew.has(c));

        if (newGroup.length === 0) continue; // 旧的这个指纹没了 -> 幽灵卡丢弃

        // 快速匹配：1对1
        if (oldGroup.length === 1 && newGroup.length === 1) {
            const oldC = oldGroup[0];
            const newC = newGroup[0];
            usedNew.add(newC);
            newC.reviewId = oldC.reviewId; // 继承复习进度
            result.push(newC);
            continue;
        }

        // 打分匹配：多对多 或 1对多
        type Pair = { old: TrackedItem; cand: TrackedItem; score: number };
        const allPairs: Pair[] = [];

        for (const oldC of oldGroup) {
            const lineScores = calculateLineScores(oldC.lineNo, newGroup);
            for (const newC of newGroup) {
                // 上下文相似度占 50 分
                const ctxScore = stringSimilarity(oldC.context, newC.context) * 50;
                // 行号接近度占 50 分
                const lineScore = lineScores.get(newC) || 0;

                // 平分判据：如果 clozeId 也一样，给微小加分打破平衡 (处理同一行有完全一样内容的两个孔)
                const tieBreaker = oldC.clozeId === newC.clozeId ? 1 : 0;

                allPairs.push({ old: oldC, cand: newC, score: ctxScore + lineScore + tieBreaker });
            }
        }

        allPairs.sort((a, b) => b.score - a.score);

        const matchedOld = new Set<TrackedItem>();
        for (const pair of allPairs) {
            if (matchedOld.has(pair.old) || usedNew.has(pair.cand)) continue;

            matchedOld.add(pair.old);
            usedNew.add(pair.cand);
            pair.cand.reviewId = pair.old.reviewId; // 继承
            result.push(pair.cand);
        }
    }

    // 3. 所有未被匹配的新候选，都是全新的卡片
    for (const cand of candidates) {
        if (!usedNew.has(cand)) {
            // cand.reviewId 目前是 -1，保持原样加入
            result.push(cand);
        }
    }

    return result;
}

// ============================================================================
// 第三阶段：复习期间的 Span 校验与回退重定位 (基于锚点)
// ============================================================================

/**
 * 接口：用于复习队列传入的“历史锚点”，也就是你说过的 lastKnown.context / lineNo
 */
/**
 * 在复习时，判断当前的 Span 是否已经失效（比如原文被修改、偏移越界、或者 span 处的文本跟指纹对不上）
 */
function isSpanValid(fileText: string, item: TrackedItem): boolean {
    const { startOffset, endOffset } = item.span;
    if (startOffset < 0 || endOffset > fileText.length) return false;

    // 判断该位置的文本，是否仍然等于指纹
    const spanText = fileText.substring(startOffset, endOffset);
    return spanText === item.fingerprint;
}

/**
 * 【重定位兜底方案】
 * 当复习某个 dueItem 时，发现其 span 失效。
 * 这个函数会重新解析文件，并在同指纹候选中，利用该 dueItem 记录的历史锚点（IAnchor）打分消歧，
 * 找出它现在的新位置。
 *
 * @param dueItemAnchor 复习调度记录中保存的历史锚点 (context + lineNo)
 * @param fingerprint   正在找的复习内容（"习"）
 * @param fileText      文件最新文本
 * @param settings      设置
 * @returns 找回的新候选孔 TrackedItem (包含最新的 span/context/lineNo)
 */
function relocateItemByAnchor(
    dueItemAnchor: { lineNo: number; context: string },
    fingerprint: string,
    fileText: string,
    settings: SRSettings,
): TrackedItem | null {
    // 重新把最新文件解析拆分成孔
    const questions = parse(fileText, settings);
    const allCandidates = expandToCandidates(questions, fileText, settings);

    // 过滤出所有指纹一致的候选位置
    const fpCandidates = allCandidates.filter((c) => c.fingerprint === fingerprint);
    if (fpCandidates.length === 0) return null; // 该指纹彻底被从文件里删除了

    // 如果只有一个位置，直接返回（虽然它跟 anchor 可能有位移，但它是唯一的存活者）
    if (fpCandidates.length === 1) return fpCandidates[0];

    // 如果有多个位置，利用 dueItem 的历史锚点进行打分
    let bestMatch: TrackedItem | null = null;
    let bestScore = -Infinity;

    const lineScores = calculateLineScores(dueItemAnchor.lineNo, fpCandidates);

    for (const cand of fpCandidates) {
        const ctxScore = stringSimilarity(dueItemAnchor.context, cand.context) * 50;
        const lineScore = lineScores.get(cand) || 0;
        const total = ctxScore + lineScore;

        if (total > bestScore) {
            bestScore = total;
            bestMatch = cand;
        }
    }

    return bestMatch;
}

// ============================================================================
// 工具函数：提取相关
// ============================================================================

/**
 * 提取局部上下文：紧贴指纹位置的前 50 和 后 50
 */
function extractContext(fileText: string, startOffset: number, endOffset: number): string {
    const preContext = fileText.substring(Math.max(0, startOffset - 50), startOffset);
    const postContext = fileText.substring(endOffset, Math.min(fileText.length, endOffset + 50));
    return preContext + postContext;
}

/**
 * 占位模拟提取填空孔的位置（实际需要根据 settings.clozePatterns 运行正则）
 * 返回格式：{ answerText: "习", localStart: 10, localEnd: 11, clozeId: "c1" }
 */
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

    const ankiMatches = [...cleanText.matchAll(/\{\{c(\d+)(?:::|：：)(.*?)(?:::|：：)?\}\}/gi)];
    ankiMatches.forEach((match) => {
        const raw = match[0];
        const answerText = match[2];
        const answerOffset = raw.indexOf(answerText);
        holes.push({
            answerText,
            localStart: match.index! + answerOffset,
            localEnd: match.index! + answerOffset + answerText.length,
            clozeId: `c${match[1]}`,
        });
    });

    if (settings.convertHighlightsToClozes) {
        const highlightMatches = [...cleanText.matchAll(/==(.*?)==/g)];
        highlightMatches.forEach((match, index) => {
            const answerText = match[1];
            holes.push({
                answerText,
                localStart: match.index! + 2,
                localEnd: match.index! + 2 + answerText.length,
                clozeId: `hl${index}`,
            });
        });
    }

    if (settings.convertBoldTextToClozes) {
        const boldMatches = [...cleanText.matchAll(/\*\*(.*?)\*\*/g)];
        boldMatches.forEach((match, index) => {
            const answerText = match[1];
            holes.push({
                answerText,
                localStart: match.index! + 2,
                localEnd: match.index! + 2 + answerText.length,
                clozeId: `bd${index}`,
            });
        });
    }

    return holes;
    // 示例正则表达式，匹配 {{c1::答案}}
    const clozeRegex = /{{(c\d+)::([^}]+)}}/g;
    let match;
    while ((match = clozeRegex.exec(cleanText)) !== null) {
        // match[1] = "c1", match[2] = "答案"
        holes.push({
            answerText: match[2],
            localStart: match.index + match[0].indexOf(match[2]), // 粗略计算答案本体在 block 中的位置
            localEnd: match.index + match[0].indexOf(match[2]) + match[2].length,
            clozeId: match[1],
        });
    }
    return holes;
}

/**
 * 占位模拟提取问答卡的答案内容
 */
function extractQAAnswer(cleanText: string, settings: SRSettings, type: CardType): string {
    // 问答卡被对应的分隔符分成前后两部分。假设 parser.ts 的逻辑，我们可以简化为：
    // 如果是 QA，答案在分隔符后面。这部分需依赖具体分隔符实现，这里做伪代码演示：
    const parts = cleanText.split(settings.singleLineCardSeparator);
    if (parts.length > 1) return parts[1].trim();
    return cleanText; // 兜底
}

// ============================================================================
// 工具函数：相似度打分计算
// ============================================================================

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
        if (b2.has(bg)) intersection += Math.min(count, b2.get(bg)!);
    }
    return (2 * intersection) / (str1.length - 1 + (str2.length - 1));
}

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
