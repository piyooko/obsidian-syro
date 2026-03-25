import SRPlugin from "src/main";
import { FlashcardReviewMode } from "src/scheduling";

describe("SRPlugin sync request orchestration", () => {
    test("requestSync queues a rebuild instead of dropping it while a sync is running", async () => {
        const plugin = {
            data: { settings: { showSchedulingDebugMessages: false } },
            shouldSkipDisabledAutomaticIncrementalSync: jest.fn(() => false),
            shouldSkipAutomaticSync: jest.fn(() => false),
            syncLock: true,
            queueSyncRequest: jest.fn((request) => request),
            sync: jest.fn(async () => undefined),
        };

        const result = await (SRPlugin.prototype.requestSync as unknown as Function).call(plugin, {
            reviewMode: FlashcardReviewMode.Review,
            mode: "full",
            trigger: "manual",
        });

        expect(plugin.queueSyncRequest).toHaveBeenCalledWith({
            reviewMode: FlashcardReviewMode.Review,
            mode: "full",
            trigger: "manual",
            force: false,
        });
        expect(plugin.sync).not.toHaveBeenCalled();
        expect(result).toEqual({
            reviewMode: FlashcardReviewMode.Review,
            mode: "full",
            trigger: "manual",
            force: false,
            status: "queued",
            reason: "busy",
        });
    });

    test("replayQueuedSyncRequest reissues the pending request with force enabled", () => {
        const pendingRequest = {
            reviewMode: FlashcardReviewMode.Review,
            mode: "full" as const,
            trigger: "manual" as const,
            force: false,
        };
        const plugin = {
            takePendingSyncRequest: jest.fn(() => pendingRequest),
            logRuntimeDebug: jest.fn(),
            requestSync: jest.fn(() => Promise.resolve({ status: "executed" })),
            runAsync: jest.fn(),
        };

        (
            SRPlugin.prototype as unknown as { replayQueuedSyncRequest: Function }
        ).replayQueuedSyncRequest.call(plugin);

        expect(plugin.requestSync).toHaveBeenCalledWith({
            ...pendingRequest,
            force: true,
        });
        expect(plugin.runAsync).toHaveBeenCalledTimes(1);
    });
});
