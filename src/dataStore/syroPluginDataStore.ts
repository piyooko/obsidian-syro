import type { DataAdapter } from "obsidian";
import { Iadapter } from "./adapter";
import { cloneFolderTrackingRule, type FolderTrackingRule } from "src/folderTracking";
import { parseTimestampMap } from "./syroSyncMeta";
import {
    DEFAULT_SETTINGS,
    normalizeLicenseState,
    type LicenseState,
    type SRSettings,
} from "src/settings";
import { getNumberProp, getStringProp, isRecord, parseJsonUnknown } from "src/util/typeGuards";

const SYRO_SHARED_SETTINGS_VERSION = 1;
const SYRO_TRACKING_RULES_VERSION = 1;
const SYRO_DAILY_STATE_VERSION = 1;
const SYRO_DEVICE_STATE_VERSION = 1;
const SYRO_LICENSE_STATE_VERSION = 1;

export interface DailyDeckStats {
    date: string;
    counts: Record<string, { new: number; review: number }>;
}

export interface PersistedSharedSettingsState {
    version: number;
    settings: Partial<SRSettings> & Record<string, unknown>;
    updatedAtByField: Record<string, string>;
}

export interface PersistedTrackingRulesTombstone {
    updatedAt: string;
}

export interface PersistedTrackingRuleEntry {
    rule: FolderTrackingRule;
    updatedAt: string;
}

export interface PersistedTrackingRulesState {
    version: number;
    rules: Record<string, PersistedTrackingRuleEntry>;
    tombstones: Record<string, PersistedTrackingRulesTombstone>;
}

export interface PersistedDailyState {
    version: number;
    buryDate: string;
    buryList: string[];
    dailyDeckStats: DailyDeckStats;
    deviceReviewCount?: number;
    appliedOpIds: Record<string, string>;
}

export interface PersistedDeviceState {
    version: number;
    settings: Partial<SRSettings> & Record<string, unknown>;
    historyDeck: string | null;
    deckOptionsProtocolVersion: number;
}

export interface PersistedLicenseState {
    version: number;
    licenseKey: string;
    isPro: boolean;
    licenseInstallationId: string;
    licenseState: LicenseState | null;
}

export interface LegacyPluginData {
    settings?: Partial<SRSettings> & Record<string, unknown>;
    buryDate?: string;
    buryList?: string[];
    historyDeck?: string | null;
    dailyDeckStats?: DailyDeckStats;
    folderTrackingRules?: Record<string, FolderTrackingRule>;
    schemaVersion?: string;
    migrations?: Record<string, unknown>;
}

export interface LegacyPluginDataShell {
    version: number;
    schemaVersion: string;
    migrations: {
        syro012: {
            completedAt: string;
            sourceVersion: string;
        };
    };
}

export type SharedSettingsField = (typeof SHARED_SETTINGS_FIELDS)[number];
export type DeviceStateField = (typeof DEVICE_STATE_FIELDS)[number];

export interface SharedSettingsDiff {
    changed: Record<string, unknown>;
}

export interface TrackingRulesDiff {
    upserts: Array<{
        folderPath: string;
        rule: FolderTrackingRule;
        updatedAt?: string;
    }>;
    removals: Array<{
        folderPath: string;
        updatedAt: string;
    }>;
}

export type DailyStateDiffOperation =
    | {
          opType: "rollover-reset";
          date: string;
      }
    | {
          opType: "bury-add";
          date: string;
          entries: string[];
      }
    | {
          opType: "bury-clear";
          date: string;
          buryList: string[];
      }
    | {
          opType: "deck-stats-delta";
          date: string;
          deckName: string;
          newDelta: number;
          reviewDelta: number;
      };

// Only cross-device behavior belongs here. Device-local UI/runtime state is kept in
// DEVICE_STATE_FIELDS so it never leaks into shared-settings session patches.
export const SHARED_SETTINGS_FIELDS = [
    "flashcardResponseTexts",
    "flashcardTags",
    "convertFoldersToDecks",
    "burySiblingCards",
    "burySiblingCardsByNoteReview",
    "multiClozeCard",
    "cardBlockID",
    "randomizeCardOrder",
    "flashcardCardOrder",
    "flashcardDeckOrder",
    "convertHighlightsToClozes",
    "convertBoldTextToClozes",
    "convertCurlyBracketsToClozes",
    "convertAnkiClozesToClozes",
    "clozePatterns",
    "singleLineCardSeparator",
    "singleLineReversedCardSeparator",
    "multilineCardSeparator",
    "multilineReversedCardSeparator",
    "multilineCardEndMarker",
    "parseClozesInCodeBlocks",
    "enableLatexPopover",
    "codeContextLines",
    "clozeContextMode",
    "clozeContextPerformanceMode",
    "clozeContextSoftLimitLines",
    "showOtherClozesVisual",
    "showOtherAnkiClozeVisual",
    "showOtherHighlightClozeVisual",
    "showOtherBoldClozeVisual",
    "editLaterTag",
    "intervalShowHide",
    "tagsToReview",
    "noteFoldersToIgnore",
    "tagsToIgnore",
    "openRandomNote",
    "autoNextNote",
    "mixDue",
    "mixNew",
    "mixCardNote",
    "mixCard",
    "mixNote",
    "reviewResponseFloatBar",
    "responseBarPositionPercentage",
    "reviewingNoteDirectly",
    "disableFileMenuReviewOptions",
    "maxNDaysNotesReviewQueue",
    "weightedMultiplierSettings",
    "noteResponseTexts",
    "loadBalance",
    "maxLinkFactor",
    "dataStore",
    "cardCommentOnSameLine",
    "dataLocation",
    "customFolder",
    "maxNewPerDay",
    "repeatItems",
    "trackedNoteToDecks",
    "untrackWithReviewTag",
    "progressBarStyle",
    "rolloverHour",
    "learnAheadMinutes",
    "showContextInCards",
    "showIntervalInReviewButtons",
    "flashcardEasyText",
    "flashcardGoodText",
    "flashcardHardText",
    "reviewButtonDelay",
    "sidebarIgnoredTags",
    "sidebarTagSortMode",
    "sidebarCustomTagOrder",
    "hideNoteReviewSidebarFilters",
    "showSidebarProgressIndicator",
    "sidebarProgressRingColor",
    "sidebarProgressIndicatorMode",
    "sidebarProgressRingDirection",
    "sidebarFilePathTooltipEnabled",
    "sidebarFilePathTooltipDelayMs",
    "noteStatusBarColor",
    "noteStatusBarAnimation",
    "noteStatusBarPeriod",
    "flashcardStatusBarColor",
    "flashcardStatusBarAnimation",
    "flashcardStatusBarPeriod",
    "showStatusBarDueNotification",
    "showScrollPercentage",
    "autoExpandTimeline",
    "timelineAllowUntrackedNotes",
    "timelineAutoFollowReviewCards",
    "timelineAutoCommitReviewSelection",
    "timelineEnableDurationPrefixSyntax",
] as const satisfies readonly (keyof SRSettings)[];

// Device state is persisted locally per device and must never be emitted through
// shared-settings session diffs.
export const DEVICE_STATE_FIELDS = [
    "enableNoteCachePersistence",
    "autoIncrementalSync",
    "syncProgressDisplayMode",
    "enableNoteReviewPaneOnStartup",
    "showRibbonIcon",
    "showStatusBar",
    "collapsedDeckPaths",
    "deckCollapseState",
    "flashcardHeightPercentage",
    "flashcardWidthPercentage",
    "reactFlashcardWidth",
    "reactFlashcardHeight",
    "reactDeckTreeWidth",
    "enableVolumeKeyControl",
    "volumeUpMapping",
    "volumeDownMapping",
    "showSchedulingDebugMessages",
    "showParserDebugMessages",
    "showRuntimeDebugMessages",
    "sidebarFilterBarHeight",
    "sidebarTimelineHeight",
    "sidebarTimelineOpen",
    "sidebarTimelineSelectedPath",
    "previousRelease",
] as const satisfies readonly (keyof SRSettings)[];

export function normalizeDeviceReviewCount(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.trunc(value));
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function dirname(path: string): string {
    const normalized = normalizePath(path).replace(/\/+$/g, "");
    const slashIndex = normalized.lastIndexOf("/");
    return slashIndex >= 0 ? normalized.substring(0, slashIndex) : "";
}

async function ensureDirectory(path: string): Promise<void> {
    const adapter = Iadapter.instance.adapter as DataAdapter & {
        mkdir?: (path: string) => Promise<void>;
    };
    if (typeof adapter.mkdir !== "function") {
        return;
    }
    const parts = normalizePath(path)
        .split("/")
        .filter((part) => part.length > 0);
    let current = "";
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (!(await adapter.exists(current))) {
            await adapter.mkdir(current);
        }
    }
}

function cloneUnknown<T>(value: T): T {
    if (value === undefined || value === null) {
        return value;
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

function deepEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function sanitizeStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : [];
}

function parseDailyDeckStats(value: unknown): DailyDeckStats {
    const fallback: DailyDeckStats = {
        date: "",
        counts: {},
    };
    if (!isRecord(value)) {
        return fallback;
    }

    const date = getStringProp(value, "date")?.trim() ?? "";
    const countsValue = value["counts"];
    if (!isRecord(countsValue)) {
        return {
            date,
            counts: {},
        };
    }

    const counts: Record<string, { new: number; review: number }> = {};
    for (const [deckName, entry] of Object.entries(countsValue)) {
        if (!isRecord(entry)) {
            continue;
        }
        counts[deckName] = {
            new: Math.max(0, getNumberProp(entry, "new") ?? 0),
            review: Math.max(0, getNumberProp(entry, "review") ?? 0),
        };
    }
    return {
        date,
        counts,
    };
}

function parseTrackingRuleTombstones(
    value: unknown,
): Record<string, PersistedTrackingRulesTombstone> {
    if (!isRecord(value)) {
        return {};
    }

    const tombstones: Record<string, PersistedTrackingRulesTombstone> = {};
    for (const [folderPath, entry] of Object.entries(value)) {
        if (!isRecord(entry)) {
            continue;
        }

        const updatedAt = getStringProp(entry, "updatedAt")?.trim();
        if (!updatedAt) {
            continue;
        }

        tombstones[folderPath] = {
            updatedAt,
        };
    }
    return tombstones;
}

function parseTrackingRuleEntries(value: unknown): Record<string, PersistedTrackingRuleEntry> {
    if (!isRecord(value)) {
        return {};
    }

    const rules: Record<string, PersistedTrackingRuleEntry> = {};
    for (const [folderPath, entry] of Object.entries(value)) {
        if (!isRecord(entry)) {
            continue;
        }

        const updatedAt = getStringProp(entry, "updatedAt")?.trim() ?? "1970-01-01T00:00:00.000Z";
        if (isRecord(entry["rule"])) {
            rules[folderPath] = {
                rule: cloneFolderTrackingRule(entry["rule"]),
                updatedAt,
            };
            continue;
        }

        rules[folderPath] = {
            rule: cloneFolderTrackingRule(entry),
            updatedAt,
        };
    }

    return rules;
}

function pickSettingsFields<T extends readonly (keyof SRSettings)[]>(
    settings: SRSettings,
    fields: T,
): Partial<SRSettings> & Record<string, unknown> {
    const picked: Partial<SRSettings> & Record<string, unknown> = {};
    const mutablePicked = picked as Record<string, unknown>;
    for (const field of fields) {
        mutablePicked[field] = cloneUnknown(settings[field]);
    }
    return picked;
}

function applySettingsFields(
    settings: SRSettings,
    fields: readonly (keyof SRSettings)[],
    source: Partial<SRSettings> & Record<string, unknown>,
): void {
    for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(source, field)) {
            settings[field] = cloneUnknown(source[field]) as never;
        }
    }
}

function parseSettingsSubset(
    value: unknown,
    version: number,
    fields: readonly (keyof SRSettings)[],
): (Partial<SRSettings> & Record<string, unknown>) | null {
    if (
        !isRecord(value) ||
        getNumberProp(value, "version") !== version ||
        !isRecord(value["settings"])
    ) {
        return null;
    }

    const settings = value["settings"] as Record<string, unknown>;
    const picked: Partial<SRSettings> & Record<string, unknown> = {};
    const mutablePicked = picked as Record<string, unknown>;
    for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(settings, field)) {
            mutablePicked[field] = cloneUnknown(settings[field]);
        }
    }
    return picked;
}

export function extractSharedSettings(settings: SRSettings): PersistedSharedSettingsState {
    return {
        version: SYRO_SHARED_SETTINGS_VERSION,
        settings: pickSettingsFields(settings, SHARED_SETTINGS_FIELDS),
        updatedAtByField: {},
    };
}

export function extractSharedSettingsWithMetadata(
    settings: SRSettings,
    updatedAtByField: Record<string, string>,
): PersistedSharedSettingsState {
    return {
        version: SYRO_SHARED_SETTINGS_VERSION,
        settings: pickSettingsFields(settings, SHARED_SETTINGS_FIELDS),
        updatedAtByField: parseTimestampMap(updatedAtByField),
    };
}

export function applySharedSettings(
    settings: SRSettings,
    persisted: PersistedSharedSettingsState,
): void {
    applySettingsFields(settings, SHARED_SETTINGS_FIELDS, persisted.settings);
}

export function createDefaultSharedSettingsState(): PersistedSharedSettingsState {
    return extractSharedSettings(cloneUnknown(DEFAULT_SETTINGS));
}

export function parseSharedSettingsState(value: unknown): PersistedSharedSettingsState | null {
    const settings = parseSettingsSubset(
        value,
        SYRO_SHARED_SETTINGS_VERSION,
        SHARED_SETTINGS_FIELDS,
    );
    if (!settings || !isRecord(value)) {
        return null;
    }

    return {
        version: SYRO_SHARED_SETTINGS_VERSION,
        settings,
        updatedAtByField: parseTimestampMap(value["updatedAtByField"]),
    };
}

export function diffSharedSettings(
    previous: PersistedSharedSettingsState,
    next: PersistedSharedSettingsState,
): SharedSettingsDiff {
    const changed: Record<string, unknown> = {};
    for (const field of SHARED_SETTINGS_FIELDS) {
        if (!deepEqual(previous.settings[field], next.settings[field])) {
            changed[field] = cloneUnknown(next.settings[field]);
        }
    }
    return { changed };
}

export function extractTrackingRules(
    rules: Record<string, FolderTrackingRule>,
    updatedAtByFolderPath: Record<string, string> = {},
    tombstones: Record<string, PersistedTrackingRulesTombstone> = {},
): PersistedTrackingRulesState {
    // Folder tracking intentionally uses folderPath as its natural sync key.
    // This domain should not be rewritten through file UUID identity.
    return {
        version: SYRO_TRACKING_RULES_VERSION,
        rules: Object.fromEntries(
            Object.entries(rules).map(([folderPath, rule]) => [
                folderPath,
                {
                    rule: cloneFolderTrackingRule(rule),
                    updatedAt:
                        updatedAtByFolderPath[folderPath] ??
                        tombstones[folderPath]?.updatedAt ??
                        "1970-01-01T00:00:00.000Z",
                },
            ]),
        ),
        tombstones: cloneUnknown(tombstones),
    };
}

export function createDefaultTrackingRulesState(): PersistedTrackingRulesState {
    return {
        version: SYRO_TRACKING_RULES_VERSION,
        rules: {},
        tombstones: {},
    };
}

export function parseTrackingRulesState(value: unknown): PersistedTrackingRulesState | null {
    if (
        !isRecord(value) ||
        getNumberProp(value, "version") !== SYRO_TRACKING_RULES_VERSION ||
        !isRecord(value["rules"])
    ) {
        return null;
    }

    return {
        version: SYRO_TRACKING_RULES_VERSION,
        rules: parseTrackingRuleEntries(value["rules"]),
        tombstones: parseTrackingRuleTombstones(value["tombstones"]),
    };
}

export function applyTrackingRules(
    target: Record<string, FolderTrackingRule>,
    persisted: PersistedTrackingRulesState,
): void {
    const nextRules = Object.fromEntries(
        Object.entries(persisted.rules).map(([folderPath, entry]) => [
            folderPath,
            cloneFolderTrackingRule(entry.rule),
        ]),
    );
    for (const key of Object.keys(target)) {
        delete target[key];
    }
    Object.assign(target, nextRules);
}

export function diffTrackingRules(
    previous: PersistedTrackingRulesState,
    next: PersistedTrackingRulesState,
): TrackingRulesDiff {
    const upserts: TrackingRulesDiff["upserts"] = [];
    const removals: TrackingRulesDiff["removals"] = [];
    const previousKeys = new Set(Object.keys(previous.rules));
    const nextKeys = new Set(Object.keys(next.rules));

    for (const folderPath of nextKeys) {
        if (
            !previousKeys.has(folderPath) ||
            !deepEqual(previous.rules[folderPath]?.rule, next.rules[folderPath]?.rule)
        ) {
            upserts.push({
                folderPath,
                rule: cloneFolderTrackingRule(next.rules[folderPath].rule),
                updatedAt: next.rules[folderPath].updatedAt,
            });
        }
    }

    for (const folderPath of previousKeys) {
        if (!nextKeys.has(folderPath)) {
            removals.push({
                folderPath,
                updatedAt: next.tombstones[folderPath]?.updatedAt ?? new Date().toISOString(),
            });
        }
    }

    return {
        upserts,
        removals,
    };
}

export function extractDailyState(input: {
    buryDate: string;
    buryList: string[];
    dailyDeckStats: DailyDeckStats;
    deviceReviewCount?: number;
}): PersistedDailyState {
    // Daily state is synchronized as per-op deltas/tombstones, not as UUID-keyed entities.
    return {
        version: SYRO_DAILY_STATE_VERSION,
        buryDate: input.buryDate ?? "",
        buryList: sanitizeStringArray(input.buryList),
        dailyDeckStats: cloneUnknown(parseDailyDeckStats(input.dailyDeckStats)),
        deviceReviewCount: normalizeDeviceReviewCount(input.deviceReviewCount),
        appliedOpIds: {},
    };
}

export function extractDailyStateWithMetadata(
    input: {
        buryDate: string;
        buryList: string[];
        dailyDeckStats: DailyDeckStats;
        deviceReviewCount?: number;
    },
    appliedOpIds: Record<string, string>,
): PersistedDailyState {
    return {
        version: SYRO_DAILY_STATE_VERSION,
        buryDate: input.buryDate ?? "",
        buryList: sanitizeStringArray(input.buryList),
        dailyDeckStats: cloneUnknown(parseDailyDeckStats(input.dailyDeckStats)),
        deviceReviewCount: normalizeDeviceReviewCount(input.deviceReviewCount),
        appliedOpIds: parseTimestampMap(appliedOpIds),
    };
}

export function createDefaultDailyState(): PersistedDailyState {
    return {
        version: SYRO_DAILY_STATE_VERSION,
        buryDate: "",
        buryList: [],
        dailyDeckStats: {
            date: "",
            counts: {},
        },
        deviceReviewCount: 0,
        appliedOpIds: {},
    };
}

export function parseDailyState(value: unknown): PersistedDailyState | null {
    if (!isRecord(value) || getNumberProp(value, "version") !== SYRO_DAILY_STATE_VERSION) {
        return null;
    }

    return {
        version: SYRO_DAILY_STATE_VERSION,
        buryDate: getStringProp(value, "buryDate")?.trim() ?? "",
        buryList: sanitizeStringArray(value["buryList"]),
        dailyDeckStats: parseDailyDeckStats(value["dailyDeckStats"]),
        deviceReviewCount: normalizeDeviceReviewCount(value["deviceReviewCount"]),
        appliedOpIds: parseTimestampMap(value["appliedOpIds"]),
    };
}

export function applyDailyState(
    target: {
        buryDate: string;
        buryList: string[];
        dailyDeckStats: DailyDeckStats;
    },
    persisted: PersistedDailyState,
): void {
    target.buryDate = persisted.buryDate;
    target.buryList = [...persisted.buryList];
    target.dailyDeckStats = cloneUnknown(persisted.dailyDeckStats);
}

export function diffDailyState(
    previous: PersistedDailyState,
    next: PersistedDailyState,
): DailyStateDiffOperation[] {
    const operations: DailyStateDiffOperation[] = [];

    if (
        previous.buryDate !== next.buryDate ||
        previous.dailyDeckStats.date !== next.dailyDeckStats.date
    ) {
        const rolloverDate = next.dailyDeckStats.date || next.buryDate;
        if (rolloverDate) {
            operations.push({
                opType: "rollover-reset",
                date: rolloverDate,
            });
        }
    }

    const sameDay =
        previous.buryDate === next.buryDate &&
        previous.dailyDeckStats.date === next.dailyDeckStats.date;
    const previousBurySet = new Set(previous.buryList);
    const nextBurySet = new Set(next.buryList);
    const addedBuryEntries = next.buryList.filter((entry) => !previousBurySet.has(entry));

    if (sameDay) {
        if (
            next.buryList.length < previous.buryList.length ||
            previous.buryList.some((entry) => !nextBurySet.has(entry))
        ) {
            operations.push({
                opType: "bury-clear",
                date: next.buryDate,
                buryList: [...next.buryList],
            });
        } else if (addedBuryEntries.length > 0) {
            operations.push({
                opType: "bury-add",
                date: next.buryDate,
                entries: addedBuryEntries,
            });
        }
    } else if (next.buryList.length > 0) {
        operations.push({
            opType: "bury-add",
            date: next.buryDate,
            entries: [...next.buryList],
        });
    }

    const deckNames = new Set([
        ...Object.keys(previous.dailyDeckStats.counts),
        ...Object.keys(next.dailyDeckStats.counts),
    ]);
    for (const deckName of deckNames) {
        const previousCounts = previous.dailyDeckStats.counts[deckName] ?? { new: 0, review: 0 };
        const nextCounts = next.dailyDeckStats.counts[deckName] ?? { new: 0, review: 0 };
        const newDelta = nextCounts.new - previousCounts.new;
        const reviewDelta = nextCounts.review - previousCounts.review;
        if (newDelta === 0 && reviewDelta === 0) {
            continue;
        }
        operations.push({
            opType: "deck-stats-delta",
            date: next.dailyDeckStats.date,
            deckName,
            newDelta,
            reviewDelta,
        });
    }

    return operations;
}

export function extractDeviceState(input: {
    settings: SRSettings;
    historyDeck: string | null;
    deckOptionsProtocolVersion?: number;
}): PersistedDeviceState {
    return {
        version: SYRO_DEVICE_STATE_VERSION,
        settings: pickSettingsFields(input.settings, DEVICE_STATE_FIELDS),
        historyDeck:
            typeof input.historyDeck === "string" && input.historyDeck.trim().length > 0
                ? input.historyDeck
                : null,
        deckOptionsProtocolVersion:
            typeof input.deckOptionsProtocolVersion === "number" &&
            Number.isFinite(input.deckOptionsProtocolVersion)
                ? input.deckOptionsProtocolVersion
                : 1,
    };
}

export function createDefaultDeviceState(): PersistedDeviceState {
    return {
        version: SYRO_DEVICE_STATE_VERSION,
        settings: pickSettingsFields(cloneUnknown(DEFAULT_SETTINGS), DEVICE_STATE_FIELDS),
        historyDeck: null,
        deckOptionsProtocolVersion: 1,
    };
}

export function parseDeviceState(value: unknown): PersistedDeviceState | null {
    const settings = parseSettingsSubset(value, SYRO_DEVICE_STATE_VERSION, DEVICE_STATE_FIELDS);
    if (!settings || !isRecord(value)) {
        return null;
    }

    return {
        version: SYRO_DEVICE_STATE_VERSION,
        settings,
        historyDeck: getStringProp(value, "historyDeck")?.trim() ?? null,
        deckOptionsProtocolVersion: getNumberProp(value, "deckOptionsProtocolVersion") ?? 1,
    };
}

export function applyDeviceState(
    target: {
        settings: SRSettings;
        historyDeck: string | null;
    },
    persisted: PersistedDeviceState,
): void {
    applySettingsFields(target.settings, DEVICE_STATE_FIELDS, persisted.settings);
    target.historyDeck = persisted.historyDeck;
}

export function extractLicenseState(settings: SRSettings): PersistedLicenseState {
    return {
        version: SYRO_LICENSE_STATE_VERSION,
        licenseKey: settings.licenseKey ?? "",
        isPro: settings.isPro === true,
        licenseInstallationId: settings.licenseInstallationId ?? "",
        licenseState: normalizeLicenseState(settings.licenseState),
    };
}

export function createDefaultLicenseState(): PersistedLicenseState {
    return {
        version: SYRO_LICENSE_STATE_VERSION,
        licenseKey: "",
        isPro: false,
        licenseInstallationId: "",
        licenseState: null,
    };
}

export function parseLicenseState(value: unknown): PersistedLicenseState | null {
    if (!isRecord(value) || getNumberProp(value, "version") !== SYRO_LICENSE_STATE_VERSION) {
        return null;
    }

    return {
        version: SYRO_LICENSE_STATE_VERSION,
        licenseKey: getStringProp(value, "licenseKey")?.trim() ?? "",
        isPro: value["isPro"] === true,
        licenseInstallationId: getStringProp(value, "licenseInstallationId")?.trim() ?? "",
        licenseState: normalizeLicenseState(value["licenseState"]),
    };
}

export function applyLicenseState(settings: SRSettings, persisted: PersistedLicenseState): void {
    settings.licenseKey = persisted.licenseKey;
    settings.isPro = persisted.isPro;
    settings.licenseInstallationId = persisted.licenseInstallationId;
    settings.licenseState = persisted.licenseState;
}

export function parseLegacyPluginData(value: unknown): LegacyPluginData {
    if (!isRecord(value)) {
        return {};
    }

    return {
        settings: isRecord(value["settings"])
            ? cloneUnknown(value["settings"] as Record<string, unknown>)
            : undefined,
        buryDate: getStringProp(value, "buryDate")?.trim(),
        buryList: sanitizeStringArray(value["buryList"]),
        historyDeck: getStringProp(value, "historyDeck")?.trim() ?? null,
        dailyDeckStats: parseDailyDeckStats(value["dailyDeckStats"]),
        folderTrackingRules: isRecord(value["folderTrackingRules"])
            ? Object.fromEntries(
                  Object.entries(value["folderTrackingRules"]).map(([folderPath, rule]) => [
                      folderPath,
                      cloneFolderTrackingRule(rule),
                  ]),
              )
            : undefined,
        schemaVersion: getStringProp(value, "schemaVersion")?.trim(),
        migrations: isRecord(value["migrations"])
            ? cloneUnknown(value["migrations"] as Record<string, unknown>)
            : undefined,
    };
}

export function hasSyro012MigrationMarker(value: unknown): boolean {
    if (!isRecord(value) || !isRecord(value["migrations"])) {
        return false;
    }

    const migrations = value["migrations"] as Record<string, unknown>;
    return isRecord(migrations["syro012"]);
}

export function createSyro012DataShell(
    completedAt: string,
    sourceVersion = "0.0.11",
): LegacyPluginDataShell {
    return {
        version: 2,
        schemaVersion: "0.0.12",
        migrations: {
            syro012: {
                completedAt,
                sourceVersion,
            },
        },
    };
}

export class SyroJsonStateStore<T> {
    public lastLoadError: string | null = null;
    private lastSerialized: string | null = null;

    constructor(
        private readonly path: string,
        private readonly parse: (value: unknown) => T | null,
    ) {}

    async exists(): Promise<boolean> {
        return Iadapter.instance.adapter.exists(this.path);
    }

    async load(): Promise<T | null> {
        this.lastLoadError = null;
        const adapter = Iadapter.instance.adapter;
        try {
            if (!(await adapter.exists(this.path))) {
                this.lastSerialized = null;
                return null;
            }

            const raw = await adapter.read(this.path);
            if (!raw) {
                this.lastSerialized = null;
                return null;
            }
            this.lastSerialized = raw;
            const parsed = this.parse(parseJsonUnknown(raw));
            if (!parsed) {
                this.lastLoadError = `[SR-Syro] Invalid state schema: ${this.path}`;
                return null;
            }
            return parsed;
        } catch (error) {
            this.lastLoadError = `[SR-Syro] Failed to load state ${this.path}: ${String(error)}`;
            return null;
        }
    }

    async save(value: T): Promise<void> {
        const serialized = JSON.stringify(value, null, 2);
        await ensureDirectory(dirname(this.path));
        await Iadapter.instance.adapter.write(this.path, serialized);
        this.lastSerialized = serialized;
    }

    async hasChanged(value: T): Promise<boolean> {
        const serialized = JSON.stringify(value, null, 2);
        if (this.lastSerialized !== null) {
            return this.lastSerialized !== serialized;
        }

        const adapter = Iadapter.instance.adapter;
        if (!(await adapter.exists(this.path))) {
            return true;
        }

        const raw = await adapter.read(this.path);
        this.lastSerialized = raw;
        return raw !== serialized;
    }
}
