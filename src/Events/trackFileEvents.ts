import { Menu, Notice, TAbstractFile, TFile, TFolder, debounce } from "obsidian";
import { t } from "src/lang/helpers";
import {
    createDeterministicFileIdentityUuid,
    normalizeFileIdentityAliases,
    type SyroFileIdentity,
} from "src/dataStore/syroFileIdentityStore";
import SRPlugin from "src/main";
import { FolderTrackingSettingsModal } from "src/ui/modals/FolderTrackingSettingsModal";
import {
    hasAnkiClozeCandidate,
    hasCurlyClozeCandidate,
    hasEnabledCardFormatCandidate,
} from "src/util/cardFormatCandidates";

type SubmenuCapableMenuItem = {
    setSubmenu?: () => Menu;
    setChecked?: (checked: boolean) => unknown;
};

function addAutoExtractMenuItem(plugin: SRPlugin, menu: Menu, fileish: TFile): void {
    if (plugin.data?.settings?.enableAutoExtracts === false) {
        return;
    }

    menu.addItem((item) => {
        item.setIcon("library-big");
        item.setTitle(t("AUTO_EXTRACT_MENU_TITLE"));

        const submenu = (item as unknown as SubmenuCapableMenuItem).setSubmenu?.() ?? menu;
        const activeRule = plugin.getAutoExtractRuleForPath(fileish.path);
        const checkedLevels = new Set(
            activeRule?.allHeadingLevels
                ? [1, 2, 3, 4, 5, 6]
                : (activeRule?.headingLevels ??
                  (activeRule?.headingLevel !== undefined ? [activeRule.headingLevel] : [])),
        );
        const isAllHeadingsChecked = activeRule?.allHeadingLevels === true;

        submenu.addItem((submenuItem) => {
            submenuItem.setIcon("library-big");
            submenuItem.setTitle(t("AUTO_EXTRACT_ALL_HEADINGS"));
            (submenuItem as unknown as SubmenuCapableMenuItem).setChecked?.(isAllHeadingsChecked);
            submenuItem.onClick(async () => {
                await plugin.setAutoExtractAllHeadings(fileish, !isAllHeadingsChecked);
                new Notice(
                    isAllHeadingsChecked
                        ? t("AUTO_EXTRACT_RULE_DISABLED")
                        : t("AUTO_EXTRACT_RULE_ENABLED"),
                );
            });
        });
        submenu.addSeparator();

        for (const level of [1, 2, 3, 4, 5, 6] as const) {
            const isLevelChecked = checkedLevels.has(level);
            submenu.addItem((submenuItem) => {
                submenuItem.setIcon("heading");
                submenuItem.setTitle(t("AUTO_EXTRACT_BY_HEADING_LEVEL", { level }));
                (submenuItem as unknown as SubmenuCapableMenuItem).setChecked?.(isLevelChecked);
                submenuItem.onClick(async () => {
                    await plugin.setAutoExtractHeadingLevel(fileish, level, !isLevelChecked);
                    new Notice(
                        isLevelChecked
                            ? t("AUTO_EXTRACT_RULE_DISABLED")
                            : t("AUTO_EXTRACT_RULE_ENABLED"),
                    );
                });
            });
        }
        if (plugin.hasAutoExtractRuleForFile(fileish)) {
            submenu.addSeparator();
            submenu.addItem((submenuItem) => {
                submenuItem.setIcon("x");
                submenuItem.setTitle(t("AUTO_EXTRACT_DISABLE"));
                submenuItem.onClick(async () => {
                    await plugin.disableAutoExtractRule(fileish);
                    new Notice(t("AUTO_EXTRACT_RULE_DISABLED"));
                });
            });
        }
    });
}

export { hasAnkiClozeCandidate, hasCurlyClozeCandidate };

function buildFileIdentityChange(input: {
    existingIdentity?: SyroFileIdentity | null;
    fallbackUuid?: string;
    path: string;
    oldPath?: string;
    aliases?: readonly string[];
    deleted: boolean;
}): SyroFileIdentity & { oldPath?: string; newPath?: string } {
    const fallbackUuid =
        input.fallbackUuid?.trim() || createDeterministicFileIdentityUuid(input.path);
    const uuid = input.existingIdentity?.uuid ?? fallbackUuid;
    return {
        uuid,
        createdAt: input.existingIdentity?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        path: input.path,
        ...(input.oldPath ? { oldPath: input.oldPath, newPath: input.path } : {}),
        aliases: normalizeFileIdentityAliases(uuid, [
            ...(input.existingIdentity?.aliases ?? []),
            ...(input.aliases ?? []),
        ]),
        deleted: input.deleted,
    };
}

function createFileIdentityEmitter(plugin: SRPlugin) {
    const emittedKeys = new Set<string>();

    const emit = async (
        opType: "upsert" | "delete",
        identity: SyroFileIdentity,
    ): Promise<boolean> => {
        const key = `${opType}:${identity.uuid}:${identity.path}:${identity.aliases.join("|")}`;
        if (emittedKeys.has(key)) {
            return false;
        }
        emittedKeys.add(key);
        return opType === "upsert"
            ? plugin.appendSyroFileIdentityUpsert(identity)
            : plugin.appendSyroFileIdentityDelete(identity);
    };

    return {
        upsert: (identity: SyroFileIdentity) => emit("upsert", identity),
        delete: (identity: SyroFileIdentity) => emit("delete", identity),
    };
}

export function registerTrackFileEvents(plugin: SRPlugin) {
    const logRuntimeDebug = (...args: unknown[]) => {
        if (plugin.data.settings.showRuntimeDebugMessages) {
            console.debug(...args);
        }
    };

    const debouncedSync = debounce(
        async () => {
            if (!plugin.guardSyroDataReady("sync", { notify: false })) {
                return;
            }
            logRuntimeDebug("[SR-DynSync] debounced flashcard sync triggered.");
            await plugin.requestSync({ trigger: "file-event" });
            await plugin.store?.save();
            plugin.redrawReviewQueueView();
        },
        2000,
        true,
    );

    const debouncedNoteRefresh = debounce(
        async () => {
            if (!plugin.guardSyroDataReady("note-review", { notify: false })) {
                return;
            }
            logRuntimeDebug("[SR-NoteReview] debounced note refresh triggered.");
            await plugin.refreshNoteReview({ trigger: "file-event" });
        },
        600,
        true,
    );

    plugin.registerEvent(
        plugin.app.vault.on("rename", async (file, oldPath) => {
            if (!plugin.guardSyroDataReady("sync", { notify: false })) {
                return;
            }
            let noteChanged = false;
            const noteReviewStore = plugin.noteReviewStore;
            const reviewCommitStore = plugin.reviewCommitStore;
            const store = plugin.store;
            const extractStore = plugin.extractStore;
            if (!noteReviewStore || !reviewCommitStore || !store) {
                return;
            }
            const fileIdentityEmitter = createFileIdentityEmitter(plugin);
            const renamedNote = noteReviewStore.renameWithSnapshot(oldPath, file.path);
            const renamedNotesByPrefix = noteReviewStore.renamePathPrefixWithSnapshots(
                oldPath,
                file.path,
            );
            if (renamedNote || renamedNotesByPrefix.length > 0) {
                await noteReviewStore.save();
                noteChanged = true;
                if (renamedNote) {
                    const existingIdentity =
                        plugin.getSyroFileIdentity?.(renamedNote.item.uuid) ?? null;
                    await fileIdentityEmitter.upsert(
                        buildFileIdentityChange({
                            existingIdentity,
                            fallbackUuid: renamedNote.item.uuid,
                            path: renamedNote.path,
                            oldPath,
                            aliases: renamedNote.item.aliases ?? [],
                            deleted: false,
                        }),
                    );
                    await plugin.appendSyroNoteRename(oldPath, renamedNote);
                }
                for (const snapshot of renamedNotesByPrefix) {
                    const existingIdentity =
                        plugin.getSyroFileIdentity?.(snapshot.entry.item.uuid) ?? null;
                    await fileIdentityEmitter.upsert(
                        buildFileIdentityChange({
                            existingIdentity,
                            fallbackUuid: snapshot.entry.item.uuid,
                            path: snapshot.entry.path,
                            oldPath: snapshot.oldPath,
                            aliases: snapshot.entry.item.aliases ?? [],
                            deleted: false,
                        }),
                    );
                    await plugin.appendSyroNoteRename(snapshot.oldPath, snapshot.entry);
                }
            }

            if (plugin.renameFolderTrackingPaths(oldPath, file.path)) {
                noteChanged = true;
            }
            if (plugin.renameDeckOptionsAssignments(oldPath, file.path)) {
                noteChanged = true;
            }
            if (plugin.renameAutoExtractRulePath?.(oldPath, file.path)) {
                noteChanged = true;
            }

            if (extractStore && plugin.data.settings.enableExtracts !== false) {
                const renamedExtracts = extractStore.renamePathPrefix(oldPath, file.path);
                const repairedExtracts = extractStore.repairDuplicateExtractsByPathAliases([
                    [oldPath, file.path],
                ]);
                if (renamedExtracts.length > 0 || repairedExtracts.length > 0) {
                    await extractStore.save();
                    for (const snapshot of [...renamedExtracts, ...repairedExtracts]) {
                        await plugin.appendSyroExtractUpsert(snapshot, "sync");
                    }
                }
            }

            if (file instanceof TFile && file.extension === "md") {
                const folderRuleChanged = await plugin.ensureFolderTrackingForFile(file);
                const shouldTrackByFolder =
                    plugin.getResolvedFolderTrackingRule(file.path)?.rule.track === true;
                if (folderRuleChanged || shouldTrackByFolder) {
                    noteChanged = true;
                }
            }

            const renamedTimeline = reviewCommitStore.renameFileWithSnapshot(oldPath, file.path);
            const renamedTimelineByPrefix = reviewCommitStore.renamePathPrefixWithSnapshots(
                oldPath,
                file.path,
            );
            if (renamedTimeline || renamedTimelineByPrefix.length > 0) {
                await reviewCommitStore.save();
                if (renamedTimeline) {
                    const existingIdentity =
                        plugin.getSyroFileIdentityByPath?.(renamedTimeline.oldPath) ??
                        plugin.getSyroFileIdentityByPath?.(renamedTimeline.newPath) ??
                        null;
                    await fileIdentityEmitter.upsert(
                        buildFileIdentityChange({
                            existingIdentity,
                            fallbackUuid: createDeterministicFileIdentityUuid(
                                renamedTimeline.oldPath,
                            ),
                            path: renamedTimeline.newPath,
                            oldPath: renamedTimeline.oldPath,
                            aliases: existingIdentity?.aliases ?? [],
                            deleted: false,
                        }),
                    );
                    await plugin.appendSyroTimelineRenameFile(
                        renamedTimeline.oldPath,
                        renamedTimeline.newPath,
                        renamedTimeline.commits,
                    );
                }
                for (const snapshot of renamedTimelineByPrefix) {
                    const existingIdentity =
                        plugin.getSyroFileIdentityByPath?.(snapshot.oldPath) ??
                        plugin.getSyroFileIdentityByPath?.(snapshot.newPath) ??
                        null;
                    await fileIdentityEmitter.upsert(
                        buildFileIdentityChange({
                            existingIdentity,
                            fallbackUuid: createDeterministicFileIdentityUuid(snapshot.oldPath),
                            path: snapshot.newPath,
                            oldPath: snapshot.oldPath,
                            aliases: existingIdentity?.aliases ?? [],
                            deleted: false,
                        }),
                    );
                    await plugin.appendSyroTimelineRenameFile(
                        snapshot.oldPath,
                        snapshot.newPath,
                        snapshot.commits,
                    );
                }
            }

            const renamedTrackedFiles = store.renamePathPrefixWithSnapshots(oldPath, file.path);
            if (renamedTrackedFiles.length > 0) {
                await store.save();
                for (const snapshot of renamedTrackedFiles) {
                    const existingIdentity =
                        plugin.getSyroFileIdentity?.(snapshot.file.uuid) ?? null;
                    await fileIdentityEmitter.upsert(
                        buildFileIdentityChange({
                            existingIdentity,
                            fallbackUuid: snapshot.file.uuid,
                            path: snapshot.file.path,
                            oldPath: snapshot.oldPath,
                            aliases: snapshot.file.aliases ?? [],
                            deleted: false,
                        }),
                    );
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
            if (!plugin.guardSyroDataReady("note-review", { notify: false })) {
                return;
            }
            if (!(file instanceof TFile) || file.extension !== "md") {
                return;
            }

            const folderRuleChanged = await plugin.ensureFolderTrackingForFile(file);
            const shouldRefreshNote =
                folderRuleChanged ||
                !!plugin.noteReviewStore?.isTracked(file.path) ||
                plugin.getResolvedFolderTrackingRule(file.path)?.rule.track === true;

            if (shouldRefreshNote) {
                debouncedNoteRefresh();
            }
        }),
    );

    plugin.registerEvent(
        plugin.app.vault.on("delete", async (file) => {
            if (!plugin.guardSyroDataReady("sync", { notify: false })) {
                return;
            }
            let noteChanged = false;
            const noteReviewStore = plugin.noteReviewStore;
            const reviewCommitStore = plugin.reviewCommitStore;
            const store = plugin.store;
            if (!noteReviewStore || !reviewCommitStore || !store) {
                return;
            }
            const fileIdentityEmitter = createFileIdentityEmitter(plugin);
            const removedNote = noteReviewStore.removeWithSnapshot(file.path);
            const removedNotesByPrefix = noteReviewStore.removePathPrefixWithSnapshots(file.path);
            if (removedNote || removedNotesByPrefix.length > 0) {
                await noteReviewStore.save();
                noteChanged = true;
                if (removedNote) {
                    const existingIdentity =
                        plugin.getSyroFileIdentity?.(removedNote.item.uuid) ?? null;
                    await fileIdentityEmitter.delete(
                        buildFileIdentityChange({
                            existingIdentity,
                            fallbackUuid: removedNote.item.uuid,
                            path: removedNote.path,
                            aliases: removedNote.item.aliases ?? [],
                            deleted: true,
                        }),
                    );
                    await plugin.appendSyroNoteRemove(removedNote);
                }
                for (const snapshot of removedNotesByPrefix) {
                    const existingIdentity =
                        plugin.getSyroFileIdentity?.(snapshot.item.uuid) ?? null;
                    await fileIdentityEmitter.delete(
                        buildFileIdentityChange({
                            existingIdentity,
                            fallbackUuid: snapshot.item.uuid,
                            path: snapshot.path,
                            aliases: snapshot.item.aliases ?? [],
                            deleted: true,
                        }),
                    );
                    await plugin.appendSyroNoteRemove(snapshot);
                }
            }

            if (plugin.removeFolderTrackingPaths(file.path)) {
                noteChanged = true;
            }
            if (plugin.removeDeckOptionsAssignments(file.path)) {
                noteChanged = true;
            }
            if (plugin.removeAutoExtractRulePath?.(file.path)) {
                noteChanged = true;
            }
            if (await plugin.removeExtractsForDeletedPath?.(file.path)) {
                noteChanged = true;
            }

            const removedTimeline = reviewCommitStore.deleteFileWithSnapshot(file.path);
            const removedTimelineByPrefix = reviewCommitStore.deletePathPrefixWithSnapshots(
                file.path,
            );
            if (removedTimeline || removedTimelineByPrefix.length > 0) {
                await reviewCommitStore.save();
                if (removedTimeline) {
                    const existingIdentity =
                        plugin.getSyroFileIdentityByPath?.(removedTimeline.path) ?? null;
                    await fileIdentityEmitter.delete(
                        buildFileIdentityChange({
                            existingIdentity,
                            fallbackUuid: createDeterministicFileIdentityUuid(removedTimeline.path),
                            path: removedTimeline.path,
                            aliases: existingIdentity?.aliases ?? [],
                            deleted: true,
                        }),
                    );
                    await plugin.appendSyroTimelineDeleteFile(
                        removedTimeline.path,
                        removedTimeline.commits,
                    );
                }
                for (const snapshot of removedTimelineByPrefix) {
                    const existingIdentity =
                        plugin.getSyroFileIdentityByPath?.(snapshot.path) ?? null;
                    await fileIdentityEmitter.delete(
                        buildFileIdentityChange({
                            existingIdentity,
                            fallbackUuid: createDeterministicFileIdentityUuid(snapshot.path),
                            path: snapshot.path,
                            aliases: existingIdentity?.aliases ?? [],
                            deleted: true,
                        }),
                    );
                    await plugin.appendSyroTimelineDeleteFile(snapshot.path, snapshot.commits);
                }
            }

            const removedTrackedFiles = store.untrackPathPrefixWithSnapshots(file.path);
            if (removedTrackedFiles.length > 0) {
                await store.save();
                for (const snapshot of removedTrackedFiles) {
                    const existingIdentity = plugin.getSyroFileIdentity?.(snapshot.uuid) ?? null;
                    await fileIdentityEmitter.delete(
                        buildFileIdentityChange({
                            existingIdentity,
                            fallbackUuid: snapshot.uuid,
                            path: snapshot.path,
                            aliases: snapshot.aliases ?? [],
                            deleted: true,
                        }),
                    );
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
            if (!plugin.guardSyroDataReady("sync", { notify: false })) {
                return;
            }
            if (file.extension !== "md") return;

            const store = plugin.store;
            const noteReviewStore = plugin.noteReviewStore;
            if (!store || !noteReviewStore) {
                return;
            }
            const trackedFile = store.getTrackedFile(file.path);
            const shouldRefreshNote =
                noteReviewStore.isTracked(file.path) ||
                plugin.getResolvedFolderTrackingRule(file.path)?.rule.track === true;

            if (store.isTrackedCardfile(file.path) && trackedFile) {
                const fileText = await plugin.app.vault.read(file);
                await plugin.syncExtractsFromFile(file);
                const result = trackedFile.syncNoteCardsIndex(fileText, plugin.data.settings);

                if (result.removedIds.length > 0) {
                    for (const id of result.removedIds) {
                        store.unTrackItem(id);
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
            await plugin.syncExtractsFromFile(file);
            const settings = plugin.data.settings;

            if (hasEnabledCardFormatCandidate(fileText, settings)) {
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

    if (!plugin.isSyroDataReady() || !plugin.noteReviewStore) {
        return;
    }

    if (fileish.extension === "md") {
        menu.addSeparator();
        addAutoExtractMenuItem(plugin, menu, fileish);
        menu.addSeparator();
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

export function addInlineTitleDeckEntryMenuEvt(plugin: SRPlugin, menu: Menu, fileish: TFile) {
    if (!(fileish instanceof TFile) || fileish.extension !== "md") {
        return;
    }

    if (!plugin.isSyroDataReady() || !plugin.noteReviewStore) {
        return;
    }

    addAutoExtractMenuItem(plugin, menu, fileish);

    const isTracked = plugin.noteReviewStore.isTracked(fileish.path);
    menu.addItem((item) => {
        item.setIcon("SpacedRepIcon");
        item.setTitle(isTracked ? t("MENU_UNTRACK_NOTE") : t("MENU_TRACK_NOTE"));
        item.onClick(async () => {
            if (isTracked) {
                await plugin.untrackNoteFromMenu(fileish);
                return;
            }

            await plugin.trackNoteFromMenu(fileish);
        });
    });
}
