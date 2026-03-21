/**
 * 这个文件主要是干什么的：
 * 定义插件提供的所有命令（例如‘全局同步卡片’、‘推迟复习’等）。
 * 这些命令会出现在 Obsidian 的命令面板中，用户可以通过快捷键或菜单触发。
 * 其中最重要的“全局同步卡片”命令会遍历所有追踪文件，清理幽灵数据，确保磁盘数据反映实际情况。
 * 追踪文件使用 fileID 字符串作为唯一标识，不再依赖数组下标。
 *
 * 它在项目中属于：逻辑层 (Logic Layer)
 *
 * 它会用到哪些文件：
 * 1. src/dataStore/data.ts
 * 2. src/dataStore/trackedFile.ts
 * 3. src/dataStore/repetitionItem.ts
 *
 * 哪些文件会用到它：
 * 1. src/main.ts (插件启动时注册这些命令)
 */
/**
 * [入口] 注册 Obsidian 命令面板中的命令。
 */
import { MarkdownView, Notice, TFile } from "obsidian";
import ObsidianSrsPlugin from "./main";
import { ItemInfoModal } from "src/ui/modals/info";
import { Queue } from "./dataStore/queue";
import { debug } from "./util/utils_recall";
import { RPITEMTYPE } from "./dataStore/repetitionItem";
import { postponeItems } from "./algorithms/balance/postpone";
import { GetInputModal } from "./ui/modals/getInputModal";
import { ReviewView } from "./ui/views/reviewView";
import { FlashcardReviewMode } from "src/scheduling";
import { t } from "src/lang/helpers";
import { SyncProgressTip } from "src/ui/components/SyncProgressTip";
import { DEFAULT_DECKNAME } from "src/constants";
import { Tags } from "src/tags";

export default class Commands {
    plugin: ObsidianSrsPlugin;

    constructor(plugin: ObsidianSrsPlugin) {
        this.plugin = plugin;
    }

    addCommands() {
        const plugin = this.plugin;

        plugin.addCommand({
            id: "track-file",
            name: t("CMD_TRACK_NOTE"),
            checkCallback: (checking: boolean) => {
                const file = plugin.app.workspace.getActiveFile();
                if (file != null) {
                    if (!plugin.noteReviewStore.isTracked(file.path)) {
                        if (!checking) {
                            const deckName = Tags.getNoteDeckName(file, plugin.data.settings);
                            plugin.noteReviewStore.ensureTracked(
                                file.path,
                                deckName ?? DEFAULT_DECKNAME,
                                deckName ? "tag" : "manual",
                                plugin.noteAlgorithm,
                            );
                            plugin.noteReviewStore.save();
                            plugin.refreshNoteReview({ trigger: "manual" });
                        }
                        return true;
                    }
                }
                return false;
            },
        });

        plugin.addCommand({
            id: "untrack-file",
            name: t("CMD_UNTRACK_NOTE"),
            checkCallback: (checking: boolean) => {
                const file = plugin.app.workspace.getActiveFile();
                if (file != null) {
                    if (plugin.noteReviewStore.isTracked(file.path)) {
                        if (!checking) {
                            plugin.noteReviewStore.remove(file.path);
                            plugin.noteReviewStore.save();
                            plugin.refreshNoteReview({ trigger: "manual" });
                        }
                        return true;
                    }
                }
                return false;
            },
        });

        plugin.addCommand({
            id: "postpone-note-manual",
            name: t("CMD_POSTPONE_NOTE_MANUAL"),
            checkCallback: (checking: boolean) => {
                const file = plugin.app.workspace.getActiveFile();
                const settings = plugin.data.settings;
                if (file != null) {
                    const noteItem = plugin.noteReviewStore.getItem(file.path);
                    if (noteItem) {
                        if (!checking) {
                            const input = new GetInputModal(
                                plugin.app,
                                t("CMD_INPUT_POSITIVE_NUMBER"),
                            );
                            input.submitCallback = async (days: number) => {
                                postponeItems([noteItem], days);
                                await plugin.noteReviewStore.save();
                                new Notice(t("CMD_NOTE_POSTPONED", { days: days }));
                                plugin.updateAndSortDueNotes();
                                plugin.syncEvents.emit("note-review-updated");
                                if (settings.autoNextNote && plugin.lastSelectedReviewDeck) {
                                    plugin.reviewNextNote(plugin.lastSelectedReviewDeck);
                                }
                            };
                            input.open();
                        }
                        return true;
                    }
                }
                return false;
            },
        });

        plugin.addCommand({
            id: "postpone-cards-manual",
            name: t("CMD_POSTPONE_CARDS_MANUAL"),
            checkCallback: (checking: boolean) => {
                const file = plugin.app.workspace.getActiveFile();
                if (file != null) {
                    const tkFile = plugin.store.getTrackedFile(file.path);
                    if (tkFile) {
                        if (!checking) {
                            const tkfile = plugin.store.getTrackedFile(file.path);
                            const input = new GetInputModal(
                                plugin.app,
                                t("CMD_INPUT_POSITIVE_NUMBER"),
                            );
                            input.submitCallback = (days: number) =>
                                postponeItems(
                                    tkfile.itemIDs
                                        .map((id: number) => {
                                            return plugin.store.getItembyID(id);
                                        })
                                        .filter((i: any) => i && i.itemType === RPITEMTYPE.CARD),
                                    days,
                                );
                            input.open();

                            // plugin.store.save();
                            plugin.sync();
                        }
                        return true;
                    }
                }
                return false;
            },
        });

        // plugin.addCommand({
        //     id: "update-file",
        //     name: "Update Note",
        //     checkCallback: (checking: boolean) => {
        //         const file = plugin.app.workspace.getActiveFile();
        //         if (file != null) {
        //             if (plugin.store.isTracked(file.path)) {
        //                 if (!checking) {
        //                     plugin.store.updateItems(file.path);
        //                     plugin.store.save();
        //                     // plugin.updateStatusBar();
        //                 }
        //                 return true;
        //             }
        //         }
        //         return false;
        //     },
        // });

        plugin.addCommand({
            id: "global-sync-full",
            name: t("CMD_GLOBAL_SYNC_FULL"),
            callback: async () => {
                await plugin.store.performGlobalGarbageCollection();
                await plugin.sync(FlashcardReviewMode.Review, "full");
            },
        });

        plugin.addCommand({
            id: "global-sync-cards",
            name: t("CMD_GLOBAL_SYNC_CARDS"),
            callback: async () => {
                const store = plugin.store;
                const settings = plugin.data.settings;
                const trackedFiles = store.data.trackedFiles;

                let totalCardFiles = 0;
                let syncedFiles = 0;
                let deletedGhostCards = 0;
                let cleanedGhostFiles = 0;
                let cleanedGhostItems = 0;

                const progressTip = plugin.shouldShowSyncProgressTip("incremental")
                    ? new SyncProgressTip("准备同步数据...")
                    : null;
                progressTip?.show();
                console.log("[GlobalSync] Start. Tracked files:", Object.keys(trackedFiles).length);

                // ====== 第0步：同 path 文件去重（保留卡片最多的条目） ======
                progressTip?.update(0, 100, "正在去重文件条目...");
                const pathMap = new Map<string, string[]>(); // path -> fileIDs
                for (const [fileID, tf] of Object.entries(trackedFiles)) {
                    if (tf == null) continue;
                    if (!pathMap.has(tf.path)) {
                        pathMap.set(tf.path, []);
                    }
                    pathMap.get(tf.path)!.push(fileID);
                }
                let deduped = 0;
                // 删除重复条目（保留 trackedItems 最多的那条）
                for (const [path, fileIDs] of pathMap) {
                    if (fileIDs.length <= 1) continue;
                    // 找出 trackedItems 最多的条目作为"主条目"
                    let bestID = fileIDs[0];
                    let bestCardCount = trackedFiles[bestID]?.trackedItems?.length ?? 0;
                    for (let k = 1; k < fileIDs.length; k++) {
                        const count = trackedFiles[fileIDs[k]]?.trackedItems?.length ?? 0;
                        if (count > bestCardCount) {
                            bestCardCount = count;
                            bestID = fileIDs[k];
                        }
                    }
                    // 把其他条目的 trackedItems 合并到主条目中
                    const best = trackedFiles[bestID];
                    if (!best.trackedItems) best.trackedItems = [];
                    for (const fid of fileIDs) {
                        if (fid === bestID) continue;
                        const dup = trackedFiles[fid];
                        if (dup?.trackedItems) {
                            best.trackedItems.push(...dup.trackedItems);
                        }
                        delete trackedFiles[fid];
                        // 从 fileOrder 中移除
                        const orderIdx = store.data.fileOrder?.indexOf(fid);
                        if (orderIdx !== undefined && orderIdx >= 0) {
                            store.data.fileOrder.splice(orderIdx, 1);
                        }
                        deduped++;
                    }
                    console.log(
                        `[GlobalSync] Dedup: ${path} had ${fileIDs.length} copies, merged to 1 (${best.trackedItems.length} cards)`,
                    );
                }
                if (deduped > 0) {
                    console.log(`[GlobalSync] Removed ${deduped} duplicate file entries`);
                }

                // ====== 第1步：清除幽灵文件 ======
                progressTip?.update(10, 100, "清理丢失的文件...");
                for (const [fileID, tkfile] of Object.entries(trackedFiles)) {
                    if (tkfile == null) {
                        delete trackedFiles[fileID];
                        const orderIdx = store.data.fileOrder?.indexOf(fileID);
                        if (orderIdx !== undefined && orderIdx >= 0) {
                            store.data.fileOrder.splice(orderIdx, 1);
                        }
                        continue;
                    }

                    const file = plugin.app.vault.getAbstractFileByPath(tkfile.path);
                    if (!(file instanceof TFile)) {
                        // 文件已不存在 → 清理关联的 items
                        let itemsCleaned = 0;
                        for (const key in tkfile.items) {
                            const id = tkfile.items[key];
                            if (typeof id === "number" && id >= 0) {
                                store.unTrackItem(id);
                                itemsCleaned++;
                            }
                        }
                        if (tkfile.hasCards && tkfile.trackedItems) {
                            for (const item of tkfile.trackedItems) {
                                if (item.reviewId >= 0) {
                                    store.unTrackItem(item.reviewId);
                                    itemsCleaned++;
                                }
                            }
                        }
                        console.log(
                            `[GlobalSync] Ghost file removed: ${tkfile.path} (${itemsCleaned} items cleaned)`,
                        );
                        delete trackedFiles[fileID];
                        const orderIdx = store.data.fileOrder?.indexOf(fileID);
                        if (orderIdx !== undefined && orderIdx >= 0) {
                            store.data.fileOrder.splice(orderIdx, 1);
                        }
                        cleanedGhostFiles++;
                        cleanedGhostItems += itemsCleaned;
                    }
                }

                const filesToSync = Object.values(trackedFiles).filter(
                    (f: any) => f != null && f.hasCards,
                );
                const totalFiles = filesToSync.length || 1;

                // ====== 第2步：同步剩余的有卡片的文件 ======
                for (const tkfile of Object.values(trackedFiles)) {
                    if (tkfile == null || !(tkfile as any).hasCards) continue;
                    totalCardFiles++;

                    progressTip?.update(
                        syncedFiles,
                        totalFiles,
                        `同步卡片: ${(tkfile as any).path.split("/").pop()}`,
                    );

                    const file = plugin.app.vault.getAbstractFileByPath((tkfile as any).path);
                    if (!(file instanceof TFile)) continue; // 不应该到这里

                    try {
                        const fileText = await plugin.app.vault.read(file);
                        const oldCount = tkfile.trackedItems?.length ?? 0;

                        // 收集同步前的所有 card item IDs
                        const oldItemIds = new Set<number>();
                        for (const item of tkfile.trackedItems || []) {
                            if (item.reviewId >= 0) {
                                oldItemIds.add(item.reviewId);
                            }
                        }

                        // 执行同步（内部使用 matchItems 指纹匹配）
                        tkfile.syncNoteCardsIndex(fileText, settings);

                        const newCount = tkfile.trackedItems?.length ?? 0;
                        const diff = oldCount - newCount;

                        // 收集同步后仍然存在的 card item IDs
                        const newItemIds = new Set<number>();
                        for (const item of tkfile.trackedItems || []) {
                            if (item.reviewId >= 0) {
                                newItemIds.add(item.reviewId);
                            }
                        }

                        // 清理孤儿 items（旧数据中有但新数据中没有的）
                        for (const oldId of oldItemIds) {
                            if (!newItemIds.has(oldId)) {
                                store.unTrackItem(oldId);
                                cleanedGhostItems++;
                            }
                        }

                        if (diff > 0) {
                            deletedGhostCards += diff;
                            console.log(
                                `[GlobalSync] ${tkfile.path}: cleaned ${diff} ghost cards (${oldCount} -> ${newCount})`,
                            );
                        } else if (diff < 0) {
                            console.log(
                                `[GlobalSync] ${tkfile.path}: found ${-diff} new cards (${oldCount} -> ${newCount})`,
                            );
                        }
                        syncedFiles++;
                    } catch (err) {
                        console.error("[GlobalSync] Read failed:", tkfile.path, err);
                    }
                }

                // ====== 第3步：清理 items 数组中未被任何 trackedFile 引用的条目 (垃圾回收) ======
                progressTip?.update(syncedFiles, totalFiles, "执行垃圾回收...");
                await store.performGlobalGarbageCollection();

                progressTip?.hide(1000);

                const parts = [
                    `同步 ${syncedFiles}/${totalCardFiles} 个文件`,
                    `${deletedGhostCards} 张幽灵卡片被清理`,
                    `${cleanedGhostFiles} 个无效文件移除`,
                ].filter(Boolean);
                const msg = `全局同步完成！\n${parts.join("\n")}`;
                new Notice(msg, 6000);
                console.log("[GlobalSync]", msg);
            },
        });
    }

    addDebugCommands() {
        const plugin = this.plugin;

        plugin.addCommand({
            id: "build-queue",
            name: t("CMD_BUILD_QUEUE"),
            callback: () => {
                Queue.getInstance().buildQueue();
            },
        });

        plugin.addCommand({
            id: "review-view",
            name: t("CMD_REVIEW"),
            callback: () => {
                Queue.getInstance().buildQueue();
                ReviewView.getInstance().recallReviewNote(this.plugin.data.settings);
            },
        });

        plugin.addCommand({
            id: "debug-print-view-state",
            name: t("CMD_PRINT_VIEW_STATE"),
            callback: () => {
                const state = plugin.app.workspace.getActiveViewOfType(MarkdownView).getState();
                console.log(state);
            },
        });

        plugin.addCommand({
            id: "debug-print-eph-state",
            name: t("CMD_PRINT_EPHEMERAL_STATE"),
            callback: () => {
                console.log(plugin.app.workspace.activeLeaf.getEphemeralState());
            },
        });

        // plugin.addCommand({
        //     id: "debug-print-queue",
        //     name: "Print Queue",
        //     callback: () => {
        //         console.log(plugin.store.data);
        //         console.log(plugin.store.data.queue);
        //         console.log("There are " + plugin.store.data.queue.length + " items in queue.");
        //         console.log(plugin.store.data.newAdded + " new where added to today.");
        //         console.log("repeatQueue: " + plugin.store.data.repeatQueue);
        //     },
        // });

        plugin.addCommand({
            id: "debug-clear-queue",
            name: t("CMD_CLEAR_QUEUE"),
            callback: () => {
                Queue.getInstance().clearQueue();
            },
        });

        plugin.addCommand({
            id: "debug-queue-all",
            name: t("CMD_QUEUE_ALL"),
            callback: () => {
                const que = Queue.getInstance();
                que.buildQueueAll();
                console.log("Queue Size: " + que.queueSize());
            },
        });

        plugin.addCommand({
            id: "debug-print-data",
            name: t("CMD_PRINT_DATA"),
            callback: () => {
                console.log(plugin.store.data);
            },
        });

        // plugin.addCommand({
        //     id: "debug-reset-data",
        //     name: "Reset Data",
        //     callback: () => {
        //         console.log("Resetting data...");
        //         plugin.store.resetData();
        //         console.log(plugin.store.data);
        //     },
        // });

        // plugin.addCommand({
        //     id: "debug-prune-data",
        //     name: "Prune Data",
        //     callback: () => {
        //         console.log("Pruning data...");
        //         plugin.store.pruneData();
        //         console.log(plugin.store.data);
        //     },
        // });

        plugin.addCommand({
            id: "update-dataItems",
            name: t("CMD_UPDATE_ITEMS"),
            callback: () => {
                plugin.store.verifyItems();
            },
        });
    }
}
