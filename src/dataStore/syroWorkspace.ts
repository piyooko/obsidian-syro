import { App, DataAdapter, Platform } from "obsidian";
import { NOTE_CACHE_VERSION } from "src/cache/noteCacheStore";
import { createDefaultSrsData } from "./data";
import { createDeckOptionsStoreSnapshot } from "./deckOptionsStore";
import {
    createDefaultDailyState,
    createDefaultDeviceState,
    createDefaultLicenseState,
    createDefaultSharedSettingsState,
    createDefaultTrackingRulesState,
    hasSyro012MigrationMarker,
    normalizeDeviceReviewCount,
    parseDailyState,
} from "./syroPluginDataStore";
import { getStorePath } from "src/dataStore/dataLocation";
import type { SRSettings } from "src/settings";
import {
    getArrayProp,
    getNumberProp,
    getStringProp,
    isRecord,
    parseJsonUnknown,
} from "src/util/typeGuards";
import { sha256Hex } from "src/util/hash";

const SYRO_DEVICE_FILE_VERSION = 1;
const SYRO_CURRENT_DEVICE_STATE_VERSION = 1;
const SYRO_INSTALL_INSTANCE_STATE_VERSION = 1;
const ACTIVE_DEVICE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const SYRO_DEVICE_IDENTITY_CONFLICT_REASON =
    "[SR-Syro] Multiple devices are bound to this installation. Resolve the duplicate binding before continuing.";

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
    ownerInstallIdHash: string | null;
    baselineFromDeviceId: string | null;
    baselineBuiltAt: string | null;
    importedSessionIds?: string[];
    importedSessionRetentionUntil?: Record<string, string>;
}

interface PersistedCurrentDeviceState {
    version: number;
    deviceId: string;
    deviceFolderName: string;
}

interface PersistedInstallInstanceState {
    version: number;
    installInstanceId: string;
}

export type SyroStartupDecision =
    | "ready"
    | "baseline-required"
    | "rebuild-required"
    | "select-current-device"
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

export interface SyroValidDeviceEntry extends SyroBaselineCandidate {
    deviceRoot: string;
    deviceMetaPath: string;
    deviceReviewCount: number;
    metadata: SyroDeviceMetadata;
}

export type SyroInvalidDeviceReason =
    | "missing-device-json"
    | "invalid-device-json"
    | "unreadable-device-json";

export interface SyroInvalidDeviceEntry {
    deviceFolderName: string;
    deviceRoot: string;
    reason: SyroInvalidDeviceReason;
    deviceReviewCount: number;
    lastSeenAt: string | null;
    files: string[];
    folders: string[];
}

export interface SyroDeviceSelectionRequest {
    defaultDeviceName: string;
    candidates: SyroValidDeviceEntry[];
}

export interface SyroWorkspaceDeviceInventory {
    currentDevice: SyroValidDeviceEntry | null;
    validDevices: SyroValidDeviceEntry[];
    invalidDevices: SyroInvalidDeviceEntry[];
    pointerStatus: "valid" | "missing" | "invalid";
    identityConflictReason?: string | null;
}

type SyroCurrentDeviceSource = "owner-hash" | "legacy-pointer" | "none" | "conflict";

interface ResolvedSyroWorkspaceDeviceInventory extends SyroWorkspaceDeviceInventory {
    ownerInstallIdHash: string | null;
    pointerDevice: SyroValidDeviceEntry | null;
    currentDeviceSource: SyroCurrentDeviceSource;
    identityConflictReason: string | null;
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
    layout: SyroPersistenceLayout | null;
    candidates: SyroBaselineCandidate[];
    currentDevice: SyroValidDeviceEntry | null;
    validDevices: SyroValidDeviceEntry[];
    invalidDevices: SyroInvalidDeviceEntry[];
    defaultDeviceName: string;
    recommendedSourceDeviceId: string | null;
    readOnlyReason: string | null;
    migrationValidation: SyroMigrationValidationResult | null;
}

export interface SyroPersistenceLayout {
    syncRoot: string;
    devicesRoot: string;
    sessionsRoot: string;
    deviceRoot: string;
    deviceMetaPath: string;
    cardsPath: string;
    notesPath: string;
    timelinePath: string;
    deckOptionsPath: string;
    settingsPath: string;
    trackingRulesPath: string;
    dailyStatePath: string;
    deviceStatePath: string;
    licenseStatePath: string;
    cardsOverlayPath: string;
    currentDeviceSessionsRoot: string;
    currentDeviceSessionFilePath: string;
    noteCachePath: string;
    device: SyroDeviceMetadata;
}

type SyroWorkspaceLogFn = (...args: unknown[]) => void;

type FileBackedAdapter = Pick<
    DataAdapter,
    "exists" | "mkdir" | "read" | "remove" | "rename" | "rmdir" | "write"
> & {
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

function padSessionDatePart(value: number): string {
    return String(value).padStart(2, "0");
}

export function formatLocalSessionDateKey(date: Date = new Date()): string {
    return [
        date.getFullYear(),
        padSessionDatePart(date.getMonth() + 1),
        padSessionDatePart(date.getDate()),
    ].join("-");
}

export function buildCurrentDeviceSessionFilePath(
    sessionsRoot: string,
    deviceFolderName: string,
    date: Date = new Date(),
): string {
    return joinPath(
        sessionsRoot,
        deviceFolderName,
        `${formatLocalSessionDateKey(date)}.session.jsonl`,
    );
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
    const ownerInstallIdHash = getStringProp(value, "ownerInstallIdHash")?.trim() ?? null;

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
        ownerInstallIdHash: ownerInstallIdHash || null,
        baselineFromDeviceId: getStringProp(value, "baselineFromDeviceId") ?? null,
        baselineBuiltAt: getStringProp(value, "baselineBuiltAt") ?? null,
        ...(getArrayProp(value, "importedSessionIds")
            ? {
                  importedSessionIds: parseImportedSessionIds(
                      getArrayProp(value, "importedSessionIds"),
                  ),
              }
            : {}),
        ...(value["importedSessionRetentionUntil"]
            ? {
                  importedSessionRetentionUntil: parseStringMap(
                      value["importedSessionRetentionUntil"],
                  ),
              }
            : {}),
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

function parsePersistedInstallInstanceState(value: unknown): PersistedInstallInstanceState | null {
    if (!isRecord(value)) {
        return null;
    }

    const version = getNumberProp(value, "version");
    const installInstanceId = getStringProp(value, "installInstanceId")?.trim();
    if (version !== SYRO_INSTALL_INSTANCE_STATE_VERSION || !installInstanceId) {
        return null;
    }

    return {
        version,
        installInstanceId,
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

async function replaceFileFromSource(
    adapter: FileBackedAdapter,
    sourcePath: string,
    targetPath: string,
): Promise<void> {
    if (sourcePath === targetPath) {
        return;
    }

    if (!(await adapter.exists(sourcePath))) {
        if (await adapter.exists(targetPath)) {
            await adapter.remove(targetPath);
        }
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

function createDefaultNoteReviewStoreFile(): {
    version: number;
    nextItemId: number;
    items: Record<string, never>;
    syncEntities: Record<string, never>;
} {
    return {
        version: 1,
        nextItemId: 1,
        items: {},
        syncEntities: {},
    };
}

function createDefaultTimelineStoreFile(): {
    version: number;
    files: Record<string, never>;
    syncEntities: Record<string, never>;
} {
    return {
        version: 1,
        files: {},
        syncEntities: {},
    };
}

function createDefaultNoteCacheFile(): {
    version: number;
    signature: string;
    items: [];
} {
    return {
        version: NOTE_CACHE_VERSION,
        signature: "",
        items: [],
    };
}

export class SyroWorkspace {
    private readonly adapter: FileBackedAdapter;
    private readonly logDebug: SyroWorkspaceLogFn;
    private installInstanceIdFallback: string | null = null;

    constructor(
        private readonly app: App,
        private readonly manifestDir: string,
        private readonly settings: SRSettings,
        options: {
            logDebug?: SyroWorkspaceLogFn;
        } = {},
    ) {
        this.adapter = this.app.vault.adapter as FileBackedAdapter;
        this.logDebug = options.logDebug ?? (() => undefined);
    }

    async initialize(): Promise<SyroWorkspaceInitializeResult> {
        const roots = this.buildRootPaths();

        await ensureDirectory(this.adapter, roots.syncRoot);
        await ensureDirectory(this.adapter, roots.devicesRoot);
        await ensureDirectory(this.adapter, roots.sessionsRoot);

        const inventory = await this.inspectDeviceInventory();
        const hasLegacyInputs = await this.hasLegacyInputs();
        const defaultDeviceName = inventory.currentDevice?.deviceName ?? createDefaultDeviceName();

        if (inventory.currentDeviceSource === "conflict") {
            return {
                startupDecision: "read-only",
                layout: null,
                candidates: this.toBaselineCandidates(inventory.validDevices),
                currentDevice: null,
                validDevices: inventory.validDevices,
                invalidDevices: inventory.invalidDevices,
                defaultDeviceName,
                recommendedSourceDeviceId: this.pickRecommendedSourceDeviceId(
                    this.toBaselineCandidates(inventory.validDevices),
                    null,
                ),
                readOnlyReason: inventory.identityConflictReason,
                migrationValidation: null,
            };
        }

        if (inventory.currentDevice) {
            const now = new Date().toISOString();
            const layout = this.buildLayout(roots, inventory.currentDevice.deviceFolderName, {
                ...inventory.currentDevice.metadata,
                ownerInstallIdHash:
                    inventory.ownerInstallIdHash ??
                    inventory.currentDevice.metadata.ownerInstallIdHash,
                updatedAt: now,
                lastSeenAt: now,
            });
            const otherValidDevices = inventory.validDevices.filter(
                (candidate) => candidate.deviceId !== inventory.currentDevice?.deviceId,
            );
            const migrationResult = await this.prepareReadyLayout(layout, hasLegacyInputs);
            if (!migrationResult.ok) {
                return {
                    startupDecision: "read-only",
                    layout,
                    candidates: this.toBaselineCandidates(otherValidDevices),
                    currentDevice: this.toValidDeviceEntry(layout),
                    validDevices: [this.toValidDeviceEntry(layout), ...otherValidDevices],
                    invalidDevices: inventory.invalidDevices,
                    defaultDeviceName: layout.device.deviceName,
                    recommendedSourceDeviceId: this.pickRecommendedSourceDeviceId(
                        this.toBaselineCandidates(otherValidDevices),
                        null,
                    ),
                    readOnlyReason: migrationResult.reason,
                    migrationValidation: migrationResult.validation,
                };
            }

            return {
                startupDecision:
                    inventory.currentDeviceSource !== "legacy-pointer" &&
                    otherValidDevices.length > 0 &&
                    this.isStaleDevice(inventory.currentDevice.metadata.lastSeenAt)
                        ? "rebuild-required"
                        : "ready",
                layout,
                candidates: this.toBaselineCandidates(otherValidDevices),
                currentDevice: this.toValidDeviceEntry(layout),
                validDevices: [this.toValidDeviceEntry(layout), ...otherValidDevices],
                invalidDevices: inventory.invalidDevices,
                defaultDeviceName: layout.device.deviceName,
                recommendedSourceDeviceId: this.pickRecommendedSourceDeviceId(
                    this.toBaselineCandidates(otherValidDevices),
                    null,
                ),
                readOnlyReason: null,
                migrationValidation: migrationResult.validation,
            };
        }

        if (inventory.validDevices.length === 0) {
            const layout = this.createProvisionalLayout(
                roots,
                defaultDeviceName,
                undefined,
                undefined,
                inventory.ownerInstallIdHash,
            );
            const migrationResult = await this.prepareReadyLayout(layout, hasLegacyInputs);
            if (!migrationResult.ok) {
                return {
                    startupDecision: "read-only",
                    layout,
                    candidates: this.toBaselineCandidates(inventory.validDevices),
                    currentDevice: null,
                    validDevices: inventory.validDevices,
                    invalidDevices: inventory.invalidDevices,
                    defaultDeviceName,
                    recommendedSourceDeviceId: this.pickRecommendedSourceDeviceId(
                        this.toBaselineCandidates(inventory.validDevices),
                        null,
                    ),
                    readOnlyReason: migrationResult.reason,
                    migrationValidation: migrationResult.validation,
                };
            }

            const currentDevice = this.toValidDeviceEntry(layout);
            return {
                startupDecision: "ready",
                layout,
                candidates: this.toBaselineCandidates(inventory.validDevices),
                currentDevice,
                validDevices: [currentDevice, ...inventory.validDevices],
                invalidDevices: inventory.invalidDevices,
                defaultDeviceName,
                recommendedSourceDeviceId: this.pickRecommendedSourceDeviceId(
                    this.toBaselineCandidates(inventory.validDevices),
                    null,
                ),
                readOnlyReason: null,
                migrationValidation: migrationResult.validation,
            };
        }

        return {
            startupDecision: "select-current-device",
            layout: null,
            candidates: this.toBaselineCandidates(inventory.validDevices),
            currentDevice: null,
            validDevices: inventory.validDevices,
            invalidDevices: inventory.invalidDevices,
            defaultDeviceName,
            recommendedSourceDeviceId: this.pickRecommendedSourceDeviceId(
                this.toBaselineCandidates(inventory.validDevices),
                null,
            ),
            readOnlyReason: null,
            migrationValidation: null,
        };
    }

    async completeBaselineJoin(request: SyroBaselineRequest): Promise<SyroPersistenceLayout> {
        const roots = this.buildRootPaths();
        const candidates = await this.listBaselineCandidates();
        const source = candidates.find(
            (candidate) => candidate.deviceId === request.sourceDeviceId,
        );
        if (!source) {
            throw new Error("[SR-Syro] Baseline source device not found.");
        }

        const layout = this.createProvisionalLayout(
            roots,
            request.deviceName,
            undefined,
            undefined,
            await this.getCurrentOwnerInstallIdHash(),
        );
        layout.device.baselineFromDeviceId = source.deviceId;
        layout.device.baselineBuiltAt = new Date().toISOString();
        this.logDebug("[SR-SyroWorkspace] completeBaselineJoin:start", {
            sourceDeviceId: source.deviceId,
            sourceFolderName: source.deviceFolderName,
            targetDeviceName: layout.device.deviceName,
            targetFolderName: this.getDeviceFolderNameFromLayout(layout),
        });

        try {
            await this.copyBaselineDomainFiles(source, layout);
            const result = await this.prepareReadyLayout(layout, false, true);
            if (!result.ok) {
                throw new Error(result.reason ?? "[SR-Syro] Baseline validation failed.");
            }
            this.logDebug("[SR-SyroWorkspace] completeBaselineJoin:ready", {
                deviceId: layout.device.deviceId,
                deviceRoot: layout.deviceRoot,
            });
            return layout;
        } catch (error) {
            this.logDebug("[SR-SyroWorkspace] completeBaselineJoin:failed", {
                deviceRoot: layout.deviceRoot,
                error: String(error),
            });
            await this.cleanupUnfinishedLayout(layout);
            throw error;
        }
    }

    async rebuildFromBaseline(request: SyroRebuildRequest): Promise<SyroPersistenceLayout> {
        const roots = this.buildRootPaths();
        const candidates = await this.listBaselineCandidates();
        const source = candidates.find(
            (candidate) => candidate.deviceId === request.sourceDeviceId,
        );
        if (!source) {
            throw new Error("[SR-Syro] Rebuild source device not found.");
        }

        const layout = this.createProvisionalLayout(
            roots,
            request.deviceName?.trim() || createDefaultDeviceName(),
            undefined,
            undefined,
            await this.getCurrentOwnerInstallIdHash(),
        );
        layout.device.baselineFromDeviceId = source.deviceId;
        layout.device.baselineBuiltAt = new Date().toISOString();
        this.logDebug("[SR-SyroWorkspace] rebuildFromBaseline:start", {
            sourceDeviceId: source.deviceId,
            sourceFolderName: source.deviceFolderName,
            targetDeviceName: layout.device.deviceName,
            targetFolderName: this.getDeviceFolderNameFromLayout(layout),
        });

        try {
            await this.copyBaselineDomainFiles(source, layout);
            const result = await this.prepareReadyLayout(layout, false, true);
            if (!result.ok) {
                throw new Error(result.reason ?? "[SR-Syro] Rebuild validation failed.");
            }
            this.logDebug("[SR-SyroWorkspace] rebuildFromBaseline:ready", {
                deviceId: layout.device.deviceId,
                deviceRoot: layout.deviceRoot,
            });
            return layout;
        } catch (error) {
            this.logDebug("[SR-SyroWorkspace] rebuildFromBaseline:failed", {
                deviceRoot: layout.deviceRoot,
                error: String(error),
            });
            await this.cleanupUnfinishedLayout(layout);
            throw error;
        }
    }

    async listDeviceInventory(): Promise<SyroWorkspaceDeviceInventory> {
        const inventory = await this.inspectDeviceInventory();
        return {
            currentDevice: inventory.currentDevice,
            validDevices: inventory.validDevices,
            invalidDevices: inventory.invalidDevices,
            pointerStatus: inventory.pointerStatus,
            identityConflictReason: inventory.identityConflictReason,
        };
    }

    getSessionDirectoryPath(deviceFolderName: string): string {
        return joinPath(this.buildRootPaths().sessionsRoot, deviceFolderName);
    }

    async adoptExistingDevice(deviceId: string): Promise<SyroPersistenceLayout> {
        const roots = this.buildRootPaths();
        const validDevices = await this.listValidDeviceEntries();
        const device = validDevices.find((entry) => entry.deviceId === deviceId);
        if (!device) {
            throw new Error("[SR-Syro] Existing device not found.");
        }

        const now = new Date().toISOString();
        const layout = this.buildLayout(roots, device.deviceFolderName, {
            ...device.metadata,
            ownerInstallIdHash: await this.getCurrentOwnerInstallIdHash(),
            updatedAt: now,
            lastSeenAt: now,
        });
        const result = await this.prepareReadyLayout(layout, false);
        if (!result.ok) {
            throw new Error(result.reason ?? "[SR-Syro] Failed to adopt the existing device.");
        }

        return layout;
    }

    async renameCurrentDevice(
        layout: SyroPersistenceLayout,
        nextDeviceName: string,
    ): Promise<SyroPersistenceLayout> {
        const trimmedName = nextDeviceName.trim();
        const effectiveName = trimmedName || layout.device.deviceName;
        const nextFolderName = createDeviceFolderName(effectiveName, layout.device.shortDeviceId);
        const currentFolderName = this.getDeviceFolderNameFromLayout(layout);
        const now = new Date().toISOString();
        const roots = this.buildRootPaths();
        const nextLayout = this.buildLayout(roots, nextFolderName, {
            ...layout.device,
            deviceName: effectiveName,
            updatedAt: now,
            lastSeenAt: now,
        });

        if (
            nextFolderName !== currentFolderName &&
            ((await this.adapter.exists(nextLayout.deviceRoot)) ||
                (await this.adapter.exists(nextLayout.currentDeviceSessionsRoot)))
        ) {
            throw new Error(
                "[SR-Syro] A device directory with the same target name already exists.",
            );
        }

        if (nextFolderName !== currentFolderName) {
            await ensureDirectory(this.adapter, roots.devicesRoot);
            await this.adapter.rename(layout.deviceRoot, nextLayout.deviceRoot);
            if (await this.adapter.exists(layout.currentDeviceSessionsRoot)) {
                await ensureDirectory(this.adapter, roots.sessionsRoot);
                await this.adapter.rename(
                    layout.currentDeviceSessionsRoot,
                    nextLayout.currentDeviceSessionsRoot,
                );
            }
        }

        await this.writeJson(nextLayout.deviceMetaPath, nextLayout.device);
        this.persistCurrentDeviceState({
            version: SYRO_CURRENT_DEVICE_STATE_VERSION,
            deviceId: nextLayout.device.deviceId,
            deviceFolderName: nextFolderName,
        });
        return nextLayout;
    }

    async overwriteCurrentDeviceFromSource(
        layout: SyroPersistenceLayout,
        sourceDeviceId: string,
    ): Promise<SyroPersistenceLayout> {
        const validDevices = await this.listValidDeviceEntries();
        const source = validDevices.find((candidate) => candidate.deviceId === sourceDeviceId);
        if (!source) {
            throw new Error("[SR-Syro] Source device not found.");
        }
        if (source.deviceId === layout.device.deviceId) {
            throw new Error("[SR-Syro] The current device cannot sync from itself.");
        }

        const roots = this.buildRootPaths();
        const sourceLayout = this.buildLayout(roots, source.deviceFolderName, source.metadata);
        const sourceValidation = await this.validateGeneratedFiles(sourceLayout, false);
        if (!sourceValidation.ok) {
            throw new Error(sourceValidation.reason ?? "[SR-Syro] Source device is invalid.");
        }

        const now = new Date().toISOString();
        const nextLayout = this.buildLayout(roots, this.getDeviceFolderNameFromLayout(layout), {
            ...layout.device,
            baselineFromDeviceId: source.deviceId,
            baselineBuiltAt: now,
            updatedAt: now,
            lastSeenAt: now,
        });

        await this.replaceCurrentDeviceDomainFiles(source, nextLayout);
        await this.writeJson(nextLayout.deviceMetaPath, nextLayout.device);
        await this.ensureFormalDeviceFiles(nextLayout);

        const validation = await this.validateGeneratedFiles(nextLayout, true);
        if (!validation.ok) {
            throw new Error(
                validation.reason ?? "[SR-Syro] Failed to validate the overwritten device state.",
            );
        }

        this.persistCurrentDeviceState({
            version: SYRO_CURRENT_DEVICE_STATE_VERSION,
            deviceId: nextLayout.device.deviceId,
            deviceFolderName: this.getDeviceFolderNameFromLayout(nextLayout),
        });

        return nextLayout;
    }

    async deleteValidDevice(deviceId: string): Promise<void> {
        const inventory = await this.listDeviceInventory();
        if (inventory.currentDevice?.deviceId === deviceId) {
            throw new Error("[SR-Syro] The current device cannot be deleted.");
        }

        const validEntry = inventory.validDevices.find((entry) => entry.deviceId === deviceId);
        if (!validEntry) {
            throw new Error("[SR-Syro] Valid device not found.");
        }

        await this.removeDirectoryRecursive(validEntry.deviceRoot);
        await this.removeDirectoryRecursive(this.getSessionDirectoryPath(validEntry.deviceFolderName));
    }

    async deleteInvalidDeviceDirectory(deviceFolderName: string): Promise<void> {
        const inventory = await this.listDeviceInventory();
        const invalidEntry = inventory.invalidDevices.find(
            (entry) => entry.deviceFolderName === deviceFolderName,
        );
        if (!invalidEntry) {
            throw new Error("[SR-Syro] Invalid device directory not found.");
        }

        await this.removeDirectoryRecursive(invalidEntry.deviceRoot);
    }

    private buildRootPaths(): Omit<
        SyroPersistenceLayout,
        | "deviceRoot"
        | "deviceMetaPath"
        | "cardsPath"
        | "notesPath"
        | "timelinePath"
        | "deckOptionsPath"
        | "settingsPath"
        | "trackingRulesPath"
        | "dailyStatePath"
        | "deviceStatePath"
        | "licenseStatePath"
        | "cardsOverlayPath"
        | "currentDeviceSessionsRoot"
        | "currentDeviceSessionFilePath"
        | "noteCachePath"
        | "device"
    > {
        const manifestRoot = trimTrailingSlash(this.manifestDir);
        const syncRoot = manifestRoot;
        return {
            syncRoot,
            devicesRoot: joinPath(syncRoot, "devices"),
            sessionsRoot: joinPath(syncRoot, "sessions"),
        };
    }

    private async inspectDeviceInventory(): Promise<ResolvedSyroWorkspaceDeviceInventory> {
        const validDevices = await this.listValidDeviceEntries();
        const invalidDevices = await this.listInvalidDeviceEntries();
        const pointerDevice = this.resolvePointerDevice(validDevices);
        const pointerStatus = this.getPointerStatus(pointerDevice);
        const ownerInstallIdHash = await this.getCurrentOwnerInstallIdHash();
        const hashMatchedDevices = ownerInstallIdHash
            ? validDevices.filter(
                  (entry) => entry.metadata.ownerInstallIdHash === ownerInstallIdHash,
              )
            : [];

        if (hashMatchedDevices.length > 1) {
            return {
                currentDevice: null,
                validDevices,
                invalidDevices,
                pointerStatus,
                identityConflictReason: SYRO_DEVICE_IDENTITY_CONFLICT_REASON,
                ownerInstallIdHash,
                pointerDevice,
                currentDeviceSource: "conflict",
            };
        }

        if (hashMatchedDevices.length === 1) {
            return {
                currentDevice: hashMatchedDevices[0],
                validDevices,
                invalidDevices,
                pointerStatus,
                identityConflictReason: null,
                ownerInstallIdHash,
                pointerDevice,
                currentDeviceSource: "owner-hash",
            };
        }

        if (pointerDevice && pointerDevice.metadata.ownerInstallIdHash === null) {
            return {
                currentDevice: pointerDevice,
                validDevices,
                invalidDevices,
                pointerStatus,
                identityConflictReason: null,
                ownerInstallIdHash,
                pointerDevice,
                currentDeviceSource: "legacy-pointer",
            };
        }

        return {
            currentDevice: null,
            validDevices,
            invalidDevices,
            pointerStatus,
            identityConflictReason: null,
            ownerInstallIdHash,
            pointerDevice,
            currentDeviceSource: "none",
        };
    }

    private resolvePointerDevice(
        validDevices: SyroValidDeviceEntry[],
    ): SyroValidDeviceEntry | null {
        const persistedCurrentDevice = this.loadPersistedCurrentDeviceState();
        if (!persistedCurrentDevice) {
            return null;
        }

        return (
            validDevices.find(
                (entry) =>
                    entry.deviceId === persistedCurrentDevice.deviceId &&
                    entry.deviceFolderName === persistedCurrentDevice.deviceFolderName,
            ) ?? null
        );
    }

    private getPointerStatus(
        pointerDevice: SyroValidDeviceEntry | null,
    ): "valid" | "missing" | "invalid" {
        const persistedCurrentDevice = this.loadPersistedCurrentDeviceState();
        if (!persistedCurrentDevice) {
            return "missing";
        }
        return pointerDevice ? "valid" : "invalid";
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

    private clearPersistedCurrentDeviceState(): void {
        const storage = this.getStorage();
        if (!storage) {
            return;
        }

        storage.removeItem(this.getCurrentDeviceStorageKey());
    }

    private loadPersistedInstallInstanceState(): PersistedInstallInstanceState | null {
        const storage = this.getStorage();
        if (!storage) {
            return this.installInstanceIdFallback
                ? {
                      version: SYRO_INSTALL_INSTANCE_STATE_VERSION,
                      installInstanceId: this.installInstanceIdFallback,
                  }
                : null;
        }

        try {
            const raw = storage.getItem(this.getInstallInstanceStorageKey());
            if (!raw) {
                return null;
            }
            const parsed = parsePersistedInstallInstanceState(parseJsonUnknown(raw));
            this.installInstanceIdFallback =
                parsed?.installInstanceId ?? this.installInstanceIdFallback;
            return parsed;
        } catch {
            return null;
        }
    }

    private persistInstallInstanceState(state: PersistedInstallInstanceState): void {
        this.installInstanceIdFallback = state.installInstanceId;
        const storage = this.getStorage();
        if (!storage) {
            return;
        }

        storage.setItem(this.getInstallInstanceStorageKey(), JSON.stringify(state));
    }

    private getOrCreateInstallInstanceId(): string {
        const persistedState = this.loadPersistedInstallInstanceState();
        if (persistedState) {
            return persistedState.installInstanceId;
        }

        const installInstanceId = createDeviceId();
        this.persistInstallInstanceState({
            version: SYRO_INSTALL_INSTANCE_STATE_VERSION,
            installInstanceId,
        });
        return installInstanceId;
    }

    private async getCurrentOwnerInstallIdHash(): Promise<string | null> {
        const installInstanceId = this.getOrCreateInstallInstanceId();
        return installInstanceId ? sha256Hex(installInstanceId) : null;
    }

    private getStorage(): Storage | null {
        try {
            return globalThis.localStorage ?? null;
        } catch {
            return null;
        }
    }

    private getCurrentDeviceStorageKey(): string {
        return `syro:current-device:${this.getStorageScopeKey()}`;
    }

    private getInstallInstanceStorageKey(): string {
        return `syro:install-instance:${this.getStorageScopeKey()}`;
    }

    private getStorageScopeKey(): string {
        const vaultAdapter = this.app.vault.adapter as { basePath?: string };
        const basePath =
            typeof vaultAdapter.basePath === "string" && vaultAdapter.basePath.length > 0
                ? vaultAdapter.basePath
                : this.app.vault.getName();

        return `${basePath}:${this.manifestDir}`;
    }

    private async listValidDeviceEntries(): Promise<SyroValidDeviceEntry[]> {
        if (!this.adapter.list) {
            return [];
        }

        const listing = await this.adapter.list(
            trimTrailingSlash(this.buildRootPaths().devicesRoot),
        );
        const validDevices: SyroValidDeviceEntry[] = [];

        for (const folderPath of listing.folders ?? []) {
            const deviceRoot = trimTrailingSlash(folderPath);
            const deviceFolderName =
                deviceRoot.slice(deviceRoot.lastIndexOf("/") + 1) || deviceRoot;
            const deviceMetaPath = joinPath(deviceRoot, "device.json");
            if (!(await this.adapter.exists(deviceMetaPath))) {
                continue;
            }

            try {
                const metadata = parseDeviceMetadata(
                    parseJsonUnknown(await this.adapter.read(deviceMetaPath)),
                );
                if (!metadata) {
                    continue;
                }

                const deviceReviewCount = await this.readDeviceReviewCount(deviceRoot);
                validDevices.push({
                    deviceId: metadata.deviceId,
                    deviceName: metadata.deviceName,
                    shortDeviceId: metadata.shortDeviceId,
                    deviceFolderName,
                    lastSeenAt: metadata.lastSeenAt,
                    baselineFromDeviceId: metadata.baselineFromDeviceId,
                    baselineBuiltAt: metadata.baselineBuiltAt,
                    deviceRoot,
                    deviceMetaPath,
                    deviceReviewCount,
                    metadata,
                });
            } catch {
                continue;
            }
        }

        return validDevices.sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
    }

    private async listInvalidDeviceEntries(): Promise<SyroInvalidDeviceEntry[]> {
        if (!this.adapter.list) {
            return [];
        }

        const listing = await this.adapter.list(
            trimTrailingSlash(this.buildRootPaths().devicesRoot),
        );
        const invalidDevices: SyroInvalidDeviceEntry[] = [];

        for (const folderPath of listing.folders ?? []) {
            const deviceRoot = trimTrailingSlash(folderPath);
            const deviceFolderName =
                deviceRoot.slice(deviceRoot.lastIndexOf("/") + 1) || deviceRoot;
            const deviceMetaPath = joinPath(deviceRoot, "device.json");
            const summary = await this.getDeviceDirectorySummary(deviceRoot);
            const deviceReviewCount = await this.readDeviceReviewCount(deviceRoot);
            const lastSeenAt = await this.readInvalidDeviceLastSeenAt(deviceMetaPath);

            if (!(await this.adapter.exists(deviceMetaPath))) {
                invalidDevices.push({
                    deviceFolderName,
                    deviceRoot,
                    reason: "missing-device-json",
                    deviceReviewCount,
                    lastSeenAt,
                    files: summary.files,
                    folders: summary.folders,
                });
                continue;
            }

            try {
                const metadata = parseDeviceMetadata(
                    parseJsonUnknown(await this.adapter.read(deviceMetaPath)),
                );
                if (metadata) {
                    continue;
                }

                invalidDevices.push({
                    deviceFolderName,
                    deviceRoot,
                    reason: "invalid-device-json",
                    deviceReviewCount,
                    lastSeenAt,
                    files: summary.files,
                    folders: summary.folders,
                });
            } catch {
                invalidDevices.push({
                    deviceFolderName,
                    deviceRoot,
                    reason: "unreadable-device-json",
                    deviceReviewCount,
                    lastSeenAt,
                    files: summary.files,
                    folders: summary.folders,
                });
            }
        }

        return invalidDevices.sort((left, right) =>
            left.deviceFolderName.localeCompare(right.deviceFolderName),
        );
    }

    private async getDeviceDirectorySummary(
        deviceRoot: string,
    ): Promise<{ files: string[]; folders: string[] }> {
        if (!this.adapter.list) {
            return { files: [], folders: [] };
        }

        try {
            const listing = await this.adapter.list(trimTrailingSlash(deviceRoot));
            return {
                files: (listing.files ?? [])
                    .map((path) => path.slice(path.lastIndexOf("/") + 1))
                    .sort(),
                folders: (listing.folders ?? [])
                    .map((path) => path.slice(path.lastIndexOf("/") + 1))
                    .sort(),
            };
        } catch {
            return { files: [], folders: [] };
        }
    }

    private async readDeviceReviewCount(deviceRoot: string): Promise<number> {
        const dailyStatePath = joinPath(deviceRoot, "daily-state.json");
        if (!(await this.adapter.exists(dailyStatePath))) {
            return 0;
        }

        try {
            const parsed = parseDailyState(parseJsonUnknown(await this.adapter.read(dailyStatePath)));
            return normalizeDeviceReviewCount(parsed?.deviceReviewCount);
        } catch {
            return 0;
        }
    }

    private async readInvalidDeviceLastSeenAt(deviceMetaPath: string): Promise<string | null> {
        if (!(await this.adapter.exists(deviceMetaPath))) {
            return null;
        }

        try {
            const parsed = parseJsonUnknown(await this.adapter.read(deviceMetaPath));
            if (!isRecord(parsed)) {
                return null;
            }
            const lastSeenAt = getStringProp(parsed, "lastSeenAt")?.trim() ?? null;
            return lastSeenAt && Number.isFinite(Date.parse(lastSeenAt)) ? lastSeenAt : null;
        } catch {
            return null;
        }
    }

    private toValidDeviceEntry(layout: SyroPersistenceLayout): SyroValidDeviceEntry {
        const deviceFolderName = this.getDeviceFolderNameFromLayout(layout);
        return {
            deviceId: layout.device.deviceId,
            deviceName: layout.device.deviceName,
            shortDeviceId: layout.device.shortDeviceId,
            deviceFolderName,
            lastSeenAt: layout.device.lastSeenAt,
            baselineFromDeviceId: layout.device.baselineFromDeviceId,
            baselineBuiltAt: layout.device.baselineBuiltAt,
            deviceRoot: layout.deviceRoot,
            deviceMetaPath: layout.deviceMetaPath,
            deviceReviewCount: 0,
            metadata: layout.device,
        };
    }

    private toBaselineCandidates(validDevices: SyroValidDeviceEntry[]): SyroBaselineCandidate[] {
        return validDevices.map((entry) => ({
            deviceId: entry.deviceId,
            deviceName: entry.deviceName,
            shortDeviceId: entry.shortDeviceId,
            deviceFolderName: entry.deviceFolderName,
            lastSeenAt: entry.lastSeenAt,
            baselineFromDeviceId: entry.baselineFromDeviceId,
            baselineBuiltAt: entry.baselineBuiltAt,
        }));
    }

    private async removeDirectoryRecursive(targetDir: string): Promise<void> {
        const normalizedDir = trimTrailingSlash(targetDir);
        if (!(await this.adapter.exists(normalizedDir))) {
            return;
        }

        if (this.adapter.list) {
            const listing = await this.adapter.list(normalizedDir);
            for (const filePath of listing.files ?? []) {
                await this.adapter.remove(normalizePath(filePath));
            }
            for (const folderPath of listing.folders ?? []) {
                await this.removeDirectoryRecursive(folderPath);
            }
        }

        if (typeof this.adapter.rmdir === "function") {
            await this.adapter.rmdir(normalizedDir, false);
            return;
        }

        await this.adapter.remove(normalizedDir);
    }

    private async cleanupUnfinishedLayout(layout: SyroPersistenceLayout): Promise<void> {
        this.logDebug("[SR-SyroWorkspace] cleanupUnfinishedLayout:start", {
            deviceRoot: layout.deviceRoot,
            sessionRoot: layout.currentDeviceSessionsRoot,
        });
        if (await this.adapter.exists(layout.currentDeviceSessionsRoot)) {
            await this.removeDirectoryRecursive(layout.currentDeviceSessionsRoot);
        }

        await this.removeDirectoryRecursive(layout.deviceRoot);

        const persistedCurrentDevice = this.loadPersistedCurrentDeviceState();
        if (
            persistedCurrentDevice?.deviceId === layout.device.deviceId &&
            persistedCurrentDevice.deviceFolderName === this.getDeviceFolderNameFromLayout(layout)
        ) {
            this.clearPersistedCurrentDeviceState();
        }
        this.logDebug("[SR-SyroWorkspace] cleanupUnfinishedLayout:done", {
            deviceRoot: layout.deviceRoot,
        });
    }

    private async writeJson(path: string, value: unknown): Promise<void> {
        await ensureDirectory(this.adapter, dirname(path));
        await this.adapter.write(path, JSON.stringify(value, null, 2));
    }

    private getMigrationBackupsRoot(): string {
        return joinPath(trimTrailingSlash(this.manifestDir), "migration-backups");
    }

    private async prepareMigrationBackup(layout: SyroPersistenceLayout): Promise<void> {
        const existingLegacyFiles = await this.listExistingLegacySourceFiles(layout);

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

    private getLegacySourceFiles(): Array<[string, string]> {
        const legacyPluginDataPath = joinPath(trimTrailingSlash(this.manifestDir), "data.json");
        const legacyCardsPath = normalizePath(getStorePath(this.manifestDir, this.settings));
        const legacyNotesPath = replaceFileName(legacyCardsPath, "review_notes.json");
        const legacyTimelinePath = replaceFileName(legacyCardsPath, "review_commits.json");
        const legacyOverlayPath = replaceFileName(
            legacyCardsPath,
            "tracked_files.review_overlay.json",
        );
        const legacyNoteCachePath = replaceFileName(legacyCardsPath, "note_cache.json");

        return [
            ["data.json", legacyPluginDataPath],
            ["tracked_files.json", legacyCardsPath],
            ["review_notes.json", legacyNotesPath],
            ["review_commits.json", legacyTimelinePath],
            ["tracked_files.review_overlay.json", legacyOverlayPath],
            ["note_cache.json", legacyNoteCachePath],
        ];
    }

    private async isLegacyPluginDataFile(path: string): Promise<boolean> {
        if (!(await this.adapter.exists(path))) {
            return false;
        }

        try {
            const parsed = parseJsonUnknown(await this.adapter.read(path));
            if (!isRecord(parsed)) {
                return true;
            }

            const version = getNumberProp(parsed, "version");
            const schemaVersion = getStringProp(parsed, "schemaVersion")?.trim();
            if (
                version === 2 &&
                (schemaVersion === "0.0.12" || hasSyro012MigrationMarker(parsed))
            ) {
                return false;
            }

            return true;
        } catch {
            return true;
        }
    }

    private async listExistingLegacySourceFiles(
        layout?: SyroPersistenceLayout,
    ): Promise<Array<[string, string]>> {
        const existingLegacyFiles: Array<[string, string]> = [];

        for (const [name, path] of this.getLegacySourceFiles()) {
            if (name === "data.json") {
                if (await this.isLegacyPluginDataFile(path)) {
                    existingLegacyFiles.push([name, path]);
                }
                continue;
            }

            if (await this.adapter.exists(path)) {
                existingLegacyFiles.push([name, path]);
            }
        }

        if (!layout) {
            return existingLegacyFiles;
        }

        for (const [name, path] of this.getCompatibilitySourceFiles(layout)) {
            if (await this.adapter.exists(path)) {
                existingLegacyFiles.push([name, path]);
            }
        }

        return existingLegacyFiles;
    }

    private getCompatibilitySourceFiles(layout: SyroPersistenceLayout): Array<[string, string]> {
        const legacyLocalStateRoot = joinPath(trimTrailingSlash(this.manifestDir), "local-state");
        return [
            ["sync-merge-state.json", joinPath(layout.deviceRoot, "sync-merge-state.json")],
            [
                "local-state/cards.review_overlay.json",
                joinPath(legacyLocalStateRoot, "cards.review_overlay.json"),
            ],
            [
                "local-state/migration-state.json",
                joinPath(legacyLocalStateRoot, "migration-state.json"),
            ],
        ];
    }

    private async migrateLegacyFiles(layout: SyroPersistenceLayout): Promise<void> {
        const legacyFiles = this.getLegacySourceFiles();
        const legacyCardsPath =
            legacyFiles.find(([name]) => name === "tracked_files.json")?.[1] ?? "";
        const legacyNotesPath =
            legacyFiles.find(([name]) => name === "review_notes.json")?.[1] ?? "";
        const legacyTimelinePath =
            legacyFiles.find(([name]) => name === "review_commits.json")?.[1] ?? "";
        const legacyOverlayPath =
            legacyFiles.find(([name]) => name === "tracked_files.review_overlay.json")?.[1] ?? "";
        const legacyNoteCachePath =
            legacyFiles.find(([name]) => name === "note_cache.json")?.[1] ?? "";

        // Copy-only migration keeps the old files intact so a partial rollout cannot strand user data.
        await copyFileIfMissing(this.adapter, legacyCardsPath, layout.cardsPath);
        await copyFileIfMissing(this.adapter, legacyNotesPath, layout.notesPath);
        await copyFileIfMissing(this.adapter, legacyTimelinePath, layout.timelinePath);
        await copyFileIfMissing(this.adapter, legacyNoteCachePath, layout.noteCachePath);
        if (!(await this.adapter.exists(layout.deckOptionsPath))) {
            const snapshot = createDeckOptionsStoreSnapshot(this.settings);
            await this.writeJson(layout.deckOptionsPath, snapshot.state);
        }

        await this.migrateCompatibilityLayout(layout);
        await copyFileIfMissing(this.adapter, legacyOverlayPath, layout.cardsOverlayPath);
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
            | "settingsPath"
            | "trackingRulesPath"
            | "dailyStatePath"
            | "deviceStatePath"
            | "licenseStatePath"
            | "cardsOverlayPath"
            | "currentDeviceSessionsRoot"
            | "currentDeviceSessionFilePath"
            | "noteCachePath"
            | "device"
        >,
        deviceFolderName: string,
        metadata: SyroDeviceMetadata,
    ): SyroPersistenceLayout {
        const deviceRoot = joinPath(roots.devicesRoot, deviceFolderName);
        const currentDeviceSessionsRoot = joinPath(roots.sessionsRoot, deviceFolderName);
        return {
            ...roots,
            deviceRoot,
            deviceMetaPath: joinPath(deviceRoot, "device.json"),
            cardsPath: joinPath(deviceRoot, "cards.json"),
            notesPath: joinPath(deviceRoot, "notes.json"),
            timelinePath: joinPath(deviceRoot, "timeline.json"),
            deckOptionsPath: joinPath(deviceRoot, "deck-options.json"),
            settingsPath: joinPath(deviceRoot, "settings.json"),
            trackingRulesPath: joinPath(deviceRoot, "tracking-rules.json"),
            dailyStatePath: joinPath(deviceRoot, "daily-state.json"),
            deviceStatePath: joinPath(deviceRoot, "device-state.json"),
            licenseStatePath: joinPath(deviceRoot, "license-state.json"),
            cardsOverlayPath: joinPath(deviceRoot, "cards.review_overlay.json"),
            currentDeviceSessionsRoot,
            currentDeviceSessionFilePath: buildCurrentDeviceSessionFilePath(
                roots.sessionsRoot,
                deviceFolderName,
            ),
            noteCachePath: joinPath(deviceRoot, "note-cache.json"),
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
            | "settingsPath"
            | "trackingRulesPath"
            | "dailyStatePath"
            | "deviceStatePath"
            | "licenseStatePath"
            | "cardsOverlayPath"
            | "currentDeviceSessionsRoot"
            | "currentDeviceSessionFilePath"
            | "noteCachePath"
            | "device"
        >,
        deviceName: string,
        forcedDeviceId?: string,
        forcedDeviceFolderName?: string,
        ownerInstallIdHash?: string | null,
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
            ownerInstallIdHash: ownerInstallIdHash ?? null,
            baselineFromDeviceId: null,
            baselineBuiltAt: null,
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
        requireDomainSnapshots = false,
    ): Promise<{
        ok: boolean;
        reason: string | null;
        validation: SyroMigrationValidationResult | null;
    }> {
        this.logDebug("[SR-SyroWorkspace] prepareReadyLayout:start", {
            deviceRoot: layout.deviceRoot,
            shouldRunMigration,
            requireDomainSnapshots,
        });
        await ensureDirectory(this.adapter, layout.deviceRoot);
        await ensureDirectory(this.adapter, layout.currentDeviceSessionsRoot);

        if (shouldRunMigration) {
            await this.prepareMigrationBackup(layout);
            await this.migrateLegacyFiles(layout);
        }

        await this.writeJson(layout.deviceMetaPath, layout.device);
        await this.ensureFormalDeviceFiles(layout);

        const validation = await this.validateGeneratedFiles(layout, requireDomainSnapshots);
        if (!validation.ok) {
            this.logDebug("[SR-SyroWorkspace] prepareReadyLayout:validation-failed", {
                deviceRoot: layout.deviceRoot,
                reason: validation.reason,
                validatedPaths: validation.validatedPaths,
            });
            return {
                ok: false,
                reason:
                    validation.reason ??
                    "[SR-Syro] Migration validation failed for generated formal files.",
                validation,
            };
        }

        await this.clearOtherOwnerInstallDeviceBindings(
            layout.device.ownerInstallIdHash,
            layout.device.deviceId,
        );
        this.persistCurrentDeviceState({
            version: SYRO_CURRENT_DEVICE_STATE_VERSION,
            deviceId: layout.device.deviceId,
            deviceFolderName: this.getDeviceFolderNameFromLayout(layout),
        });
        this.logDebug("[SR-SyroWorkspace] prepareReadyLayout:ready", {
            deviceRoot: layout.deviceRoot,
            validatedPaths: validation.validatedPaths,
        });

        return {
            ok: true,
            reason: null,
            validation,
        };
    }

    private async clearOtherOwnerInstallDeviceBindings(
        ownerInstallIdHash: string | null,
        retainedDeviceId: string,
    ): Promise<void> {
        if (!ownerInstallIdHash) {
            return;
        }

        const now = new Date().toISOString();
        const validDevices = await this.listValidDeviceEntries();
        for (const entry of validDevices) {
            if (
                entry.deviceId === retainedDeviceId ||
                entry.metadata.ownerInstallIdHash !== ownerInstallIdHash
            ) {
                continue;
            }

            await this.writeJson(entry.deviceMetaPath, {
                ...entry.metadata,
                ownerInstallIdHash: null,
                updatedAt: now,
            });
        }
    }

    private async validateGeneratedFiles(
        layout: SyroPersistenceLayout,
        requireDomainSnapshots: boolean,
    ): Promise<SyroMigrationValidationResult> {
        const checks: Array<[string, (raw: string) => boolean, boolean]> = [
            [
                layout.deviceMetaPath,
                (raw) => parseDeviceMetadata(parseJsonUnknown(raw)) !== null,
                true,
            ],
            [layout.cardsPath, validateCardsStoreFile, requireDomainSnapshots],
            [layout.notesPath, validateNotesStoreFile, requireDomainSnapshots],
            [layout.timelinePath, validateTimelineStoreFile, requireDomainSnapshots],
            [layout.deckOptionsPath, validateDeckOptionsStoreFile, requireDomainSnapshots],
            [layout.settingsPath, (raw) => isRecord(parseJsonUnknown(raw)), requireDomainSnapshots],
            [
                layout.trackingRulesPath,
                (raw) => isRecord(parseJsonUnknown(raw)),
                requireDomainSnapshots,
            ],
            [
                layout.dailyStatePath,
                (raw) => isRecord(parseJsonUnknown(raw)),
                requireDomainSnapshots,
            ],
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

    private async writeJsonIfMissing(
        path: string,
        value: unknown,
        reason: string,
    ): Promise<void> {
        if (await this.adapter.exists(path)) {
            return;
        }

        await this.writeJson(path, value);
        this.logDebug("[SR-SyroWorkspace] seeded missing formal file", {
            path,
            reason,
        });
    }

    private async ensureFormalDeviceFiles(layout: SyroPersistenceLayout): Promise<void> {
        await this.writeJsonIfMissing(layout.cardsPath, createDefaultSrsData(), "cards-default");
        await this.writeJsonIfMissing(
            layout.notesPath,
            createDefaultNoteReviewStoreFile(),
            "notes-default",
        );
        await this.writeJsonIfMissing(
            layout.timelinePath,
            createDefaultTimelineStoreFile(),
            "timeline-default",
        );
        await this.writeJsonIfMissing(
            layout.deckOptionsPath,
            createDeckOptionsStoreSnapshot(this.settings).state,
            "deck-options-default",
        );
        await this.writeJsonIfMissing(
            layout.settingsPath,
            createDefaultSharedSettingsState(),
            "shared-settings-default",
        );
        await this.writeJsonIfMissing(
            layout.trackingRulesPath,
            createDefaultTrackingRulesState(),
            "tracking-rules-default",
        );
        await this.writeJsonIfMissing(
            layout.dailyStatePath,
            createDefaultDailyState(),
            "daily-state-default",
        );
        await this.writeJsonIfMissing(
            layout.deviceStatePath,
            createDefaultDeviceState(),
            "device-state-default",
        );
        await this.writeJsonIfMissing(
            layout.licenseStatePath,
            createDefaultLicenseState(),
            "license-state-default",
        );
        await this.writeJsonIfMissing(
            layout.noteCachePath,
            createDefaultNoteCacheFile(),
            "note-cache-default",
        );
    }

    private async copyBaselineDomainFiles(
        source: SyroBaselineCandidate,
        targetLayout: SyroPersistenceLayout,
    ): Promise<void> {
        const sourceRoot = joinPath(this.buildRootPaths().devicesRoot, source.deviceFolderName);
        this.logDebug("[SR-SyroWorkspace] copyBaselineDomainFiles:start", {
            sourceRoot,
            targetRoot: targetLayout.deviceRoot,
        });
        await ensureDirectory(this.adapter, targetLayout.deviceRoot);
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
        await copyFile(
            this.adapter,
            joinPath(sourceRoot, "settings.json"),
            targetLayout.settingsPath,
        );
        await copyFile(
            this.adapter,
            joinPath(sourceRoot, "tracking-rules.json"),
            targetLayout.trackingRulesPath,
        );
        await copyFile(
            this.adapter,
            joinPath(sourceRoot, "daily-state.json"),
            targetLayout.dailyStatePath,
        );
        await copyFile(
            this.adapter,
            joinPath(sourceRoot, "note-cache.json"),
            targetLayout.noteCachePath,
        );
        this.logDebug("[SR-SyroWorkspace] copyBaselineDomainFiles:done", {
            sourceRoot,
            targetRoot: targetLayout.deviceRoot,
        });
    }

    private async replaceCurrentDeviceDomainFiles(
        source: SyroValidDeviceEntry,
        targetLayout: SyroPersistenceLayout,
    ): Promise<void> {
        const sourceRoot = joinPath(this.buildRootPaths().devicesRoot, source.deviceFolderName);
        this.logDebug("[SR-SyroWorkspace] replaceCurrentDeviceDomainFiles:start", {
            sourceRoot,
            targetRoot: targetLayout.deviceRoot,
        });
        await ensureDirectory(this.adapter, targetLayout.deviceRoot);
        await replaceFileFromSource(
            this.adapter,
            joinPath(sourceRoot, "cards.json"),
            targetLayout.cardsPath,
        );
        await replaceFileFromSource(
            this.adapter,
            joinPath(sourceRoot, "notes.json"),
            targetLayout.notesPath,
        );
        await replaceFileFromSource(
            this.adapter,
            joinPath(sourceRoot, "timeline.json"),
            targetLayout.timelinePath,
        );
        await replaceFileFromSource(
            this.adapter,
            joinPath(sourceRoot, "deck-options.json"),
            targetLayout.deckOptionsPath,
        );
        await replaceFileFromSource(
            this.adapter,
            joinPath(sourceRoot, "settings.json"),
            targetLayout.settingsPath,
        );
        await replaceFileFromSource(
            this.adapter,
            joinPath(sourceRoot, "tracking-rules.json"),
            targetLayout.trackingRulesPath,
        );
        await replaceFileFromSource(
            this.adapter,
            joinPath(sourceRoot, "daily-state.json"),
            targetLayout.dailyStatePath,
        );
        await replaceFileFromSource(
            this.adapter,
            joinPath(sourceRoot, "note-cache.json"),
            targetLayout.noteCachePath,
        );
        this.logDebug("[SR-SyroWorkspace] replaceCurrentDeviceDomainFiles:done", {
            sourceRoot,
            targetRoot: targetLayout.deviceRoot,
        });
    }

    private async listBaselineCandidates(): Promise<SyroBaselineCandidate[]> {
        return this.toBaselineCandidates(await this.listValidDeviceEntries());
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
        return (await this.listExistingLegacySourceFiles()).length > 0;
    }

    private async migrateCompatibilityLayout(layout: SyroPersistenceLayout): Promise<void> {
        await this.migrateLocalStateFiles(layout);
    }

    private async migrateLocalStateFiles(layout: SyroPersistenceLayout): Promise<void> {
        const legacyLocalStateRoot = joinPath(trimTrailingSlash(this.manifestDir), "local-state");
        await copyFileIfMissing(
            this.adapter,
            joinPath(legacyLocalStateRoot, "cards.review_overlay.json"),
            layout.cardsOverlayPath,
        );
    }
}
