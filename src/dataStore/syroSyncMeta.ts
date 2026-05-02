import { getStringProp, isRecord } from "src/util/typeGuards";

export const SYRO_SYNC_RETENTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface PersistedSyncEntityState {
    updatedAt: string;
    deleted: boolean;
    entityType: string;
    pathHint?: string;
}

export function cloneSyncEntities(
    value: Record<string, PersistedSyncEntityState> | null | undefined,
): Record<string, PersistedSyncEntityState> {
    return Object.fromEntries(
        Object.entries(value ?? {}).map(([targetUuid, entity]) => [
            targetUuid,
            {
                updatedAt: entity.updatedAt,
                deleted: entity.deleted === true,
                entityType: entity.entityType,
                ...(entity.pathHint ? { pathHint: entity.pathHint } : {}),
            },
        ]),
    );
}

export function parseSyncEntities(value: unknown): Record<string, PersistedSyncEntityState> {
    if (!isRecord(value)) {
        return {};
    }

    const entities: Record<string, PersistedSyncEntityState> = {};
    for (const [targetUuid, entry] of Object.entries(value)) {
        if (!targetUuid || !isRecord(entry)) {
            continue;
        }

        const updatedAt = getStringProp(entry, "updatedAt")?.trim();
        const entityType = getStringProp(entry, "entityType")?.trim();
        const pathHint = getStringProp(entry, "pathHint")?.trim();
        if (!updatedAt || !entityType) {
            continue;
        }

        entities[targetUuid] = {
            updatedAt,
            deleted: entry["deleted"] === true,
            entityType,
            ...(pathHint ? { pathHint } : {}),
        };
    }

    return entities;
}

export function compareIsoTime(left: string, right: string): number {
    if (left === right) {
        return 0;
    }

    return left < right ? -1 : 1;
}

export function shouldApplySyncEntity(
    entities: Record<string, PersistedSyncEntityState>,
    targetUuid: string,
    updatedAt: string,
): boolean {
    const current = entities[targetUuid];
    if (!current) {
        return true;
    }

    return compareIsoTime(current.updatedAt, updatedAt) < 0;
}

export function markSyncEntity(
    entities: Record<string, PersistedSyncEntityState>,
    input: {
        targetUuid: string;
        updatedAt: string;
        deleted: boolean;
        entityType: string;
        pathHint?: string;
    },
): boolean {
    const current = entities[input.targetUuid];
    if (current && compareIsoTime(current.updatedAt, input.updatedAt) >= 0) {
        return false;
    }

    entities[input.targetUuid] = {
        updatedAt: input.updatedAt,
        deleted: input.deleted,
        entityType: input.entityType,
        ...(input.pathHint ? { pathHint: input.pathHint } : {}),
    };
    return true;
}

export function pruneSyncEntities(
    entities: Record<string, PersistedSyncEntityState>,
    retentionMs: number,
    now = Date.now(),
): boolean {
    let changed = false;
    for (const [targetUuid, entry] of Object.entries(entities)) {
        const updatedAtMs = Date.parse(entry.updatedAt);
        if (!Number.isFinite(updatedAtMs) || now - updatedAtMs <= retentionMs) {
            continue;
        }

        delete entities[targetUuid];
        changed = true;
    }

    return changed;
}

export function parseTimestampMap(value: unknown): Record<string, string> {
    if (!isRecord(value)) {
        return {};
    }

    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (!key) {
            continue;
        }
        if (typeof entry !== "string" || entry.trim().length === 0) {
            continue;
        }
        result[key] = entry;
    }

    return result;
}

export function pruneTimestampMap(
    values: Record<string, string>,
    retentionMs: number,
    now = Date.now(),
): boolean {
    let changed = false;
    for (const [key, timestamp] of Object.entries(values)) {
        const parsed = Date.parse(timestamp);
        if (!Number.isFinite(parsed) || now - parsed <= retentionMs) {
            continue;
        }

        delete values[key];
        changed = true;
    }

    return changed;
}
