import { Note } from "src/Note";
import { RepetitionItem } from "src/dataStore/repetitionItem";
import { ITrackedFile, TrackedFile } from "src/dataStore/trackedFile";

export interface InlineTitleCardStats {
    reviewableCount: number;
    totalCount: number;
}

export interface InlineTitleExtractLike {
    stage?: string;
    timesReviewed?: number;
    nextReview?: number;
}

export function combineInlineTitleStats(
    ...statsList: InlineTitleCardStats[]
): InlineTitleCardStats {
    return statsList.reduce(
        (combined, stats) => ({
            reviewableCount: combined.reviewableCount + stats.reviewableCount,
            totalCount: combined.totalCount + stats.totalCount,
        }),
        { reviewableCount: 0, totalCount: 0 },
    );
}

export function countInlineTitleStatsFromExtracts(
    extracts: InlineTitleExtractLike[],
    now: number = Date.now(),
): InlineTitleCardStats {
    let reviewableCount = 0;
    let totalCount = 0;

    for (const extract of extracts) {
        if (extract.stage && extract.stage !== "active") {
            continue;
        }
        totalCount += 1;
        const timesReviewed = extract.timesReviewed ?? 0;
        const nextReview = extract.nextReview ?? 0;
        if (timesReviewed === 0 || nextReview === 0 || nextReview <= now) {
            reviewableCount += 1;
        }
    }

    return {
        reviewableCount,
        totalCount,
    };
}

function isReviewableCard(
    item: RepetitionItem | null | undefined,
    now: number,
    learnAheadMillis: number,
): boolean {
    if (!item) {
        return true;
    }

    return item.isNew || item.isDue || item.isReviewableLearning(now, learnAheadMillis);
}

export function countInlineTitleStatsFromNote(
    note: Note,
    now: number = Date.now(),
    learnAheadMillis: number = 0,
): InlineTitleCardStats {
    let reviewableCount = 0;
    let totalCount = 0;

    for (const question of note.questionList) {
        if (question.hasEditLaterTag) {
            continue;
        }

        for (const card of question.cards) {
            totalCount += 1;
            if (isReviewableCard(card.repetitionItem, now, learnAheadMillis)) {
                reviewableCount += 1;
            }
        }
    }

    return {
        reviewableCount,
        totalCount,
    };
}

export function cloneTrackedFileForInlineTitleStats(
    path: string,
    trackedFile?: TrackedFile | null,
): TrackedFile {
    if (!trackedFile) {
        return new TrackedFile(path);
    }

    const cloned: ITrackedFile = {
        path,
        items: { ...trackedFile.items },
        trackedItems: (trackedFile.trackedItems ?? []).map((item) => ({
            fingerprint: item.fingerprint,
            reviewId: item.reviewId,
            lineNo: item.lineNo,
            context: item.context,
            cardType: item.cardType,
            clozeId: item.clozeId,
            span: {
                startOffset: item.span.startOffset,
                endOffset: item.span.endOffset,
                blockStartOffset: item.span.blockStartOffset,
                blockEndOffset: item.span.blockEndOffset,
            },
        })),
        tags: [...(trackedFile.tags ?? [])],
    };

    return TrackedFile.create(cloned);
}

export function countInlineTitleStatsFromTrackedFile(
    trackedFile: TrackedFile,
    getItemById: (id: number) => RepetitionItem | null | undefined,
    now: number = Date.now(),
    learnAheadMillis: number = 0,
): InlineTitleCardStats {
    let reviewableCount = 0;
    let totalCount = 0;

    for (const trackedItem of trackedFile.trackedItems ?? []) {
        totalCount += 1;
        const item =
            typeof trackedItem.reviewId === "number" && trackedItem.reviewId >= 0
                ? getItemById(trackedItem.reviewId)
                : null;

        if (isReviewableCard(item, now, learnAheadMillis)) {
            reviewableCount += 1;
        }
    }

    return {
        reviewableCount,
        totalCount,
    };
}
