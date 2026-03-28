
import { SRSettings } from "src/settings";
import { CardType, QuestionText } from "src/Question";
import { parse, ParsedQuestionInfo } from "src/parser";
import { RPITEMTYPE } from "./repetitionItem";
import { DEFAULT_DECKNAME } from "src/constants";

// ============================================================================
// ============================================================================

export interface TrackedSpan {
    startOffset: number;
    endOffset: number;
    blockStartOffset: number;
    blockEndOffset: number;
}

export class TrackedItem {
    fingerprint: string;
    reviewId: number;
    lineNo: number;
    context: string;
    cardType: CardType;
    clozeId: string | null;
    span: TrackedSpan;

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
    itemMap: Record<string, number>;
}

export class TrackedFile implements ITrackedFile {
    path: string;
    items: Record<string, number>;
    trackedItems?: TrackedItem[];
    tags: string[];

    get cardItems(): CardItemSummary[] {
        const groupedItems = new Map<number, Record<string, number>>();

        for (const trackedItem of this.trackedItems ?? []) {
            const itemMap = groupedItems.get(trackedItem.lineNo) ?? {};
            const fallbackKey = `c${Object.keys(itemMap).length + 1}`;
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

    getTrackedItem(lineNo: number, clozeId: string): TrackedItem | undefined {
        if (!this.trackedItems) return undefined;
        const normCloze = (id: string | null | undefined) =>
            id === null || id === undefined ? "c1" : id;
        const targetCloze = normCloze(clozeId);

        let item = this.trackedItems.find(
            (i) => i.lineNo === lineNo && normCloze(i.clozeId) === targetCloze,
        );

        if (!item) {
            const candidates = this.trackedItems.filter(
                (i) => normCloze(i.clozeId) === targetCloze,
            );
            if (candidates.length > 0) {
                item = candidates.reduce((a, b) =>
                    Math.abs(a.lineNo - lineNo) < Math.abs(b.lineNo - lineNo) ? a : b,
                );

                if (item && Math.abs(item.lineNo - lineNo) > 5) {
                    item = undefined;
                }
            }
        }
        return item;
    }

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

        const parsedQuestions: ParsedQuestionInfo[] = parse(fileText, settings);

        const candidates = expandToCandidates(parsedQuestions, fileText, settings);

        if (!this.trackedItems) this.trackedItems = [];
        const oldCardCount = this.trackedItems.length;

        this.trackedItems = matchItems(this.trackedItems, candidates);

        this.trackedItems.sort((a, b) => a.lineNo - b.lineNo);

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

        const hasNewCards = this.trackedItems.some((i) => i.reviewId === -1);
        const hasChange =
            oldCardCount !== this.trackedItems.length || hasNewCards || removedIds.length > 0;

        return { hasChange, removedIds };
    }
}

// ============================================================================
// ============================================================================

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

        if (question.cardType === CardType.Cloze || question.cardType === CardType.AnkiCloze) {
            const holes = extractHolesWithOffsets(cleanText, settings);

            for (const hole of holes) {
                const startOffset = blockStartOffset + hole.localStart;
                const endOffset = blockStartOffset + hole.localEnd;

                candidates.push(
                    new TrackedItem(
                        hole.answerText,
                        question.firstLineNum,
                        extractContext(fileText, startOffset, endOffset),
                        CardType.Cloze,
                        { startOffset, endOffset, blockStartOffset, blockEndOffset },
                        hole.clozeId,
                        -1,
                    ),
                );
            }
        } else {
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
                    "c1",
                    -1,
                ),
            );
        }
    }

    return candidates;
}

// ============================================================================
// ============================================================================

function matchItems(oldItems: TrackedItem[], candidates: TrackedItem[]): TrackedItem[] {
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

    for (const [fp, oldGroup] of oldByFp.entries()) {
        const newGroup = (newByFp.get(fp) || []).filter((c) => !usedNew.has(c));

        if (newGroup.length === 0) continue;

        if (oldGroup.length === 1 && newGroup.length === 1) {
            const oldC = oldGroup[0];
            const newC = newGroup[0];
            usedNew.add(newC);
            newC.reviewId = oldC.reviewId;
            result.push(newC);
            continue;
        }

        type Pair = { old: TrackedItem; cand: TrackedItem; score: number };
        const allPairs: Pair[] = [];

        for (const oldC of oldGroup) {
            const lineScores = calculateLineScores(oldC.lineNo, newGroup);
            for (const newC of newGroup) {
                const ctxScore = stringSimilarity(oldC.context, newC.context) * 50;
                const lineScore = lineScores.get(newC) || 0;

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
            pair.cand.reviewId = pair.old.reviewId;
            result.push(pair.cand);
        }
    }

    for (const cand of candidates) {
        if (!usedNew.has(cand)) {
            result.push(cand);
        }
    }

    return result;
}

// ============================================================================
// ============================================================================

// ============================================================================
// ============================================================================

function extractContext(fileText: string, startOffset: number, endOffset: number): string {
    const preContext = fileText.substring(Math.max(0, startOffset - 50), startOffset);
    const postContext = fileText.substring(endOffset, Math.min(fileText.length, endOffset + 50));
    return preContext + postContext;
}

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
            localStart: match.index + answerOffset,
            localEnd: match.index + answerOffset + answerText.length,
            clozeId: `c${match[1]}`,
        });
    });

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
