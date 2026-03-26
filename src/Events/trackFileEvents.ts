import { Menu, TAbstractFile, TFile, TFolder, debounce } from "obsidian";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";
import { Tags } from "src/tags";
import { FolderTrackingSettingsModal } from "src/ui/modals/FolderTrackingSettingsModal";

export function registerTrackFileEvents(plugin: SRPlugin) {
    const logRuntimeDebug = (...args: unknown[]) => {
        if (plugin.data.settings.showRuntimeDebugMessages) {
            console.debug(...args);
        }
    };

    const debouncedSync = debounce(
        async () => {
            logRuntimeDebug("[SR-DynSync] debounced flashcard sync triggered.");
            await plugin.requestSync({ trigger: "file-event" });
            await plugin.store.save();
            plugin.redrawReviewQueueView();
        },
        2000,
        true,
    );

    const debouncedNoteRefresh = debounce(
        async () => {
            logRuntimeDebug("[SR-NoteReview] debounced note refresh triggered.");
            await plugin.refreshNoteReview({ trigger: "file-event" });
        },
        600,
        true,
    );

    plugin.registerEvent(
        plugin.app.vault.on("rename", async (file, oldPath) => {
            let noteChanged = false;

            if (plugin.noteReviewStore.rename(oldPath, file.path)) {
                await plugin.noteReviewStore.save();
                noteChanged = true;
            }

            if (plugin.noteReviewStore.renamePathPrefix(oldPath, file.path)) {
                await plugin.noteReviewStore.save();
                noteChanged = true;
            }

            if (plugin.renameFolderTrackingPaths(oldPath, file.path)) {
                noteChanged = true;
            }

            if (file instanceof TFile && file.extension === "md") {
                const folderRuleChanged = await plugin.ensureFolderTrackingForFile(file);
                const shouldTrackByFolder =
                    plugin.getResolvedFolderTrackingRule(file.path)?.rule.track === true;
                if (folderRuleChanged || shouldTrackByFolder) {
                    noteChanged = true;
                }
            }

            const trackedFile = plugin.store.getTrackedFile(oldPath);
            if (trackedFile) {
                trackedFile.rename(file.path);
                await plugin.store.save();
                plugin.markSyncDirty();
                debouncedSync();
            }

            if (noteChanged) {
                debouncedNoteRefresh();
            }
        }),
    );

    plugin.registerEvent(
        plugin.app.vault.on("create", async (file) => {
            if (!(file instanceof TFile) || file.extension !== "md") {
                return;
            }

            const folderRuleChanged = await plugin.ensureFolderTrackingForFile(file);
            const noteDeckName = Tags.getNoteDeckName(file, plugin.data.settings);
            const shouldRefreshNote =
                folderRuleChanged ||
                plugin.noteReviewStore.isTracked(file.path) ||
                noteDeckName !== null ||
                plugin.getResolvedFolderTrackingRule(file.path)?.rule.track === true;

            if (shouldRefreshNote) {
                debouncedNoteRefresh();
            }
        }),
    );

    plugin.registerEvent(
        plugin.app.vault.on("delete", async (file) => {
            let noteChanged = false;
            if (plugin.noteReviewStore.remove(file.path)) {
                await plugin.noteReviewStore.save();
                noteChanged = true;
            }

            if (plugin.noteReviewStore.removePathPrefix(file.path)) {
                await plugin.noteReviewStore.save();
                noteChanged = true;
            }

            if (plugin.removeFolderTrackingPaths(file.path)) {
                noteChanged = true;
            }

            if (plugin.store.getTrackedFile(file.path)) {
                plugin.store.untrackFile(file.path);
                await plugin.store.save();
                plugin.markSyncDirty();
                debouncedSync();
            }

            if (noteChanged) {
                debouncedNoteRefresh();
            }
        }),
    );

    plugin.registerEvent(
        plugin.app.vault.on("modify", async (file: TFile) => {
            if (file.extension !== "md") return;

            const trackedFile = plugin.store.getTrackedFile(file.path);
            const noteDeckName = Tags.getNoteDeckName(file, plugin.data.settings);
            const shouldRefreshNote =
                plugin.noteReviewStore.isTracked(file.path) ||
                noteDeckName !== null ||
                plugin.getResolvedFolderTrackingRule(file.path)?.rule.track === true;

            if (plugin.store.isTrackedCardfile(file.path) && trackedFile) {
                const fileText = await plugin.app.vault.read(file);
                const result = trackedFile.syncNoteCardsIndex(fileText, plugin.data.settings);

                if (result.removedIds.length > 0) {
                    for (const id of result.removedIds) {
                        plugin.store.unTrackItem(id);
                    }
                }

                if (result.hasChange) {
                    plugin.markSyncDirty();
                    debouncedSync();
                }

                if (shouldRefreshNote) {
                    debouncedNoteRefresh();
                }
                return;
            }

            let shouldSyncCards = false;
            const fileText = await plugin.app.vault.read(file);
            const settings = plugin.data.settings;

            const hasInlineSeparator =
                fileText.includes(settings.singleLineCardSeparator) ||
                fileText.includes(settings.singleLineReversedCardSeparator);
            const hasMultilineSeparator =
                fileText.includes(settings.multilineCardSeparator) ||
                fileText.includes(settings.multilineReversedCardSeparator);
            const hasCloze =
                fileText.includes("{{c") ||
                fileText.includes("{{C") ||
                fileText.includes("==") ||
                fileText.includes("**");

            if (hasInlineSeparator || hasMultilineSeparator || hasCloze) {
                const note = await plugin.loadNote(file);
                if (note.questionList.length > 0) {
                    shouldSyncCards = true;
                }
            }

            if (shouldSyncCards) {
                plugin.markSyncDirty();
                debouncedSync();
            }

            if (shouldRefreshNote) {
                debouncedNoteRefresh();
            }
        }),
    );
}

export function addFileMenuEvt(plugin: SRPlugin, menu: Menu, fileish: TAbstractFile) {
    if (fileish instanceof TFolder) {
        menu.addItem((item) => {
            item.setIcon("SpacedRepIcon");
            item.setTitle(t("MENU_FOLDER_TRACKING_SETTINGS"));
            item.onClick(() => {
                new FolderTrackingSettingsModal(plugin.app, plugin, fileish.path).open();
            });
        });
        return;
    }

    if (!(fileish instanceof TFile)) {
        return;
    }

    if (plugin.noteReviewStore.isTracked(fileish.path)) {
        menu.addItem((item) => {
            item.setIcon("SpacedRepIcon");
            item.setTitle(t("MENU_UNTRACK_NOTE"));
            item.onClick(() => {
                void (async () => {
                    await plugin.untrackNoteFromMenu(fileish);
                })();
            });
        });
        return;
    }

    menu.addItem((item) => {
        item.setIcon("SpacedRepIcon");
        item.setTitle(t("MENU_TRACK_NOTE"));
        item.onClick(async () => {
            await plugin.trackNoteFromMenu(fileish);
        });
    });
}
