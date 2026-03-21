/**
 * 这个文件主要是干什么的：
 * 负责管理复习队列 (Queue)。
 * 它的核心职责是决定“下一张卡片是谁”。
 * 它实现了每日新卡/复习卡的上限限制 (Limits)，并支持构建不同类型的复习队列。
 *
 * 它在项目中属于：逻辑层 (Logic Layer) / 数据层
 *
 * 它会用到哪些文件：
 * 1. src/dataStore/data.ts (数据源)
 * 2. src/dataStore/repetitionItem.ts (队列中的元素)
 * 3. src/settings.ts (获取每日限制设置)
 *
 * 哪些文件会用到它：
 * 1. src/dataStore/data.ts (持有 Queue 实例)
 * 2. src/FlashcardReviewSequencer.ts (虽然主要用迭代器，但底层可能依赖 Queue 的状态)
 */
/**
 * [数据层：负责数据的持久化、读取和内存状态管理] [核心] 复习队列管理，决定下一张卡片是谁。
 */
import { DateUtils, isArray, logExecutionTime } from "src/util/utils_recall";
import { DataStore } from "./data";
import { TrackedFile } from "./trackedFile";
import { RepetitionItem } from "./repetitionItem";
import { getKeysPreserveType } from "src/util/utils";
import { globalDateProvider } from "src/util/DateProvider";
import { DEFAULT_DECK_OPTIONS_PRESET, SRSettings } from "src/settings";

// 牌组限制类型
interface DeckLimit {
    maxNew: number;
    maxReview: number;
}

// 牌组计数器类型
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
     * 辅助方法：获取指定牌组的限制配置
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
     * 辅助方法：获取一个牌组的所有祖先路径（包括自己）
     * 输入: "A/B/C"
     * 输出: ["A", "A/B", "A/B/C"]
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
     * 实现 Anki 风格的层级限制
     */
    // @logExecutionTime()
    async buildQueue() {
        // console.log("Building queue...");
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

        let oldAdd = 0;
        let newAdd = 0;

        // === 层级限制：初始化缓存 ===
        const deckLimitsCache: Record<string, DeckLimit> = {};
        const deckCounts: Record<string, DeckCount> = {};

        // 辅助函数：获取或初始化计数器
        const getCount = (name: string): DeckCount => {
            if (!deckCounts[name]) deckCounts[name] = { new: 0, review: 0 };
            return deckCounts[name];
        };

        // 辅助函数：获取或初始化限制 (带缓存)
        const getLimit = (name: string): DeckLimit => {
            if (!deckLimitsCache[name])
                deckLimitsCache[name] = this.getLimitsForDeck(name, settings);
            return deckLimitsCache[name];
        };

        let untrackedFiles = 0;
        let removedItems = 0;
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
                    removedItems += store.untrackFile(file.path, false);
                    untrackedFiles += 1;
                    // new Notice("untrackfile by buildqueue:" + file);
                }
                return exists;
            }),
        );
        const validItems = store.items.filter((item) => item != null && item.isTracked);

        // === 使用层级限制处理卡片 ===
        for (const item of validItems.filter((item) => !item.isCard)) {
            const currentDeckName = item.deckName;
            const lineage = this.getDeckLineage(currentDeckName);

            if (item.isNew) {
                // --- 新卡片：检查层级限制 ---
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
                    newAdd += this.push(this.queue[KEY_ALL], item.ID);
                    // 更新整条路径上的计数器
                    for (const deckPath of lineage) {
                        getCount(deckPath).new++;
                    }
                }
            } else {
                // --- 复习卡片：检查是否到期并应用层级限制 ---
                this.InitQIfMissing(item.deckName, this.queue);

                const isDueNow = item.nextReview <= now.getTime();
                const isDueToday =
                    newDayFlag && item.nextReview <= globalDateProvider.endofToday.valueOf();

                if (isDueNow || isDueToday) {
                    // 检查层级限制
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
                            oldAdd += this.push(this.queue[KEY_ALL], item.ID);
                        } else {
                            this.push(this.queue[item.deckName], item.ID);
                        }
                        // 更新整条路径上的计数器
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

        // console.log(
        //     "Added " + (oldAdd + newAdd) + " notes to review queue, with " + newAdd + " new!",
        // );
        // console.log(
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
        if (!queueR) {
            queueR = this.queue;
        }
        return Object.prototype.hasOwnProperty.call(queueR, key);
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
