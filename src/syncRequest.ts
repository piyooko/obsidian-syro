import { FlashcardReviewMode } from "./scheduling";

export type SyncMode = "incremental" | "full";
export type SyncTrigger =
    | "manual"
    | "startup"
    | "review-entry"
    | "background"
    | "file-event"
    | "remote-poll";

export interface SyncRequestOptions {
    reviewMode?: FlashcardReviewMode;
    mode?: SyncMode;
    trigger?: SyncTrigger;
    force?: boolean;
}

export interface NormalizedSyncRequest {
    reviewMode: FlashcardReviewMode;
    mode: SyncMode;
    trigger: SyncTrigger;
    force: boolean;
}

export type SyncRequestStatus = "executed" | "queued" | "skipped";
export type SyncSkipReason = "auto-sync-disabled" | "cooldown";

export interface SyncRequestResult extends NormalizedSyncRequest {
    status: SyncRequestStatus;
    reason?: SyncSkipReason | "busy";
}

export function normalizeSyncRequest(options: SyncRequestOptions = {}): NormalizedSyncRequest {
    return {
        reviewMode: options.reviewMode ?? FlashcardReviewMode.Review,
        mode: options.mode ?? "incremental",
        trigger: options.trigger ?? "manual",
        force: options.force ?? false,
    };
}

export function getSyncRequestPriority(request: NormalizedSyncRequest): number {
    let priority = request.mode === "full" ? 100 : 0;

    if (request.trigger === "manual") {
        priority += 10;
    } else if (request.trigger === "review-entry") {
        priority += 5;
    }

    if (request.force) {
        priority += 1;
    }

    return priority;
}

export function mergeQueuedSyncRequest(
    current: NormalizedSyncRequest | null,
    incoming: NormalizedSyncRequest,
): NormalizedSyncRequest {
    if (!current) {
        return incoming;
    }

    return getSyncRequestPriority(incoming) >= getSyncRequestPriority(current) ? incoming : current;
}
