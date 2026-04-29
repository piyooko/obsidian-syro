import { MarkdownView } from "obsidian";
import type ObsidianSrsPlugin from "./main";
import { Queue } from "./dataStore/queue";
import { ReviewView } from "./ui/views/reviewView";
import { FlashcardReviewMode } from "src/scheduling";
import { t } from "src/lang/helpers";
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
                if (!plugin.isSyroDataReady()) {
                    if (!checking) {
                        plugin.guardSyroDataReady("note-review");
                    }
                    return false;
                }
                const file = plugin.app.workspace.getActiveFile();
                const noteReviewStore = plugin.noteReviewStore;
                if (file != null) {
                    if (noteReviewStore && !noteReviewStore.isTracked(file.path)) {
                        if (!checking) {
                            const deckName = Tags.getNoteDeckName(file, plugin.data.settings);
                            noteReviewStore.ensureTracked(
                                file.path,
                                deckName ?? DEFAULT_DECKNAME,
                                deckName ? "tag" : "manual",
                                plugin.noteAlgorithm,
                            );
                            void noteReviewStore.save();
                            void plugin.refreshNoteReview({ trigger: "manual" });
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
            id: "create-extract-from-selection",
            name: t("CMD_CREATE_EXTRACT_FROM_SELECTION"),
            editorCallback: (editor) => {
                void plugin.createExtractFromEditorSelection(editor);
            },
        });

        plugin.addCommand({
            id: "srs-toggle-review-edit-mode",
            name: t("CMD_TOGGLE_REVIEW_EDIT_MODE"),
            // eslint-disable-next-line obsidianmd/commands/no-default-hotkeys -- Preserve the existing Alt+E review-edit shortcut while letting users remap it in Obsidian Hotkeys.
            hotkeys: [{ modifiers: ["Alt"], key: "E" }],
            callback: () => {
                plugin.requestToggleReviewEditMode();
            },
        });

        plugin.addCommand({
            id: "global-sync-full",
            name: t("CMD_GLOBAL_SYNC_FULL"),
            callback: async () => {
                if (!plugin.guardSyroDataReady("sync")) {
                    return;
                }
                if (!plugin.syncLock) {
                    await plugin.store?.performGlobalGarbageCollection();
                }
                await plugin.requestSync({
                    reviewMode: FlashcardReviewMode.Review,
                    mode: "full",
                    trigger: "manual",
                });
            },
        });
    }

    addDebugCommands() {
        const plugin = this.plugin;

        plugin.addCommand({
            id: "build-queue",
            name: t("CMD_BUILD_QUEUE"),
            callback: () => {
                if (!plugin.guardSyroDataReady("review-queue")) {
                    return;
                }
                void Queue.getInstance().buildQueue();
            },
        });

        plugin.addCommand({
            id: "review-view",
            name: t("CMD_REVIEW"),
            callback: () => {
                if (!plugin.guardSyroDataReady("note-review")) {
                    return;
                }
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
                if (!plugin.guardSyroDataReady("review-queue")) {
                    return;
                }
                Queue.getInstance().clearQueue();
            },
        });

        plugin.addCommand({
            id: "debug-queue-all",
            name: t("CMD_QUEUE_ALL"),
            callback: () => {
                if (!plugin.guardSyroDataReady("review-queue")) {
                    return;
                }
                const que = Queue.getInstance();
                que.buildQueueAll();
                console.debug("Queue Size: " + que.queueSize());
            },
        });

        plugin.addCommand({
            id: "debug-print-data",
            name: t("CMD_PRINT_DATA"),
            callback: () => {
                if (!plugin.guardSyroDataReady("item-info")) {
                    return;
                }
                console.debug(plugin.store?.data);
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
                if (!plugin.guardSyroDataReady("sync")) {
                    return;
                }
                void plugin.store?.verifyItems();
            },
        });
    }
}
