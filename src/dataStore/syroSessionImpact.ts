export type SyroPendingSessionImpact = "runtime-only" | "requires-global-sync";

export interface SyroSessionRecordLike {
    domain: string;
    entityType: string;
    opType: string;
}

export interface SyroSessionReplaySummary {
    cardsRuntimeChanged: boolean;
    noteReviewChanged: boolean;
    timelineChanged: boolean;
    dailyStateChanged: boolean;
    requiresGlobalSync: boolean;
}

export function createEmptySyroSessionReplaySummary(): SyroSessionReplaySummary {
    return {
        cardsRuntimeChanged: false,
        noteReviewChanged: false,
        timelineChanged: false,
        dailyStateChanged: false,
        requiresGlobalSync: false,
    };
}

export function mergeSyroSessionReplaySummary(
    left: SyroSessionReplaySummary,
    right: SyroSessionReplaySummary,
): SyroSessionReplaySummary {
    return {
        cardsRuntimeChanged: left.cardsRuntimeChanged || right.cardsRuntimeChanged,
        noteReviewChanged: left.noteReviewChanged || right.noteReviewChanged,
        timelineChanged: left.timelineChanged || right.timelineChanged,
        dailyStateChanged: left.dailyStateChanged || right.dailyStateChanged,
        requiresGlobalSync: left.requiresGlobalSync || right.requiresGlobalSync,
    };
}

export function classifySyroSessionRecordImpact(
    record: SyroSessionRecordLike,
): SyroPendingSessionImpact {
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

    if (record.domain === "timeline" && record.entityType === "timeline-entry") {
        return "runtime-only";
    }

    return "requires-global-sync";
}

export function hasSyroSessionReplayChanges(summary: SyroSessionReplaySummary): boolean {
    return (
        summary.cardsRuntimeChanged ||
        summary.noteReviewChanged ||
        summary.timelineChanged ||
        summary.dailyStateChanged ||
        summary.requiresGlobalSync
    );
}
