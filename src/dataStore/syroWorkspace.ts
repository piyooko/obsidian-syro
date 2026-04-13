import { App, DataAdapter, Platform } from "obsidian";
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
}

interface PersistedCurrentDeviceState {
    version: number;
    deviceId: string;
    deviceFolderName: string;
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
    migrationStatePath: string;
    noteCachePath: string;
    device: SyroDeviceMetadata;
}

type FileBackedAdapter = Pick<DataAdapter, "exists" | "mkdir" | "read" | "write"> & {
    basePath?: string;
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

export class SyroWorkspace {
    private readonly adapter: FileBackedAdapter;

    constructor(
        private readonly app: App,
        private readonly manifestDir: string,
        private readonly settings: SRSettings,
    ) {
        this.adapter = this.app.vault.adapter as FileBackedAdapter;
    }

    async initialize(): Promise<SyroPersistenceLayout> {
        const roots = this.buildRootPaths();

        await ensureDirectory(this.adapter, roots.syncRoot);
        await ensureDirectory(this.adapter, roots.devicesRoot);
        await ensureDirectory(this.adapter, roots.sessionsRoot);
        await ensureDirectory(this.adapter, roots.sessionsArchiveRoot);
        await ensureDirectory(this.adapter, roots.localRoot);

        const persistedCurrentDevice = this.loadPersistedCurrentDeviceState();
        const existingMetadata = await this.loadExistingMetadata(persistedCurrentDevice);
        const reusableMetadata =
            existingMetadata &&
            (!persistedCurrentDevice ||
                existingMetadata.deviceId === persistedCurrentDevice.deviceId)
                ? existingMetadata
                : null;
        const now = new Date().toISOString();

        const deviceId =
            reusableMetadata?.deviceId ?? persistedCurrentDevice?.deviceId ?? createDeviceId();
        const deviceName = reusableMetadata?.deviceName ?? createDefaultDeviceName();
        const shortDeviceId = reusableMetadata?.shortDeviceId ?? createShortDeviceId(deviceId);
        const deviceFolderName =
            persistedCurrentDevice?.deviceFolderName &&
            reusableMetadata?.deviceId === persistedCurrentDevice.deviceId
                ? persistedCurrentDevice.deviceFolderName
                : createDeviceFolderName(deviceName, shortDeviceId);

        const deviceRoot = joinPath(roots.devicesRoot, deviceFolderName);
        const localDeviceRoot = joinPath(roots.localRoot, deviceFolderName);
        await ensureDirectory(this.adapter, deviceRoot);
        await ensureDirectory(this.adapter, localDeviceRoot);

        const metadata: SyroDeviceMetadata = {
            version: SYRO_DEVICE_FILE_VERSION,
            deviceId,
            deviceName,
            shortDeviceId,
            createdAt: reusableMetadata?.createdAt ?? now,
            updatedAt: now,
            lastSeenAt: now,
            baselineFromDeviceId: reusableMetadata?.baselineFromDeviceId ?? null,
            baselineBuiltAt: reusableMetadata?.baselineBuiltAt ?? null,
            importedSessionIds: reusableMetadata?.importedSessionIds ?? [],
        };

        const layout: SyroPersistenceLayout = {
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
            migrationStatePath: joinPath(localDeviceRoot, "migration-state.json"),
            noteCachePath: joinPath(localDeviceRoot, "note_cache.json"),
            device: metadata,
        };

        await this.migrateLegacyFiles(layout);
        await this.writeJson(layout.deviceMetaPath, metadata);
        this.persistCurrentDeviceState({
            version: SYRO_CURRENT_DEVICE_STATE_VERSION,
            deviceId,
            deviceFolderName,
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
        | "migrationStatePath"
        | "noteCachePath"
        | "device"
    > {
        const manifestRoot = trimTrailingSlash(this.manifestDir);
        const syncRoot = joinPath(manifestRoot, "syro");
        return {
            syncRoot,
            devicesRoot: joinPath(syncRoot, "devices"),
            sessionsRoot: joinPath(syncRoot, "sessions"),
            sessionsArchiveRoot: joinPath(syncRoot, "sessions-archive"),
            localRoot: joinPath(manifestRoot, "local-state"),
        };
    }

    private async loadExistingMetadata(
        persistedCurrentDevice: PersistedCurrentDeviceState | null,
    ): Promise<SyroDeviceMetadata | null> {
        if (!persistedCurrentDevice) {
            return null;
        }

        const deviceMetaPath = joinPath(
            this.buildRootPaths().devicesRoot,
            persistedCurrentDevice.deviceFolderName,
            "device.json",
        );
        if (!(await this.adapter.exists(deviceMetaPath))) {
            return null;
        }

        try {
            const raw = await this.adapter.read(deviceMetaPath);
            return parseDeviceMetadata(parseJsonUnknown(raw));
        } catch {
            return null;
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

    private async migrateLegacyFiles(layout: SyroPersistenceLayout): Promise<void> {
        const legacyCardsPath = normalizePath(getStorePath(this.manifestDir, this.settings));
        const legacyNotesPath = replaceFileName(legacyCardsPath, "review_notes.json");
        const legacyTimelinePath = replaceFileName(legacyCardsPath, "review_commits.json");
        const legacyOverlayPath = replaceFileName(
            legacyCardsPath,
            "tracked_files.review_overlay.json",
        );
        const legacyNoteCachePath = replaceFileName(legacyCardsPath, "note_cache.json");

        // Copy-only migration keeps the old files intact so a partial rollout cannot strand user data.
        await copyFileIfMissing(this.adapter, legacyCardsPath, layout.cardsPath);
        await copyFileIfMissing(this.adapter, legacyNotesPath, layout.notesPath);
        await copyFileIfMissing(this.adapter, legacyTimelinePath, layout.timelinePath);
        await copyFileIfMissing(this.adapter, legacyOverlayPath, layout.cardsOverlayPath);
        await copyFileIfMissing(this.adapter, legacyNoteCachePath, layout.noteCachePath);
    }
}
