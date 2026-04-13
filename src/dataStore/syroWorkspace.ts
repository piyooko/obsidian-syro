import { App, DataAdapter, Platform } from "obsidian";
import { createDeckOptionsStoreSnapshot } from "./deckOptionsStore";
import { getStorePath } from "src/dataStore/dataLocation";
import type { SRSettings } from "src/settings";
import {
    getArrayProp,
    getNumberProp,
    getStringProp,
    isRecord,
    parseJsonUnknown,
} from "src/util/typeGuards";

const SYRO_DEVICE_FILE_VERSION = 1;
const SYRO_CURRENT_DEVICE_STATE_VERSION = 1;
const SYRO_MIGRATION_STATE_VERSION = 1;
const ACTIVE_DEVICE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface CardsStorePathConfig {
    cardsPath: string;
    cardsOverlayPath?: string;
    auxiliaryDataDir?: string;
}

export interface NoteReviewStorePathConfig {
    notesPath: string;
}

export interface ReviewCommitStorePathConfig {
    timelinePath: string;
}

export interface DeckOptionsStorePathConfig {
    deckOptionsPath: string;
}

export interface SyroDeviceMetadata {
    version: number;
    deviceId: string;
    deviceName: string;
    shortDeviceId: string;
    createdAt: string;
    updatedAt: string;
    lastSeenAt: string;
    baselineFromDeviceId: string | null;
    baselineBuiltAt: string | null;
    importedSessionIds: string[];
    importedSessionRetentionUntil: Record<string, string>;
}

interface PersistedCurrentDeviceState {
    version: number;
    deviceId: string;
    deviceFolderName: string;
}

interface SyroMigrationStateFile {
    version: number;
    completedAt: string;
    sourceVersion: string;
    targetVersion: string;
    hasLegacyInputs: boolean;
}

export type SyroStartupDecision =
    | "ready"
    | "baseline-required"
    | "rebuild-required"
    | "read-only";

export interface SyroBaselineCandidate {
    deviceId: string;
    deviceName: string;
    shortDeviceId: string;
    deviceFolderName: string;
    lastSeenAt: string;
    baselineFromDeviceId: string | null;
    baselineBuiltAt: string | null;
}

export interface SyroBaselineRequest {
    deviceName: string;
    sourceDeviceId: string;
}

export interface SyroRebuildRequest {
    sourceDeviceId: string;
    deviceName?: string;
}

export interface SyroMigrationValidationResult {
    ok: boolean;
    reason: string | null;
    validatedPaths: string[];
}

export interface SyroWorkspaceInitializeResult {
    startupDecision: SyroStartupDecision;
    layout: SyroPersistenceLayout;
    candidates: SyroBaselineCandidate[];
    defaultDeviceName: string;
    recommendedSourceDeviceId: string | null;
    readOnlyReason: string | null;
    migrationValidation: SyroMigrationValidationResult | null;
}

export interface SyroPersistenceLayout {
    syncRoot: string;
    devicesRoot: string;
    sessionsRoot: string;
    sessionsArchiveRoot: string;
    deviceRoot: string;
    deviceMetaPath: string;
    cardsPath: string;
    notesPath: string;
    timelinePath: string;
    deckOptionsPath: string;
    localRoot: string;
    localDeviceRoot: string;
    cardsOverlayPath: string;
    activeSessionBufferPath: string;
    mergeStatePath: string;
    migrationStatePath: string;
    noteCachePath: string;
    device: SyroDeviceMetadata;
}

type FileBackedAdapter = Pick<DataAdapter, "exists" | "mkdir" | "read" | "write"> & {
    basePath?: string;
    list?: (path: string) => Promise<{ files: string[]; folders: string[] }>;
};

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

function createDeviceId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        return [
            hex.slice(0, 8),
            hex.slice(8, 12),
            hex.slice(12, 16),
            hex.slice(16, 20),
            hex.slice(20, 32),
        ].join("-");
    }

    return `syro-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createShortDeviceId(deviceId: string): string {
    const collapsed = deviceId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    return collapsed.slice(0, 4) || Math.random().toString(36).slice(2, 6);
}

function sanitizeDeviceName(deviceName: string): string {
    const safeName = deviceName
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+/g, "")
        .replace(/-+$/g, "");

    return safeName || "Device";
}

function createDefaultDeviceName(): string {
    return Platform.isMobile ? "Mobile" : "Desktop";
}

function createDeviceFolderName(deviceName: string, shortDeviceId: string): string {
    return `${sanitizeDeviceName(deviceName)}--${shortDeviceId}`;
}

function parseImportedSessionIds(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        : [];
}

function parseStringMap(value: unknown): Record<string, string> {
    if (!isRecord(value)) {
        return {};
    }

    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof key !== "string" || key.length === 0) {
            continue;
        }
        if (typeof entry !== "string" || entry.length === 0) {
            continue;
        }
        result[key] = entry;
    }

    return result;
}

export function parseDeviceMetadata(value: unknown): SyroDeviceMetadata | null {
    if (!isRecord(value)) {
        return null;
    }

    const version = getNumberProp(value, "version");
    const deviceId = getStringProp(value, "deviceId")?.trim();
    const deviceName = getStringProp(value, "deviceName")?.trim();
    const shortDeviceId = getStringProp(value, "shortDeviceId")?.trim();
    const createdAt = getStringProp(value, "createdAt")?.trim();
    const updatedAt = getStringProp(value, "updatedAt")?.trim();
    const lastSeenAt = getStringProp(value, "lastSeenAt")?.trim();

    if (
        version !== SYRO_DEVICE_FILE_VERSION ||
        !deviceId ||
        !deviceName ||
        !shortDeviceId ||
        !createdAt ||
        !updatedAt ||
        !lastSeenAt
    ) {
        return null;
    }

    return {
        version,
        deviceId,
        deviceName,
        shortDeviceId,
        createdAt,
        updatedAt,
        lastSeenAt,
        baselineFromDeviceId: getStringProp(value, "baselineFromDeviceId") ?? null,
        baselineBuiltAt: getStringProp(value, "baselineBuiltAt") ?? null,
        importedSessionIds: parseImportedSessionIds(getArrayProp(value, "importedSessionIds")),
        importedSessionRetentionUntil: parseStringMap(value["importedSessionRetentionUntil"]),
    };
}

function parsePersistedCurrentDeviceState(value: unknown): PersistedCurrentDeviceState | null {
    if (!isRecord(value)) {
        return null;
    }

    const version = getNumberProp(value, "version");
    const deviceId = getStringProp(value, "deviceId")?.trim();
    const deviceFolderName = getStringProp(value, "deviceFolderName")?.trim();

    if (version !== SYRO_CURRENT_DEVICE_STATE_VERSION || !deviceId || !deviceFolderName) {
        return null;
    }

    return {
        version,
        deviceId,
        deviceFolderName,
    };
}

async function ensureDirectory(adapter: FileBackedAdapter, targetDir: string): Promise<void> {
    const normalizedDir = trimTrailingSlash(targetDir);
    if (!normalizedDir || normalizedDir === ".") {
        return;
    }

    const parts = normalizedDir.split("/").filter((part) => part.length > 0);
    let current = normalizedDir.startsWith("/") ? "/" : "";
    for (const part of parts) {
        current = current === "/" ? `${current}${part}` : current ? `${current}/${part}` : part;
        if (await adapter.exists(current)) {
            continue;
        }
        await adapter.mkdir(current);
    }
}

async function copyFileIfMissing(
    adapter: FileBackedAdapter,
    sourcePath: string,
    targetPath: string,
): Promise<void> {
    if (sourcePath === targetPath) {
        return;
    }

    if (!(await adapter.exists(sourcePath)) || (await adapter.exists(targetPath))) {
        return;
    }

    const data = await adapter.read(sourcePath);
    await ensureDirectory(adapter, dirname(targetPath));
    await adapter.write(targetPath, data);
}

async function copyFile(
    adapter: FileBackedAdapter,
    sourcePath: string,
    targetPath: string,
): Promise<void> {
    if (sourcePath === targetPath || !(await adapter.exists(sourcePath))) {
        return;
    }

    const data = await adapter.read(sourcePath);
    await ensureDirectory(adapter, dirname(targetPath));
    await adapter.write(targetPath, data);
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function validateCardsStoreFile(raw: string): boolean {
    const parsed = parseJsonUnknown(raw);
    if (!isRecord(parsed)) {
        return false;
    }

    const items = parsed["items"];
    const trackedFiles = parsed["trackedFiles"];
    const fileOrder = parsed["fileOrder"];

    return (
        (items === undefined || Array.isArray(items)) &&
        (trackedFiles === undefined || Array.isArray(trackedFiles) || isObjectLike(trackedFiles)) &&
        (fileOrder === undefined || Array.isArray(fileOrder))
    );
}

function validateNotesStoreFile(raw: string): boolean {
    const parsed = parseJsonUnknown(raw);
    return (
        isRecord(parsed) &&
        getNumberProp(parsed, "version") === 1 &&
        typeof parsed["nextItemId"] === "number" &&
        isRecord(parsed["items"])
    );
}

function validateTimelineStoreFile(raw: string): boolean {
    const parsed = parseJsonUnknown(raw);
    return isObjectLike(parsed);
}

function validateDeckOptionsStoreFile(raw: string): boolean {
    const parsed = parseJsonUnknown(raw);
    return (
        isRecord(parsed) &&
        getNumberProp(parsed, "version") === 1 &&
        isObjectLike(parsed["fsrsSettings"]) &&
        Array.isArray(parsed["deckOptionsPresets"]) &&
        isObjectLike(parsed["deckPresetAssignment"])
    );
}

type ExistingCurrentDeviceResult =
    | {
          status: "missing";
      }
    | {
          status: "valid";
          metadata: SyroDeviceMetadata;
          deviceFolderName: string;
      }
    | {
          status: "invalid";
          reason: string;
          persisted: PersistedCurrentDeviceState;
      };

export class SyroWorkspace {
    private readonly adapter: FileBackedAdapter;

    constructor(
        private readonly app: App,
        private readonly manifestDir: string,
        private readonly settings: SRSettings,
    ) {
        this.adapter = this.app.vault.adapter as FileBackedAdapter;
    }

    async initialize(): Promise<SyroWorkspaceInitializeResult> {
        const roots = this.buildRootPaths();

        await ensureDirectory(this.adapter, roots.syncRoot);
        await ensureDirectory(this.adapter, roots.devicesRoot);
        await ensureDirectory(this.adapter, roots.sessionsRoot);
        await ensureDirectory(this.adapter, roots.sessionsArchiveRoot);
        await ensureDirectory(this.adapter, roots.localRoot);

        const persistedCurrentDevice = this.loadPersistedCurrentDeviceState();
        const existingCurrentDevice = await this.loadExistingCurrentDevice(persistedCurrentDevice);
        const candidates = await this.listBaselineCandidates();
        const hasLegacyInputs = await this.hasLegacyInputs();
        const defaultDeviceName =
            existingCurrentDevice.status === "valid"
                ? existingCurrentDevice.metadata.deviceName
                : createDefaultDeviceName();

        if (existingCurrentDevice.status === "invalid") {
            return {
                startupDecision: "read-only",
                layout: this.createProvisionalLayout(
                    roots,
                    createDefaultDeviceName(),
                    existingCurrentDevice.persisted.deviceId,
                    existingCurrentDevice.persisted.deviceFolderName,
                ),
                candidates,
                defaultDeviceName,
                recommendedSourceDeviceId: this.pickRecommendedSourceDeviceId(candidates, null),
                readOnlyReason: existingCurrentDevice.reason,
                migrationValidation: null,
            };
        }

        if (existingCurrentDevice.status === "valid") {
            const now = new Date().toISOString();
            const layout = this.buildLayout(roots, existingCurrentDevice.deviceFolderName, {
                ...existingCurrentDevice.metadata,
                updatedAt: now,
                lastSeenAt: now,
            });
            const otherCandidates = candidates.filter(
                (candidate) => candidate.deviceId !== existingCurrentDevice.metadata.deviceId,
            );
            const migrationResult = await this.prepareReadyLayout(layout, hasLegacyInputs);
            if (!migrationResult.ok) {
                return {
                    startupDecision: "read-only",
                    layout,
                    candidates: otherCandidates,
                    defaultDeviceName: layout.device.deviceName,
                    recommendedSourceDeviceId: this.pickRecommendedSourceDeviceId(
                        otherCandidates,
                        null,
                    ),
                    readOnlyReason: migrationResult.reason,
                    migrationValidation: migrationResult.validation,
                };
            }

            return {
                startupDecision:
                    otherCandidates.length > 0 && this.isStaleDevice(existingCurrentDevice.metadata.lastSeenAt)
                        ? "rebuild-required"
                        : "ready",
                layout,
                candidates: otherCandidates,
                defaultDeviceName: layout.device.deviceName,
                recommendedSourceDeviceId: this.pickRecommendedSourceDeviceId(
                    otherCandidates,
                    null,
                ),
                readOnlyReason: null,
                migrationValidation: migrationResult.validation,
            };
        }

        if (hasLegacyInputs || candidates.length === 0) {
            const layout = this.createProvisionalLayout(roots, defaultDeviceName);
            const migrationResult = await this.prepareReadyLayout(layout, hasLegacyInputs);
            if (!migrationResult.ok) {
                return {
                    startupDecision: "read-only",
                    layout,
                    candidates,
                    defaultDeviceName,
                    recommendedSourceDeviceId: this.pickRecommendedSourceDeviceId(candidates, null),
                    readOnlyReason: migrationResult.reason,
                    migrationValidation: migrationResult.validation,
                };
            }

            return {
                startupDecision: "ready",
                layout,
                candidates,
                defaultDeviceName,
                recommendedSourceDeviceId: this.pickRecommendedSourceDeviceId(candidates, null),
                readOnlyReason: null,
                migrationValidation: migrationResult.validation,
            };
        }

        return {
            startupDecision: "baseline-required",
            layout: this.createProvisionalLayout(roots, defaultDeviceName),
            candidates,
            defaultDeviceName,
            recommendedSourceDeviceId: this.pickRecommendedSourceDeviceId(candidates, null),
            readOnlyReason: null,
            migrationValidation: null,
        };
    }

    async completeBaselineJoin(request: SyroBaselineRequest): Promise<SyroPersistenceLayout> {
        const roots = this.buildRootPaths();
        const candidates = await this.listBaselineCandidates();
        const source = candidates.find((candidate) => candidate.deviceId === request.sourceDeviceId);
        if (!source) {
            throw new Error("[SR-Syro] Baseline source device not found.");
        }

        const layout = this.createProvisionalLayout(roots, request.deviceName);
        layout.device.baselineFromDeviceId = source.deviceId;
        layout.device.baselineBuiltAt = new Date().toISOString();
        layout.device.importedSessionIds = [];
        layout.device.importedSessionRetentionUntil = {};

        await this.copyBaselineDomainFiles(source, layout);
        await this.writeJson(layout.deviceMetaPath, layout.device);
        const validation = await this.validateGeneratedFiles(layout, true);
        if (!validation.ok) {
            throw new Error(validation.reason ?? "[SR-Syro] Baseline validation failed.");
        }

        this.persistCurrentDeviceState({
            version: SYRO_CURRENT_DEVICE_STATE_VERSION,
            deviceId: layout.device.deviceId,
            deviceFolderName: this.getDeviceFolderNameFromLayout(layout),
        });
        return layout;
    }

    async rebuildFromBaseline(request: SyroRebuildRequest): Promise<SyroPersistenceLayout> {
        const roots = this.buildRootPaths();
        const candidates = await this.listBaselineCandidates();
        const source = candidates.find((candidate) => candidate.deviceId === request.sourceDeviceId);
        if (!source) {
            throw new Error("[SR-Syro] Rebuild source device not found.");
        }

        const layout = this.createProvisionalLayout(
            roots,
            request.deviceName?.trim() || createDefaultDeviceName(),
        );
        layout.device.baselineFromDeviceId = source.deviceId;
        layout.device.baselineBuiltAt = new Date().toISOString();
        layout.device.importedSessionIds = [];
        layout.device.importedSessionRetentionUntil = {};

        await this.copyBaselineDomainFiles(source, layout);
        await this.writeJson(layout.deviceMetaPath, layout.device);
        const validation = await this.validateGeneratedFiles(layout, true);
        if (!validation.ok) {
            throw new Error(validation.reason ?? "[SR-Syro] Rebuild validation failed.");
        }

        this.persistCurrentDeviceState({
            version: SYRO_CURRENT_DEVICE_STATE_VERSION,
            deviceId: layout.device.deviceId,
            deviceFolderName: this.getDeviceFolderNameFromLayout(layout),
        });
        return layout;
    }

    private buildRootPaths(): Omit<
        SyroPersistenceLayout,
        | "deviceRoot"
        | "deviceMetaPath"
        | "cardsPath"
        | "notesPath"
        | "timelinePath"
        | "deckOptionsPath"
        | "localDeviceRoot"
        | "cardsOverlayPath"
        | "activeSessionBufferPath"
        | "mergeStatePath"
        | "migrationStatePath"
        | "noteCachePath"
        | "device"
    > {
        const manifestRoot = trimTrailingSlash(this.manifestDir);
        const syncRoot = manifestRoot;
        return {
            syncRoot,
            devicesRoot: joinPath(syncRoot, "devices"),
            sessionsRoot: joinPath(syncRoot, "sessions"),
            sessionsArchiveRoot: joinPath(syncRoot, "sessions-archive"),
            localRoot: joinPath(manifestRoot, "local-state"),
        };
    }

    private async loadExistingCurrentDevice(
        persistedCurrentDevice: PersistedCurrentDeviceState | null,
    ): Promise<ExistingCurrentDeviceResult> {
        if (!persistedCurrentDevice) {
            return { status: "missing" };
        }

        const deviceMetaPath = joinPath(
            this.buildRootPaths().devicesRoot,
            persistedCurrentDevice.deviceFolderName,
            "device.json",
        );
        if (!(await this.adapter.exists(deviceMetaPath))) {
            return { status: "missing" };
        }

        try {
            const raw = await this.adapter.read(deviceMetaPath);
            const parsed = parseDeviceMetadata(parseJsonUnknown(raw));
            if (!parsed || parsed.deviceId !== persistedCurrentDevice.deviceId) {
                return {
                    status: "invalid",
                    persisted: persistedCurrentDevice,
                    reason: "[SR-Syro] Current device.json is invalid or does not match the persisted device identity.",
                };
            }

            return {
                status: "valid",
                metadata: parsed,
                deviceFolderName: persistedCurrentDevice.deviceFolderName,
            };
        } catch {
            return {
                status: "invalid",
                persisted: persistedCurrentDevice,
                reason: "[SR-Syro] Current device.json could not be parsed reliably.",
            };
        }
    }

    private loadPersistedCurrentDeviceState(): PersistedCurrentDeviceState | null {
        const storage = this.getStorage();
        if (!storage) {
            return null;
        }

        try {
            const raw = storage.getItem(this.getCurrentDeviceStorageKey());
            if (!raw) {
                return null;
            }
            return parsePersistedCurrentDeviceState(parseJsonUnknown(raw));
        } catch {
            return null;
        }
    }

    private persistCurrentDeviceState(state: PersistedCurrentDeviceState): void {
        const storage = this.getStorage();
        if (!storage) {
            return;
        }

        storage.setItem(this.getCurrentDeviceStorageKey(), JSON.stringify(state));
    }

    private getStorage(): Storage | null {
        try {
            return globalThis.localStorage ?? null;
        } catch {
            return null;
        }
    }

    private getCurrentDeviceStorageKey(): string {
        const vaultAdapter = this.app.vault.adapter as { basePath?: string };
        const basePath =
            typeof vaultAdapter.basePath === "string" && vaultAdapter.basePath.length > 0
                ? vaultAdapter.basePath
                : this.app.vault.getName();

        return `syro:current-device:${basePath}:${this.manifestDir}`;
    }

    private async writeJson(path: string, value: unknown): Promise<void> {
        await ensureDirectory(this.adapter, dirname(path));
        await this.adapter.write(path, JSON.stringify(value, null, 2));
    }

    private getMigrationBackupsRoot(): string {
        return joinPath(trimTrailingSlash(this.manifestDir), "migration-backups");
    }

    private async prepareMigrationBackup(layout: SyroPersistenceLayout): Promise<void> {
        if (await this.adapter.exists(layout.migrationStatePath)) {
            return;
        }

        const legacyFiles = this.getLegacySourceFiles();
        const existingLegacyFiles = [];
        for (const [name, path] of legacyFiles) {
            if (await this.adapter.exists(path)) {
                existingLegacyFiles.push([name, path] as const);
            }
        }

        if (existingLegacyFiles.length === 0) {
            return;
        }

        const backupDir = joinPath(
            this.getMigrationBackupsRoot(),
            `${new Date().toISOString().replace(/:/g, "-")}-before-0.0.12`,
        );
        await ensureDirectory(this.adapter, backupDir);

        const copiedFiles: string[] = [];
        for (const [name, path] of existingLegacyFiles) {
            const targetPath = joinPath(backupDir, name);
            await copyFileIfMissing(this.adapter, path, targetPath);
            copiedFiles.push(name);
        }

        const deckOptionsSnapshot = createDeckOptionsStoreSnapshot(this.settings);
        await this.writeJson(
            joinPath(backupDir, "deck-options.settings-snapshot.json"),
            deckOptionsSnapshot.state,
        );
        copiedFiles.push("deck-options.settings-snapshot.json");

        await this.writeJson(joinPath(backupDir, "meta.json"), {
            createdAt: new Date().toISOString(),
            reason: "0.0.11-to-0.0.12-migration-backup",
            sourceVersion: "0.0.11",
            targetVersion: "0.0.12",
            deviceNameAtMigration: layout.device.deviceName,
            sourceFiles: copiedFiles,
            notes: "copy-only backup generated before the Syro 0.0.12 layout migration",
        });
    }

    private async writeMigrationState(layout: SyroPersistenceLayout): Promise<void> {
        if (await this.adapter.exists(layout.migrationStatePath)) {
            return;
        }

        const legacyFiles = this.getLegacySourceFiles();
        let hasLegacyInputs = false;
        for (const [, path] of legacyFiles) {
            if (await this.adapter.exists(path)) {
                hasLegacyInputs = true;
                break;
            }
        }

        const state: SyroMigrationStateFile = {
            version: SYRO_MIGRATION_STATE_VERSION,
            completedAt: new Date().toISOString(),
            sourceVersion: "0.0.11",
            targetVersion: "0.0.12",
            hasLegacyInputs,
        };
        await this.writeJson(layout.migrationStatePath, state);
    }

    private getLegacySourceFiles(): Array<[string, string]> {
        const legacyCardsPath = normalizePath(getStorePath(this.manifestDir, this.settings));
        const legacyNotesPath = replaceFileName(legacyCardsPath, "review_notes.json");
        const legacyTimelinePath = replaceFileName(legacyCardsPath, "review_commits.json");
        const legacyOverlayPath = replaceFileName(
            legacyCardsPath,
            "tracked_files.review_overlay.json",
        );
        const legacyNoteCachePath = replaceFileName(legacyCardsPath, "note_cache.json");

        return [
            ["tracked_files.json", legacyCardsPath],
            ["review_notes.json", legacyNotesPath],
            ["review_commits.json", legacyTimelinePath],
            ["tracked_files.review_overlay.json", legacyOverlayPath],
            ["note_cache.json", legacyNoteCachePath],
        ];
    }

    private async migrateLegacyFiles(layout: SyroPersistenceLayout): Promise<void> {
        const legacyFiles = this.getLegacySourceFiles();
        const legacyCardsPath = legacyFiles.find(([name]) => name === "tracked_files.json")?.[1] ?? "";
        const legacyNotesPath = legacyFiles.find(([name]) => name === "review_notes.json")?.[1] ?? "";
        const legacyTimelinePath =
            legacyFiles.find(([name]) => name === "review_commits.json")?.[1] ?? "";
        const legacyOverlayPath =
            legacyFiles.find(([name]) => name === "tracked_files.review_overlay.json")?.[1] ?? "";
        const legacyNoteCachePath = legacyFiles.find(([name]) => name === "note_cache.json")?.[1] ?? "";

        // Copy-only migration keeps the old files intact so a partial rollout cannot strand user data.
        await copyFileIfMissing(this.adapter, legacyCardsPath, layout.cardsPath);
        await copyFileIfMissing(this.adapter, legacyNotesPath, layout.notesPath);
        await copyFileIfMissing(this.adapter, legacyTimelinePath, layout.timelinePath);
        await copyFileIfMissing(this.adapter, legacyOverlayPath, layout.cardsOverlayPath);
        await copyFileIfMissing(this.adapter, legacyNoteCachePath, layout.noteCachePath);
        if (!(await this.adapter.exists(layout.deckOptionsPath))) {
            const snapshot = createDeckOptionsStoreSnapshot(this.settings);
            await this.writeJson(layout.deckOptionsPath, snapshot.state);
        }
    }

    private buildLayout(
        roots: Omit<
            SyroPersistenceLayout,
            | "deviceRoot"
            | "deviceMetaPath"
            | "cardsPath"
            | "notesPath"
            | "timelinePath"
            | "deckOptionsPath"
            | "localDeviceRoot"
            | "cardsOverlayPath"
            | "activeSessionBufferPath"
            | "mergeStatePath"
            | "migrationStatePath"
            | "noteCachePath"
            | "device"
        >,
        deviceFolderName: string,
        metadata: SyroDeviceMetadata,
    ): SyroPersistenceLayout {
        const deviceRoot = joinPath(roots.devicesRoot, deviceFolderName);
        const localDeviceRoot = joinPath(roots.localRoot, deviceFolderName);
        return {
            ...roots,
            deviceRoot,
            deviceMetaPath: joinPath(deviceRoot, "device.json"),
            cardsPath: joinPath(deviceRoot, "cards.json"),
            notesPath: joinPath(deviceRoot, "notes.json"),
            timelinePath: joinPath(deviceRoot, "timeline.json"),
            deckOptionsPath: joinPath(deviceRoot, "deck-options.json"),
            localDeviceRoot,
            cardsOverlayPath: joinPath(localDeviceRoot, "cards.review_overlay.json"),
            activeSessionBufferPath: joinPath(localDeviceRoot, "active-session-buffer.jsonl"),
            mergeStatePath: joinPath(localDeviceRoot, "sync-merge-state.json"),
            migrationStatePath: joinPath(localDeviceRoot, "migration-state.json"),
            noteCachePath: joinPath(localDeviceRoot, "note_cache.json"),
            device: metadata,
        };
    }

    private createProvisionalLayout(
        roots: Omit<
            SyroPersistenceLayout,
            | "deviceRoot"
            | "deviceMetaPath"
            | "cardsPath"
            | "notesPath"
            | "timelinePath"
            | "deckOptionsPath"
            | "localDeviceRoot"
            | "cardsOverlayPath"
            | "activeSessionBufferPath"
            | "mergeStatePath"
            | "migrationStatePath"
            | "noteCachePath"
            | "device"
        >,
        deviceName: string,
        forcedDeviceId?: string,
        forcedDeviceFolderName?: string,
    ): SyroPersistenceLayout {
        const now = new Date().toISOString();
        const deviceId = forcedDeviceId ?? createDeviceId();
        const shortDeviceId = createShortDeviceId(deviceId);
        const metadata: SyroDeviceMetadata = {
            version: SYRO_DEVICE_FILE_VERSION,
            deviceId,
            deviceName: deviceName.trim() || createDefaultDeviceName(),
            shortDeviceId,
            createdAt: now,
            updatedAt: now,
            lastSeenAt: now,
            baselineFromDeviceId: null,
            baselineBuiltAt: null,
            importedSessionIds: [],
            importedSessionRetentionUntil: {},
        };

        return this.buildLayout(
            roots,
            forcedDeviceFolderName ?? createDeviceFolderName(metadata.deviceName, shortDeviceId),
            metadata,
        );
    }

    private async prepareReadyLayout(
        layout: SyroPersistenceLayout,
        shouldRunMigration: boolean,
    ): Promise<{
        ok: boolean;
        reason: string | null;
        validation: SyroMigrationValidationResult | null;
    }> {
        await ensureDirectory(this.adapter, layout.deviceRoot);
        await ensureDirectory(this.adapter, layout.localDeviceRoot);

        if (shouldRunMigration && !(await this.adapter.exists(layout.migrationStatePath))) {
            await this.prepareMigrationBackup(layout);
            await this.migrateLegacyFiles(layout);
        }

        await this.writeJson(layout.deviceMetaPath, layout.device);

        const validation = await this.validateGeneratedFiles(layout, false);
        if (!validation.ok) {
            return {
                ok: false,
                reason:
                    validation.reason ??
                    "[SR-Syro] Migration validation failed for generated formal files.",
                validation,
            };
        }

        if (shouldRunMigration) {
            await this.writeMigrationState(layout);
        }

        this.persistCurrentDeviceState({
            version: SYRO_CURRENT_DEVICE_STATE_VERSION,
            deviceId: layout.device.deviceId,
            deviceFolderName: this.getDeviceFolderNameFromLayout(layout),
        });

        return {
            ok: true,
            reason: null,
            validation,
        };
    }

    private async validateGeneratedFiles(
        layout: SyroPersistenceLayout,
        requireDomainSnapshots: boolean,
    ): Promise<SyroMigrationValidationResult> {
        const checks: Array<[string, (raw: string) => boolean, boolean]> = [
            [layout.deviceMetaPath, (raw) => parseDeviceMetadata(parseJsonUnknown(raw)) !== null, true],
            [layout.cardsPath, validateCardsStoreFile, requireDomainSnapshots],
            [layout.notesPath, validateNotesStoreFile, requireDomainSnapshots],
            [layout.timelinePath, validateTimelineStoreFile, requireDomainSnapshots],
            [layout.deckOptionsPath, validateDeckOptionsStoreFile, requireDomainSnapshots],
        ];
        const validatedPaths: string[] = [];

        for (const [path, validator, required] of checks) {
            if (!(await this.adapter.exists(path))) {
                if (required) {
                    return {
                        ok: false,
                        reason: `[SR-Syro] Missing required formal file: ${path}`,
                        validatedPaths,
                    };
                }
                continue;
            }

            try {
                const raw = await this.adapter.read(path);
                if (!raw || !validator(raw)) {
                    return {
                        ok: false,
                        reason: `[SR-Syro] Invalid formal file schema: ${path}`,
                        validatedPaths,
                    };
                }
                validatedPaths.push(path);
            } catch (error) {
                return {
                    ok: false,
                    reason: `[SR-Syro] Failed to validate formal file ${path}: ${String(error)}`,
                    validatedPaths,
                };
            }
        }

        return {
            ok: true,
            reason: null,
            validatedPaths,
        };
    }

    private async copyBaselineDomainFiles(
        source: SyroBaselineCandidate,
        targetLayout: SyroPersistenceLayout,
    ): Promise<void> {
        const sourceRoot = joinPath(this.buildRootPaths().devicesRoot, source.deviceFolderName);
        await ensureDirectory(this.adapter, targetLayout.deviceRoot);
        await ensureDirectory(this.adapter, targetLayout.localDeviceRoot);
        await copyFile(this.adapter, joinPath(sourceRoot, "cards.json"), targetLayout.cardsPath);
        await copyFile(this.adapter, joinPath(sourceRoot, "notes.json"), targetLayout.notesPath);
        await copyFile(
            this.adapter,
            joinPath(sourceRoot, "timeline.json"),
            targetLayout.timelinePath,
        );
        await copyFile(
            this.adapter,
            joinPath(sourceRoot, "deck-options.json"),
            targetLayout.deckOptionsPath,
        );
    }

    private async listBaselineCandidates(): Promise<SyroBaselineCandidate[]> {
        if (!this.adapter.list) {
            return [];
        }

        const listing = await this.adapter.list(trimTrailingSlash(this.buildRootPaths().devicesRoot));
        const candidates: SyroBaselineCandidate[] = [];
        for (const folderPath of listing.folders ?? []) {
            const normalizedFolderPath = trimTrailingSlash(folderPath);
            const deviceFolderName =
                normalizedFolderPath.slice(normalizedFolderPath.lastIndexOf("/") + 1) ||
                normalizedFolderPath;
            const metaPath = joinPath(normalizedFolderPath, "device.json");
            if (!(await this.adapter.exists(metaPath))) {
                continue;
            }

            try {
                const raw = await this.adapter.read(metaPath);
                const metadata = parseDeviceMetadata(parseJsonUnknown(raw));
                if (!metadata) {
                    continue;
                }

                candidates.push({
                    deviceId: metadata.deviceId,
                    deviceName: metadata.deviceName,
                    shortDeviceId: metadata.shortDeviceId,
                    deviceFolderName,
                    lastSeenAt: metadata.lastSeenAt,
                    baselineFromDeviceId: metadata.baselineFromDeviceId,
                    baselineBuiltAt: metadata.baselineBuiltAt,
                });
            } catch {
                continue;
            }
        }

        return candidates.sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
    }

    private pickRecommendedSourceDeviceId(
        candidates: SyroBaselineCandidate[],
        excludedDeviceId: string | null,
    ): string | null {
        const filtered = excludedDeviceId
            ? candidates.filter((candidate) => candidate.deviceId !== excludedDeviceId)
            : candidates;
        return filtered[0]?.deviceId ?? null;
    }

    private isStaleDevice(lastSeenAt: string): boolean {
        const parsed = Date.parse(lastSeenAt);
        return !Number.isFinite(parsed) || parsed < Date.now() - ACTIVE_DEVICE_WINDOW_MS;
    }

    private getDeviceFolderNameFromLayout(layout: SyroPersistenceLayout): string {
        const normalized = trimTrailingSlash(layout.deviceRoot);
        return normalized.slice(normalized.lastIndexOf("/") + 1);
    }

    private async hasLegacyInputs(): Promise<boolean> {
        const legacyFiles = this.getLegacySourceFiles();
        for (const [, path] of legacyFiles) {
            if (await this.adapter.exists(path)) {
                return true;
            }
        }

        return false;
    }
}
