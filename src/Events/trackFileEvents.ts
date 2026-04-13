import { Menu, TAbstractFile, TFile, TFolder, debounce } from "obsidian";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";
import { SRSettings } from "src/settings";
import { FolderTrackingSettingsModal } from "src/ui/modals/FolderTrackingSettingsModal";
import { hasPlainCurlyCloze } from "src/util/curlyCloze";

export function hasAnkiClozeCandidate(fileText: string): boolean {
    return fileText.includes("{{c") || fileText.includes("{{C");
}

export function hasCurlyClozeCandidate(
    fileText: string,
    settings: Pick<SRSettings, "convertCurlyBracketsToClozes">,
): boolean {
    return settings.convertCurlyBracketsToClozes && hasPlainCurlyCloze(fileText);
}

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
            const renamedNote = plugin.noteReviewStore.renameWithSnapshot(oldPath, file.path);
            const renamedNotesByPrefix = plugin.noteReviewStore.renamePathPrefixWithSnapshots(
                oldPath,
                file.path,
            );
            if (renamedNote || renamedNotesByPrefix.length > 0) {
                await plugin.noteReviewStore.save();
                noteChanged = true;
                await plugin.appendSyroNoteRename(oldPath, renamedNote);
                for (const snapshot of renamedNotesByPrefix) {
                    await plugin.appendSyroNoteRename(snapshot.oldPath, snapshot.entry);
                }
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

            const renamedTimeline = plugin.reviewCommitStore.renameFileWithSnapshot(oldPath, file.path);
            const renamedTimelineByPrefix =
                plugin.reviewCommitStore.renamePathPrefixWithSnapshots(oldPath, file.path);
            if (renamedTimeline || renamedTimelineByPrefix.length > 0) {
                await plugin.reviewCommitStore.save();
                if (renamedTimeline) {
                    await plugin.appendSyroTimelineRenameFile(
                        renamedTimeline.oldPath,
                        renamedTimeline.newPath,
                        renamedTimeline.commits,
                    );
                }
                for (const snapshot of renamedTimelineByPrefix) {
                    await plugin.appendSyroTimelineRenameFile(
                        snapshot.oldPath,
                        snapshot.newPath,
                        snapshot.commits,
                    );
                }
            }

            const renamedTrackedFiles = plugin.store.renamePathPrefixWithSnapshots(oldPath, file.path);
            if (renamedTrackedFiles.length > 0) {
                await plugin.store.save();
                for (const snapshot of renamedTrackedFiles) {
                    await plugin.appendSyroCardsRenameFile(snapshot.oldPath, snapshot.file);
                }
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
            const shouldRefreshNote =
                folderRuleChanged ||
                plugin.noteReviewStore.isTracked(file.path) ||
                plugin.getResolvedFolderTrackingRule(file.path)?.rule.track === true;

            if (shouldRefreshNote) {
                debouncedNoteRefresh();
            }
        }),
    );

    plugin.registerEvent(
        plugin.app.vault.on("delete", async (file) => {
            let noteChanged = false;
            const removedNote = plugin.noteReviewStore.removeWithSnapshot(file.path);
            const removedNotesByPrefix = plugin.noteReviewStore.removePathPrefixWithSnapshots(
                file.path,
            );
            if (removedNote || removedNotesByPrefix.length > 0) {
                await plugin.noteReviewStore.save();
                noteChanged = true;
                await plugin.appendSyroNoteRemove(removedNote);
                for (const snapshot of removedNotesByPrefix) {
                    await plugin.appendSyroNoteRemove(snapshot);
                }
            }

            if (plugin.removeFolderTrackingPaths(file.path)) {
                noteChanged = true;
            }

            const removedTimeline = plugin.reviewCommitStore.deleteFileWithSnapshot(file.path);
            const removedTimelineByPrefix =
                plugin.reviewCommitStore.deletePathPrefixWithSnapshots(file.path);
            if (removedTimeline || removedTimelineByPrefix.length > 0) {
                await plugin.reviewCommitStore.save();
                if (removedTimeline) {
                    await plugin.appendSyroTimelineDeleteFile(
                        removedTimeline.path,
                        removedTimeline.commits,
                    );
                }
                for (const snapshot of removedTimelineByPrefix) {
                    await plugin.appendSyroTimelineDeleteFile(snapshot.path, snapshot.commits);
                }
            }

            const removedTrackedFiles = plugin.store.untrackPathPrefixWithSnapshots(file.path);
            if (removedTrackedFiles.length > 0) {
                await plugin.store.save();
                for (const snapshot of removedTrackedFiles) {
                    await plugin.appendSyroCardsDeleteFile(snapshot);
                }
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
            const shouldRefreshNote =
                plugin.noteReviewStore.isTracked(file.path) ||
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
                hasAnkiClozeCandidate(fileText) ||
                hasCurlyClozeCandidate(fileText, settings) ||
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
