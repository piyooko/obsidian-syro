/**
 * 这个文件主要是干什么的：
 * 管理“被推迟” (Buried/Postponed) 的问题列表。
 * 在复习过程中，如果用户选择推迟某张卡片，或根据设置自动推迟兄弟卡片，这些卡片会记录于此，本次复习不再出现。
 *
 * 它在项目中属于：数据/逻辑层
 *
 * 它会用到哪些文件：
 * 1. src/Question.ts (被推迟的对象)
 * 2. src/main.ts (持久化存储)
 *
 * 哪些文件会用到它：
 * 1. src/FlashcardReviewSequencer.ts (检查卡片是否应被跳过)
 * 2. src/DeckTreeFilter.ts (在构建复习树时过滤掉推迟的卡片)
 */
import { Question } from "./Question";
import SRPlugin from "./main";
import { SRSettings } from "./settings";

export interface IQuestionPostponementList {
    clear(): void;
    add(question: Question): void;
    includes(question: Question): boolean;
    write(): Promise<void>;
}

export class QuestionPostponementList implements IQuestionPostponementList {
    list: string[];
    plugin: SRPlugin;
    settings: SRSettings;

    constructor(plugin: SRPlugin, settings: SRSettings, list: string[]) {
        this.plugin = plugin;
        this.settings = settings;
        this.list = list;
    }

    clear(): void {
        this.list.splice(0);
    }

    add(question: Question): void {
        if (!this.includes(question)) this.list.push(question.questionText.textHash);
    }

    includes(question: Question): boolean {
        return this.list.includes(question.questionText.textHash);
    }

    async write(): Promise<void> {
        // This is null only whilst unit testing is being performed
        if (this.plugin == null) return;

        await this.plugin.savePluginData();
    }
}
