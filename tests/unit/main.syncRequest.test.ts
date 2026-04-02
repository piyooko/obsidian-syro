import SRPlugin from "src/main";
import { FlashcardReviewMode } from "src/scheduling";
import { SR_TAB_VIEW } from "src/constants";

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

    test("reloadOpenReviewSessions reloads every open Syro tab view", async () => {
        const reloadA = jest.fn(async () => undefined);
        const reloadB = jest.fn(async () => undefined);
        const plugin = {
            app: {
                workspace: {
                    getLeavesOfType: jest.fn(() => [
                        { view: { reloadSession: reloadA } },
                        { view: { reloadSession: reloadB } },
                        { view: {} },
                    ]),
                },
            },
        };

        await (
            SRPlugin.prototype as unknown as { reloadOpenReviewSessions: Function }
        ).reloadOpenReviewSessions.call(plugin);

        expect(plugin.app.workspace.getLeavesOfType).toHaveBeenCalledWith(SR_TAB_VIEW);
        expect(reloadA).toHaveBeenCalledTimes(1);
        expect(reloadB).toHaveBeenCalledTimes(1);
    });

    test("consumePendingReviewSessionReloadAfterSync reloads review tabs only after a full sync", async () => {
        const plugin = {
            pendingReviewSessionReloadAfterFullSync: true,
            reloadOpenReviewSessions: jest.fn(async () => undefined),
        };

        await (
            SRPlugin.prototype as unknown as {
                consumePendingReviewSessionReloadAfterSync: Function;
            }
        ).consumePendingReviewSessionReloadAfterSync.call(plugin, "full");

        expect(plugin.reloadOpenReviewSessions).toHaveBeenCalledTimes(1);
        expect(plugin.pendingReviewSessionReloadAfterFullSync).toBe(false);
    });

    test("consumePendingReviewSessionReloadAfterSync ignores incremental syncs and waits for the queued full rebuild", async () => {
        const plugin = {
            pendingReviewSessionReloadAfterFullSync: true,
            reloadOpenReviewSessions: jest.fn(async () => undefined),
        };

        const consumePendingReviewSessionReloadAfterSync = (
            SRPlugin.prototype as unknown as {
                consumePendingReviewSessionReloadAfterSync: Function;
            }
        ).consumePendingReviewSessionReloadAfterSync;

        await consumePendingReviewSessionReloadAfterSync.call(plugin, "incremental");
        expect(plugin.reloadOpenReviewSessions).not.toHaveBeenCalled();
        expect(plugin.pendingReviewSessionReloadAfterFullSync).toBe(true);

        await consumePendingReviewSessionReloadAfterSync.call(plugin, "full");
        await consumePendingReviewSessionReloadAfterSync.call(plugin, "full");

        expect(plugin.reloadOpenReviewSessions).toHaveBeenCalledTimes(1);
        expect(plugin.pendingReviewSessionReloadAfterFullSync).toBe(false);
    });

    test("openFlashcardsInNoteReview syncs before opening the resolved deck review tab", async () => {
        const file = { path: "folder/note.md" };
        const plugin = {
            data: {
                settings: {
                    convertFoldersToDecks: true,
                    trackedNoteToDecks: false,
                },
            },
            logRuntimeDebug: jest.fn(),
            requestSync: jest.fn(async () => ({ status: "executed" })),
            createSrTFile: jest.fn((inputFile) => ({
                path: inputFile.path,
                getAllTagsFromCache: () => [],
            })),
            tabViewManager: {
                openSRTabView: jest.fn(async () => undefined),
            },
        };

        await (
            SRPlugin.prototype as unknown as { openFlashcardsInNoteReview: Function }
        ).openFlashcardsInNoteReview.call(plugin, FlashcardReviewMode.Review, file);

        expect(plugin.requestSync).toHaveBeenCalledWith({
            reviewMode: FlashcardReviewMode.Review,
            trigger: "review-entry",
        });
        expect(plugin.tabViewManager.openSRTabView).toHaveBeenCalledWith(
            FlashcardReviewMode.Review,
            { targetDeckPath: "folder/note" },
        );
    });
});
