/**
 * 杩欎釜鏂囦欢涓昏鏄共浠€涔堢殑锛?
 * 璐熻矗绠＄悊澶嶄範闃熷垪 (Queue)銆?
 * 瀹冪殑鏍稿績鑱岃矗鏄喅瀹氣€滀笅涓€寮犲崱鐗囨槸璋佲€濄€?
 * 瀹冨疄鐜颁簡姣忔棩鏂板崱/澶嶄範鍗＄殑涓婇檺闄愬埗 (Limits)锛屽苟鏀寔鏋勫缓涓嶅悓绫诲瀷鐨勫涔犻槦鍒椼€?
 *
 * 瀹冨湪椤圭洰涓睘浜庯細閫昏緫灞?(Logic Layer) / 鏁版嵁灞?
 *
 * 瀹冧細鐢ㄥ埌鍝簺鏂囦欢锛?
 * 1. src/dataStore/data.ts (鏁版嵁婧?
 * 2. src/dataStore/repetitionItem.ts (闃熷垪涓殑鍏冪礌)
 * 3. src/settings.ts (鑾峰彇姣忔棩闄愬埗璁剧疆)
 *
 * 鍝簺鏂囦欢浼氱敤鍒板畠锛?
 * 1. src/dataStore/data.ts (鎸佹湁 Queue 瀹炰緥)
 * 2. src/FlashcardReviewSequencer.ts (铏界劧涓昏鐢ㄨ凯浠ｅ櫒锛屼絾搴曞眰鍙兘渚濊禆 Queue 鐨勭姸鎬?
 */
/**
 * [鏁版嵁灞傦細璐熻矗鏁版嵁鐨勬寔涔呭寲銆佽鍙栧拰鍐呭瓨鐘舵€佺鐞哴 [鏍稿績] 澶嶄範闃熷垪绠＄悊锛屽喅瀹氫笅涓€寮犲崱鐗囨槸璋併€?
 */
import { isArray } from "src/util/utils_recall";
import { DataStore } from "./data";
import { TrackedFile } from "./trackedFile";
import { RepetitionItem } from "./repetitionItem";
import { getKeysPreserveType } from "src/util/utils";
import { globalDateProvider } from "src/util/DateProvider";
import { DEFAULT_DECK_OPTIONS_PRESET, SRSettings } from "src/settings";

// 鐗岀粍闄愬埗绫诲瀷
interface DeckLimit {
    maxNew: number;
    maxReview: number;
}

// 鐗岀粍璁℃暟鍣ㄧ被鍨?
interface DeckCount {
    new: number;
    review: number;
}

export interface IQueue {
    /**
     * @type {number[]}
     */
    queue: Record<string, number[]>;
    /**
     * @type {number[]}
     */
    repeatQueue: number[];

    toDayAllQueue: Record<number, string>;
    toDayLaterQueue: Record<number, string>;

    /**
     * @type {number}
     */
    lastQueue: number;
    /**
     * @type {0}
     */
    newAdded: 0;
}

export const DEFAULT_QUEUE_DATA: IQueue = {
    /**
     * @type {number[]}
     */
    queue: {},
    /**
     * @type {number[]}
     */
    repeatQueue: [],

    toDayAllQueue: {},
    toDayLaterQueue: {},
    /**
     * @type {number}
     */
    lastQueue: 0,
    /**
     * @type {0}
     */
    newAdded: 0,
};

const KEY_ALL = "ALL";

export class Queue implements IQueue {
    static instance: Queue;
    /**
     * @type {number[]}
     * e.g. review: [1,2,3]
     */
    queue: Record<string, number[]>;
    /**
     * @type {number[]}
     */
    repeatQueue: number[];

    toDayAllQueue: Record<number, string>;
    toDayLaterQueue: Record<number, string>;

    // maxNewPerDay: number;
    lastQueue: number;
    /**
     * @type {0}
     */
    newAdded: 0;

    public static getInstance(): Queue {
        if (!Queue.instance) {
            // Queue.instance = new Queue();
            throw Error("there is not Queue instance.");
        }
        return Queue.instance;
    }

    static create(que: Queue) {
        que = Object.assign(new Queue(), que);
        return que;
    }
    constructor() {
        this.queue = {};
        this.repeatQueue = [];
        this.toDayAllQueue = {};
        this.toDayLaterQueue = {};
        Queue.instance = this;
    }

    /**
     * Returns the size of the current queue.
     */
    /**
     * queueSize.
     *
     * @returns {number}
     */
    queueSize(key?: string): number {
        if (key == undefined) {
            key = KEY_ALL;
        }
        return this.queue[key]?.length ?? 0;
    }
    get laterSize(): number {
        const len = Object.keys(this.toDayLaterQueue).length;
        if (len) {
            return len;
        }
        const keys = Object.keys(this.queue);
        keys.remove(KEY_ALL);
        return keys
            .map((key: string) => this.queueSize(key))
            .reduce((a: number, b: number) => a + b, 0);
    }

    /**
     * repeatQueueSize.
     *
     * @returns {number}
     */
    repeatQueueSize(): number {
        return this.repeatQueue.length;
    }
    /**
     * getNextId.
     *
     * @returns {number | null}
     */
    getNextId(key?: string): number | null {
        key = key ? key : KEY_ALL;
        if (this.queueSize(key) > 0) {
            return this.queue[key][0];
        } else if (this.repeatQueue.length > 0) {
            return this.repeatQueue[0];
        } else {
            return null;
        }
    }

    /**
     * 杈呭姪鏂规硶锛氳幏鍙栨寚瀹氱墝缁勭殑闄愬埗閰嶇疆
     */
    private getLimitsForDeck(deckName: string, settings: SRSettings): DeckLimit {
        const presetIndex = settings.deckPresetAssignment[deckName] ?? 0;
        const preset = settings.deckOptionsPresets[presetIndex] || DEFAULT_DECK_OPTIONS_PRESET;
        return {
            maxNew: preset.maxNewCards,
            maxReview: preset.maxReviews,
        };
    }

    /**
     * 杈呭姪鏂规硶锛氳幏鍙栦竴涓墝缁勭殑鎵€鏈夌鍏堣矾寰勶紙鍖呮嫭鑷繁锛?
     * 杈撳叆: "A/B/C"
     * 杈撳嚭: ["A", "A/B", "A/B/C"]
     */
    private getDeckLineage(deckName: string): string[] {
        const parts = deckName.split("/");
        const lineage: string[] = [];
        let currentPath = "";
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            lineage.push(currentPath);
        }
        return lineage;
    }

    /**
     * buildQueue. indexlist of items
     * 瀹炵幇 Anki 椋庢牸鐨勫眰绾ч檺鍒?
     */
    // @logExecutionTime()
    async buildQueue() {
        // console.debug("Building queue...");
        const store = DataStore.getInstance();
        const settings = store.settings;
        const now: Date = new Date();
        let newDayFlag = false;

        if (now.getDate() != new Date(this.lastQueue).getDate()) {
            this.newAdded = 0;
            this.clearQueue();
            newDayFlag = true;
        }

        this.InitQIfMissing(KEY_ALL, this.queue);

        // === 灞傜骇闄愬埗锛氬垵濮嬪寲缂撳瓨 ===
        const deckLimitsCache: Record<string, DeckLimit> = {};
        const deckCounts: Record<string, DeckCount> = {};

        // 杈呭姪鍑芥暟锛氳幏鍙栨垨鍒濆鍖栬鏁板櫒
        const getCount = (name: string): DeckCount => {
            if (!deckCounts[name]) deckCounts[name] = { new: 0, review: 0 };
            return deckCounts[name];
        };

        // 杈呭姪鍑芥暟锛氳幏鍙栨垨鍒濆鍖栭檺鍒?(甯︾紦瀛?
        const getLimit = (name: string): DeckLimit => {
            if (!deckLimitsCache[name])
                deckLimitsCache[name] = this.getLimitsForDeck(name, settings);
            return deckLimitsCache[name];
        };

        const bUnTfiles = new Set<TrackedFile>();
        await Promise.all(
            Object.values(store.data.trackedFiles).map(async (file, _idx) => {
                if (file?.path == undefined || !file.tags || file.tags.length === 0) return false;
                let exists = await store.verify(file.path);
                if (!exists) {
                    // in case file moved away.
                    exists = store.updateMovedFile(file);
                }
                if (!exists && !bUnTfiles.has(file)) {
                    bUnTfiles.add(file);
                    store.untrackFile(file.path, false);
                    // new Notice("untrackfile by buildqueue:" + file);
                }
                return exists;
            }),
        );
        const validItems = store.items.filter((item) => item != null && item.isTracked);

        // === 浣跨敤灞傜骇闄愬埗澶勭悊鍗＄墖 ===
        for (const item of validItems.filter((item) => !item.isCard)) {
            const currentDeckName = item.deckName;
            const lineage = this.getDeckLineage(currentDeckName);

            if (item.isNew) {
                // --- 鏂板崱鐗囷細妫€鏌ュ眰绾ч檺鍒?---
                let canAdd = true;
                for (const deckPath of lineage) {
                    const limit = getLimit(deckPath);
                    const count = getCount(deckPath);
                    if (count.new >= limit.maxNew) {
                        canAdd = false;
                        break;
                    }
                }

                if (canAdd) {
                    this.push(this.queue[KEY_ALL], item.ID);
                    // 鏇存柊鏁存潯璺緞涓婄殑璁℃暟鍣?
                    for (const deckPath of lineage) {
                        getCount(deckPath).new++;
                    }
                }
            } else {
                // --- 澶嶄範鍗＄墖锛氭鏌ユ槸鍚﹀埌鏈熷苟搴旂敤灞傜骇闄愬埗 ---
                this.InitQIfMissing(item.deckName, this.queue);

                const isDueNow = item.nextReview <= now.getTime();
                const isDueToday =
                    newDayFlag && item.nextReview <= globalDateProvider.endofToday.valueOf();

                if (isDueNow || isDueToday) {
                    // 妫€鏌ュ眰绾ч檺鍒?
                    let canAdd = true;
                    for (const deckPath of lineage) {
                        const limit = getLimit(deckPath);
                        const count = getCount(deckPath);
                        if (count.review >= limit.maxReview) {
                            canAdd = false;
                            break;
                        }
                    }

                    if (canAdd) {
                        if (isDueNow) {
                            this.remove(item, this.repeatQueue);
                            this.push(this.queue[KEY_ALL], item.ID);
                        } else {
                            this.push(this.queue[item.deckName], item.ID);
                        }
                        // 鏇存柊鏁存潯璺緞涓婄殑璁℃暟鍣?
                        for (const deckPath of lineage) {
                            getCount(deckPath).review++;
                        }
                    }
                }
            }
        }

        this.lastQueue = now.getTime();
        // if (this.settings.shuffleQueue && oldAdd + newAdd > 0) {
        //     MiscUtils.shuffle(data.queue);
        // }

        // console.debug(
        //     "Added " + (oldAdd + newAdd) + " notes to review queue, with " + newAdd + " new!",
        // );
        // console.debug(
        //     "Added " +
        //         (oldAdd_card + newAdd_card) +
        //         " cards to review queue, with " +
        //         newAdd_card +
        //         " new!",
        // );
    }

    buildQueueAll() {
        const store = DataStore.getInstance();
        this.queue[KEY_ALL] = [];
        const items = store.data.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i] != null || items[i].isTracked) {
                this.queue[KEY_ALL].push(i);
            }
        }
    }

    // loadRepeatQueue(rvdecks: { [deckKey: string]: ReviewDeck }) {
    //     if (this.repeatQueueSize() > 0) {
    //         // const repeatDeckCounts: Record<string, number> = {};
    //         this.repeatQueue.forEach((id) => {
    //             const dname: string = this.getItembyID(id).deckName;
    //             // this.toDayAllQueue[id] = dname;
    //             // if (!Object.keys(repeatDeckCounts).includes(dname)) {
    //             //     repeatDeckCounts[dname] = 0;
    //             // }
    //             this.plugin.dueNotesCount++;
    //         });
    //         // return repeatDeckCounts;
    //     }
    // }

    clearQueue(queue: unknown = null) {
        if (queue == null) {
            this.queue = {};
            this.repeatQueue = [];
            this.toDayAllQueue = {};
            this.toDayLaterQueue = {};
        } else if (isArray(queue)) {
            queue = [];
        } else {
            queue = {};
        }
    }

    /**
     * isQueued.
     *
     * @param {number} id
     * @returns {boolean}
     */
    isQueued(queue: number[], id: number): boolean {
        return queue?.includes(id) ?? false;
    }

    isInLaterQueue(id: number): boolean {
        return Object.keys(this.toDayLaterQueue).includes(id.toString());
    }
    InitQIfMissing(key: string, queueR?: Record<string, number[]>): void {
        if (!this.hasQueue(key, queueR)) queueR[key] = [];
    }

    hasQueue(key: string, queueR?: Record<string, number[]>): boolean {
        const target = queueR ?? this.queue;
        return Reflect.ownKeys(target).some((existingKey) => existingKey === key);
    }

    /**
     * isInRepeatQueue.
     *
     * @param {number} item
     * @returns {boolean}
     */
    isInRepeatQueue(item: number): boolean {
        return this.repeatQueue.includes(item);
    }

    updateWhenReview(item: RepetitionItem, correct: boolean, repeatItems: boolean) {
        if (this.isInRepeatQueue(item.ID)) {
            this.remove(item, this.repeatQueue);
        }
        this.remove(item, this.queue[KEY_ALL]);
        this.remove(item, this.queue[item.deckName]);
        if (repeatItems && !correct) {
            this.push(this.repeatQueue, item.ID); // Re-add until correct.
        } else {
            // update this.toDayLaterQueue
            const store = DataStore.getInstance();
            delete this.toDayLaterQueue[item.ID];
            if (item.nextReview <= globalDateProvider.endofToday.valueOf()) {
                this.toDayLaterQueue[item.ID] = item.deckName;
            }
            getKeysPreserveType(this.toDayLaterQueue)
                .map((idStr) => {
                    const id: number = Number(idStr);
                    return store.getItembyID(id);
                })
                .forEach((item) => {
                    if (item == null) {
                        return;
                    }
                    if (item.nextReview - Date.now() < 0) {
                        delete this.toDayLaterQueue[item.ID];
                    }
                });
        }
    }

    remove(item: RepetitionItem, queue?: number[]) {
        if (item == null) {
            return;
        }
        if (queue == undefined) {
            if (this.isQueued(this.queue[item.deckName], item.ID)) {
                this.remove(item, this.queue[item.deckName]);
                this.remove(item, this.repeatQueue);
            }
            if (this.isQueued(this.queue[KEY_ALL], item.ID)) {
                this.remove(item, this.queue[KEY_ALL]);
            }

            if (this.toDayLaterQueue[item.ID] !== null) {
                delete this.toDayLaterQueue[item.ID];
            }
        } else {
            if (this.isQueued(queue, item.ID)) {
                queue.remove(item.ID);
            }
        }
    }
    push(queue: number[], id: number) {
        let cnt = 0;
        if (this.isQueued(queue, id)) {
            return cnt;
        }
        queue.push(id);
        cnt++;
        return cnt;
    }
}

