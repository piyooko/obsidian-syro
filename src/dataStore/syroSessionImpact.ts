export type SyroPendingSessionImpact = "runtime-only" | "requires-global-sync";

export interface SyroSessionRecordLike {
    domain: string;
    entityType: string;
    opType: string;
}

export interface SyroSessionReplaySummary {
    cardsRuntimeChanged: boolean;
    noteReviewChanged: boolean;
    extractReviewChanged?: boolean;
    timelineChanged: boolean;
    dailyStateChanged: boolean;
    requiresGlobalSync: boolean;
}

export interface SyroSessionAppliedCardReceipt {
    targetUuid: string;
    updatedAt: string;
    pathHint?: string;
    stateDigest: string;
}

export interface SyroSessionReplayReceipt {
    cards: SyroSessionAppliedCardReceipt[];
    dailyStateTargetUuids: string[];
    dailyStateDeckCounts: Record<
        string,
        {
            new: number;
            review: number;
        }
    >;
}

export function buildSyroSessionCardFormalStateDigest(input: {
    path: string;
    trackedFileUuid: string;
    trackedFileAliases?: readonly string[] | null;
    trackedItem?:
        | {
              fingerprint?: string | null;
              lineNo?: number | null;
              clozeId?: string | number | null;
          }
        | null;
    item: {
        aliases?: readonly string[] | null;
        queue: unknown;
        nextReview: unknown;
        learningStep: unknown;
        timesReviewed: unknown;
        timesCorrect: unknown;
        errorStreak: unknown;
        data: unknown;
    };
}): string {
    return JSON.stringify({
        path: input.path,
        trackedFileUuid: input.trackedFileUuid,
        trackedFileAliases: Array.from(new Set(input.trackedFileAliases ?? [])).sort((left, right) =>
            left.localeCompare(right),
        ),
        trackedItem: input.trackedItem
            ? {
                  fingerprint: input.trackedItem.fingerprint ?? null,
                  lineNo: input.trackedItem.lineNo ?? null,
                  clozeId: input.trackedItem.clozeId ?? null,
              }
            : null,
        item: {
            aliases: Array.from(new Set(input.item.aliases ?? [])).sort((left, right) =>
                left.localeCompare(right),
            ),
            queue: input.item.queue,
            nextReview: input.item.nextReview,
            learningStep: input.item.learningStep ?? null,
            timesReviewed: input.item.timesReviewed,
            timesCorrect: input.item.timesCorrect,
            errorStreak: input.item.errorStreak,
            data: input.item.data ?? null,
        },
    });
}

export function createEmptySyroSessionReplaySummary(): SyroSessionReplaySummary {
    return {
        cardsRuntimeChanged: false,
        noteReviewChanged: false,
        extractReviewChanged: false,
        timelineChanged: false,
        dailyStateChanged: false,
        requiresGlobalSync: false,
    };
}

export function createEmptySyroSessionReplayReceipt(): SyroSessionReplayReceipt {
    return {
        cards: [],
        dailyStateTargetUuids: [],
        dailyStateDeckCounts: {},
    };
}

export function mergeSyroSessionReplaySummary(
    left: SyroSessionReplaySummary,
    right: SyroSessionReplaySummary,
): SyroSessionReplaySummary {
    return {
        cardsRuntimeChanged: left.cardsRuntimeChanged || right.cardsRuntimeChanged,
        noteReviewChanged: left.noteReviewChanged || right.noteReviewChanged,
        extractReviewChanged: !!left.extractReviewChanged || !!right.extractReviewChanged,
        timelineChanged: left.timelineChanged || right.timelineChanged,
        dailyStateChanged: left.dailyStateChanged || right.dailyStateChanged,
        requiresGlobalSync: left.requiresGlobalSync || right.requiresGlobalSync,
    };
}

export function mergeSyroSessionReplayReceipt(
    left: SyroSessionReplayReceipt,
    right: SyroSessionReplayReceipt,
): SyroSessionReplayReceipt {
    const cardByTargetUuid = new Map<string, SyroSessionAppliedCardReceipt>();
    for (const entry of [...left.cards, ...right.cards]) {
        const existing = cardByTargetUuid.get(entry.targetUuid);
        if (!existing || existing.updatedAt.localeCompare(entry.updatedAt) <= 0) {
            cardByTargetUuid.set(entry.targetUuid, entry);
        }
    }

    return {
        cards: [...cardByTargetUuid.values()].sort((leftEntry, rightEntry) =>
            leftEntry.targetUuid.localeCompare(rightEntry.targetUuid),
        ),
        dailyStateTargetUuids: Array.from(
            new Set([...left.dailyStateTargetUuids, ...right.dailyStateTargetUuids]),
        ).sort((leftEntry, rightEntry) => leftEntry.localeCompare(rightEntry)),
        dailyStateDeckCounts: {
            ...left.dailyStateDeckCounts,
            ...right.dailyStateDeckCounts,
        },
    };
}

export function classifySyroSessionRecordImpact(
    record: SyroSessionRecordLike,
): SyroPendingSessionImpact {
    if (record.domain === "file-identities") {
        return "requires-global-sync";
    }

    if (record.domain === "daily-state") {
        return "runtime-only";
    }

    if (
        record.domain === "cards" &&
        record.entityType === "card-item" &&
        (record.opType === "review" || record.opType === "undo")
    ) {
        return "runtime-only";
    }

    if (
        (record.domain === "cards" || record.domain === "notes") &&
        record.entityType === "uuid-alias-batch" &&
        record.opType === "merge-aliases"
    ) {
        return "runtime-only";
    }

    if (
        record.domain === "notes" &&
        record.entityType === "note-review" &&
        record.opType === "review"
    ) {
        return "runtime-only";
    }

    if (
        record.domain === "extracts" &&
        record.entityType === "extract-item" &&
        record.opType === "review"
    ) {
        return "runtime-only";
    }

    if (record.domain === "timeline" && record.entityType === "timeline-entry") {
        return "runtime-only";
    }

    return "requires-global-sync";
}

export function hasSyroSessionReplayChanges(summary: SyroSessionReplaySummary): boolean {
    return (
        summary.cardsRuntimeChanged ||
        summary.noteReviewChanged ||
        !!summary.extractReviewChanged ||
        summary.timelineChanged ||
        summary.dailyStateChanged ||
        summary.requiresGlobalSync
    );
}

export function hasSyroSessionReplayReceiptEntries(receipt: SyroSessionReplayReceipt): boolean {
    return (
        receipt.cards.length > 0 ||
        receipt.dailyStateTargetUuids.length > 0 ||
        Object.keys(receipt.dailyStateDeckCounts).length > 0
    );
}
