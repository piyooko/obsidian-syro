import { Iadapter } from "./adapter";
import type { DeckOptionsStorePathConfig } from "./syroWorkspace";
import {
    cloneSyncEntities,
    markSyncEntity,
    parseSyncEntities,
    pruneSyncEntities,
    shouldApplySyncEntity,
    type PersistedSyncEntityState,
} from "./syroSyncMeta";
import {
    normalizeDeckOptionsPresets,
    normalizeFsrsSettings,
    syncFsrsSettingsCompatibilityMirror,
    type DeckOptionsPreset,
    type FsrsSettings,
    type SRSettings,
} from "src/settings";
import { getNumberProp, isRecord, parseJsonUnknown } from "src/util/typeGuards";

const DECK_OPTIONS_STORE_VERSION = 1;

export interface DeckOptionsStoreFile {
    version: number;
    fsrsSettings: FsrsSettings;
    deckOptionsPresets: DeckOptionsPreset[];
    deckPresetAssignment: Record<string, number>;
    syncEntities?: Record<string, PersistedSyncEntityState>;
}

export interface DeckOptionsStoreSnapshot {
    state: DeckOptionsStoreFile;
    serialized: string;
}

function normalizeDeckPresetAssignment(
    value: unknown,
    presetCount: number,
): Record<string, number> {
    if (!isRecord(value)) {
        return {};
    }

    const assignment: Record<string, number> = {};
    for (const [deckPath, presetIndex] of Object.entries(value)) {
        if (
            typeof deckPath !== "string" ||
            !deckPath ||
            typeof presetIndex !== "number" ||
            !Number.isFinite(presetIndex)
        ) {
            continue;
        }

        const normalizedIndex = Math.trunc(presetIndex);
        if (normalizedIndex <= 0 || normalizedIndex >= presetCount) {
            continue;
        }

        assignment[deckPath] = normalizedIndex;
    }

    return assignment;
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
        normalizedSettings.deckOptionsPresets.length,
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
                await this.saveFromSettings(settings);
                return;
            }

            const raw = await adapter.read(this.dataPath);
            if (!raw) {
                this.syncEntities = {};
                await this.saveFromSettings(settings);
                return;
            }
            this.lastSerialized = raw;

            const parsed = parseJsonUnknown(raw);
            if (
                !isRecord(parsed) ||
                getNumberProp(parsed, "version") !== DECK_OPTIONS_STORE_VERSION
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
                deckPresetAssignment: parsed.deckPresetAssignment as Record<string, number>,
            });
            this.syncEntities = parseSyncEntities(parsed["syncEntities"]);
        } catch (error) {
            this.lastLoadError = `[SR-DeckOptions] Failed to load deck options store: ${String(error)}`;
            console.warn("[SR-DeckOptions] Failed to load deck options store:", error);
            this.syncEntities = {};
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
        return snapshot;
    }

    setReadOnly(reason: string | null): void {
        this.syncReadOnlyReason = reason;
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
