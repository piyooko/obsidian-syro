import { App } from "obsidian";

import { ReviewCommitStore } from "src/dataStore/reviewCommitStore";
import { ReviewResponse } from "src/scheduling";
import { t } from "src/lang/helpers";
import type { TimelineDisplayDuration } from "./timelineMessage";

import { captureTimelineContext } from "./timelineContext";

export type TimelineReviewResponse = "Reset" | "Hard" | "Good" | "Easy";

export function mapReviewResponseToTimelineValue(
    response: ReviewResponse,
): TimelineReviewResponse | null {
    switch (response) {
        case ReviewResponse.Reset:
            return "Reset";
        case ReviewResponse.Hard:
            return "Hard";
        case ReviewResponse.Good:
            return "Good";
        case ReviewResponse.Easy:
            return "Easy";
        default:
            return null;
    }
}

export function getTimelineReviewResponseLabel(reviewResponse: TimelineReviewResponse): string {
    switch (reviewResponse) {
        case "Reset":
            return t("TIMELINE_REVIEW_RESET");
        case "Hard":
            return t("TIMELINE_REVIEW_HARD");
        case "Good":
            return t("TIMELINE_REVIEW_GOOD");
        case "Easy":
            return t("TIMELINE_REVIEW_EASY");
        default:
            return reviewResponse;
    }
}

export function normalizeTimelineDisplayDuration(intervalDays: number | null | undefined): TimelineDisplayDuration | undefined {
    if (intervalDays == null || !Number.isFinite(intervalDays)) return undefined;
    const totalDays = Math.max(0, Math.round(intervalDays));
    return {
        raw: `${totalDays}d`,
        totalDays,
    };
}

export async function autoCommitReviewResponseToTimeline(opts: {
    app: App;
    commitStore: ReviewCommitStore | null | undefined;
    enabled: boolean;
    notePath: string;
    response: ReviewResponse;
    intervalDays?: number | null;
}): Promise<boolean> {
    const { app, commitStore, enabled, notePath, response, intervalDays } = opts;
    if (!enabled || !commitStore) return false;

    const reviewResponse = mapReviewResponseToTimelineValue(response);
    if (!reviewResponse) return false;
    const displayDuration = normalizeTimelineDisplayDuration(intervalDays);

    const context = captureTimelineContext(app, notePath);
    await commitStore.addCommit(
        notePath,
        `${getTimelineReviewResponseLabel(reviewResponse)}:`,
        context.contextAnchor,
        context.scrollPercentage,
        {
            entryType: "review-response",
            reviewResponse,
            displayDuration,
        },
    );

    return true;
}
