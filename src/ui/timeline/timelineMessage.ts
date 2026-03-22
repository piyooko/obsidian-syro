export type TimelineDurationUnit = "day" | "month" | "year";

export interface TimelineDurationPart {
    value: number;
    unit: TimelineDurationUnit;
}

export interface TimelineDurationPrefix {
    raw: string;
    normalized: string;
    totalDays: number;
    parts: TimelineDurationPart[];
}

export interface TimelineDisplayDuration {
    raw: string;
    totalDays: number;
}

export interface ParsedTimelineMessage {
    raw: string;
    body: string;
    durationPrefix: TimelineDurationPrefix | null;
}

export interface TimelineRenderModel {
    body: string;
    duration: TimelineDisplayDuration | null;
}

export type TimelineLivePreviewSegmentKind =
    | "duration-prefix"
    | "review-response-prefix"
    | "bold"
    | "italic"
    | "strikethrough"
    | "highlight"
    | "inline-code"
    | "math";

export interface TimelineLivePreviewSegment {
    kind: TimelineLivePreviewSegmentKind;
    from: number;
    to: number;
    raw: string;
    text: string;
    title?: string;
    duration?: TimelineDisplayDuration;
}

const DURATION_UNIT_ALIASES: Record<string, TimelineDurationUnit> = {
    d: "day",
    day: "day",
    days: "day",
    mo: "month",
    month: "month",
    months: "month",
    y: "year",
    year: "year",
    years: "year",
};

const PREFIX_CAPTURE = /^\s*((?:\d+\s*(?:days|day|d|months|month|mo|years|year|y)\s*)+)::\s*/i;
const PREFIX_SEGMENT = /(\d+)\s*(days|day|d|months|month|mo|years|year|y)/gi;

export function formatTimelineDurationDays(totalDays: number): string {
    return `${Math.max(0, Math.round(totalDays))}d`;
}

export function parseTimelineDurationPrefixRaw(rawPrefix: string): TimelineDurationPrefix | null {
    const parts: TimelineDurationPart[] = [];
    let consumed = "";
    let totalDays = 0;

    for (const partMatch of rawPrefix.matchAll(PREFIX_SEGMENT)) {
        const value = Number(partMatch[1]);
        const rawUnit = partMatch[2].toLowerCase();
        const unit = DURATION_UNIT_ALIASES[rawUnit];
        if (!unit || !Number.isFinite(value)) {
            return null;
        }

        parts.push({ value, unit });
        consumed += `${partMatch[1]}${rawUnit}`;
        totalDays += unit === "year" ? value * 365 : unit === "month" ? value * 30 : value;
    }

    const compactRawPrefix = rawPrefix.replace(/\s+/g, "").toLowerCase();
    if (parts.length === 0 || consumed !== compactRawPrefix) {
        return null;
    }

    return {
        raw: rawPrefix.replace(/\s+/g, ""),
        normalized: parts
            .map((part) =>
                `${part.value}${part.unit === "year" ? "y" : part.unit === "month" ? "mo" : "d"}`,
            )
            .join(""),
        totalDays,
        parts,
    };
}

export function parseTimelineMessage(message: string): ParsedTimelineMessage {
    const raw = message ?? "";
    const match = raw.match(PREFIX_CAPTURE);
    if (!match) {
        return {
            raw,
            body: raw,
            durationPrefix: null,
        };
    }

    const durationPrefix = parseTimelineDurationPrefixRaw(match[1]);
    if (!durationPrefix) {
        return {
            raw,
            body: raw,
            durationPrefix: null,
        };
    }

    return {
        raw,
        body: raw.slice(match[0].length),
        durationPrefix,
    };
}

export function normalizeTimelineInlineLines(body: string): string[] {
    return body.replace(/\r\n/g, "\n").split("\n");
}

export function buildTimelineRenderModel(opts: {
    message: string;
    enableDurationPrefixSyntax: boolean;
    displayDuration?: TimelineDisplayDuration | null;
}): TimelineRenderModel {
    const { message, enableDurationPrefixSyntax, displayDuration } = opts;
    if (displayDuration) {
        return {
            body: message,
            duration: displayDuration,
        };
    }

    if (!enableDurationPrefixSyntax) {
        return {
            body: message,
            duration: null,
        };
    }

    const parsed = parseTimelineMessage(message);
    return {
        body: parsed.body,
        duration: parsed.durationPrefix
            ? {
                  raw: formatTimelineDurationDays(parsed.durationPrefix.totalDays),
                  totalDays: parsed.durationPrefix.totalDays,
              }
            : null,
    };
}

function collectTimelineRegexSegments(
    message: string,
    offset: number,
    regex: RegExp,
    kind: Exclude<TimelineLivePreviewSegmentKind, "duration-prefix" | "review-response-prefix">,
): TimelineLivePreviewSegment[] {
    const segments: TimelineLivePreviewSegment[] = [];
    regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(message)) !== null) {
        const raw = match[0];
        const text = match[1];
        const from = offset + match.index;
        const to = from + raw.length;
        segments.push({
            kind,
            from,
            to,
            raw,
            text,
        });
    }

    return segments;
}

export function findTimelineLivePreviewSegments(
    message: string,
    enableDurationPrefixSyntax: boolean,
    reviewResponsePrefixText?: string | null,
): TimelineLivePreviewSegment[] {
    const raw = message ?? "";
    const segments: TimelineLivePreviewSegment[] = [];
    let bodyOffset = 0;

    if (reviewResponsePrefixText && raw.startsWith(reviewResponsePrefixText)) {
        bodyOffset = reviewResponsePrefixText.length;
        segments.push({
            kind: "review-response-prefix",
            from: 0,
            to: bodyOffset,
            raw: reviewResponsePrefixText,
            text: reviewResponsePrefixText.replace(/::\s*$/, ""),
            title: reviewResponsePrefixText.replace(/::\s*$/, ""),
        });
    } else if (enableDurationPrefixSyntax) {
        const parsed = parseTimelineMessage(raw);
        if (parsed.durationPrefix) {
            const prefixMatch = raw.match(PREFIX_CAPTURE);
            if (prefixMatch) {
                bodyOffset = prefixMatch[0].length;
                segments.push({
                    kind: "duration-prefix",
                    from: 0,
                    to: bodyOffset,
                    raw: prefixMatch[0],
                    text: formatTimelineDurationDays(parsed.durationPrefix.totalDays),
                    duration: {
                        raw: formatTimelineDurationDays(parsed.durationPrefix.totalDays),
                        totalDays: parsed.durationPrefix.totalDays,
                    },
                });
            }
        }
    }

    const body = raw.slice(bodyOffset);
    segments.push(
        ...collectTimelineRegexSegments(body, bodyOffset, /\*\*(.+?)\*\*/g, "bold"),
        ...collectTimelineRegexSegments(
            body,
            bodyOffset,
            /(?<!\*)\*([^*\n]+?)\*(?!\*)/g,
            "italic",
        ),
        ...collectTimelineRegexSegments(body, bodyOffset, /~~(.+?)~~/g, "strikethrough"),
        ...collectTimelineRegexSegments(body, bodyOffset, /==(.+?)==/g, "highlight"),
        ...collectTimelineRegexSegments(body, bodyOffset, /`([^`\n]+?)`/g, "inline-code"),
        ...collectTimelineRegexSegments(body, bodyOffset, /(?<!\$)\$([^$\n]+?)\$(?!\$)/g, "math"),
    );

    return segments.sort((left, right) => left.from - right.from || left.to - right.to);
}

export function getTimelineDurationPrefixSegment(
    message: string,
    enableDurationPrefixSyntax: boolean,
): TimelineLivePreviewSegment | null {
    if (!enableDurationPrefixSyntax) return null;

    return (
        findTimelineLivePreviewSegments(message, enableDurationPrefixSyntax).find(
            (segment) => segment.kind === "duration-prefix",
        ) ?? null
    );
}

export function getTimelineAtomicPrefixSegment(opts: {
    message: string;
    enableDurationPrefixSyntax: boolean;
    reviewResponsePrefixText?: string | null;
}): TimelineLivePreviewSegment | null {
    return (
        findTimelineLivePreviewSegments(
            opts.message,
            opts.enableDurationPrefixSyntax,
            opts.reviewResponsePrefixText,
        ).find(
            (segment) =>
                segment.kind === "duration-prefix" || segment.kind === "review-response-prefix",
        ) ?? null
    );
}

export function sanitizeTimelineInlineMarkdown(line: string): string {
    if (!line) return "";

    let sanitized = line;

    if (/^\s*\|.*\|\s*$/.test(sanitized)) {
        sanitized = sanitized.replace(/\|/g, "\\|");
    }

    sanitized = sanitized.replace(/^(\s*)(#{1,6}\s+)/, "$1\\$2");
    sanitized = sanitized.replace(/^(\s*)(>\s+)/, "$1\\$2");
    sanitized = sanitized.replace(/^(\s*)([-+*]\s+)/, "$1\\$2");
    sanitized = sanitized.replace(/^(\s*)(\d+[.)]\s+)/, "$1\\$2");
    sanitized = sanitized.replace(/^(\s*)(`{3,}|~{3,})/, "$1\\$2");
    sanitized = sanitized.replace(/^(\s*)(:{3,})/, "$1\\$2");

    return sanitized;
}
