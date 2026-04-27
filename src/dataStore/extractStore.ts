import { TFile, Vault } from "obsidian";
import { WeightedMultiplierAlgorithm } from "src/algorithms/weightedMultiplier";
import { DEFAULT_DECKNAME } from "src/constants";
import { Iadapter } from "src/dataStore/adapter";
import { getStorePath } from "src/dataStore/dataLocation";
import { CardQueue, RepetitionItem, RPITEMTYPE } from "src/dataStore/repetitionItem";
import type { ExtractStorePathConfig } from "src/dataStore/syroWorkspace";
import { renamePathPrefix } from "src/folderTracking";
import type { ReviewResponse } from "src/scheduling";
import type { SRSettings } from "src/settings";
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

export interface ExtractSourceAnchor extends IrExtractAnchor {
    ordinal: number;
}

export interface ExtractItem {
    id: number;
    uuid: string;
    aliases: string[];
    sourcePath: string;
    sourceAnchor: ExtractSourceAnchor;
    rawMarkdown: string;
    memo: string;
    deckName: string;
    priority: number;
    nextReview: number;
    timesReviewed: number;
    timesCorrect: number;
    errorStreak: number;
    stage: ExtractStage;
    parentUuid?: string;
    createdAt: number;
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

export const EXTRACT_ITEM_ENTITY_TYPE = "extract-item";
const EXTRACT_STORE_VERSION = 1;
const DEFAULT_EXTRACT_PRIORITY = 5;

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
            ...rawSourceAnchor,
            ordinal: typeof rawSourceAnchor.ordinal === "number" ? rawSourceAnchor.ordinal : 0,
        },
        rawMarkdown: String(raw.rawMarkdown ?? ""),
        memo: String(raw.memo ?? ""),
        deckName: raw.deckName || DEFAULT_DECKNAME,
        priority: normalizePriority(raw.priority ?? DEFAULT_EXTRACT_PRIORITY),
        nextReview: typeof raw.nextReview === "number" ? raw.nextReview : 0,
        timesReviewed: typeof raw.timesReviewed === "number" ? raw.timesReviewed : 0,
        timesCorrect: typeof raw.timesCorrect === "number" ? raw.timesCorrect : 0,
        errorStreak: typeof raw.errorStreak === "number" ? raw.errorStreak : 0,
        stage: raw.stage === "graduated" ? "graduated" : "active",
        parentUuid: raw.parentUuid || undefined,
        createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
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
        item.updatedAt = Date.now();
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

    private matchParsedExtract(
        sourcePath: string,
        match: IrExtractMatch,
        usedUuids: Set<string>,
    ): ExtractItem | null {
        const candidates = Object.values(this.items).filter(
            (item) => item.stage === "active" && item.sourcePath === sourcePath && !usedUuids.has(item.uuid),
        );

        return (
            candidates.find(
                (item) =>
                    item.sourceAnchor.start === match.start &&
                    item.sourceAnchor.end === match.end &&
                    item.sourceAnchor.contentHash === match.anchor.contentHash,
            ) ??
            candidates.find(
                (item) =>
                    item.rawMarkdown === match.rawMarkdown &&
                    item.sourceAnchor.prefix === match.anchor.prefix &&
                    item.sourceAnchor.suffix === match.anchor.suffix,
            ) ??
            (candidates.filter((item) => item.rawMarkdown === match.rawMarkdown).length === 1
                ? candidates.find((item) => item.rawMarkdown === match.rawMarkdown) ?? null
                : null)
        );
    }

    syncFileExtracts(path: string, text: string, deckName: string = DEFAULT_DECKNAME): { added: ExtractItem[]; updated: ExtractItem[]; graduated: ExtractItem[] } {
        const sourcePath = normalizePath(path);
        const matches = parseIrExtracts(text);
        const usedUuids = new Set<string>();
        const byStart = new Map<number, ExtractItem>();
        const added: ExtractItem[] = [];
        const updated: ExtractItem[] = [];
        const now = Date.now();

        matches.forEach((match, ordinal) => {
            const existing = this.matchParsedExtract(sourcePath, match, usedUuids);
            const sourceAnchor: ExtractSourceAnchor = {
                ...match.anchor,
                ordinal,
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
                deckName: deckName || DEFAULT_DECKNAME,
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
            if (item.stage !== "active" || item.sourcePath !== sourcePath || usedUuids.has(item.uuid)) {
                continue;
            }
            item.stage = "graduated";
            item.graduatedAt = now;
            item.updatedAt = now;
            graduated.push(cloneItem(item));
        }

        return { added, updated, graduated };
    }

    setMemo(uuid: string, memo: string): ExtractItem | null {
        const item = this.get(uuid);
        if (!item) return null;
        item.memo = memo;
        item.updatedAt = Date.now();
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

    getReviewCandidates(deckPath: string | null = null, limits?: { maxNew: number; maxDue: number }): ExtractItem[] {
        const now = Date.now();
        const targetDeck = deckPath && deckPath !== "root" ? deckPath : null;
        const activeItems = Object.values(this.items).filter((item) => {
            if (item.stage !== "active") return false;
            if (!targetDeck) return true;
            return item.deckName === targetDeck || item.deckName.startsWith(`${targetDeck}/`);
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
            .sort((left, right) => left.nextReview - right.nextReview || left.priority - right.priority)
            .filter(() => takeWithinDailyLimit("due"))
            .slice(0, Math.max(0, limits?.maxDue ?? Number.POSITIVE_INFINITY));
        const fresh = activeItems
            .filter((item) => item.timesReviewed === 0 || item.nextReview === 0)
            .sort((left, right) => left.priority - right.priority || left.createdAt - right.createdAt)
            .filter(() => takeWithinDailyLimit("new"))
            .slice(0, Math.max(0, limits?.maxNew ?? Number.POSITIVE_INFINITY));
        return [...due, ...fresh].map((item) => cloneItem(item));
    }

    getStats(
        deckPath: string | null = null,
        limits?: { maxNew: number; maxDue: number },
    ): ExtractReviewStats {
        const candidates = this.getReviewCandidates(deckPath, limits);
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
        if (existing && existing.uuid !== incoming.uuid) {
            incoming.aliases = mergeEquivalentUuids(incoming.uuid, incoming.aliases, [
                existing.uuid,
                ...(existing.aliases ?? []),
            ]);
            delete this.items[existing.uuid];
        }
        incoming.aliases = normalizeUuidAliases(incoming.uuid, [
            ...(incoming.aliases ?? []),
            ...(existing?.aliases ?? []),
        ]);
        this.items[incoming.uuid] = incoming;
        this.nextItemId = Math.max(this.nextItemId, incoming.id + 1);
    }

    graduateByUuid(uuid: string, fallbackSnapshot?: ExtractSnapshot): boolean {
        const canonicalUuid = this.findCanonicalUuid(uuid);
        if (canonicalUuid && this.items[canonicalUuid]) {
            this.items[canonicalUuid].stage = "graduated";
            this.items[canonicalUuid].graduatedAt = Date.now();
            this.items[canonicalUuid].updatedAt = this.items[canonicalUuid].graduatedAt;
            return true;
        }
        if (fallbackSnapshot?.item) {
            const item = normalizeExtractItem(fallbackSnapshot.item);
            if (!item) return false;
            item.stage = "graduated";
            item.graduatedAt = Date.now();
            item.updatedAt = item.graduatedAt;
            this.items[item.uuid] = item;
            return true;
        }
        return false;
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
