import { Iadapter } from "./adapter";
import type { FileIdentityStorePathConfig } from "./syroWorkspace";
import {
    cloneSyncEntities,
    compareIsoTime,
    markSyncEntity,
    parseSyncEntities,
    pruneSyncEntities,
    shouldApplySyncEntity,
    type PersistedSyncEntityState,
} from "./syroSyncMeta";
import { getNumberProp, getStringProp, isRecord, parseJsonUnknown } from "src/util/typeGuards";

const FILE_IDENTITY_STORE_VERSION = 1;
const FILE_IDENTITY_SEED_PREFIX = "syro:file:";

export interface SyroFileIdentity {
    uuid: string;
    createdAt: string;
    updatedAt: string;
    path: string;
    aliases: string[];
    deleted: boolean;
}

export interface SyroFileIdentityStoreFile {
    version: number;
    entries: Record<string, SyroFileIdentity>;
    syncEntities?: Record<string, PersistedSyncEntityState>;
}

export interface SyroFileIdentityInput {
    uuid: string;
    createdAt: string;
    updatedAt?: string;
    path: string;
    aliases?: string[];
    deleted?: boolean;
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/g, "").trim();
}

function hashSeed(seed: string): string {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index++) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createDeterministicFileIdentityUuid(path: string): string {
    const normalizedPath = normalizePath(path);
    return `file-${hashSeed(`${FILE_IDENTITY_SEED_PREFIX}${normalizedPath}`)}`;
}

export function buildFileIdentityTargetUuid(fileUuid: string): string {
    return `file:${fileUuid}`;
}

export function parseFileIdentityUuidFromTarget(targetUuid: string): string {
    return targetUuid.startsWith("file:") ? targetUuid.slice("file:".length) : "";
}

export function normalizeFileIdentityAliases(
    canonicalUuid: string,
    aliases: readonly string[] | null | undefined,
): string[] {
    const normalized = new Set<string>();
    for (const candidate of aliases ?? []) {
        if (typeof candidate !== "string") {
            continue;
        }
        const trimmed = candidate.trim();
        if (!trimmed || trimmed === canonicalUuid) {
            continue;
        }
        normalized.add(trimmed);
    }
    return [...normalized].sort((left, right) => left.localeCompare(right));
}

export function normalizeSyroFileIdentity(input: SyroFileIdentityInput): SyroFileIdentity {
    const path = normalizePath(input.path);
    const uuid = (input.uuid || createDeterministicFileIdentityUuid(path)).trim();
    const createdAt = input.createdAt?.trim() || new Date(0).toISOString();
    const updatedAt = input.updatedAt?.trim() || createdAt;

    return {
        uuid,
        createdAt,
        updatedAt,
        path,
        aliases: normalizeFileIdentityAliases(uuid, input.aliases),
        deleted: input.deleted === true,
    };
}

function cloneFileIdentity(identity: SyroFileIdentity): SyroFileIdentity {
    return {
        uuid: identity.uuid,
        createdAt: identity.createdAt,
        updatedAt: identity.updatedAt,
        path: identity.path,
        aliases: [...identity.aliases],
        deleted: identity.deleted === true,
    };
}

function cloneEntries(
    entries: Record<string, SyroFileIdentity> | null | undefined,
): Record<string, SyroFileIdentity> {
    return Object.fromEntries(
        Object.entries(entries ?? {}).map(([uuid, entry]) => [uuid, cloneFileIdentity(entry)]),
    );
}

function parseFileIdentity(value: unknown): SyroFileIdentity | null {
    if (!isRecord(value)) {
        return null;
    }

    const uuid = getStringProp(value, "uuid")?.trim();
    const createdAt = getStringProp(value, "createdAt")?.trim();
    const updatedAt = getStringProp(value, "updatedAt")?.trim();
    const path = getStringProp(value, "path")?.trim();
    if (!uuid || !createdAt || !updatedAt || !path) {
        return null;
    }

    const aliases = Array.isArray(value["aliases"])
        ? value["aliases"].filter((entry): entry is string => typeof entry === "string")
        : [];

    return normalizeSyroFileIdentity({
        uuid,
        createdAt,
        updatedAt,
        path,
        aliases,
        deleted: value["deleted"] === true,
    });
}

export function parseFileIdentityStoreFile(value: unknown): SyroFileIdentityStoreFile | null {
    if (!isRecord(value) || getNumberProp(value, "version") !== FILE_IDENTITY_STORE_VERSION) {
        return null;
    }

    const entriesValue = value["entries"];
    if (!isRecord(entriesValue)) {
        return null;
    }

    const entries: Record<string, SyroFileIdentity> = {};
    for (const [uuid, entry] of Object.entries(entriesValue)) {
        const parsedEntry = parseFileIdentity(entry);
        if (!parsedEntry || parsedEntry.uuid !== uuid) {
            return null;
        }
        entries[uuid] = parsedEntry;
    }

    return {
        version: FILE_IDENTITY_STORE_VERSION,
        entries,
        syncEntities: parseSyncEntities(value["syncEntities"]),
    };
}

export function createDefaultFileIdentityStoreFile(): SyroFileIdentityStoreFile {
    return {
        version: FILE_IDENTITY_STORE_VERSION,
        entries: {},
        syncEntities: {},
    };
}

export class SyroFileIdentityStore {
    public lastLoadError: string | null = null;
    private dataPath: string;
    private lastSerialized: string | null = null;
    private syncReadOnlyReason: string | null = null;
    private entries: Record<string, SyroFileIdentity> = {};
    private syncEntities: Record<string, PersistedSyncEntityState> = {};

    constructor(pathOrConfig: string | FileIdentityStorePathConfig) {
        this.dataPath =
            typeof pathOrConfig === "string" ? pathOrConfig : pathOrConfig.fileIdentitiesPath;
    }

    async load(): Promise<void> {
        this.lastLoadError = null;
        const adapter = Iadapter.instance.adapter;

        try {
            if (!(await adapter.exists(this.dataPath))) {
                this.entries = {};
                this.syncEntities = {};
                await this.save();
                return;
            }

            const raw = await adapter.read(this.dataPath);
            if (!raw) {
                this.entries = {};
                this.syncEntities = {};
                await this.save();
                return;
            }
            this.lastSerialized = raw;

            const parsed = parseFileIdentityStoreFile(parseJsonUnknown(raw));
            if (!parsed) {
                this.lastLoadError = "[SR-FileIdentity] Invalid file-identities.json schema.";
                return;
            }

            this.entries = cloneEntries(parsed.entries);
            this.syncEntities = cloneSyncEntities(parsed.syncEntities);
        } catch (error) {
            this.lastLoadError =
                `[SR-FileIdentity] Failed to load file identities: ${String(error)}`;
            this.entries = {};
            this.syncEntities = {};
        }
    }

    async save(): Promise<void> {
        if (this.syncReadOnlyReason) {
            return;
        }

        const serialized = JSON.stringify(this.getState(), null, 2);
        if (serialized === this.lastSerialized) {
            return;
        }

        await Iadapter.instance.adapter.write(this.dataPath, serialized);
        this.lastSerialized = serialized;
    }

    setReadOnly(reason: string | null): void {
        this.syncReadOnlyReason = reason;
    }

    getState(): SyroFileIdentityStoreFile {
        return {
            version: FILE_IDENTITY_STORE_VERSION,
            entries: cloneEntries(this.entries),
            syncEntities: cloneSyncEntities(this.syncEntities),
        };
    }

    getByUuid(uuid: string): SyroFileIdentity | null {
        const entry = this.entries[uuid];
        return entry ? cloneFileIdentity(entry) : null;
    }

    getByPath(path: string): SyroFileIdentity | null {
        const normalizedPath = normalizePath(path);
        for (const entry of Object.values(this.entries)) {
            if (entry.path === normalizedPath) {
                return cloneFileIdentity(entry);
            }
        }
        return null;
    }

    getByUuidOrAlias(uuid: string): SyroFileIdentity | null {
        const trimmed = uuid.trim();
        if (!trimmed) {
            return null;
        }

        for (const entry of Object.values(this.entries)) {
            if (entry.uuid === trimmed || entry.aliases.includes(trimmed)) {
                return cloneFileIdentity(entry);
            }
        }
        return null;
    }

    upsert(input: SyroFileIdentityInput): SyroFileIdentity {
        const normalized = normalizeSyroFileIdentity(input);
        const existing = this.entries[normalized.uuid];
        const nextIdentity: SyroFileIdentity = existing
            ? {
                  uuid: existing.uuid,
                  createdAt: compareIsoTime(existing.createdAt, normalized.createdAt) <= 0
                      ? existing.createdAt
                      : normalized.createdAt,
                  updatedAt:
                      compareIsoTime(existing.updatedAt, normalized.updatedAt) >= 0
                          ? existing.updatedAt
                          : normalized.updatedAt,
                  path: normalized.path,
                  aliases: normalizeFileIdentityAliases(existing.uuid, [
                      ...existing.aliases,
                      normalized.uuid,
                      ...normalized.aliases,
                  ]),
                  deleted: normalized.deleted,
              }
            : normalized;
        this.entries[nextIdentity.uuid] = nextIdentity;
        return cloneFileIdentity(nextIdentity);
    }

    rename(uuid: string, path: string, updatedAt: string): SyroFileIdentity | null {
        const current = this.entries[uuid];
        if (!current) {
            return null;
        }

        const nextIdentity: SyroFileIdentity = {
            ...current,
            path: normalizePath(path),
            updatedAt,
            deleted: false,
        };
        this.entries[uuid] = nextIdentity;
        return cloneFileIdentity(nextIdentity);
    }

    remove(uuid: string, updatedAt: string): SyroFileIdentity | null {
        const current = this.entries[uuid];
        if (!current) {
            return null;
        }

        const nextIdentity: SyroFileIdentity = {
            ...current,
            updatedAt,
            deleted: true,
        };
        this.entries[uuid] = nextIdentity;
        return cloneFileIdentity(nextIdentity);
    }

    mergeAliases(uuid: string, aliases: readonly string[]): SyroFileIdentity | null {
        const current = this.entries[uuid];
        if (!current) {
            return null;
        }

        current.aliases = normalizeFileIdentityAliases(uuid, [...current.aliases, ...aliases]);
        return cloneFileIdentity(current);
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
