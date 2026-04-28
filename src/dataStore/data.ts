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
import { TrackedFile, TrackedItem, reconcileTrackedItemsWithCandidates } from "./trackedFile";
import { RPITEMTYPE, RepetitionItem, ReviewResult, CardQueue } from "./repetitionItem";
import { Queue } from "./queue";
import { Iadapter } from "./adapter";
import type { CardsStorePathConfig } from "./syroWorkspace";
import { t } from "src/lang/helpers";
import { createEmptyCard } from "ts-fsrs";
import { getArrayProp, isRecord, parseJsonUnknown } from "src/util/typeGuards";
import {
    createPendingCardsReviewSection,
    createPendingOverlayCommitId,
    PendingOverlayStore,
    type PendingCardsReviewSection,
    type PendingReviewItemEntry,
} from "./pendingOverlayStore";
import {
    cloneSyncEntities,
    markSyncEntity,
    parseSyncEntities,
    pruneSyncEntities,
    shouldApplySyncEntity,
    type PersistedSyncEntityState,
} from "./syroSyncMeta";
import { mergeEquivalentUuids } from "./syroUuidAlias";

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

function createDefaultQueueState(): Queue {
    return Queue.create({
        queue: {},
        repeatQueue: [],
        toDayAllQueue: {},
        toDayLaterQueue: {},
        lastQueue: 0,
        newAdded: 0,
    } as Queue);
}

export function createDefaultSrsData(): SrsData {
    return {
        queues: createDefaultQueueState(),
        reviewedCounts: {},
        reviewedCardCounts: {},
        items: [],
        trackedFiles: {},
        fileOrder: [],
        syncEntities: {},
        mtime: 0,
    };
}

export const DEFAULT_SRS_DATA: SrsData = {
    queues: createDefaultQueueState(),
    reviewedCounts: {},
    reviewedCardCounts: {},
    items: [],
    trackedFiles: {},
    fileOrder: [],
    syncEntities: {},
    mtime: 0,
};

export interface TrackedCardSnapshot {
    path: string;
    fileUuid?: string;
    trackedFileUuid: string;
    trackedFileAliases: string[];
    trackedFileTags: string[];
    trackedItem: TrackedItem | null;
    item: RepetitionItem;
}

export interface TrackedCardsFileSnapshot {
    uuid: string;
    aliases: string[];
    path: string;
    oldPath?: string;
    newPath?: string;
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

export interface TrackedFileMatchInput {
    uuids?: readonly string[];
    paths?: readonly string[];
}

export interface ParsedTrackedCardsStoreSnapshots {
    files: TrackedCardsFileSnapshot[];
    cards: TrackedCardSnapshot[];
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

export function parseTrackedCardsStoreSnapshots(
    raw: string,
): ParsedTrackedCardsStoreSnapshots | null {
    const parsed = parseJsonUnknown(raw);
    if (!isRecord(parsed)) {
        return null;
    }

    const items = getArrayProp(parsed, "items")
        .filter((entry): entry is RepetitionItem => isRecord(entry))
        .map((entry) => RepetitionItem.create(entry));
    const trackedFilesRaw = parsed["trackedFiles"];
    if (!isRecord(trackedFilesRaw)) {
        return null;
    }

    const itemsById = new Map<number, RepetitionItem>(items.map((item) => [item.ID, item]));
    const files: TrackedCardsFileSnapshot[] = [];
    const cards: TrackedCardSnapshot[] = [];

    for (const trackedFileRaw of Object.values(trackedFilesRaw)) {
        if (!isRecord(trackedFileRaw) || typeof trackedFileRaw.path !== "string") {
            continue;
        }

        const trackedFile = TrackedFile.create(trackedFileRaw as unknown as TrackedFile);
        const relatedItems = trackedFile.itemIDs
            .map((itemId) => cloneRepetitionItem(itemsById.get(itemId)))
            .filter((item): item is RepetitionItem => item !== null);
        const fileSnapshot: TrackedCardsFileSnapshot = {
            uuid: trackedFile.uuid,
            aliases: [...(trackedFile.aliases ?? [])],
            path: trackedFile.path,
            tags: [...(trackedFile.tags ?? [])],
            items: { ...(trackedFile.items ?? {}) },
            trackedItems: (trackedFile.trackedItems ?? [])
                .map((item) => cloneTrackedItem(item))
                .filter((item): item is TrackedItem => item !== null),
            relatedItems,
        };
        files.push(fileSnapshot);

        for (const trackedItem of trackedFile.trackedItems ?? []) {
            const relatedItem = itemsById.get(trackedItem.reviewId);
            if (!relatedItem || relatedItem.itemType !== RPITEMTYPE.CARD) {
                continue;
            }

            const clonedItem = cloneRepetitionItem(relatedItem);
            const clonedTrackedItem = cloneTrackedItem(trackedItem);
            if (!clonedItem || !clonedTrackedItem) {
                continue;
            }

            cards.push({
                path: trackedFile.path,
                fileUuid: trackedFile.uuid,
                trackedFileUuid: trackedFile.uuid,
                trackedFileAliases: [...(trackedFile.aliases ?? [])],
                trackedFileTags: [...(trackedFile.tags ?? [])],
                trackedItem: clonedTrackedItem,
                item: clonedItem,
            });
        }
    }

    return {
        files,
        cards,
    };
}

/**
 * DataStore.
 */
export class DataStore {
    static instance: DataStore | null;
    public lastLoadError: string | null = null;

    /**
     * @type {SrsData}
     */
    data: SrsData = createDefaultSrsData();
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
    private pendingOverlayStore: PendingOverlayStore;
    private auxiliaryDataDir: string;
    private saveSuppressionCount: number = 0;
    private saveRequestedWhileSuppressed: boolean = false;
    private itemByIdIndex: Map<number, RepetitionItem> = new Map();
    private itemByIdIndexDirty = true;
    private reviewItemOverlayById: Map<number, PendingReviewItemEntry> = new Map();
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

    public static clearInstance(): void {
        DataStore.instance = null;
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
            this.auxiliaryDataDir = this.getParentDir(this.dataPath);
            this.pendingOverlayStore = new PendingOverlayStore({
                adapter: Iadapter.instance.adapter,
                path: this.derivePendingOverlayPath(this.dataPath),
                shouldLogDebug: () => this.shouldLogDebug(),
                logDebug: (...args: unknown[]) => this.logDebug(...args),
                logWarn: (...args: unknown[]) => console.warn(...args),
                notifyWriteFailure: () => MiscUtils.notice(t("DATA_UNABLE_TO_SAVE")),
            });
        } else {
            this.dataPath = manifestDirOrPaths.cardsPath;
            this.auxiliaryDataDir =
                manifestDirOrPaths.auxiliaryDataDir ??
                this.getParentDir(manifestDirOrPaths.cardsPath);
            this.pendingOverlayStore =
                manifestDirOrPaths.pendingOverlayStore ??
                new PendingOverlayStore({
                    adapter: Iadapter.instance.adapter,
                    path:
                        manifestDirOrPaths.pendingOverlayPath ??
                        manifestDirOrPaths.cardsOverlayPath ??
                        this.derivePendingOverlayPath(manifestDirOrPaths.cardsPath),
                    shouldLogDebug: () => this.shouldLogDebug(),
                    logDebug: (...args: unknown[]) => this.logDebug(...args),
                    logWarn: (...args: unknown[]) => console.warn(...args),
                    notifyWriteFailure: () => MiscUtils.notice(t("DATA_UNABLE_TO_SAVE")),
                });
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

    private derivePendingOverlayPath(path = this.dataPath): string {
        const parentDir = this.getParentDir(path);
        return this.joinWithParent(parentDir, "pending.overlay.json");
    }

    public getAuxiliaryPath(fileName: string): string {
        return this.joinWithParent(this.auxiliaryDataDir, fileName);
    }

    private createReviewItemDelta(
        item: RepetitionItem,
        options: Partial<PendingReviewItemEntry> = {},
    ): PendingReviewItemEntry {
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
            commitId: options.commitId ?? createPendingOverlayCommitId("card-review"),
            sessionCommitted: options.sessionCommitted === true,
            sessionOpType: options.sessionOpType ?? "upsert",
        };
    }

    private clonePendingReviewEntries(): PendingReviewItemEntry[] {
        return Array.from(this.reviewItemOverlayById.values()).map(
            (entry) => JSON.parse(JSON.stringify(entry)) as PendingReviewItemEntry,
        );
    }

    private restorePendingReviewEntries(entries: PendingReviewItemEntry[]): void {
        this.reviewItemOverlayById.clear();
        for (const entry of entries) {
            if (!entry || typeof entry.id !== "number" || entry.id < 0) {
                continue;
            }
            this.reviewItemOverlayById.set(
                entry.id,
                JSON.parse(JSON.stringify(entry)) as PendingReviewItemEntry,
            );
        }
    }

    private clearCommittedReviewOverlayEntries(): number {
        let cleared = 0;
        for (const [itemId, entry] of this.reviewItemOverlayById.entries()) {
            if (entry.sessionCommitted === true) {
                this.reviewItemOverlayById.delete(itemId);
                cleared++;
            }
        }
        return cleared;
    }

    private markReviewOverlayDirty(): void {
        const section =
            this.reviewItemOverlayById.size > 0
                ? createPendingCardsReviewSection(
                      this.clonePendingReviewEntries(),
                      this.data?.mtime ?? 0,
                  )
                : null;
        this.pendingOverlayStore.stageCardsReviewSection(section);
    }

    private hasPendingReviewOverlayInMemory(): boolean {
        return this.reviewItemOverlayById.size > 0;
    }

    private hasPendingReviewOverlayForItem(itemId: number): boolean {
        return itemId >= 0 && this.reviewItemOverlayById.has(itemId);
    }

    hasPendingReviewOverlayEntries(): boolean {
        return this.reviewItemOverlayById.size > 0;
    }

    getPendingReviewOverlayEntries(): PendingReviewItemEntry[] {
        return this.clonePendingReviewEntries();
    }

    getPendingReviewOverlayEntry(itemId: number): PendingReviewItemEntry | null {
        const entry = this.reviewItemOverlayById.get(itemId);
        if (!entry) {
            return null;
        }
        return JSON.parse(JSON.stringify(entry)) as PendingReviewItemEntry;
    }

    markPendingReviewSessionCommitted(itemId: number, commitId?: string): boolean {
        const entry = this.reviewItemOverlayById.get(itemId);
        if (!entry) {
            return false;
        }
        if (commitId && entry.commitId !== commitId) {
            return false;
        }
        if (entry.sessionCommitted === true) {
            return true;
        }
        entry.sessionCommitted = true;
        this.markReviewOverlayDirty();
        return true;
    }

    clearPendingReviewEntry(itemId: number, commitId?: string): boolean {
        const entry = this.reviewItemOverlayById.get(itemId);
        if (!entry) {
            return false;
        }
        if (commitId && entry.commitId !== commitId) {
            return false;
        }
        this.reviewItemOverlayById.delete(itemId);
        this.markReviewOverlayDirty();
        return true;
    }

    private async loadReviewOverlayFromDisk(): Promise<PendingCardsReviewSection | null> {
        try {
            await this.pendingOverlayStore.refreshFromDisk();
            return await this.pendingOverlayStore.getCardsReviewSection();
        } catch (error) {
            this.lastLoadError =
                this.lastLoadError ??
                `[SR-PendingOverlay] Failed to load cardsReview section: ${String(error)}`;
            console.warn("[SR-PendingOverlay] Failed to load cardsReview section:", error);
            return null;
        }
    }

    private applyReviewOverlayToData(overlay: PendingCardsReviewSection): number {
        this.restorePendingReviewEntries(overlay.items);
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

    stageReviewItemDelta(
        itemOrId: RepetitionItem | number | null | undefined,
        options: Partial<PendingReviewItemEntry> = {},
    ): PendingReviewItemEntry | null {
        const item = typeof itemOrId === "number" ? this.getItembyID(itemOrId) : itemOrId;
        if (!item || item.ID < 0) return null;
        const existing = this.reviewItemOverlayById.get(item.ID);
        const entry = this.createReviewItemDelta(item, {
            commitId: options.commitId ?? existing?.commitId,
            sessionCommitted: options.sessionCommitted ?? existing?.sessionCommitted,
            sessionOpType: options.sessionOpType ?? existing?.sessionOpType,
        });
        this.reviewItemOverlayById.set(item.ID, entry);
        this.markReviewOverlayDirty();
        return entry;
    }

    requestFlushReviewOverlay(): void {
        this.pendingOverlayStore.requestFlush();
    }

    async drainReviewOverlayFlush(timeoutMs = 1500): Promise<boolean> {
        return this.pendingOverlayStore.drainFlush(timeoutMs);
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
            if (this.hasPendingReviewOverlayForItem(item.ID)) {
                continue;
            }
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

    async ensureReviewOverlayMerged(path = this.dataPath): Promise<boolean> {
        if (this.hasPendingReviewOverlayInMemory()) {
            await this.drainReviewOverlayFlush(1500);
        }

        const overlay = await this.loadReviewOverlayFromDisk();
        if (!overlay && !this.hasPendingReviewOverlayInMemory()) {
            return false;
        }
        if (overlay) {
            const applied = this.applyReviewOverlayToData(overlay);
            if (applied > 0) {
                this.logInfo(
                    `[SR-PendingOverlay] Ensured ${applied} cardsReview deltas before rebuild.`,
                );
            }
        }

        await this.save(path);
        return true;
    }

    /**
     * load.
     */
    async load(path = this.dataPath) {
        this.lastLoadError = null;
        try {
            const adapter = Iadapter.instance.adapter;
            if (await adapter.exists(path)) {
                const data = await adapter.read(path);
                if (data == null) {
                    this.logError("Unable to read SRS data!");
                    this.data = createDefaultSrsData();
                } else {
                    const parsed = parseJsonUnknown(data);
                    const parsedData = isRecord(parsed) ? (parsed as Partial<SrsData>) : null;
                    if (!parsedData) {
                        throw new Error("Invalid cards.json payload");
                    }
                    this.data = Object.assign(createDefaultSrsData(), parsedData);
                    this.data.syncEntities = parseSyncEntities(parsedData?.syncEntities);
                    this.data.mtime = await this.getmtime();
                    const overlay = await this.loadReviewOverlayFromDisk();
                    if (overlay) {
                        const applied = this.applyReviewOverlayToData(overlay);
                        if (applied > 0) {
                            this.logInfo(
                                `[SR-PendingOverlay] Applied ${applied} cardsReview deltas from overlay.`,
                            );
                        }
                        await this.save(path);
                    }
                }
            } else {
                this.logInfo("Tracked files not found! Creating new file...");
                this.data = createDefaultSrsData();
                await this.save();
            }
        } catch (error) {
            this.lastLoadError = `[SR-Data] Failed to load cards.json: ${String(error)}`;
            this.logError("Error loading data", error);
            this.data = createDefaultSrsData();
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
        this.auxiliaryDataDir = options.auxiliaryDataDir ?? this.getParentDir(path);
        this.pendingOverlayStore.configure(
            options.pendingOverlayPath ??
                options.cardsOverlayPath ??
                this.derivePendingOverlayPath(path),
        );
        this.reviewItemOverlayById.clear();
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
    async save(path = this.dataPath): Promise<boolean> {
        if (this.syncReadOnlyReason) {
            this.logError("[SR-Readonly] Skip cards save:", this.syncReadOnlyReason);
            return false;
        }
        if (this.saveSuppressionCount > 0) {
            this.saveRequestedWhileSuppressed = true;
            return false;
        }
        try {
            await Iadapter.instance.adapter.write(path, JSON.stringify(this.data));
            this.data.mtime = await this.getmtime();
            this.clearCommittedReviewOverlayEntries();
            if (this.reviewItemOverlayById.size === 0) {
                this.pendingOverlayStore.clearCardsReviewSection();
            } else {
                this.markReviewOverlayDirty();
            }
            await this.pendingOverlayStore.drainFlush();
            return true;
        } catch (error) {
            MiscUtils.notice(t("DATA_UNABLE_TO_SAVE"));
            this.logError("Unable to save data", error);
            return false;
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
                ? ((trackedFile.trackedItems ?? []).find(
                      (candidate) => candidate.reviewId === itemId,
                  ) ?? null)
                : null;

        return {
            path: trackedFile.path,
            fileUuid: trackedFile.uuid,
            trackedFileUuid: trackedFile.uuid,
            trackedFileAliases: [...(trackedFile.aliases ?? [])],
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
            aliases: [...(trackedFile.aliases ?? [])],
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

    findFileIdsByUuid(uuid: string): string[] {
        if (!uuid) {
            return [];
        }

        return Object.entries(this.data.trackedFiles)
            .filter(([, trackedFile]) => trackedFile?.uuid === uuid)
            .map(([fileID]) => fileID);
    }

    findFileIdByUuidOrAlias(uuid: string): string {
        if (!uuid) {
            return "";
        }

        for (const [fileID, trackedFile] of Object.entries(this.data.trackedFiles)) {
            if (
                trackedFile?.uuid === uuid ||
                (Array.isArray(trackedFile?.aliases) && trackedFile.aliases.includes(uuid))
            ) {
                return fileID;
            }
        }

        return "";
    }

    findFileIdsByUuidOrAlias(uuid: string): string[] {
        if (!uuid) {
            return [];
        }

        return Object.entries(this.data.trackedFiles)
            .filter(
                ([, trackedFile]) =>
                    trackedFile?.uuid === uuid ||
                    (Array.isArray(trackedFile?.aliases) && trackedFile.aliases.includes(uuid)),
            )
            .map(([fileID]) => fileID);
    }

    findFileIdsByPath(path: string): string[] {
        if (!path) {
            return [];
        }

        return Object.entries(this.data.trackedFiles)
            .filter(([, trackedFile]) => trackedFile?.path === path)
            .map(([fileID]) => fileID);
    }

    findTrackedFileIds(input: TrackedFileMatchInput): string[] {
        const matches = new Set<string>();
        for (const uuid of input.uuids ?? []) {
            for (const fileID of this.findFileIdsByUuidOrAlias(uuid)) {
                matches.add(fileID);
            }
        }
        for (const path of input.paths ?? []) {
            for (const fileID of this.findFileIdsByPath(path)) {
                matches.add(fileID);
            }
        }
        return [...matches];
    }

    findItemByUuid(uuid: string): RepetitionItem | null {
        if (!uuid) {
            return null;
        }

        return this.data.items.find((item) => item?.uuid === uuid) ?? null;
    }

    findItemByUuidOrAlias(uuid: string): RepetitionItem | null {
        if (!uuid) {
            return null;
        }

        return (
            this.data.items.find(
                (item) =>
                    item?.uuid === uuid ||
                    (Array.isArray(item?.aliases) && item.aliases.includes(uuid)),
            ) ?? null
        );
    }

    mergeFileUuidEquivalence(fileID: string, incomingUuids: readonly string[]): string[] {
        const trackedFile = this.getFileByID(fileID);
        if (!trackedFile) {
            return [];
        }

        trackedFile.aliases = mergeEquivalentUuids(
            trackedFile.uuid,
            trackedFile.aliases,
            incomingUuids,
        );
        return [...trackedFile.aliases];
    }

    getFileEquivalentUuids(fileID: string): string[] {
        const trackedFile = this.getFileByID(fileID);
        if (!trackedFile) {
            return [];
        }
        return [trackedFile.uuid, ...(trackedFile.aliases ?? [])];
    }

    mergeItemUuidEquivalence(itemId: number, incomingUuids: readonly string[]): string[] {
        const item = this.getItembyID(itemId);
        if (!item) {
            return [];
        }

        item.aliases = mergeEquivalentUuids(item.uuid, item.aliases, incomingUuids);
        return [...item.aliases];
    }

    getItemEquivalentUuids(itemId: number): string[] {
        const item = this.getItembyID(itemId);
        if (!item) {
            return [];
        }
        return [item.uuid, ...(item.aliases ?? [])];
    }

    findMatchingItemByTrackedSnapshot(snapshot: TrackedCardSnapshot): RepetitionItem | null {
        if (!snapshot.trackedItem) {
            return null;
        }

        const trackedFileId =
            this.findFileIdByUuidOrAlias(snapshot.fileUuid || snapshot.trackedFileUuid) ||
            this.getFileID(snapshot.path);
        const trackedFile = trackedFileId ? this.getFileByID(trackedFileId) : null;
        const localTrackedItems = trackedFile?.trackedItems ?? [];
        if (!trackedFile || localTrackedItems.length === 0) {
            return null;
        }

        const remoteCandidate = cloneTrackedItem(snapshot.trackedItem);
        if (!remoteCandidate) {
            return null;
        }

        const matched = reconcileTrackedItemsWithCandidates(localTrackedItems, [remoteCandidate]);
        const matchedReviewId = matched[0]?.reviewId ?? -1;
        return matchedReviewId >= 0 ? this.getItembyID(matchedReviewId) : null;
    }

    isTrackedFingerprintUnique(path: string, fingerprint: string): boolean {
        const trackedFile = this.getTrackedFile(path);
        if (!trackedFile) {
            return false;
        }

        return (
            (trackedFile.trackedItems ?? []).filter((item) => item.fingerprint === fingerprint)
                .length <= 1
        );
    }

    upsertCardSnapshot(snapshot: TrackedCardSnapshot): void {
        const { fileID, trackedFile } = this.ensureTrackedFileRecord({
            uuid: snapshot.fileUuid || snapshot.trackedFileUuid,
            path: snapshot.path,
            tags: snapshot.trackedFileTags,
            aliases: snapshot.trackedFileAliases,
            updatePath: false,
        });
        const localItemId = this.upsertClonedItem(snapshot.item, fileID);

        trackedFile.tags = [...snapshot.trackedFileTags];
        trackedFile.items = trackedFile.items ?? { file: -1 };
        if (snapshot.item.itemType === RPITEMTYPE.NOTE) {
            trackedFile.items.file = localItemId;
            return;
        }

        const nextTrackedItems = (trackedFile.trackedItems ?? []).filter(
            (item) => item.reviewId !== localItemId,
        );
        const nextTrackedItem = snapshot.trackedItem
            ? cloneTrackedItem(snapshot.trackedItem)
            : null;
        if (nextTrackedItem) {
            nextTrackedItem.reviewId = localItemId;
            nextTrackedItems.push(nextTrackedItem);
        }
        trackedFile.trackedItems = nextTrackedItems;
    }

    renameTrackedFileFromSnapshot(snapshot: TrackedCardsFileSnapshot): void {
        const fileIDByUuid = this.findFileIdByUuidOrAlias(snapshot.uuid);
        if (fileIDByUuid) {
            const trackedFile = this.data.trackedFiles[fileIDByUuid];
            trackedFile.aliases = mergeEquivalentUuids(trackedFile.uuid, trackedFile.aliases, [
                snapshot.uuid,
                ...(snapshot.aliases ?? []),
            ]);
            trackedFile.path = snapshot.path;
            trackedFile.tags = [...snapshot.tags];
            return;
        }

        this.bootstrapTrackedFileFromSnapshot(snapshot);
    }

    removeCardByUuid(uuid: string, _fallbackPath?: string): boolean {
        const item = this.findItemByUuidOrAlias(uuid);
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
        const fileID =
            this.findFileIdByUuidOrAlias(uuid) ||
            (fallbackPath ? this.getFileID(fallbackPath) : "");
        if (!fileID || !this.data.trackedFiles[fileID]) {
            return false;
        }

        const trackedFile = this.data.trackedFiles[fileID];
        for (const itemId of trackedFile.itemIDs) {
            this.unTrackItem(itemId);
        }
        delete this.data.trackedFiles[fileID];
        this.data.fileOrder = (this.data.fileOrder ?? []).filter(
            (existingId) => existingId !== fileID,
        );
        return true;
    }

    removeTrackedFilesByIds(fileIDs: readonly string[]): boolean {
        let changed = false;
        for (const fileID of [...new Set(fileIDs)].filter((candidate) => candidate.length > 0)) {
            if (!this.data.trackedFiles[fileID]) {
                continue;
            }
            const trackedFile = this.data.trackedFiles[fileID];
            for (const itemId of trackedFile.itemIDs) {
                this.unTrackItem(itemId);
            }
            delete this.data.trackedFiles[fileID];
            this.data.fileOrder = (this.data.fileOrder ?? []).filter(
                (existingId) => existingId !== fileID,
            );
            changed = true;
        }
        return changed;
    }

    collapseTrackedFilesToCanonical(
        canonicalFileID: string,
        duplicateFileIDs: readonly string[],
    ): boolean {
        const canonical = this.getFileByID(canonicalFileID);
        if (!canonical) {
            return false;
        }

        let changed = false;
        for (const duplicateFileID of [...new Set(duplicateFileIDs)]) {
            if (!duplicateFileID || duplicateFileID === canonicalFileID) {
                continue;
            }
            const duplicate = this.getFileByID(duplicateFileID);
            if (!duplicate) {
                continue;
            }

            canonical.aliases = mergeEquivalentUuids(canonical.uuid, canonical.aliases, [
                duplicate.uuid,
                ...(duplicate.aliases ?? []),
            ]);

            const duplicateNoteId = duplicate.items?.file ?? -1;
            if (duplicateNoteId >= 0) {
                const duplicateNote = this.getItembyID(duplicateNoteId);
                const canonicalNoteId = canonical.items?.file ?? -1;
                const canonicalNote =
                    canonicalNoteId >= 0 ? this.getItembyID(canonicalNoteId) : null;
                if (duplicateNote) {
                    if (!canonicalNote) {
                        canonical.items.file = duplicateNote.ID;
                        duplicateNote.setTracked(canonicalFileID);
                        changed = true;
                    } else if (
                        canonicalNote.uuid === duplicateNote.uuid ||
                        canonicalNote.aliases?.includes(duplicateNote.uuid) ||
                        duplicateNote.aliases?.includes(canonicalNote.uuid)
                    ) {
                        this.mergeItemUuidEquivalence(canonicalNote.ID, [
                            duplicateNote.uuid,
                            ...(duplicateNote.aliases ?? []),
                        ]);
                        this.unTrackItem(duplicateNote.ID);
                        changed = true;
                    } else {
                        this.unTrackItem(duplicateNote.ID);
                        changed = true;
                    }
                }
            }

            for (const duplicateTrackedItem of duplicate.trackedItems ?? []) {
                const duplicateCard = this.getItembyID(duplicateTrackedItem.reviewId);
                if (!duplicateCard) {
                    continue;
                }
                const cardKey = `${duplicateTrackedItem.lineNo}:${duplicateTrackedItem.clozeId ?? "c1"}`;
                const canonicalTrackedItem = (canonical.trackedItems ?? []).find((item) => {
                    if (item.reviewId < 0) {
                        return false;
                    }
                    const currentItem = this.getItembyID(item.reviewId);
                    return (
                        `${item.lineNo}:${item.clozeId ?? "c1"}` === cardKey ||
                        currentItem?.uuid === duplicateCard.uuid ||
                        currentItem?.aliases?.includes(duplicateCard.uuid) ||
                        duplicateCard.aliases?.includes(currentItem?.uuid ?? "")
                    );
                });

                if (canonicalTrackedItem) {
                    const canonicalCard = this.getItembyID(canonicalTrackedItem.reviewId);
                    if (canonicalCard) {
                        this.mergeItemUuidEquivalence(canonicalCard.ID, [
                            duplicateCard.uuid,
                            ...(duplicateCard.aliases ?? []),
                        ]);
                    }
                    this.unTrackItem(duplicateCard.ID);
                    changed = true;
                    continue;
                }

                duplicateCard.setTracked(canonicalFileID);
                canonical.trackedItems = canonical.trackedItems ?? [];
                canonical.trackedItems.push(
                    cloneTrackedItem(duplicateTrackedItem) ?? duplicateTrackedItem,
                );
                changed = true;
            }

            delete this.data.trackedFiles[duplicateFileID];
            this.data.fileOrder = (this.data.fileOrder ?? []).filter(
                (existingId) => existingId !== duplicateFileID,
            );
            changed = true;
        }

        if (changed) {
            canonical.trackedItems = (canonical.trackedItems ?? []).filter(
                (trackedItem, index, items) => {
                    const key = `${trackedItem.lineNo}:${trackedItem.clozeId ?? "c1"}`;
                    return (
                        items.findIndex(
                            (candidate) =>
                                `${candidate.lineNo}:${candidate.clozeId ?? "c1"}` === key,
                        ) === index
                    );
                },
            );
        }

        return changed;
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
            aliases: snapshot.aliases,
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
        aliases?: string[];
        updatePath?: boolean;
    }): { fileID: string; trackedFile: TrackedFile } {
        const existingFileId =
            this.findFileIdByUuidOrAlias(input.uuid) || this.getFileID(input.path);
        if (existingFileId) {
            const trackedFile = this.data.trackedFiles[existingFileId];
            trackedFile.aliases = mergeEquivalentUuids(trackedFile.uuid, trackedFile.aliases, [
                input.uuid,
                ...(input.aliases ?? []),
            ]);
            if (input.updatePath !== false) {
                trackedFile.path = input.path;
            }
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
            aliases: input.aliases ?? [],
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

        const existingItem = this.findItemByUuidOrAlias(clonedItem.uuid);
        const targetId = existingItem?.ID ?? this.maxItemId + 1;
        clonedItem.ID = targetId;
        clonedItem.fileID = fileID;

        if (existingItem) {
            clonedItem.aliases = mergeEquivalentUuids(existingItem.uuid, existingItem.aliases, [
                clonedItem.uuid,
                ...(clonedItem.aliases ?? []),
            ]);
            clonedItem.uuid = existingItem.uuid;
            Object.assign(existingItem, clonedItem);
            this.data.queues.remove(existingItem);
        } else {
            clonedItem.aliases = mergeEquivalentUuids(clonedItem.uuid, clonedItem.aliases, []);
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
        this.data = createDefaultSrsData();
        this.markItemByIdIndexDirty();
        this.reviewItemOverlayById.clear();
        this.pendingOverlayStore.clearCardsReviewSection();
    }

    /**
     * pruneData: delete unused storedata, fsrs's optimizer/writeRevlog() will be affected if using this func.
     * NulltFiles/NullItems
     * @returns
     */
    async pruneData() {
        this.data = MiscUtils.assignOnly(createDefaultSrsData(), this.data);

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
        this.pendingOverlayStore.clearCardsReviewSection();

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
            this.pendingOverlayStore.clearCardsReviewSection();
            this.logInfo(
                `[SR-GC] GC completed. Purged ${purgedCount} orphan items (${oldItemCount} -> ${keptItems.length})`,
            );

            await this.save();
        } else {
            this.logInfo("[SR-GC] No cleanup needed.");
        }
    }
}
