/**
 * 杩欎釜鏂囦欢涓昏鏄共浠€涔堢殑锛?
 * 杩欐槸鎻掍欢涓渶鏍稿績鐨勨€滃崱鐗団€濇ā鍨嬨€傛墍鏈夌殑璁板繂鍗＄墖鍦ㄧ▼搴忛噷閮戒細鍙樻垚杩欐牱涓€涓璞°€?
 * 瀹冭褰曚簡涓€寮犲崱鐗囩殑姝ｉ潰鍐呭銆佽儗闈㈠唴瀹广€佸畠灞炰簬鍝潯绗旇锛堥棶棰橈級銆佷互鍙婂畠鐜板湪搴旇浠€涔堟椂鍊欏涔狅紙璋冨害淇℃伅锛夈€?
 * 杩欎釜鏂囦欢灏卞儚鏄崱鐗囩殑韬唤璇侊紝瀛樻斁浜嗗崱鐗囩殑涓€鍒囪韩浠戒俊鎭€?
 * 鍙﹀锛屽畠鐜板湪涔熻礋璐ｈ褰曞崱鐗囦粠琚彂鐜板埌琚涔犵殑鈥滀竴鐢熲€濓紙鐢熷懡鍛ㄦ湡璋冭瘯璁板綍锛夛紝杩欏湪鎴戜滑鎯宠鎺掓煡鏌愬紶鍗＄墖鐨勬暟鎹祦缁忎簡鍝簺姝ラ鏃堕潪甯告湁鐢ㄣ€?
 *
 * 瀹冨湪椤圭洰涓睘浜庯細鏁版嵁灞?/ 妯″瀷灞?
 *
 * 瀹冧細鐢ㄥ埌鍝簺鏂囦欢锛?
 * 1. src/Question.ts (鍗＄墖蹇呴』褰掑睘浜庢煇涓€涓叿浣撶殑绗旇闂)
 * 2. src/CardSchedule.ts (鍗＄墖闇€瑕佺煡閬撹嚜宸辩殑澶嶄範璁″垝锛屾瘮濡備笅娆″涔犳椂闂?
 * 3. src/Deck.ts (鍗＄墖闇€瑕佺煡閬撹嚜宸卞睘浜庡摢涓€滄柊鍗♀€濇垨鈥滃緟澶嶄範鈥濈殑闃熷垪)
 * 4. src/dataStore/queue.ts (瀹冮渶瑕佺煡閬撹嚜宸卞湪涓嶅湪绋嶅悗澶嶄範鐨勯槦鍒椾腑)
 *
 * 鍝簺鏂囦欢浼氱敤鍒板畠锛?
 * 1. src/Deck.ts (鐗岀粍灏辨槸鎶婂緢澶氳繖绉嶅崱鐗囩粍鍚堝湪涓€璧?
 * 2. src/FlashcardReviewSequencer.ts (澶嶄範娴佺▼鎺у埗涓績锛屽畠鏁村ぉ閮藉湪璋冨害鎿嶄綔杩欎簺鍗＄墖)
 * 3. src/NoteQuestionParser.ts (鍦ㄨВ鏋愭彁鍙栫瑪璁扮殑鏃跺€欙紝浼氭妸鍖归厤鍒扮殑鏂囧瓧鐢熸垚杩欐牱鐨勫崱鐗囧璞?
 */
/**
 * [妯″瀷] 浠ｈ〃涓€寮犲叿浣撶殑鍗＄墖锛團ront/Back/Schedule锛夈€?
 */
import { Question } from "./Question";
import { CardScheduleInfo } from "./CardSchedule";
import { CardListType } from "./Deck";
import { IQuestionPostponementList } from "./QuestionPostponementList";
import { globalDateProvider } from "./util/DateProvider";
import { RepetitionItem, CardQueue } from "./dataStore/repetitionItem";
import { Queue } from "./dataStore/queue";

// 鍗＄墖鐢熷懡鍛ㄦ湡鐨勮皟璇曟棩蹇楄褰曢」
export interface DebugLogEntry {
    timestamp: number;
    phase: "Parser" | "Generator" | "Scheduler" | "Render" | "Database";
    action: string;
    details?: unknown;
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

    addDebugLog(phase: DebugLogEntry["phase"], action: string, details?: unknown): void {
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
