import { Card } from "src/Card";
import { CardScheduleInfo } from "src/CardSchedule";
import { Note } from "src/Note";
import { ParsedQuestionInfo } from "src/parser";
import { Question, QuestionText } from "src/Question";
import { ISRFile } from "src/SRFile";
import { TopicPath, TopicPathList, TopicPathWithWs } from "src/TopicPath";
import { TextDirection } from "src/util/TextDirection";

export const NOTE_CACHE_VERSION = 3;

export interface CachedNoteBindingStore {
    getItembyID(id: number): { fileID?: string | null } | null;
    getFileByID(fileID: string): { path?: string | null } | null;
    getTrackedFile(path: string): { trackedItems?: Array<{ reviewId: number }> | null } | null;
}

export interface CachedNoteBindingMismatch {
    reason:
        | "missing-card-id"
        | "missing-item"
        | "missing-file-id"
        | "missing-file"
        | "file-mismatch"
        | "missing-tracked-file"
        | "missing-tracked-item";
    cardId: number | null;
    notePath: string;
    actualFilePath: string | null;
}

interface SerializedTopicPathList {
    lineNum: number | null;
    list: string[][];
}

interface SerializedTopicPathWithWs {
    path: string[];
    preWhitespace: string;
    postWhitespace: string;
}

interface SerializedQuestionText {
    original: string;
    actualQuestion: string;
    textDirection: number;
    obsidianBlockId: string | null;
    genBlockId?: string | null;
    topicPathWithWs: SerializedTopicPathWithWs | null;
}

interface SerializedParsedQuestionInfo {
    cardType: number;
    text: string;
    firstLineNum: number;
    lastLineNum: number;
}

interface SerializedSchedule {
    dueUnix: number;
    interval: number;
    ease: number;
    delayBeforeReviewTicks: number;
}

interface SerializedCard {
    cardIdx: number;
    id: number | null;
    schedule: SerializedSchedule | null;
    multiClozeIndex: number | null;
    multiCloze: number[] | null;
}

interface SerializedQuestion {
    parsedQuestionInfo: SerializedParsedQuestionInfo;
    topicPathList: SerializedTopicPathList | null;
    questionText: SerializedQuestionText;
    hasEditLaterTag: boolean;
    questionContext: string[];
    cards: SerializedCard[];
}

export interface SerializedNote {
    questions: SerializedQuestion[];
}

export interface PersistedNoteCacheItem {
    path: string;
    mtime: number;
    data: SerializedNote;
}

export interface PersistedNoteCacheFile {
    version: number;
    signature: string;
    items: PersistedNoteCacheItem[];
}

export function validateCachedNoteBindings(
    note: Note,
    store: CachedNoteBindingStore,
): CachedNoteBindingMismatch | null {
    const notePath = note.filePath;
    const trackedFile = store.getTrackedFile(notePath);
    if (!trackedFile) {
        return {
            reason: "missing-tracked-file",
            cardId: null,
            notePath,
            actualFilePath: null,
        };
    }

    const trackedReviewIds = new Set(
        (trackedFile.trackedItems ?? [])
            .map((item) => item?.reviewId)
            .filter((reviewId): reviewId is number => typeof reviewId === "number" && reviewId >= 0),
    );

    for (const question of note.questionList) {
        for (const card of question.cards) {
            if (typeof card.Id !== "number" || card.Id < 0) {
                return {
                    reason: "missing-card-id",
                    cardId: null,
                    notePath,
                    actualFilePath: null,
                };
            }

            const item = store.getItembyID(card.Id);
            if (!item) {
                return {
                    reason: "missing-item",
                    cardId: card.Id,
                    notePath,
                    actualFilePath: null,
                };
            }

            if (!item.fileID) {
                return {
                    reason: "missing-file-id",
                    cardId: card.Id,
                    notePath,
                    actualFilePath: null,
                };
            }

            const ownerFile = store.getFileByID(item.fileID);
            const actualFilePath = ownerFile?.path ?? null;
            if (!actualFilePath) {
                return {
                    reason: "missing-file",
                    cardId: card.Id,
                    notePath,
                    actualFilePath: null,
                };
            }

            if (actualFilePath !== notePath) {
                return {
                    reason: "file-mismatch",
                    cardId: card.Id,
                    notePath,
                    actualFilePath,
                };
            }

            if (!trackedReviewIds.has(card.Id)) {
                return {
                    reason: "missing-tracked-item",
                    cardId: card.Id,
                    notePath,
                    actualFilePath,
                };
            }
        }
    }

    return null;
}

function serializeCardSchedule(
    note: Note,
    question: Question,
    questionIdx: number,
    card: Card,
): SerializedSchedule | null {
    const scheduleInfo = card.scheduleInfo;
    if (!scheduleInfo) {
        return null;
    }

    const dueDate = scheduleInfo.dueDate;
    if (!dueDate || typeof dueDate.valueOf !== "function") {
        console.warn("[SR-Cache] Skipping invalid card schedule during note cache save:", {
            notePath: note.filePath,
            questionIdx,
            cardIdx: card.cardIdx,
            cardId: card.Id ?? null,
            questionText: question.questionText?.actualQuestion ?? "",
        });
        return null;
    }

    return {
        dueUnix: dueDate.valueOf(),
        interval: scheduleInfo.interval,
        ease: scheduleInfo.ease,
        delayBeforeReviewTicks: scheduleInfo.delayBeforeReviewTicks,
    };
}

export function serializeNote(note: Note): SerializedNote {
    const questions: SerializedQuestion[] = note.questionList.map((question, questionIdx) => {
        const parsedQuestionInfo: SerializedParsedQuestionInfo = {
            cardType: question.parsedQuestionInfo.cardType,
            text: question.parsedQuestionInfo.text,
            firstLineNum: question.parsedQuestionInfo.firstLineNum,
            lastLineNum: question.parsedQuestionInfo.lastLineNum,
        };

        const topicPathList: SerializedTopicPathList | null = question.topicPathList
            ? {
                  lineNum: question.topicPathList.lineNum ?? null,
                  list: question.topicPathList.list.map((topicPath) => [...topicPath.path]),
              }
            : null;

        const topicPathWithWs: SerializedTopicPathWithWs | null = question.questionText
            .topicPathWithWs
            ? {
                  path: [...question.questionText.topicPathWithWs.topicPath.path],
                  preWhitespace: question.questionText.topicPathWithWs.preWhitespace,
                  postWhitespace: question.questionText.topicPathWithWs.postWhitespace,
              }
            : null;

        const questionText: SerializedQuestionText = {
            original: question.questionText.original,
            actualQuestion: question.questionText.actualQuestion,
            textDirection: question.questionText.textDirection,
            obsidianBlockId: question.questionText.obsidianBlockId ?? null,
            genBlockId: question.questionText.genBlockId ?? null,
            topicPathWithWs,
        };

        const cards: SerializedCard[] = question.cards.map((card) => ({
            cardIdx: card.cardIdx,
            id: card.Id ?? null,
            schedule: serializeCardSchedule(note, question, questionIdx, card),
            multiClozeIndex: card.multiClozeIndex ?? null,
            multiCloze: card.multiCloze ? [...card.multiCloze] : null,
        }));

        return {
            parsedQuestionInfo,
            topicPathList,
            questionText,
            hasEditLaterTag: question.hasEditLaterTag,
            questionContext: question.questionContext ?? [],
            cards,
        };
    });

    return { questions };
}

export function deserializeNote(data: SerializedNote, file: ISRFile): Note {
    const questions = (data.questions ?? []).map((questionData): Question => {
        const parsedQuestionInfo = new ParsedQuestionInfo(
            questionData.parsedQuestionInfo.cardType as ConstructorParameters<typeof ParsedQuestionInfo>[0],
            questionData.parsedQuestionInfo.text,
            questionData.parsedQuestionInfo.firstLineNum,
            questionData.parsedQuestionInfo.lastLineNum,
        );

        const topicPathList = questionData.topicPathList
            ? new TopicPathList(
                  questionData.topicPathList.list.map((path) => new TopicPath(path)),
                  questionData.topicPathList.lineNum,
              )
            : null;

        const topicPathWithWs = questionData.questionText.topicPathWithWs
            ? new TopicPathWithWs(
                  new TopicPath(questionData.questionText.topicPathWithWs.path),
                  questionData.questionText.topicPathWithWs.preWhitespace,
                  questionData.questionText.topicPathWithWs.postWhitespace,
              )
            : null;

        const questionText = new QuestionText(
            questionData.questionText.original,
            topicPathWithWs,
            questionData.questionText.actualQuestion,
            questionData.questionText.textDirection as TextDirection,
            questionData.questionText.obsidianBlockId,
        );
        if (questionData.questionText.genBlockId) {
            questionText.genBlockId = questionData.questionText.genBlockId;
        }

        const cards: Card[] = (questionData.cards ?? []).map((cardData): Card => {
            const scheduleInfo = cardData.schedule
                ? CardScheduleInfo.fromDueDateMoment(
                      window.moment(cardData.schedule.dueUnix),
                      cardData.schedule.interval,
                      cardData.schedule.ease,
                      cardData.schedule.delayBeforeReviewTicks,
                  )
                : null;

            return new Card({
                cardIdx: cardData.cardIdx,
                Id: cardData.id ?? undefined,
                multiClozeIndex: cardData.multiClozeIndex ?? undefined,
                multiCloze: cardData.multiCloze ?? undefined,
                scheduleInfo,
            });
        });

        const question = new Question({
            parsedQuestionInfo,
            topicPathList,
            questionText,
            hasEditLaterTag: questionData.hasEditLaterTag,
            questionContext: questionData.questionContext ?? [],
            cards: [],
            hasChanged: false,
        });
        question.setCardList(cards);
        return question;
    });

    const note = new Note(file, questions, "");
    note.fileText = "";
    return note;
}
