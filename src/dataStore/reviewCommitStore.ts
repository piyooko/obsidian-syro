import { Iadapter } from "./adapter";
import { getStorePath } from "./dataLocation";
import { SRSettings } from "src/settings";
import type { TimelineReviewResponse } from "src/ui/timeline/reviewResponseTimeline";
import type { TimelineDisplayDuration } from "src/ui/timeline/timelineMessage";
import type { ReviewCommitStorePathConfig } from "./syroWorkspace";

export interface ReviewCommitLog {
    id: string;
    message: string;
    timestamp: number;
    lastEdited?: number;
    contextAnchor?: {
        textSnippet: string;
        offset: number;
    };
    scrollPercentage?: number;
    entryType?: "manual" | "review-response";
    reviewResponse?: TimelineReviewResponse;
    displayDuration?: TimelineDisplayDuration;
}

export interface ReviewCommitEditPayload {
    message: string;
    entryType: "manual" | "review-response";
    reviewResponse?: TimelineReviewResponse;
    displayDuration?: TimelineDisplayDuration;
}

export interface ReviewCommitData {
    [filePath: string]: ReviewCommitLog[];
}

export class ReviewCommitStore {
    private data: ReviewCommitData = {};
    private dataPath: string;

    constructor(settings: SRSettings, manifestDirOrPaths: string | ReviewCommitStorePathConfig) {
        if (typeof manifestDirOrPaths === "string") {
            const trackedPath = getStorePath(manifestDirOrPaths, settings);
            const lastSlash = Math.max(trackedPath.lastIndexOf("/"), trackedPath.lastIndexOf("\\"));
            const dir = lastSlash >= 0 ? trackedPath.substring(0, lastSlash + 1) : "./";
            this.dataPath = dir + "review_commits.json";
        } else {
            this.dataPath = manifestDirOrPaths.timelinePath;
        }
    }

    async load(): Promise<void> {
        try {
            const adapter = Iadapter.instance.adapter;
            if (await adapter.exists(this.dataPath)) {
                const raw = await adapter.read(this.dataPath);
                if (raw) {
                    const parsed = JSON.parse(raw) as unknown;
                    this.data =
                        typeof parsed === "object" && parsed !== null
                            ? (parsed as ReviewCommitData)
                            : {};
                }
            }
        } catch (error) {
            console.debug("[ReviewCommitStore] Load failed, using empty data:", error);
            this.data = {};
        }
    }

    async save(): Promise<void> {
        try {
            await Iadapter.instance.adapter.write(
                this.dataPath,
                JSON.stringify(this.data, null, 2),
            );
        } catch (error) {
            console.error("[ReviewCommitStore] Save failed:", error);
        }
    }

    getCommits(filePath: string): ReviewCommitLog[] {
        const commits = this.data[filePath] || [];
        return commits;
    }

    getLatestScrollPercentage(filePath: string): number | undefined {
        const commits = this.getCommits(filePath);
        for (const commit of commits) {
            if (
                typeof commit.scrollPercentage !== "number" ||
                !Number.isFinite(commit.scrollPercentage)
            ) {
                continue;
            }

            return Math.min(1, Math.max(0, commit.scrollPercentage));
        }

        return undefined;
    }

    async addCommit(
        filePath: string,
        message: string,
        contextAnchor?: { textSnippet: string; offset: number },
        scrollPercentage?: number,
        metadata?: {
            entryType?: "manual" | "review-response";
            reviewResponse?: TimelineReviewResponse;
            displayDuration?: TimelineDisplayDuration;
        },
    ): Promise<ReviewCommitLog> {
        const now = Date.now();
        const log: ReviewCommitLog = {
            id: now.toString(),
            message: message.trim(),
            timestamp: now,
            contextAnchor,
            scrollPercentage,
            entryType: metadata?.entryType ?? "manual",
            reviewResponse: metadata?.reviewResponse,
            displayDuration: metadata?.displayDuration,
        };

        if (!this.data[filePath]) {
            this.data[filePath] = [];
        }
        this.data[filePath].unshift(log);

        await this.save();
        return log;
    }

    renameFile(oldPath: string, newPath: string): void {
        if (this.data[oldPath]) {
            this.data[newPath] = this.data[oldPath];
            delete this.data[oldPath];
        }
    }

    deleteFile(filePath: string): void {
        delete this.data[filePath];
    }

    async deleteCommit(filePath: string, commitId: string): Promise<void> {
        if (!this.data[filePath]) return;
        this.data[filePath] = this.data[filePath].filter((log) => log.id !== commitId);
        if (this.data[filePath].length === 0) {
            delete this.data[filePath];
        }
        await this.save();
    }

    async editCommit(
        filePath: string,
        commitId: string,
        payload: ReviewCommitEditPayload,
    ): Promise<void> {
        if (!this.data[filePath]) return;
        const log = this.data[filePath].find((l) => l.id === commitId);
        if (log) {
            log.message = payload.message.trim();
            log.entryType = payload.entryType;
            log.reviewResponse = payload.reviewResponse;
            log.displayDuration = payload.displayDuration;
            log.lastEdited = Date.now();
            await this.save();
        }
    }
}
