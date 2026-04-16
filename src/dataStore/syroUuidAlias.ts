export type SyroUuidAliasEntityType = "tracked-file" | "card-item" | "note-review";

export type SyroUuidAliasMatchedBy =
    | "canonical-hit"
    | "alias-hit"
    | "tracked-file-match"
    | "note-path"
    | "snapshot-reconcile";

export interface SyroUuidAliasEvidence {
    sourceDeviceId: string;
    sourcePath?: string;
    matchedBy: SyroUuidAliasMatchedBy;
    lineNo?: number;
    clozeId?: string | null;
    fingerprintUnique?: boolean;
}

export interface SyroUuidAliasGroup {
    entityType: SyroUuidAliasEntityType;
    equivalentUuids: string[];
    pathHint?: string;
    emitterPrimaryUuid: string;
    evidence: SyroUuidAliasEvidence;
}

export interface SyroUuidAliasBatchPayload {
    groups: SyroUuidAliasGroup[];
}

export function normalizeUuidAliases(
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
    return [...normalized];
}

export function mergeEquivalentUuids(
    canonicalUuid: string,
    existingAliases: readonly string[] | null | undefined,
    incomingUuids: readonly string[] | null | undefined,
): string[] {
    const merged = new Set<string>(normalizeUuidAliases(canonicalUuid, existingAliases));
    for (const candidate of incomingUuids ?? []) {
        if (typeof candidate !== "string") {
            continue;
        }
        const trimmed = candidate.trim();
        if (!trimmed || trimmed === canonicalUuid) {
            continue;
        }
        merged.add(trimmed);
    }
    return [...merged];
}

export function getEquivalentUuidSet(
    canonicalUuid: string,
    aliases: readonly string[] | null | undefined,
): Set<string> {
    return new Set<string>([canonicalUuid, ...normalizeUuidAliases(canonicalUuid, aliases)]);
}

export function getUuidAliasBatchDomain(
    entityType: SyroUuidAliasEntityType,
): "cards" | "notes" {
    return entityType === "note-review" ? "notes" : "cards";
}
