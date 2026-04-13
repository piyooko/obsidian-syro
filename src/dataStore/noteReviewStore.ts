import { TFile, Vault } from "obsidian";
import { SrsAlgorithm } from "src/algorithms/algorithms";
import { DEFAULT_DECKNAME } from "src/constants";
import { DataStore } from "src/dataStore/data";
import { Iadapter } from "src/dataStore/adapter";
import { getStorePath } from "src/dataStore/dataLocation";
import { itemToShedNote } from "src/dataStore/itemTrans";
import { RPITEMTYPE, RepetitionItem } from "src/dataStore/repetitionItem";
import { TrackedFile } from "src/dataStore/trackedFile";
import { ReviewDeck } from "src/ReviewDeck";
import { SRSettings } from "src/settings";
import { isPathInsideFolder, renamePathPrefix } from "src/folderTracking";
import { Tags } from "src/tags";
import { parseJsonUnknown } from "src/util/typeGuards";
import type { NoteReviewStorePathConfig } from "src/dataStore/syroWorkspace";
import {
    cloneSyncEntities,
    markSyncEntity,
    parseSyncEntities,
    pruneSyncEntities,
    shouldApplySyncEntity,
    type PersistedSyncEntityState,
} from "./syroSyncMeta";

export type NoteReviewSource = "manual" | "tag" | "folder";

interface PersistedNoteReviewEntry {
    source: NoteReviewSource;
    deckName: string;
    item: RepetitionItem;
}

interface NoteReviewStoreFile {
    version: number;
    nextItemId: number;
    items: Record<string, PersistedNoteReviewEntry>;
    syncEntities?: Record<string, PersistedSyncEntityState>;
}

export interface NoteReviewEntry {
    source: NoteReviewSource;
    deckName: string;
    item: RepetitionItem;
}

export interface NoteReviewEntrySnapshot {
    path: string;
    source: NoteReviewSource;
    deckName: string;
    item: RepetitionItem;
}

export interface RenamedNoteReviewEntrySnapshot {
    oldPath: string;
    newPath: string;
    entry: NoteReviewEntrySnapshot;
}

const NOTE_REVIEW_STORE_VERSION = 1;

function cloneItem(item: RepetitionItem): RepetitionItem {
    const cloned = parseJsonUnknown(JSON.stringify(item)) as RepetitionItem;
    return RepetitionItem.create(cloned);
}

export class NoteReviewStore {
    public lastLoadError: string | null = null;
    private settings: SRSettings;
    private dataPath: string;
    private data: Record<string, NoteReviewEntry> = {};
    private nextItemId = 1;
    private syncEntities: Record<string, PersistedSyncEntityState> = {};
    private syncReadOnlyReason: string | null = null;

    constructor(settings: SRSettings, manifestDirOrPaths: string | NoteReviewStorePathConfig) {
        this.settings = settings;
        if (typeof manifestDirOrPaths === "string") {
            const trackedPath = getStorePath(manifestDirOrPaths, settings);
            const lastSlash = Math.max(trackedPath.lastIndexOf("/"), trackedPath.lastIndexOf("\\"));
            const dir = lastSlash >= 0 ? trackedPath.substring(0, lastSlash + 1) : "./";
            this.dataPath = dir + "review_notes.json";
        } else {
            this.dataPath = manifestDirOrPaths.notesPath;
        }
    }

    async load(): Promise<void> {
        this.lastLoadError = null;
        try {
            const adapter = Iadapter.instance.adapter;
            if (!(await adapter.exists(this.dataPath))) {
                this.data = {};
                this.nextItemId = 1;
                this.syncEntities = {};
                return;
            }

            const raw = await adapter.read(this.dataPath);
            if (!raw) {
                this.data = {};
                this.nextItemId = 1;
                this.syncEntities = {};
                return;
            }

            const parsed = JSON.parse(raw) as NoteReviewStoreFile;
            if (parsed?.version !== NOTE_REVIEW_STORE_VERSION || typeof parsed.items !== "object") {
                this.lastLoadError = "[SR-NoteReview] Invalid notes.json schema.";
                this.data = {};
                this.nextItemId = 1;
                this.syncEntities = {};
                return;
            }

            this.nextItemId = Math.max(1, parsed.nextItemId ?? 1);
            this.data = {};
            this.syncEntities = parseSyncEntities(parsed.syncEntities);

            for (const [path, entry] of Object.entries(parsed.items)) {
                if (!entry?.item) continue;
                const item = RepetitionItem.create(entry.item);
                item.setTracked(path);
                item.updateDeckName(entry.deckName ?? DEFAULT_DECKNAME, false);
                this.data[path] = {
                    source:
                        entry.source === "tag"
                            ? "tag"
                            : entry.source === "folder"
                              ? "folder"
                              : "manual",
                    deckName: entry.deckName ?? item.deckName ?? DEFAULT_DECKNAME,
                    item,
                };
                this.nextItemId = Math.max(this.nextItemId, item.ID + 1);
            }
        } catch (error) {
            this.lastLoadError = `[SR-NoteReview] Failed to load notes.json: ${String(error)}`;
            console.error("[SR-NoteReview] Failed to load note review store:", error);
            this.data = {};
            this.nextItemId = 1;
            this.syncEntities = {};
        }
    }

    async save(): Promise<void> {
        if (this.syncReadOnlyReason) {
            return;
        }
        try {
            const payload: NoteReviewStoreFile = {
                version: NOTE_REVIEW_STORE_VERSION,
                nextItemId: this.nextItemId,
                items: {},
                syncEntities: cloneSyncEntities(this.syncEntities),
            };

            for (const [path, entry] of Object.entries(this.data)) {
                payload.items[path] = {
                    source: entry.source,
                    deckName: entry.deckName,
                    item: cloneItem(entry.item),
                };
            }

            await Iadapter.instance.adapter.write(this.dataPath, JSON.stringify(payload, null, 2));
        } catch (error) {
            console.error("[SR-NoteReview] Failed to save note review store:", error);
        }
    }

    setReadOnly(reason: string | null): void {
        this.syncReadOnlyReason = reason;
    }

    getEntry(path: string): NoteReviewEntry | null {
        return this.data[path] ?? null;
    }

    findPathByUuid(uuid: string): string | null {
        if (!uuid) {
            return null;
        }

        for (const [path, entry] of Object.entries(this.data)) {
            if (entry.item.uuid === uuid) {
                return path;
            }
        }

        return null;
    }

    getEntrySnapshot(path: string): NoteReviewEntrySnapshot | null {
        const entry = this.getEntry(path);
        if (!entry) {
            return null;
        }

        return {
            path,
            source: entry.source,
            deckName: entry.deckName,
            item: cloneItem(entry.item),
        };
    }

    getEntries(): Record<string, NoteReviewEntry> {
        return this.data;
    }

    getItem(path: string): RepetitionItem | null {
        return this.data[path]?.item ?? null;
    }

    getDeckName(path: string): string | null {
        return this.data[path]?.deckName ?? null;
    }

    isTracked(path: string): boolean {
        return !!this.data[path];
    }

    listPaths(): string[] {
        return Object.keys(this.data);
    }

    ensureTracked(
        path: string,
        deckName: string,
        source: NoteReviewSource,
        algorithm: SrsAlgorithm,
    ): RepetitionItem {
        const existing = this.data[path];
        if (existing) {
            existing.source = source;
            existing.deckName = deckName;
            existing.item.setTracked(path);
            existing.item.updateDeckName(deckName, false);
            return existing.item;
        }

        const item = new RepetitionItem(
            this.nextItemId++,
            path,
            RPITEMTYPE.NOTE,
            deckName,
            algorithm.defaultData(),
        );
        item.setTracked(path);
        this.data[path] = { source, deckName, item };
        return item;
    }

    setPriority(path: string, priority: number): boolean {
        const item = this.getItem(path);
        if (!item) return false;
        item.priority = priority;
        return true;
    }

    remove(path: string): boolean {
        return this.removeWithSnapshot(path) !== null;
    }

    removeWithSnapshot(path: string): NoteReviewEntrySnapshot | null {
        const snapshot = this.getEntrySnapshot(path);
        if (!snapshot) return null;
        delete this.data[path];
        return snapshot;
    }

    rename(oldPath: string, newPath: string): boolean {
        return this.renameWithSnapshot(oldPath, newPath) !== null;
    }

    renameWithSnapshot(oldPath: string, newPath: string): NoteReviewEntrySnapshot | null {
        const entry = this.data[oldPath];
        if (!entry || oldPath === newPath) return null;
        delete this.data[oldPath];
        entry.item.setTracked(newPath);
        this.data[newPath] = entry;
        return this.getEntrySnapshot(newPath);
    }

    renamePathPrefix(oldPath: string, newPath: string): boolean {
        return this.renamePathPrefixWithSnapshots(oldPath, newPath).length > 0;
    }

    renamePathPrefixWithSnapshots(
        oldPath: string,
        newPath: string,
    ): RenamedNoteReviewEntrySnapshot[] {
        let changed = false;
        const nextData: Record<string, NoteReviewEntry> = {};
        const snapshots: RenamedNoteReviewEntrySnapshot[] = [];

        for (const [path, entry] of Object.entries(this.data)) {
            const nextPath = renamePathPrefix(path, oldPath, newPath);
            if (nextPath !== path) {
                entry.item.setTracked(nextPath);
                changed = true;
                snapshots.push({
                    oldPath: path,
                    newPath: nextPath,
                    entry: {
                        path: nextPath,
                        source: entry.source,
                        deckName: entry.deckName,
                        item: cloneItem(entry.item),
                    },
                });
            }
            nextData[nextPath] = entry;
        }

        if (changed) {
            this.data = nextData;
        }

        return snapshots;
    }

    removePathPrefix(path: string): boolean {
        return this.removePathPrefixWithSnapshots(path).length > 0;
    }

    removePathPrefixWithSnapshots(path: string): NoteReviewEntrySnapshot[] {
        let changed = false;
        const removedSnapshots: NoteReviewEntrySnapshot[] = [];

        for (const entryPath of this.listPaths()) {
            if (!isPathInsideFolder(path, entryPath)) {
                continue;
            }

            const snapshot = this.getEntrySnapshot(entryPath);
            if (snapshot) {
                removedSnapshots.push(snapshot);
            }
            delete this.data[entryPath];
            changed = true;
        }

        return changed ? removedSnapshots : [];
    }

    upsertSnapshot(snapshot: NoteReviewEntrySnapshot): void {
        const existingPath = this.findPathByUuid(snapshot.item.uuid);
        if (existingPath && existingPath !== snapshot.path) {
            delete this.data[existingPath];
        }

        const item = cloneItem(snapshot.item);
        item.setTracked(snapshot.path);
        item.updateDeckName(snapshot.deckName, false);
        this.data[snapshot.path] = {
            source: snapshot.source,
            deckName: snapshot.deckName,
            item,
        };
        this.nextItemId = Math.max(this.nextItemId, item.ID + 1);
    }

    removeByUuid(uuid: string, fallbackPath?: string): boolean {
        const existingPath = this.findPathByUuid(uuid) ?? fallbackPath ?? "";
        if (!existingPath || !this.data[existingPath]) {
            return false;
        }

        delete this.data[existingPath];
        return true;
    }

    cleanupMissingFiles(vault: Vault): boolean {
        let changed = false;
        for (const path of this.listPaths()) {
            const file = vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile) || file.extension !== "md") {
                delete this.data[path];
                changed = true;
            }
        }
        return changed;
    }

    buildReviewDecks(vault: Vault): { [deckKey: string]: ReviewDeck } {
        const reviewDecks: { [deckKey: string]: ReviewDeck } = {};

        for (const [path, entry] of Object.entries(this.data)) {
            const file = vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile) || file.extension !== "md") {
                continue;
            }

            const deckName = entry.deckName ?? DEFAULT_DECKNAME;
            if (!reviewDecks[deckName]) {
                reviewDecks[deckName] = new ReviewDeck(deckName);
            }

            entry.item.setTracked(path);
            entry.item.updateDeckName(deckName, false);

            if (entry.item.hasDue) {
                reviewDecks[deckName].scheduledNotes.push(itemToShedNote(entry.item, file));
            } else {
                reviewDecks[deckName].newNotes.push({
                    note: file,
                    item: entry.item,
                });
            }
        }

        return reviewDecks;
    }

    async migrateFromLegacyStore(store: DataStore): Promise<boolean> {
        let changed = false;

        for (const [fileID, trackedFile] of Object.entries(store.data.trackedFiles)) {
            if (!trackedFile) continue;

            const noteItemId = trackedFile.items?.file ?? -1;
            if (noteItemId < 0) continue;

            const item = store.getItembyID(noteItemId);
            if (!item || item.itemType !== RPITEMTYPE.NOTE) {
                this.stripLegacyNoteTracking(store, fileID, trackedFile, noteItemId);
                changed = true;
                continue;
            }

            const file = Iadapter.instance.vault.getAbstractFileByPath(trackedFile.path);
            const noteFile = file instanceof TFile ? file : null;
            const deckName =
                (noteFile ? Tags.getNoteDeckName(noteFile, this.settings) : null) ??
                trackedFile.lastTag ??
                item.deckName ??
                DEFAULT_DECKNAME;
            const source = this.inferLegacySource(noteFile, trackedFile);
            const migratedItem = cloneItem(item);
            migratedItem.setTracked(trackedFile.path);
            migratedItem.updateDeckName(deckName, false);

            this.data[trackedFile.path] = {
                source,
                deckName,
                item: migratedItem,
            };
            this.nextItemId = Math.max(this.nextItemId, migratedItem.ID + 1);
            this.stripLegacyNoteTracking(store, fileID, trackedFile, noteItemId);
            changed = true;
        }

        if (changed) {
            await store.save();
            await this.save();
        }

        return changed;
    }

    getSyncEntities(): Record<string, PersistedSyncEntityState> {
        return cloneSyncEntities(this.syncEntities);
    }

    shouldApplySyncEntity(targetUuid: string, updatedAt: string): boolean {
        return shouldApplySyncEntity(this.syncEntities, targetUuid, updatedAt);
    }

    markSyncEntity(input: {
        targetUuid: string;
        updatedAt: string;
        deleted: boolean;
        entityType: string;
        pathHint?: string;
    }): boolean {
        return markSyncEntity(this.syncEntities, input);
    }

    pruneSyncEntities(retentionMs: number): boolean {
        return pruneSyncEntities(this.syncEntities, retentionMs);
    }

    private inferLegacySource(noteFile: TFile | null, trackedFile: TrackedFile): NoteReviewSource {
        const tagDeckName = noteFile ? Tags.getNoteDeckName(noteFile, this.settings) : null;
        const legacyDeckName = trackedFile.lastTag ?? DEFAULT_DECKNAME;
        if (
            tagDeckName !== null ||
            (legacyDeckName !== DEFAULT_DECKNAME &&
                this.settings.tagsToReview.includes(legacyDeckName))
        ) {
            return "tag";
        }
        return "manual";
    }

    private stripLegacyNoteTracking(
        store: DataStore,
        fileID: string,
        trackedFile: TrackedFile,
        noteItemId: number,
    ): void {
        if (noteItemId >= 0) {
            store.unTrackItem(noteItemId);
        }
        trackedFile.items.file = -1;

        if (trackedFile.hasCards) {
            trackedFile.setTracked(RPITEMTYPE.CARD);
            return;
        }

        delete store.data.trackedFiles[fileID];
        store.data.fileOrder = (store.data.fileOrder ?? []).filter((id) => id !== fileID);
    }
}
