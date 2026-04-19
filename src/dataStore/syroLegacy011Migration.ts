import type { DataAdapter } from "obsidian";
import { getStorePath } from "src/dataStore/dataLocation";
import type { FolderTrackingRule } from "src/folderTracking";
import type { SRSettings } from "src/settings";
import { getNumberProp, getStringProp, isRecord, parseJsonUnknown } from "src/util/typeGuards";
import { createDeckOptionsStoreSnapshot } from "./deckOptionsStore";
import { wrapLegacyCardsReviewOverlay } from "./pendingOverlayStore";
import {
    extractLicenseState,
    extractSharedSettings,
    extractTrackingRules,
    hasSyro012MigrationMarker,
    type DailyDeckStats,
    type PersistedDailyState,
    type PersistedDeviceState,
    type PersistedLicenseState,
    type PersistedSharedSettingsState,
    type PersistedTrackingRulesState,
} from "./syroPluginDataStore";
import { createDefaultFileIdentityStoreFile } from "./syroFileIdentityStore";
import type { SyroPersistenceLayout } from "./syroWorkspace";

export type Legacy011SourceKind = "legacy-root" | "device-root" | "local-state";
export type Legacy011SourceName =
    | "data.json"
    | "tracked_files.json"
    | "review_notes.json"
    | "review_commits.json"
    | "tracked_files.review_overlay.json"
    | "note_cache.json"
    | "ob_revlog.csv"
    | "sync-merge-state.json"
    | "cards.review_overlay.json"
    | "local-state/cards.review_overlay.json"
    | "local-state/migration-state.json";

type Legacy011Adapter = Pick<DataAdapter, "exists" | "mkdir" | "read" | "remove" | "rmdir" | "write">;
type Legacy011LogFn = (...args: unknown[]) => void;

export interface Legacy011SourceFileEntry {
    name: Legacy011SourceName;
    path: string;
    kind: Legacy011SourceKind;
    exists: boolean;
    isLegacyPluginData: boolean | null;
}

interface Legacy011StateStoreLike<T> {
    save(value: T): Promise<void>;
}

export interface Legacy011PrimarySourcePaths {
    dataJson: string;
    trackedFilesJson: string;
    reviewNotesJson: string;
    reviewCommitsJson: string;
    trackedFilesReviewOverlayJson: string;
    noteCacheJson: string;
    obRevlogCsv: string;
}

export interface Legacy011CompatibilitySourcePaths {
    syncMergeStateJson: string | null;
    deviceRootCardsReviewOverlayJson: string | null;
    localStateCardsReviewOverlayJson: string | null;
    localStateMigrationStateJson: string | null;
}

interface Legacy011StateRuntimeData {
    settings: SRSettings;
    buryDate: string;
    buryList: string[];
    historyDeck: string | null;
    dailyDeckStats: DailyDeckStats;
    folderTrackingRules: Record<string, FolderTrackingRule>;
}

export interface Legacy011SourceFiles {
    primary: Legacy011PrimarySourcePaths;
    compatibility: Legacy011CompatibilitySourcePaths;
    entries: Legacy011SourceFileEntry[];
    presentEntries: Legacy011SourceFileEntry[];
    legacyEntries: Legacy011SourceFileEntry[];
}

export interface Legacy011WorkspaceMigrationResult {
    sourceFiles: Legacy011SourceFiles;
    backupDir: string | null;
    backedUpFiles: string[];
    copiedFiles: string[];
    createdFiles: string[];
    overlayMigration: {
        sourceKind: Legacy011SourceKind | null;
        sourcePath: string | null;
        targetPath: string | null;
        migrated: boolean;
    };
}

export interface Legacy011StateMigrationResult {
    skipped: boolean;
    skippedBecause: "already-migrated" | "stores-unavailable" | null;
    wroteSplitState: boolean;
    wroteShellMarker: boolean;
    validationError: string | null;
    completedAt: string | null;
}

export interface Legacy011CleanupResult {
    skipped: boolean;
    skippedBecause: "archive-missing" | "shell-not-migrated" | null;
    removedFiles: string[];
    removedDirectories: string[];
    sourceFiles: Legacy011SourceFiles;
}

interface ListLegacy011SourceFilesInput {
    adapter: Legacy011Adapter;
    manifestDir: string;
    settings: SRSettings;
    layout?: SyroPersistenceLayout;
}

interface PrepareLegacy011BackupInput extends ListLegacy011SourceFilesInput {
    deviceNameAtMigration: string;
    now?: () => string;
    sourceFiles?: Legacy011SourceFiles;
}

interface MigrateLegacy011WorkspaceFilesInput extends PrepareLegacy011BackupInput {
    logDebug?: Legacy011LogFn;
}

interface MigrateLegacy011PluginStateInput {
    rawData: unknown;
    data: Legacy011StateRuntimeData;
    sharedSettingsStore: Legacy011StateStoreLike<PersistedSharedSettingsState> | null;
    trackingRulesStore: Legacy011StateStoreLike<PersistedTrackingRulesState> | null;
    dailyStateStore: Legacy011StateStoreLike<PersistedDailyState> | null;
    deviceStateStore: Legacy011StateStoreLike<PersistedDeviceState> | null;
    licenseStateStore: Legacy011StateStoreLike<PersistedLicenseState> | null;
    buildDailyStateSnapshot: () => PersistedDailyState;
    buildCurrentDeviceState: () => PersistedDeviceState;
    validateSplitState: () => Promise<string | null>;
    saveDataShell: (completedAt?: string) => Promise<void>;
    now?: () => string;
}

interface CleanupLegacy011ArchivedFilesInput extends ListLegacy011SourceFilesInput {
    logDebug?: Legacy011LogFn;
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function trimTrailingSlash(path: string): string {
    return normalizePath(path).replace(/\/+$/g, "");
}

function joinPath(...segments: string[]): string {
    if (segments.length === 0) {
        return "";
    }

    const normalizedSegments = segments
        .filter((segment) => segment.length > 0)
        .map((segment, index) => {
            const normalized = normalizePath(segment);
            if (index === 0) {
                return normalized.replace(/\/+$/g, "");
            }
            return normalized.replace(/^\/+/g, "").replace(/\/+$/g, "");
        })
        .filter((segment) => segment.length > 0);

    return normalizedSegments.join("/");
}

function dirname(path: string): string {
    const normalized = trimTrailingSlash(path);
    const slashIndex = normalized.lastIndexOf("/");
    return slashIndex >= 0 ? normalized.substring(0, slashIndex) : "";
}

function replaceFileName(path: string, fileName: string): string {
    const parentDir = dirname(path);
    return parentDir ? joinPath(parentDir, fileName) : fileName;
}

async function ensureDirectory(adapter: Legacy011Adapter, targetDir: string): Promise<void> {
    const normalized = trimTrailingSlash(targetDir);
    if (!normalized) {
        return;
    }

    const parts = normalized.split("/").filter((part) => part.length > 0);
    let current = normalized.startsWith("/") ? "/" : "";
    for (const part of parts) {
        current = current === "/" ? `/${part}` : current ? `${current}/${part}` : part;
        if (!(await adapter.exists(current))) {
            await adapter.mkdir(current);
        }
    }
}

async function copyFileIfMissing(
    adapter: Legacy011Adapter,
    sourcePath: string,
    targetPath: string,
): Promise<boolean> {
    if (!sourcePath || !targetPath) {
        return false;
    }

    if ((await adapter.exists(targetPath)) || !(await adapter.exists(sourcePath))) {
        return false;
    }

    const raw = await adapter.read(sourcePath);
    await ensureDirectory(adapter, dirname(targetPath));
    await adapter.write(targetPath, raw);
    return true;
}

async function writeJson(adapter: Legacy011Adapter, path: string, value: unknown): Promise<void> {
    await ensureDirectory(adapter, dirname(path));
    await adapter.write(path, JSON.stringify(value, null, 2));
}

async function removeFileIfExists(adapter: Legacy011Adapter, targetPath: string): Promise<boolean> {
    if (!targetPath || !(await adapter.exists(targetPath))) {
        return false;
    }

    await adapter.remove(targetPath);
    return true;
}

function createEmptyWorkspaceMigrationResult(
    sourceFiles: Legacy011SourceFiles,
): Legacy011WorkspaceMigrationResult {
    return {
        sourceFiles,
        backupDir: null,
        backedUpFiles: [],
        copiedFiles: [],
        createdFiles: [],
        overlayMigration: {
            sourceKind: null,
            sourcePath: null,
            targetPath: null,
            migrated: false,
        },
    };
}

function buildLegacy011PrimarySourcePaths(
    manifestDir: string,
    settings: SRSettings,
): Legacy011PrimarySourcePaths {
    const legacyCardsPath = normalizePath(getStorePath(manifestDir, settings));
    return {
        dataJson: joinPath(trimTrailingSlash(manifestDir), "data.json"),
        trackedFilesJson: legacyCardsPath,
        reviewNotesJson: replaceFileName(legacyCardsPath, "review_notes.json"),
        reviewCommitsJson: replaceFileName(legacyCardsPath, "review_commits.json"),
        trackedFilesReviewOverlayJson: replaceFileName(
            legacyCardsPath,
            "tracked_files.review_overlay.json",
        ),
        noteCacheJson: replaceFileName(legacyCardsPath, "note_cache.json"),
        obRevlogCsv: joinPath(trimTrailingSlash(manifestDir), "ob_revlog.csv"),
    };
}

function buildLegacy011CompatibilitySourcePaths(
    manifestDir: string,
    layout?: SyroPersistenceLayout,
): Legacy011CompatibilitySourcePaths {
    if (!layout) {
        return {
            syncMergeStateJson: null,
            deviceRootCardsReviewOverlayJson: null,
            localStateCardsReviewOverlayJson: null,
            localStateMigrationStateJson: null,
        };
    }

    const legacyLocalStateRoot = joinPath(trimTrailingSlash(manifestDir), "local-state");
    return {
        syncMergeStateJson: joinPath(layout.deviceRoot, "sync-merge-state.json"),
        deviceRootCardsReviewOverlayJson: joinPath(layout.deviceRoot, "cards.review_overlay.json"),
        localStateCardsReviewOverlayJson: joinPath(
            legacyLocalStateRoot,
            "cards.review_overlay.json",
        ),
        localStateMigrationStateJson: joinPath(legacyLocalStateRoot, "migration-state.json"),
    };
}

async function isLegacy011PluginDataFile(
    adapter: Legacy011Adapter,
    path: string,
): Promise<boolean> {
    if (!(await adapter.exists(path))) {
        return false;
    }

    try {
        const parsed = parseJsonUnknown(await adapter.read(path));
        if (!isRecord(parsed)) {
            return true;
        }

        const version = getNumberProp(parsed, "version");
        const schemaVersion = getStringProp(parsed, "schemaVersion")?.trim();
        if (version === 2 && (schemaVersion === "0.0.12" || hasSyro012MigrationMarker(parsed))) {
            return false;
        }

        return true;
    } catch {
        return true;
    }
}

async function buildLegacy011Entries(
    input: ListLegacy011SourceFilesInput,
): Promise<Legacy011SourceFileEntry[]> {
    const primary = buildLegacy011PrimarySourcePaths(input.manifestDir, input.settings);
    const compatibility = buildLegacy011CompatibilitySourcePaths(input.manifestDir, input.layout);

    const entries: Legacy011SourceFileEntry[] = [
        {
            name: "data.json",
            path: primary.dataJson,
            kind: "legacy-root",
            exists: false,
            isLegacyPluginData: null,
        },
        {
            name: "tracked_files.json",
            path: primary.trackedFilesJson,
            kind: "legacy-root",
            exists: false,
            isLegacyPluginData: null,
        },
        {
            name: "review_notes.json",
            path: primary.reviewNotesJson,
            kind: "legacy-root",
            exists: false,
            isLegacyPluginData: null,
        },
        {
            name: "review_commits.json",
            path: primary.reviewCommitsJson,
            kind: "legacy-root",
            exists: false,
            isLegacyPluginData: null,
        },
        {
            name: "tracked_files.review_overlay.json",
            path: primary.trackedFilesReviewOverlayJson,
            kind: "legacy-root",
            exists: false,
            isLegacyPluginData: null,
        },
        {
            name: "note_cache.json",
            path: primary.noteCacheJson,
            kind: "legacy-root",
            exists: false,
            isLegacyPluginData: null,
        },
        {
            name: "ob_revlog.csv",
            path: primary.obRevlogCsv,
            kind: "legacy-root",
            exists: false,
            isLegacyPluginData: null,
        },
    ];

    if (compatibility.syncMergeStateJson) {
        entries.push({
            name: "sync-merge-state.json",
            path: compatibility.syncMergeStateJson,
            kind: "device-root",
            exists: false,
            isLegacyPluginData: null,
        });
    }
    if (compatibility.deviceRootCardsReviewOverlayJson) {
        entries.push({
            name: "cards.review_overlay.json",
            path: compatibility.deviceRootCardsReviewOverlayJson,
            kind: "device-root",
            exists: false,
            isLegacyPluginData: null,
        });
    }
    if (compatibility.localStateCardsReviewOverlayJson) {
        entries.push({
            name: "local-state/cards.review_overlay.json",
            path: compatibility.localStateCardsReviewOverlayJson,
            kind: "local-state",
            exists: false,
            isLegacyPluginData: null,
        });
    }
    if (compatibility.localStateMigrationStateJson) {
        entries.push({
            name: "local-state/migration-state.json",
            path: compatibility.localStateMigrationStateJson,
            kind: "local-state",
            exists: false,
            isLegacyPluginData: null,
        });
    }

    for (const entry of entries) {
        if (entry.name === "data.json") {
            entry.exists = await input.adapter.exists(entry.path);
            entry.isLegacyPluginData = entry.exists
                ? await isLegacy011PluginDataFile(input.adapter, entry.path)
                : null;
            continue;
        }

        entry.exists = await input.adapter.exists(entry.path);
    }

    return entries;
}

async function migrateLegacy011CardsOverlay(input: {
    adapter: Legacy011Adapter;
    sourcePath: string | null;
    sourceKind: Legacy011SourceKind;
    targetPath: string;
    logDebug?: Legacy011LogFn;
}): Promise<{ migrated: boolean }> {
    if (!input.sourcePath || (await input.adapter.exists(input.targetPath))) {
        return { migrated: false };
    }

    if (!(await input.adapter.exists(input.sourcePath))) {
        return { migrated: false };
    }

    try {
        const wrapped = wrapLegacyCardsReviewOverlay(await input.adapter.read(input.sourcePath));
        if (!wrapped) {
            return { migrated: false };
        }

        await writeJson(input.adapter, input.targetPath, wrapped);
        input.logDebug?.("[SR-PendingOverlay] legacy-migrated", {
            sourceKind: input.sourceKind,
            sourcePath: input.sourcePath,
            targetPath: input.targetPath,
            sections: Object.keys(wrapped.sections),
        });
        return { migrated: true };
    } catch (error) {
        input.logDebug?.("[SR-PendingOverlay] legacy-migration-skipped", {
            sourceKind: input.sourceKind,
            sourcePath: input.sourcePath,
            targetPath: input.targetPath,
            error: String(error),
        });
        return { migrated: false };
    }
}

export async function listLegacy011SourceFiles(
    input: ListLegacy011SourceFilesInput,
): Promise<Legacy011SourceFiles> {
    const primary = buildLegacy011PrimarySourcePaths(input.manifestDir, input.settings);
    const compatibility = buildLegacy011CompatibilitySourcePaths(input.manifestDir, input.layout);
    const entries = await buildLegacy011Entries(input);
    const presentEntries = entries.filter((entry) => entry.exists);
    const legacyEntries = entries.filter((entry) =>
        entry.name === "data.json" ? entry.isLegacyPluginData === true : entry.exists,
    );

    return {
        primary,
        compatibility,
        entries,
        presentEntries,
        legacyEntries,
    };
}

export async function prepareLegacy011Backup(
    input: PrepareLegacy011BackupInput,
): Promise<Legacy011WorkspaceMigrationResult> {
    const sourceFiles =
        input.sourceFiles ??
        (await listLegacy011SourceFiles({
            adapter: input.adapter,
            manifestDir: input.manifestDir,
            settings: input.settings,
            layout: input.layout,
        }));
    const result = createEmptyWorkspaceMigrationResult(sourceFiles);
    if (sourceFiles.legacyEntries.length === 0) {
        return result;
    }

    const createdAt = (input.now ?? (() => new Date().toISOString()))();
    const backupDir = joinPath(
        trimTrailingSlash(input.manifestDir),
        "migration-backups",
        `${createdAt.replace(/:/g, "-")}-before-0.0.12`,
    );
    await ensureDirectory(input.adapter, backupDir);

    for (const entry of sourceFiles.legacyEntries) {
        const targetPath = joinPath(backupDir, entry.name);
        if (await copyFileIfMissing(input.adapter, entry.path, targetPath)) {
            result.backedUpFiles.push(entry.name);
        }
    }

    const deckOptionsSnapshot = createDeckOptionsStoreSnapshot(input.settings);
    await writeJson(
        input.adapter,
        joinPath(backupDir, "deck-options.settings-snapshot.json"),
        deckOptionsSnapshot.state,
    );
    result.backedUpFiles.push("deck-options.settings-snapshot.json");

    await writeJson(input.adapter, joinPath(backupDir, "meta.json"), {
        createdAt,
        reason: "0.0.11-to-0.0.12-migration-backup",
        sourceVersion: "0.0.11",
        targetVersion: "0.0.12",
        deviceNameAtMigration: input.deviceNameAtMigration,
        sourceFiles: result.backedUpFiles,
        notes: "copy-only backup generated before the Syro 0.0.12 layout migration",
    });
    result.backupDir = backupDir;

    return result;
}

export async function migrateLegacy011WorkspaceFiles(
    input: MigrateLegacy011WorkspaceFilesInput,
): Promise<Legacy011WorkspaceMigrationResult> {
    const sourceFiles = await listLegacy011SourceFiles({
        adapter: input.adapter,
        manifestDir: input.manifestDir,
        settings: input.settings,
        layout: input.layout,
    });
    const result = await prepareLegacy011Backup({
        ...input,
        sourceFiles,
    });

    if (
        await copyFileIfMissing(
            input.adapter,
            sourceFiles.primary.trackedFilesJson,
            input.layout.cardsPath,
        )
    ) {
        result.copiedFiles.push(input.layout.cardsPath);
    }
    if (
        await copyFileIfMissing(
            input.adapter,
            sourceFiles.primary.reviewNotesJson,
            input.layout.notesPath,
        )
    ) {
        result.copiedFiles.push(input.layout.notesPath);
    }
    if (
        await copyFileIfMissing(
            input.adapter,
            sourceFiles.primary.reviewCommitsJson,
            input.layout.timelinePath,
        )
    ) {
        result.copiedFiles.push(input.layout.timelinePath);
    }
    if (
        await copyFileIfMissing(input.adapter, sourceFiles.primary.noteCacheJson, input.layout.noteCachePath)
    ) {
        result.copiedFiles.push(input.layout.noteCachePath);
    }

    if (!(await input.adapter.exists(input.layout.deckOptionsPath))) {
        await writeJson(
            input.adapter,
            input.layout.deckOptionsPath,
            createDeckOptionsStoreSnapshot(input.settings).state,
        );
        result.createdFiles.push(input.layout.deckOptionsPath);
    }
    if (!(await input.adapter.exists(input.layout.fileIdentitiesPath))) {
        await writeJson(
            input.adapter,
            input.layout.fileIdentitiesPath,
            createDefaultFileIdentityStoreFile(),
        );
        result.createdFiles.push(input.layout.fileIdentitiesPath);
    }

    const overlayCandidates: Array<[Legacy011SourceKind, string | null]> = [
        ["device-root", sourceFiles.compatibility.deviceRootCardsReviewOverlayJson],
        ["local-state", sourceFiles.compatibility.localStateCardsReviewOverlayJson],
        ["legacy-root", sourceFiles.primary.trackedFilesReviewOverlayJson],
    ];
    for (const [sourceKind, sourcePath] of overlayCandidates) {
        const overlayResult = await migrateLegacy011CardsOverlay({
            adapter: input.adapter,
            sourcePath,
            sourceKind,
            targetPath: input.layout.pendingOverlayPath,
            logDebug: input.logDebug,
        });
        if (overlayResult.migrated) {
            result.overlayMigration = {
                sourceKind,
                sourcePath,
                targetPath: input.layout.pendingOverlayPath,
                migrated: true,
            };
            break;
        }
    }

    return result;
}

export async function migrateLegacy011PluginState(
    input: MigrateLegacy011PluginStateInput,
): Promise<Legacy011StateMigrationResult> {
    if (hasSyro012MigrationMarker(input.rawData)) {
        return {
            skipped: true,
            skippedBecause: "already-migrated",
            wroteSplitState: false,
            wroteShellMarker: false,
            validationError: null,
            completedAt: null,
        };
    }

    if (
        !input.sharedSettingsStore ||
        !input.trackingRulesStore ||
        !input.dailyStateStore ||
        !input.deviceStateStore ||
        !input.licenseStateStore
    ) {
        return {
            skipped: true,
            skippedBecause: "stores-unavailable",
            wroteSplitState: false,
            wroteShellMarker: false,
            validationError: null,
            completedAt: null,
        };
    }

    await input.sharedSettingsStore.save(extractSharedSettings(input.data.settings));
    await input.trackingRulesStore.save(extractTrackingRules(input.data.folderTrackingRules, {}, {}));
    await input.dailyStateStore.save(input.buildDailyStateSnapshot());
    await input.deviceStateStore.save(input.buildCurrentDeviceState());
    await input.licenseStateStore.save(extractLicenseState(input.data.settings));

    const validationError = await input.validateSplitState();
    if (validationError) {
        return {
            skipped: false,
            skippedBecause: null,
            wroteSplitState: true,
            wroteShellMarker: false,
            validationError,
            completedAt: null,
        };
    }

    const completedAt = (input.now ?? (() => new Date().toISOString()))();
    await input.saveDataShell(completedAt);

    return {
        skipped: false,
        skippedBecause: null,
        wroteSplitState: true,
        wroteShellMarker: true,
        validationError: null,
        completedAt,
    };
}

export async function cleanupLegacy011ArchivedFiles(
    input: CleanupLegacy011ArchivedFilesInput,
): Promise<Legacy011CleanupResult> {
    const sourceFiles = await listLegacy011SourceFiles({
        adapter: input.adapter,
        manifestDir: input.manifestDir,
        settings: input.settings,
        layout: input.layout,
    });
    const archiveRoot = joinPath(trimTrailingSlash(input.manifestDir), "migration-backups");
    if (!(await input.adapter.exists(archiveRoot))) {
        return {
            skipped: true,
            skippedBecause: "archive-missing",
            removedFiles: [],
            removedDirectories: [],
            sourceFiles,
        };
    }

    const dataJsonMigrated = !(await isLegacy011PluginDataFile(
        input.adapter,
        sourceFiles.primary.dataJson,
    ));
    if (!dataJsonMigrated) {
        return {
            skipped: true,
            skippedBecause: "shell-not-migrated",
            removedFiles: [],
            removedDirectories: [],
            sourceFiles,
        };
    }

    const removedFiles: string[] = [];
    for (const entry of sourceFiles.legacyEntries) {
        if (entry.name === "data.json") {
            continue;
        }

        if (await removeFileIfExists(input.adapter, entry.path)) {
            removedFiles.push(entry.path);
        }
    }

    const removedDirectories: string[] = [];
    const localStateRoot = joinPath(trimTrailingSlash(input.manifestDir), "local-state");
    if (typeof input.adapter.rmdir === "function" && (await input.adapter.exists(localStateRoot))) {
        try {
            await input.adapter.rmdir(localStateRoot, false);
            removedDirectories.push(localStateRoot);
        } catch (error) {
            input.logDebug?.("[SR-SyroMigration] legacy-local-state-retained", {
                path: localStateRoot,
                error: String(error),
            });
        }
    }

    return {
        skipped: false,
        skippedBecause: null,
        removedFiles,
        removedDirectories,
        sourceFiles,
    };
}
