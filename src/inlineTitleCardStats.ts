import { Note } from "src/Note";
import { RepetitionItem } from "src/dataStore/repetitionItem";
import { ITrackedFile, TrackedFile } from "src/dataStore/trackedFile";

export interface InlineTitleCardStats {
    reviewableCount: number;
    totalCount: number;
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
