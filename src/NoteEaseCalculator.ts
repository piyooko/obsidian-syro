/**
 * 这个文件主要是干什么的：
 * 计算特定笔记 (Note) 的“平均简易度” (Ease)。
 * 当一张新卡片生成时，可能会参考其所属笔记中其他卡片的 Ease 值，来设定初始难度。
 *
 * 它在项目中属于：逻辑层 (Logic Layer)
 *
 * 它会用到哪些文件：
 * 1. src/Note.ts (从笔记中获取所有问题)
 * 2. src/settings.ts (获取默认 Base Ease)
 *
 * 哪些文件会用到它：
 * 1. src/FlashcardReviewSequencer.ts (可能在某些调度逻辑中使用)
 * 2. src/CardScheduleCalculator.ts (计算新卡初始 Ease)
 */
import { Note } from "./Note";
import { SRSettings } from "./settings";

export class NoteEaseCalculator {
    static Calculate(note: Note, settings: SRSettings): number {
        let totalEase: number = 0;
        let scheduledCount: number = 0;

        note.questionList.forEach((question) => {
            question.cards
                .filter((card) => card.hasSchedule)
                .forEach((card) => {
                    totalEase += card.scheduleInfo.ease;
                    scheduledCount++;
                });
        });

        let result: number = 0;
        if (scheduledCount > 0) {
            const flashcardsInNoteAvgEase: number = totalEase / scheduledCount;
            const flashcardContribution: number = Math.min(
                1.0,
                Math.log(scheduledCount + 0.5) / Math.log(64),
            );
            result =
                flashcardsInNoteAvgEase * flashcardContribution +
                settings.baseEase * (1.0 - flashcardContribution);
        }
        return result;
    }
}
