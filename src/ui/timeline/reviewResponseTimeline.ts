import { App } from "obsidian";

import {
    ReviewCommitStore,
    type ReviewCommitEditPayload,
    type ReviewCommitLog,
} from "src/dataStore/reviewCommitStore";
import { ReviewResponse } from "src/scheduling";
import { t } from "src/lang/helpers";
import {
    formatTimelineDurationDays,
    parseTimelineDurationPrefixRaw,
    type TimelineDisplayDuration,
} from "./timelineMessage";

import { captureTimelineContext } from "./timelineContext";

export type TimelineReviewResponse = "Reset" | "Hard" | "Good" | "Easy";

const TIMELINE_REVIEW_RESPONSE_VALUES: TimelineReviewResponse[] = [
    "Reset",
    "Hard",
    "Good",
    "Easy",
];

const REVIEW_RESPONSE_EDIT_CAPTURE =
    /^\s*([^:\n]+):\s*((?:\d+\s*(?:days|day|d|months|month|mo|years|year|y)\s*)+)::\s*/i;

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

export function mapTimelineLabelToReviewResponse(label: string): TimelineReviewResponse | null {
    const normalizedLabel = label.trim();

    for (const value of TIMELINE_REVIEW_RESPONSE_VALUES) {
        if (getTimelineReviewResponseLabel(value) === normalizedLabel) {
            return value;
        }
    }

    return null;
}

export function normalizeTimelineDisplayDuration(
    intervalDays: number | null | undefined,
): TimelineDisplayDuration | undefined {
    if (intervalDays == null || !Number.isFinite(intervalDays)) return undefined;
    const totalDays = Math.max(0, Math.round(intervalDays));
    return {
        raw: formatTimelineDurationDays(totalDays),
        totalDays,
    };
}

export function getTimelineReviewResponsePillText(
    reviewResponse: TimelineReviewResponse,
    displayDuration: TimelineDisplayDuration,
): string {
    return `${getTimelineReviewResponseLabel(reviewResponse)}:${displayDuration.raw}`;
}

export function getTimelineReviewResponsePrefixText(
    reviewResponse: TimelineReviewResponse | null | undefined,
    displayDuration: TimelineDisplayDuration | null | undefined,
): string | null {
    if (!reviewResponse || !displayDuration) return null;
    return `${getTimelineReviewResponsePillText(reviewResponse, displayDuration)}:: `;
}

export function extractTimelineReviewResponseBody(
    log: Pick<ReviewCommitLog, "message" | "entryType" | "reviewResponse" | "displayDuration">,
): string {
    const rawMessage = log.message ?? "";
    if (log.entryType !== "review-response") return rawMessage;

    const parsed = parseTimelineReviewResponseEditMessage(rawMessage);
    if (parsed.entryType === "review-response") {
        return parsed.message;
    }

    const colonIndex = rawMessage.indexOf(":");
    if (colonIndex < 0) return rawMessage;
    return rawMessage.slice(colonIndex + 1).trimStart();
}

export function materializeTimelineReviewResponseEditMessage(
    log: Pick<ReviewCommitLog, "message" | "entryType" | "reviewResponse" | "displayDuration">,
): string {
    const prefixText = getTimelineReviewResponsePrefixText(log.reviewResponse, log.displayDuration);
    if (log.entryType !== "review-response" || !prefixText) {
        return log.message ?? "";
    }

    return `${prefixText}${extractTimelineReviewResponseBody(log)}`;
}

export function parseTimelineReviewResponseEditMessage(message: string): ReviewCommitEditPayload {
    const raw = message ?? "";
    const match = raw.match(REVIEW_RESPONSE_EDIT_CAPTURE);
    if (!match) {
        return {
            message: raw,
            entryType: "manual",
        };
    }

    const reviewResponse = mapTimelineLabelToReviewResponse(match[1]);
    const durationPrefix = parseTimelineDurationPrefixRaw(match[2]);
    if (!reviewResponse || !durationPrefix) {
        return {
            message: raw,
            entryType: "manual",
        };
    }

    return {
        message: raw.slice(match[0].length),
        entryType: "review-response",
        reviewResponse,
        displayDuration: {
            raw: formatTimelineDurationDays(durationPrefix.totalDays),
            totalDays: durationPrefix.totalDays,
        },
    };
}

export function buildTimelineCommitEditPayload(
    log: Pick<ReviewCommitLog, "message" | "entryType" | "reviewResponse" | "displayDuration">,
    message: string,
): ReviewCommitEditPayload {
    if (log.entryType !== "review-response" || !log.reviewResponse || !log.displayDuration) {
        return {
            message,
            entryType: "manual",
        };
    }

    return parseTimelineReviewResponseEditMessage(message);
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
        "",
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
