/**
 * [娑撴艾濮熼柅鏄忕帆鐏炲偊绱扮粭鏃囶唶婢跺秳绡刔 [閺嶇绺綸 婢跺嫮鎮婇垾婊勬殻缁″洨鐟拋鏉款槻娑旂姭鈧繄娈戦悧鐟扮暰闁槒绶敍灞肩瑢閸楁洖绱堕崡锛勫婢跺秳绡勯崠鍝勫瀻瀵偓閵?
 */
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

    static create(
        settings: SRSettings,
    ) {
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
    private store = DataStore.getInstance();
    // @logExecutionTime()
    async sync(notes: TFile[], reviewDecks: Decks, easeByPath: NoteEaseList): Promise<void> {
        // const settings = this.data.settings;
        await this.store.data.queues.buildQueue();

        // check trackfile
        await this.store.reLoad();

        ItemTrans.create(this.settings).itemToReviewDecks(reviewDecks, notes, easeByPath);
    }

    tagCheck(note: TFile): boolean {
        const store = this.store;

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
        return this.store.getNoteItem(note.path)?.isNew ?? true;
    }
    responseProcess(note: TFile, response: ReviewResponse, ease?: number): Promise<TrespResult> {
        const store = this.store;

        // 閴?娴ｈ法鏁oteAlgorithm閼板矂娼猄rsAlgorithm.getInstance()
        const plugin = SRPlugin.getInstance();
        const algorithm = plugin.noteAlgorithm;
        const option = algorithm.srsOptions()[response];
        const now = Date.now();

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
         * [鐞氼偅鏁為柌濂?閻劍鍩涙稉宥夋付鐟曚焦顒濋崝鐔诲厴閵?
         * 鐠囥儵鈧槒绶崢鐔稿壈閺勵垰婀径宥勭瘎缁楁棁顔囬弮璺虹厑閽樺骏绱欓幒銊ㄧ箿閿涘鍙鹃崠鍛儓閻ㄥ嫭澧嶉張澶婂幢閻楀洢鈧?
         * 閻㈠彉绨幐鍥╂睏缁崵绮洪柌宥嗙€敍灞炬＋鐏炵偞鈧?cardItems 閸?cardTextHash 瀹歌弓绗夌€涙ê婀妴?
         */
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
