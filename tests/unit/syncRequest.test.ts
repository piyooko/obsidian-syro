import { FlashcardReviewMode } from "src/scheduling";
import {
    getSyncRequestPriority,
    mergeQueuedSyncRequest,
    normalizeSyncRequest,
} from "src/syncRequest";

test("normalizeSyncRequest applies the manual incremental defaults", () => {
    expect(normalizeSyncRequest()).toEqual({
        reviewMode: FlashcardReviewMode.Review,
        mode: "incremental",
        trigger: "manual",
        force: false,
    });
});

test("queued sync requests prefer a full manual rebuild over lower priority requests", () => {
    const backgroundIncremental = normalizeSyncRequest({
        trigger: "background",
        mode: "incremental",
    });
    const manualIncremental = normalizeSyncRequest({
        trigger: "manual",
        mode: "incremental",
    });
    const manualFull = normalizeSyncRequest({
        trigger: "manual",
        mode: "full",
    });

    expect(getSyncRequestPriority(backgroundIncremental)).toBeLessThan(
        getSyncRequestPriority(manualIncremental),
    );
    expect(getSyncRequestPriority(manualIncremental)).toBeLessThan(
        getSyncRequestPriority(manualFull),
    );
    expect(mergeQueuedSyncRequest(backgroundIncremental, manualIncremental)).toEqual(
        manualIncremental,
    );
    expect(mergeQueuedSyncRequest(manualIncremental, manualFull)).toEqual(manualFull);
    expect(mergeQueuedSyncRequest(manualFull, backgroundIncremental)).toEqual(manualFull);
});
