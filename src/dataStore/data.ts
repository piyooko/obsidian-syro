/**
 * 这个文件主要是干什么的：
 * [核心] 数据中心单例 (DataStore)。
 * 它是整个插件内存数据的“总仓库”，管理所有的复习项(Items)、追踪文件(TrackedFiles)和复习队列(Queues)。
 * 负责数据的加载(Load)、保存(Save)以及与磁盘文件的同步。
 * 创建新的复习项时，会根据项目类型（卡片用 FSRS，笔记用加权乘法）选择正确的算法来生成初始数据。
 * 追踪文件使用唯一的 fileID 字符串作为键（而不是数组下标），
 * 这样无论文件怎么增删排序，复习项和文件的关联关系都不会错位。
 *
 * 它在项目中属于：数据层 (Data Layer)
 *
 * 它会用到哪些文件：
 * 1. src/dataStore/queue.ts (队列管理)
 * 2. src/dataStore/repetitionItem.ts (复习项数据模型)
 * 3. src/dataStore/adapter.ts (文件系统适配器)
 * 4. src/main.ts (获取卡片/笔记对应的算法实例)
 *
 * 哪些文件会用到它：
 * 1. src/FlashcardReviewSequencer.ts (获取卡片对应的调度数据)
 * 2. src/algorithms/*.ts (算法需要读取历史数据)
 * 3. 几乎所有需要访问全局状态的 UI 组件
 */
/**
 * [数据层：负责数据的持久化、读取和内存状态管理] [核心] 数据中心单例 (DataStore)，管理内存中的所有数据（卡片、队列、文件追踪）。
 */
import { MiscUtils, debug } from "src/util/utils_recall";
import { SRSettings } from "../settings";

import { TFile, TFolder, getAllTags } from "obsidian";

import { FsrsData } from "src/algorithms/fsrs";
import { AnkiData } from "src/algorithms/anki";

import { getStorePath } from "src/dataStore/dataLocation";
import { Tags } from "src/tags";
import { SrsAlgorithm, algorithmNames } from "src/algorithms/algorithms";
import { TrackedFile, TrackedItem } from "./trackedFile";
import { RPITEMTYPE, RepetitionItem, ReviewResult, CardQueue } from "./repetitionItem";
import { DEFAULT_QUEUE_DATA, Queue } from "./queue";
import { Iadapter } from "./adapter";
import { t } from "src/lang/helpers";
import { createEmptyCard } from "ts-fsrs";

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
    /**
     * key = fileID（如 "f_8d29aa"），用唯一字符串作为键，不再使用数组下标
     */
    trackedFiles: Record<string, TrackedFile>;
    /**
     * 仅用于展示顺序，元素是 fileID
     */
    fileOrder: string[];

    /**
     * @type {number}
     */
    mtime: number;
}

export type ReviewedCounts = Record<string, { new: number; due: number }>;

/**
 * 生成一个唯一的文件 ID，格式为 "f_" + 6 位随机字符
 */
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

/**
 * DataStore.
 */
export class DataStore {
    static instance: DataStore;

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
    private saveSuppressionCount: number = 0;
    private saveRequestedWhileSuppressed: boolean = false;
    private itemByIdIndex: Map<number, RepetitionItem> = new Map();
    private itemByIdIndexDirty = true;
    private reviewItemOverlayById: Map<number, ReviewItemDelta> = new Map();

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
    constructor(settings: SRSettings, manifestDir: string) {
        // this.plugin = plugin;
        this.settings = settings;
        // this.manifestDir = manifestDir;
        this.dataPath = getStorePath(manifestDir, settings);
        DataStore.instance = this;
    }

    private shouldLogDebug(): boolean {
        return this.settings.showSchedulingDebugMessages;
    }

    private isTestEnv(): boolean {
        return typeof process !== "undefined" && process.env?.NODE_ENV === "test";
    }

    private logInfo(...args: unknown[]): void {
        if (this.shouldLogDebug()) {
            console.log(...args);
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

    private getReviewOverlayPath(path = this.dataPath): string {
        if (!path) return "tracked_files.review_overlay.json";
        const sepIdx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
        const dir = sepIdx >= 0 ? path.substring(0, sepIdx + 1) : "";
        const fileName = sepIdx >= 0 ? path.substring(sepIdx + 1) : path;
        const dotIdx = fileName.lastIndexOf(".");
        const baseName = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
        return `${dir}${baseName}.review_overlay.json`;
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

    private async loadReviewOverlayFromDisk(
        path = this.dataPath,
    ): Promise<ReviewItemOverlayFile | null> {
        try {
            const adapter = Iadapter.instance.adapter;
            const overlayPath = this.getReviewOverlayPath(path);
            if (!(await adapter.exists(overlayPath))) return null;
            const raw = await adapter.read(overlayPath);
            if (!raw) return null;
            const parsed: ReviewItemOverlayFile = JSON.parse(raw);
            if (parsed?.version !== REVIEW_ITEM_OVERLAY_VERSION || !Array.isArray(parsed.items)) {
                return null;
            }
            return parsed;
        } catch (error) {
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

    private async writeReviewOverlayToDisk(path = this.dataPath): Promise<void> {
        try {
            const adapter = Iadapter.instance.adapter;
            const overlayPath = this.getReviewOverlayPath(path);
            if (this.reviewItemOverlayById.size === 0) {
                if (await adapter.exists(overlayPath)) {
                    await adapter.remove(overlayPath);
                }
                return;
            }

            const payload: ReviewItemOverlayFile = {
                version: REVIEW_ITEM_OVERLAY_VERSION,
                baseMtime: this.data?.mtime ?? 0,
                items: Array.from(this.reviewItemOverlayById.values()),
            };
            await adapter.write(overlayPath, JSON.stringify(payload));
        } catch (error) {
            console.warn("[SR-Overlay] Failed to write review overlay:", error);
        }
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

    async saveReviewItemDelta(itemOrId: RepetitionItem | number | null | undefined): Promise<void> {
        const item = typeof itemOrId === "number" ? this.getItembyID(itemOrId) : itemOrId;
        if (!item || item.ID < 0) return;
        this.reviewItemOverlayById.set(item.ID, this.createReviewItemDelta(item));
        await this.writeReviewOverlayToDisk();
    }

    toInstances() {
        // ██ 数据迁移：旧格式（数组）→ 新格式（Record + fileOrder）██
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

            // 迁移所有 item 的 fileIndex → fileID
            for (const item of this.data.items) {
                if (item == null) continue;
                const oldIndex = (item as any).fileIndex;
                if (oldIndex !== undefined) {
                    (item as any).fileID = indexToID.get(oldIndex) || "";
                    delete (item as any).fileIndex;
                }
            }

            this.data.trackedFiles = newFiles;
            this.data.fileOrder = fileOrder;
            this.logInfo(`[SR] 数据迁移完成: ${oldFiles.length} → ${fileOrder.length} 文件`);
        } else {
            // 新格式：将 TrackedFile 对象转为实例
            for (const fileID in this.data.trackedFiles) {
                this.data.trackedFiles[fileID] = TrackedFile.create(this.data.trackedFiles[fileID]);
            }
            if (!this.data.fileOrder) {
                this.data.fileOrder = Object.keys(this.data.trackedFiles);
            }
        }
        // 1. Cleanup fileOrder: remove ghost IDs that don't exist in trackedFiles
        const originalOrderCount = this.data.fileOrder?.length || 0;
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
        // 迁移：修复 CARD 类型 item 使用了错误算法初始数据的问题
        this.migrateCardItemsToFsrs();
        this.logDebug(
            `[SR-Debug] toInstances complete. Final items count: ${this.data.items.length}`,
        );
    }

    /**
     * 数据迁移：将 CARD 类型 item 中错误的 WMS 数据格式转换为 FSRS 格式。
     * 只对新卡（从未复习过的）执行重置，已复习的卡片只记录警告。
     */
    private migrateCardItemsToFsrs() {
        let migratedCount = 0;
        for (const item of this.data.items) {
            if (item == null) continue;
            if (item.itemType !== RPITEMTYPE.CARD) continue;
            // 如果已经是 FSRS 格式（含 state 字段），跳过
            if (item.isFsrs) continue;

            if (item.timesReviewed === 0) {
                // 新卡：安全地重置为 FSRS 空卡数据
                item.data = createEmptyCard();
                migratedCount++;
            } else {
                // 已复习过的卡：不做破坏性修改，仅记录警告
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

    /**
     * 清理脏数据：将 timesReviewed === 0 但包含残留调度数据或学习状态的 Item 重置为干净的 New 状态
     */
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
                    if (data && data.state !== 0) needsClean = true;
                } else if (item.itemType === RPITEMTYPE.CARD) {
                    const data = item.data as AnkiData;
                    if (data && (data.lastInterval !== 0 || data.iteration !== 0))
                        needsClean = true;
                }

                if (needsClean) {
                    item.nextReview = 0;
                    item.learningStep = null;
                    item.queue = CardQueue.New;

                    let algorithm: SrsAlgorithm;
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-var-requires
                        const plugin = (require("src/main") as any).default.getInstance();
                        algorithm = plugin.getAlgorithmForItem(item.itemType);
                    } catch {
                        algorithm = SrsAlgorithm.getInstance();
                    }

                    item.data = algorithm.defaultData();
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
        try {
            const adapter = Iadapter.instance.adapter;
            let overlayMerged = false;

            if (await adapter.exists(path)) {
                const data = await adapter.read(path);
                if (data == null) {
                    this.logError("Unable to read SRS data!");
                    this.data = Object.assign({}, DEFAULT_SRS_DATA);
                } else {
                    const parsed = JSON.parse(data);
                    this.data = Object.assign(Object.assign({}, DEFAULT_SRS_DATA), parsed);
                    this.logDebug(
                        "[SR-Debug] Data loaded from disk. Items in JSON:",
                        parsed.items?.length,
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
            }
        } catch (error) {
            this.logError("Error loading data", error);
            this.data = Object.assign({}, DEFAULT_SRS_DATA);
            await this.save(); // 强制持久化一次，以防再次加载时仍丢失
        } finally {
            this.toInstances();
        }
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
    setdataPath(path = this.dataPath) {
        this.dataPath = path;
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
    async save(path = this.dataPath) {
        if (this.saveSuppressionCount > 0) {
            this.saveRequestedWhileSuppressed = true;
            return;
        }
        try {
            await Iadapter.instance.adapter.write(path, JSON.stringify(this.data));
            this.data.mtime = await this.getmtime();
            this.reviewItemOverlayById.clear();
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

    /**
     * getFileID — 根据文件路径查找对应的 fileID。
     *
     * @param {string} path
     * @returns {string} fileID | ""
     */
    getFileID(path: string): string {
        for (const [fileID, tf] of Object.entries(this.data.trackedFiles)) {
            if (tf != null && tf.path === path) {
                return fileID;
            }
        }
        return "";
    }

    /**
     * 兼容方法：返回数字型 fileIndex，用于尚未完全迁移的外部调用。
     * 找到返回 0，找不到返回 -1。
     */
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

    /**
     * 兼容方法：保留旧接口，内部不再使用。
     */
    getFileByIndex(idx: number): TrackedFile {
        // 兼容性保留，实际不应再被调用
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
        return ids.map(this.getItembyID.bind(this));
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

    getReviewedCounts() {
        return this.data.reviewedCounts;
    }
    getReviewedCardCounts(): ReviewedCounts {
        return this.data.reviewedCardCounts;
    }

    /**
     * reviewId.
     * update data according to response opt
     * @param {number} itemId
     * @param {string} option
     */
    reviewId(itemId: number, option: string | number) {
        const item = this.getItembyID(itemId);
        let result: ReviewResult;
        if (item == null) {
            return -1;
        }

        // [fix] select algorithm by item type: CARD -> FSRS, NOTE -> WMS
        let algorithm: SrsAlgorithm;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const plugin = (require("src/main") as any).default.getInstance();
            algorithm = plugin.getAlgorithmForItem(item.itemType);
        } catch {
            algorithm = SrsAlgorithm.getInstance();
        }
        if (typeof option === "number") {
            option = algorithm.srsOptions()[option] as string;
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
    }

    /**
     * untrackFilesInFolderPath.
     *
     * @param {string} path
     * @param {boolean} recursive
     */
    untrackFilesInFolderPath(path: string, recursive?: boolean) {
        const folder: TFolder = Iadapter.instance.vault.getAbstractFileByPath(path) as TFolder;

        if (folder != null) {
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
        const folder: TFolder = Iadapter.instance.vault.getAbstractFileByPath(path) as TFolder;

        if (folder != null) {
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
        const note = Iadapter.instance.vault.getAbstractFileByPath(path) as TFile;
        let cardName: string = null;

        if (note != null && trackedFile) {
            const fileCachedData = Iadapter.instance.metadataCache.getFileCache(note) || {};
            const tags = getAllTags(fileCachedData) || [];
            const deckname = Tags.getNoteDeckName(note, this.settings);
            cardName = Tags.getTagFromSettingTags(tags, this.settings.flashcardTags);
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

        // 1. 彻底清理 Note 级别的 items
        for (const key in trackedFile.items) {
            const id = trackedFile.items[key];
            if (id >= 0) {
                this.unTrackItem(id);
                numItems++;
            }
        }
        trackedFile.items = { file: -1 };

        // 2. 彻底清理所有的 Card items (不需要区分 cardName 或 setting 条件，既然 untrack，必须全清)
        if (trackedFile.hasCards) {
            const allCardIds = trackedFile.itemIDs;
            allCardIds
                .filter((id: number) => id >= 0)
                .forEach((id: number) => this.unTrackItem(id));
            numItems += allCardIds.length;

            // 3. 将 trackedItems 置空，彻底消除 JSON 幽灵卡残留
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
            return;
        }
        this.data.queues.remove(item);
        item.setUntracked();
        this.reviewItemOverlayById.delete(id);
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
        let algorithm: SrsAlgorithm;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const plugin = (require("src/main") as any).default.getInstance();
            algorithm = plugin.getAlgorithmForItem(itemType);
        } catch {
            algorithm = SrsAlgorithm.getInstance();
        }

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
        let removed = 0;

        if (trackedItem.reviewId === -1) {
            // 新卡（内容变了，或者新增的）：分配新 ID
            const cardId = this._updateItem(undefined, fileID, RPITEMTYPE.CARD, deckName);
            trackedItem.reviewId = cardId;
            added++;
        } else {
            // 旧卡（内容没变）：尝试获取现有 item
            const item = this.getItembyID(trackedItem.reviewId);
            if (item) {
                item.setTracked(fileID);
                item.updateDeckName(deckName, true);
            } else {
                // 异常情况：ID 存在但找不到 Item（可能是数据库损坏），视为新卡重新创建
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
            items.map(async (item, _idx) => {
                if (item != null && item.isTracked) {
                    // console.debug("verifyItems:", item, id);
                    const itemType = !this.isCardItem(item.ID) ? RPITEMTYPE.NOTE : RPITEMTYPE.CARD;
                    this._updateItem(item.ID, item.fileID, itemType, item.deckName);
                }
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
            if (this.settings.algorithm === algorithmNames.Fsrs) {
                const data: FsrsData = item.data as FsrsData;
                if (new Date(data.last_review) < new Date(date)) {
                    rc[date].due++;
                }
            } else {
                const data: AnkiData = item.data as AnkiData;
                if (data.lastInterval >= 1) {
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
    }

    /**
     * pruneData: delete unused storedata, fsrs's optimizer/writeRevlog() will be affected if using this func.
     * NulltFiles/NullItems
     * @returns
     */
    async pruneData() {
        const oldFileCount = Object.keys(this.data.trackedFiles).length;
        let removedItems = this.itemSize;

        this.data = MiscUtils.assignOnly(DEFAULT_SRS_DATA, this.data);

        // 过滤无效的 trackedFiles
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

        // 重建 items，确保 fileID 正确
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

        const removedtkfiles = oldFileCount - Object.keys(this.data.trackedFiles).length;
        removedItems = removedItems - this.itemSize;
        this.data.queues.clearQueue();
        this.save();

        return;
    }

    /**
     * 全局垃圾回收 (Global Garbage Collection)
     * 扫描所有 items，物理删除未被任何 TrackedFile 引用的条目。
     * 这是一个高开销操作 O(N)，应在低频场景调用。
     */
    async performGlobalGarbageCollection(): Promise<void> {
        this.logInfo("[SR-GC] 开始执行全局垃圾回收...");
        const trackedFiles = this.data.trackedFiles;

        // 1. 收集所有活跃的 ID (White List)
        const referencedIds = new Set<number>();
        for (const tkf of Object.values(trackedFiles)) {
            if (tkf == null) continue;
            // 收集 Note ID
            for (const key in tkf.items) {
                const id = tkf.items[key];
                if (typeof id === "number" && id >= 0) referencedIds.add(id);
            }
            // 收集 Card IDs
            if (tkf.hasCards && tkf.trackedItems) {
                for (const item of tkf.trackedItems) {
                    if (item.reviewId >= 0) referencedIds.add(item.reviewId);
                }
            }
        }

        const oldItemCount = this.data.items.length;

        // 2. 重建 items 数组 (Compact)
        const idMap = new Map<number, number>();
        const keptItems: RepetitionItem[] = [];

        for (const item of this.data.items) {
            if (item == null) continue;
            if (referencedIds.has(item.ID)) {
                const oldID = item.ID;
                const newID = keptItems.length;
                idMap.set(oldID, newID);
                item.ID = newID; // 更新 item 自身的 ID 属性
                keptItems.push(item);
            }
        }

        const purgedCount = oldItemCount - keptItems.length;

        if (purgedCount > 0) {
            // 3. 更新所有 TrackedFiles 中的引用
            for (const tkf of Object.values(trackedFiles)) {
                if (tkf == null) continue;

                // 更新 Note ID
                for (const key in tkf.items) {
                    const oldId = tkf.items[key];
                    if (idMap.has(oldId)) {
                        tkf.items[key] = idMap.get(oldId)!;
                    }
                }

                // 更新 Card IDs
                if (tkf.hasCards && tkf.trackedItems) {
                    for (const item of tkf.trackedItems) {
                        if (item.reviewId >= 0 && idMap.has(item.reviewId)) {
                            item.reviewId = idMap.get(item.reviewId)!;
                        }
                    }
                }
            }

            // 4. 替换全局 items
            this.data.items = keptItems;
            this.markItemByIdIndexDirty();
            this.reviewItemOverlayById.clear();
            this.logInfo(
                `[SR-GC] GC completed. Purged ${purgedCount} orphan items (${oldItemCount} -> ${keptItems.length})`,
            );

            // 5. 保存
            await this.save();
        } else {
            this.logInfo("[SR-GC] No cleanup needed.");
        }
    }
}
