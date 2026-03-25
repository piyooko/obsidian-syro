import type { App } from "obsidian";
import {
    autoCommitReviewResponseToTimeline,
    buildTimelineCommitEditPayload,
    extractTimelineReviewResponseBody,
    materializeTimelineReviewResponseEditMessage,
    parseTimelineReviewResponseEditMessage,
} from "src/ui/timeline/reviewResponseTimeline";
import { ReviewResponse } from "src/scheduling";
import type { ReviewCommitStore } from "src/dataStore/reviewCommitStore";

type CommitStoreLike = Pick<ReviewCommitStore, "addCommit">;

describe("reviewResponseTimeline", () => {
    const makeApp = (): App =>
        ({
            workspace: {
                getActiveViewOfType: jest.fn(() => null),
                getLeavesOfType: jest.fn(() => []),
            },
        }) as unknown as App;

    it("does nothing when auto logging is disabled", async () => {
        const commitStore = {
            addCommit: jest.fn(),
        } as CommitStoreLike as unknown as ReviewCommitStore;

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
        } as CommitStoreLike as unknown as ReviewCommitStore;

        const committed = await autoCommitReviewResponseToTimeline({
            app: makeApp(),
            commitStore,
            enabled: true,
            notePath: "note.md",
            response: ReviewResponse.Hard,
            intervalDays: 9,
        });

        expect(committed).toBe(true);
        expect(commitStore.addCommit).toHaveBeenCalledWith("note.md", "", undefined, undefined, {
            entryType: "review-response",
            reviewResponse: "Hard",
            displayDuration: { raw: "9d", totalDays: 9 },
        });
    });

    it("materializes review-response edits into atomic token text", () => {
        expect(
            materializeTimelineReviewResponseEditMessage({
                message: "Hard: extra detail",
                entryType: "review-response",
                reviewResponse: "Hard",
                displayDuration: { raw: "35d", totalDays: 35 },
            }),
        ).toBe("Hard:35d:: extra detail");
    });

    it("splits legacy review-response message bodies away from the pill", () => {
        expect(
            extractTimelineReviewResponseBody({
                message: "Hard: extra detail",
                entryType: "review-response",
                reviewResponse: "Hard",
                displayDuration: { raw: "35d", totalDays: 35 },
            }),
        ).toBe("extra detail");
    });

    it("parses review-response edit text back into structured metadata", () => {
        expect(parseTimelineReviewResponseEditMessage("Hard:35d:: next step")).toEqual({
            message: "next step",
            entryType: "review-response",
            reviewResponse: "Hard",
            displayDuration: { raw: "35d", totalDays: 35 },
        });
    });

    it("downgrades to a manual entry when the token is deleted", () => {
        expect(
            buildTimelineCommitEditPayload(
                {
                    message: "",
                    entryType: "review-response",
                    reviewResponse: "Hard",
                    displayDuration: { raw: "35d", totalDays: 35 },
                },
                "",
            ),
        ).toEqual({
            message: "",
            entryType: "manual",
        });
    });
});
