import { Menu, TAbstractFile, TFile, TFolder, debounce } from "obsidian";
import { DEFAULT_DECKNAME } from "src/constants";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";
import { Tags } from "src/tags";

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
        plugin.app.vault.on("delete", async (file) => {
            let noteChanged = false;
            if (plugin.noteReviewStore.remove(file.path)) {
                await plugin.noteReviewStore.save();
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
                plugin.noteReviewStore.isTracked(file.path) || noteDeckName !== null;

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
        const folderPrefix = fileish.path ? `${fileish.path}/` : "";
        const getFolderNotes = () =>
            plugin.app.vault
                .getMarkdownFiles()
                .filter((file) => file.path === fileish.path || file.path.startsWith(folderPrefix));

        menu.addItem((item) => {
            item.setIcon("SpacedRepIcon");
            item.setTitle(t("MENU_TRACK_ALL_NOTES"));
            item.onClick(async () => {
                for (const file of getFolderNotes()) {
                    const deckName = Tags.getNoteDeckName(file, plugin.data.settings);
                    plugin.noteReviewStore.ensureTracked(
                        file.path,
                        deckName ?? DEFAULT_DECKNAME,
                        deckName ? "tag" : "manual",
                        plugin.noteAlgorithm,
                    );
                }
                await plugin.noteReviewStore.save();
                await plugin.refreshNoteReview({ trigger: "manual" });
            });
        });

        menu.addItem((item) => {
            item.setIcon("SpacedRepIcon");
            item.setTitle(t("MENU_UNTRACK_ALL_NOTES"));
            item.onClick(async () => {
                for (const file of getFolderNotes()) {
                    plugin.noteReviewStore.remove(file.path);
                }
                await plugin.noteReviewStore.save();
                await plugin.refreshNoteReview({ trigger: "manual" });
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
                    plugin.noteReviewStore.remove(fileish.path);
                    await plugin.noteReviewStore.save();
                    if (plugin.reviewFloatBar.isDisplay() && plugin.data.settings.autoNextNote) {
                        await plugin.reviewNextNote(plugin.lastSelectedReviewDeck);
                    }
                    await plugin.refreshNoteReview({ trigger: "manual" });
                })();
            });
        });
        return;
    }

    menu.addItem((item) => {
        item.setIcon("SpacedRepIcon");
        item.setTitle(t("MENU_TRACK_NOTE"));
        item.onClick(async () => {
            const deckName = Tags.getNoteDeckName(fileish, plugin.data.settings);
            plugin.noteReviewStore.ensureTracked(
                fileish.path,
                deckName ?? DEFAULT_DECKNAME,
                deckName ? "tag" : "manual",
                plugin.noteAlgorithm,
            );
            await plugin.noteReviewStore.save();
            await plugin.refreshNoteReview({ trigger: "manual" });
        });
    });
}

