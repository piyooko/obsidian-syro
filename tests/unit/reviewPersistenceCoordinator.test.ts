import { Question } from "src/Question";
import { DEFAULT_SETTINGS } from "src/settings";
import { ReviewPersistenceCoordinator } from "src/services/reviewPersistenceCoordinator";

describe("ReviewPersistenceCoordinator", () => {
    test("merges multiple pending question writes for the same note into one disk write", async () => {
        const file = {
            path: "note.md",
            read: jest.fn(async () => "note"),
            write: jest.fn(async (_value: string) => undefined),
        };

        const question1 = {
            lineNo: 1,
            note: { file },
            questionText: { textHash: "q1" },
            prepareQuestionTextUpdate: jest.fn((_noteText: string) => ({
                didReplace: true,
                newText: "note-q1",
                originalText: "Q1",
                replacementText: "Q1-updated",
            })),
            commitPreparedQuestionTextUpdate: jest.fn(),
        } as unknown as Question;

        const question2 = {
            lineNo: 2,
            note: { file },
            questionText: { textHash: "q2" },
            prepareQuestionTextUpdate: jest.fn((noteText: string) => ({
                didReplace: true,
                newText: `${noteText}-q2`,
                originalText: "Q2",
                replacementText: "Q2-updated",
            })),
            commitPreparedQuestionTextUpdate: jest.fn(),
        } as unknown as Question;

        const coordinator = new ReviewPersistenceCoordinator();
        coordinator.queueQuestionWrite(question1, DEFAULT_SETTINGS);
        coordinator.queueQuestionWrite(question2, DEFAULT_SETTINGS);

        await expect(coordinator.drain()).resolves.toBe(true);
        expect(file.read).toHaveBeenCalledTimes(1);
        expect(file.write).toHaveBeenCalledTimes(1);
        expect(file.write).toHaveBeenCalledWith("note-q1-q2");
        expect((question1 as any).commitPreparedQuestionTextUpdate).toHaveBeenCalledWith(
            "Q1-updated",
            DEFAULT_SETTINGS,
        );
        expect((question2 as any).commitPreparedQuestionTextUpdate).toHaveBeenCalledWith(
            "Q2-updated",
            DEFAULT_SETTINGS,
        );
    });

    test("retries failed note writes without dropping pending changes", async () => {
        jest.useFakeTimers();

        const file = {
            path: "retry.md",
            read: jest.fn(async () => "note"),
            write: jest
                .fn<Promise<void>, [string]>()
                .mockRejectedValueOnce(new Error("locked"))
                .mockResolvedValue(undefined),
        };

        const question = {
            lineNo: 1,
            note: { file },
            questionText: { textHash: "retry" },
            prepareQuestionTextUpdate: jest.fn((_noteText: string) => ({
                didReplace: true,
                newText: "note-updated",
                originalText: "Q1",
                replacementText: "Q1-updated",
            })),
            commitPreparedQuestionTextUpdate: jest.fn(),
        } as unknown as Question;

        const coordinator = new ReviewPersistenceCoordinator();
        coordinator.queueQuestionWrite(question, DEFAULT_SETTINGS);

        await expect(coordinator.drain(50)).resolves.toBe(false);
        jest.advanceTimersByTime(250);
        await Promise.resolve();
        await expect(coordinator.drain()).resolves.toBe(true);
        expect(file.write).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
    });
});
