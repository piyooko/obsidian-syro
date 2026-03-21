/**
 * 这个文件主要是干什么的：
 * 代表 Obsidian 中的一篇"笔记"(Note) 文件。
 * 它包含从该文件中解析出的所有"问题"(Question) 列表。
 * 负责处理整个笔记层面的操作，如写入文件更新。
 *
 * 它在项目中属于：模型层 (Model Layer)
 *
 * 它会用到哪些文件：
 * 1. src/Question.ts (笔记包含的问题)
 * 2. src/SRFile.ts (文件读写接口)
 *
 * 哪些文件会用到它：
 * 1. src/NoteQuestionParser.ts (解析结果的聚合对象)
 * 2. src/FlashcardReviewSequencer.ts (获取当前卡片所属的笔记上下文)
 */
/**
 * [模型] 代表一篇笔记，包含多个 Question。
 */
import { SRSettings } from "./settings";
import { Deck } from "./Deck";
import { CardType, Question } from "./Question";
import { ISRFile } from "./SRFile";
import { convMultiCloze } from "src/util/multi-cloze-util";

export class Note {
    file: ISRFile;
    questionList: Question[];
    fileText: string;
    reviewFileText: string;

    get hasChanged(): boolean {
        return this.questionList.some((question) => question.hasChanged);
    }

    get filePath(): string {
        return this.file.path;
    }

    constructor(file: ISRFile, questionList: Question[], fileText: string = "") {
        this.file = file;
        this.questionList = questionList;
        this.fileText = fileText;
        this.reviewFileText = "";
        questionList.forEach((question) => (question.note = this));
    }

    needsReviewFileText(settings: Pick<SRSettings, "showContextInCards">): boolean {
        if (!settings.showContextInCards) {
            return false;
        }

        return this.questionList.some((question) => question.questionType === CardType.AnkiCloze);
    }

    async ensureReviewFileText(settings: Pick<SRSettings, "showContextInCards">): Promise<void> {
        if (!this.needsReviewFileText(settings) || this.reviewFileText) {
            return;
        }

        this.reviewFileText = this.fileText || (await this.file.read());
    }

    async clearTransientFileText(settings: Pick<SRSettings, "showContextInCards">): Promise<void> {
        await this.ensureReviewFileText(settings);
        this.fileText = "";
    }

    appendCardsToDeck(deck: Deck): void {
        for (const question of this.questionList) {
            for (const card of question.cards) {
                deck.appendCard(question.topicPathList, card);
            }
        }
    }

    createMultiCloze(settings: SRSettings): void {
        if (!settings.multiClozeCard) return;
        this.questionList.filter((question) => {
            convMultiCloze(question.cards, question.questionText.actualQuestion, settings);
        });
    }

    debugLogToConsole(desc: string = "") {
        let str: string = `Note: ${desc}: ${this.questionList.length} questions\r\n`;
        for (let i = 0; i < this.questionList.length; i++) {
            const q: Question = this.questionList[i];
            str += `[${i}]: ${q.questionType}: ${q.lineNo}: ${q.topicPathList?.format("|")}: ${
                q.questionText.original
            }\r\n`;
        }
        console.debug(str);
    }

    async writeNoteFile(settings: SRSettings): Promise<void> {
        let fileText: string = await this.file.read();
        for (const question of this.questionList) {
            if (question.hasChanged) {
                fileText = question.updateQuestionText(fileText, settings);
            }
        }
        await this.file.write(fileText);
        this.questionList.forEach((question) => (question.hasChanged = false));
    }
}
