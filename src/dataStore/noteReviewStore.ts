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
import { Tags } from "src/tags";

export type NoteReviewSource = "manual" | "tag";

interface PersistedNoteReviewEntry {
    source: NoteReviewSource;
    deckName: string;
    item: RepetitionItem;
}

interface NoteReviewStoreFile {
    version: number;
    nextItemId: number;
    items: Record<string, PersistedNoteReviewEntry>;
}

export interface NoteReviewEntry {
    source: NoteReviewSource;
    deckName: string;
    item: RepetitionItem;
}

const NOTE_REVIEW_STORE_VERSION = 1;

function cloneItem(item: RepetitionItem): RepetitionItem {
    return RepetitionItem.create(JSON.parse(JSON.stringify(item)));
}

export class NoteReviewStore {
    private settings: SRSettings;
    private dataPath: string;
    private data: Record<string, NoteReviewEntry> = {};
    private nextItemId = 1;

    constructor(settings: SRSettings, manifestDir: string) {
        this.settings = settings;
        const trackedPath = getStorePath(manifestDir, settings);
        const lastSlash = Math.max(trackedPath.lastIndexOf("/"), trackedPath.lastIndexOf("\\"));
        const dir = lastSlash >= 0 ? trackedPath.substring(0, lastSlash + 1) : "./";
        this.dataPath = dir + "review_notes.json";
    }

    async load(): Promise<void> {
        try {
            const adapter = Iadapter.instance.adapter;
            if (!(await adapter.exists(this.dataPath))) {
                this.data = {};
                this.nextItemId = 1;
                return;
            }

            const raw = await adapter.read(this.dataPath);
            if (!raw) {
                this.data = {};
                this.nextItemId = 1;
                return;
            }

            const parsed = JSON.parse(raw) as NoteReviewStoreFile;
            if (parsed?.version !== NOTE_REVIEW_STORE_VERSION || typeof parsed.items !== "object") {
                this.data = {};
                this.nextItemId = 1;
                return;
            }

            this.nextItemId = Math.max(1, parsed.nextItemId ?? 1);
            this.data = {};

            for (const [path, entry] of Object.entries(parsed.items)) {
                if (!entry?.item) continue;
                const item = RepetitionItem.create(entry.item);
                item.setTracked(path);
                item.updateDeckName(entry.deckName ?? DEFAULT_DECKNAME, false);
                this.data[path] = {
                    source: entry.source === "tag" ? "tag" : "manual",
                    deckName: entry.deckName ?? item.deckName ?? DEFAULT_DECKNAME,
                    item,
                };
                this.nextItemId = Math.max(this.nextItemId, item.ID + 1);
            }
        } catch (error) {
            console.error("[SR-NoteReview] Failed to load note review store:", error);
            this.data = {};
            this.nextItemId = 1;
        }
    }

    async save(): Promise<void> {
        try {
            const payload: NoteReviewStoreFile = {
                version: NOTE_REVIEW_STORE_VERSION,
                nextItemId: this.nextItemId,
                items: {},
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

    getEntry(path: string): NoteReviewEntry | null {
        return this.data[path] ?? null;
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
        if (!this.data[path]) return false;
        delete this.data[path];
        return true;
    }

    rename(oldPath: string, newPath: string): boolean {
        const entry = this.data[oldPath];
        if (!entry || oldPath === newPath) return false;
        delete this.data[oldPath];
        entry.item.setTracked(newPath);
        this.data[newPath] = entry;
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
