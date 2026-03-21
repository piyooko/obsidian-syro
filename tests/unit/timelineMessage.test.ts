import {
    buildTimelineRenderModel,
    findTimelineLivePreviewSegments,
    getTimelineDurationPrefixSegment,
    parseTimelineMessage,
    sanitizeTimelineInlineMarkdown,
} from "src/ui/timeline/timelineMessage";

describe("timelineMessage", () => {
    it("parses day aliases at the beginning of a message", () => {
        const parsed = parseTimelineMessage("9days:: **review**");

        expect(parsed.durationPrefix).not.toBeNull();
        expect(parsed.durationPrefix?.totalDays).toBe(9);
        expect(parsed.durationPrefix?.normalized).toBe("9d");
        expect(parsed.body).toBe("**review**");
    });

    it("parses mixed month and day durations and folds months to 30 days", () => {
        const parsed = parseTimelineMessage("1mo20d:: done");

        expect(parsed.durationPrefix?.parts).toEqual([
            { value: 1, unit: "month" },
            { value: 20, unit: "day" },
        ]);
        expect(parsed.durationPrefix?.totalDays).toBe(50);
        expect(parsed.durationPrefix?.normalized).toBe("1mo20d");
        expect(parsed.body).toBe("done");
    });

    it("ignores invalid or non-leading prefixes", () => {
        expect(parseTimelineMessage("note 9d:: later").durationPrefix).toBeNull();
        expect(parseTimelineMessage("1yr:: unsupported").durationPrefix).toBeNull();
    });

    it("sanitizes block markdown markers but keeps inline syntax intact", () => {
        expect(sanitizeTimelineInlineMarkdown("# heading")).toBe("\\# heading");
        expect(sanitizeTimelineInlineMarkdown("- list item")).toBe("\\- list item");
        expect(sanitizeTimelineInlineMarkdown("| a | b |")).toBe("\\| a \\| b \\|");
        expect(sanitizeTimelineInlineMarkdown("**bold** ==mark== `code` $x$")).toBe(
            "**bold** ==mark== `code` $x$",
        );
    });

    it("does not parse duration prefixes when the setting is disabled", () => {
        expect(
            buildTimelineRenderModel({
                message: "9d:: review",
                enableDurationPrefixSyntax: false,
            }),
        ).toEqual({
            body: "9d:: review",
            duration: null,
        });
    });

    it("prefers structured display durations over parsing the message prefix", () => {
        expect(
            buildTimelineRenderModel({
                message: "Good:",
                enableDurationPrefixSyntax: false,
                displayDuration: { raw: "9d", totalDays: 9 },
            }),
        ).toEqual({
            body: "Good:",
            duration: { raw: "9d", totalDays: 9 },
        });
    });

    it("keeps an empty body when the message only contains a duration prefix", () => {
        expect(
            buildTimelineRenderModel({
                message: "1d::",
                enableDurationPrefixSyntax: true,
            }),
        ).toEqual({
            body: "",
            duration: { raw: "1d", totalDays: 1 },
        });
    });

    it("renders month-based prefixes using folded total days", () => {
        expect(
            buildTimelineRenderModel({
                message: "1mo::",
                enableDurationPrefixSyntax: true,
            }),
        ).toEqual({
            body: "",
            duration: { raw: "30d", totalDays: 30 },
        });

        expect(
            buildTimelineRenderModel({
                message: "1mo90d::",
                enableDurationPrefixSyntax: true,
            }),
        ).toEqual({
            body: "",
            duration: { raw: "120d", totalDays: 120 },
        });
    });

    it("parses year aliases and folds them to 365-day totals", () => {
        expect(parseTimelineMessage("1y:: plan").durationPrefix).toMatchObject({
            normalized: "1y",
            totalDays: 365,
        });
        expect(parseTimelineMessage("1year:: plan").durationPrefix).toMatchObject({
            normalized: "1y",
            totalDays: 365,
        });
        expect(
            buildTimelineRenderModel({
                message: "1year::",
                enableDurationPrefixSyntax: true,
            }),
        ).toEqual({
            body: "",
            duration: { raw: "365d", totalDays: 365 },
        });
    });

    it("collects live preview segments for inline syntax", () => {
        expect(findTimelineLivePreviewSegments("**bold** `code`", false)).toEqual([
            {
                kind: "bold",
                from: 0,
                to: 8,
                raw: "**bold**",
                text: "bold",
            },
            {
                kind: "inline-code",
                from: 9,
                to: 15,
                raw: "`code`",
                text: "code",
            },
        ]);
    });

    it("collects duration prefix segments only when the setting is enabled", () => {
        expect(findTimelineLivePreviewSegments("9d:: foo", false)).toEqual([]);
        expect(findTimelineLivePreviewSegments("9d:: foo", true)[0]).toEqual({
            kind: "duration-prefix",
            from: 0,
            to: 5,
            raw: "9d:: ",
            text: "9d",
            duration: { raw: "9d", totalDays: 9 },
        });
    });

    it("extracts the duration prefix segment for atomic token handling", () => {
        expect(getTimelineDurationPrefixSegment("1mo20d:: foo", true)).toEqual({
            kind: "duration-prefix",
            from: 0,
            to: 9,
            raw: "1mo20d:: ",
            text: "50d",
            duration: { raw: "50d", totalDays: 50 },
        });
        expect(getTimelineDurationPrefixSegment("1mo20d:: foo", false)).toBeNull();
    });
});
