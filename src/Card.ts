import { Question } from "./Question";
import { CardScheduleInfo } from "./CardSchedule";
import { CardListType } from "./Deck";
import { IQuestionPostponementList } from "./QuestionPostponementList";
import { globalDateProvider } from "./util/DateProvider";
import { RepetitionItem, CardQueue } from "./dataStore/repetitionItem";
import { Queue } from "./dataStore/queue";


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
        return this.isMultiCloze ? this.question.cards[this.multiCloze[0]] : undefined;
    }

    getNextClozeCard(): Card | undefined {
        return this.hasNextMultiCloze
            ? this.question.cards[this.multiCloze[this.multiClozeIndex + 1]]
            : undefined;
    }

    formatSchedule(): string {
        let result: string = "";
        if (this.hasSchedule) result = this.scheduleInfo.formatSchedule();
        else result = "New";
        return result;
    }
}
