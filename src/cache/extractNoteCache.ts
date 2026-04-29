import type { AutoExtractHeadingLevel, AutoExtractRule } from "src/settings";
import type { IrExtractMatch } from "src/util/irExtractParser";

export interface ManualIrLocator {
    uuid: string;
    startLine: number;
    endLine: number;
    lineOrdinal: number;
    depth: number;
    parentUuid?: string;
    parentLineOrdinal?: number;
    outerStart?: number;
    outerEnd?: number;
    innerStart?: number;
    innerEnd?: number;
}

export interface ManualIrCache {
    locators: Record<string, ManualIrLocator>;
}

export interface AutoHeadingLocator {
    autoSliceKey: string;
    level: AutoExtractHeadingLevel;
    title: string;
    titlePath: string[];
    siblingTitleOrdinal: number;
    startLine: number;
    endLine: number;
    headingLineOrdinal: number;
}

export interface AutoHeadingCache {
    rule: {
        kind: "heading";
        headingLevel?: AutoExtractHeadingLevel;
        headingLevels?: AutoExtractHeadingLevel[];
        allHeadingLevels?: boolean;
    };
    headings: AutoHeadingLocator[];
}

export interface PersistedExtractNoteCache {
    scannedAt: number;
    fileMtime: number;
    fileSize?: number;
    manualIr?: ManualIrCache;
    autoHeadings?: AutoHeadingCache;
}

interface HeadingToken {
    level: AutoExtractHeadingLevel;
    title: string;
    start: number;
    end: number;
    line: number;
}

const HEADING_RE = /^(#+)[ \t]+(.+?)[ \t#]*$/;

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function countLinesBefore(text: string, offset: number): number {
    let line = 0;
    for (let index = 0; index < offset && index < text.length; index++) {
        if (text[index] === "\n") {
            line++;
        }
    }
    return line;
}

function normalizeTitle(title: string): string {
    return title.replace(/\s+/g, " ").trim();
}

function getLineOrdinal(lineOrdinals: Map<number, number>, line: number): number {
    const ordinal = lineOrdinals.get(line) ?? 0;
    lineOrdinals.set(line, ordinal + 1);
    return ordinal;
}

function getDepth(match: IrExtractMatch, byStart: Map<number, IrExtractMatch>): number {
    let depth = 0;
    let parentStart = match.parentStart;
    while (parentStart !== undefined) {
        const parent = byStart.get(parentStart);
        if (!parent) {
            break;
        }
        depth++;
        parentStart = parent.parentStart;
    }
    return depth;
}

export function buildManualIrLocators(
    sourceText: string,
    matches: readonly IrExtractMatch[],
    uuidByStart: ReadonlyMap<number, string>,
): ManualIrCache {
    void sourceText;
    const byStart = new Map(matches.map((match) => [match.start, match]));
    const lineOrdinals = new Map<number, number>();
    const locatorByStart = new Map<number, ManualIrLocator>();
    const locators: Record<string, ManualIrLocator> = {};

    for (const match of matches) {
        const uuid = uuidByStart.get(match.start);
        if (!uuid) {
            continue;
        }
        const startLine = match.anchor.startLine;
        const locator: ManualIrLocator = {
            uuid,
            startLine,
            endLine: match.anchor.endLine,
            lineOrdinal: getLineOrdinal(lineOrdinals, startLine),
            depth: getDepth(match, byStart),
            outerStart: match.start,
            outerEnd: match.end,
            innerStart: match.innerStart,
            innerEnd: match.innerEnd,
        };
        locatorByStart.set(match.start, locator);
        locators[uuid] = locator;
    }

    for (const match of matches) {
        const uuid = uuidByStart.get(match.start);
        const locator = uuid ? locators[uuid] : null;
        const parent = match.parentStart !== undefined ? locatorByStart.get(match.parentStart) : null;
        if (locator && parent) {
            locator.parentUuid = parent.uuid;
            locator.parentLineOrdinal = parent.lineOrdinal;
        }
    }

    return { locators };
}

function parseHeadings(text: string): HeadingToken[] {
    const headings: HeadingToken[] = [];
    const lines = text.split(/(\n)/);
    let offset = 0;
    let lineNumber = 0;
    let inFence = false;

    for (const chunk of lines) {
        if (chunk === "\n") {
            offset += chunk.length;
            lineNumber++;
            continue;
        }

        const trimmed = chunk.trim();
        if (/^(```|~~~)/.test(trimmed)) {
            inFence = !inFence;
        }

        if (!inFence) {
            const match = chunk.match(HEADING_RE);
            if (match) {
                headings.push({
                    level: match[1].length,
                    title: normalizeTitle(match[2]),
                    start: offset,
                    end: offset + chunk.length,
                    line: lineNumber,
                });
            }
        }
        offset += chunk.length;
    }

    return headings;
}

export function buildAutoHeadingLocators(
    sourceText: string,
    rule: AutoExtractRule,
): AutoHeadingCache | null {
    if (!rule.enabled || rule.rule !== "heading") {
        return null;
    }
    const headingLevels = Array.from(
        new Set(
            (rule.headingLevels ?? (rule.headingLevel !== undefined ? [rule.headingLevel] : [1]))
                .map((level) => (Number.isFinite(level) ? Math.round(level) : 0))
                .filter((level) => level >= 1),
        ),
    ).sort((a, b) => a - b);
    if (!rule.allHeadingLevels && headingLevels.length === 0) {
        return null;
    }
    const activeLevels = rule.allHeadingLevels ? null : new Set(headingLevels);
    const headings = parseHeadings(sourceText);
    const stack: HeadingToken[] = [];
    const duplicateCounts = new Map<string, number>();
    const lineOrdinals = new Map<number, number>();
    const locators: AutoHeadingLocator[] = [];

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
        const end = nextBoundary?.start ?? sourceText.length;
        const titlePath = stack.map((entry) => entry.title);
        const duplicateBase = `heading:${heading.level}:${titlePath.join("/")}`;
        const siblingTitleOrdinal = duplicateCounts.get(duplicateBase) ?? 0;
        duplicateCounts.set(duplicateBase, siblingTitleOrdinal + 1);

        locators.push({
            autoSliceKey: `${duplicateBase}:${siblingTitleOrdinal}`,
            level: heading.level,
            title: heading.title,
            titlePath,
            siblingTitleOrdinal,
            startLine: heading.line,
            endLine: countLinesBefore(sourceText, end),
            headingLineOrdinal: getLineOrdinal(lineOrdinals, heading.line),
        });
    });

    return {
        rule: {
            kind: "heading",
            headingLevel: headingLevels[0],
            headingLevels,
            allHeadingLevels: rule.allHeadingLevels === true,
        },
        headings: locators,
    };
}

function normalizeManualIrCache(value: unknown): ManualIrCache | undefined {
    const raw = asRecord(value);
    const rawLocators = asRecord(raw?.locators);
    if (!rawLocators) {
        return undefined;
    }
    const locators: Record<string, ManualIrLocator> = {};
    for (const [uuid, locatorValue] of Object.entries(rawLocators)) {
        const rawLocator = asRecord(locatorValue);
        if (
            !rawLocator ||
            typeof rawLocator.uuid !== "string" ||
            !isFiniteNumber(rawLocator.startLine) ||
            !isFiniteNumber(rawLocator.endLine) ||
            !isFiniteNumber(rawLocator.lineOrdinal) ||
            !isFiniteNumber(rawLocator.depth)
        ) {
            continue;
        }
        locators[uuid] = {
            uuid: rawLocator.uuid,
            startLine: rawLocator.startLine,
            endLine: rawLocator.endLine,
            lineOrdinal: rawLocator.lineOrdinal,
            depth: rawLocator.depth,
            parentUuid: typeof rawLocator.parentUuid === "string" ? rawLocator.parentUuid : undefined,
            parentLineOrdinal: isFiniteNumber(rawLocator.parentLineOrdinal)
                ? rawLocator.parentLineOrdinal
                : undefined,
            outerStart: isFiniteNumber(rawLocator.outerStart) ? rawLocator.outerStart : undefined,
            outerEnd: isFiniteNumber(rawLocator.outerEnd) ? rawLocator.outerEnd : undefined,
            innerStart: isFiniteNumber(rawLocator.innerStart) ? rawLocator.innerStart : undefined,
            innerEnd: isFiniteNumber(rawLocator.innerEnd) ? rawLocator.innerEnd : undefined,
        };
    }
    return { locators };
}

function normalizeAutoHeadingCache(value: unknown): AutoHeadingCache | undefined {
    const raw = asRecord(value);
    const rawRule = asRecord(raw?.rule);
    const rawHeadings = Array.isArray(raw?.headings) ? raw.headings : null;
    const rawHeadingLevels = Array.isArray(rawRule?.headingLevels) ? rawRule.headingLevels : null;
    const headingLevels = rawHeadingLevels
        ? Array.from(
              new Set(
                  rawHeadingLevels
                      .filter(isFiniteNumber)
                      .map((level) => Math.round(level))
                      .filter((level) => level >= 1),
              ),
          ).sort((a, b) => a - b)
        : rawRule?.kind === "heading" && isFiniteNumber(rawRule.headingLevel)
          ? [Math.max(1, Math.round(rawRule.headingLevel))]
          : [];
    const allHeadingLevels = rawRule?.allHeadingLevels === true;
    if ((!allHeadingLevels && headingLevels.length === 0) || !rawHeadings) {
        return undefined;
    }
    const headings: AutoHeadingLocator[] = [];
    for (const headingValue of rawHeadings) {
        const rawHeading = asRecord(headingValue);
        if (
            !rawHeading ||
            typeof rawHeading.autoSliceKey !== "string" ||
            typeof rawHeading.title !== "string" ||
            !Array.isArray(rawHeading.titlePath) ||
            !isFiniteNumber(rawHeading.level) ||
            !isFiniteNumber(rawHeading.siblingTitleOrdinal) ||
            !isFiniteNumber(rawHeading.startLine) ||
            !isFiniteNumber(rawHeading.endLine) ||
            !isFiniteNumber(rawHeading.headingLineOrdinal)
        ) {
            continue;
        }
        headings.push({
            autoSliceKey: rawHeading.autoSliceKey,
            level: Math.max(1, Math.round(rawHeading.level)),
            title: rawHeading.title,
            titlePath: rawHeading.titlePath.filter((part): part is string => typeof part === "string"),
            siblingTitleOrdinal: rawHeading.siblingTitleOrdinal,
            startLine: rawHeading.startLine,
            endLine: rawHeading.endLine,
            headingLineOrdinal: rawHeading.headingLineOrdinal,
        });
    }
    return {
        rule: {
            kind: "heading",
            headingLevel: headingLevels[0],
            headingLevels,
            allHeadingLevels,
        },
        headings,
    };
}

export function normalizePersistedExtractNoteCache(value: unknown): PersistedExtractNoteCache | null {
    const raw = asRecord(value);
    if (!raw || !isFiniteNumber(raw.scannedAt) || !isFiniteNumber(raw.fileMtime)) {
        return null;
    }
    const normalized: PersistedExtractNoteCache = {
        scannedAt: raw.scannedAt,
        fileMtime: raw.fileMtime,
        fileSize: isFiniteNumber(raw.fileSize) ? raw.fileSize : undefined,
    };
    const manualIr = normalizeManualIrCache(raw.manualIr);
    if (manualIr) {
        normalized.manualIr = manualIr;
    }
    const autoHeadings = normalizeAutoHeadingCache(raw.autoHeadings);
    if (autoHeadings) {
        normalized.autoHeadings = autoHeadings;
    }
    return normalized;
}
