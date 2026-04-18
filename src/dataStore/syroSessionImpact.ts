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

export interface SyroSessionAppliedCardReceipt {
    targetUuid: string;
    updatedAt: string;
}

export interface SyroSessionReplayReceipt {
    cards: SyroSessionAppliedCardReceipt[];
    dailyStateTargetUuids: string[];
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

export function createEmptySyroSessionReplayReceipt(): SyroSessionReplayReceipt {
    return {
        cards: [],
        dailyStateTargetUuids: [],
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

export function mergeSyroSessionReplayReceipt(
    left: SyroSessionReplayReceipt,
    right: SyroSessionReplayReceipt,
): SyroSessionReplayReceipt {
    const cardByTargetUuid = new Map<string, SyroSessionAppliedCardReceipt>();
    for (const entry of [...left.cards, ...right.cards]) {
        const existing = cardByTargetUuid.get(entry.targetUuid);
        if (!existing || existing.updatedAt.localeCompare(entry.updatedAt) < 0) {
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

export function hasSyroSessionReplayReceiptEntries(receipt: SyroSessionReplayReceipt): boolean {
    return receipt.cards.length > 0 || receipt.dailyStateTargetUuids.length > 0;
}
