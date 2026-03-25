import { Notice } from "obsidian";
import { Question } from "src/Question";
import { t } from "src/lang/helpers";
import { SRSettings } from "src/settings";

const NOTE_WRITE_RETRY_DELAYS_MS = [200, 1000, 3000];

interface PendingQuestionWrite {
    question: Question;
    settings: SRSettings;
}

interface PendingNoteWriteBucket {
    notePath: string;
    writes: Map<string, PendingQuestionWrite>;
    attempts: number;
}

type LogFn = (...args: unknown[]) => void;

export class ReviewPersistenceCoordinator {
    private readonly pendingNoteWrites = new Map<string, PendingNoteWriteBucket>();
    private noteFlushPromise: Promise<boolean> | null = null;
    private noteRetryTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly shouldLogDebug: () => boolean;
    private readonly logDebug: LogFn;
    private noteFailureNotified = false;

    constructor(options?: { shouldLogDebug?: () => boolean; logDebug?: LogFn }) {
        this.shouldLogDebug = options?.shouldLogDebug ?? (() => false);
        this.logDebug = options?.logDebug ?? (() => undefined);
    }

    private debug(...args: unknown[]) {
        if (this.shouldLogDebug()) {
            this.logDebug(...args);
        }
    }

    private clearRetryTimer(): void {
        if (this.noteRetryTimer !== null) {
            clearTimeout(this.noteRetryTimer);
            this.noteRetryTimer = null;
        }
    }

    private getQuestionWriteKey(question: Question): string {
        return `${question.lineNo}:${question.questionText.textHash}`;
    }

    queueQuestionWrite(question: Question, settings: SRSettings): void {
        const notePath = question.note?.file?.path;
        if (!notePath) {
            return;
        }

        const bucket = this.pendingNoteWrites.get(notePath) ?? {
            notePath,
            writes: new Map<string, PendingQuestionWrite>(),
            attempts: 0,
        };
        bucket.writes.set(this.getQuestionWriteKey(question), { question, settings });
        bucket.attempts = 0;
        this.pendingNoteWrites.set(notePath, bucket);

        this.debug("[SR-Persist] queued note write", notePath, bucket.writes.size);
        this.scheduleNoteFlush(0);
    }

    private scheduleNoteFlush(delayMs: number): void {
        if (this.noteFlushPromise !== null) {
            return;
        }

        this.clearRetryTimer();
        this.noteRetryTimer = setTimeout(() => {
            this.noteRetryTimer = null;
            void this.ensureNoteFlush();
        }, delayMs);
    }

    private async writeNoteBucket(
        bucket: PendingNoteWriteBucket,
    ): Promise<
        Array<{ key: string; question: Question; replacementText: string; settings: SRSettings }>
    > {
        const writesSnapshot = Array.from(bucket.writes.entries());
        const firstWrite = writesSnapshot[0]?.[1];
        if (!firstWrite) {
            return [];
        }

        const noteFile = firstWrite.question.note.file;
        const originalFileText = await noteFile.read();
        let nextFileText = originalFileText;
        const commits: Array<{
            key: string;
            question: Question;
            replacementText: string;
            settings: SRSettings;
        }> = [];

        for (const [key, { question, settings }] of writesSnapshot) {
            const prepared = question.prepareQuestionTextUpdate(nextFileText, settings);
            if (!prepared.didReplace) {
                throw new Error(
                    `Question text no longer matches note contents: ${bucket.notePath}`,
                );
            }

            nextFileText = prepared.newText;
            commits.push({
                key,
                question,
                replacementText: prepared.replacementText,
                settings,
            });
        }

        if (nextFileText !== originalFileText) {
            await noteFile.write(nextFileText);
        }

        return commits;
    }

    private async flushPendingNoteWrites(): Promise<boolean> {
        while (this.pendingNoteWrites.size > 0) {
            const [notePath, bucket] = this.pendingNoteWrites.entries().next().value as [
                string,
                PendingNoteWriteBucket,
            ];

            try {
                const commits = await this.writeNoteBucket(bucket);

                const currentBucket = this.pendingNoteWrites.get(notePath);
                if (currentBucket === bucket) {
                    commits.forEach(({ key }) => {
                        currentBucket.writes.delete(key);
                    });
                    if (currentBucket.writes.size === 0) {
                        this.pendingNoteWrites.delete(notePath);
                    } else {
                        currentBucket.attempts = 0;
                    }
                }

                commits.forEach(({ question, replacementText, settings }) => {
                    question.commitPreparedQuestionTextUpdate(replacementText, settings);
                });

                this.noteFailureNotified = false;
                this.debug("[SR-Persist] note write flushed", notePath);
                continue;
            } catch (error) {
                const currentBucket = this.pendingNoteWrites.get(notePath);
                if (currentBucket === bucket) {
                    currentBucket.attempts += 1;
                }

                this.debug("[SR-Persist] note write flush failed", notePath, error);
                if (!this.noteFailureNotified) {
                    this.noteFailureNotified = true;
                    new Notice(t("DATA_NOTE_SAVE_PENDING"));
                }

                const attempt = currentBucket?.attempts ?? bucket.attempts;
                const delayMs =
                    NOTE_WRITE_RETRY_DELAYS_MS[
                        Math.min(attempt - 1, NOTE_WRITE_RETRY_DELAYS_MS.length - 1)
                    ] ?? NOTE_WRITE_RETRY_DELAYS_MS[NOTE_WRITE_RETRY_DELAYS_MS.length - 1];
                this.scheduleNoteFlush(delayMs);
                return false;
            }
        }

        return true;
    }

    private async ensureNoteFlush(): Promise<boolean> {
        if (this.noteFlushPromise !== null) {
            return this.noteFlushPromise;
        }

        this.noteFlushPromise = (async () => {
            try {
                return await this.flushPendingNoteWrites();
            } finally {
                this.noteFlushPromise = null;
                if (this.pendingNoteWrites.size > 0 && this.noteRetryTimer === null) {
                    this.scheduleNoteFlush(0);
                }
            }
        })();

        return this.noteFlushPromise;
    }

    async drain(timeoutMs = 1500): Promise<boolean> {
        this.clearRetryTimer();
        const flushPromise = this.ensureNoteFlush();
        const timedResult = await Promise.race([
            flushPromise,
            new Promise<boolean>((resolve) => {
                setTimeout(() => resolve(false), timeoutMs);
            }),
        ]);

        if (!timedResult && this.pendingNoteWrites.size > 0 && this.noteRetryTimer === null) {
            this.scheduleNoteFlush(0);
        }

        return timedResult && this.pendingNoteWrites.size === 0;
    }
}
