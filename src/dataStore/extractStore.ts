import { TFile, Vault } from "obsidian";
import { WeightedMultiplierAlgorithm } from "src/algorithms/weightedMultiplier";
import { DEFAULT_DECKNAME } from "src/constants";
import { Iadapter } from "src/dataStore/adapter";
import { getStorePath } from "src/dataStore/dataLocation";
import { CardQueue, RepetitionItem, RPITEMTYPE } from "src/dataStore/repetitionItem";
import type { ExtractStorePathConfig } from "src/dataStore/syroWorkspace";
import { renamePathPrefix } from "src/folderTracking";
import type { ReviewResponse } from "src/scheduling";
import type { AutoExtractRule, SRSettings } from "src/settings";
import {
    buildManualIrLocators,
    type ManualIrCache,
    type ManualIrLocator,
} from "src/cache/extractNoteCache";
import { buildAutoExtractSlices, type AutoExtractSlice } from "src/util/autoExtractSlices";
import {
    parseIrExtracts,
    type IrExtractAnchor,
    type IrExtractMatch,
} from "src/util/irExtractParser";
import { cyrb53 } from "src/util/utils";
import { parseJsonUnknown } from "src/util/typeGuards";
import {
    cloneSyncEntities,
    markSyncEntity,
    parseSyncEntities,
    pruneSyncEntities,
    shouldApplySyncEntity,
    type PersistedSyncEntityState,
} from "./syroSyncMeta";
import { mergeEquivalentUuids, normalizeUuidAliases } from "./syroUuidAlias";

export type ExtractStage = "active" | "graduated";
export type ExtractSourceMode = "manual-ir" | "auto-slice";
export type ExtractSliceRule = "manual-ir" | "heading" | "blank-block";

export interface ExtractSourceAnchor extends IrExtractAnchor {
    ordinal: number;
    sourceLength?: number;
}

export interface ExtractItem {
    id: number;
    uuid: string;
    aliases: string[];
    sourcePath: string;
    sourceAnchor: ExtractSourceAnchor;
    rawMarkdown: string;
    memo: string;
    memoEditedAt?: number;
    deckName: string;
    sourceMode: ExtractSourceMode;
    sliceRule: ExtractSliceRule;
    autoSliceKey?: string;
    priority: number;
    nextReview: number;
    timesReviewed: number;
    timesCorrect: number;
    errorStreak: number;
    stage: ExtractStage;
    parentUuid?: string;
    createdAt: number;
    timelineCreatedAt?: number;
    updatedAt: number;
    graduatedAt?: number;
    data: {
        currentInterval: number;
    };
}

interface ExtractStoreFile {
    version: number;
    nextItemId: number;
    items: Record<string, ExtractItem>;
    reviewedCounts?: Record<string, { new: number; due: number }>;
    syncEntities?: Record<string, PersistedSyncEntityState>;
}

export interface ExtractSnapshot {
    item: ExtractItem;
}

export interface ParsedExtractStoreSnapshots {
    extracts: ExtractSnapshot[];
}

export interface ExtractReviewStats {
    newCount: number;
    dueCount: number;
    totalCount: number;
}

export type ExtractDeckNameResolver = (item: ExtractItem) => string;
export type ExtractCandidateFilter = (item: ExtractItem) => boolean;

export interface ExtractSyncResult {
    added: ExtractItem[];
    updated: ExtractItem[];
    graduated: ExtractItem[];
    removed?: ExtractItem[];
    manualIrCache?: ManualIrCache;
}

export interface SyncFileExtractOptions {
    manualIrCache?: ManualIrCache | null;
}

export const EXTRACT_ITEM_ENTITY_TYPE = "extract-item";
const EXTRACT_STORE_VERSION = 1;
const DEFAULT_EXTRACT_PRIORITY = 5;

function compactAutoExtractMarkdown(rawMarkdown: string): string {
    const headingLine = String(rawMarkdown ?? "")
        .split(/\r?\n/g)
        .find((line) => /^#{1,6}\s+/.test(line.trim()));
    if (headingLine) {
        return headingLine.trim();
    }

    return (
        String(rawMarkdown ?? "")
            .split(/\r?\n/g)
            .find((line) => line.trim().length > 0)
            ?.trim() ?? ""
    );
}

function compactSourceAnchor<T extends Partial<ExtractSourceAnchor> | IrExtractAnchor>(
    anchor: T,
): Omit<T, "prefix" | "suffix"> {
    const { prefix: _prefix, suffix: _suffix, ...compactAnchor } = anchor as T & {
        prefix?: unknown;
        suffix?: unknown;
    };
    void _prefix;
    void _suffix;
    return compactAnchor;
}

function createUuid(): string {
    return `ir_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cloneItem(item: ExtractItem): ExtractItem {
    return JSON.parse(JSON.stringify(item)) as ExtractItem;
}

function normalizePriority(priority: number): number {
    if (!Number.isFinite(priority)) {
        return DEFAULT_EXTRACT_PRIORITY;
    }
    return Math.max(1, Math.min(10, Math.round(priority)));
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function getDateKey(): string {
    if (typeof window !== "undefined" && window.moment) {
        return window.moment(new Date()).format("YYYY-MM-DD");
    }
    return new Date().toISOString().slice(0, 10);
}

function toRepetitionItem(item: ExtractItem): RepetitionItem {
    const repetitionItem = new RepetitionItem(
        item.id,
        item.uuid,
        RPITEMTYPE.NOTE,
        item.deckName || DEFAULT_DECKNAME,
        { ...(item.data ?? { currentInterval: 1 }) },
    );
    repetitionItem.uuid = item.uuid;
    repetitionItem.aliases = [...(item.aliases ?? [])];
    repetitionItem.priority = normalizePriority(item.priority);
    repetitionItem.nextReview = item.nextReview ?? 0;
    repetitionItem.timesReviewed = item.timesReviewed ?? 0;
    repetitionItem.timesCorrect = item.timesCorrect ?? 0;
    repetitionItem.errorStreak = item.errorStreak ?? 0;
    repetitionItem.queue =
        repetitionItem.timesReviewed > 0 || repetitionItem.nextReview > 0
            ? CardQueue.Review
            : CardQueue.New;
    return repetitionItem;
}

function applyRepetitionItemState(target: ExtractItem, source: RepetitionItem): void {
    target.nextReview = source.nextReview;
    target.timesReviewed = source.timesReviewed;
    target.timesCorrect = source.timesCorrect;
    target.errorStreak = source.errorStreak;
    target.priority = normalizePriority(source.priority);
    target.data = {
        currentInterval:
            typeof (source.data as { currentInterval?: unknown })?.currentInterval === "number"
                ? ((source.data as { currentInterval: number }).currentInterval)
                : target.data?.currentInterval ?? 1,
    };
    target.updatedAt = Date.now();
}

function getExtractCompletenessScore(item: ExtractItem): number {
    let score = 0;
    if (item.stage === "graduated") score += 32;
    if ((item.memo ?? "").trim().length > 0) score += 16;
    if (item.timesReviewed > 0) score += 8;
    if (item.timesCorrect > 0) score += 4;
    if (item.nextReview > 0) score += 2;
    if (item.priority !== DEFAULT_EXTRACT_PRIORITY) score += 1;
    return score;
}

function chooseCanonicalExtract(left: ExtractItem, right: ExtractItem): ExtractItem {
    const leftScore = getExtractCompletenessScore(left);
    const rightScore = getExtractCompletenessScore(right);
    if (leftScore !== rightScore) {
        return leftScore > rightScore ? left : right;
    }
    if (left.updatedAt !== right.updatedAt) {
        return left.updatedAt > right.updatedAt ? left : right;
    }
    return left.uuid.localeCompare(right.uuid) <= 0 ? left : right;
}

function buildExtractSemanticKey(item: ExtractItem): string {
    const anchor = item.sourceAnchor;
    const anchorKey =
        anchor?.contentHash !== undefined &&
        anchor?.start !== undefined &&
        anchor?.end !== undefined
            ? `${anchor.contentHash}:${anchor.start}:${anchor.end}`
            : "";
    return [
        item.sourceMode,
        item.sliceRule,
        item.autoSliceKey ?? "",
        anchorKey,
        item.rawMarkdown.trim(),
        item.deckName || DEFAULT_DECKNAME,
    ].join("\u0000");
}

function mergeExtractItemState(canonical: ExtractItem, incoming: ExtractItem): ExtractItem {
    const preferred = chooseCanonicalExtract(canonical, incoming);
    const secondary = preferred === canonical ? incoming : canonical;
    const merged = cloneItem(preferred);
    merged.uuid = preferred.uuid;
    merged.aliases = mergeEquivalentUuids(preferred.uuid, preferred.aliases, [
        secondary.uuid,
        ...(secondary.aliases ?? []),
        ...(incoming.aliases ?? []),
        ...(canonical.aliases ?? []),
    ]);
    merged.sourcePath =
        incoming.updatedAt >= canonical.updatedAt ? incoming.sourcePath : canonical.sourcePath;
    merged.sourceAnchor =
        incoming.updatedAt >= canonical.updatedAt ? incoming.sourceAnchor : canonical.sourceAnchor;
    merged.rawMarkdown =
        incoming.rawMarkdown.trim().length > 0 ? incoming.rawMarkdown : canonical.rawMarkdown;
    merged.memo =
        incoming.memo.trim().length > 0 || canonical.memo.trim().length === 0
            ? incoming.memo
            : canonical.memo;
    merged.memoEditedAt =
        (incoming.memoEditedAt ?? 0) >= (canonical.memoEditedAt ?? 0)
            ? incoming.memoEditedAt
            : canonical.memoEditedAt;
    merged.deckName = incoming.deckName || canonical.deckName || DEFAULT_DECKNAME;
    merged.sourceMode = incoming.sourceMode;
    merged.sliceRule = incoming.sliceRule;
    merged.autoSliceKey = incoming.autoSliceKey ?? canonical.autoSliceKey;
    merged.priority =
        incoming.priority !== DEFAULT_EXTRACT_PRIORITY || canonical.priority === DEFAULT_EXTRACT_PRIORITY
            ? incoming.priority
            : canonical.priority;
    if (incoming.timesReviewed >= canonical.timesReviewed) {
        merged.nextReview = incoming.nextReview;
        merged.timesReviewed = incoming.timesReviewed;
        merged.timesCorrect = incoming.timesCorrect;
        merged.errorStreak = incoming.errorStreak;
        merged.data = { ...(incoming.data ?? { currentInterval: 1 }) };
    } else {
        merged.nextReview = canonical.nextReview;
        merged.timesReviewed = canonical.timesReviewed;
        merged.timesCorrect = canonical.timesCorrect;
        merged.errorStreak = canonical.errorStreak;
        merged.data = { ...(canonical.data ?? { currentInterval: 1 }) };
    }
    merged.stage =
        canonical.stage === "graduated" || incoming.stage === "graduated" ? "graduated" : "active";
    merged.parentUuid = incoming.parentUuid ?? canonical.parentUuid;
    merged.createdAt = Math.min(canonical.createdAt, incoming.createdAt);
    merged.timelineCreatedAt = Math.max(
        canonical.timelineCreatedAt ?? 0,
        incoming.timelineCreatedAt ?? 0,
    ) || undefined;
    merged.updatedAt = Math.max(canonical.updatedAt, incoming.updatedAt);
    merged.graduatedAt =
        Math.max(canonical.graduatedAt ?? 0, incoming.graduatedAt ?? 0) || undefined;
    return merged;
}

function getExtractReviewOrderTime(item: ExtractItem): number {
    return item.timesReviewed > 0 && item.nextReview > 0 ? item.nextReview : item.createdAt;
}

function normalizeExtractItem(value: unknown): ExtractItem | null {
    if (!value || typeof value !== "object") {
        return null;
    }
    const raw = value as Partial<ExtractItem>;
    if (!raw.uuid || !raw.sourcePath || !raw.sourceAnchor || raw.rawMarkdown === undefined) {
        return null;
    }
    const now = Date.now();
    const rawSourceAnchor = raw.sourceAnchor;
    const item: ExtractItem = {
        id: typeof raw.id === "number" ? raw.id : 0,
        uuid: raw.uuid,
        aliases: normalizeUuidAliases(raw.uuid, raw.aliases),
        sourcePath: normalizePath(raw.sourcePath),
        sourceAnchor: {
            ...compactSourceAnchor(rawSourceAnchor),
            ordinal: typeof rawSourceAnchor.ordinal === "number" ? rawSourceAnchor.ordinal : 0,
            sourceLength:
                typeof rawSourceAnchor.sourceLength === "number"
                    ? rawSourceAnchor.sourceLength
                    : undefined,
        },
        rawMarkdown:
            raw.sourceMode === "auto-slice"
                ? compactAutoExtractMarkdown(String(raw.rawMarkdown ?? ""))
                : String(raw.rawMarkdown ?? ""),
        memo: String(raw.memo ?? ""),
        memoEditedAt: typeof raw.memoEditedAt === "number" ? raw.memoEditedAt : undefined,
        deckName: raw.deckName || DEFAULT_DECKNAME,
        sourceMode: raw.sourceMode === "auto-slice" ? "auto-slice" : "manual-ir",
        sliceRule:
            raw.sliceRule === "heading" || raw.sliceRule === "blank-block"
                ? raw.sliceRule
                : "manual-ir",
        autoSliceKey:
            typeof raw.autoSliceKey === "string" && raw.autoSliceKey.trim()
                ? raw.autoSliceKey
                : undefined,
        priority: normalizePriority(raw.priority ?? DEFAULT_EXTRACT_PRIORITY),
        nextReview: typeof raw.nextReview === "number" ? raw.nextReview : 0,
        timesReviewed: typeof raw.timesReviewed === "number" ? raw.timesReviewed : 0,
        timesCorrect: typeof raw.timesCorrect === "number" ? raw.timesCorrect : 0,
        errorStreak: typeof raw.errorStreak === "number" ? raw.errorStreak : 0,
        stage: raw.stage === "graduated" ? "graduated" : "active",
        parentUuid: raw.parentUuid || undefined,
        createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
        timelineCreatedAt:
            typeof raw.timelineCreatedAt === "number" ? raw.timelineCreatedAt : undefined,
        updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
        graduatedAt: typeof raw.graduatedAt === "number" ? raw.graduatedAt : undefined,
        data: {
            currentInterval:
                typeof raw.data?.currentInterval === "number" ? raw.data.currentInterval : 1,
        },
    };
    return item;
}

export function parseExtractStoreSnapshots(raw: string): ParsedExtractStoreSnapshots | null {
    const parsed = parseJsonUnknown(raw) as ExtractStoreFile | null;
    if (!parsed || parsed.version !== EXTRACT_STORE_VERSION || typeof parsed.items !== "object") {
        return null;
    }

    return {
        extracts: Object.values(parsed.items)
            .map((entry) => normalizeExtractItem(entry))
            .filter((entry): entry is ExtractItem => entry !== null)
            .map((item) => ({ item })),
    };
}

export class ExtractStore {
    public lastLoadError: string | null = null;
    private dataPath: string;
    private items: Record<string, ExtractItem> = {};
    private nextItemId = 1;
    private reviewedCounts: Record<string, { new: number; due: number }> = {};
    private syncEntities: Record<string, PersistedSyncEntityState> = {};
    private syncReadOnlyReason: string | null = null;

    constructor(_settings: SRSettings, manifestDirOrPaths: string | ExtractStorePathConfig) {
        if (typeof manifestDirOrPaths === "string") {
            const trackedPath = getStorePath(manifestDirOrPaths, _settings);
            const lastSlash = Math.max(trackedPath.lastIndexOf("/"), trackedPath.lastIndexOf("\\"));
            const dir = lastSlash >= 0 ? trackedPath.substring(0, lastSlash + 1) : "./";
            this.dataPath = `${dir}extracts.json`;
        } else {
            this.dataPath = manifestDirOrPaths.extractsPath;
        }
    }

    async load(): Promise<void> {
        this.lastLoadError = null;
        try {
            const adapter = Iadapter.instance.adapter;
            if (!(await adapter.exists(this.dataPath))) {
                this.items = {};
                this.nextItemId = 1;
                this.reviewedCounts = {};
                this.syncEntities = {};
                return;
            }
            const raw = await adapter.read(this.dataPath);
            if (!raw) {
                this.items = {};
                this.nextItemId = 1;
                this.reviewedCounts = {};
                this.syncEntities = {};
                return;
            }

            const parsed = parseJsonUnknown(raw) as ExtractStoreFile | null;
            if (!parsed || parsed.version !== EXTRACT_STORE_VERSION || typeof parsed.items !== "object") {
                this.lastLoadError = "[SR-Extract] Invalid extracts.json schema.";
                this.items = {};
                this.nextItemId = 1;
                this.reviewedCounts = {};
                this.syncEntities = {};
                return;
            }

            this.nextItemId = Math.max(1, parsed.nextItemId ?? 1);
            this.items = {};
            for (const entry of Object.values(parsed.items)) {
                const item = normalizeExtractItem(entry);
                if (!item) continue;
                this.items[item.uuid] = item;
                this.nextItemId = Math.max(this.nextItemId, item.id + 1);
            }
            this.reviewedCounts = parsed.reviewedCounts ?? {};
            this.syncEntities = parseSyncEntities(parsed.syncEntities);
        } catch (error) {
            this.lastLoadError = `[SR-Extract] Failed to load extracts.json: ${String(error)}`;
            console.error("[SR-Extract] Failed to load extract store:", error);
            this.items = {};
            this.nextItemId = 1;
            this.reviewedCounts = {};
            this.syncEntities = {};
        }
    }

    async save(): Promise<void> {
        if (this.syncReadOnlyReason) {
            return;
        }
        const payload: ExtractStoreFile = {
            version: EXTRACT_STORE_VERSION,
            nextItemId: this.nextItemId,
            items: Object.fromEntries(
                Object.entries(this.items).map(([uuid, item]) => [uuid, cloneItem(item)]),
            ),
            reviewedCounts: this.reviewedCounts,
            syncEntities: cloneSyncEntities(this.syncEntities),
        };
        await Iadapter.instance.adapter.write(this.dataPath, JSON.stringify(payload, null, 2));
    }

    setReadOnly(reason: string | null): void {
        this.syncReadOnlyReason = reason;
    }

    list(): ExtractItem[] {
        return Object.values(this.items).map((item) => cloneItem(item));
    }

    get(uuid: string | null | undefined): ExtractItem | null {
        if (!uuid) return null;
        const canonical = this.findCanonicalUuid(uuid);
        return canonical ? this.items[canonical] ?? null : null;
    }

    getSnapshot(uuid: string | null | undefined): ExtractSnapshot | null {
        const item = this.get(uuid);
        return item ? { item: cloneItem(item) } : null;
    }

    getActiveByPath(path: string): ExtractItem[] {
        const normalizedPath = normalizePath(path);
        return Object.values(this.items)
            .filter((item) => item.stage === "active" && item.sourcePath === normalizedPath)
            .sort((left, right) => left.createdAt - right.createdAt)
            .map((item) => cloneItem(item));
    }

    removeBySourcePath(path: string): ExtractSyncResult {
        const sourcePath = normalizePath(path);
        const removed: ExtractItem[] = [];
        for (const item of Object.values(this.items)) {
            if (item.sourcePath !== sourcePath) {
                continue;
            }
            const removedItem = this.removeItemByUuid(item.uuid);
            if (removedItem) {
                removed.push(removedItem);
            }
        }
        return { added: [], updated: [], graduated: [], removed };
    }

    findCanonicalUuid(uuid: string): string | null {
        if (this.items[uuid]) {
            return uuid;
        }
        for (const item of Object.values(this.items)) {
            if (item.aliases?.includes(uuid)) {
                return item.uuid;
            }
        }
        return null;
    }

    getEquivalentUuids(uuid: string): string[] {
        const item = this.get(uuid);
        return item ? [item.uuid, ...(item.aliases ?? [])] : [];
    }

    mergeUuidEquivalence(uuid: string, incomingUuids: readonly string[]): string[] {
        const item = this.get(uuid);
        if (!item) {
            return [];
        }
        item.aliases = mergeEquivalentUuids(item.uuid, item.aliases, incomingUuids);
        return [...item.aliases];
    }

    assignCanonicalUuid(uuid: string, canonicalUuid: string, extraAliases: readonly string[] = []): boolean {
        const currentUuid = this.findCanonicalUuid(uuid);
        if (!currentUuid || !canonicalUuid.trim()) {
            return false;
        }
        const item = this.items[currentUuid];
        const nextAliases = mergeEquivalentUuids(canonicalUuid, item.aliases, [
            item.uuid,
            ...extraAliases,
        ]);
        const changed = item.uuid !== canonicalUuid || JSON.stringify(item.aliases) !== JSON.stringify(nextAliases);
        if (!changed) {
            return false;
        }
        delete this.items[currentUuid];
        item.uuid = canonicalUuid;
        item.aliases = nextAliases;
        item.updatedAt = Date.now();
        this.items[canonicalUuid] = item;
        return true;
    }

    private buildCurrentManualLocatorMap(
        text: string,
        matches: readonly IrExtractMatch[],
    ): Map<number, ManualIrLocator> {
        const uuidByStart = new Map<number, string>(
            matches.map((match) => [match.start, `match:${match.start}`]),
        );
        const cache = buildManualIrLocators(text, matches, uuidByStart);
        const locatorByStart = new Map<number, ManualIrLocator>();
        for (const locator of Object.values(cache.locators)) {
            const start = Number(locator.uuid.slice("match:".length));
            if (Number.isFinite(start)) {
                locatorByStart.set(start, locator);
            }
        }
        return locatorByStart;
    }

    private matchParsedExtract(
        sourcePath: string,
        match: IrExtractMatch,
        usedUuids: Set<string>,
        cachedLocators: ManualIrCache | null | undefined,
        currentLocator: ManualIrLocator | null | undefined,
    ): ExtractItem | null {
        const candidates = Object.values(this.items).filter(
            (item) =>
                item.stage === "active" &&
                item.sourceMode === "manual-ir" &&
                item.sourcePath === sourcePath &&
                !usedUuids.has(item.uuid),
        );
        const cachedLocatorFor = (item: ExtractItem): ManualIrLocator | undefined =>
            cachedLocators?.locators?.[item.uuid];

        return (
            candidates.find(
                (item) =>
                    item.sourceAnchor.start === match.start &&
                    item.sourceAnchor.end === match.end,
            ) ??
            candidates.find((item) => {
                const cached = cachedLocatorFor(item);
                return cached?.outerStart === match.start && cached?.outerEnd === match.end;
            }) ??
            candidates.find((item) => {
                const cached = cachedLocatorFor(item);
                return (
                    !!cached &&
                    !!currentLocator &&
                    cached.startLine === currentLocator.startLine &&
                    cached.lineOrdinal === currentLocator.lineOrdinal &&
                    cached.depth === currentLocator.depth
                );
            }) ??
            candidates.find((item) => {
                const cached = cachedLocatorFor(item);
                return (
                    !!cached &&
                    !!currentLocator &&
                    Math.abs(cached.startLine - currentLocator.startLine) <= 5 &&
                    cached.lineOrdinal === currentLocator.lineOrdinal &&
                    cached.depth === currentLocator.depth
                );
            }) ??
            candidates.find(
                (item) =>
                    item.sourceAnchor.start === match.start &&
                    item.sourceAnchor.end === match.end &&
                    item.sourceAnchor.contentHash === match.anchor.contentHash,
            ) ??
            (candidates.filter((item) => item.rawMarkdown === match.rawMarkdown).length === 1
                ? candidates.find((item) => item.rawMarkdown === match.rawMarkdown) ?? null
                : null)
        );
    }

    private matchAutoExtract(
        sourcePath: string,
        slice: AutoExtractSlice,
        usedUuids: Set<string>,
    ): ExtractItem | null {
        const candidates = Object.values(this.items).filter(
            (item) =>
                item.stage === "active" &&
                item.sourceMode === "auto-slice" &&
                item.sourcePath === sourcePath &&
                !usedUuids.has(item.uuid),
        );

        return (
            candidates.find(
                (item) => item.sliceRule === slice.rule && item.autoSliceKey === slice.key,
            ) ??
            candidates.find(
                (item) =>
                    item.sliceRule === slice.rule &&
                    item.sourceAnchor.contentHash === slice.sourceAnchor.contentHash,
            ) ??
            (candidates.filter(
                (item) => item.sliceRule === slice.rule && item.rawMarkdown === slice.titleMarkdown,
            ).length === 1
                ? candidates.find(
                      (item) =>
                          item.sliceRule === slice.rule && item.rawMarkdown === slice.titleMarkdown,
                  ) ?? null
                : null)
        );
    }

    private hasGraduatedAutoExtract(sourcePath: string, slice: AutoExtractSlice): boolean {
        return Object.values(this.items).some(
            (item) =>
                item.stage === "graduated" &&
                item.sourceMode === "auto-slice" &&
                item.sourcePath === sourcePath &&
                item.sliceRule === slice.rule &&
                item.autoSliceKey === slice.key,
        );
    }

    private removeItemByUuid(uuid: string): ExtractItem | null {
        const canonicalUuid = this.findCanonicalUuid(uuid);
        if (!canonicalUuid || !this.items[canonicalUuid]) {
            return null;
        }
        const removed = cloneItem(this.items[canonicalUuid]);
        delete this.items[canonicalUuid];
        return removed;
    }

    syncFileExtracts(
        path: string,
        text: string,
        deckName: string = DEFAULT_DECKNAME,
        options: SyncFileExtractOptions = {},
    ): ExtractSyncResult {
        const sourcePath = normalizePath(path);
        const matches = parseIrExtracts(text);
        const currentLocators = this.buildCurrentManualLocatorMap(text, matches);
        const usedUuids = new Set<string>();
        const byStart = new Map<number, ExtractItem>();
        const added: ExtractItem[] = [];
        const updated: ExtractItem[] = [];
        const now = Date.now();

        matches.forEach((match, ordinal) => {
            const existing = this.matchParsedExtract(
                sourcePath,
                match,
                usedUuids,
                options.manualIrCache,
                currentLocators.get(match.start),
            );
            const sourceAnchor: ExtractSourceAnchor = {
                ...compactSourceAnchor(match.anchor),
                ordinal,
                sourceLength: text.length,
            };
            if (existing) {
                const nextDeckName = deckName || existing.deckName || DEFAULT_DECKNAME;
                const changed =
                    JSON.stringify(existing.sourceAnchor) !== JSON.stringify(sourceAnchor) ||
                    existing.rawMarkdown !== match.rawMarkdown ||
                    existing.deckName !== nextDeckName ||
                    existing.stage !== "active";
                existing.sourceAnchor = sourceAnchor;
                existing.rawMarkdown = match.rawMarkdown;
                existing.deckName = nextDeckName;
                existing.stage = "active";
                if (changed) {
                    existing.updatedAt = now;
                    updated.push(cloneItem(existing));
                }
                usedUuids.add(existing.uuid);
                byStart.set(match.start, existing);
                return;
            }

            const item: ExtractItem = {
                id: this.nextItemId++,
                uuid: createUuid(),
                aliases: [],
                sourcePath,
                sourceAnchor,
                rawMarkdown: match.rawMarkdown,
                memo: "",
                memoEditedAt: undefined,
                deckName: deckName || DEFAULT_DECKNAME,
                sourceMode: "manual-ir",
                sliceRule: "manual-ir",
                priority: DEFAULT_EXTRACT_PRIORITY,
                nextReview: 0,
                timesReviewed: 0,
                timesCorrect: 0,
                errorStreak: 0,
                stage: "active",
                createdAt: now,
                updatedAt: now,
                data: { currentInterval: 1 },
            };
            this.items[item.uuid] = item;
            usedUuids.add(item.uuid);
            byStart.set(match.start, item);
            added.push(cloneItem(item));
        });

        for (const match of matches) {
            if (match.parentStart === undefined) {
                continue;
            }
            const child = byStart.get(match.start);
            const parent = byStart.get(match.parentStart);
            if (child && parent && child.parentUuid !== parent.uuid) {
                child.parentUuid = parent.uuid;
                child.updatedAt = now;
            }
        }

        const graduated: ExtractItem[] = [];
        for (const item of Object.values(this.items)) {
            if (
                item.stage !== "active" ||
                item.sourceMode !== "manual-ir" ||
                item.sourcePath !== sourcePath ||
                usedUuids.has(item.uuid)
            ) {
                continue;
            }
            item.stage = "graduated";
            item.graduatedAt = now;
            item.updatedAt = now;
            graduated.push(cloneItem(item));
        }

        const uuidByStart = new Map<number, string>(
            Array.from(byStart.entries()).map(([start, item]) => [start, item.uuid]),
        );
        const manualIrCache = buildManualIrLocators(text, matches, uuidByStart);

        return { added, updated, graduated, manualIrCache };
    }

    syncAutoExtractsForFile(
        path: string,
        text: string,
        deckName: string = DEFAULT_DECKNAME,
        rule: AutoExtractRule,
    ): { added: ExtractItem[]; updated: ExtractItem[]; graduated: ExtractItem[]; removed: ExtractItem[] } {
        const sourcePath = normalizePath(path);
        const now = Date.now();
        const slices = buildAutoExtractSlices(text, rule);
        const usedUuids = new Set<string>();
        const added: ExtractItem[] = [];
        const updated: ExtractItem[] = [];
        const removed: ExtractItem[] = [];

        slices.forEach((slice, ordinal) => {
            const existing = this.matchAutoExtract(sourcePath, slice, usedUuids);
            const sourceAnchor: ExtractSourceAnchor = {
                ...compactSourceAnchor(slice.sourceAnchor),
                ordinal,
                sourceLength: text.length,
            };
            const titleMarkdown = slice.titleMarkdown;

            if (existing) {
                const nextDeckName = deckName || existing.deckName || DEFAULT_DECKNAME;
                const changed =
                    JSON.stringify(existing.sourceAnchor) !== JSON.stringify(sourceAnchor) ||
                    existing.rawMarkdown !== titleMarkdown ||
                    existing.deckName !== nextDeckName ||
                    existing.sliceRule !== slice.rule ||
                    existing.autoSliceKey !== slice.key;
                existing.sourceAnchor = sourceAnchor;
                existing.rawMarkdown = titleMarkdown;
                existing.deckName = nextDeckName;
                existing.sourceMode = "auto-slice";
                existing.sliceRule = slice.rule;
                existing.autoSliceKey = slice.key;
                if (changed) {
                    existing.updatedAt = now;
                    updated.push(cloneItem(existing));
                }
                usedUuids.add(existing.uuid);
                return;
            }

            if (this.hasGraduatedAutoExtract(sourcePath, slice)) {
                return;
            }

            const item: ExtractItem = {
                id: this.nextItemId++,
                uuid: createUuid(),
                aliases: [],
                sourcePath,
                sourceAnchor,
                rawMarkdown: titleMarkdown,
                memo: "",
                memoEditedAt: undefined,
                deckName: deckName || DEFAULT_DECKNAME,
                sourceMode: "auto-slice",
                sliceRule: slice.rule,
                autoSliceKey: slice.key,
                priority: DEFAULT_EXTRACT_PRIORITY,
                nextReview: 0,
                timesReviewed: 0,
                timesCorrect: 0,
                errorStreak: 0,
                stage: "active",
                createdAt: now,
                updatedAt: now,
                data: { currentInterval: 1 },
            };
            this.items[item.uuid] = item;
            usedUuids.add(item.uuid);
            added.push(cloneItem(item));
        });

        const graduated: ExtractItem[] = [];
        for (const item of Object.values(this.items)) {
            if (
                item.stage !== "active" ||
                item.sourceMode !== "auto-slice" ||
                item.sourcePath !== sourcePath ||
                usedUuids.has(item.uuid)
            ) {
                continue;
            }
            const removedItem = this.removeItemByUuid(item.uuid);
            if (removedItem) {
                removed.push(removedItem);
            }
        }

        return { added, updated, graduated, removed };
    }

    setMemo(uuid: string, memo: string): ExtractItem | null {
        const item = this.get(uuid);
        if (!item) return null;
        const previousMemo = item.memo.trim();
        const now = Date.now();
        item.memo = memo;
        item.memoEditedAt = now;
        if (
            item.sourceMode === "auto-slice" &&
            !item.timelineCreatedAt &&
            previousMemo.length === 0 &&
            memo.trim().length > 0
        ) {
            item.timelineCreatedAt = now;
        }
        item.updatedAt = now;
        return cloneItem(item);
    }

    setRawMarkdown(uuid: string, rawMarkdown: string): ExtractItem | null {
        const item = this.get(uuid);
        if (!item) return null;
        item.rawMarkdown = rawMarkdown;
        item.sourceAnchor.contentHash = cyrb53(rawMarkdown);
        item.updatedAt = Date.now();
        return cloneItem(item);
    }

    setPriority(uuid: string, priority: number): ExtractItem | null {
        const item = this.get(uuid);
        if (!item) return null;
        item.priority = normalizePriority(priority);
        item.updatedAt = Date.now();
        return cloneItem(item);
    }

    graduate(uuid: string): ExtractItem | null {
        const item = this.get(uuid);
        if (!item) return null;
        item.stage = "graduated";
        item.graduatedAt = Date.now();
        item.updatedAt = item.graduatedAt;
        return cloneItem(item);
    }

    setNextReviewDate(
        uuid: string,
        dueAt: number,
        countDeckName?: string | null,
    ): ExtractItem | null {
        const item = this.get(uuid);
        if (!item || item.stage !== "active" || !Number.isFinite(dueAt)) {
            return null;
        }
        this.countReviewedItem(item, countDeckName);
        item.nextReview = dueAt;
        item.updatedAt = Date.now();
        return cloneItem(item);
    }

    graduateWithReviewCount(uuid: string, countDeckName?: string | null): ExtractItem | null {
        const item = this.get(uuid);
        if (!item) return null;
        if (item.stage === "active") {
            this.countReviewedItem(item, countDeckName);
        }
        item.stage = "graduated";
        item.graduatedAt = Date.now();
        item.updatedAt = item.graduatedAt;
        return cloneItem(item);
    }

    review(
        uuid: string,
        response: ReviewResponse,
        algorithm: WeightedMultiplierAlgorithm,
        countDeckName?: string | null,
    ): ExtractItem | null {
        const item = this.get(uuid);
        if (!item || item.stage !== "active") {
            return null;
        }
        const repetitionItem = toRepetitionItem(item);
        const option = algorithm.srsOptions()[response] ?? algorithm.srsOptions()[2];
        const result = algorithm.onSelection(repetitionItem, option, false);
        repetitionItem.nextReview = Date.now() + result.nextReview;
        repetitionItem.timesReviewed += 1;
        if (result.correct) {
            repetitionItem.timesCorrect += 1;
            repetitionItem.errorStreak = 0;
        } else {
            repetitionItem.errorStreak += 1;
        }
        applyRepetitionItemState(item, repetitionItem);
        this.updateReviewedCounts(item, countDeckName);
        return cloneItem(item);
    }

    getReviewButtonIntervals(
        uuid: string,
        algorithm: WeightedMultiplierAlgorithm,
    ): number[] | null {
        const item = this.get(uuid);
        if (!item || item.stage !== "active") {
            return null;
        }
        return algorithm.calcAllOptsIntervals(toRepetitionItem(item));
    }

    getReviewCandidates(
        deckPath: string | null = null,
        limits?: { maxNew: number; maxDue: number },
        resolveDeckName?: ExtractDeckNameResolver,
        canReviewExtract?: ExtractCandidateFilter,
    ): ExtractItem[] {
        const now = Date.now();
        const targetDeck = deckPath && deckPath !== "root" ? deckPath : null;
        const activeItems = Object.values(this.items).filter((item) => {
            if (item.stage !== "active") return false;
            if (canReviewExtract && !canReviewExtract(item)) return false;
            if (!targetDeck) return true;
            const itemDeckName = resolveDeckName?.(item) ?? item.deckName;
            return itemDeckName === targetDeck || itemDeckName.startsWith(`${targetDeck}/`);
        });
        const countDeckName = targetDeck ?? "root";
        let dueRemaining: number | null = null;
        let newRemaining: number | null = null;
        const takeWithinDailyLimit = (kind: "new" | "due"): boolean => {
            if (!limits) {
                return true;
            }
            const limit = Math.max(0, kind === "new" ? limits.maxNew : limits.maxDue);
            const reviewedCounts = this.getReviewedCounts(countDeckName);
            const initialRemaining =
                kind === "new"
                    ? Math.max(0, limit - reviewedCounts.new)
                    : Math.max(0, limit - reviewedCounts.due);
            const remaining =
                kind === "new"
                    ? (newRemaining ?? initialRemaining)
                    : (dueRemaining ?? initialRemaining);
            if (remaining <= 0) {
                if (kind === "new") {
                    newRemaining = 0;
                } else {
                    dueRemaining = 0;
                }
                return false;
            }
            if (kind === "new") {
                newRemaining = remaining - 1;
            } else {
                dueRemaining = remaining - 1;
            }
            return true;
        };
        const due = activeItems
            .filter((item) => item.timesReviewed > 0 && item.nextReview <= now)
            .sort((left, right) => left.priority - right.priority || left.nextReview - right.nextReview)
            .filter(() => takeWithinDailyLimit("due"))
            .slice(0, Math.max(0, limits?.maxDue ?? Number.POSITIVE_INFINITY));
        const fresh = activeItems
            .filter((item) => item.timesReviewed === 0 || item.nextReview === 0)
            .sort((left, right) => left.priority - right.priority || left.createdAt - right.createdAt)
            .filter(() => takeWithinDailyLimit("new"))
            .slice(0, Math.max(0, limits?.maxNew ?? Number.POSITIVE_INFINITY));
        return [...due, ...fresh]
            .sort(
                (left, right) =>
                    left.priority - right.priority ||
                    getExtractReviewOrderTime(left) - getExtractReviewOrderTime(right),
            )
            .map((item) => cloneItem(item));
    }

    getStats(
        deckPath: string | null = null,
        limits?: { maxNew: number; maxDue: number },
        resolveDeckName?: ExtractDeckNameResolver,
        canReviewExtract?: ExtractCandidateFilter,
    ): ExtractReviewStats {
        const candidates = this.getReviewCandidates(
            deckPath,
            limits,
            resolveDeckName,
            canReviewExtract,
        );
        const newCount = candidates.filter((item) => item.timesReviewed === 0 || item.nextReview === 0).length;
        const dueCount = candidates.length - newCount;
        return {
            newCount,
            dueCount,
            totalCount: candidates.length,
        };
    }

    getReviewedCounts(deckName: string): { new: number; due: number } {
        const date = getDateKey();
        return this.reviewedCounts[`${date}:${deckName || "root"}`] ?? { new: 0, due: 0 };
    }

    undoReviewedQuota(item: ExtractItem, countDeckName?: string | null): void {
        const date = getDateKey();
        const key = `${date}:${countDeckName || item.deckName || "root"}`;
        const counts = this.reviewedCounts[key];
        if (!counts) {
            return;
        }

        if (item.timesReviewed <= 0) {
            counts.new = Math.max(0, counts.new - 1);
        } else {
            counts.due = Math.max(0, counts.due - 1);
        }
    }

    private updateReviewedCounts(item: ExtractItem, countDeckName?: string | null): void {
        const date = getDateKey();
        const key = `${date}:${countDeckName || item.deckName || "root"}`;
        if (!this.reviewedCounts[key]) {
            this.reviewedCounts[key] = { new: 0, due: 0 };
        }
        if (item.timesReviewed <= 1) {
            this.reviewedCounts[key].new++;
        } else {
            this.reviewedCounts[key].due++;
        }
    }

    private countReviewedItem(item: ExtractItem, countDeckName?: string | null): void {
        item.timesReviewed += 1;
        this.updateReviewedCounts(item, countDeckName);
    }

    renamePathPrefix(oldPath: string, newPath: string): ExtractSnapshot[] {
        const snapshots: ExtractSnapshot[] = [];
        for (const item of Object.values(this.items)) {
            const nextPath = renamePathPrefix(item.sourcePath, oldPath, newPath);
            if (nextPath === item.sourcePath) {
                continue;
            }
            item.sourcePath = nextPath;
            item.updatedAt = Date.now();
            snapshots.push({ item: cloneItem(item) });
        }
        return snapshots;
    }

    repairDuplicateExtractsByPathAliases(pathAliasGroups: readonly (readonly string[])[]): ExtractSnapshot[] {
        const snapshots: ExtractSnapshot[] = [];
        for (const rawGroup of pathAliasGroups) {
            const paths = rawGroup
                .map((path) => normalizePath(path))
                .filter((path, index, values) => path.length > 0 && values.indexOf(path) === index);
            if (paths.length < 2) {
                continue;
            }
            const canonicalPath = paths[paths.length - 1];
            const candidates = Object.values(this.items).filter((item) =>
                paths.includes(item.sourcePath),
            );
            const groups = new Map<string, ExtractItem[]>();
            for (const item of candidates) {
                const key = buildExtractSemanticKey(item);
                groups.set(key, [...(groups.get(key) ?? []), item]);
            }
            for (const groupItems of groups.values()) {
                if (groupItems.length < 2) {
                    continue;
                }
                let merged = cloneItem(groupItems[0]);
                for (const item of groupItems.slice(1)) {
                    merged = mergeExtractItemState(merged, item);
                }
                merged.sourcePath = canonicalPath;
                for (const item of groupItems) {
                    delete this.items[item.uuid];
                }
                this.items[merged.uuid] = merged;
                snapshots.push({ item: cloneItem(merged) });
            }
        }
        return snapshots;
    }

    cleanupMissingFiles(vault: Vault): boolean {
        let changed = false;
        for (const item of Object.values(this.items)) {
            const file = vault.getAbstractFileByPath(item.sourcePath);
            if (file instanceof TFile && file.extension === "md") {
                continue;
            }
            if (item.stage === "active") {
                item.stage = "graduated";
                item.graduatedAt = Date.now();
                item.updatedAt = item.graduatedAt;
                changed = true;
            }
        }
        return changed;
    }

    upsertSnapshot(snapshot: ExtractSnapshot): void {
        const incoming = normalizeExtractItem(snapshot.item);
        if (!incoming) {
            return;
        }
        const canonicalUuid = this.findCanonicalUuid(incoming.uuid);
        const existing = canonicalUuid ? this.items[canonicalUuid] : null;
        if (existing) {
            const merged = mergeExtractItemState(existing, incoming);
            delete this.items[existing.uuid];
            delete this.items[incoming.uuid];
            this.items[merged.uuid] = merged;
            this.nextItemId = Math.max(this.nextItemId, merged.id + 1, incoming.id + 1);
            return;
        }
        incoming.aliases = normalizeUuidAliases(incoming.uuid, incoming.aliases);
        this.items[incoming.uuid] = incoming;
        this.nextItemId = Math.max(this.nextItemId, incoming.id + 1);
    }

    graduateByUuid(uuid: string, fallbackSnapshot?: ExtractSnapshot): boolean {
        const canonicalUuid = this.findCanonicalUuid(uuid);
        const fallbackItem = fallbackSnapshot?.item
            ? normalizeExtractItem(fallbackSnapshot.item)
            : null;
        if (canonicalUuid && this.items[canonicalUuid]) {
            const existing = this.items[canonicalUuid];
            const merged = fallbackItem
                ? mergeExtractItemState(existing, { ...fallbackItem, stage: "graduated" })
                : cloneItem(existing);
            merged.uuid = existing.uuid;
            merged.aliases = mergeEquivalentUuids(existing.uuid, existing.aliases, [
                uuid,
                ...(fallbackItem?.aliases ?? []),
                fallbackItem?.uuid ?? "",
            ]);
            merged.stage = "graduated";
            merged.graduatedAt = fallbackItem?.graduatedAt ?? existing.graduatedAt ?? Date.now();
            merged.updatedAt = fallbackItem?.updatedAt ?? merged.graduatedAt;
            delete this.items[canonicalUuid];
            if (fallbackItem) {
                delete this.items[fallbackItem.uuid];
            }
            this.items[merged.uuid] = merged;
            return true;
        }
        if (fallbackItem) {
            const item = fallbackItem;
            item.stage = "graduated";
            item.graduatedAt = item.graduatedAt ?? item.updatedAt ?? Date.now();
            item.updatedAt = item.updatedAt ?? item.graduatedAt;
            this.items[item.uuid] = item;
            this.nextItemId = Math.max(this.nextItemId, item.id + 1);
            return true;
        }
        return false;
    }

    removeByUuid(uuid: string): boolean {
        return this.removeItemByUuid(uuid) !== null;
    }

    getSyncEntities(): Record<string, PersistedSyncEntityState> {
        return cloneSyncEntities(this.syncEntities);
    }

    shouldApplySyncEntity(targetUuid: string, updatedAt: string): boolean {
        return shouldApplySyncEntity(this.syncEntities, targetUuid, updatedAt);
    }

    markSyncEntity(input: {
        targetUuid: string;
        updatedAt: string;
        deleted: boolean;
        entityType: string;
        pathHint?: string;
    }): boolean {
        return markSyncEntity(this.syncEntities, input);
    }

    pruneSyncEntities(retentionMs: number): boolean {
        return pruneSyncEntities(this.syncEntities, retentionMs);
    }
}
