/**
 * 这个文件主要是干什么的：
 * [数据层] 数据转换层。
 * 负责将数据存储模型（如 Note, CardInfo, RepetitionItem）转换为运行时复习队列所需的 ReviewDeck 结构。
 * 处理卡片与 TrackedFile 之间的同步，确保复习队列加载时能获取到最新的调度信息。
 * 文件关联使用 fileID 字符串（而不是数组下标），不会因为数组增删而错位。
 *
 * 它在项目中属于：数据层 (Data Layer) / 转换器 (Transformer)
 *
 * 它会用到哪些文件：
 * 1. src/Note.ts, src/Card.ts
 * 2. src/ReviewDeck.ts
 * 3. src/dataStore/trackedFile.ts
 * 4. src/dataStore/repetitionItem.ts
 *
 * 哪些文件会用到它：
 * 1. src/dataStore/data.ts (构建复习队列时调用)
 */
/**
 * [数据层：负责数据的持久化、读取和内存状态管理] [转换] 将内部数据结构转换为复习队列所需的格式。
 */
import { TFile } from "obsidian";
import { CardScheduleInfo, NoteCardScheduleParser } from "src/CardSchedule";
import { Note } from "src/Note";
import { ReviewDeck, SchedNote } from "src/ReviewDeck";
import { SrTFile } from "src/SRFile";
import { TopicPath } from "src/TopicPath";
import { DataStore } from "src/dataStore/data";
import { BlockUtils, debug, logExecutionTime } from "src/util/utils_recall";
import { TrackedFile, TrackedItem } from "./trackedFile";
import { RPITEMTYPE, RepetitionItem } from "./repetitionItem";
import { CardType } from "src/Question";
import { Card } from "src/Card";
import { Tags } from "src/tags";
import { SRSettings } from "src/settings";
import { INoteEaseList } from "src/NoteEaseList";
import { algorithmNames } from "src/algorithms/algorithms";
import { DEFAULT_DECKNAME } from "src/constants";

export class ItemTrans {
    settings: SRSettings;

    static create(settings: SRSettings) {
        return new ItemTrans(settings);
    }
    constructor(settings: SRSettings) {
        this.settings = settings;
    }

    /**
     * sync RCsrsDataTo SRreviewDecks
     *
     * @param rdeck
     * @returns
     */
    itemToReviewDecks(
        reviewDecks: { [deckKey: string]: ReviewDeck },
        notes: TFile[],
        easeByPath: INoteEaseList,
    ): void {
        const store = DataStore.getInstance();
        const settings = this.settings;
        // store.data.queues.buildQueue();
        for (const note of notes) {
            let deckname = Tags.getNoteDeckName(note, this.settings);
            if (deckname == null) {
                const tkfile = store.getTrackedFile(note.path);
                let tag = tkfile?.tags?.[1];
                if (tag && settings.tagsToReview.includes(tag) && settings.untrackWithReviewTag) {
                    store.untrackFile(tkfile.path, false);
                    tag = tkfile?.tags?.[1];
                }
                if (
                    tag != undefined &&
                    (settings.tagsToReview.includes(tag) || tag === DEFAULT_DECKNAME)
                ) {
                    deckname = tag;
                }
            }
            if (deckname != null) {
                if (!Object.prototype.hasOwnProperty.call(reviewDecks, deckname)) {
                    reviewDecks[deckname] = new ReviewDeck(deckname);
                }
                // update single note deck data, only tagged reviewnote
                let noteItem = store.getNoteItem(note.path);
                if (
                    String(store.getTrackedFile(note.path)?.tags?.[0]) !== String(RPITEMTYPE.NOTE) ||
                    noteItem == null
                ) {
                    store.trackFile(note.path, deckname, false);
                    noteItem = store.getNoteItem(note.path);
                }
                const algorithm = String(settings.algorithm);
                if (
                    algorithm === String(algorithmNames.Anki) ||
                    algorithm === String(algorithmNames.Default) ||
                    algorithm === String(algorithmNames.SM2)
                ) {
                    const sched = noteItem?.getSched() ?? null;
                    if (sched != null) {
                        const ease: number = parseFloat(sched[3]);
                        if (!isNaN(ease)) {
                            easeByPath.setEaseForPath(note.path, ease);
                        }
                    }
                }
                ItemTrans._toRevDeck(reviewDecks[deckname], note);
            }
        }
        return;
    }

    /**
     * syncRCDataToSR ReviewDeck ,
     * and update deckName to trackedfile.tags;
     * @param rdeck
     * @returns
     */
    private static _toRevDeck(rdeck: ReviewDeck, note: TFile, now?: number) {
        // const plugin = plugin;
        const store = DataStore.getInstance();
        const ind = store.getFileIndex(note.path);
        const trackedFile = store.getTrackedFile(note.path);
        const item = store.getNoteItem(note.path);

        if (item == null) {
            // store._updateItem(fileid, ind, RPITEMTYPE.NOTE, rdeck.deckName);
            // item = store.getItembyID(fileid);
            console.debug("syncRCDataToSRrevDeck update null item:", item, trackedFile);
            return;
        }
        if (!trackedFile.isDefault && !item.isTracked) {
            const fileID = store.getFileID(note.path);
            item.setTracked(fileID);
        }

        if (item.hasDue) {
            rdeck.scheduledNotes.push(itemToShedNote(item, note));
        } else {
            rdeck.newNotes.push({ note, item });
        }
        // update store.trackFile and item
        trackedFile.setTracked(RPITEMTYPE.NOTE, rdeck.deckName);
        item.updateDeckName(rdeck.deckName, store.isCardItem(item.ID));

        return;
    }

    static async updateCardsSchedbyItems(note: Note, topicPath: TopicPath) {
        const store = DataStore.getInstance();
        const settings = store.settings;
        const noteFile: SrTFile = note.file as SrTFile;
        // === EARLY RETURN FOR EMPTY FILES, BUT WITH GHOST CLEANUP ===
        if (note.questionList.length === 0) {
            const fileID = store.getFileID(note.filePath);
            if (fileID !== "") {
                const trackedFile = store.getTrackedFile(note.filePath);
                if (trackedFile && trackedFile.hasCards) {
                    const removedCards = trackedFile.trackedItems;
                    removedCards.forEach((item) => {
                        if (item.reviewId >= 0) store.unTrackItem(item.reviewId);
                    });
                    trackedFile.trackedItems = [];
                }
            }
            return;
        }

        if (store.getFileID(note.filePath) === "") {
            if (
                settings.trackedNoteToDecks &&
                Tags.getNoteDeckName(noteFile.file, settings) !== null
            ) {
                store.trackFile(note.filePath, RPITEMTYPE.NOTE, false);
            } else {
                store.trackFile(note.filePath, RPITEMTYPE.CARD, false);
            }
        }
        const trackedFile = store.getTrackedFile(noteFile.path);

        // 核心：强制执行一次严格的全文同步，将文本结构映射为 TrackedItems
        // 注意：我们必须从 note 重新获取全文，因为这是复习调度发生的地方
        const currentFileText = note.fileText || ""; // 需要确保 Note 对象里有 fileText，如果没有，应该用 noteFile.read() 获取（此处假设 parser 刚跑过）
        let resolvedFileText = currentFileText;
        if (!resolvedFileText && note.questionList.length > 0) {
            resolvedFileText = await note.file.read();
        }
        const { removedIds } = trackedFile.syncNoteCardsIndex(resolvedFileText, settings);

        // 清理在 syncNoteCardsIndex 中被确实判定为删除的卡片
        for (const id of removedIds) {
            store.unTrackItem(id);
        }

        for (const question of note.questionList) {
            const lineNo: number = question.lineNo;
            const count: number = question.cards.length;
            const scheduling: RegExpMatchArray[] = [];

            const dtppath = question.topicPathList.list[0] ?? undefined;
            let deckname = dtppath?.hasPath ? dtppath.path[0] : topicPath.path[0];
            deckname = Tags.isDefaultDackName(deckname) ? deckname : "#" + deckname;

            // 为这个问题下的每个 Card 寻找对应的 TrackedItem
            const orderedFingerprintKeys = BlockUtils.getOrderedFingerprintKeys(
                question.questionText.actualQuestion,
                settings,
            );
            for (let i = 0; i < count; i++) {
                const cardObj = question.cards[i];

                // 尝试用 parser 里的真实 cloze 名（如果存在，比如 "c1", "c12"）
                // 既然旧版没有给 Card 对象直接挂载 clozeId，我们基于文本和类型进行推断：
                let targetClozeId = orderedFingerprintKeys[i] ?? `c${i + 1}`;
                if (
                    question.questionType === CardType.AnkiCloze &&
                    orderedFingerprintKeys.length === 0
                ) {
                    // 正则提取当前问题文本中所有的 Anki 挖空标志，如 {{c1::}}, {{c13::}}
                    const Qtext = question.questionText.actualQuestion;
                    const clozeMatches = Array.from(Qtext.matchAll(/{{(c\d+)::/g)).map((m) => m[1]);
                    // 去重，因为同一个编号可能在问题中被挖空多次（同一个 Card）
                    const uniqueClozes = Array.from(new Set(clozeMatches)).sort(
                        (a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)),
                    );
                    if (i < uniqueClozes.length) {
                        targetClozeId = uniqueClozes[i];
                    }
                } else if (
                    question.questionType !== CardType.Cloze &&
                    question.questionType !== CardType.AnkiCloze
                ) {
                    targetClozeId = "c1"; // 问答题统一为 c1
                }

                const trackedItem = trackedFile.getTrackedItem(lineNo, targetClozeId);

                if (trackedItem) {
                    // 同步存储与对象
                    store.updateCardItems(trackedFile, trackedItem, deckname, false);
                    cardObj.Id = trackedItem.reviewId;

                    if (cardObj.Id >= 0) {
                        const repetitionItem = store.getItembyID(cardObj.Id);
                        cardObj.repetitionItem = repetitionItem;

                        const sched = repetitionItem?.getSched() ?? null;
                        if (sched) scheduling.push(sched);
                    }
                } else {
                    cardObj.Id = -1;
                }
            }

            // 更新 scheduling 到卡片对象
            const update = updateCardObjs(question.cards, scheduling);

            // update question
            if (question.questionText.genBlockId && update) {
                question.hasChanged = true;
            } else {
                question.hasChanged = false;
            }
        }
    }
}

function updateCardObjs(cards: Card[], scheduling: RegExpMatchArray[]) {
    const schedInfoList: CardScheduleInfo[] =
        NoteCardScheduleParser.createInfoList_algo(scheduling);

    let update = false;
    for (let i = 0; i < cards.length; i++) {
        const cardObj = cards[i];
        const hasScheduleInfo: boolean = i < schedInfoList.length;
        const schedule: CardScheduleInfo = schedInfoList[i];
        const hassched = hasScheduleInfo && !schedule.isDummyScheduleForNewCard();

        if (hassched) update = true;
    }
    return update;
}

export function itemToShedNote(item: RepetitionItem, note: TFile): SchedNote {
    return {
        note,
        item,
        dueUnix: item.nextReview,
        interval: item.interval,
        ease: item.ease,
    };
}
