import { MiscUtils, debug } from "src/util/utils_recall";
import { FsrsSettings, SRSettings } from "../settings";
import SRPlugin from "src/main";

import { TFile, TFolder } from "obsidian";

import { FsrsData } from "src/algorithms/fsrs";
import { WeightedMultiplierAlgorithm } from "src/algorithms/weightedMultiplier";
import { FsrsAlgorithm } from "src/algorithms/fsrs";

import { getStorePath } from "src/dataStore/dataLocation";
import { isPathInsideFolder, renamePathPrefix } from "src/folderTracking";
import { Tags } from "src/tags";
import { SrsAlgorithm } from "src/algorithms/algorithms";
import { TrackedFile, TrackedItem } from "./trackedFile";
import { RPITEMTYPE, RepetitionItem, ReviewResult, CardQueue } from "./repetitionItem";
import { DEFAULT_QUEUE_DATA, Queue } from "./queue";
import { Iadapter } from "./adapter";
import type { CardsStorePathConfig } from "./syroWorkspace";
import { t } from "src/lang/helpers";
import { createEmptyCard } from "ts-fsrs";
import { getArrayProp, getNumberProp, isRecord, parseJsonUnknown } from "src/util/typeGuards";
import {
    cloneSyncEntities,
    markSyncEntity,
    parseSyncEntities,
    pruneSyncEntities,
    shouldApplySyncEntity,
    type PersistedSyncEntityState,
} from "./syroSyncMeta";

/**
 * SrsData.
 */
export interface SrsData {
    /**
     * @type {Queue}
     */
    queues: Queue;

    /**
     * @type {ReviewedCounts}
     */
    reviewedCounts: ReviewedCounts;
    /**
     * @type {ReviewedCounts}
     */
    reviewedCardCounts: ReviewedCounts;
    /**
     * @type {RepetitionItem[]}
     */
    items: RepetitionItem[];
    trackedFiles: Record<string, TrackedFile>;
    fileOrder: string[];
    syncEntities: Record<string, PersistedSyncEntityState>;

    /**
     * @type {number}
     */
    mtime: number;
}

export type ReviewedCounts = Record<string, { new: number; due: number }>;

export function generateFileID(): string {
    return "f_" + Math.random().toString(36).substring(2, 8);
}

export const DEFAULT_SRS_DATA: SrsData = {
    queues: Object.assign({}, DEFAULT_QUEUE_DATA) as Queue,
    reviewedCounts: {},
    reviewedCardCounts: {},
    items: [],
    trackedFiles: {},
    fileOrder: [],
    syncEntities: {},
    mtime: 0,
};

const REVIEW_ITEM_OVERLAY_VERSION = 1;

interface ReviewItemDelta {
    id: number;
    nextReview: number;
    learningStep: number | null;
    queue: CardQueue;
    timesReviewed: number;
    timesCorrect: number;
    errorStreak: number;
    data: unknown;
}

interface ReviewItemOverlayFile {
    version: number;
    baseMtime: number;
    items: ReviewItemDelta[];
}

export interface TrackedCardSnapshot {
    path: string;
    trackedFileUuid: string;
    trackedFileTags: string[];
    trackedItem: TrackedItem | null;
    item: RepetitionItem;
}

export interface TrackedCardsFileSnapshot {
    uuid: string;
    path: string;
    tags: string[];
    items: Record<string, number>;
    trackedItems: TrackedItem[];
    relatedItems: RepetitionItem[];
}

export interface RenamedTrackedCardsFileSnapshot {
    oldPath: string;
    newPath: string;
    file: TrackedCardsFileSnapshot;
}

type LegacyFileIndexItem = RepetitionItem & {
    fileIndex?: string | number;
    fileID?: string;
};

function cloneRepetitionItem(item: RepetitionItem | null | undefined): RepetitionItem | null {
    if (!item) {
        return null;
    }

    const cloned = parseJsonUnknown(JSON.stringify(item)) as RepetitionItem;
    return RepetitionItem.create(cloned);
}

function cloneTrackedItem(item: TrackedItem | null | undefined): TrackedItem | null {
    if (!item) {
        return null;
    }

    return new TrackedItem(
        item.fingerprint,
        item.lineNo,
        item.context,
        item.cardType,
        { ...item.span },
        item.clozeId,
        item.reviewId,
    );
}

/**
 * DataStore.
 */
export class DataStore {
    static instance: DataStore;
    public lastLoadError: string | null = null;

    /**
     * @type {SrsData}
     */
    data: SrsData;
    /**
     * @type {SRPlugin}
     */
    // plugin: SRPlugin;
    settings: SRSettings;
    // manifestDir: string;
    /**
     * @type {string}
     */
    dataPath: string;
    private reviewOverlayPath: string;
    private auxiliaryDataDir: string;
    private saveSuppressionCount: number = 0;
    private saveRequestedWhileSuppressed: boolean = false;
    private itemByIdIndex: Map<number, RepetitionItem> = new Map();
    private itemByIdIndexDirty = true;
    private reviewItemOverlayById: Map<number, ReviewItemDelta> = new Map();
    private reviewItemOverlayVersion = 0;
    private persistedReviewOverlayVersion = 0;
    private reviewOverlayFlushPromise: Promise<"success" | "stale" | "failed"> | null = null;
    private reviewOverlayRetryTimer: ReturnType<typeof setTimeout> | null = null;
    private reviewOverlayFailureNotified = false;
    private syncReadOnlyReason: string | null = null;

    private getAlgorithmForItemType(itemType: RPITEMTYPE): SrsAlgorithm {
        const plugin = SRPlugin.getInstance();
        if (plugin) {
            return plugin.getAlgorithmForItem(itemType);
        }

        return itemType === RPITEMTYPE.CARD
            ? new FsrsAlgorithm()
            : new WeightedMultiplierAlgorithm();
    }

    public static getInstance(): DataStore {
        if (!DataStore.instance) {
            // DataStore.instance = new DataStore();
            throw Error("there is not DataStore instance.");
        }
        return DataStore.instance;
    }

    /**
     *
     * @param settings
     * @param manifestDir
     */
    constructor(settings: SRSettings, manifestDirOrPaths: string | CardsStorePathConfig) {
        // this.plugin = plugin;
        this.settings = settings;
        // this.manifestDir = manifestDir;
        if (typeof manifestDirOrPaths === "string") {
            this.dataPath = getStorePath(manifestDirOrPaths, settings);
            this.reviewOverlayPath = this.deriveReviewOverlayPath(this.dataPath);
            this.auxiliaryDataDir = this.getParentDir(this.dataPath);
        } else {
            this.dataPath = manifestDirOrPaths.cardsPath;
            this.reviewOverlayPath =
                manifestDirOrPaths.cardsOverlayPath ??
                this.deriveReviewOverlayPath(manifestDirOrPaths.cardsPath);
            this.auxiliaryDataDir =
                manifestDirOrPaths.auxiliaryDataDir ??
                this.getParentDir(manifestDirOrPaths.cardsPath);
        }
        DataStore.instance = this;
    }

    private getParentDir(path: string): string {
        const sepIdx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
        return sepIdx >= 0 ? path.substring(0, sepIdx + 1) : "";
    }

    private joinWithParent(parentDir: string, fileName: string): string {
        if (!parentDir) return fileName;
        if (parentDir.endsWith("/") || parentDir.endsWith("\\")) {
            return `${parentDir}${fileName}`;
        }
        return `${parentDir}/${fileName}`;
    }

    private shouldLogDebug(): boolean {
        return this.settings.showSchedulingDebugMessages;
    }

    private isTestEnv(): boolean {
        return typeof process !== "undefined" && process.env?.NODE_ENV === "test";
    }

    private logInfo(...args: unknown[]): void {
        if (this.shouldLogDebug()) {
            console.debug(...args);
        }
    }

    private logDebug(...args: unknown[]): void {
        if (this.shouldLogDebug()) {
            console.debug(...args);
        }
    }

    private logError(...args: unknown[]): void {
        if (!this.isTestEnv()) {
            console.error(...args);
        }
    }

    private markItemByIdIndexDirty() {
        this.itemByIdIndexDirty = true;
    }

    private rebuildItemByIdIndex() {
        this.itemByIdIndex.clear();
        const items = this.data?.items ?? [];
        for (const item of items) {
            if (item != null && typeof item.ID === "number" && item.ID >= 0) {
                this.itemByIdIndex.set(item.ID, item);
            }
        }
        this.itemByIdIndexDirty = false;
    }

    private ensureItemByIdIndex() {
        if (this.itemByIdIndexDirty) {
            this.rebuildItemByIdIndex();
        }
    }

    private deriveReviewOverlayPath(path = this.dataPath): string {
        if (!path) return "tracked_files.review_overlay.json";
        const sepIdx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
        const dir = sepIdx >= 0 ? path.substring(0, sepIdx + 1) : "";
        const fileName = sepIdx >= 0 ? path.substring(sepIdx + 1) : path;
        const dotIdx = fileName.lastIndexOf(".");
        const baseName = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
        return `${dir}${baseName}.review_overlay.json`;
    }

    private getReviewOverlayPath(path = this.dataPath): string {
        if (path === this.dataPath && this.reviewOverlayPath) {
            return this.reviewOverlayPath;
        }

        return this.deriveReviewOverlayPath(path);
    }

    public getAuxiliaryPath(fileName: string): string {
        return this.joinWithParent(this.auxiliaryDataDir, fileName);
    }

    private createReviewItemDelta(item: RepetitionItem): ReviewItemDelta {
        let serializedData: unknown = null;
        try {
            serializedData = JSON.parse(JSON.stringify(item.data ?? null));
        } catch {
            serializedData = null;
        }
        return {
            id: item.ID,
            nextReview: item.nextReview,
            learningStep: item.learningStep ?? null,
            queue: item.queue,
            timesReviewed: item.timesReviewed,
            timesCorrect: item.timesCorrect,
            errorStreak: item.errorStreak,
            data: serializedData,
        };
    }

    private markReviewOverlayDirty(): void {
        this.reviewItemOverlayVersion += 1;
    }

    private clearReviewOverlayRetryTimer(): void {
        if (this.reviewOverlayRetryTimer !== null) {
            clearTimeout(this.reviewOverlayRetryTimer);
            this.reviewOverlayRetryTimer = null;
        }
    }

    private async loadReviewOverlayFromDisk(
        path = this.dataPath,
    ): Promise<ReviewItemOverlayFile | null> {
        try {
            const adapter = Iadapter.instance.adapter;
            const overlayPath = this.getReviewOverlayPath(path);
            if (!(await adapter.exists(overlayPath))) return null;
            const raw = await adapter.read(overlayPath);
            if (!raw) return null;
            const parsed = parseJsonUnknown(raw);
            if (!isRecord(parsed)) {
                this.lastLoadError =
                    this.lastLoadError ?? "[SR-Overlay] Invalid cards review overlay payload.";
                return null;
            }

            const version = getNumberProp(parsed, "version");
            const items = getArrayProp(parsed, "items");
            if (version !== REVIEW_ITEM_OVERLAY_VERSION || !items) {
                this.lastLoadError =
                    this.lastLoadError ?? "[SR-Overlay] Invalid cards review overlay schema.";
                return null;
            }
            return parsed as unknown as ReviewItemOverlayFile;
        } catch (error) {
            this.lastLoadError =
                this.lastLoadError ??
                `[SR-Overlay] Failed to load review overlay: ${String(error)}`;
            console.warn("[SR-Overlay] Failed to load review overlay:", error);
            return null;
        }
    }

    private applyReviewOverlayToData(overlay: ReviewItemOverlayFile): number {
        const itemById = new Map<number, RepetitionItem>();
        for (const item of this.data.items ?? []) {
            if (item && typeof item.ID === "number") {
                itemById.set(item.ID, item);
            }
        }

        let applied = 0;
        for (const delta of overlay.items) {
            const target = itemById.get(delta.id);
            if (!target) continue;
            target.nextReview = delta.nextReview;
            target.learningStep = delta.learningStep ?? null;
            target.queue = delta.queue;
            target.timesReviewed = delta.timesReviewed;
            target.timesCorrect = delta.timesCorrect;
            target.errorStreak = delta.errorStreak;
            target.data = delta.data;
            applied++;
        }
        return applied;
    }

    private async writeReviewOverlayToDisk(
        path = this.dataPath,
        items: ReviewItemDelta[] = Array.from(this.reviewItemOverlayById.values()),
    ): Promise<void> {
        const adapter = Iadapter.instance.adapter;
        const overlayPath = this.getReviewOverlayPath(path);
        if (items.length === 0) {
            if (await adapter.exists(overlayPath)) {
                await adapter.remove(overlayPath);
            }
            return;
        }

        const payload: ReviewItemOverlayFile = {
            version: REVIEW_ITEM_OVERLAY_VERSION,
            baseMtime: this.data?.mtime ?? 0,
            items,
        };
        await adapter.write(overlayPath, JSON.stringify(payload));
    }

    private async clearReviewOverlayFromDisk(path = this.dataPath): Promise<void> {
        try {
            const adapter = Iadapter.instance.adapter;
            const overlayPath = this.getReviewOverlayPath(path);
            if (await adapter.exists(overlayPath)) {
                await adapter.remove(overlayPath);
            }
        } catch (error) {
            console.warn("[SR-Overlay] Failed to clear review overlay:", error);
        }
    }

    stageReviewItemDelta(itemOrId: RepetitionItem | number | null | undefined): void {
        const item = typeof itemOrId === "number" ? this.getItembyID(itemOrId) : itemOrId;
        if (!item || item.ID < 0) return;
        this.reviewItemOverlayById.set(item.ID, this.createReviewItemDelta(item));
        this.markReviewOverlayDirty();
    }

    private async flushReviewOverlayOnce(
        path = this.dataPath,
    ): Promise<"success" | "stale" | "failed"> {
        const versionToPersist = this.reviewItemOverlayVersion;
        const snapshot = Array.from(this.reviewItemOverlayById.values());

        try {
            await this.writeReviewOverlayToDisk(path, snapshot);
            this.persistedReviewOverlayVersion = versionToPersist;
            this.reviewOverlayFailureNotified = false;
            return versionToPersist === this.reviewItemOverlayVersion ? "success" : "stale";
        } catch (error) {
            console.warn("[SR-Overlay] Failed to write review overlay:", error);
            return "failed";
        }
    }

    requestFlushReviewOverlay(path = this.dataPath, attempt = 0): void {
        if (this.reviewOverlayFlushPromise !== null) {
            return;
        }

        this.clearReviewOverlayRetryTimer();
        this.reviewOverlayFlushPromise = (async () => {
            const outcome = await this.flushReviewOverlayOnce(path);
            this.reviewOverlayFlushPromise = null;

            if (outcome === "success") {
                return outcome;
            }

            if (this.reviewItemOverlayVersion <= this.persistedReviewOverlayVersion) {
                return "success";
            }

            if (outcome === "stale") {
                this.requestFlushReviewOverlay(path, 0);
                return outcome;
            }

            if (
                attempt >= 2 &&
                !this.reviewOverlayFailureNotified &&
                this.reviewItemOverlayVersion > this.persistedReviewOverlayVersion
            ) {
                this.reviewOverlayFailureNotified = true;
                MiscUtils.notice(t("DATA_UNABLE_TO_SAVE"));
            }

            const retryDelays = [200, 1000, 3000];
            const delayMs = retryDelays[Math.min(attempt, retryDelays.length - 1)];
            this.reviewOverlayRetryTimer = setTimeout(() => {
                this.reviewOverlayRetryTimer = null;
                this.requestFlushReviewOverlay(path, attempt + 1);
            }, delayMs);
            return outcome;
        })();
    }

    async drainReviewOverlayFlush(timeoutMs = 1500, path = this.dataPath): Promise<boolean> {
        this.clearReviewOverlayRetryTimer();
        this.requestFlushReviewOverlay(path, 0);

        const waitForFlush = async (): Promise<boolean> => {
            for (
                let flushPromise = this.reviewOverlayFlushPromise;
                flushPromise !== null;
                flushPromise = this.reviewOverlayFlushPromise
            ) {
                await flushPromise;
            }
            return this.reviewItemOverlayVersion <= this.persistedReviewOverlayVersion;
        };

        const result = await Promise.race([
            waitForFlush(),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
        ]);

        if (
            !result &&
            this.reviewItemOverlayVersion > this.persistedReviewOverlayVersion &&
            this.reviewOverlayRetryTimer === null
        ) {
            this.requestFlushReviewOverlay(path, 0);
        }

        return result;
    }

    async saveReviewItemDelta(itemOrId: RepetitionItem | number | null | undefined): Promise<void> {
        this.stageReviewItemDelta(itemOrId);
        this.requestFlushReviewOverlay();
        await this.drainReviewOverlayFlush();
    }

    toInstances() {
        if (Array.isArray(this.data.trackedFiles)) {
            const oldFiles = this.data.trackedFiles as unknown as TrackedFile[];
            const newFiles: Record<string, TrackedFile> = {};
            const fileOrder: string[] = [];
            const indexToID = new Map<number, string>();

            for (let i = 0; i < oldFiles.length; i++) {
                if (oldFiles[i] == null) continue;
                const fileID = generateFileID();
                newFiles[fileID] = TrackedFile.create(oldFiles[i]);
                fileOrder.push(fileID);
                indexToID.set(i, fileID);
            }

            for (const item of this.data.items) {
                if (item == null) continue;
                const legacyItem = item as LegacyFileIndexItem;
                const oldIndex = legacyItem.fileIndex;
                const normalizedOldIndex =
                    typeof oldIndex === "number" ? oldIndex : Number(oldIndex);
                if (oldIndex !== undefined) {
                    legacyItem.fileID = Number.isNaN(normalizedOldIndex)
                        ? ""
                        : indexToID.get(normalizedOldIndex) || "";
                    delete legacyItem.fileIndex;
                }
            }

            this.data.trackedFiles = newFiles;
            this.data.fileOrder = fileOrder;
            this.logInfo(
                `[SR] Data migration completed: ${oldFiles.length} -> ${fileOrder.length} files`,
            );
        } else {
            for (const fileID in this.data.trackedFiles) {
                this.data.trackedFiles[fileID] = TrackedFile.create(this.data.trackedFiles[fileID]);
            }
            if (!this.data.fileOrder) {
                this.data.fileOrder = Object.keys(this.data.trackedFiles);
            }
        }
        // 1. Cleanup fileOrder: remove ghost IDs that don't exist in trackedFiles
        this.data.fileOrder = (this.data.fileOrder || []).filter((id) => {
            if (this.data.trackedFiles[id]) return true;
            this.logInfo(`[SR-Cleanup] Removed ghost fileID from fileOrder: ${id}`);
            return false;
        });

        const items: RepetitionItem[] = [];
        for (const item of this.data.items) {
            if (!item) continue;

            // 2. Filter out items with missing or invalid fileID
            if (!item.fileID || !this.data.trackedFiles[item.fileID]) {
                this.logInfo(
                    `[SR-Cleanup] Removed corrupted item (ID:${item.ID}, fileID:'${item.fileID}') - File not tracked.`,
                );
                continue;
            }

            const newItem = RepetitionItem.create(item);
            items.push(newItem);
        }
        this.data.items = items;
        this.data.queues = Queue.create(this.data.queues);
        this.rebuildItemByIdIndex();
        this.migrateCardItemsToFsrs();
        this.logDebug(
            `[SR-Debug] toInstances complete. Final items count: ${this.data.items.length}`,
        );
    }

    private migrateCardItemsToFsrs() {
        let migratedCount = 0;
        for (const item of this.data.items) {
            if (item == null) continue;
            if (item.itemType !== RPITEMTYPE.CARD) continue;
            if (item.isFsrs) continue;

            if (item.timesReviewed === 0) {
                item.data = createEmptyCard();
                migratedCount++;
            } else {
                console.warn(
                    "[SR] migrateCardItemsToFsrs: CARD item",
                    item.ID,
                    "has reviews but data is not FSRS format",
                );
            }
        }
        if (migratedCount > 0) {
            this.logInfo(
                `[SR] migrateCardItemsToFsrs: migrated ${migratedCount} new cards to FSRS format`,
            );
        }
    }

    public cleanDirtyNewItems() {
        let cleanedCount = 0;
        for (const item of this.data.items) {
            if (item == null) continue;
            if (item.timesReviewed === 0) {
                let needsClean = false;

                if (item.nextReview !== 0 || item.learningStep !== null) {
                    needsClean = true;
                } else if (item.isFsrs) {
                    const data = item.data as FsrsData;
                    if (data && Number(data.state) !== 0) needsClean = true;
                } else if (item.itemType === RPITEMTYPE.NOTE) {
                    const data = item.data as { currentInterval?: number };
                    if (data && Number(data.currentInterval ?? 1) !== 1) {
                        needsClean = true;
                    }
                }

                if (needsClean) {
                    item.nextReview = 0;
                    item.learningStep = null;
                    item.queue = CardQueue.New;

                    item.data = this.getAlgorithmForItemType(item.itemType).defaultData();
                    cleanedCount++;
                }
            }
        }
        if (cleanedCount > 0) {
            this.logInfo(
                `[SR-DataClean] Cleaned ${cleanedCount} new items with dirty state/nextReview`,
            );
        }
    }

    /**
     * load.
     */
    async load(path = this.dataPath) {
        this.lastLoadError = null;
        try {
            const adapter = Iadapter.instance.adapter;
            let overlayMerged = false;

            if (await adapter.exists(path)) {
                const data = await adapter.read(path);
                if (data == null) {
                    this.logError("Unable to read SRS data!");
                    this.data = Object.assign({}, DEFAULT_SRS_DATA);
                } else {
                    const parsed = parseJsonUnknown(data);
                    const parsedData = isRecord(parsed) ? (parsed as Partial<SrsData>) : null;
                    if (!parsedData) {
                        throw new Error("Invalid cards.json payload");
                    }
                    this.data = Object.assign(Object.assign({}, DEFAULT_SRS_DATA), parsedData);
                    this.data.syncEntities = parseSyncEntities(parsedData?.syncEntities);
                    this.logDebug(
                        "[SR-Debug] Data loaded from disk. Items in JSON:",
                        parsedData && Array.isArray(parsedData.items) ? parsedData.items.length : 0,
                    );
                    this.data.mtime = await this.getmtime();
                    const overlay = await this.loadReviewOverlayFromDisk(path);
                    if (overlay) {
                        const applied = this.applyReviewOverlayToData(overlay);
                        if (applied > 0) {
                            this.logInfo(
                                `[SR-Overlay] Applied ${applied} review deltas from overlay.`,
                            );
                        }
                        await this.save(path);
                        overlayMerged = true;
                    }
                }
            } else {
                this.logInfo("Tracked files not found! Creating new file...");
                this.data = Object.assign({}, DEFAULT_SRS_DATA);
                await this.save();
            }
            if (overlayMerged) {
                this.reviewItemOverlayById.clear();
                this.reviewItemOverlayVersion = 0;
                this.persistedReviewOverlayVersion = 0;
            }
        } catch (error) {
            this.lastLoadError = `[SR-Data] Failed to load cards.json: ${String(error)}`;
            this.logError("Error loading data", error);
            this.data = Object.assign({}, DEFAULT_SRS_DATA);
        } finally {
            this.toInstances();
        }
    }

    setReadOnly(reason: string | null): void {
        this.syncReadOnlyReason = reason;
    }

    /**
     * re load if tracked_files.json updated by other device.
     */
    async reLoad() {
        // const now: Date = new Date().getTime();
        const mtime = await this.getmtime();
        if (mtime - this.data.mtime > 10) {
            this.logDebug("reload newer tracked_files.json: ", mtime, mtime - this.data.mtime);
            await this.load();
        }
    }
    setdataPath(path = this.dataPath, options: Partial<CardsStorePathConfig> = {}) {
        this.dataPath = path;
        this.reviewOverlayPath = options.cardsOverlayPath ?? this.deriveReviewOverlayPath(path);
        this.auxiliaryDataDir = options.auxiliaryDataDir ?? this.getParentDir(path);
        this.reviewItemOverlayById.clear();
        this.reviewItemOverlayVersion = 0;
        this.persistedReviewOverlayVersion = 0;
        this.clearReviewOverlayRetryTimer();
    }
    suspendSaves(): () => void {
        this.saveSuppressionCount += 1;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.saveSuppressionCount = Math.max(0, this.saveSuppressionCount - 1);
        };
    }
    async flushSaveIfNeeded(path = this.dataPath) {
        if (this.saveSuppressionCount > 0) return;
        if (!this.saveRequestedWhileSuppressed) return;
        this.saveRequestedWhileSuppressed = false;
        await this.save(path);
    }
    /**
     * save.
     */
    async save(path = this.dataPath) {
        if (this.syncReadOnlyReason) {
            this.logError("[SR-Readonly] Skip cards save:", this.syncReadOnlyReason);
            return;
        }
        if (this.saveSuppressionCount > 0) {
            this.saveRequestedWhileSuppressed = true;
            return;
        }
        try {
            this.clearReviewOverlayRetryTimer();
            for (
                let flushPromise = this.reviewOverlayFlushPromise;
                flushPromise !== null;
                flushPromise = this.reviewOverlayFlushPromise
            ) {
                await flushPromise;
                this.clearReviewOverlayRetryTimer();
            }
            await Iadapter.instance.adapter.write(path, JSON.stringify(this.data));
            this.data.mtime = await this.getmtime();
            this.reviewItemOverlayById.clear();
            this.reviewItemOverlayVersion = 0;
            this.persistedReviewOverlayVersion = 0;
            this.reviewOverlayFailureNotified = false;
            await this.clearReviewOverlayFromDisk(path);
        } catch (error) {
            MiscUtils.notice(t("DATA_UNABLE_TO_SAVE"));
            this.logError("Unable to save data", error);
            return;
        }
    }

    /**
     * get file modified time. should only set to data.mtime when load.
     * @param path
     * @returns
     */
    async getmtime(path = this.dataPath) {
        const adapter = Iadapter.instance.adapter;
        const stat = await adapter.stat(path.normalize());
        if (stat != null) {
            return stat.mtime;
        } else {
            return 0;
        }
    }

    /**
     * Returns total number of items tracked by the SRS.
     * @returns {number}
     */
    get itemSize(): number {
        return this.data.items.length;
    }
    /**
     * Returns all items tracked by the SRS.
     * @returns {RepetitionItem}
     */
    get items(): RepetitionItem[] {
        return this.data.items;
    }

    getFileID(path: string): string {
        for (const [fileID, tf] of Object.entries(this.data.trackedFiles)) {
            if (tf != null && tf.path === path) {
                return fileID;
            }
        }
        return "";
    }

    getFileIndex(path: string): number {
        return this.getFileID(path) !== "" ? 0 : -1;
    }

    getTrackedFile(path: string): TrackedFile {
        const fileID = this.getFileID(path);
        if (fileID === "") {
            return null;
        }
        return this.data.trackedFiles[fileID];
    }

    /**
     * Returns whether or not the given file path is tracked by the SRS.
     * @param {string} path
     * @returns {boolean}
     */
    isInTrackedFiles(path: string): boolean {
        return this.getFileID(path) !== "";
    }

    /**
     * Returns whether or not the given file path is tracked by the SRS.
     * work for cards query.
     * @param {string} path
     * @returns {boolean}
     */
    isTrackedCardfile(path: string): boolean {
        return this.getTrackedFile(path)?.hasCards ?? false;
    }

    isCardItem(id: number) {
        const item = this.getItembyID(id);
        if (!item || !item.fileID) return false;
        const file = this.getFileByID(item.fileID);
        if (!file) return false;
        return file.items.file !== id;
    }

    /**
     * Returns when the given item is reviewed next (in hours).
     */
    /**
     * nextReview.
     *
     * @param {number} itemId
     * @returns {number}
     */
    nextReview(itemId: number): number {
        const item = this.getItembyID(itemId);
        if (item == null) {
            return -1;
        }

        const now: Date = new Date();
        return (item.nextReview - now.getTime()) / (1000 * 60 * 60);
    }

    getItembyID(id: number): RepetitionItem {
        if (id < 0) return null;
        this.ensureItemByIdIndex();
        return this.itemByIdIndex.get(id) ?? null;
    }

    getFileByID(fileID: string): TrackedFile {
        return this.data.trackedFiles[fileID];
    }

    getFileByIndex(_idx: number): TrackedFile {
        console.warn("[SR] getFileByIndex is deprecated, use getFileByID instead");
        return null;
    }

    /**
     * getItemsOfFile.
     * @param {string} path
     * @returns {RepetitionItem[]}
     */
    getItemsOfFile(path: string): RepetitionItem[] {
        const file = this.getTrackedFile(path);
        return file?.tags?.length > 0 ? this.getItems(file.itemIDs) : [];
    }
    getItems = (ids: number[]): RepetitionItem[] => {
        return ids.map((id) => this.getItembyID(id));
    };
    getNoteItem(path: string): RepetitionItem {
        const tkFile = this.getTrackedFile(path);
        return tkFile ? this.getItembyID(tkFile.items.file) : null;
    }

    /**
     * getNext. RepetitionItem
     *
     * @returns {RepetitionItem | null}
     */
    getNext(key?: string): RepetitionItem | null {
        const id = this.data.queues.getNextId(key);
        if (id != null) {
            return this.getItembyID(id);
        }

        return null;
    }

    /**
     * getFilePath.
     *
     * @param {RepetitionItem} item
     * @returns {string | null}
     */
    getFilePath(item: RepetitionItem): string | null {
        const trackedFile = this.data.trackedFiles[item.fileID];

        return trackedFile?.path ?? null;
    }

    getCardSnapshot(itemId: number): TrackedCardSnapshot | null {
        const item = this.getItembyID(itemId);
        if (!item?.fileID) {
            return null;
        }

        const trackedFile = this.getFileByID(item.fileID);
        const clonedItem = cloneRepetitionItem(item);
        if (!trackedFile || !clonedItem) {
            return null;
        }

        const trackedItem =
            item.itemType === RPITEMTYPE.CARD
                ? (trackedFile.trackedItems ?? []).find((candidate) => candidate.reviewId === itemId) ??
                  null
                : null;

        return {
            path: trackedFile.path,
            trackedFileUuid: trackedFile.uuid,
            trackedFileTags: [...(trackedFile.tags ?? [])],
            trackedItem: cloneTrackedItem(trackedItem),
            item: clonedItem,
        };
    }

    getTrackedFileSnapshot(path: string): TrackedCardsFileSnapshot | null {
        const trackedFile = this.getTrackedFile(path);
        if (!trackedFile) {
            return null;
        }

        return {
            uuid: trackedFile.uuid,
            path: trackedFile.path,
            tags: [...(trackedFile.tags ?? [])],
            items: { ...(trackedFile.items ?? {}) },
            trackedItems: (trackedFile.trackedItems ?? [])
                .map((item) => cloneTrackedItem(item))
                .filter((item): item is TrackedItem => item !== null),
            relatedItems: trackedFile.itemIDs
                .map((id) => cloneRepetitionItem(this.getItembyID(id)))
                .filter((item): item is RepetitionItem => item !== null),
        };
    }

    findFileIdByUuid(uuid: string): string {
        if (!uuid) {
            return "";
        }

        for (const [fileID, trackedFile] of Object.entries(this.data.trackedFiles)) {
            if (trackedFile?.uuid === uuid) {
                return fileID;
            }
        }

        return "";
    }

    findItemByUuid(uuid: string): RepetitionItem | null {
        if (!uuid) {
            return null;
        }

        return this.data.items.find((item) => item?.uuid === uuid) ?? null;
    }

    upsertCardSnapshot(snapshot: TrackedCardSnapshot): void {
        const { fileID, trackedFile } = this.ensureTrackedFileRecord({
            uuid: snapshot.trackedFileUuid,
            path: snapshot.path,
            tags: snapshot.trackedFileTags,
        });
        const localItemId = this.upsertClonedItem(snapshot.item, fileID);

        trackedFile.path = snapshot.path;
        trackedFile.tags = [...snapshot.trackedFileTags];
        trackedFile.items = trackedFile.items ?? { file: -1 };
        if (snapshot.item.itemType === RPITEMTYPE.NOTE) {
            trackedFile.items.file = localItemId;
            return;
        }

        const nextTrackedItems = (trackedFile.trackedItems ?? []).filter(
            (item) => item.reviewId !== localItemId,
        );
        const nextTrackedItem = snapshot.trackedItem ? cloneTrackedItem(snapshot.trackedItem) : null;
        if (nextTrackedItem) {
            nextTrackedItem.reviewId = localItemId;
            nextTrackedItems.push(nextTrackedItem);
        }
        trackedFile.trackedItems = nextTrackedItems;
    }

    renameTrackedFileFromSnapshot(snapshot: TrackedCardsFileSnapshot): void {
        const fileIDByUuid = this.findFileIdByUuid(snapshot.uuid);
        if (fileIDByUuid) {
            const trackedFile = this.data.trackedFiles[fileIDByUuid];
            trackedFile.path = snapshot.path;
            trackedFile.tags = [...snapshot.tags];
            return;
        }

        this.bootstrapTrackedFileFromSnapshot(snapshot);
    }

    removeCardByUuid(uuid: string, fallbackPath?: string): boolean {
        const item = this.findItemByUuid(uuid);
        if (!item) {
            return false;
        }

        const trackedFile = item.fileID ? this.getFileByID(item.fileID) : null;
        this.unTrackItem(item.ID);
        if (trackedFile?.trackedItems) {
            trackedFile.trackedItems = trackedFile.trackedItems.filter(
                (trackedItem) => trackedItem.reviewId !== item.ID,
            );
        }
        return true;
    }

    removeTrackedFileByUuid(uuid: string, fallbackPath?: string): boolean {
        const fileID = this.findFileIdByUuid(uuid) || (fallbackPath ? this.getFileID(fallbackPath) : "");
        if (!fileID || !this.data.trackedFiles[fileID]) {
            return false;
        }

        const trackedFile = this.data.trackedFiles[fileID];
        for (const itemId of trackedFile.itemIDs) {
            this.unTrackItem(itemId);
        }
        delete this.data.trackedFiles[fileID];
        this.data.fileOrder = (this.data.fileOrder ?? []).filter((existingId) => existingId !== fileID);
        return true;
    }

    renamePathPrefixWithSnapshots(
        oldPath: string,
        newPath: string,
    ): RenamedTrackedCardsFileSnapshot[] {
        const renamedSnapshots: RenamedTrackedCardsFileSnapshot[] = [];

        for (const trackedFile of Object.values(this.data.trackedFiles)) {
            if (!trackedFile?.path) {
                continue;
            }

            const nextPath = renamePathPrefix(trackedFile.path, oldPath, newPath);
            if (nextPath === trackedFile.path) {
                continue;
            }

            const previousPath = trackedFile.path;
            trackedFile.rename(nextPath);
            const snapshot = this.getTrackedFileSnapshot(nextPath);
            if (!snapshot) {
                continue;
            }

            renamedSnapshots.push({
                oldPath: previousPath,
                newPath: nextPath,
                file: snapshot,
            });
        }

        return renamedSnapshots;
    }

    private bootstrapTrackedFileFromSnapshot(snapshot: TrackedCardsFileSnapshot): void {
        const { fileID, trackedFile } = this.ensureTrackedFileRecord({
            uuid: snapshot.uuid,
            path: snapshot.path,
            tags: snapshot.tags,
        });
        const localIdsByRemoteId = new Map<number, number>();
        const nextItems: Record<string, number> = { file: -1 };

        for (const relatedItem of snapshot.relatedItems) {
            const localItemId = this.upsertClonedItem(relatedItem, fileID);
            localIdsByRemoteId.set(relatedItem.ID, localItemId);
            if (relatedItem.itemType === RPITEMTYPE.NOTE) {
                nextItems.file = localItemId;
            }
        }

        trackedFile.items = nextItems;
        trackedFile.trackedItems = (snapshot.trackedItems ?? []).map((trackedItem) => {
            const cloned = cloneTrackedItem(trackedItem) ?? trackedItem;
            cloned.reviewId = localIdsByRemoteId.get(trackedItem.reviewId) ?? -1;
            return cloned;
        });
    }

    private ensureTrackedFileRecord(input: {
        uuid: string;
        path: string;
        tags: string[];
    }): { fileID: string; trackedFile: TrackedFile } {
        const existingFileId = this.findFileIdByUuid(input.uuid) || this.getFileID(input.path);
        if (existingFileId) {
            const trackedFile = this.data.trackedFiles[existingFileId];
            trackedFile.uuid = input.uuid;
            trackedFile.path = input.path;
            trackedFile.tags = [...input.tags];
            if (!Array.isArray(trackedFile.trackedItems)) {
                trackedFile.trackedItems = [];
            }
            trackedFile.items = trackedFile.items ?? { file: -1 };
            return {
                fileID: existingFileId,
                trackedFile,
            };
        }

        const fileID = generateFileID();
        const trackedFile = TrackedFile.create({
            uuid: input.uuid,
            path: input.path,
            items: { file: -1 },
            trackedItems: [],
            tags: [...input.tags],
        });
        this.data.trackedFiles[fileID] = trackedFile;
        this.data.fileOrder = this.data.fileOrder ?? [];
        this.data.fileOrder.push(fileID);
        return {
            fileID,
            trackedFile,
        };
    }

    private upsertClonedItem(snapshot: RepetitionItem, fileID: string): number {
        const clonedItem = cloneRepetitionItem(snapshot);
        if (!clonedItem) {
            return -1;
        }

        const existingItem = this.findItemByUuid(clonedItem.uuid);
        const targetId = existingItem?.ID ?? this.maxItemId + 1;
        clonedItem.ID = targetId;
        clonedItem.fileID = fileID;

        if (existingItem) {
            Object.assign(existingItem, clonedItem);
            this.data.queues.remove(existingItem);
        } else {
            this.data.items.push(clonedItem);
        }

        this.reviewItemOverlayById.delete(targetId);
        this.markReviewOverlayDirty();
        this.markItemByIdIndexDirty();
        return targetId;
    }

    untrackPathPrefixWithSnapshots(pathPrefix: string): TrackedCardsFileSnapshot[] {
        const removedSnapshots: TrackedCardsFileSnapshot[] = [];
        const trackedPaths = Object.values(this.data.trackedFiles)
            .map((trackedFile) => trackedFile?.path)
            .filter((path): path is string => typeof path === "string" && path.length > 0)
            .filter((path) => isPathInsideFolder(pathPrefix, path));

        for (const trackedPath of trackedPaths) {
            const snapshot = this.getTrackedFileSnapshot(trackedPath);
            if (!snapshot) {
                continue;
            }

            this.untrackFile(trackedPath, false);
            removedSnapshots.push(snapshot);
        }

        return removedSnapshots;
    }

    getReviewedCounts() {
        return this.data.reviewedCounts;
    }
    getReviewedCardCounts(): ReviewedCounts {
        return this.data.reviewedCardCounts;
    }

    getSyncEntities(): Record<string, PersistedSyncEntityState> {
        return cloneSyncEntities(this.data.syncEntities);
    }

    shouldApplySyncEntity(targetUuid: string, updatedAt: string): boolean {
        return shouldApplySyncEntity(this.data.syncEntities, targetUuid, updatedAt);
    }

    markSyncEntity(input: {
        targetUuid: string;
        updatedAt: string;
        deleted: boolean;
        entityType: string;
        pathHint?: string;
    }): boolean {
        return markSyncEntity(this.data.syncEntities, input);
    }

    pruneSyncEntities(retentionMs: number): boolean {
        return pruneSyncEntities(this.data.syncEntities, retentionMs);
    }

    /**
     * reviewId.
     * update data according to response opt
     * @param {number} itemId
     * @param {string} option
     */
    reviewId(
        itemId: number,
        option: string | number,
        cardFsrsSettings?: FsrsSettings,
    ): ReviewResult | null {
        const item = this.getItembyID(itemId);
        let result: ReviewResult;
        if (item == null) {
            return null;
        }

        // [fix] select algorithm by item type: CARD -> FSRS, NOTE -> WMS
        const algorithm = this.getAlgorithmForItemType(item.itemType);
        if (item.itemType === RPITEMTYPE.CARD && cardFsrsSettings) {
            algorithm.updateSettings(cardFsrsSettings);
        }
        if (typeof option === "number") {
            option = algorithm.srsOptions()[option];
        }
        if (this.data.queues.isInRepeatQueue(itemId)) {
            result = algorithm.onSelection(item, option, true);
        } else {
            result = algorithm.onSelection(item, option, false);
            item.reviewUpdate(result);
        }
        this.data.queues.updateWhenReview(item, result.correct, this.settings.repeatItems);
        if (item.timesReviewed < 1) {
            debug("save review data error when reviewId");
        }
        return result;
    }

    /**
     * untrackFilesInFolderPath.
     *
     * @param {string} path
     * @param {boolean} recursive
     */
    untrackFilesInFolderPath(path: string, recursive?: boolean) {
        const folder = Iadapter.instance.vault.getAbstractFileByPath(path);
        if (folder instanceof TFolder) {
            this.untrackFilesInFolder(folder, recursive);
        }
    }

    /**
     * untrackFilesInFolder.
     *
     * @param {TFolder} folder
     * @param {boolean} recursive
     */
    untrackFilesInFolder(folder: TFolder, recursive?: boolean) {
        let firstCalled = false;
        if (recursive == null) {
            recursive = true;
            firstCalled = true;
        }

        let totalRemoved = 0;
        folder.children.forEach((child) => {
            if (child instanceof TFolder) {
                if (recursive) {
                    totalRemoved += this.untrackFilesInFolder(child, recursive);
                }
            } else if (child instanceof TFile) {
                const tkFile = this.getTrackedFile(child.path);
                if (tkFile && tkFile.tags.includes(RPITEMTYPE.NOTE)) {
                    const removed = this.untrackFile(child.path, false);
                    totalRemoved += removed;
                }
            }
        });
        if (firstCalled) {
            const msg = t("DATA_FOLDER_UNTRACKED", {
                folderPath: folder.path,
                totalRemoved: totalRemoved,
            });
            MiscUtils.notice(msg);
        }
        return totalRemoved;
    }

    /**
     * trackFilesInFolderPath.
     *
     * @param {string} path
     * @param {boolean} recursive
     */
    trackFilesInFolderPath(path: string, recursive?: boolean) {
        const folder = Iadapter.instance.vault.getAbstractFileByPath(path);
        if (folder instanceof TFolder) {
            this.trackFilesInFolder(folder, recursive);
        }
    }

    /**
     * trackFilesInFolder.
     *
     * @param {TFolder} folder
     * @param {boolean} recursive
     */
    trackFilesInFolder(folder: TFolder, recursive?: boolean) {
        if (recursive == null) recursive = true;

        let totalAdded = 0;
        let totalRemoved = 0;
        folder.children.forEach((child) => {
            if (child instanceof TFolder) {
                if (recursive) {
                    this.trackFilesInFolder(child, recursive);
                }
            } else if (child instanceof TFile && child.extension === "md") {
                const tkFile = this.getTrackedFile(child.path);
                if (!tkFile || !tkFile.tags.includes(RPITEMTYPE.NOTE)) {
                    const { added, removed } = this.trackFile(child.path, RPITEMTYPE.NOTE, false);
                    totalAdded += added;
                    totalRemoved += removed;
                }
            }
        });

        MiscUtils.notice(
            t("DATA_ADDED_REMOVED_ITEMS", { totalAdded: totalAdded, totalRemoved: totalRemoved }),
        );
    }

    /**
     * trackFile.
     *
     * @param {string} path
     * @param {string} type? "default" , "card"
     * @param {boolean} notice
     * @returns {{ added: number; removed: number } | null}
     */
    trackFile(
        path: string,
        type?: RPITEMTYPE | string,
        notice?: boolean,
    ): { added: number; removed: number } | null {
        const isType = Object.values(RPITEMTYPE).includes(type as RPITEMTYPE);
        const itemtype = isType ? (type as RPITEMTYPE) : RPITEMTYPE.NOTE;
        const dname = !isType ? type : undefined;
        const trackedFile = new TrackedFile(path, itemtype, dname);

        const existingID = this.getFileID(path);
        if (existingID === "") {
            const newID = generateFileID();
            this.data.trackedFiles[newID] = trackedFile;
            if (!this.data.fileOrder) this.data.fileOrder = [];
            this.data.fileOrder.push(newID);
        } else {
            const tkfile = this.data.trackedFiles[existingID];
            if (!tkfile.tags.includes(RPITEMTYPE.NOTE)) {
                tkfile.setTracked(itemtype, dname);
            }
        }
        const data = this.updateItems(path, itemtype, dname, notice);
        // this.plugin.updateStatusBar();
        return data;
    }

    /**
     * untrackFile.
     *
     * @param {string} path
     * @param {boolean} notice
     * @returns {number}
     */
    untrackFile(path: string, notice?: boolean): number {
        if (notice == null) notice = true;

        const fileID = this.getFileID(path);

        if (fileID === "") {
            return 0;
        }

        const trackedFile = this.getTrackedFile(path);
        const abstractFile = Iadapter.instance.vault.getAbstractFileByPath(path);
        const note = abstractFile instanceof TFile ? abstractFile : null;
        if (note != null && trackedFile) {
            const deckname = Tags.getNoteDeckName(note, this.settings);
            if (deckname !== null) {
                // || cardName !== null
                // it's taged file, can't untrack by this.
                this.logDebug(path + " is taged file, can't untrack by this.");
                MiscUtils.notice(t("DATA_TAGGED_FILE_CANT_UNTRACK"));
                return 0;
            }
        }

        let numItems = 0;
        const lastTag = trackedFile.tags[trackedFile.tags.length - 1]; // Fallback for lastTag usage
        trackedFile.setUnTracked();

        for (const key in trackedFile.items) {
            const id = trackedFile.items[key];
            if (id >= 0) {
                this.unTrackItem(id);
                numItems++;
            }
        }
        trackedFile.items = { file: -1 };

        if (trackedFile.hasCards) {
            const allCardIds = trackedFile.itemIDs;
            allCardIds
                .filter((id: number) => id >= 0)
                .forEach((id: number) => this.unTrackItem(id));
            numItems += allCardIds.length;

            trackedFile.trackedItems = [];
        }

        let nulrstr: string = "";
        // this.data.trackedFiles[index] = null;
        if (note == null) {
            nulrstr = ", because it not exist.";
        } else if (
            this.settings.tagsToReview.includes(lastTag) &&
            this.settings.untrackWithReviewTag
        ) {
            nulrstr = ", because you have delete the reviewTag in note.";
        }
        // this.save();         // will be used when plugin.sync_Algo(), which shouldn't
        // this.plugin.updateStatusBar();

        if (notice) {
            MiscUtils.notice(t("DATA_UNTRACKED_ITEMS", { numItems: numItems, nulrstr: nulrstr }));
        }

        return numItems;
    }

    unTrackItem(id: number) {
        const item = this.getItembyID(id);
        if (item == null) {
            this.reviewItemOverlayById.delete(id);
            this.markReviewOverlayDirty();
            return;
        }
        this.data.queues.remove(item);
        item.setUntracked();
        this.reviewItemOverlayById.delete(id);
        this.markReviewOverlayDirty();
    }

    get maxItemId() {
        return Math.max(
            ...this.data.items.map((item: RepetitionItem) => {
                return item ? item.ID : 0;
            }),
            this.data.items.length - 1,
        );
    }

    _updateItem(id: number = null, fileID: string, itemType: RPITEMTYPE, deckName: string): number {
        if (id !== null && id !== undefined && id < 0) return;
        let item: RepetitionItem;

        // [fix] select algorithm by item type: CARD -> FSRS, NOTE -> WMS
        const algorithm = this.getAlgorithmForItemType(itemType);

        const newItem = new RepetitionItem(id, fileID, itemType, deckName, algorithm.defaultData());

        if (id == undefined) {
            newItem.ID = this.maxItemId + 1;
            this.data.items.push(newItem);
            if (!this.itemByIdIndexDirty) {
                this.itemByIdIndex.set(newItem.ID, newItem);
            }
        } else {
            item = this.getItembyID(id);
            if (item != null) {
                item.setTracked(fileID);
                item.itemType = itemType;
                item.data = Object.assign(algorithm.defaultData(), item.data);
            } else {
                this.data.items.push(newItem);
                if (!this.itemByIdIndexDirty) {
                    this.itemByIdIndex.set(newItem.ID, newItem);
                }
            }
        }

        return newItem.ID;

        // console.debug(`update items[${id}]:`, newItem);
    }

    /**
     * updateItems.
     *
     * @param {string} path
     * @param {string} type? RPITEMTYPE
     * @param {string} dname? "default" , deckName
     * @param {boolean} notice
     * @returns {{ added: number; removed: number } | null}
     */
    updateItems(
        path: string,
        type: RPITEMTYPE,
        dname: string,
        notice?: boolean,
    ): { added: number; removed: number } | null {
        if (notice == null) notice = true;

        const fileID = this.getFileID(path);
        if (fileID === "") {
            this.logDebug("Attempt to update untracked file: " + path);
            return;
        }
        const trackedFile = this.data.trackedFiles[fileID];

        let added = 0;
        let removed = 0;

        const newItems: Record<string, number> = {};
        const existingFileItem =
            "file" in trackedFile.items ? this.getItembyID(trackedFile.items.file) : null;
        if (existingFileItem != null) {
            newItems["file"] = trackedFile.items["file"];
            existingFileItem.setTracked(fileID);
        } else if (type === RPITEMTYPE.NOTE) {
            const ID = this._updateItem(undefined, fileID, type, dname);
            newItems["file"] = ID;
            added += 1;
        } else {
            newItems["file"] = -1;
        }

        for (const key in trackedFile.items) {
            if (!(key in newItems)) {
                const itemInd = trackedFile.items[key];
                this.unTrackItem(itemInd);
                removed += 1;
            }
        }
        trackedFile.items = newItems;
        // this.save();     // will be used when plugin.sync_Algo(), which shouldn't

        if (notice) {
            MiscUtils.notice(
                t("DATA_ADDED_REMOVED_ITEMS_SHORT", { added: added, removed: removed }),
            );
        }
        return { added, removed };
    }

    updateCardItems(
        trackedFile: TrackedFile,
        trackedItem: import("./trackedFile").TrackedItem,
        deckName: string,
        notice?: boolean,
    ): { added: number; removed: number } {
        if (notice == null) notice = false;
        const fileID = this.getFileID(trackedFile.path);

        let added = 0;
        const removed = 0;

        if (trackedItem.reviewId === -1) {
            const cardId = this._updateItem(undefined, fileID, RPITEMTYPE.CARD, deckName);
            trackedItem.reviewId = cardId;
            added++;
        } else {
            const item = this.getItembyID(trackedItem.reviewId);
            if (item) {
                item.setTracked(fileID);
                item.updateDeckName(deckName, true);
            } else {
                const cardId = this._updateItem(undefined, fileID, RPITEMTYPE.CARD, deckName);
                trackedItem.reviewId = cardId;
                added++;
            }
        }

        const msg = t("DATA_FILE_UPDATE", {
            filePath: trackedFile.path,
            lineNo: trackedItem.lineNo,
            added: added,
            removed: removed,
        });
        if (notice) {
            MiscUtils.notice(msg);
        }
        return { added, removed };
    }

    async verifyItems() {
        const items = this.data.items;
        await Promise.all(
            items.map((item, _idx) => {
                if (item != null && item.isTracked) {
                    // console.debug("verifyItems:", item, id);
                    const itemType = !this.isCardItem(item.ID) ? RPITEMTYPE.NOTE : RPITEMTYPE.CARD;
                    this._updateItem(item.ID, item.fileID, itemType, item.deckName);
                }

                return Promise.resolve();
            }),
        );
        MiscUtils.notice(t("DATA_ALL_ITEMS_UPDATED"));
    }

    updateReviewedCounts(id: number, type: RPITEMTYPE = RPITEMTYPE.NOTE) {
        let rc = this.data.reviewedCounts;
        if (type === RPITEMTYPE.NOTE) {
            rc = this.data.reviewedCounts;
        } else {
            rc = this.data.reviewedCardCounts;
        }
        // const date = new Date().toLocaleDateString();
        const date = window.moment(new Date()).format("YYYY-MM-DD");
        if (!(date in rc)) {
            rc[date] = { due: 0, new: 0 };
        }
        const item = this.getItembyID(id);
        if (item.isDue) {
            if (item.isFsrs) {
                const data: FsrsData = item.data as FsrsData;
                if (new Date(data.last_review) < new Date(date)) {
                    rc[date].due++;
                }
            } else {
                if (item.timesReviewed > 0) {
                    rc[date].due++;
                }
            }
        } else {
            rc[date].new++;
            this.logDebug("new:", rc[date].new);
        }
    }

    findMovedFile(path: string): string {
        const pathArr = path.split("/");
        const name = pathArr.last().replace(".md", "");
        const notes: TFile[] = Iadapter.instance.vault.getMarkdownFiles();
        const result: string[] = [];
        notes.some((note: TFile) => {
            if (note.basename.includes(name) || name.includes(note.basename)) {
                result.push(note.path);
            }
        });
        if (result.length > 0) {
            this.logDebug("find file: %s has been moved. %d", path, result.length);
            return result[0];
        }
        return null;
    }

    updateMovedFile(trackedFile: TrackedFile): boolean {
        const newpath = this.findMovedFile(trackedFile.path);
        if (newpath !== null) {
            trackedFile.rename(newpath);
            return true;
        }
        return false;
    }

    /**
     * Verify that the file of this item still exists.
     *
     * @param {string}path
     */
    async verify(path: string): Promise<boolean> {
        const adapter = Iadapter.instance.adapter;
        if (path != null) {
            return await adapter.exists(path).catch((_reason) => {
                console.error("Unable to verify file: ", path);
                return false;
            });
        }
        return false;
    }

    /**
     * resetData.
     */
    resetData() {
        this.data = Object.assign({}, DEFAULT_SRS_DATA);
        this.markItemByIdIndexDirty();
        this.reviewItemOverlayById.clear();
        this.reviewItemOverlayVersion = 0;
        this.persistedReviewOverlayVersion = 0;
        this.clearReviewOverlayRetryTimer();
    }

    /**
     * pruneData: delete unused storedata, fsrs's optimizer/writeRevlog() will be affected if using this func.
     * NulltFiles/NullItems
     * @returns
     */
    async pruneData() {
        this.data = MiscUtils.assignOnly(DEFAULT_SRS_DATA, this.data);

        const newTrackedFiles: Record<string, TrackedFile> = {};
        const newFileOrder: string[] = [];
        for (const fileID of this.data.fileOrder || Object.keys(this.data.trackedFiles)) {
            const tkfile = this.data.trackedFiles[fileID];
            if (tkfile == null || !tkfile.tags || tkfile.tags.length === 0) continue;
            if (this.getItems(tkfile.itemIDs).filter((item) => item?.isTracked).length > 0) {
                newTrackedFiles[fileID] = tkfile;
                newFileOrder.push(fileID);
            }
        }
        this.data.trackedFiles = newTrackedFiles;
        this.data.fileOrder = newFileOrder;

        this.data.items = Object.entries(this.data.trackedFiles)
            .map(([fileID, tkfile]) => {
                return this.getItems(tkfile.itemIDs)
                    .filter((item) => item != null)
                    .map((item) => {
                        item.fileID = fileID;
                        return item;
                    });
            })
            .flat();
        this.markItemByIdIndexDirty();
        this.reviewItemOverlayById.clear();
        this.reviewItemOverlayVersion = 0;
        this.persistedReviewOverlayVersion = 0;
        this.clearReviewOverlayRetryTimer();

        this.data.queues.clearQueue();
        await this.save();

        return;
    }

    async performGlobalGarbageCollection(): Promise<void> {
        this.logInfo("[SR-GC] Starting global garbage collection...");
        const trackedFiles = this.data.trackedFiles;

        const referencedIds = new Set<number>();
        for (const tkf of Object.values(trackedFiles)) {
            if (tkf == null) continue;
            for (const key in tkf.items) {
                const id = tkf.items[key];
                if (typeof id === "number" && id >= 0) referencedIds.add(id);
            }
            if (tkf.hasCards && tkf.trackedItems) {
                for (const item of tkf.trackedItems) {
                    if (item.reviewId >= 0) referencedIds.add(item.reviewId);
                }
            }
        }

        const oldItemCount = this.data.items.length;

        const idMap = new Map<number, number>();
        const keptItems: RepetitionItem[] = [];

        for (const item of this.data.items) {
            if (item == null) continue;
            if (referencedIds.has(item.ID)) {
                const oldID = item.ID;
                const newID = keptItems.length;
                idMap.set(oldID, newID);
                item.ID = newID;
                keptItems.push(item);
            }
        }

        const purgedCount = oldItemCount - keptItems.length;

        if (purgedCount > 0) {
            for (const tkf of Object.values(trackedFiles)) {
                if (tkf == null) continue;

                for (const key in tkf.items) {
                    const oldId = tkf.items[key];
                    if (idMap.has(oldId)) {
                        tkf.items[key] = idMap.get(oldId)!;
                    }
                }

                if (tkf.hasCards && tkf.trackedItems) {
                    for (const item of tkf.trackedItems) {
                        if (item.reviewId >= 0 && idMap.has(item.reviewId)) {
                            item.reviewId = idMap.get(item.reviewId)!;
                        }
                    }
                }
            }

            this.data.items = keptItems;
            this.markItemByIdIndexDirty();
            this.reviewItemOverlayById.clear();
            this.reviewItemOverlayVersion = 0;
            this.persistedReviewOverlayVersion = 0;
            this.clearReviewOverlayRetryTimer();
            this.logInfo(
                `[SR-GC] GC completed. Purged ${purgedCount} orphan items (${oldItemCount} -> ${keptItems.length})`,
            );

            await this.save();
        } else {
            this.logInfo("[SR-GC] No cleanup needed.");
        }
    }
}
