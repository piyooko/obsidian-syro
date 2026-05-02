import { ReviewStateCommitCoordinator } from "src/services/reviewStateCommitCoordinator";

describe("ReviewStateCommitCoordinator", () => {
    test("commits cards in overlay -> session -> cards.json order", async () => {
        const calls: string[] = [];
        const entry = {
            id: 7,
            commitId: "card-review:test-1",
            sessionCommitted: false,
            sessionOpType: "review",
        };
        const snapshot = {
            item: {
                ID: 7,
            },
        };
        const store = {
            stageReviewItemDelta: jest.fn(() => entry),
            requestFlushReviewOverlay: jest.fn(() => {
                calls.push("overlay-request");
            }),
            drainReviewOverlayFlush: jest.fn(async () => {
                calls.push("overlay-flush");
                return true;
            }),
            getPendingReviewOverlayEntry: jest.fn(() => ({ ...entry })),
            getCardSnapshot: jest.fn(() => snapshot),
            markPendingReviewSessionCommitted: jest.fn(() => {
                entry.sessionCommitted = true;
                calls.push("mark-committed");
                return true;
            }),
            clearPendingReviewEntry: jest.fn(() => true),
        };

        const coordinator = new ReviewStateCommitCoordinator({
            getStore: () => store as any,
            appendCardSnapshot: jest.fn(async () => {
                calls.push("session");
                return true;
            }),
            requestCardsSave: jest.fn(() => {
                calls.push("request-cards-save");
            }),
            flushCardsSave: jest.fn(async () => {
                calls.push("cards-save");
                return true;
            }),
        });

        coordinator.queueCardCommit(7, "review");
        const result = await coordinator.drain();

        expect(result).toBe(true);
        expect(calls).toEqual([
            "overlay-request",
            "overlay-flush",
            "session",
            "mark-committed",
            "overlay-request",
            "overlay-flush",
            "request-cards-save",
            "cards-save",
        ]);
    });

    test("does not append session before overlay flush succeeds", async () => {
        const appendCardSnapshot = jest.fn(async () => true);
        const store = {
            stageReviewItemDelta: jest.fn(() => ({
                id: 9,
                commitId: "card-review:test-2",
                sessionCommitted: false,
                sessionOpType: "review",
            })),
            requestFlushReviewOverlay: jest.fn(),
            drainReviewOverlayFlush: jest.fn(async () => false),
            getPendingReviewOverlayEntry: jest.fn(() => ({
                id: 9,
                commitId: "card-review:test-2",
                sessionCommitted: false,
                sessionOpType: "review",
            })),
            getCardSnapshot: jest.fn(() => ({
                item: { ID: 9 },
            })),
            markPendingReviewSessionCommitted: jest.fn(() => true),
            clearPendingReviewEntry: jest.fn(() => true),
        };

        const coordinator = new ReviewStateCommitCoordinator({
            getStore: () => store as any,
            appendCardSnapshot,
            requestCardsSave: jest.fn(),
            flushCardsSave: jest.fn(async () => true),
        });

        coordinator.queueCardCommit(9, "review");
        const result = await coordinator.drain(50);

        expect(result).toBe(false);
        expect(appendCardSnapshot).not.toHaveBeenCalled();
    });

    test("drain retries pending card review commits before sync import", async () => {
        const entry = {
            id: 11,
            commitId: "card-review:test-retry",
            sessionCommitted: false,
            sessionOpType: "review",
        };
        const snapshot = {
            item: {
                ID: 11,
                uuid: "card-review-uuid",
                timesReviewed: 1,
            },
        };
        let overlayFlushAttempts = 0;
        const appendCardSnapshot = jest.fn(async () => true);
        const store = {
            stageReviewItemDelta: jest.fn(() => entry),
            requestFlushReviewOverlay: jest.fn(),
            drainReviewOverlayFlush: jest.fn(async () => {
                overlayFlushAttempts += 1;
                return overlayFlushAttempts > 1;
            }),
            getPendingReviewOverlayEntry: jest.fn(() => ({ ...entry })),
            getCardSnapshot: jest.fn(() => snapshot),
            markPendingReviewSessionCommitted: jest.fn(() => {
                entry.sessionCommitted = true;
                return true;
            }),
            clearPendingReviewEntry: jest.fn(() => true),
        };

        const coordinator = new ReviewStateCommitCoordinator({
            getStore: () => store as any,
            appendCardSnapshot,
            requestCardsSave: jest.fn(),
            flushCardsSave: jest.fn(async () => true),
        });

        coordinator.queueCardCommit(11, "review");
        expect(await coordinator.drain(50)).toBe(false);
        expect(appendCardSnapshot).not.toHaveBeenCalled();

        expect(await coordinator.drain(50)).toBe(true);
        expect(appendCardSnapshot).toHaveBeenCalledWith(snapshot, "review");
        expect(store.markPendingReviewSessionCommitted).toHaveBeenCalledWith(
            11,
            "card-review:test-retry",
        );
    });
});
