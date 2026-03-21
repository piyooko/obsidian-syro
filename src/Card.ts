/**
 * 这个文件主要是干什么的：
 * 这是插件中最核心的“卡片”模型。所有的记忆卡片在程序里都会变成这样一个对象。
 * 它记录了一张卡片的正面内容、背面内容、它属于哪条笔记（问题）、以及它现在应该什么时候复习（调度信息）。
 * 这个文件就像是卡片的身份证，存放了卡片的一切身份信息。
 * 另外，它现在也负责记录卡片从被发现到被复习的“一生”（生命周期调试记录），这在我们想要排查某张卡片的数据流经了哪些步骤时非常有用。
 *
 * 它在项目中属于：数据层 / 模型层
 *
 * 它会用到哪些文件：
 * 1. src/Question.ts (卡片必须归属于某一个具体的笔记问题)
 * 2. src/CardSchedule.ts (卡片需要知道自己的复习计划，比如下次复习时间)
 * 3. src/Deck.ts (卡片需要知道自己属于哪个“新卡”或“待复习”的队列)
 * 4. src/dataStore/queue.ts (它需要知道自己在不在稍后复习的队列中)
 *
 * 哪些文件会用到它：
 * 1. src/Deck.ts (牌组就是把很多这种卡片组合在一起)
 * 2. src/FlashcardReviewSequencer.ts (复习流程控制中心，它整天都在调度操作这些卡片)
 * 3. src/NoteQuestionParser.ts (在解析提取笔记的时候，会把匹配到的文字生成这样的卡片对象)
 */
/**
 * [模型] 代表一张具体的卡片（Front/Back/Schedule）。
 */
import { Question } from "./Question";
import { CardScheduleInfo } from "./CardSchedule";
import { CardListType } from "./Deck";
import { IQuestionPostponementList } from "./QuestionPostponementList";
import { globalDateProvider } from "./util/DateProvider";
import { RepetitionItem, CardQueue } from "./dataStore/repetitionItem";
import { Queue } from "./dataStore/queue";

// 卡片生命周期的调试日志记录项
export interface DebugLogEntry {
    timestamp: number;
    phase: "Parser" | "Generator" | "Scheduler" | "Render" | "Database";
    action: string;
    details?: any;
}

export class Card {
    question: Question;
    cardIdx: number;
    front?: string;
    back?: string;
    Id?: number;
    multiClozeIndex?: number;
    multiCloze?: number[];
    scheduleInfo: CardScheduleInfo;
    repetitionItem?: RepetitionItem;
    debugTrace?: DebugLogEntry[];

    constructor(init?: Partial<Card>) {
        if (init) {
            Object.assign(this, init);
        }
    }

    get cardListType(): CardListType {
        if (!this.repetitionItem) {
            // Fallback for cards without RepetitionItem (legacy path)
            if (this.hasSchedule && this.scheduleInfo.isDue()) return CardListType.DueCard;
            return CardListType.NewCard;
        }
        switch (this.repetitionItem.queue) {
            case CardQueue.Learn:
                return CardListType.LearningCard;
            case CardQueue.Review:
                return CardListType.DueCard;
            case CardQueue.New:
            default:
                return CardListType.NewCard;
        }
    }

    get isLearning(): boolean {
        return this.repetitionItem?.isInLearningPhase ?? false;
    }

    // scheduling
    get hasSchedule(): boolean {
        return this.scheduleInfo != null;
    }

    get isNew(): boolean {
        return (
            this.repetitionItem?.isNew ??
            (this.hasSchedule && this.scheduleInfo.isDummyScheduleForNewCard())
        );
    }

    get isDue(): boolean {
        return this.repetitionItem?.isDue ?? (this.hasSchedule && this.scheduleInfo.isDue());
    }

    getIsNotBury(questionPostponementList: IQuestionPostponementList): boolean {
        let notBury = !questionPostponementList.includes(this.question);
        if (notBury) {
            return true;
        } else if (this.hasSchedule) {
            if (
                this.scheduleInfo.dueDate.isSameOrBefore(globalDateProvider.today) &&
                Queue.getInstance().isInLaterQueue(this?.Id)
            ) {
                notBury = true;
            }
        }
        return notBury;
    }

    get isMultiCloze(): boolean {
        return this?.multiClozeIndex >= 0;
    }

    /**
     * 3 cloze in a group, but last group could have 4 cloze.
     */
    get hasNextMultiCloze(): boolean {
        return this.isMultiCloze && this.multiClozeIndex + 1 < this.multiCloze.length;
    }

    getFirstClozeCard(): Card | undefined {
        return this.isMultiCloze ? this.question.cards[this.multiCloze![0]] : undefined;
    }

    getNextClozeCard(): Card | undefined {
        return this.hasNextMultiCloze
            ? this.question.cards[this.multiCloze![this.multiClozeIndex! + 1]]
            : undefined;
    }

    formatSchedule(): string {
        let result: string = "";
        if (this.hasSchedule) result = this.scheduleInfo.formatSchedule();
        else result = "New";
        return result;
    }

    addDebugLog(phase: DebugLogEntry["phase"], action: string, details?: any): void {
        if (!this.debugTrace) {
            this.debugTrace = [];
        }
        this.debugTrace.push({
            timestamp: Date.now(),
            phase,
            action,
            details,
        });
    }
}
