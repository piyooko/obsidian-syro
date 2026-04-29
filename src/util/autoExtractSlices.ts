import type { AutoExtractRule } from "src/settings";
import type { IrExtractAnchor } from "src/util/irExtractParser";
import { cyrb53 } from "src/util/utils";

export interface AutoExtractSlice {
    key: string;
    rule: "heading";
    rawMarkdown: string;
    sourceAnchor: IrExtractAnchor;
    headingPath?: string[];
}

interface HeadingToken {
    level: number;
    title: string;
    start: number;
    end: number;
}

const CONTEXT_RADIUS = 80;
const HEADING_RE = /^(#+)[ \t]+(.+?)[ \t#]*$/;

function countLinesBefore(text: string, offset: number): number {
    let line = 0;
    for (let index = 0; index < offset && index < text.length; index++) {
        if (text[index] === "\n") {
            line++;
        }
    }
    return line;
}

function createAutoAnchor(text: string, start: number, end: number): IrExtractAnchor {
    return {
        start,
        end,
        innerStart: start,
        innerEnd: end,
        startLine: countLinesBefore(text, start),
        endLine: countLinesBefore(text, end),
        prefix: text.slice(Math.max(0, start - CONTEXT_RADIUS), start),
        suffix: text.slice(end, Math.min(text.length, end + CONTEXT_RADIUS)),
        contentHash: cyrb53(text.slice(start, end).trim()),
    };
}

function normalizeTitle(title: string): string {
    return title.replace(/\s+/g, " ").trim();
}

function parseHeadings(text: string): HeadingToken[] {
    const headings: HeadingToken[] = [];
    let offset = 0;
    let inFence = false;

    for (const line of text.split(/(\n)/)) {
        if (line === "\n") {
            offset += line.length;
            continue;
        }

        const trimmed = line.trim();
        if (/^(```|~~~)/.test(trimmed)) {
            inFence = !inFence;
        }

        if (!inFence) {
            const match = line.match(HEADING_RE);
            if (match) {
                headings.push({
                    level: match[1].length,
                    title: normalizeTitle(match[2]),
                    start: offset,
                    end: offset + line.length,
                });
            }
        }
        offset += line.length;
    }

    return headings;
}

function getActiveHeadingLevels(rule: AutoExtractRule): Set<number> | null {
    if (rule.allHeadingLevels) {
        return null;
    }
    const levels = Array.isArray(rule.headingLevels)
        ? rule.headingLevels
        : rule.headingLevel !== undefined
          ? [rule.headingLevel]
          : [1];
    return new Set(
        levels
            .map((level) => (Number.isFinite(level) ? Math.round(level) : 0))
            .filter((level) => level >= 1),
    );
}

function buildHeadingSlices(text: string, activeLevels: Set<number> | null): AutoExtractSlice[] {
    const headings = parseHeadings(text);
    const stack: HeadingToken[] = [];
    const duplicateCounts = new Map<string, number>();
    const slices: AutoExtractSlice[] = [];

    headings.forEach((heading, index) => {
        while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
            stack.pop();
        }
        stack.push(heading);

        if (activeLevels && !activeLevels.has(heading.level)) {
            return;
        }

        const nextBoundary = headings
            .slice(index + 1)
            .find((candidate) => candidate.level <= heading.level);
        const end = nextBoundary?.start ?? text.length;
        const rawMarkdown = text.slice(heading.start, end).trim();
        if (!rawMarkdown) {
            return;
        }

        const path = stack.map((entry) => entry.title);
        const duplicateBase = `heading:${heading.level}:${path.join("/")}`;
        const duplicateIndex = duplicateCounts.get(duplicateBase) ?? 0;
        duplicateCounts.set(duplicateBase, duplicateIndex + 1);

        slices.push({
            key: `${duplicateBase}:${duplicateIndex}`,
            rule: "heading",
            rawMarkdown,
            sourceAnchor: createAutoAnchor(text, heading.start, end),
            headingPath: path,
        });
    });

    return slices;
}

export function buildAutoExtractSlices(text: string, rule: AutoExtractRule): AutoExtractSlice[] {
    if (!rule.enabled) {
        return [];
    }
    const activeLevels = getActiveHeadingLevels(rule);
    if (activeLevels && activeLevels.size === 0) {
        return [];
    }
    return buildHeadingSlices(text, activeLevels);
}
