import type { DataAdapter } from "obsidian";
import type { DailyDeckStats } from "./syroPluginDataStore";
import { parseDailyState } from "./syroPluginDataStore";
import { getArrayProp, getNumberProp, isRecord, parseJsonUnknown } from "src/util/typeGuards";

export const PENDING_OVERLAY_VERSION = 3;
export const PENDING_CARDS_REVIEW_SECTION_VERSION = 2;
export const PENDING_DAILY_STATE_SECTION_VERSION = 3;

export interface ReviewItemDelta {
    id: number;
    nextReview: number;
    learningStep: number | null;
    queue: number;
    timesReviewed: number;
    timesCorrect: number;
    errorStreak: number;
    data: unknown;
}

export interface PendingReviewItemEntry extends ReviewItemDelta {
    commitId: string;
    sessionCommitted?: boolean;
    sessionOpType?: string;
}

export interface PendingCardsReviewSection {
    version: number;
    baseMtime: number;
    items: PendingReviewItemEntry[];
}

export interface PendingDailyStateSection {
    version: number;
    commitId: string;
    buryDate: string;
    buryList: string[];
    dailyDeckStats: DailyDeckStats;
    deviceReviewCount?: number;
    committedTargetUuids: string[];
}

export interface PendingOverlaySections {
    cardsReview?: PendingCardsReviewSection;
    dailyState?: PendingDailyStateSection;
}

export interface PendingOverlayFile {
    version: number;
    sections: PendingOverlaySections;
}

type PendingOverlaySectionName = keyof PendingOverlaySections;
type PendingOverlaySectionValue = PendingCardsReviewSection | PendingDailyStateSection | null;

interface PendingOverlayStoreOptions {
    adapter: Pick<DataAdapter, "exists" | "read" | "write">;
    path: string;
    shouldLogDebug?: () => boolean;
    logDebug?: (...args: unknown[]) => void;
    logWarn?: (...args: unknown[]) => void;
    notifyWriteFailure?: (() => void) | null;
}

function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function createEmptySections(): PendingOverlaySections {
    return {};
}

export function createEmptyPendingOverlayFile(): PendingOverlayFile {
    return {
        version: PENDING_OVERLAY_VERSION,
        sections: createEmptySections(),
    };
}

export function createPendingCardsReviewSection(
    items: PendingReviewItemEntry[],
    baseMtime: number,
): PendingCardsReviewSection {
    return {
        version: PENDING_CARDS_REVIEW_SECTION_VERSION,
        baseMtime,
        items: cloneJson(items),
    };
}

export function createPendingOverlayCommitId(prefix = "pending"): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `${prefix}:${crypto.randomUUID()}`;
    }

    return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function createLegacyCardCommitId(id: number): string {
    return `legacy-card:${id}`;
}

function createLegacyDailyStateCommitId(input: {
    buryDate: string;
    dailyDeckStats: DailyDeckStats;
}): string {
    const deckCount = Object.keys(input.dailyDeckStats?.counts ?? {}).length;
    const date = input.dailyDeckStats?.date || input.buryDate || "unknown";
    return `legacy-daily:${date}:${deckCount}`;
}

export function createPendingDailyStateSection(input: {
    commitId?: string;
    buryDate: string;
    buryList: string[];
    dailyDeckStats: DailyDeckStats;
    deviceReviewCount?: number;
    committedTargetUuids?: readonly string[];
}): PendingDailyStateSection {
    return {
        version: PENDING_DAILY_STATE_SECTION_VERSION,
        commitId: input.commitId ?? createPendingOverlayCommitId("daily-state"),
        buryDate: input.buryDate,
        buryList: [...input.buryList],
        dailyDeckStats: cloneJson(input.dailyDeckStats),
        deviceReviewCount: input.deviceReviewCount,
        committedTargetUuids: Array.from(
            new Set(
                (input.committedTargetUuids ?? []).filter(
                    (value) => typeof value === "string" && value.trim().length > 0,
                ),
            ),
        ),
    };
}

function parseCardsReviewSection(value: unknown): PendingCardsReviewSection | null {
    if (!isRecord(value)) {
        return null;
    }

    const items = getArrayProp(value, "items");
    if (!items) {
        return null;
    }

    return {
        version: getNumberProp(value, "version") ?? PENDING_CARDS_REVIEW_SECTION_VERSION,
        baseMtime: getNumberProp(value, "baseMtime") ?? 0,
        items: cloneJson(items as Array<ReviewItemDelta & Partial<PendingReviewItemEntry>>).map(
            (item) => ({
                ...item,
                commitId:
                    typeof item.commitId === "string" && item.commitId.length > 0
                        ? item.commitId
                        : createLegacyCardCommitId(item.id),
                sessionCommitted: item.sessionCommitted === true,
                sessionOpType:
                    typeof item.sessionOpType === "string" && item.sessionOpType.length > 0
                        ? item.sessionOpType
                        : "upsert",
            }),
        ),
    };
}

function parseDailyStateSection(value: unknown): PendingDailyStateSection | null {
    if (!isRecord(value)) {
        return null;
    }

    const parsed = parseDailyState({
        version: 1,
        buryDate: value["buryDate"],
        buryList: value["buryList"],
        dailyDeckStats: value["dailyDeckStats"],
        deviceReviewCount: value["deviceReviewCount"],
        appliedOpIds: {},
    });
    if (!parsed) {
        return null;
    }

    return {
        version: getNumberProp(value, "version") ?? PENDING_DAILY_STATE_SECTION_VERSION,
        commitId:
            typeof value["commitId"] === "string" && value["commitId"].length > 0
                ? value["commitId"]
                : createLegacyDailyStateCommitId(parsed),
        buryDate: parsed.buryDate,
        buryList: [...parsed.buryList],
        dailyDeckStats: cloneJson(parsed.dailyDeckStats),
        deviceReviewCount: parsed.deviceReviewCount,
        committedTargetUuids: Array.from(
            new Set(
                getArrayProp(value, "committedTargetUuids")
                    ?.filter(
                        (entry): entry is string => typeof entry === "string" && entry.length > 0,
                    )
                    .map((entry) => entry.trim())
                    .filter((entry) => entry.length > 0) ?? [],
            ),
        ),
    };
}

export function parsePendingOverlayFile(raw: string): PendingOverlayFile | null {
    const parsed = parseJsonUnknown(raw);
    if (!isRecord(parsed)) {
        return null;
    }

    const sectionsValue = parsed["sections"];
    const nextSections: PendingOverlaySections = {};
    if (isRecord(sectionsValue)) {
        const cardsReview = parseCardsReviewSection(sectionsValue["cardsReview"]);
        if (cardsReview) {
            nextSections.cardsReview = cardsReview;
        }

        const dailyState = parseDailyStateSection(sectionsValue["dailyState"]);
        if (dailyState) {
            nextSections.dailyState = dailyState;
        }
    }

    return {
        version: getNumberProp(parsed, "version") ?? PENDING_OVERLAY_VERSION,
        sections: nextSections,
    };
}

export function wrapLegacyCardsReviewOverlay(raw: string): PendingOverlayFile | null {
    const parsed = parseJsonUnknown(raw);
    if (!isRecord(parsed)) {
        return null;
    }

    const items = getArrayProp(parsed, "items");
    if (!items) {
        return null;
    }

    return {
        version: PENDING_OVERLAY_VERSION,
        sections: {
            cardsReview: {
                version: PENDING_CARDS_REVIEW_SECTION_VERSION,
                baseMtime: getNumberProp(parsed, "baseMtime") ?? 0,
                items: cloneJson(items as ReviewItemDelta[]).map((item) => ({
                    ...item,
                    commitId: createLegacyCardCommitId(item.id),
                    sessionCommitted: false,
                    sessionOpType: "upsert",
                })),
            },
        },
    };
}

export class PendingOverlayStore {
    private adapter: Pick<DataAdapter, "exists" | "read" | "write">;
    private path: string;
    private sections: PendingOverlaySections = createEmptySections();
    private loaded = false;
    private disposed = false;
    private loadPromise: Promise<void> | null = null;
    private pendingWriteVersion = 0;
    private persistedWriteVersion = 0;
    private flushPromise: Promise<"success" | "stale" | "failed"> | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private writeFailureNotified = false;
    private pendingPreloadOverrides = new Map<
        PendingOverlaySectionName,
        PendingOverlaySectionValue
    >();
    private shouldLogDebug: () => boolean;
    private logDebugImpl: (...args: unknown[]) => void;
    private logWarnImpl: (...args: unknown[]) => void;
    private notifyWriteFailure: (() => void) | null;

    constructor(options: PendingOverlayStoreOptions) {
        this.adapter = options.adapter;
        this.path = options.path;
        this.shouldLogDebug = options.shouldLogDebug ?? (() => false);
        this.logDebugImpl = options.logDebug ?? (() => undefined);
        this.logWarnImpl = options.logWarn ?? console.warn;
        this.notifyWriteFailure = options.notifyWriteFailure ?? null;
    }

    configure(path: string): void {
        this.path = path;
        this.sections = createEmptySections();
        this.loaded = false;
        this.disposed = false;
        this.loadPromise = null;
        this.pendingWriteVersion = 0;
        this.persistedWriteVersion = 0;
        this.pendingPreloadOverrides.clear();
        this.clearRetryTimer();
        this.flushPromise = null;
        this.writeFailureNotified = false;
    }

    dispose(): void {
        this.disposed = true;
        this.clearRetryTimer();
        this.logDebug("[SR-PendingOverlay] pending-overlay-disposed", {
            path: this.path,
        });
    }

    async refreshFromDisk(): Promise<void> {
        if (this.disposed) {
            return;
        }
        if (this.pendingWriteVersion > this.persistedWriteVersion) {
            return;
        }

        this.loaded = false;
        this.loadPromise = null;
        await this.ensureLoaded();
    }

    private logDebug(...args: unknown[]): void {
        if (this.shouldLogDebug()) {
            this.logDebugImpl(...args);
        }
    }

    private clearRetryTimer(): void {
        if (this.retryTimer !== null) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    private normalizeFileSnapshot(): PendingOverlayFile {
        const sections: PendingOverlaySections = {};
        if (this.sections.cardsReview) {
            sections.cardsReview = cloneJson(this.sections.cardsReview);
        }
        if (this.sections.dailyState) {
            sections.dailyState = cloneJson(this.sections.dailyState);
        }
        return {
            version: PENDING_OVERLAY_VERSION,
            sections,
        };
    }

    async ensureLoaded(): Promise<void> {
        if (this.disposed) {
            return;
        }
        if (this.loaded) {
            return;
        }
        if (this.loadPromise !== null) {
            return this.loadPromise;
        }

        this.loadPromise = (async () => {
            try {
                if (!(await this.adapter.exists(this.path))) {
                    this.sections = createEmptySections();
                    return;
                }

                const raw = await this.adapter.read(this.path);
                const parsed = parsePendingOverlayFile(raw);
                if (!parsed) {
                    this.logWarnImpl("[SR-PendingOverlay] ignored invalid pending overlay file", {
                        path: this.path,
                    });
                    this.sections = createEmptySections();
                    return;
                }

                this.sections = parsed.sections;
                this.persistedWriteVersion = this.pendingWriteVersion;
            } catch (error) {
                this.logWarnImpl("[SR-PendingOverlay] failed to load pending overlay", error);
                this.sections = createEmptySections();
            } finally {
                if (this.pendingPreloadOverrides.size > 0) {
                    for (const [name, value] of this.pendingPreloadOverrides.entries()) {
                        this.applySectionOverride(name, value);
                    }
                    this.pendingPreloadOverrides.clear();
                }
                this.loaded = true;
                this.loadPromise = null;
            }
        })();

        return this.loadPromise;
    }

    private applySectionOverride(
        name: PendingOverlaySectionName,
        value: PendingOverlaySectionValue,
    ): void {
        if (value == null) {
            delete this.sections[name];
            return;
        }

        if (name === "cardsReview") {
            this.sections.cardsReview = cloneJson(value as PendingCardsReviewSection);
            return;
        }

        if (name === "dailyState") {
            this.sections.dailyState = cloneJson(value as PendingDailyStateSection);
        }
    }

    private stageSection(name: PendingOverlaySectionName, value: PendingOverlaySectionValue): void {
        if (!this.loaded) {
            this.pendingPreloadOverrides.set(name, value);
        } else {
            this.applySectionOverride(name, value);
        }

        this.pendingWriteVersion += 1;
    }

    stageCardsReviewSection(section: PendingCardsReviewSection | null): void {
        this.stageSection("cardsReview", section);
        this.logDebug("[SR-PendingOverlay] section-staged", {
            section: "cardsReview",
            hasData: !!section && section.items.length > 0,
            path: this.path,
        });
    }

    stageDailyStateSection(section: PendingDailyStateSection | null): void {
        this.stageSection("dailyState", section);
        this.logDebug("[SR-PendingOverlay] section-staged", {
            section: "dailyState",
            hasData: !!section,
            path: this.path,
        });
    }

    clearCardsReviewSection(): void {
        this.stageCardsReviewSection(null);
        this.logDebug("[SR-PendingOverlay] section-cleared", {
            section: "cardsReview",
            path: this.path,
        });
    }

    clearDailyStateSection(): void {
        this.stageDailyStateSection(null);
        this.logDebug("[SR-PendingOverlay] section-cleared", {
            section: "dailyState",
            path: this.path,
        });
    }

    async getCardsReviewSection(): Promise<PendingCardsReviewSection | null> {
        await this.ensureLoaded();
        return this.sections.cardsReview ? cloneJson(this.sections.cardsReview) : null;
    }

    async getDailyStateSection(): Promise<PendingDailyStateSection | null> {
        await this.ensureLoaded();
        return this.sections.dailyState ? cloneJson(this.sections.dailyState) : null;
    }

    async hasSection(name: PendingOverlaySectionName): Promise<boolean> {
        await this.ensureLoaded();
        return !!this.sections[name];
    }

    private async writeSnapshotToDisk(): Promise<void> {
        if (this.disposed) {
            return;
        }
        await this.ensureLoaded();
        await this.adapter.write(this.path, JSON.stringify(this.normalizeFileSnapshot()));
    }

    private async flushOnce(): Promise<"success" | "stale" | "failed"> {
        const versionToPersist = this.pendingWriteVersion;
        try {
            await this.writeSnapshotToDisk();
            this.persistedWriteVersion = versionToPersist;
            this.writeFailureNotified = false;
            this.logDebug("[SR-PendingOverlay] section-written", {
                path: this.path,
                sections: Object.keys(this.normalizeFileSnapshot().sections),
            });
            return versionToPersist === this.pendingWriteVersion ? "success" : "stale";
        } catch (error) {
            this.logWarnImpl("[SR-PendingOverlay] failed to write pending overlay", error);
            return "failed";
        }
    }

    requestFlush(attempt = 0): void {
        if (this.disposed) {
            return;
        }
        if (this.flushPromise !== null) {
            return;
        }

        this.clearRetryTimer();
        this.flushPromise = (async () => {
            const outcome = await this.flushOnce();
            this.flushPromise = null;

            if (this.disposed) {
                return outcome;
            }

            if (outcome === "success") {
                return outcome;
            }

            if (this.pendingWriteVersion <= this.persistedWriteVersion) {
                return "success";
            }

            if (outcome === "stale") {
                this.requestFlush(0);
                return outcome;
            }

            if (
                attempt >= 2 &&
                !this.writeFailureNotified &&
                this.pendingWriteVersion > this.persistedWriteVersion
            ) {
                this.writeFailureNotified = true;
                this.notifyWriteFailure?.();
            }

            const retryDelays = [200, 1000, 3000];
            const delayMs = retryDelays[Math.min(attempt, retryDelays.length - 1)];
            this.retryTimer = setTimeout(() => {
                this.retryTimer = null;
                this.requestFlush(attempt + 1);
            }, delayMs);
            return outcome;
        })();
    }

    async drainFlush(timeoutMs = 1500): Promise<boolean> {
        if (this.disposed) {
            return false;
        }
        this.clearRetryTimer();
        this.requestFlush(0);

        const waitForFlush = async (): Promise<boolean> => {
            for (
                let activeFlush = this.flushPromise;
                activeFlush !== null;
                activeFlush = this.flushPromise
            ) {
                await activeFlush;
            }
            return this.pendingWriteVersion <= this.persistedWriteVersion;
        };

        const result = await Promise.race([
            waitForFlush(),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
        ]);

        if (!this.disposed && !result && this.retryTimer === null) {
            this.requestFlush(0);
        }

        return result;
    }
}
