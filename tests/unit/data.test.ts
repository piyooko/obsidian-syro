import { SrsAlgorithm, algorithmNames } from "src/algorithms/algorithms";
import { setDueDates } from "src/algorithms/balance/balance";
import { DefaultAlgorithm } from "src/algorithms/scheduling_default";
import { DataStore } from "src/dataStore/data";
import { DataLocation } from "src/dataStore/dataLocation";
import { ItemTrans } from "src/dataStore/itemTrans";
import { RPITEMTYPE } from "src/dataStore/repetitionItem";
import { TrackedItem } from "src/dataStore/trackedFile";
import { DEFAULT_DECKNAME } from "src/constants";
import { NoteEaseList } from "src/NoteEaseList";
import { CardType } from "src/Question";
import { DEFAULT_SETTINGS, SRSettings } from "src/settings";
import { Stats } from "src/stats";
import { Tags } from "src/tags";

const settings_tkfile = Object.assign({}, DEFAULT_SETTINGS);
settings_tkfile.dataLocation = DataLocation.PluginFolder;

export class SampleDataStore {
    static roundInt = (num: number) => Math.round(Math.random() * num);

    static async create(settings: SRSettings) {
        let store: DataStore;
        let algo: SrsAlgorithm;
        let arr: number[];
        // const roundInt = (num: number) => Math.round(Math.random() * num);
        // beforeEach(async () => {
        // eslint-disable-next-line prefer-const
        store = new DataStore(settings, "./");
        await store.load();
        // store.toInstances();
        // eslint-disable-next-line prefer-const
        algo = new DefaultAlgorithm();
        algo.updateSettings(settings.algorithmSettings[algorithmNames.Default]);
        const opts = algo.srsOptions();
        // eslint-disable-next-line prefer-const
        arr = Array.from(new Array(30)).map((_v, _idx) => {
            const type = this.roundInt(1) > 0 ? RPITEMTYPE.CARD : RPITEMTYPE.NOTE;
            store.trackFile("testPath" + _idx, type, true);
            if (type === RPITEMTYPE.CARD) {
                const tkfile = store.getTrackedFile("testPath" + _idx);

                Array.from(Array(this.roundInt(10))).map((_v, _idx) => {
                    const carditem = new TrackedItem(
                        "chash" + _idx,
                        _idx * 3,
                        "",
                        CardType.SingleLineBasic,
                        {
                            startOffset: 0,
                            endOffset: 0,
                            blockStartOffset: 0,
                            blockEndOffset: 0,
                        },
                        "c1",
                    );
                    tkfile.trackedItems?.push(carditem);
                    store.updateCardItems(tkfile, carditem, "fcard", false);
                });
            }
            return this.roundInt(50);
        });
        const noteStats = new Stats();
        const cardStats = new Stats();
        store.items
            .filter((item) => item.isTracked)
            .filter((item) => {
                if (item.isCard) {
                    cardStats.updateStats(item);
                } else {
                    noteStats.updateStats(item);
                }
            });
        setDueDates(noteStats.delayedDays.dict, cardStats.delayedDays.dict);
        const size = store.itemSize;
        arr.map((_v) => {
            store.reviewId(
                SampleDataStore.roundInt(size - 1),
                opts[SampleDataStore.roundInt(opts.length - 1)],
            );
        });
        Array.from(Array(SampleDataStore.roundInt(10))).map((_v) => {
            store.unTrackItem(SampleDataStore.roundInt(size - 1));
        });
        // });
        return { store, algo };
    }
}

describe("jsonfiy", () => {
    test("record", () => {
        const que: Record<number, string> = {};
        que[23] = "default";
        const result = JSON.stringify(que);
        const expected = '{"23":"default"}'; // key值为number会自动转换为string
        expect(result).toEqual(expected);
    });

    test("Map stringify", () => {
        const myMap = new Map([
            [10, "value1"],
            [11, "value2"],
        ]);
        // 不能直接转，需先处理为字面量
        const result = JSON.stringify(Object.fromEntries(myMap));
        // const result = JSON.stringify([...myMap.entries()]); // "[[10,"value1"],[11,"value2"]]"
        const expected = '{"10":"value1","11":"value2"}';
        expect(result).toEqual(expected);
    });
    test("Map values stringify", () => {
        const myMap = new Map([
            [10, { ID: 10, v: "value1" }],
            [11, { ID: 10, v: "value2" }],
        ]);
        // 不能直接转，需先处理为字面量
        const result = JSON.stringify([...myMap.values()]);
        const expected = '[{"ID":10,"v":"value1"},{"ID":10,"v":"value2"}]';
        expect(result).toEqual(expected);
    });
});
describe("pruneDate", () => {
    const settings_tkfile = Object.assign({}, DEFAULT_SETTINGS);
    settings_tkfile.dataLocation = DataLocation.PluginFolder;
    let store: DataStore;
    // let algo: SrsAlgorithm;
    // let arr: number[];
    beforeEach(async () => {
        const sample = await SampleDataStore.create(settings_tkfile);
        store = sample.store;
    });

    it("pruneData", () => {
        store.pruneData();
        const itemResult = store.items.every((item) => item != null && item.isTracked);
        const tkfiles = Object.values(store.data.trackedFiles);
        const tkfileResult = tkfiles.every((tkfile) => tkfile != null);
        const check =
            tkfiles.map((tkfile) => tkfile?.itemIDs.filter((id) => id >= 0)).flat().length ===
            store.itemSize;
        const checkcard = tkfiles.every((tkfile) =>
            tkfile?.hasCards ? tkfile.itemIDs.length > 0 : (tkfile?.items.file ?? -1) >= 0,
        );
        expect(itemResult).toBe(true);
        expect(tkfileResult).toBe(true);
        expect(check).toBe(true);
        expect(checkcard).toBe(true);
    });

    it("unTrackItem ignores missing item ids", () => {
        expect(() => store.unTrackItem(-1)).not.toThrow();

        const existing = store.items.find((item) => item?.isTracked);
        expect(existing).toBeDefined();

        store.unTrackItem(existing.ID);
        expect(() => store.unTrackItem(existing.ID)).not.toThrow();
    });

    it("itemToReviewDecks recreates missing note items from tracked files", () => {
        const path = "ghost-note-path";
        store.trackFile(path, DEFAULT_DECKNAME, false);

        const trackedFile = store.getTrackedFile(path);
        const missingId = trackedFile.items.file;
        store.data.items = store.data.items.filter((item) => item?.ID !== missingId);
        (store as any).markItemByIdIndexDirty();

        const note = { path } as any;
        const reviewDecks: Record<string, any> = {};
        const easeByPath = new NoteEaseList(settings_tkfile);
        const getDeckNameSpy = jest.spyOn(Tags, "getNoteDeckName").mockReturnValue(null);

        expect(() =>
            ItemTrans.create(settings_tkfile).itemToReviewDecks(reviewDecks, [note], easeByPath),
        ).not.toThrow();
        expect(store.getNoteItem(path)).not.toBeNull();
        expect(reviewDecks[DEFAULT_DECKNAME]).toBeDefined();

        getDeckNameSpy.mockRestore();
    });
});
