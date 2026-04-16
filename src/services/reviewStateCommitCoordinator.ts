import type { DataStore, TrackedCardSnapshot } from "src/dataStore/data";
import {
    createPendingOverlayCommitId,
    type PendingReviewItemEntry,
} from "src/dataStore/pendingOverlayStore";

const CARD_COMMIT_RETRY_DELAYS_MS = [200, 1000, 3000];

type LogFn = (...args: unknown[]) => void;

interface PendingCardCommitTask {
    itemId: number;
    commitId: string;
    opType: string;
    sessionAppended: boolean;
    attempts: number;
}

interface ReviewStateCommitCoordinatorOptions {
    getStore: () => DataStore | null;
    appendCardSnapshot: (snapshot: TrackedCardSnapshot, opType: string) => Promise<boolean>;
    requestCardsSave: (delayMs?: number) => void;
    flushCardsSave: (timeoutMs?: number) => Promise<boolean>;
    shouldLogDebug?: () => boolean;
    logDebug?: LogFn;
}

export class ReviewStateCommitCoordinator {
    private readonly pendingCardCommits = new Map<number, PendingCardCommitTask>();
    private cardFlushPromise: Promise<boolean> | null = null;
    private cardRetryTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly getStore: () => DataStore | null;
    private readonly appendCardSnapshot: (
        snapshot: TrackedCardSnapshot,
        opType: string,
    ) => Promise<boolean>;
    private readonly requestCardsSave: (delayMs?: number) => void;
    private readonly flushCardsSave: (timeoutMs?: number) => Promise<boolean>;
    private readonly shouldLogDebug: () => boolean;
    private readonly logDebug: LogFn;

    constructor(options: ReviewStateCommitCoordinatorOptions) {
        this.getStore = options.getStore;
        this.appendCardSnapshot = options.appendCardSnapshot;
        this.requestCardsSave = options.requestCardsSave;
        this.flushCardsSave = options.flushCardsSave;
        this.shouldLogDebug = options.shouldLogDebug ?? (() => false);
        this.logDebug = options.logDebug ?? (() => undefined);
    }

    private debug(...args: unknown[]): void {
        if (this.shouldLogDebug()) {
            this.logDebug(...args);
        }
    }

    private clearRetryTimer(): void {
        if (this.cardRetryTimer !== null) {
            clearTimeout(this.cardRetryTimer);
            this.cardRetryTimer = null;
        }
    }

    private scheduleRetry(delayMs: number): void {
        if (this.cardRetryTimer !== null || this.cardFlushPromise !== null) {
            return;
        }

        this.cardRetryTimer = setTimeout(() => {
            this.cardRetryTimer = null;
            void this.ensureCardFlush();
        }, delayMs);
    }

    private getCurrentTask(task: PendingCardCommitTask): PendingCardCommitTask | null {
        const currentTask = this.pendingCardCommits.get(task.itemId);
        if (!currentTask || currentTask.commitId !== task.commitId) {
            return null;
        }
        return currentTask;
    }

    private async flushPendingCardCommits(): Promise<boolean> {
        while (this.pendingCardCommits.size > 0) {
            const [, task] = this.pendingCardCommits.entries().next().value as [
                number,
                PendingCardCommitTask,
            ];
            const store = this.getStore();
            if (!store) {
                return false;
            }

            const currentEntry = store.getPendingReviewOverlayEntry(task.itemId);
            if (!currentEntry || currentEntry.commitId !== task.commitId) {
                this.pendingCardCommits.delete(task.itemId);
                continue;
            }

            if (!task.sessionAppended) {
                const overlayFlushed = await store.drainReviewOverlayFlush();
                if (!overlayFlushed) {
                    task.attempts += 1;
                    this.debug("[SR-PendingOverlay] cardsReview session deferred", {
                        itemId: task.itemId,
                        commitId: task.commitId,
                        reason: "overlay-flush-timeout",
                    });
                    this.scheduleRetry(
                        CARD_COMMIT_RETRY_DELAYS_MS[
                            Math.min(task.attempts - 1, CARD_COMMIT_RETRY_DELAYS_MS.length - 1)
                        ],
                    );
                    return false;
                }

                const snapshot = store.getCardSnapshot(task.itemId);
                if (!snapshot) {
                    store.clearPendingReviewEntry(task.itemId, task.commitId);
                    this.pendingCardCommits.delete(task.itemId);
                    continue;
                }

                const appended = await this.appendCardSnapshot(snapshot, task.opType);
                if (!appended) {
                    task.attempts += 1;
                    this.debug("[SR-PendingOverlay] cardsReview session deferred", {
                        itemId: task.itemId,
                        commitId: task.commitId,
                        reason: "session-append-failed",
                    });
                    this.scheduleRetry(
                        CARD_COMMIT_RETRY_DELAYS_MS[
                            Math.min(task.attempts - 1, CARD_COMMIT_RETRY_DELAYS_MS.length - 1)
                        ],
                    );
                    return false;
                }

                const stillCurrentTask = this.getCurrentTask(task);
                if (!stillCurrentTask) {
                    continue;
                }
                stillCurrentTask.sessionAppended = true;
            }

            const stillCurrentTask = this.getCurrentTask(task);
            if (!stillCurrentTask) {
                continue;
            }

            if (!store.markPendingReviewSessionCommitted(task.itemId, task.commitId)) {
                this.pendingCardCommits.delete(task.itemId);
                continue;
            }
            store.requestFlushReviewOverlay();
            const committedOverlayFlushed = await store.drainReviewOverlayFlush();
            if (!committedOverlayFlushed) {
                stillCurrentTask.attempts += 1;
                this.debug("[SR-PendingOverlay] cardsReview commit state deferred", {
                    itemId: task.itemId,
                    commitId: task.commitId,
                    reason: "overlay-commit-mark-timeout",
                });
                this.scheduleRetry(
                    CARD_COMMIT_RETRY_DELAYS_MS[
                        Math.min(
                            stillCurrentTask.attempts - 1,
                            CARD_COMMIT_RETRY_DELAYS_MS.length - 1,
                        )
                    ],
                );
                return false;
            }

            this.pendingCardCommits.delete(task.itemId);
            this.requestCardsSave(1200);
            this.debug("[SR-PendingOverlay] cardsReview session committed", {
                itemId: task.itemId,
                commitId: task.commitId,
                opType: task.opType,
            });
        }

        return true;
    }

    private async ensureCardFlush(): Promise<boolean> {
        if (this.cardFlushPromise !== null) {
            return this.cardFlushPromise;
        }

        this.cardFlushPromise = (async () => {
            try {
                return await this.flushPendingCardCommits();
            } finally {
                this.cardFlushPromise = null;
                if (this.pendingCardCommits.size > 0 && this.cardRetryTimer === null) {
                    this.scheduleRetry(0);
                }
            }
        })();

        return this.cardFlushPromise;
    }

    queueCardCommit(itemId: number, opType: string): string | null {
        const store = this.getStore();
        if (!store) {
            return null;
        }

        const commitId = createPendingOverlayCommitId("card-review");
        const entry = store.stageReviewItemDelta(itemId, {
            commitId,
            sessionCommitted: false,
            sessionOpType: opType,
        });
        if (!entry) {
            return null;
        }

        store.requestFlushReviewOverlay();
        this.pendingCardCommits.set(itemId, {
            itemId,
            commitId: entry.commitId,
            opType,
            sessionAppended: false,
            attempts: 0,
        });
        this.debug("[SR-PendingOverlay] cardsReview staged", {
            itemId,
            commitId: entry.commitId,
            opType,
        });
        this.scheduleRetry(0);
        return entry.commitId;
    }

    restorePendingEntry(entry: PendingReviewItemEntry): void {
        if (entry.sessionCommitted === true) {
            return;
        }
        this.pendingCardCommits.set(entry.id, {
            itemId: entry.id,
            commitId: entry.commitId,
            opType: entry.sessionOpType ?? "upsert",
            sessionAppended: false,
            attempts: 0,
        });
        this.debug("[SR-PendingOverlay] cardsReview restored", {
            itemId: entry.id,
            commitId: entry.commitId,
            opType: entry.sessionOpType ?? "upsert",
        });
        this.scheduleRetry(0);
    }

    hasPendingWork(): boolean {
        return (
            this.pendingCardCommits.size > 0 ||
            this.cardFlushPromise !== null ||
            this.cardRetryTimer !== null
        );
    }

    async drain(timeoutMs = 1500): Promise<boolean> {
        this.clearRetryTimer();
        const flushPromise = this.ensureCardFlush();
        const cardsCommitted = await Promise.race([
            flushPromise,
            new Promise<boolean>((resolve) => {
                setTimeout(() => resolve(false), timeoutMs);
            }),
        ]);

        if (!cardsCommitted) {
            if (this.pendingCardCommits.size > 0 && this.cardRetryTimer === null) {
                this.scheduleRetry(0);
            }
            return false;
        }

        return this.flushCardsSave(timeoutMs);
    }
}
