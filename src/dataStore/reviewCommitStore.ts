import { Iadapter } from "./adapter";
import { getStorePath } from "./dataLocation";
import { SRSettings } from "src/settings";
import { isPathInsideFolder, renamePathPrefix } from "src/folderTracking";
import type { TimelineReviewResponse } from "src/ui/timeline/reviewResponseTimeline";
import type { TimelineDisplayDuration } from "src/ui/timeline/timelineMessage";
import type { ReviewCommitStorePathConfig } from "./syroWorkspace";
import {
    cloneSyncEntities,
    markSyncEntity,
    parseSyncEntities,
    pruneSyncEntities,
    shouldApplySyncEntity,
    type PersistedSyncEntityState,
} from "./syroSyncMeta";

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
    entryType?: ReviewCommitEntryType;
    reviewResponse?: TimelineReviewResponse;
    displayDuration?: TimelineDisplayDuration;
    extract?: ReviewTimelineExtractSnapshot;
    isExtractPreview?: boolean;
}

export type ReviewCommitEntryType = "manual" | "review-response" | "extract";

export interface ReviewTimelineExtractAnchor {
    start: number;
    end: number;
    innerStart?: number;
    innerEnd?: number;
    startLine?: number;
    endLine?: number;
    prefix?: string;
    suffix?: string;
    contentHash?: number | string;
    ordinal?: number;
    sourceLength?: number;
}

export interface ReviewTimelineExtractSnapshot {
    originUuid: string;
    quoteText: string;
    memoText: string;
    memoEditedAt?: number;
    sourcePath: string;
    sourceAnchor: ReviewTimelineExtractAnchor;
    sourceMode: "manual-ir" | "auto-slice";
    extractCreatedAt: number;
}

export interface ReviewCommitEditPayload {
    message: string;
    entryType: ReviewCommitEntryType;
    reviewResponse?: TimelineReviewResponse;
    displayDuration?: TimelineDisplayDuration;
    extract?: ReviewTimelineExtractSnapshot;
}

export interface ReviewCommitData {
    [filePath: string]: ReviewCommitLog[];
}

interface ReviewCommitStoreFile {
    version: number;
    files: ReviewCommitData;
    syncEntities?: Record<string, PersistedSyncEntityState>;
}

const REVIEW_COMMIT_STORE_VERSION = 1;

export interface TimelineFileSnapshot {
    path: string;
    commits: ReviewCommitLog[];
}

export interface RenamedTimelineFileSnapshot extends TimelineFileSnapshot {
    oldPath: string;
    newPath: string;
}

function cloneCommitLog<T extends ReviewCommitLog | ReviewCommitLog[] | undefined | null>(
    value: T,
): T {
    if (value == null) {
        return value;
    }

    return JSON.parse(JSON.stringify(value)) as T;
}

function cloneExtractSnapshot(
    extract: ReviewTimelineExtractSnapshot | undefined,
): ReviewTimelineExtractSnapshot | undefined {
    return extract ? compactExtractSnapshot(JSON.parse(JSON.stringify(extract)) as ReviewTimelineExtractSnapshot) : undefined;
}

function compactExtractQuoteText(extract: ReviewTimelineExtractSnapshot): string {
    if (extract.sourceMode !== "auto-slice") {
        return extract.quoteText;
    }

    const headingLine = String(extract.quoteText ?? "")
        .split(/\r?\n/g)
        .find((line) => /^#{1,6}\s+/.test(line.trim()));
    if (headingLine) {
        return headingLine.trim();
    }

    return (
        String(extract.quoteText ?? "")
            .split(/\r?\n/g)
            .find((line) => line.trim().length > 0)
            ?.trim() ?? ""
    );
}

function compactExtractAnchor(
    anchor: ReviewTimelineExtractAnchor,
): ReviewTimelineExtractAnchor {
    const { prefix: _prefix, suffix: _suffix, ...compactAnchor } = anchor as ReviewTimelineExtractAnchor & {
        prefix?: unknown;
        suffix?: unknown;
    };
    void _prefix;
    void _suffix;
    return compactAnchor;
}

function compactExtractSnapshot(
    extract: ReviewTimelineExtractSnapshot,
): ReviewTimelineExtractSnapshot {
    return {
        ...extract,
        quoteText: compactExtractQuoteText(extract),
        sourceAnchor: compactExtractAnchor(extract.sourceAnchor),
    };
}

function compactTimelineData(data: ReviewCommitData): ReviewCommitData {
    for (const commits of Object.values(data)) {
        for (const commit of commits) {
            if (commit.extract) {
                commit.extract = compactExtractSnapshot(commit.extract);
                if (commit.entryType === "extract") {
                    commit.message = commit.extract.memoText.trim();
                }
            }
        }
    }
    return data;
}

function renameExtractSourcePath(
    commits: ReviewCommitLog[],
    oldPath: string,
    newPath: string,
    exactOnly: boolean,
): void {
    for (const commit of commits) {
        if (!commit.extract) {
            continue;
        }

        const nextPath = exactOnly
            ? commit.extract.sourcePath === oldPath
                ? newPath
                : commit.extract.sourcePath
            : renamePathPrefix(commit.extract.sourcePath, oldPath, newPath);
        if (nextPath !== commit.extract.sourcePath) {
            commit.extract.sourcePath = nextPath;
        }
    }
}

export class ReviewCommitStore {
    public lastLoadError: string | null = null;
    private data: ReviewCommitData = {};
    private dataPath: string;
    private syncEntities: Record<string, PersistedSyncEntityState> = {};
    private syncReadOnlyReason: string | null = null;

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
        this.lastLoadError = null;
        try {
            const adapter = Iadapter.instance.adapter;
            if (await adapter.exists(this.dataPath)) {
                const raw = await adapter.read(this.dataPath);
                if (raw) {
                    const parsed = JSON.parse(raw) as unknown;
                    if (
                        typeof parsed === "object" &&
                        parsed !== null &&
                        typeof (parsed as ReviewCommitStoreFile).version === "number" &&
                        typeof (parsed as ReviewCommitStoreFile).files === "object"
                    ) {
                        const parsedFile = parsed as ReviewCommitStoreFile;
                        this.data = compactTimelineData(
                            typeof parsedFile.files === "object" && parsedFile.files !== null
                                ? parsedFile.files
                                : {},
                        );
                        this.syncEntities = parseSyncEntities(parsedFile.syncEntities);
                    } else {
                        this.data = compactTimelineData(
                            typeof parsed === "object" && parsed !== null
                                ? (parsed as ReviewCommitData)
                                : {},
                        );
                        this.syncEntities = {};
                    }
                } else {
                    this.data = {};
                    this.syncEntities = {};
                }
            } else {
                this.data = {};
                this.syncEntities = {};
            }
        } catch (error) {
            this.lastLoadError = `[ReviewCommitStore] Failed to load timeline.json: ${String(error)}`;
            console.debug("[ReviewCommitStore] Load failed, using empty data:", error);
            this.data = {};
            this.syncEntities = {};
        }
    }

    async save(): Promise<void> {
        if (this.syncReadOnlyReason) {
            return;
        }
        try {
            await Iadapter.instance.adapter.write(
                this.dataPath,
                JSON.stringify(
                    {
                        version: REVIEW_COMMIT_STORE_VERSION,
                        files: this.data,
                        syncEntities: cloneSyncEntities(this.syncEntities),
                    },
                    null,
                    2,
                ),
            );
        } catch (error) {
            console.error("[ReviewCommitStore] Save failed:", error);
        }
    }

    setReadOnly(reason: string | null): void {
        this.syncReadOnlyReason = reason;
    }

    getCommits(filePath: string): ReviewCommitLog[] {
        const commits = this.data[filePath] || [];
        return commits;
    }

    getCommit(filePath: string, commitId: string): ReviewCommitLog | null {
        return this.getCommits(filePath).find((commit) => commit.id === commitId) ?? null;
    }

    findCommitPath(commitId: string): string | null {
        if (!commitId) {
            return null;
        }

        for (const [filePath, commits] of Object.entries(this.data)) {
            if (commits.some((commit) => commit.id === commitId)) {
                return filePath;
            }
        }

        return null;
    }

    getCommitSnapshot(filePath: string, commitId: string): ReviewCommitLog | null {
        return cloneCommitLog(this.getCommit(filePath, commitId));
    }

    getCommitsSnapshot(filePath: string): ReviewCommitLog[] {
        return cloneCommitLog(this.getCommits(filePath)) ?? [];
    }

    getLatestScrollPercentage(filePath: string): number | undefined {
        const commits = this.getCommits(filePath);
        let highest: number | undefined;
        for (const commit of commits) {
            if (
                typeof commit.scrollPercentage !== "number" ||
                !Number.isFinite(commit.scrollPercentage)
            ) {
                continue;
            }

            const clamped = Math.min(1, Math.max(0, commit.scrollPercentage));
            highest = highest === undefined ? clamped : Math.max(highest, clamped);
        }

        return highest;
    }

    async addCommit(
        filePath: string,
        message: string,
        contextAnchor?: { textSnippet: string; offset: number },
        scrollPercentage?: number,
        metadata?: {
            entryType?: ReviewCommitEntryType;
            reviewResponse?: TimelineReviewResponse;
            displayDuration?: TimelineDisplayDuration;
            extract?: ReviewTimelineExtractSnapshot;
        },
    ): Promise<ReviewCommitLog> {
        const now = Date.now();
        const entryType = metadata?.entryType ?? "manual";
        const extract = cloneExtractSnapshot(metadata?.extract);
        const log: ReviewCommitLog = {
            id: now.toString(),
            message: entryType === "extract" ? (extract?.memoText ?? message).trim() : message.trim(),
            timestamp: now,
            contextAnchor,
            scrollPercentage,
            entryType,
            reviewResponse: entryType === "extract" ? undefined : metadata?.reviewResponse,
            displayDuration: entryType === "extract" ? undefined : metadata?.displayDuration,
            extract,
        };

        if (!this.data[filePath]) {
            this.data[filePath] = [];
        }
        this.data[filePath].unshift(log);

        await this.save();
        return cloneCommitLog(log);
    }

    async addExtractCommit(
        filePath: string,
        extract: ReviewTimelineExtractSnapshot,
        scrollPercentage?: number,
    ): Promise<ReviewCommitLog> {
        const clonedExtract = cloneExtractSnapshot(extract);
        const log: ReviewCommitLog = {
            id: `extract:${clonedExtract.originUuid}`,
            message: clonedExtract.memoText.trim(),
            timestamp: clonedExtract.extractCreatedAt,
            scrollPercentage,
            entryType: "extract",
            extract: clonedExtract,
        };

        if (!this.data[filePath]) {
            this.data[filePath] = [];
        }

        this.removeCommitById(log.id, filePath);
        this.data[filePath] = [log, ...(this.data[filePath] ?? [])].sort(
            (left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0),
        );

        await this.save();
        return cloneCommitLog(log);
    }

    renameFile(oldPath: string, newPath: string): boolean {
        return this.renameFileWithSnapshot(oldPath, newPath) !== null;
    }

    renameFileWithSnapshot(oldPath: string, newPath: string): RenamedTimelineFileSnapshot | null {
        if (!this.data[oldPath] || oldPath === newPath) {
            return null;
        }

        this.data[newPath] = this.data[oldPath];
        renameExtractSourcePath(this.data[newPath], oldPath, newPath, true);
        delete this.data[oldPath];

        return {
            path: newPath,
            oldPath,
            newPath,
            commits: this.getCommitsSnapshot(newPath),
        };
    }

    deleteFile(filePath: string): boolean {
        return this.deleteFileWithSnapshot(filePath) !== null;
    }

    deleteFileWithSnapshot(filePath: string): TimelineFileSnapshot | null {
        if (!this.data[filePath]) {
            return null;
        }

        const snapshot: TimelineFileSnapshot = {
            path: filePath,
            commits: this.getCommitsSnapshot(filePath),
        };
        delete this.data[filePath];
        return snapshot;
    }

    renamePathPrefixWithSnapshots(
        oldPath: string,
        newPath: string,
    ): RenamedTimelineFileSnapshot[] {
        const renamedSnapshots: RenamedTimelineFileSnapshot[] = [];
        const nextData: ReviewCommitData = {};
        let changed = false;

        for (const [filePath, commits] of Object.entries(this.data)) {
            const nextPath = renamePathPrefix(filePath, oldPath, newPath);
            renameExtractSourcePath(commits, oldPath, newPath, false);
            nextData[nextPath] = commits;
            if (nextPath === filePath) {
                continue;
            }

            changed = true;
            renamedSnapshots.push({
                path: nextPath,
                oldPath: filePath,
                newPath: nextPath,
            commits: cloneCommitLog(commits) ?? [],
            });
        }

        if (changed) {
            this.data = nextData;
        }

        return renamedSnapshots;
    }

    deletePathPrefixWithSnapshots(path: string): TimelineFileSnapshot[] {
        const removedSnapshots: TimelineFileSnapshot[] = [];

        for (const filePath of Object.keys(this.data)) {
            if (!isPathInsideFolder(path, filePath)) {
                continue;
            }

            removedSnapshots.push({
                path: filePath,
                commits: this.getCommitsSnapshot(filePath),
            });
            delete this.data[filePath];
        }

        return removedSnapshots;
    }

    upsertCommitSnapshot(filePath: string, commit: ReviewCommitLog): void {
        const clonedCommit = cloneCommitLog(commit);
        if (clonedCommit.entryType === "extract" && clonedCommit.extract) {
            clonedCommit.extract.sourcePath = filePath;
        }
        const existingPath = this.findCommitPath(commit.id);
        if (existingPath) {
            this.data[existingPath] = this.getCommits(existingPath).filter(
                (existingCommit) => existingCommit.id !== commit.id,
            );
            if (this.data[existingPath].length === 0) {
                delete this.data[existingPath];
            }
        }

        const existingAtTarget = this.getCommits(filePath).filter(
            (existingCommit) => existingCommit.id !== commit.id,
        );
        this.data[filePath] = [clonedCommit, ...existingAtTarget].sort(
            (left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0),
        );
    }

    removeCommitById(commitId: string, fallbackPath?: string): boolean {
        const existingPath = this.findCommitPath(commitId) ?? fallbackPath ?? "";
        if (!existingPath || !this.data[existingPath]) {
            return false;
        }

        this.data[existingPath] = this.data[existingPath].filter((commit) => commit.id !== commitId);
        if (this.data[existingPath].length === 0) {
            delete this.data[existingPath];
        }

        return true;
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
    ): Promise<ReviewCommitLog | null> {
        if (!this.data[filePath]) return null;
        const log = this.data[filePath].find((l) => l.id === commitId);
        if (log) {
            log.entryType = payload.entryType;
            if (payload.entryType === "extract") {
                const nextExtract = payload.extract ?? log.extract;
                const previousMemoText = log.extract?.memoText ?? "";
                const nextMemoText = nextExtract?.memoText ?? "";
                log.extract = cloneExtractSnapshot(nextExtract);
                if (log.extract && nextMemoText.trim() !== previousMemoText.trim()) {
                    log.extract.memoEditedAt = Date.now();
                }
                log.message = (log.extract?.memoText ?? payload.message).trim();
                log.reviewResponse = undefined;
                log.displayDuration = undefined;
            } else {
                log.message = payload.message.trim();
                log.extract = undefined;
                log.reviewResponse = payload.reviewResponse;
                log.displayDuration = payload.displayDuration;
            }
            log.lastEdited = Date.now();
            await this.save();
            return cloneCommitLog(log);
        }
        return null;
    }

    getSyncEntities(): Record<string, PersistedSyncEntityState> {
        return cloneSyncEntities(this.syncEntities);
    }

    shouldApplySyncEntity(targetUuid: string, updatedAt: string): boolean {
        return shouldApplySyncEntity(this.syncEntities, targetUuid, updatedAt);
    }

    markSyncEntity(input: {
        targetUuid: string;
        updatedAt: string;
        deleted: boolean;
        entityType: string;
        pathHint?: string;
    }): boolean {
        return markSyncEntity(this.syncEntities, input);
    }

    pruneSyncEntities(retentionMs: number): boolean {
        return pruneSyncEntities(this.syncEntities, retentionMs);
    }
}
