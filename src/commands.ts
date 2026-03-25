/**
 * 鏉╂瑤閲滈弬鍥︽娑撴槒顩﹂弰顖氬叡娴犫偓娑斿牏娈戦敍?
 * 鐎规矮绠熼幓鎺嶆閹绘劒绶甸惃鍕閺堝鎳℃禒銈忕礄娓氬顩ч垾妯哄弿鐏炩偓閸氬本顒為崡锛勫閳ユ瑣鈧讲鈧ɑ甯规潻鐔奉槻娑旂姭鈧瑧鐡戦敍澶堚偓?
 * 鏉╂瑤绨洪崨鎴掓姢娴兼艾鍤悳鏉挎躬 Obsidian 閻ㄥ嫬鎳℃禒銈夋桨閺夊じ鑵戦敍宀€鏁ら幋宄板讲娴犮儵鈧俺绻冭箛顐ｅ祹闁款喗鍨ㄩ懣婊冨礋鐟欙箑褰傞妴?
 * 閸忔湹鑵戦張鈧柌宥堫洣閻ㄥ嫧鈧粌鍙忕仦鈧崥灞绢劄閸楋紕澧栭垾婵嗘嚒娴犮倓绱伴柆宥呭坊閹碘偓閺堝鎷烽煪顏呮瀮娴犺绱濆〒鍛倞楠炵晫浼掗弫鐗堝祦閿涘瞼鈥樻穱婵堫梿閻╂ɑ鏆熼幑顔煎冀閺勭姴鐤勯梽鍛剰閸愮偣鈧?
 * 鏉╁€熼嚋閺傚洣娆㈡担璺ㄦ暏 fileID 鐎涙顑佹稉韫稊娑撳搫鏁稉鈧弽鍥槕閿涘奔绗夐崘宥勭贩鐠ф牗鏆熺紒鍕瑓閺嶅洢鈧?
 *
 * 鐎瑰啫婀い鍦窗娑擃厼鐫樻禍搴窗闁槒绶仦?(Logic Layer)
 *
 * 鐎瑰啩绱伴悽銊ュ煂閸濐亙绨洪弬鍥︽閿?
 * 1. src/dataStore/data.ts
 * 2. src/dataStore/trackedFile.ts
 * 3. src/dataStore/repetitionItem.ts
 *
 * 閸濐亙绨洪弬鍥︽娴兼氨鏁ら崚鏉跨暊閿?
 * 1. src/main.ts (閹绘帊娆㈤崥顖氬З閺冭埖鏁為崘宀冪箹娴滄稑鎳℃禒?
 */
/**
 * [閸忋儱褰沒 濞夈劌鍞?Obsidian 閸涙垝鎶ら棃銏℃緲娑擃厾娈戦崨鎴掓姢閵?
 */
import { MarkdownView, Notice, TFile } from "obsidian";
import ObsidianSrsPlugin from "./main";
import { Queue } from "./dataStore/queue";
import { RPITEMTYPE, RepetitionItem } from "./dataStore/repetitionItem";
import { postponeItems } from "./algorithms/balance/postpone";
import { GetInputModal } from "./ui/modals/getInputModal";
import { ReviewView } from "./ui/views/reviewView";
import { FlashcardReviewMode } from "src/scheduling";
import { t } from "src/lang/helpers";
import { SyncProgressTip } from "src/ui/components/SyncProgressTip";
import { DEFAULT_DECKNAME } from "src/constants";
import { Tags } from "src/tags";

type SyncTrackedFile = {
    path: string;
    hasCards: boolean;
    items: Record<string, number>;
    itemIDs: number[];
    trackedItems?: Array<{ reviewId: number }>;
    syncNoteCardsIndex: (
        fileText: string,
        settings: ObsidianSrsPlugin["data"]["settings"],
    ) => unknown;
};

export default class Commands {
    plugin: ObsidianSrsPlugin;

    constructor(plugin: ObsidianSrsPlugin) {
        this.plugin = plugin;
    }

    private runAsync(task: Promise<void>, label: string): void {
        void task.catch((error: unknown) => {
            console.error(`[Commands] ${label}`, error);
        });
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
                            void plugin.noteReviewStore.save();
                            void plugin.refreshNoteReview({ trigger: "manual" });
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
                            void plugin.noteReviewStore.save();
                            void plugin.refreshNoteReview({ trigger: "manual" });
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
                            input.submitCallback = (days: number) => {
                                this.runAsync(
                                    (async () => {
                                        postponeItems([noteItem], days);
                                        await plugin.noteReviewStore.save();
                                        new Notice(t("CMD_NOTE_POSTPONED", { days: days }));
                                        plugin.updateAndSortDueNotes();
                                        plugin.syncEvents.emit("note-review-updated");
                                        if (
                                            settings.autoNextNote &&
                                            plugin.lastSelectedReviewDeck
                                        ) {
                                            await plugin.reviewNextNote(
                                                plugin.lastSelectedReviewDeck,
                                            );
                                        }
                                    })(),
                                    "Failed to postpone note manually.",
                                );
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
                                        .filter(
                                            (item): item is RepetitionItem =>
                                                item != null && item.itemType === RPITEMTYPE.CARD,
                                        ),
                                    days,
                                );
                            input.open();

                            // plugin.store.save();
                            void plugin.sync();
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
                if (!plugin.syncLock) {
                    await plugin.store.performGlobalGarbageCollection();
                }
                await plugin.requestSync({
                    reviewMode: FlashcardReviewMode.Review,
                    mode: "full",
                    trigger: "manual",
                });
            },
        });

        plugin.addCommand({
            id: "global-sync-cards",
            name: t("CMD_GLOBAL_SYNC_CARDS"),
            callback: async () => {
                const store = plugin.store;
                const settings = plugin.data.settings;
                const trackedFiles = store.data.trackedFiles as Record<
                    string,
                    SyncTrackedFile | null
                >;

                let totalCardFiles = 0;
                let syncedFiles = 0;
                let deletedGhostCards = 0;
                let cleanedGhostFiles = 0;

                const progressTip = plugin.shouldShowSyncProgressTip("incremental")
                    ? new SyncProgressTip(t("SYNC_PROGRESS_PREPARE_DATA"), t("SYNC_PROGRESS_DONE"))
                    : null;
                progressTip?.show();
                console.debug(
                    "[GlobalSync] Start. Tracked files:",
                    Object.keys(trackedFiles).length,
                );

                // Step 0: deduplicate entries that point to the same path.
                progressTip?.update(0, 100, t("SYNC_PROGRESS_DEDUP_FILES"));
                const pathMap = new Map<string, string[]>(); // path -> fileIDs
                for (const [fileID, tf] of Object.entries(trackedFiles)) {
                    if (tf == null) continue;
                    if (!pathMap.has(tf.path)) {
                        pathMap.set(tf.path, []);
                    }
                    pathMap.get(tf.path).push(fileID);
                }
                let deduped = 0;
                // Merge duplicate entries and keep the one with the most tracked cards.
                for (const [path, fileIDs] of pathMap) {
                    if (fileIDs.length <= 1) continue;
                    // Pick the entry with the largest tracked item set as the survivor.
                    let bestID = fileIDs[0];
                    let bestCardCount = trackedFiles[bestID]?.trackedItems?.length ?? 0;
                    for (let k = 1; k < fileIDs.length; k++) {
                        const count = trackedFiles[fileIDs[k]]?.trackedItems?.length ?? 0;
                        if (count > bestCardCount) {
                            bestCardCount = count;
                            bestID = fileIDs[k];
                        }
                    }
                    // Move the duplicate tracked items onto the surviving entry.
                    const best = trackedFiles[bestID];
                    if (!best.trackedItems) best.trackedItems = [];
                    for (const fid of fileIDs) {
                        if (fid === bestID) continue;
                        const dup = trackedFiles[fid];
                        if (dup?.trackedItems) {
                            best.trackedItems.push(...dup.trackedItems);
                        }
                        delete trackedFiles[fid];
                        // Remove the duplicate from the persisted file order.
                        const orderIdx = store.data.fileOrder?.indexOf(fid);
                        if (orderIdx !== undefined && orderIdx >= 0) {
                            store.data.fileOrder.splice(orderIdx, 1);
                        }
                        deduped++;
                    }
                    console.debug(
                        `[GlobalSync] Dedup: ${path} had ${fileIDs.length} copies, merged to 1 (${best.trackedItems.length} cards)`,
                    );
                }
                if (deduped > 0) {
                    console.debug(`[GlobalSync] Removed ${deduped} duplicate file entries`);
                }

                // Step 1: remove invalid tracked files and orphaned items.
                progressTip?.update(10, 100, t("SYNC_PROGRESS_CLEAN_GHOST_FILES"));
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
                        // Remove orphaned items that belong to a missing file.
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
                        console.debug(
                            `[GlobalSync] Ghost file removed: ${tkfile.path} (${itemsCleaned} items cleaned)`,
                        );
                        delete trackedFiles[fileID];
                        const orderIdx = store.data.fileOrder?.indexOf(fileID);
                        if (orderIdx !== undefined && orderIdx >= 0) {
                            store.data.fileOrder.splice(orderIdx, 1);
                        }
                        cleanedGhostFiles++;
                    }
                }

                const filesToSync = Object.values(trackedFiles).filter(
                    (trackedFile): trackedFile is SyncTrackedFile =>
                        trackedFile != null && trackedFile.hasCards,
                );
                const totalFiles = filesToSync.length || 1;

                // Step 2: rescan each tracked file and reconcile its cards.
                for (const tkfile of Object.values(trackedFiles)) {
                    if (tkfile == null || !tkfile.hasCards) continue;
                    totalCardFiles++;

                    progressTip?.update(
                        syncedFiles,
                        totalFiles,
                        t("SYNC_PROGRESS_SYNC_FILE", {
                            fileName: tkfile.path.split("/").pop() || tkfile.path,
                        }),
                    );

                    const file = plugin.app.vault.getAbstractFileByPath(tkfile.path);
                    if (!(file instanceof TFile)) continue; // The file vanished during the scan.
                    try {
                        const fileText = await plugin.app.vault.read(file);
                        const oldCount = tkfile.trackedItems?.length ?? 0;

                        // Capture the previous card ids so removed cards can be untracked.
                        const oldItemIds = new Set<number>();
                        for (const item of tkfile.trackedItems || []) {
                            if (item.reviewId >= 0) {
                                oldItemIds.add(item.reviewId);
                            }
                        }

                        // Rebuild tracked items for the current file contents.
                        tkfile.syncNoteCardsIndex(fileText, settings);

                        const newCount = tkfile.trackedItems?.length ?? 0;
                        const diff = oldCount - newCount;

                        // Collect the new card ids so removed items can be detected.
                        const newItemIds = new Set<number>();
                        for (const item of tkfile.trackedItems || []) {
                            if (item.reviewId >= 0) {
                                newItemIds.add(item.reviewId);
                            }
                        }

                        // Untrack any items that disappeared from the file after resync.
                        for (const oldId of oldItemIds) {
                            if (!newItemIds.has(oldId)) {
                                store.unTrackItem(oldId);
                            }
                        }

                        if (diff > 0) {
                            deletedGhostCards += diff;
                            console.debug(
                                `[GlobalSync] ${tkfile.path}: cleaned ${diff} ghost cards (${oldCount} -> ${newCount})`,
                            );
                        } else if (diff < 0) {
                            console.debug(
                                `[GlobalSync] ${tkfile.path}: found ${-diff} new cards (${oldCount} -> ${newCount})`,
                            );
                        }
                        syncedFiles++;
                    } catch (err) {
                        console.error("[GlobalSync] Read failed:", tkfile.path, err);
                    }
                }

                // Step 3: perform a final garbage collection pass for lingering state.
                progressTip?.update(syncedFiles, totalFiles, t("SYNC_PROGRESS_GARBAGE_COLLECT"));
                await store.performGlobalGarbageCollection();

                progressTip?.hide(1000);

                const parts = [
                    `Synced ${syncedFiles}/${totalCardFiles} card files`,
                    `${deletedGhostCards} ghost cards removed`,
                    `${cleanedGhostFiles} ghost files cleaned`,
                ].filter(Boolean);
                const msg = `Global sync completed.\n${parts.join("\n")}`;
                new Notice(msg, 6000);
                console.debug("[GlobalSync]", msg);
            },
        });
    }

    addDebugCommands() {
        const plugin = this.plugin;

        plugin.addCommand({
            id: "build-queue",
            name: t("CMD_BUILD_QUEUE"),
            callback: () => {
                void Queue.getInstance().buildQueue();
            },
        });

        plugin.addCommand({
            id: "review-view",
            name: t("CMD_REVIEW"),
            callback: () => {
                void Queue.getInstance().buildQueue();
                void ReviewView.getInstance().recallReviewNote(this.plugin.data.settings);
            },
        });

        plugin.addCommand({
            id: "debug-print-view-state",
            name: t("CMD_PRINT_VIEW_STATE"),
            callback: () => {
                const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
                const state: unknown = view?.getState() ?? null;
                console.debug(state);
            },
        });

        plugin.addCommand({
            id: "debug-print-eph-state",
            name: t("CMD_PRINT_EPHEMERAL_STATE"),
            callback: () => {
                console.debug(plugin.app.workspace.getMostRecentLeaf()?.getEphemeralState());
            },
        });

        // plugin.addCommand({
        //     id: "debug-print-queue",
        //     name: "Print Queue",
        //     callback: () => {
        //         console.debug(plugin.store.data);
        //         console.debug(plugin.store.data.queue);
        //         console.debug("There are " + plugin.store.data.queue.length + " items in queue.");
        //         console.debug(plugin.store.data.newAdded + " new where added to today.");
        //         console.debug("repeatQueue: " + plugin.store.data.repeatQueue);
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
                console.debug("Queue Size: " + que.queueSize());
            },
        });

        plugin.addCommand({
            id: "debug-print-data",
            name: t("CMD_PRINT_DATA"),
            callback: () => {
                console.debug(plugin.store.data);
            },
        });

        // plugin.addCommand({
        //     id: "debug-reset-data",
        //     name: "Reset Data",
        //     callback: () => {
        //         console.debug("Resetting data...");
        //         plugin.store.resetData();
        //         console.debug(plugin.store.data);
        //     },
        // });

        // plugin.addCommand({
        //     id: "debug-prune-data",
        //     name: "Prune Data",
        //     callback: () => {
        //         console.debug("Pruning data...");
        //         plugin.store.pruneData();
        //         console.debug(plugin.store.data);
        //     },
        // });

        plugin.addCommand({
            id: "update-dataItems",
            name: t("CMD_UPDATE_ITEMS"),
            callback: () => {
                void plugin.store.verifyItems();
            },
        });
    }
}
