/**
 * Central settings model for the plugin.
 * This file defines the persisted settings shape, default values, and migration helpers.
 */

import { Platform } from "obsidian";
import * as tsfsrs from "ts-fsrs";
import { t } from "src/lang/helpers";

import { DataLocation } from "./dataStore/dataLocation";
import {
    DEFAULT_CLOZE_CONTEXT_SOFT_LIMIT_LINES,
    MAX_CLOZE_CONTEXT_SOFT_LIMIT_LINES,
    MIN_CLOZE_CONTEXT_SOFT_LIMIT_LINES,
} from "./settings/clozeContext";
import {
    getArrayProp,
    getBooleanProp,
    getNumberProp,
    getStringProp,
    isRecord,
} from "./util/typeGuards";
import { pathMatchesPattern } from "src/utils/fs";

// ============ Status Bar Animation ===========
export type StatusBarAnimationStyle = "None" | "Breathing";
export type ClozeContextMode = "single" | "double-break" | "expanded" | "full";
export type ClozeContextPerformanceMode = "off" | "safe-trim";
export type SyncProgressDisplayMode = "always" | "full-only" | "never";
export type SidebarProgressIndicatorMode = "ring" | "percentage";
export type SidebarProgressRingDirection = "clockwise" | "counterclockwise";
export type NoteReviewIgnoreReason = "ignored-folder" | "ignored-tag";
export type AutoExtractRuleKind = "heading" | "blank-block";
export type AutoExtractHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export const DEFAULT_SYNC_PROGRESS_DISPLAY_MODE: SyncProgressDisplayMode = "full-only";

export interface AutoExtractRule {
    sourcePath: string;
    rule: AutoExtractRuleKind;
    headingLevel?: AutoExtractHeadingLevel;
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
}

function normalizePathKey(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function normalizeAutoExtractHeadingLevel(value: unknown): AutoExtractHeadingLevel | undefined {
    const level = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
    return level >= 1 && level <= 6 ? (level as AutoExtractHeadingLevel) : undefined;
}

export function normalizeAutoExtractRule(value: unknown, pathHint = ""): AutoExtractRule | null {
    if (!isRecord(value)) {
        return null;
    }

    const ruleKind = getStringProp(value, "rule");
    if (ruleKind !== "heading" && ruleKind !== "blank-block") {
        return null;
    }

    const rawSourcePath = getStringProp(value, "sourcePath") ?? pathHint;
    const sourcePath = normalizePathKey(rawSourcePath.trim());
    if (!sourcePath) {
        return null;
    }

    const now = Date.now();
    const createdAt = getNumberProp(value, "createdAt");
    const updatedAt = getNumberProp(value, "updatedAt");
    const normalized: AutoExtractRule = {
        sourcePath,
        rule: ruleKind,
        enabled: getBooleanProp(value, "enabled") ?? true,
        createdAt: createdAt !== undefined && Number.isFinite(createdAt) ? createdAt : now,
        updatedAt: updatedAt !== undefined && Number.isFinite(updatedAt) ? updatedAt : now,
    };

    if (ruleKind === "heading") {
        normalized.headingLevel = normalizeAutoExtractHeadingLevel(value.headingLevel) ?? 1;
    }

    return normalized;
}

export function normalizeAutoExtractRules(value: unknown): Record<string, AutoExtractRule> {
    if (!isRecord(value)) {
        return {};
    }

    const normalized: Record<string, AutoExtractRule> = {};
    for (const [path, rule] of Object.entries(value)) {
        const normalizedRule = normalizeAutoExtractRule(rule, path);
        if (!normalizedRule) {
            continue;
        }
        normalized[normalizePathKey(normalizedRule.sourcePath)] = normalizedRule;
    }
    return normalized;
}
// ============ Deck Option Presets ===========
// Per-preset configuration.
export interface DeckOptionsPreset {
    uuid: string; // Stable preset identity used for sync and deck assignment
    createdAt: string; // Stable creation timestamp used to preserve display order
    name: string; // Preset name
    autoAdvance: boolean; // Whether cards auto-advance
    autoAdvanceSeconds: number; // Delay before auto-advance
    showProgressBar: boolean; // Whether to show the countdown progress bar
    maxNewCards: number; // Daily new card limit
    maxReviews: number; // Daily review limit
    maxNewExtracts: number; // Daily new extract limit
    maxExtractReviews: number; // Daily extract review limit
    learningSteps: string; // Learning steps, e.g. "1m 10m"
    lapseSteps: string; // Relearning steps, e.g. "10m"
    fsrs?: FsrsSettings; // Future runtime truth for preset-scoped FSRS parameters
}

// Shared progress bar style.
export interface ProgressBarStyle {
    color: string; // Main bar color
    warningColor: string; // Color used near completion
    height: number; // Bar height in px
    rightToLeft: boolean; // Animation direction
}

export type LicensePlan = "supporter";

export interface LicenseState {
    licenseKey: string;
    deviceId: string;
    token: string;
    plan: LicensePlan;
    features: string[];
    lastVerifiedAt: number;
    activatedAt: number;
}

export interface ReviewResponseTexts {
    again: string;
    hard: string;
    good: string;
    easy: string;
}

export interface FsrsSettings
    extends Omit<tsfsrs.FSRSParameters, "w" | "learning_steps" | "relearning_steps"> {
    revlog_tags: string[];
    w: number[];
    learning_steps: tsfsrs.StepUnit[];
    relearning_steps: tsfsrs.StepUnit[];
}

export interface WeightedMultiplierSettings {
    baseEase: number;
    impMin: number;
    impMax: number;
    againInterval: number;
    hardFactor: number;
    goodFactor: number;
    easyFactor: number;
}

export const DEFAULT_FLASHCARD_RESPONSE_TEXTS: ReviewResponseTexts = {
    again: t("RESET"),
    hard: t("HARD"),
    good: t("GOOD"),
    easy: t("EASY"),
};

export const DEFAULT_NOTE_RESPONSE_TEXTS: ReviewResponseTexts = {
    again: t("RESET"),
    hard: t("HARD"),
    good: t("GOOD"),
    easy: t("EASY"),
};

const FSRS_STEP_PATTERN = /^\d+(?:\.\d+)?[mhd]$/i;
const LEGACY_DECK_OPTIONS_CREATED_AT_BASE_MS = Date.parse("1970-01-02T00:00:00.000Z");

export const DEFAULT_DECK_OPTIONS_PRESET_UUID = "deck-preset-default";
export const DEFAULT_DECK_OPTIONS_PRESET_CREATED_AT = "1970-01-01T00:00:00.000Z";
export const DEFAULT_MAX_NEW_EXTRACTS = 10;
export const DEFAULT_MAX_EXTRACT_REVIEWS = 50;

function isFsrsStepUnit(value: unknown): value is tsfsrs.StepUnit {
    return typeof value === "string" && FSRS_STEP_PATTERN.test(value.trim());
}

export function parseDeckOptionsStepInput(value: string): tsfsrs.StepUnit[] | null {
    const entries = value
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);

    if (entries.length === 0) {
        return [];
    }

    const validSteps = entries.filter(isFsrsStepUnit);
    return validSteps.length === entries.length ? validSteps : null;
}

function normalizeFsrsStepList(
    value: unknown,
    fallback: readonly tsfsrs.StepUnit[],
): tsfsrs.StepUnit[] {
    if (!Array.isArray(value)) {
        return [...fallback];
    }

    if (value.length === 0) {
        return [];
    }

    const steps: tsfsrs.StepUnit[] = [];
    for (const entry of value) {
        if (typeof entry !== "string") {
            return [...fallback];
        }

        const trimmedEntry = entry.trim();
        if (!isFsrsStepUnit(trimmedEntry)) {
            return [...fallback];
        }

        steps.push(trimmedEntry);
    }

    return steps.length === value.length ? steps : [...fallback];
}

function normalizeFsrsWeights(value: unknown, fallback: readonly number[]): number[] {
    if (!Array.isArray(value)) {
        return [...fallback];
    }

    const weights = value.map((entry) => Number(entry));
    if (weights.some((entry) => !Number.isFinite(entry)) || weights.length !== fallback.length) {
        return [...fallback];
    }

    try {
        return [...tsfsrs.checkParameters(weights)];
    } catch {
        return [...fallback];
    }
}

function parseLegacyFsrsSteps(
    value: string | undefined,
    fallback: readonly tsfsrs.StepUnit[],
): tsfsrs.StepUnit[] {
    if (typeof value !== "string") {
        return [...fallback];
    }

    const parsedSteps = parseDeckOptionsStepInput(value);
    return parsedSteps === null ? [...fallback] : [...parsedSteps];
}

export function createDefaultFsrsSettings(overrides: Partial<FsrsSettings> = {}): FsrsSettings {
    const { revlog_tags, ...parameterOverrides } = overrides;
    const params = tsfsrs.generatorParameters({
        enable_fuzz: true,
        ...parameterOverrides,
    });

    return {
        revlog_tags: Array.isArray(revlog_tags)
            ? revlog_tags.filter((tag): tag is string => typeof tag === "string")
            : [],
        request_retention: params.request_retention,
        maximum_interval: params.maximum_interval,
        w: [...params.w],
        enable_fuzz: params.enable_fuzz,
        enable_short_term: params.enable_short_term,
        learning_steps: [...params.learning_steps],
        relearning_steps: [...params.relearning_steps],
    };
}

export function cloneFsrsSettings(settings: FsrsSettings): FsrsSettings {
    return {
        ...settings,
        revlog_tags: [...settings.revlog_tags],
        w: [...settings.w],
        learning_steps: [...settings.learning_steps],
        relearning_steps: [...settings.relearning_steps],
    };
}

export function normalizeFsrsSettings(value: unknown, fallback?: FsrsSettings): FsrsSettings {
    const defaultSettings = fallback ? cloneFsrsSettings(fallback) : createDefaultFsrsSettings();

    if (!isRecord(value)) {
        return defaultSettings;
    }

    const requestRetention = getNumberProp(value, "request_retention");
    const maximumInterval = getNumberProp(value, "maximum_interval");

    const params = tsfsrs.generatorParameters({
        request_retention:
            requestRetention !== undefined && requestRetention > 0 && requestRetention <= 1
                ? requestRetention
                : defaultSettings.request_retention,
        maximum_interval:
            maximumInterval !== undefined
                ? Math.max(1, Math.round(maximumInterval))
                : defaultSettings.maximum_interval,
        w: normalizeFsrsWeights(getArrayProp(value, "w"), defaultSettings.w),
        enable_fuzz: getBooleanProp(value, "enable_fuzz") ?? defaultSettings.enable_fuzz,
        enable_short_term:
            getBooleanProp(value, "enable_short_term") ?? defaultSettings.enable_short_term,
        learning_steps: normalizeFsrsStepList(
            getArrayProp(value, "learning_steps"),
            defaultSettings.learning_steps,
        ),
        relearning_steps: normalizeFsrsStepList(
            getArrayProp(value, "relearning_steps"),
            defaultSettings.relearning_steps,
        ),
    });

    return {
        revlog_tags: Array.isArray(value.revlog_tags)
            ? value.revlog_tags.filter((tag): tag is string => typeof tag === "string")
            : [...defaultSettings.revlog_tags],
        request_retention: params.request_retention,
        maximum_interval: params.maximum_interval,
        w: [...params.w],
        enable_fuzz: params.enable_fuzz,
        enable_short_term: params.enable_short_term,
        learning_steps: [...params.learning_steps],
        relearning_steps: [...params.relearning_steps],
    };
}

export const DEFAULT_FSRS_SETTINGS: FsrsSettings = createDefaultFsrsSettings();

export const DEFAULT_WEIGHTED_MULTIPLIER_SETTINGS: WeightedMultiplierSettings = {
    baseEase: 250,
    impMin: 1.0,
    impMax: 2.5,
    againInterval: 1.0,
    hardFactor: 0.7,
    goodFactor: 1.3,
    easyFactor: 2.0,
};

function hashDeckOptionsSeed(seed: string): string {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index++) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

function createLegacyDeckOptionsPresetCreatedAt(index: number, uuid: string): string {
    if (index >= 0) {
        return new Date(LEGACY_DECK_OPTIONS_CREATED_AT_BASE_MS + index).toISOString();
    }

    const offset = parseInt(hashDeckOptionsSeed(uuid).slice(0, 6), 16);
    return new Date(LEGACY_DECK_OPTIONS_CREATED_AT_BASE_MS + 10_000 + offset).toISOString();
}

function buildLegacyDeckOptionsPresetSeed(
    preset: Omit<DeckOptionsPreset, "uuid" | "createdAt">,
    legacyIndex: number,
): string {
    return JSON.stringify({
        legacyIndex,
        name: preset.name.trim(),
        autoAdvance: preset.autoAdvance,
        autoAdvanceSeconds: preset.autoAdvanceSeconds,
        showProgressBar: preset.showProgressBar,
        maxNewCards: preset.maxNewCards,
        maxReviews: preset.maxReviews,
        // Keep legacy preset UUIDs stable: extract limits did not exist when these
        // UUIDs were derived, so they must not participate in the legacy seed.
        learningSteps: preset.learningSteps,
        lapseSteps: preset.lapseSteps,
        fsrs: preset.fsrs
            ? {
                  ...preset.fsrs,
                  revlog_tags: [...preset.fsrs.revlog_tags],
                  w: [...preset.fsrs.w],
                  learning_steps: [...preset.fsrs.learning_steps],
                  relearning_steps: [...preset.fsrs.relearning_steps],
              }
            : null,
    });
}

function createLegacyDeckOptionsPresetUuid(
    preset: Omit<DeckOptionsPreset, "uuid" | "createdAt">,
    legacyIndex: number,
): string {
    return `deck-preset-legacy-${legacyIndex}-${hashDeckOptionsSeed(
        buildLegacyDeckOptionsPresetSeed(preset, legacyIndex),
    )}`;
}

export function generateDeckOptionsPresetUuid(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `deck-preset-${crypto.randomUUID()}`;
    }

    return `deck-preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDailyLimit(value: unknown, fallback: number): number {
    const numberValue = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.max(0, Math.round(numberValue));
}

interface DeckOptionsNormalizeOptions {
    legacyIndex?: number;
    extractLimitDefaults?: {
        maxNewExtracts?: number;
        maxExtractReviews?: number;
    };
}

export const DEFAULT_DECK_OPTIONS_PRESET: DeckOptionsPreset = {
    uuid: DEFAULT_DECK_OPTIONS_PRESET_UUID,
    createdAt: DEFAULT_DECK_OPTIONS_PRESET_CREATED_AT,
    name: "\u9ed8\u8ba4\u65b9\u6848",
    autoAdvance: true,
    autoAdvanceSeconds: 10,
    showProgressBar: true,
    maxNewCards: 20, // Default daily new card limit
    maxReviews: 200, // Default daily review limit
    maxNewExtracts: DEFAULT_MAX_NEW_EXTRACTS,
    maxExtractReviews: DEFAULT_MAX_EXTRACT_REVIEWS,
    learningSteps: "1m 10m", // Default learning steps
    lapseSteps: "10m", // Default relearning steps
    fsrs: createDefaultFsrsSettings(),
};

const BUILTIN_DECK_OPTIONS_PRESET_NAME_ALIASES = new Set([
    DEFAULT_DECK_OPTIONS_PRESET.name,
    "Default Preset",
    "Default preset",
]);

export function isBuiltinDeckOptionsPresetName(name: string, presetIndex: number): boolean {
    if (presetIndex !== 0) {
        return false;
    }

    return BUILTIN_DECK_OPTIONS_PRESET_NAME_ALIASES.has(name.trim());
}

export function getDeckOptionsPresetDisplayName(
    preset: Pick<DeckOptionsPreset, "name">,
    presetIndex: number,
): string {
    return isBuiltinDeckOptionsPresetName(preset.name, presetIndex)
        ? t("DECK_OPTIONS_BUILTIN_PRESET_NAME")
        : preset.name;
}

export function cloneDeckOptionsPreset(preset: DeckOptionsPreset): DeckOptionsPreset {
    return {
        ...preset,
        fsrs: preset.fsrs ? cloneFsrsSettings(preset.fsrs) : undefined,
    };
}

function dedupeDeckOptionsPresets(presets: DeckOptionsPreset[]): DeckOptionsPreset[] {
    const deduped = new Map<string, DeckOptionsPreset>();
    for (const preset of presets) {
        const existing = deduped.get(preset.uuid);
        if (!existing || existing.createdAt.localeCompare(preset.createdAt) <= 0) {
            deduped.set(preset.uuid, preset);
        }
    }
    return [...deduped.values()];
}

function sortDeckOptionsPresets(
    presets: DeckOptionsPreset[],
    fallbackFsrs?: FsrsSettings,
): DeckOptionsPreset[] {
    const deduped = dedupeDeckOptionsPresets(presets);
    const defaultPreset =
        deduped.find((preset) => preset.uuid === DEFAULT_DECK_OPTIONS_PRESET_UUID) ??
        createDefaultDeckOptionsPreset(fallbackFsrs);
    const nonDefaultPresets = deduped
        .filter((preset) => preset.uuid !== DEFAULT_DECK_OPTIONS_PRESET_UUID)
        .sort((left, right) => {
            const createdAtCompare = left.createdAt.localeCompare(right.createdAt);
            return createdAtCompare !== 0
                ? createdAtCompare
                : left.uuid.localeCompare(right.uuid);
        });

    return [
        {
            ...defaultPreset,
            uuid: DEFAULT_DECK_OPTIONS_PRESET_UUID,
            createdAt: DEFAULT_DECK_OPTIONS_PRESET_CREATED_AT,
        },
        ...nonDefaultPresets,
    ];
}

export function normalizeDeckOptionsPreset(
    preset: unknown,
    fallbackFsrs?: FsrsSettings,
    options: DeckOptionsNormalizeOptions = {},
): DeckOptionsPreset {
    const defaultFsrs = fallbackFsrs
        ? cloneFsrsSettings(fallbackFsrs)
        : createDefaultFsrsSettings();
    const rawPreset = isRecord(preset) ? preset : {};
    const rawPresetFsrs = isRecord(rawPreset.fsrs) ? rawPreset.fsrs : undefined;
    const legacyIndex = typeof options.legacyIndex === "number" ? options.legacyIndex : -1;
    const extractLimitDefaults = options.extractLimitDefaults ?? {};

    const normalizedPreset = {
        name: getStringProp(rawPreset, "name") ?? DEFAULT_DECK_OPTIONS_PRESET.name,
        autoAdvance:
            getBooleanProp(rawPreset, "autoAdvance") ?? DEFAULT_DECK_OPTIONS_PRESET.autoAdvance,
        autoAdvanceSeconds:
            getNumberProp(rawPreset, "autoAdvanceSeconds") ??
            DEFAULT_DECK_OPTIONS_PRESET.autoAdvanceSeconds,
        showProgressBar:
            getBooleanProp(rawPreset, "showProgressBar") ??
            DEFAULT_DECK_OPTIONS_PRESET.showProgressBar,
        maxNewCards:
            getNumberProp(rawPreset, "maxNewCards") ?? DEFAULT_DECK_OPTIONS_PRESET.maxNewCards,
        maxReviews:
            getNumberProp(rawPreset, "maxReviews") ?? DEFAULT_DECK_OPTIONS_PRESET.maxReviews,
        maxNewExtracts: normalizeDailyLimit(
            getNumberProp(rawPreset, "maxNewExtracts"),
            normalizeDailyLimit(
                extractLimitDefaults.maxNewExtracts,
                DEFAULT_DECK_OPTIONS_PRESET.maxNewExtracts,
            ),
        ),
        maxExtractReviews: normalizeDailyLimit(
            getNumberProp(rawPreset, "maxExtractReviews"),
            normalizeDailyLimit(
                extractLimitDefaults.maxExtractReviews,
                DEFAULT_DECK_OPTIONS_PRESET.maxExtractReviews,
            ),
        ),
        learningSteps:
            getStringProp(rawPreset, "learningSteps") ?? DEFAULT_DECK_OPTIONS_PRESET.learningSteps,
        lapseSteps:
            getStringProp(rawPreset, "lapseSteps") ?? DEFAULT_DECK_OPTIONS_PRESET.lapseSteps,
        fsrs: normalizeFsrsSettings(rawPresetFsrs ?? defaultFsrs, defaultFsrs),
    } satisfies Omit<DeckOptionsPreset, "uuid" | "createdAt">;

    if (!rawPresetFsrs || !Object.prototype.hasOwnProperty.call(rawPresetFsrs, "learning_steps")) {
        normalizedPreset.fsrs.learning_steps = parseLegacyFsrsSteps(
            normalizedPreset.learningSteps,
            defaultFsrs.learning_steps,
        );
    }

    if (
        !rawPresetFsrs ||
        !Object.prototype.hasOwnProperty.call(rawPresetFsrs, "relearning_steps")
    ) {
        normalizedPreset.fsrs.relearning_steps = parseLegacyFsrsSteps(
            normalizedPreset.lapseSteps,
            defaultFsrs.relearning_steps,
        );
    }

    const rawUuid = getStringProp(rawPreset, "uuid")?.trim();
    const isLegacyDefaultPreset = !rawUuid && legacyIndex === 0;
    const uuid =
        rawUuid && rawUuid.length > 0
            ? rawUuid
            : isLegacyDefaultPreset
              ? DEFAULT_DECK_OPTIONS_PRESET_UUID
              : createLegacyDeckOptionsPresetUuid(normalizedPreset, legacyIndex);
    const rawCreatedAt = getStringProp(rawPreset, "createdAt")?.trim();

    return syncDeckOptionsPresetStepFields({
        ...normalizedPreset,
        uuid,
        createdAt:
            rawCreatedAt && rawCreatedAt.length > 0
                ? rawCreatedAt
                : uuid === DEFAULT_DECK_OPTIONS_PRESET_UUID
                  ? DEFAULT_DECK_OPTIONS_PRESET_CREATED_AT
                  : createLegacyDeckOptionsPresetCreatedAt(legacyIndex, uuid),
    });
}

export function createDefaultDeckOptionsPreset(
    fallbackFsrs?: FsrsSettings,
    options: Omit<DeckOptionsNormalizeOptions, "legacyIndex"> = {},
): DeckOptionsPreset {
    const extractLimitDefaults = options.extractLimitDefaults ?? {};
    return normalizeDeckOptionsPreset(
        {
            ...DEFAULT_DECK_OPTIONS_PRESET,
            maxNewExtracts: normalizeDailyLimit(
                extractLimitDefaults.maxNewExtracts,
                DEFAULT_DECK_OPTIONS_PRESET.maxNewExtracts,
            ),
            maxExtractReviews: normalizeDailyLimit(
                extractLimitDefaults.maxExtractReviews,
                DEFAULT_DECK_OPTIONS_PRESET.maxExtractReviews,
            ),
            uuid: DEFAULT_DECK_OPTIONS_PRESET_UUID,
            createdAt: DEFAULT_DECK_OPTIONS_PRESET_CREATED_AT,
        },
        fallbackFsrs,
        {
            ...options,
            legacyIndex: 0,
        },
    );
}

export function createNewDeckOptionsPreset(
    fallbackFsrs?: FsrsSettings,
    overrides: Partial<DeckOptionsPreset> = {},
): DeckOptionsPreset {
    const createdAt = overrides.createdAt?.trim() || new Date().toISOString();
    const uuid =
        overrides.uuid?.trim() ||
        (createdAt === DEFAULT_DECK_OPTIONS_PRESET_CREATED_AT
            ? DEFAULT_DECK_OPTIONS_PRESET_UUID
            : generateDeckOptionsPresetUuid());

    return normalizeDeckOptionsPreset(
        {
            ...DEFAULT_DECK_OPTIONS_PRESET,
            ...overrides,
            uuid,
            createdAt,
        },
        fallbackFsrs,
    );
}

export function formatFsrsStepList(steps: readonly tsfsrs.StepUnit[]): string {
    return steps.join(" ");
}

export function syncDeckOptionsPresetStepFields(preset: DeckOptionsPreset): DeckOptionsPreset {
    const normalizedPreset = cloneDeckOptionsPreset(preset);
    const fsrsSettings = normalizedPreset.fsrs ?? createDefaultFsrsSettings();

    normalizedPreset.learningSteps = formatFsrsStepList(fsrsSettings.learning_steps);
    normalizedPreset.lapseSteps = formatFsrsStepList(fsrsSettings.relearning_steps);

    return normalizedPreset;
}

export function updateDeckOptionsPresetStepProxy(
    preset: DeckOptionsPreset,
    updates: Partial<Pick<DeckOptionsPreset, "learningSteps" | "lapseSteps">>,
    fallbackFsrs?: FsrsSettings,
): DeckOptionsPreset {
    const normalizedPreset = normalizeDeckOptionsPreset(preset, fallbackFsrs);
    const normalizedFsrs = normalizedPreset.fsrs ?? createDefaultFsrsSettings();

    if (updates.learningSteps !== undefined) {
        normalizedPreset.learningSteps = updates.learningSteps;
        normalizedFsrs.learning_steps = parseLegacyFsrsSteps(
            updates.learningSteps,
            normalizedFsrs.learning_steps,
        );
    }

    if (updates.lapseSteps !== undefined) {
        normalizedPreset.lapseSteps = updates.lapseSteps;
        normalizedFsrs.relearning_steps = parseLegacyFsrsSteps(
            updates.lapseSteps,
            normalizedFsrs.relearning_steps,
        );
    }

    normalizedPreset.fsrs = normalizeFsrsSettings(normalizedFsrs, normalizedFsrs);
    return syncDeckOptionsPresetStepFields(normalizedPreset);
}

export function normalizeDeckOptionsPresets(
    presets: unknown,
    fallbackFsrs?: FsrsSettings,
    options: Omit<DeckOptionsNormalizeOptions, "legacyIndex"> = {},
): DeckOptionsPreset[] {
    if (!Array.isArray(presets) || presets.length === 0) {
        return [createDefaultDeckOptionsPreset(fallbackFsrs, options)];
    }

    return sortDeckOptionsPresets(
        presets.map((preset, index) =>
            normalizeDeckOptionsPreset(preset, fallbackFsrs, {
                ...options,
                legacyIndex: index,
            }),
        ),
        fallbackFsrs,
    );
}

export function normalizeDeckPresetAssignment(
    assignment: unknown,
    presets: readonly DeckOptionsPreset[],
): Record<string, string> {
    if (!isRecord(assignment)) {
        return {};
    }

    const presetByUuid = new Map(presets.map((preset) => [preset.uuid, preset] as const));
    const normalizedAssignment: Record<string, string> = {};

    for (const [deckPath, value] of Object.entries(assignment)) {
        if (typeof deckPath !== "string" || deckPath.trim().length === 0) {
            continue;
        }

        let presetUuid = "";
        if (typeof value === "string") {
            presetUuid = value.trim();
        } else if (typeof value === "number" && Number.isFinite(value)) {
            const legacyPreset = presets[Math.trunc(value)] ?? null;
            presetUuid = legacyPreset?.uuid ?? "";
        }

        if (
            !presetUuid ||
            presetUuid === DEFAULT_DECK_OPTIONS_PRESET_UUID ||
            !presetByUuid.has(presetUuid)
        ) {
            continue;
        }

        normalizedAssignment[deckPath] = presetUuid;
    }

    return normalizedAssignment;
}

export function resolveDeckOptionsPresetUuid(
    settings: Pick<SRSettings, "deckOptionsPresets" | "deckPresetAssignment" | "fsrsSettings">,
    deckPath?: string | null,
): string {
    const fallbackFsrs = normalizeFsrsSettings(settings.fsrsSettings);
    const presets = normalizeDeckOptionsPresets(settings.deckOptionsPresets, fallbackFsrs);
    if (!deckPath) {
        return DEFAULT_DECK_OPTIONS_PRESET_UUID;
    }

    return (
        normalizeDeckPresetAssignment(settings.deckPresetAssignment, presets)[deckPath] ??
        DEFAULT_DECK_OPTIONS_PRESET_UUID
    );
}

export function findDeckOptionsPresetIndexByUuid(
    presets: readonly DeckOptionsPreset[],
    presetUuid: string,
): number {
    const index = presets.findIndex((preset) => preset.uuid === presetUuid);
    return index >= 0 ? index : 0;
}

export function resolveDeckOptionsPresetIndex(
    settings: Pick<SRSettings, "deckOptionsPresets" | "deckPresetAssignment" | "fsrsSettings">,
    deckPath?: string | null,
): number {
    const fallbackFsrs = normalizeFsrsSettings(settings.fsrsSettings);
    const presets = normalizeDeckOptionsPresets(settings.deckOptionsPresets, fallbackFsrs);
    return findDeckOptionsPresetIndexByUuid(
        presets,
        resolveDeckOptionsPresetUuid(settings, deckPath),
    );
}

export function resolveDeckOptionsPreset(
    settings: Pick<SRSettings, "deckOptionsPresets" | "deckPresetAssignment" | "fsrsSettings">,
    deckPath?: string | null,
): DeckOptionsPreset {
    const fallbackFsrs = normalizeFsrsSettings(settings.fsrsSettings);
    const presets = normalizeDeckOptionsPresets(settings.deckOptionsPresets, fallbackFsrs);
    const presetUuid = resolveDeckOptionsPresetUuid(
        {
            deckOptionsPresets: presets,
            deckPresetAssignment: settings.deckPresetAssignment,
            fsrsSettings: fallbackFsrs,
        },
        deckPath,
    );
    const presetIndex = findDeckOptionsPresetIndexByUuid(presets, presetUuid);

    return cloneDeckOptionsPreset(presets[presetIndex] ?? presets[0] ?? createDefaultDeckOptionsPreset());
}

export function resolveDeckFsrsSettings(
    settings: Pick<SRSettings, "deckOptionsPresets" | "deckPresetAssignment" | "fsrsSettings">,
    deckPath?: string | null,
): FsrsSettings {
    return cloneFsrsSettings(
        resolveDeckOptionsPreset(settings, deckPath).fsrs ?? DEFAULT_FSRS_SETTINGS,
    );
}

export function syncFsrsSettingsCompatibilityMirror(settings: SRSettings): void {
    const normalizedFsrsSettings = normalizeFsrsSettings(settings.fsrsSettings);
    settings.deckOptionsPresets = normalizeDeckOptionsPresets(
        settings.deckOptionsPresets,
        normalizedFsrsSettings,
        {
            extractLimitDefaults: {
                maxNewExtracts: settings.maxNewExtractsPerDay,
                maxExtractReviews: settings.maxExtractReviewsPerDay,
            },
        },
    );
    settings.deckPresetAssignment = normalizeDeckPresetAssignment(
        settings.deckPresetAssignment,
        settings.deckOptionsPresets,
    );
    settings.fsrsSettings = resolveDeckFsrsSettings(settings);
}

export function setFsrsFuzzForAllDeckOptionsPresets(
    settings: SRSettings,
    enableFuzz: boolean,
): void {
    const fallbackFsrs = normalizeFsrsSettings(settings.fsrsSettings);
    settings.deckOptionsPresets = normalizeDeckOptionsPresets(
        settings.deckOptionsPresets,
        fallbackFsrs,
    ).map((preset) =>
        normalizeDeckOptionsPreset(
            {
                ...preset,
                fsrs: {
                    ...preset.fsrs,
                    enable_fuzz: enableFuzz,
                },
            },
            fallbackFsrs,
        ),
    );
    settings.fsrsSettings = normalizeFsrsSettings(
        {
            ...(settings.fsrsSettings ?? fallbackFsrs),
            enable_fuzz: enableFuzz,
        },
        fallbackFsrs,
    );
    syncFsrsSettingsCompatibilityMirror(settings);
}

// Default progress bar style.
export const DEFAULT_PROGRESS_BAR_STYLE: ProgressBarStyle = {
    color: "#7c3aed", // Purple
    warningColor: "#ef4444", // Red
    height: 4,
    rightToLeft: false, // Default left-origin animation
};

export interface SRSettings {
    // flashcards
    flashcardResponseTexts: ReviewResponseTexts;

    flashcardTags: string[]; // [Deprecated] Use convertFoldersToDecks instead
    convertFoldersToDecks: boolean;
    burySiblingCards: boolean;
    burySiblingCardsByNoteReview: boolean;
    multiClozeCard: boolean;
    enableNoteCachePersistence: boolean;
    autoIncrementalSync: boolean;
    syncProgressDisplayMode: SyncProgressDisplayMode;
    cardBlockID: boolean;
    randomizeCardOrder: boolean;
    flashcardCardOrder: string;
    flashcardDeckOrder: string;
    convertHighlightsToClozes: boolean;
    convertBoldTextToClozes: boolean;
    convertCurlyBracketsToClozes: boolean;
    convertAnkiClozesToClozes: boolean;
    clozePatterns: string[];
    singleLineCardSeparator: string;
    singleLineReversedCardSeparator: string;
    multilineCardSeparator: string;
    multilineReversedCardSeparator: string;
    multilineCardEndMarker: string;
    parseClozesInCodeBlocks: boolean; // Whether to parse {{c1::...}} cloze syntax in code blocks
    enableLatexPopover: boolean; // Whether to enable the LaTeX cloze popover
    codeContextLines: number; // code context lines
    clozeContextMode: ClozeContextMode;
    clozeContextPerformanceMode: ClozeContextPerformanceMode;
    clozeContextSoftLimitLines: number;
    showOtherClozesVisual: boolean; // [Deprecated] Legacy master switch kept for migration
    showOtherAnkiClozeVisual: boolean; // Show styling for other Anki clozes during review
    showOtherHighlightClozeVisual: boolean; // Show styling for other highlight clozes during review
    showOtherBoldClozeVisual: boolean; // Show styling for other bold clozes during review
    editLaterTag: string;
    intervalShowHide: boolean;
    // notes
    enableNoteReviewPaneOnStartup: boolean;
    tagsToReview: string[];
    noteFoldersToIgnore: string[];
    tagsToIgnore: string[];
    openRandomNote: boolean;
    autoNextNote: boolean;
    mixDue: number;
    mixNew: number;
    mixCardNote: boolean;
    mixCard: number;
    mixNote: number;
    reviewResponseFloatBar: boolean;
    responseBarPositionPercentage: number;
    reviewingNoteDirectly: boolean;
    disableFileMenuReviewOptions: boolean;
    maxNDaysNotesReviewQueue: number;
    enableExtracts: boolean;
    maxNewExtractsPerDay: number;
    maxExtractReviewsPerDay: number;
    autoExtractRules: Record<string, AutoExtractRule>;

    // UI preferences
    showRibbonIcon: boolean;
    showStatusBar: boolean;
    collapsedDeckPaths: string[]; // Legacy collapsed deck paths, kept for migration
    deckCollapseState: Record<string, boolean>; // Persisted collapsed state by deck path
    showContextInCards: boolean;
    showIntervalInReviewButtons: boolean;
    flashcardHeightPercentage: number;
    flashcardWidthPercentage: number;
    // React UI Specific
    reactFlashcardWidth: number;
    reactFlashcardHeight: number;
    reactDeckTreeWidth?: number;
    flashcardEasyText: string;
    flashcardGoodText: string;
    flashcardHardText: string;
    reviewButtonDelay: number;
    openViewInNewTab: boolean; // Deprecated: flashcard review is always opened in a tab.
    enableVolumeKeyControl: boolean;
    volumeUpMapping: number;
    volumeDownMapping: number;

    // algorithm
    fsrsSettings: FsrsSettings;
    weightedMultiplierSettings: WeightedMultiplierSettings;
    noteResponseTexts: ReviewResponseTexts;
    loadBalance: boolean;
    maxLinkFactor: number;

    // storage
    dataStore: string;
    cardCommentOnSameLine: boolean;

    // logging
    showSchedulingDebugMessages: boolean;
    showParserDebugMessages: boolean;
    showRuntimeDebugMessages: boolean;

    // Track-file settings preserved for legacy migration support.
    dataLocation: DataLocation;
    customFolder: string;
    maxNewPerDay: number;
    repeatItems: boolean;
    trackedNoteToDecks: boolean;
    untrackWithReviewTag: boolean;

    // Deck option presets
    deckOptionsPresets: DeckOptionsPreset[]; // All presets, where index 0 is the default preset
    deckPresetAssignment: Record<string, string>; // Deck path -> preset uuid
    progressBarStyle: ProgressBarStyle; // Shared progress bar styling

    // Daily rollover settings
    rolloverHour: number; // Hour that starts a new day, defaulting to 4 AM

    // Learning queue settings
    learnAheadMinutes: number; // Learn-ahead window in minutes

    // Sidebar tag settings
    sidebarIgnoredTags: string[]; // Ignored tags
    sidebarTagSortMode: "a-z" | "frequency" | "custom"; // Sidebar tag sorting mode
    sidebarCustomTagOrder: string[]; // User-defined tag order
    sidebarFilterBarHeight: number; // Filter bar height in px
    hideNoteReviewSidebarFilters: boolean; // Whether to hide the sidebar filter header
    showSidebarProgressIndicator: boolean; // Whether to show the sidebar progress indicator
    sidebarProgressRingColor: string; // Review queue progress ring color
    sidebarProgressIndicatorMode: SidebarProgressIndicatorMode; // Review queue progress indicator mode
    sidebarProgressRingDirection: SidebarProgressRingDirection; // Review queue progress ring direction
    sidebarFilePathTooltipEnabled: boolean; // Whether to show file path tooltips in the review queue sidebar
    sidebarFilePathTooltipDelayMs: number; // Hover delay before showing sidebar file path tooltips

    // Status bar styling
    noteStatusBarColor: string; // Note due status bar color
    noteStatusBarAnimation: StatusBarAnimationStyle; // Note status bar animation
    noteStatusBarPeriod: number; // Note status bar animation period in seconds
    flashcardStatusBarColor: string; // Flashcard due status bar color
    flashcardStatusBarAnimation: StatusBarAnimationStyle; // Flashcard status bar animation
    flashcardStatusBarPeriod: number; // Flashcard status bar animation period in seconds
    showStatusBarDueNotification: boolean; // Whether due notifications are enabled in the status bar

    // Timeline Settings
    sidebarTimelineHeight: number; // Persisted timeline panel height in px
    sidebarTimelineOpen: boolean; // Persisted desktop timeline expanded state
    sidebarTimelineSelectedPath: string | null; // Persisted selected note path in timeline
    showScrollPercentage: boolean;
    autoExpandTimeline: boolean;
    timelineAllowUntrackedNotes: boolean;
    timelineAutoFollowReviewCards: boolean;
    timelineAutoCommitReviewSelection: boolean;
    timelineEnableDurationPrefixSyntax: boolean;

    // License state
    licenseKey: string; // User-entered license key
    isPro: boolean; // Derived Supporter membership state
    licenseInstallationId: string; // Stable installation UUID for this plugin install
    licenseState: LicenseState | null; // Persisted license cache

    previousRelease: string;
}

export const DEFAULT_SETTINGS: SRSettings = {
    // flashcards
    flashcardResponseTexts: { ...DEFAULT_FLASHCARD_RESPONSE_TEXTS },

    flashcardTags: ["#flashcards"],
    convertFoldersToDecks: true,
    burySiblingCards: false,
    burySiblingCardsByNoteReview: false,
    multiClozeCard: false,
    enableNoteCachePersistence: true,
    autoIncrementalSync: true,
    syncProgressDisplayMode: DEFAULT_SYNC_PROGRESS_DISPLAY_MODE,
    cardBlockID: false,
    randomizeCardOrder: null,
    flashcardCardOrder: "DueFirstRandom",
    flashcardDeckOrder: "PrevDeckComplete_Sequential",

    convertHighlightsToClozes: true,
    convertBoldTextToClozes: false,
    convertCurlyBracketsToClozes: false,
    convertAnkiClozesToClozes: false,
    clozePatterns: ["==[123;;]answer[;;hint]=="],
    singleLineCardSeparator: "::",
    singleLineReversedCardSeparator: ":::",
    multilineCardSeparator: "?",
    multilineReversedCardSeparator: "??",
    multilineCardEndMarker: "",
    parseClozesInCodeBlocks: false, // Disabled by default
    enableLatexPopover: false,
    codeContextLines: 15, // default code context lines
    clozeContextMode: "single",
    clozeContextPerformanceMode: "off",
    clozeContextSoftLimitLines: DEFAULT_CLOZE_CONTEXT_SOFT_LIMIT_LINES,
    editLaterTag: "#edit-later",
    intervalShowHide: true,
    showOtherClozesVisual: false,
    showOtherAnkiClozeVisual: false,
    showOtherHighlightClozeVisual: false,
    showOtherBoldClozeVisual: false,
    // notes
    enableNoteReviewPaneOnStartup: true,
    tagsToReview: ["#review"],
    noteFoldersToIgnore: ["**/*.excalidraw.md"],
    tagsToIgnore: [],
    openRandomNote: false,
    autoNextNote: false,
    mixDue: 3,
    mixNew: 2,
    mixCardNote: false,
    mixCard: 4,
    mixNote: 1,
    reviewResponseFloatBar: false,
    responseBarPositionPercentage: 5,
    reviewingNoteDirectly: false,
    disableFileMenuReviewOptions: false,
    maxNDaysNotesReviewQueue: 365,
    enableExtracts: true,
    maxNewExtractsPerDay: DEFAULT_MAX_NEW_EXTRACTS,
    maxExtractReviewsPerDay: DEFAULT_MAX_EXTRACT_REVIEWS,
    autoExtractRules: {},

    // UI settings
    showRibbonIcon: true,
    showStatusBar: true,
    collapsedDeckPaths: [], // Legacy field starts empty
    deckCollapseState: {},
    showContextInCards: true,
    showIntervalInReviewButtons: true,
    flashcardHeightPercentage: Platform.isMobile ? 100 : 80,
    flashcardWidthPercentage: Platform.isMobile ? 100 : 40,
    reactFlashcardWidth: 720,
    reactFlashcardHeight: 600,
    reactDeckTreeWidth: 860,
    flashcardEasyText: t("EASY"),
    flashcardGoodText: t("GOOD"),
    flashcardHardText: t("HARD"),
    reviewButtonDelay: 0,
    openViewInNewTab: true,
    enableVolumeKeyControl: true,
    volumeUpMapping: 1, // ReviewResponse.Hard
    volumeDownMapping: 2, // ReviewResponse.Good

    // algorithm
    fsrsSettings: cloneFsrsSettings(DEFAULT_FSRS_SETTINGS),
    weightedMultiplierSettings: { ...DEFAULT_WEIGHTED_MULTIPLIER_SETTINGS },
    noteResponseTexts: { ...DEFAULT_NOTE_RESPONSE_TEXTS },
    loadBalance: true,
    maxLinkFactor: 1.0,

    // storage
    // dataStore: DataStoreName.NOTES,
    dataStore: "NOTES",
    cardCommentOnSameLine: false,

    // logging
    showSchedulingDebugMessages: false,
    showParserDebugMessages: false,
    showRuntimeDebugMessages: false,

    // Track-file settings preserved for legacy migration support.
    dataLocation: DataLocation.PluginFolder,
    customFolder: "",
    maxNewPerDay: -1,
    repeatItems: false,
    trackedNoteToDecks: false,
    untrackWithReviewTag: false,

    // Deck option presets
    deckOptionsPresets: [createDefaultDeckOptionsPreset(DEFAULT_FSRS_SETTINGS)], // Start with a single default preset
    deckPresetAssignment: {}, // Decks use the default preset unless assigned
    progressBarStyle: { ...DEFAULT_PROGRESS_BAR_STYLE },

    // Daily rollover settings
    rolloverHour: 4, // A new day starts at 4 AM

    learnAheadMinutes: 15, // Default learn-ahead window

    // Sidebar tag settings
    sidebarIgnoredTags: [], // Ignore no tags by default
    sidebarTagSortMode: "frequency", // Sort tags by frequency by default
    sidebarCustomTagOrder: [], // Custom order starts empty
    sidebarFilterBarHeight: 80, // Default filter bar height
    hideNoteReviewSidebarFilters: false, // Show the filter header by default
    showSidebarProgressIndicator: true,
    sidebarProgressRingColor: "#a0b0a9", // Default progress ring color
    sidebarProgressIndicatorMode: "ring",
    sidebarProgressRingDirection: "counterclockwise",
    sidebarFilePathTooltipEnabled: true,
    sidebarFilePathTooltipDelayMs: 1000,

    // Status bar defaults
    noteStatusBarColor: "#ff9900", // Default note color
    noteStatusBarAnimation: "Breathing" as StatusBarAnimationStyle, // Default animation
    noteStatusBarPeriod: 2.0, // Two-second animation period
    flashcardStatusBarColor: "#00ccff", // Default flashcard color
    flashcardStatusBarAnimation: "Breathing" as StatusBarAnimationStyle, // Default animation
    flashcardStatusBarPeriod: 2.0, // Two-second animation period
    showStatusBarDueNotification: true, // Enabled by default

    // Timeline Settings
    sidebarTimelineHeight: 300,
    sidebarTimelineOpen: false,
    sidebarTimelineSelectedPath: null,
    showScrollPercentage: true,
    autoExpandTimeline: true,
    timelineAllowUntrackedNotes: false,
    timelineAutoFollowReviewCards: false,
    timelineAutoCommitReviewSelection: true,
    timelineEnableDurationPrefixSyntax: true,

    // License defaults
    licenseKey: "",
    isPro: false,
    licenseInstallationId: "",
    licenseState: null,

    previousRelease: "0.0.0",
};

const DEFAULT_HIGHLIGHT_CLOZE_PATTERN = "==[123;;]answer[;;hint]==";
const DEFAULT_BOLD_CLOZE_PATTERN = "**[123;;]answer[;;hint]**";
const DEFAULT_CURLY_CLOZE_PATTERN = "{{[123;;]answer[;;hint]}}";

function normalizeLicenseFeatures(input: unknown): string[] {
    if (!Array.isArray(input)) {
        return [];
    }

    return Array.from(
        new Set(
            input
                .filter((entry): entry is string => typeof entry === "string")
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0),
        ),
    );
}

export function normalizeLicenseState(value: unknown): LicenseState | null {
    if (!isRecord(value)) {
        return null;
    }

    const licenseKey = getStringProp(value, "licenseKey")?.trim().toUpperCase();
    const deviceId = getStringProp(value, "deviceId")?.trim();
    const token = getStringProp(value, "token")?.trim();
    const plan = getStringProp(value, "plan");
    const features = normalizeLicenseFeatures(getArrayProp(value, "features"));
    const lastVerifiedAt = getNumberProp(value, "lastVerifiedAt");
    const activatedAt = getNumberProp(value, "activatedAt");

    if (
        !licenseKey ||
        !deviceId ||
        !token ||
        plan !== "supporter" ||
        lastVerifiedAt === undefined ||
        activatedAt === undefined
    ) {
        return null;
    }

    return {
        licenseKey,
        deviceId,
        token,
        plan,
        features,
        lastVerifiedAt,
        activatedAt,
    };
}

export function hasSupporterLicenseState(state: LicenseState | null | undefined): boolean {
    if (!state || !state.token) {
        return false;
    }

    return state.plan === "supporter" || state.features.includes("supporter");
}

export function syncDefaultClozePatterns(settings: SRSettings) {
    const existingPatterns = settings.clozePatterns ?? [];
    const customPatterns = existingPatterns.filter(
        (pattern) =>
            pattern !== DEFAULT_HIGHLIGHT_CLOZE_PATTERN &&
            pattern !== DEFAULT_BOLD_CLOZE_PATTERN &&
            pattern !== DEFAULT_CURLY_CLOZE_PATTERN,
    );

    settings.clozePatterns = [...customPatterns];

    if (settings.convertHighlightsToClozes) {
        settings.clozePatterns.push(DEFAULT_HIGHLIGHT_CLOZE_PATTERN);
    }

    if (settings.convertBoldTextToClozes) {
        settings.clozePatterns.push(DEFAULT_BOLD_CLOZE_PATTERN);
    }

    if (settings.convertCurlyBracketsToClozes) {
        settings.clozePatterns.push(DEFAULT_CURLY_CLOZE_PATTERN);
    }
}

export function upgradeSettings(settings: SRSettings) {
    const legacySettings = settings as SRSettings & Record<string, unknown>;

    if (
        settings.randomizeCardOrder != null &&
        settings.flashcardCardOrder == null &&
        settings.flashcardDeckOrder == null
    ) {
        console.debug(`loadPluginData: Upgrading settings: ${String(settings.randomizeCardOrder)}`);
        settings.flashcardCardOrder = settings.randomizeCardOrder
            ? "DueFirstRandom"
            : "DueFirstSequential";
        settings.flashcardDeckOrder = "PrevDeckComplete_Sequential";

        // After the upgrade, we don't need the old attribute any more
        settings.randomizeCardOrder = null;
    }

    syncDefaultClozePatterns(settings);

    if (settings.convertAnkiClozesToClozes === undefined) {
        settings.convertAnkiClozesToClozes = false;
    }

    // Keep the unfinished popover disabled for all vaults until it is production-ready.
    settings.enableLatexPopover = false;

    if (settings.enableNoteCachePersistence === undefined) {
        settings.enableNoteCachePersistence = true;
    }

    if (settings.autoIncrementalSync === undefined) {
        settings.autoIncrementalSync = true;
    }

    if (settings.enableExtracts === undefined) {
        settings.enableExtracts = true;
    }
    settings.autoExtractRules = normalizeAutoExtractRules(settings.autoExtractRules);
    if (
        typeof settings.maxNewExtractsPerDay !== "number" ||
        !Number.isFinite(settings.maxNewExtractsPerDay)
    ) {
        settings.maxNewExtractsPerDay = DEFAULT_MAX_NEW_EXTRACTS;
    } else {
        settings.maxNewExtractsPerDay = Math.max(0, Math.round(settings.maxNewExtractsPerDay));
    }
    if (
        typeof settings.maxExtractReviewsPerDay !== "number" ||
        !Number.isFinite(settings.maxExtractReviewsPerDay)
    ) {
        settings.maxExtractReviewsPerDay = DEFAULT_MAX_EXTRACT_REVIEWS;
    } else {
        settings.maxExtractReviewsPerDay = Math.max(
            0,
            Math.round(settings.maxExtractReviewsPerDay),
        );
    }

    if (
        settings.sidebarProgressRingColor === undefined ||
        settings.sidebarProgressRingColor === "#22c55e"
    ) {
        settings.sidebarProgressRingColor = "#a0b0a9";
    }

    const legacySidebarProgressIndicatorMode = (
        settings as {
            sidebarProgressIndicatorMode?: string;
        }
    ).sidebarProgressIndicatorMode;
    const legacyHiddenSidebarProgressIndicator = legacySidebarProgressIndicatorMode === "hidden";

    if (settings.showSidebarProgressIndicator === undefined) {
        settings.showSidebarProgressIndicator = !legacyHiddenSidebarProgressIndicator;
    }

    if (
        settings.sidebarProgressIndicatorMode !== "ring" &&
        settings.sidebarProgressIndicatorMode !== "percentage"
    ) {
        settings.sidebarProgressIndicatorMode = "ring";
    }

    if (
        settings.sidebarProgressRingDirection !== "clockwise" &&
        settings.sidebarProgressRingDirection !== "counterclockwise"
    ) {
        settings.sidebarProgressRingDirection = "counterclockwise";
    }

    if (settings.sidebarFilePathTooltipEnabled === undefined) {
        settings.sidebarFilePathTooltipEnabled = true;
    }

    if (
        typeof settings.sidebarFilePathTooltipDelayMs !== "number" ||
        !Number.isFinite(settings.sidebarFilePathTooltipDelayMs)
    ) {
        settings.sidebarFilePathTooltipDelayMs = 1000;
    } else {
        settings.sidebarFilePathTooltipDelayMs = Math.max(
            0,
            Math.round(settings.sidebarFilePathTooltipDelayMs),
        );
    }

    if (settings.syncProgressDisplayMode === undefined) {
        settings.syncProgressDisplayMode = DEFAULT_SYNC_PROGRESS_DISPLAY_MODE;
    }

    if (settings.showRuntimeDebugMessages === undefined) {
        settings.showRuntimeDebugMessages = false;
    }

    if (
        typeof settings.sidebarTimelineHeight !== "number" ||
        !Number.isFinite(settings.sidebarTimelineHeight)
    ) {
        settings.sidebarTimelineHeight = 300;
    }

    if (settings.sidebarTimelineOpen === undefined) {
        settings.sidebarTimelineOpen = false;
    }

    if (
        settings.sidebarTimelineSelectedPath !== null &&
        typeof settings.sidebarTimelineSelectedPath !== "string"
    ) {
        settings.sidebarTimelineSelectedPath = null;
    }

    settings.openViewInNewTab = true;
    if (settings.clozeContextMode === undefined) {
        settings.clozeContextMode = "single";
    }

    if (settings.clozeContextPerformanceMode === undefined) {
        settings.clozeContextPerformanceMode = "off";
    }

    if (
        typeof settings.clozeContextSoftLimitLines !== "number" ||
        !Number.isFinite(settings.clozeContextSoftLimitLines)
    ) {
        settings.clozeContextSoftLimitLines = DEFAULT_CLOZE_CONTEXT_SOFT_LIMIT_LINES;
    }
    settings.clozeContextSoftLimitLines = Math.max(
        MIN_CLOZE_CONTEXT_SOFT_LIMIT_LINES,
        Math.min(MAX_CLOZE_CONTEXT_SOFT_LIMIT_LINES, settings.clozeContextSoftLimitLines),
    );
    if (settings.showOtherAnkiClozeVisual === undefined) {
        settings.showOtherAnkiClozeVisual = settings.showOtherClozesVisual ?? false;
    }

    if (settings.showOtherHighlightClozeVisual === undefined) {
        settings.showOtherHighlightClozeVisual = settings.showOtherClozesVisual ?? false;
    }

    if (settings.showOtherBoldClozeVisual === undefined) {
        settings.showOtherBoldClozeVisual = settings.showOtherClozesVisual ?? false;
    }

    syncFsrsSettingsCompatibilityMirror(settings);

    settings.weightedMultiplierSettings = {
        ...DEFAULT_WEIGHTED_MULTIPLIER_SETTINGS,
        ...(isRecord(settings.weightedMultiplierSettings)
            ? settings.weightedMultiplierSettings
            : {}),
    };

    settings.flashcardResponseTexts = {
        again: settings.flashcardResponseTexts?.again ?? DEFAULT_FLASHCARD_RESPONSE_TEXTS.again,
        hard: settings.flashcardResponseTexts?.hard ?? DEFAULT_FLASHCARD_RESPONSE_TEXTS.hard,
        good: settings.flashcardResponseTexts?.good ?? DEFAULT_FLASHCARD_RESPONSE_TEXTS.good,
        easy: settings.flashcardResponseTexts?.easy ?? DEFAULT_FLASHCARD_RESPONSE_TEXTS.easy,
    };

    settings.noteResponseTexts = {
        again: settings.noteResponseTexts?.again ?? DEFAULT_NOTE_RESPONSE_TEXTS.again,
        hard: settings.noteResponseTexts?.hard ?? DEFAULT_NOTE_RESPONSE_TEXTS.hard,
        good: settings.noteResponseTexts?.good ?? DEFAULT_NOTE_RESPONSE_TEXTS.good,
        easy: settings.noteResponseTexts?.easy ?? DEFAULT_NOTE_RESPONSE_TEXTS.easy,
    };

    // Keep data in the plugin folder; the old track-file mode is no longer supported.
    if (settings.dataLocation !== DataLocation.PluginFolder) {
        console.debug(`Upgrading dataLocation from ${settings.dataLocation} to PluginFolder`);
        settings.dataLocation = DataLocation.PluginFolder;
    }

    if (settings.cardBlockID) {
        console.debug("Disabling legacy cardBlockID setting");
        settings.cardBlockID = false;
    }

    // Migrate legacy collapsed deck paths into the keyed collapse-state map.
    if (
        settings.collapsedDeckPaths &&
        settings.collapsedDeckPaths.length > 0 &&
        Object.keys(settings.deckCollapseState || {}).length === 0
    ) {
        if (!settings.deckCollapseState) settings.deckCollapseState = {};
        for (const path of settings.collapsedDeckPaths) {
            settings.deckCollapseState[path] = true;
        }
    }

    const normalizedLicenseState = normalizeLicenseState(settings.licenseState);
    const hasLegacyLicenseArtifacts =
        !!legacySettings.vaultId ||
        !!legacySettings.licenseToken ||
        typeof legacySettings.lastVerification === "number" ||
        legacySettings.isPro === true;

    settings.licenseInstallationId =
        typeof settings.licenseInstallationId === "string" ? settings.licenseInstallationId : "";
    settings.licenseState = normalizedLicenseState;

    if (normalizedLicenseState) {
        settings.licenseKey = normalizedLicenseState.licenseKey;
    } else if (hasLegacyLicenseArtifacts) {
        settings.licenseKey = "";
    }

    settings.isPro = hasSupporterLicenseState(settings.licenseState);

    const currentSettingKeys = new Set(Object.keys(DEFAULT_SETTINGS));
    for (const key of Object.keys(legacySettings)) {
        if (!currentSettingKeys.has(key)) {
            delete legacySettings[key];
        }
    }
}

export class SettingsUtil {
    static isFlashcardTag(settings: SRSettings, tag: string): boolean {
        return SettingsUtil.isTagInList(settings.flashcardTags, tag);
    }

    static isPathInNoteIgnoreFolder(settings: SRSettings, path: string): boolean {
        return settings.noteFoldersToIgnore.some((folder) => pathMatchesPattern(path, folder));
    }

    static isAnyTagANoteReviewTag(settings: SRSettings, tags: string[]): boolean {
        for (const tag of tags) {
            if (
                settings.tagsToReview.some(
                    (tagToReview) => tag === tagToReview || tag.startsWith(tagToReview + "/"),
                )
            ) {
                return true;
            }
        }
        return false;
    }

    static isAnyTagIgnored(settings: SRSettings, tags: string[]): boolean {
        return tags.some((tag) => SettingsUtil.isTagInList(settings.tagsToIgnore, tag));
    }

    static getNoteReviewIgnoreReason(
        settings: SRSettings,
        path: string,
        tags: string[],
    ): NoteReviewIgnoreReason | null {
        if (SettingsUtil.isPathInNoteIgnoreFolder(settings, path)) {
            return "ignored-folder";
        }

        if (SettingsUtil.isAnyTagIgnored(settings, tags)) {
            return "ignored-tag";
        }

        return null;
    }

    // Given a list of tags, return the subset that is in settings.tagsToReview
    static filterForNoteReviewTag(settings: SRSettings, tags: string[]): string[] {
        const result: string[] = [];
        for (const tagToReview of settings.tagsToReview) {
            if (tags.some((tag) => tag === tagToReview || tag.startsWith(tagToReview + "/"))) {
                result.push(tagToReview);
            }
        }
        return result;
    }

    private static isTagInList(tagList: string[], tag: string): boolean {
        for (const tagFromList of tagList) {
            if (tag === tagFromList || tag.startsWith(tagFromList + "/")) {
                return true;
            }
        }
        return false;
    }
}
