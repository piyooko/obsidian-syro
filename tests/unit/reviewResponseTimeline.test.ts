import { autoCommitReviewResponseToTimeline } from "src/ui/timeline/reviewResponseTimeline";
import { ReviewResponse } from "src/scheduling";

describe("reviewResponseTimeline", () => {
    const makeApp = () =>
        ({
            workspace: {
                getActiveViewOfType: jest.fn(() => null),
                getLeavesOfType: jest.fn(() => []),
            },
        }) as any;

    it("does nothing when auto logging is disabled", async () => {
        const commitStore = {
            addCommit: jest.fn(),
        } as any;

        const committed = await autoCommitReviewResponseToTimeline({
            app: makeApp(),
            commitStore,
            enabled: false,
            notePath: "note.md",
            response: ReviewResponse.Good,
        });

        expect(committed).toBe(false);
        expect(commitStore.addCommit).not.toHaveBeenCalled();
    });

    it("writes review-response entries with metadata when enabled", async () => {
        const commitStore = {
            addCommit: jest.fn(async () => undefined),
        } as any;

        const committed = await autoCommitReviewResponseToTimeline({
            app: makeApp(),
            commitStore,
            enabled: true,
            notePath: "note.md",
            response: ReviewResponse.Hard,
            intervalDays: 9,
        });

        expect(committed).toBe(true);
        expect(commitStore.addCommit).toHaveBeenCalledWith(
            "note.md",
            "Hard:",
            undefined,
            undefined,
            {
                entryType: "review-response",
                reviewResponse: "Hard",
                displayDuration: { raw: "9d", totalDays: 9 },
            },
        );
    });
});
