import {
    combineInlineTitleStats,
    countInlineTitleStatsFromExtracts,
} from "src/inlineTitleCardStats";

describe("inline title extract stats", () => {
    test("counts only active extracts and marks new or due extracts as reviewable", () => {
        const now = 1_700_000_000_000;

        expect(
            countInlineTitleStatsFromExtracts(
                [
                    { stage: "active", timesReviewed: 0, nextReview: 0 },
                    { stage: "active", timesReviewed: 3, nextReview: now - 1 },
                    { stage: "active", timesReviewed: 2, nextReview: now + 60_000 },
                    { stage: "graduated", timesReviewed: 0, nextReview: 0 },
                ],
                now,
            ),
        ).toEqual({
            reviewableCount: 2,
            totalCount: 3,
        });
    });

    test("keeps reviewed future extracts in the total but not the reviewable count", () => {
        const now = 1_700_000_000_000;

        expect(
            countInlineTitleStatsFromExtracts(
                [
                    { stage: "active", timesReviewed: 4, nextReview: now + 86_400_000 },
                    { stage: "active", timesReviewed: 2, nextReview: now + 172_800_000 },
                    { stage: "active", timesReviewed: 0, nextReview: 0 },
                ],
                now,
            ),
        ).toEqual({
            reviewableCount: 1,
            totalCount: 3,
        });
    });

    test("combines card and extract counts for the inline title button", () => {
        expect(
            combineInlineTitleStats(
                { reviewableCount: 1, totalCount: 4 },
                { reviewableCount: 2, totalCount: 3 },
            ),
        ).toEqual({
            reviewableCount: 3,
            totalCount: 7,
        });
    });
});
