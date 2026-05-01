import { Iadapter } from "./adapter";
import type { DeckOptionsStorePathConfig } from "./syroWorkspace";
import {
    cloneSyncEntities,
    compareIsoTime,
    markSyncEntity,
    parseSyncEntities,
    pruneSyncEntities,
    shouldApplySyncEntity,
    type PersistedSyncEntityState,
} from "./syroSyncMeta";
import {
    DEFAULT_DECK_OPTIONS_PRESET_UUID,
    normalizeDeckOptionsPreset,
    normalizeDeckOptionsPresets,
    normalizeDeckPresetAssignment,
    normalizeFsrsSettings,
    syncFsrsSettingsCompatibilityMirror,
    type DeckOptionsPreset,
    type FsrsSettings,
    type SRSettings,
} from "src/settings";
import { isPathInsideFolder, renamePathPrefix } from "src/folderTracking";
import { getNumberProp, isRecord, parseJsonUnknown } from "src/util/typeGuards";

const LEGACY_DECK_OPTIONS_STORE_VERSION = 1;
const DECK_OPTIONS_STORE_VERSION = 2;

export const DECK_OPTIONS_PRESET_ENTITY_TYPE = "deck-options-preset";
export const DECK_OPTIONS_ASSIGNMENT_ENTITY_TYPE = "deck-options-assignment";

export interface DeckOptionsStoreFile {
    version: number;
    fsrsSettings: FsrsSettings;
    deckOptionsPresets: DeckOptionsPreset[];
    deckPresetAssignment: Record<string, string>;
    syncEntities?: Record<string, PersistedSyncEntityState>;
}

export interface DeckOptionsStoreSnapshot {
    state: DeckOptionsStoreFile;
    serialized: string;
}

export interface DeckOptionsAssignmentPayload {
    deckPath: string;
    presetUuid?: string;
}

export interface DeckOptionsPresetRemovalPayload {
    uuid: string;
}

export interface DeckOptionsStateDiff {
    presetUpserts: DeckOptionsPreset[];
    presetRemovals: Array<{ presetUuid: string }>;
    assignmentUpserts: DeckOptionsAssignmentPayload[];
    assignmentRemovals: Array<{ deckPath: string }>;
}

export interface DeckOptionsAssignmentPathMutationResult {
    deckPresetAssignment: Record<string, string>;
    affectedDeckPaths: string[];
}

export function normalizeDeckOptionsAssignmentPathKey(path: string): string {
    return String(path ?? "")
        .replace(/\\/g, "/")
        .replace(/\.md$/i, "");
}

export function buildDeckOptionsPresetTargetUuid(presetUuid: string): string {
    return `deck-preset:${presetUuid}`;
}

export function buildDeckOptionsAssignmentTargetUuid(deckPath: string): string {
    return `deck-assignment:${deckPath}`;
}

export function parseDeckOptionsPresetUuidFromTarget(targetUuid: string): string {
    return targetUuid.startsWith("deck-preset:") ? targetUuid.slice("deck-preset:".length) : "";
}

export function parseDeckOptionsAssignmentPathFromTarget(targetUuid: string): string {
    return targetUuid.startsWith("deck-assignment:")
        ? targetUuid.slice("deck-assignment:".length)
        : "";
}

function normalizeDeckOptionsState(
    settings: Pick<SRSettings, "fsrsSettings" | "deckOptionsPresets" | "deckPresetAssignment">,
    syncEntities: Record<string, PersistedSyncEntityState> = {},
): DeckOptionsStoreFile {
    const normalizedSettings = {
        ...settings,
        fsrsSettings: normalizeFsrsSettings(settings.fsrsSettings),
    } as Pick<SRSettings, "fsrsSettings" | "deckOptionsPresets" | "deckPresetAssignment"> &
        SRSettings;
    normalizedSettings.deckOptionsPresets = normalizeDeckOptionsPresets(
        settings.deckOptionsPresets,
        normalizedSettings.fsrsSettings,
    );
    normalizedSettings.deckPresetAssignment = normalizeDeckPresetAssignment(
        settings.deckPresetAssignment,
        normalizedSettings.deckOptionsPresets,
    );
    syncFsrsSettingsCompatibilityMirror(normalizedSettings);

    return {
        version: DECK_OPTIONS_STORE_VERSION,
        fsrsSettings: normalizedSettings.fsrsSettings,
        deckOptionsPresets: normalizedSettings.deckOptionsPresets,
        deckPresetAssignment: normalizedSettings.deckPresetAssignment,
        syncEntities: cloneSyncEntities(syncEntities),
    };
}

function serializeDeckOptionsPresetForComparison(preset: DeckOptionsPreset): string {
    return JSON.stringify({
        uuid: preset.uuid,
        createdAt: preset.createdAt,
        name: preset.name,
        autoAdvance: preset.autoAdvance,
        autoAdvanceSeconds: preset.autoAdvanceSeconds,
        showProgressBar: preset.showProgressBar,
        maxNewCards: preset.maxNewCards,
        maxReviews: preset.maxReviews,
        maxNewExtracts: preset.maxNewExtracts,
        maxExtractReviews: preset.maxExtractReviews,
        cardOrder: preset.cardOrder,
        reviewQueueMode: preset.reviewQueueMode,
        interleaveFlashcardCount: preset.interleaveFlashcardCount,
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

export function diffDeckOptionsState(
    previousState: Pick<SRSettings, "fsrsSettings" | "deckOptionsPresets" | "deckPresetAssignment">,
    nextState: Pick<SRSettings, "fsrsSettings" | "deckOptionsPresets" | "deckPresetAssignment">,
): DeckOptionsStateDiff {
    const previous = normalizeDeckOptionsState(previousState);
    const next = normalizeDeckOptionsState(nextState);
    const previousPresets = new Map(
        previous.deckOptionsPresets.map((preset) => [preset.uuid, preset] as const),
    );
    const nextPresets = new Map(
        next.deckOptionsPresets.map((preset) => [preset.uuid, preset] as const),
    );
    const presetUpserts: DeckOptionsPreset[] = [];
    const presetRemovals: Array<{ presetUuid: string }> = [];
    const assignmentUpserts: DeckOptionsAssignmentPayload[] = [];
    const assignmentRemovals: Array<{ deckPath: string }> = [];

    for (const preset of next.deckOptionsPresets) {
        const previousPreset = previousPresets.get(preset.uuid);
        if (
            !previousPreset ||
            serializeDeckOptionsPresetForComparison(previousPreset) !==
                serializeDeckOptionsPresetForComparison(preset)
        ) {
            presetUpserts.push(preset);
        }
    }

    for (const previousPreset of previous.deckOptionsPresets) {
        if (
            !nextPresets.has(previousPreset.uuid) &&
            previousPreset.uuid !== DEFAULT_DECK_OPTIONS_PRESET_UUID
        ) {
            presetRemovals.push({ presetUuid: previousPreset.uuid });
        }
    }

    for (const [deckPath, presetUuid] of Object.entries(next.deckPresetAssignment)) {
        if (previous.deckPresetAssignment[deckPath] !== presetUuid) {
            assignmentUpserts.push({ deckPath, presetUuid });
        }
    }

    for (const deckPath of Object.keys(previous.deckPresetAssignment)) {
        if (!(deckPath in next.deckPresetAssignment)) {
            assignmentRemovals.push({ deckPath });
        }
    }

    return {
        presetUpserts,
        presetRemovals,
        assignmentUpserts,
        assignmentRemovals,
    };
}

export function createDeckOptionsStoreSnapshot(
    settings: Pick<SRSettings, "fsrsSettings" | "deckOptionsPresets" | "deckPresetAssignment">,
    syncEntities: Record<string, PersistedSyncEntityState> = {},
): DeckOptionsStoreSnapshot {
    const state = normalizeDeckOptionsState(settings, syncEntities);
    return {
        state,
        serialized: JSON.stringify(state, null, 2),
    };
}

export function applyDeckOptionsStateToSettings(
    settings: SRSettings,
    state: Pick<SRSettings, "fsrsSettings" | "deckOptionsPresets" | "deckPresetAssignment">,
): void {
    const normalizedState = normalizeDeckOptionsState(state);
    settings.fsrsSettings = normalizedState.fsrsSettings;
    settings.deckOptionsPresets = normalizedState.deckOptionsPresets;
    settings.deckPresetAssignment = normalizedState.deckPresetAssignment;
    syncFsrsSettingsCompatibilityMirror(settings);
}

export function upsertDeckOptionsPresetInSettings(
    settings: SRSettings,
    preset: DeckOptionsPreset,
): void {
    const normalizedPreset = normalizeDeckOptionsPreset(preset, settings.fsrsSettings);
    const nextPresets = settings.deckOptionsPresets.filter(
        (entry) => entry.uuid !== normalizedPreset.uuid,
    );
    nextPresets.push(normalizedPreset);
    applyDeckOptionsStateToSettings(settings, {
        fsrsSettings: settings.fsrsSettings,
        deckOptionsPresets: nextPresets,
        deckPresetAssignment: settings.deckPresetAssignment,
    });
}

export function removeDeckOptionsPresetFromSettings(
    settings: SRSettings,
    presetUuid: string,
): void {
    if (!presetUuid || presetUuid === DEFAULT_DECK_OPTIONS_PRESET_UUID) {
        return;
    }

    const nextPresets = settings.deckOptionsPresets.filter((preset) => preset.uuid !== presetUuid);
    const nextAssignment = Object.fromEntries(
        Object.entries(settings.deckPresetAssignment).filter(([, value]) => value !== presetUuid),
    );

    applyDeckOptionsStateToSettings(settings, {
        fsrsSettings: settings.fsrsSettings,
        deckOptionsPresets: nextPresets,
        deckPresetAssignment: nextAssignment,
    });
}

export function assignDeckOptionsPresetToDeck(
    settings: SRSettings,
    deckPath: string,
    presetUuid?: string | null,
): void {
    if (!deckPath) {
        return;
    }

    const nextAssignment = { ...settings.deckPresetAssignment };
    if (!presetUuid || presetUuid === DEFAULT_DECK_OPTIONS_PRESET_UUID) {
        delete nextAssignment[deckPath];
    } else {
        const presetExists = settings.deckOptionsPresets.some(
            (preset) => preset.uuid === presetUuid,
        );
        if (!presetExists) {
            delete nextAssignment[deckPath];
        } else {
            nextAssignment[deckPath] = presetUuid;
        }
    }

    applyDeckOptionsStateToSettings(settings, {
        fsrsSettings: settings.fsrsSettings,
        deckOptionsPresets: settings.deckOptionsPresets,
        deckPresetAssignment: nextAssignment,
    });
}

export function renameDeckOptionsAssignmentPaths(
    deckPresetAssignment: Record<string, string>,
    oldPath: string,
    newPath: string,
): DeckOptionsAssignmentPathMutationResult {
    const normalizedOldPath = normalizeDeckOptionsAssignmentPathKey(oldPath);
    const normalizedNewPath = normalizeDeckOptionsAssignmentPathKey(newPath);
    const nextAssignment: Record<string, string> = {};
    const affectedDeckPaths = new Set<string>();

    for (const [deckPath, presetUuid] of Object.entries(deckPresetAssignment)) {
        const nextDeckPath = renamePathPrefix(deckPath, normalizedOldPath, normalizedNewPath);
        if (nextDeckPath !== deckPath) {
            affectedDeckPaths.add(deckPath);
            affectedDeckPaths.add(nextDeckPath);
        }
        if (
            nextDeckPath !== deckPath &&
            Object.prototype.hasOwnProperty.call(deckPresetAssignment, nextDeckPath)
        ) {
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(nextAssignment, nextDeckPath)) {
            continue;
        }
        nextAssignment[nextDeckPath] = presetUuid;
    }

    return {
        deckPresetAssignment: nextAssignment,
        affectedDeckPaths: [...affectedDeckPaths].sort((left, right) => left.localeCompare(right)),
    };
}

export function removeDeckOptionsAssignmentPaths(
    deckPresetAssignment: Record<string, string>,
    deletedPath: string,
): DeckOptionsAssignmentPathMutationResult {
    const normalizedDeletedPath = normalizeDeckOptionsAssignmentPathKey(deletedPath);
    const nextAssignment: Record<string, string> = {};
    const affectedDeckPaths = new Set<string>();

    for (const [deckPath, presetUuid] of Object.entries(deckPresetAssignment)) {
        if (isPathInsideFolder(normalizedDeletedPath, deckPath)) {
            affectedDeckPaths.add(deckPath);
            continue;
        }
        nextAssignment[deckPath] = presetUuid;
    }

    return {
        deckPresetAssignment: nextAssignment,
        affectedDeckPaths: [...affectedDeckPaths].sort((left, right) => left.localeCompare(right)),
    };
}

export function createPersistableSettingsSnapshot(
    settings: SRSettings,
): Partial<SRSettings> & Record<string, unknown> {
    const persistedSettings = { ...settings } as Partial<SRSettings> & Record<string, unknown>;
    delete persistedSettings.fsrsSettings;
    delete persistedSettings.deckOptionsPresets;
    delete persistedSettings.deckPresetAssignment;
    return persistedSettings;
}

export class DeckOptionsStore {
    public lastLoadError: string | null = null;
    private dataPath: string;
    private lastSerialized: string | null = null;
    private syncReadOnlyReason: string | null = null;
    private syncEntities: Record<string, PersistedSyncEntityState> = {};
    private persistedState: DeckOptionsStoreFile | null = null;

    constructor(pathOrConfig: string | DeckOptionsStorePathConfig) {
        this.dataPath =
            typeof pathOrConfig === "string" ? pathOrConfig : pathOrConfig.deckOptionsPath;
    }

    async loadIntoSettings(settings: SRSettings): Promise<void> {
        this.lastLoadError = null;
        const adapter = Iadapter.instance.adapter;

        try {
            if (!(await adapter.exists(this.dataPath))) {
                this.syncEntities = {};
                const snapshot = await this.saveFromSettings(settings);
                this.persistedState = snapshot.state;
                return;
            }

            const raw = await adapter.read(this.dataPath);
            if (!raw) {
                this.syncEntities = {};
                const snapshot = await this.saveFromSettings(settings);
                this.persistedState = snapshot.state;
                return;
            }
            this.lastSerialized = raw;

            const parsed = parseJsonUnknown(raw);
            const version = isRecord(parsed) ? getNumberProp(parsed, "version") : undefined;
            if (
                !isRecord(parsed) ||
                (version !== LEGACY_DECK_OPTIONS_STORE_VERSION &&
                    version !== DECK_OPTIONS_STORE_VERSION)
            ) {
                this.lastLoadError = "[SR-DeckOptions] Invalid deck-options.json schema.";
                console.warn(
                    "[SR-DeckOptions] Invalid deck-options.json schema, keeping in-memory settings.",
                );
                return;
            }

            applyDeckOptionsStateToSettings(settings, {
                fsrsSettings: parsed.fsrsSettings as FsrsSettings,
                deckOptionsPresets: parsed.deckOptionsPresets as DeckOptionsPreset[],
                deckPresetAssignment: parsed.deckPresetAssignment as Record<string, string>,
            });
            this.syncEntities = parseSyncEntities(parsed["syncEntities"]);
            this.persistedState = createDeckOptionsStoreSnapshot(settings, this.syncEntities).state;
        } catch (error) {
            this.lastLoadError = `[SR-DeckOptions] Failed to load deck options store: ${String(error)}`;
            console.warn("[SR-DeckOptions] Failed to load deck options store:", error);
            this.syncEntities = {};
            this.persistedState = null;
        }
    }

    async hasSerializedStateChanged(serialized: string): Promise<boolean> {
        if (this.lastSerialized !== null) {
            return this.lastSerialized !== serialized;
        }

        const adapter = Iadapter.instance.adapter;
        if (!(await adapter.exists(this.dataPath))) {
            return true;
        }

        const raw = await adapter.read(this.dataPath);
        this.lastSerialized = raw;
        return raw !== serialized;
    }

    async saveSerialized(serialized: string): Promise<void> {
        if (this.syncReadOnlyReason) {
            return;
        }
        if (this.lastSerialized === serialized) {
            return;
        }

        await Iadapter.instance.adapter.write(this.dataPath, serialized);
        this.lastSerialized = serialized;
    }

    async saveFromSettings(settings: SRSettings): Promise<DeckOptionsStoreSnapshot> {
        const snapshot = createDeckOptionsStoreSnapshot(settings, this.syncEntities);
        await this.saveSerialized(snapshot.serialized);
        this.persistedState = snapshot.state;
        return snapshot;
    }

    setReadOnly(reason: string | null): void {
        this.syncReadOnlyReason = reason;
    }

    getPersistedState(): DeckOptionsStoreFile | null {
        return this.persistedState
            ? createDeckOptionsStoreSnapshot(this.persistedState, this.persistedState.syncEntities)
                  .state
            : null;
    }

    rememberPersistedState(
        state: Pick<SRSettings, "fsrsSettings" | "deckOptionsPresets" | "deckPresetAssignment">,
    ): DeckOptionsStoreFile {
        const snapshot = createDeckOptionsStoreSnapshot(state, this.syncEntities);
        this.persistedState = snapshot.state;
        return snapshot.state;
    }

    getSyncEntities(): Record<string, PersistedSyncEntityState> {
        return cloneSyncEntities(this.syncEntities);
    }

    getSyncEntity(targetUuid: string): PersistedSyncEntityState | null {
        const entry = this.syncEntities[targetUuid];
        return entry ? { ...entry } : null;
    }

    shouldApplySyncEntity(
        targetUuid: string,
        updatedAt: string,
        options: {
            deleted?: boolean;
            preferDeleteOnEqual?: boolean;
        } = {},
    ): boolean {
        if (!options.preferDeleteOnEqual) {
            return shouldApplySyncEntity(this.syncEntities, targetUuid, updatedAt);
        }

        const current = this.syncEntities[targetUuid];
        if (!current) {
            return true;
        }

        const compare = compareIsoTime(current.updatedAt, updatedAt);
        if (compare < 0) {
            return true;
        }
        if (compare > 0) {
            return false;
        }

        return options.deleted === true && current.deleted !== true;
    }

    markSyncEntity(
        input: {
            targetUuid: string;
            updatedAt: string;
            deleted: boolean;
            entityType: string;
            pathHint?: string;
        },
        options: {
            preferDeleteOnEqual?: boolean;
        } = {},
    ): boolean {
        if (!options.preferDeleteOnEqual) {
            return markSyncEntity(this.syncEntities, input);
        }

        const current = this.syncEntities[input.targetUuid];
        if (current) {
            const compare = compareIsoTime(current.updatedAt, input.updatedAt);
            if (compare > 0) {
                return false;
            }
            if (compare === 0 && (!input.deleted || current.deleted === input.deleted)) {
                return false;
            }
        }

        this.syncEntities[input.targetUuid] = {
            updatedAt: input.updatedAt,
            deleted: input.deleted,
            entityType: input.entityType,
            ...(input.pathHint ? { pathHint: input.pathHint } : {}),
        };
        return true;
    }

    pruneSyncEntities(retentionMs: number): boolean {
        return pruneSyncEntities(this.syncEntities, retentionMs);
    }
}
