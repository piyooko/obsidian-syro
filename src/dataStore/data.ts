/**
 * 杩欎釜鏂囦欢涓昏鏄共浠€涔堢殑锛?
 * [鏍稿績] 鏁版嵁涓績鍗曚緥 (DataStore)銆?
 * 瀹冩槸鏁翠釜鎻掍欢鍐呭瓨鏁版嵁鐨勨€滄€讳粨搴撯€濓紝绠＄悊鎵€鏈夌殑澶嶄範椤?Items)銆佽拷韪枃浠?TrackedFiles)鍜屽涔犻槦鍒?Queues)銆?
 * 璐熻矗鏁版嵁鐨勫姞杞?Load)銆佷繚瀛?Save)浠ュ強涓庣鐩樻枃浠剁殑鍚屾銆?
 * 鍒涘缓鏂扮殑澶嶄範椤规椂锛屼細鏍规嵁椤圭洰绫诲瀷锛堝崱鐗囩敤 FSRS锛岀瑪璁扮敤鍔犳潈涔樻硶锛夐€夋嫨姝ｇ‘鐨勭畻娉曟潵鐢熸垚鍒濆鏁版嵁銆?
 * 杩借釜鏂囦欢浣跨敤鍞竴鐨?fileID 瀛楃涓蹭綔涓洪敭锛堣€屼笉鏄暟缁勪笅鏍囷級锛?
 * 杩欐牱鏃犺鏂囦欢鎬庝箞澧炲垹鎺掑簭锛屽涔犻」鍜屾枃浠剁殑鍏宠仈鍏崇郴閮戒笉浼氶敊浣嶃€?
 *
 * 瀹冨湪椤圭洰涓睘浜庯細鏁版嵁灞?(Data Layer)
 *
 * 瀹冧細鐢ㄥ埌鍝簺鏂囦欢锛?
 * 1. src/dataStore/queue.ts (闃熷垪绠＄悊)
 * 2. src/dataStore/repetitionItem.ts (澶嶄範椤规暟鎹ā鍨?
 * 3. src/dataStore/adapter.ts (鏂囦欢绯荤粺閫傞厤鍣?
 * 4. src/main.ts (鑾峰彇鍗＄墖/绗旇瀵瑰簲鐨勭畻娉曞疄渚?
 *
 * 鍝簺鏂囦欢浼氱敤鍒板畠锛?
 * 1. src/FlashcardReviewSequencer.ts (鑾峰彇鍗＄墖瀵瑰簲鐨勮皟搴︽暟鎹?
 * 2. src/algorithms/*.ts (绠楁硶闇€瑕佽鍙栧巻鍙叉暟鎹?
 * 3. 鍑犱箮鎵€鏈夐渶瑕佽闂叏灞€鐘舵€佺殑 UI 缁勪欢
 */
/**
 * [鏁版嵁灞傦細璐熻矗鏁版嵁鐨勬寔涔呭寲銆佽鍙栧拰鍐呭瓨鐘舵€佺鐞哴 [鏍稿績] 鏁版嵁涓績鍗曚緥 (DataStore)锛岀鐞嗗唴瀛樹腑鐨勬墍鏈夋暟鎹紙鍗＄墖銆侀槦鍒椼€佹枃浠惰拷韪級銆?
 */
import { MiscUtils, debug } from "src/util/utils_recall";
import { SRSettings } from "../settings";
import SRPlugin from "src/main";

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
     * key = fileID锛堝 "f_8d29aa"锛夛紝鐢ㄥ敮涓€瀛楃涓蹭綔涓洪敭锛屼笉鍐嶄娇鐢ㄦ暟缁勪笅鏍?
     */
    trackedFiles: Record<string, TrackedFile>;
    /**
     * 浠呯敤浜庡睍绀洪『搴忥紝鍏冪礌鏄?fileID
     */
    fileOrder: string[];

    /**
     * @type {number}
     */
    mtime: number;
}

export type ReviewedCounts = Record<string, { new: number; due: number }>;

/**
 * 鐢熸垚涓€涓敮涓€鐨勬枃浠?ID锛屾牸寮忎负 "f_" + 6 浣嶉殢鏈哄瓧绗?
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

type LegacyFileIndexItem = RepetitionItem & {
    fileIndex?: string | number;
    fileID?: string;
};

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

    private getAlgorithmForItemType(itemType: RPITEMTYPE): SrsAlgorithm {
        try {
            return SRPlugin.getInstance()?.getAlgorithmForItem(itemType) ?? SrsAlgorithm.getInstance();
        } catch {
            return SrsAlgorithm.getInstance();
        }
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
        // 鈻堚枅 鏁版嵁杩佺Щ锛氭棫鏍煎紡锛堟暟缁勶級鈫?鏂版牸寮忥紙Record + fileOrder锛夆枅鈻?
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

            // 杩佺Щ鎵€鏈?item 鐨?fileIndex 鈫?fileID
            for (const item of this.data.items) {
                if (item == null) continue;
                const legacyItem = item as LegacyFileIndexItem;
                const oldIndex = legacyItem.fileIndex;
                const normalizedOldIndex = typeof oldIndex === "number" ? oldIndex : Number(oldIndex);
                if (oldIndex !== undefined) {
                    legacyItem.fileID =
                        Number.isNaN(normalizedOldIndex) ? "" : indexToID.get(normalizedOldIndex) || "";
                    delete legacyItem.fileIndex;
                }
            }

            this.data.trackedFiles = newFiles;
            this.data.fileOrder = fileOrder;
            this.logInfo(`[SR] 鏁版嵁杩佺Щ瀹屾垚: ${oldFiles.length} 鈫?${fileOrder.length} 鏂囦欢`);
        } else {
            // 鏂版牸寮忥細灏?TrackedFile 瀵硅薄杞负瀹炰緥
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
        // 杩佺Щ锛氫慨澶?CARD 绫诲瀷 item 浣跨敤浜嗛敊璇畻娉曞垵濮嬫暟鎹殑闂
        this.migrateCardItemsToFsrs();
        this.logDebug(
            `[SR-Debug] toInstances complete. Final items count: ${this.data.items.length}`,
        );
    }

    /**
     * 鏁版嵁杩佺Щ锛氬皢 CARD 绫诲瀷 item 涓敊璇殑 WMS 鏁版嵁鏍煎紡杞崲涓?FSRS 鏍煎紡銆?
     * 鍙鏂板崱锛堜粠鏈涔犺繃鐨勶級鎵ц閲嶇疆锛屽凡澶嶄範鐨勫崱鐗囧彧璁板綍璀﹀憡銆?
     */
    private migrateCardItemsToFsrs() {
        let migratedCount = 0;
        for (const item of this.data.items) {
            if (item == null) continue;
            if (item.itemType !== RPITEMTYPE.CARD) continue;
            // 濡傛灉宸茬粡鏄?FSRS 鏍煎紡锛堝惈 state 瀛楁锛夛紝璺宠繃
            if (item.isFsrs) continue;

            if (item.timesReviewed === 0) {
                // 鏂板崱锛氬畨鍏ㄥ湴閲嶇疆涓?FSRS 绌哄崱鏁版嵁
                item.data = createEmptyCard();
                migratedCount++;
            } else {
                // 宸插涔犺繃鐨勫崱锛氫笉鍋氱牬鍧忔€т慨鏀癸紝浠呰褰曡鍛?
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
     * 娓呯悊鑴忔暟鎹細灏?timesReviewed === 0 浣嗗寘鍚畫鐣欒皟搴︽暟鎹垨瀛︿範鐘舵€佺殑 Item 閲嶇疆涓哄共鍑€鐨?New 鐘舵€?
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
                    if (data && Number(data.state) !== 0) needsClean = true;
                } else if (item.itemType === RPITEMTYPE.CARD) {
                    const data = item.data as AnkiData;
                    if (data && (data.lastInterval !== 0 || data.iteration !== 0))
                        needsClean = true;
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
            await this.save(); // 寮哄埗鎸佷箙鍖栦竴娆★紝浠ラ槻鍐嶆鍔犺浇鏃朵粛涓㈠け
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
     * getFileID 鈥?鏍规嵁鏂囦欢璺緞鏌ユ壘瀵瑰簲鐨?fileID銆?
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
     * 鍏煎鏂规硶锛氳繑鍥炴暟瀛楀瀷 fileIndex锛岀敤浜庡皻鏈畬鍏ㄨ縼绉荤殑澶栭儴璋冪敤銆?
     * 鎵惧埌杩斿洖 0锛屾壘涓嶅埌杩斿洖 -1銆?
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
     * 鍏煎鏂规硶锛氫繚鐣欐棫鎺ュ彛锛屽唴閮ㄤ笉鍐嶄娇鐢ㄣ€?
     */
    getFileByIndex(idx: number): TrackedFile {
        // 鍏煎鎬т繚鐣欙紝瀹為檯涓嶅簲鍐嶈璋冪敤
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
    reviewId(itemId: number, option: string | number): ReviewResult | null {
        const item = this.getItembyID(itemId);
        let result: ReviewResult;
        if (item == null) {
            return null;
        }

        // [fix] select algorithm by item type: CARD -> FSRS, NOTE -> WMS
        const algorithm = this.getAlgorithmForItemType(item.itemType);
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

        // 1. 褰诲簳娓呯悊 Note 绾у埆鐨?items
        for (const key in trackedFile.items) {
            const id = trackedFile.items[key];
            if (id >= 0) {
                this.unTrackItem(id);
                numItems++;
            }
        }
        trackedFile.items = { file: -1 };

        // 2. 褰诲簳娓呯悊鎵€鏈夌殑 Card items (涓嶉渶瑕佸尯鍒?cardName 鎴?setting 鏉′欢锛屾棦鐒?untrack锛屽繀椤诲叏娓?
        if (trackedFile.hasCards) {
            const allCardIds = trackedFile.itemIDs;
            allCardIds
                .filter((id: number) => id >= 0)
                .forEach((id: number) => this.unTrackItem(id));
            numItems += allCardIds.length;

            // 3. 灏?trackedItems 缃┖锛屽交搴曟秷闄?JSON 骞界伒鍗℃畫鐣?
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
        let removed = 0;

        if (trackedItem.reviewId === -1) {
            // 鏂板崱锛堝唴瀹瑰彉浜嗭紝鎴栬€呮柊澧炵殑锛夛細鍒嗛厤鏂?ID
            const cardId = this._updateItem(undefined, fileID, RPITEMTYPE.CARD, deckName);
            trackedItem.reviewId = cardId;
            added++;
        } else {
            // 鏃у崱锛堝唴瀹规病鍙橈級锛氬皾璇曡幏鍙栫幇鏈?item
            const item = this.getItembyID(trackedItem.reviewId);
            if (item) {
                item.setTracked(fileID);
                item.updateDeckName(deckName, true);
            } else {
                // 寮傚父鎯呭喌锛欼D 瀛樺湪浣嗘壘涓嶅埌 Item锛堝彲鑳芥槸鏁版嵁搴撴崯鍧忥級锛岃涓烘柊鍗￠噸鏂板垱寤?
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
            if (String(this.settings.algorithm) === String(algorithmNames.Fsrs)) {
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

        // 杩囨护鏃犳晥鐨?trackedFiles
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

        // 閲嶅缓 items锛岀‘淇?fileID 姝ｇ‘
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
        await this.save();

        return;
    }

    /**
     * 鍏ㄥ眬鍨冨溇鍥炴敹 (Global Garbage Collection)
     * 鎵弿鎵€鏈?items锛岀墿鐞嗗垹闄ゆ湭琚换浣?TrackedFile 寮曠敤鐨勬潯鐩€?
     * 杩欐槸涓€涓珮寮€閿€鎿嶄綔 O(N)锛屽簲鍦ㄤ綆棰戝満鏅皟鐢ㄣ€?
     */
    async performGlobalGarbageCollection(): Promise<void> {
        this.logInfo("[SR-GC] 寮€濮嬫墽琛屽叏灞€鍨冨溇鍥炴敹...");
        const trackedFiles = this.data.trackedFiles;

        // 1. 鏀堕泦鎵€鏈夋椿璺冪殑 ID (White List)
        const referencedIds = new Set<number>();
        for (const tkf of Object.values(trackedFiles)) {
            if (tkf == null) continue;
            // 鏀堕泦 Note ID
            for (const key in tkf.items) {
                const id = tkf.items[key];
                if (typeof id === "number" && id >= 0) referencedIds.add(id);
            }
            // 鏀堕泦 Card IDs
            if (tkf.hasCards && tkf.trackedItems) {
                for (const item of tkf.trackedItems) {
                    if (item.reviewId >= 0) referencedIds.add(item.reviewId);
                }
            }
        }

        const oldItemCount = this.data.items.length;

        // 2. 閲嶅缓 items 鏁扮粍 (Compact)
        const idMap = new Map<number, number>();
        const keptItems: RepetitionItem[] = [];

        for (const item of this.data.items) {
            if (item == null) continue;
            if (referencedIds.has(item.ID)) {
                const oldID = item.ID;
                const newID = keptItems.length;
                idMap.set(oldID, newID);
                item.ID = newID; // 鏇存柊 item 鑷韩鐨?ID 灞炴€?
                keptItems.push(item);
            }
        }

        const purgedCount = oldItemCount - keptItems.length;

        if (purgedCount > 0) {
            // 3. 鏇存柊鎵€鏈?TrackedFiles 涓殑寮曠敤
            for (const tkf of Object.values(trackedFiles)) {
                if (tkf == null) continue;

                // 鏇存柊 Note ID
                for (const key in tkf.items) {
                    const oldId = tkf.items[key];
                    if (idMap.has(oldId)) {
                        tkf.items[key] = idMap.get(oldId)!;
                    }
                }

                // 鏇存柊 Card IDs
                if (tkf.hasCards && tkf.trackedItems) {
                    for (const item of tkf.trackedItems) {
                        if (item.reviewId >= 0 && idMap.has(item.reviewId)) {
                            item.reviewId = idMap.get(item.reviewId)!;
                        }
                    }
                }
            }

            // 4. 鏇挎崲鍏ㄥ眬 items
            this.data.items = keptItems;
            this.markItemByIdIndexDirty();
            this.reviewItemOverlayById.clear();
            this.logInfo(
                `[SR-GC] GC completed. Purged ${purgedCount} orphan items (${oldItemCount} -> ${keptItems.length})`,
            );

            // 5. 淇濆瓨
            await this.save();
        } else {
            this.logInfo("[SR-GC] No cleanup needed.");
        }
    }
}


