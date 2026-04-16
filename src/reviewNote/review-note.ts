import { Notice, TFile } from "obsidian";
import { DataStore } from "src/dataStore/data";
import { ItemTrans } from "src/dataStore/itemTrans";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";
import { NoteEaseList } from "src/NoteEaseList";
import { Decks, ReviewDeck, SchedNote } from "src/ReviewDeck";
import { ReviewResponse } from "src/scheduling";
import { SRSettings } from "src/settings";
import { Tags } from "src/tags";
import { globalDateProvider } from "src/util/DateProvider";
import { isIgnoredPath } from "src/util/utils_recall";

export type TrespResult = { sNote: SchedNote; buryList?: string[] };

export abstract class IReviewNote {
    private static _instance: IReviewNote;
    static itemId: number;
    static minNextView: number;

    settings: SRSettings;
    // public reviewDecks: Decks = {};
    // public easeByPath: NoteEaseList;

    static create(settings: SRSettings) {
        return new RNonTrackfiles(settings);
    }

    static getInstance() {
        if (!IReviewNote._instance) {
            throw Error("there is not ReviewNote instance.");
        }
        return IReviewNote._instance;
    }

    constructor(settings: SRSettings) {
        this.settings = settings;
        IReviewNote._instance = this;
    }

    /**
     * 231215-not used yet.
     * after checking ignored folder, get note deckname from review tag and trackedfile.
     * @param settings SRSettings
     * @param note TFile
     * @returns string | null
     */
    static getDeckName(settings: SRSettings, note: TFile): string | null {
        const store = DataStore.getInstance();
        // const settings = plugin.data.settings;

        if (isIgnoredPath(settings.noteFoldersToIgnore, note.path)) {
            new Notice(t("NOTE_IN_IGNORED_FOLDER"));
            return;
        }

        let deckName = Tags.getNoteDeckName(note, settings);

        if (
            (settings.untrackWithReviewTag && deckName == null) ||
            (!settings.untrackWithReviewTag &&
                deckName == null &&
                !store.getTrackedFile(note.path)?.isTrackedNote)
        ) {
            new Notice(t("PLEASE_TAG_NOTE"));
            return;
        }
        if (deckName == null) {
            deckName = store.getTrackedFile(note.path)?.lastTag ?? null;
        }
        return deckName;
    }

    abstract tagCheck(note: TFile): boolean;
    abstract isNew(note: TFile): boolean;
    abstract sync(notes: TFile[], reviewDecks?: Decks, easeByPath?: NoteEaseList): Promise<void>;
    abstract responseProcess(
        note: TFile,
        response: ReviewResponse,
        ease: number,
    ): Promise<TrespResult>;

    static recallReviewResponse(itemId: number, response: string) {
        const store = DataStore.getInstance();
        const item = store.getItembyID(itemId);
        // console.debug("itemId: ", itemId);
        store.updateReviewedCounts(itemId);
        store.reviewId(itemId, response);
        void store.save();
        this.minNextView = this.updateminNextView(this.minNextView, item.nextReview);
    }

    static getDeckNameForReviewDirectly(reviewDecks: {
        [deckKey: string]: ReviewDeck;
    }): string | null {
        const reviewDeckNames: string[] = Object.keys(reviewDecks);
        const rdnames: string[] = [];
        reviewDeckNames.some((dkey: string) => {
            const ndeck = reviewDecks[dkey];
            const ncount = ndeck.dueNotesCount;
            if (ncount > 0) {
                rdnames.push(dkey);
            }
        });
        reviewDeckNames.some((dkey: string) => {
            const ndeck = reviewDecks[dkey];
            const ncount = ndeck.newNotes.length;
            if (ncount > 0) {
                rdnames.push(dkey);
            }
        });
        if (rdnames.length > 0) {
            const ind = Math.floor(Math.random() * rdnames.length);
            return rdnames[ind];
        } else {
            return null;
        }
    }

    static getNextNoteIndex(NotesCount: number, openRandomNote: boolean = false) {
        let index = 0;

        if (!openRandomNote) {
            return 0;
        } else {
            index = Math.floor(Math.random() * (NotesCount - 0.1)); // avoid conner case: index == notesCount;
        }
        return index;
    }

    static updateminNextView(mnv: number, nextReview: number): number {
        const now = Date.now();
        const nowToday: number = globalDateProvider.endofToday.valueOf();

        if (nextReview <= nowToday) {
            if (mnv == undefined || mnv < now || mnv > nextReview) {
                // console.debug("interval diff:should be - (", mnv - nextReview);
                mnv = nextReview;
            }
        }
        return mnv;
    }
}

export class RNonTrackfiles extends IReviewNote {
    private getStore(): DataStore {
        return DataStore.getInstance();
    }
    // @logExecutionTime()
    async sync(notes: TFile[], reviewDecks: Decks, easeByPath: NoteEaseList): Promise<void> {
        const store = this.getStore();
        // const settings = this.data.settings;
        await store.data.queues.buildQueue();

        // check trackfile
        await store.reLoad();

        ItemTrans.create(this.settings).itemToReviewDecks(reviewDecks, notes, easeByPath);
    }

    tagCheck(note: TFile): boolean {
        const store = this.getStore();

        let deckName = Tags.getNoteDeckName(note, this.settings);
        if (
            (this.settings.untrackWithReviewTag && deckName == null) ||
            (!this.settings.untrackWithReviewTag &&
                deckName == null &&
                !store.getTrackedFile(note.path)?.isTrackedNote)
        ) {
            new Notice(t("PLEASE_TAG_NOTE"));
            return false;
        }
        if (deckName == null) {
            deckName = store.getTrackedFile(note.path)?.lastTag ?? null;
        }
        if (deckName == null) return false;
        return true;
    }
    isNew(note: TFile): boolean {
        return this.getStore().getNoteItem(note.path)?.isNew ?? true;
    }
    responseProcess(note: TFile, response: ReviewResponse, ease?: number): Promise<TrespResult> {
        const store = this.getStore();

        const plugin = SRPlugin.getInstance();
        const algorithm = plugin.noteAlgorithm;
        const option = algorithm.srsOptions()[response];

        const trackedFile = store.getTrackedFile(note.path);
        let itemId = trackedFile?.items?.file ?? -1;
        let item = store.getItembyID(itemId);
        if (item == null) {
            const deckName = IReviewNote.getDeckName(this.settings, note);
            if (deckName != null) {
                store.trackFile(note.path, deckName, false);
                item = store.getNoteItem(note.path);
                itemId = item?.ID ?? -1;
            }
        }
        if (item == null) {
            return Promise.resolve({
                buryList: [] as string[],
                sNote: {
                    note,
                },
            });
        }
        if (item.isNew && ease != null) {
            // new note
            item.updateAlgorithmData("ease", ease);
        }
        const buryList: string[] = [];
        /*
        if (this.settings.burySiblingCardsByNoteReview) {
            const trackFile = store.getTrackedFile(note.path);
            if (trackFile.hasCards) {
                for (const cardinfo of trackFile.cardItems) {
                    buryList.push(cardinfo.cardTextHash);
                }
            }
        }
        */

        IReviewNote.recallReviewResponse(itemId, option);

        return Promise.resolve({
            buryList,
            sNote: {
                note,
                item,
                dueUnix: item.nextReview,
                interval: item.interval,
                ease: item.ease,
            },
        });
    }
}
