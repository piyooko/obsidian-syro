import {
    applyDeckOptionsStateToSettings,
    createDeckOptionsStoreSnapshot,
    DeckOptionsStore,
    type DeckOptionsStoreFile,
} from "./deckOptionsStore";
import {
    extractDailyStateWithMetadata,
    extractSharedSettingsWithMetadata,
    extractTrackingRules,
    SHARED_SETTINGS_FIELDS,
    type DailyDeckStats,
    type PersistedDailyState,
    type PersistedSharedSettingsState,
    type PersistedTrackingRulesState,
    type PersistedTrackingRulesTombstone,
    SyroJsonStateStore,
} from "./syroPluginDataStore";
import {
    DataStore,
    type ParsedTrackedCardsStoreSnapshots,
    type TrackedCardSnapshot,
    type TrackedCardsFileSnapshot,
} from "./data";
import { cloneFolderTrackingRule } from "src/folderTracking";
import {
    NoteReviewStore,
    type ParsedNoteReviewStoreSnapshots,
    type NoteReviewEntrySnapshot,
    type NoteReviewSource,
} from "./noteReviewStore";
import { RepetitionItem } from "./repetitionItem";
import { ReviewCommitStore, type ReviewCommitLog } from "./reviewCommitStore";
import {
    classifySyroSessionRecordImpact,
    createEmptySyroSessionReplaySummary,
    type SyroSessionReplaySummary,
} from "./syroSessionImpact";
import type { SyroSessionRecord } from "./syroSessionManager";
import type { SRSettings } from "src/settings";
import type { FolderTrackingRule } from "src/folderTracking";
import { getArrayProp, getStringProp, isRecord } from "src/util/typeGuards";
import { compareIsoTime } from "./syroSyncMeta";
import {
    getUuidAliasBatchDomain,
    mergeEquivalentUuids,
    normalizeUuidAliases,
    type SyroUuidAliasBatchPayload,
    type SyroUuidAliasEntityType,
    type SyroUuidAliasEvidence,
    type SyroUuidAliasGroup,
} from "./syroUuidAlias";

type ReplayDependencies = {
    settings: SRSettings;
    data: {
        buryDate: string;
        buryList: string[];
        dailyDeckStats: DailyDeckStats;
        folderTrackingRules: Record<string, FolderTrackingRule>;
    };
    store: DataStore;
    noteReviewStore: NoteReviewStore;
    reviewCommitStore: ReviewCommitStore;
    deckOptionsStore: DeckOptionsStore;
    sharedSettingsStore: SyroJsonStateStore<PersistedSharedSettingsState>;
    trackingRulesStore: SyroJsonStateStore<PersistedTrackingRulesState>;
    dailyStateStore: SyroJsonStateStore<PersistedDailyState>;
    sharedSettingsUpdatedAtByField: Record<string, string>;
    trackingRulesUpdatedAtByFolderPath: Record<string, string>;
    trackingRulesTombstones: Record<string, PersistedTrackingRulesTombstone>;
    dailyStateAppliedOpIds: Record<string, string>;
    currentDeviceReviewCount: number;
    loadRemoteCardsSnapshots?: (deviceId: string) => Promise<ParsedTrackedCardsStoreSnapshots | null>;
    loadRemoteNotesSnapshots?: (deviceId: string) => Promise<ParsedNoteReviewStoreSnapshots | null>;
    collectAliasGroups?: (domain: "cards" | "notes", groups: SyroUuidAliasGroup[]) => void;
    shouldLogDebug?: () => boolean;
    logDebug?: (...args: unknown[]) => void;
};

type ReplayEntityResolution =
    | {
          kind: "tracked-file";
          fileID: string;
          matchedBy: SyroUuidAliasEvidence["matchedBy"];
      }
    | {
          kind: "card-item";
          itemId: number;
          matchedBy: SyroUuidAliasEvidence["matchedBy"];
      }
    | {
          kind: "note-review";
          path: string;
          matchedBy: SyroUuidAliasEvidence["matchedBy"];
      };

type DeferredReplayRecord =
    | {
          kind: "card-item";
          record: SyroSessionRecord;
          snapshot: TrackedCardSnapshot;
      }
    | {
          kind: "note-review";
          record: SyroSessionRecord;
          snapshot: NoteReviewEntrySnapshot;
      };

function cloneUnknown<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function isNoteReviewSource(value: unknown): value is NoteReviewSource {
    return value === "manual" || value === "tag" || value === "folder";
}

function buildTimelineEntryTargetUuid(commitId: string): string {
    return `timeline-entry:${commitId}`;
}

function buildCardTargetUuid(itemUuid: string): string {
    return itemUuid;
}

function buildTrackedFileTargetUuid(fileUuid: string): string {
    return fileUuid;
}

function parseDeckOptionsPayload(payload: unknown): DeckOptionsStoreFile | null {
    if (!isRecord(payload)) {
        return null;
    }

    return payload as unknown as DeckOptionsStoreFile;
}

function parseNoteSnapshotPayload(payload: unknown): NoteReviewEntrySnapshot | null {
    if (!isRecord(payload)) {
        return null;
    }

    const path = getStringProp(payload, "path")?.trim();
    const source = payload["source"];
    const deckName = getStringProp(payload, "deckName")?.trim();

    if (!path || !isNoteReviewSource(source) || !deckName || !isRecord(payload["item"])) {
        return null;
    }

    return {
        path,
        source,
        deckName,
        item: RepetitionItem.create(payload["item"] as unknown as RepetitionItem),
    };
}

function parseTimelineEntryPayload(
    payload: unknown,
): {
    notePath: string;
    commit: ReviewCommitLog;
} | null {
    if (!isRecord(payload)) {
        return null;
    }

    const notePath = getStringProp(payload, "notePath")?.trim();
    if (!notePath || !isRecord(payload["commit"])) {
        return null;
    }

    return {
        notePath,
        commit: cloneUnknown(payload["commit"] as unknown as ReviewCommitLog),
    };
}

function parseTimelineFilePayload(
    payload: unknown,
): {
    oldPath?: string;
    newPath?: string;
    notePath?: string;
    commits: ReviewCommitLog[];
} | null {
    if (!isRecord(payload)) {
        return null;
    }

    const commits = getArrayProp(payload, "commits")
        .filter((commit): commit is ReviewCommitLog => isRecord(commit))
        .map((commit) => cloneUnknown(commit));

    return {
        oldPath: getStringProp(payload, "oldPath")?.trim(),
        newPath: getStringProp(payload, "newPath")?.trim(),
        notePath: getStringProp(payload, "notePath")?.trim(),
        commits,
    };
}

function parseCardSnapshotPayload(payload: unknown): TrackedCardSnapshot | null {
    if (!isRecord(payload)) {
        return null;
    }

    const path = getStringProp(payload, "path")?.trim();
    const trackedFileUuid = getStringProp(payload, "trackedFileUuid")?.trim();
    const trackedFileAliases = getArrayProp(payload, "trackedFileAliases").filter(
        (tag): tag is string => typeof tag === "string",
    );
    const trackedFileTags = getArrayProp(payload, "trackedFileTags").filter(
        (tag): tag is string => typeof tag === "string",
    );

    if (!path || !trackedFileUuid || !isRecord(payload["item"])) {
        return null;
    }

    return {
        path,
        trackedFileUuid,
        trackedFileAliases,
        trackedFileTags,
        trackedItem: isRecord(payload["trackedItem"])
            ? cloneUnknown(
                  payload["trackedItem"] as unknown as NonNullable<TrackedCardSnapshot["trackedItem"]>,
              )
            : null,
        item: RepetitionItem.create(payload["item"] as unknown as RepetitionItem),
    };
}

function parseTrackedFilePayload(payload: unknown): TrackedCardsFileSnapshot | null {
    if (!isRecord(payload)) {
        return null;
    }

    const uuid = getStringProp(payload, "uuid")?.trim();
    const path = getStringProp(payload, "path")?.trim();
    const tags = getArrayProp(payload, "tags").filter((tag): tag is string => typeof tag === "string");

    if (!uuid || !path) {
        return null;
    }

    return {
        uuid,
        aliases: getArrayProp(payload, "aliases").filter(
            (alias): alias is string => typeof alias === "string",
        ),
        path,
        tags,
        items: isRecord(payload["items"]) ? (payload["items"] as Record<string, number>) : {},
        trackedItems: getArrayProp(payload, "trackedItems")
            .filter(
                (
                    item,
                ): item is NonNullable<TrackedCardsFileSnapshot["trackedItems"]>[number] =>
                    isRecord(item),
            )
            .map((item) => cloneUnknown(item)),
        relatedItems: getArrayProp(payload, "relatedItems")
            .filter((item): item is RepetitionItem => isRecord(item))
            .map((item) => RepetitionItem.create(item as unknown as RepetitionItem)),
    };
}

function parseSharedSettingsPatch(
    payload: unknown,
): {
    changed: Record<string, unknown>;
} | null {
    if (!isRecord(payload) || !isRecord(payload["changed"])) {
        return null;
    }

    return {
        changed: cloneUnknown(payload["changed"] as Record<string, unknown>),
    };
}

function parseTrackingRulePayload(
    payload: unknown,
): {
    folderPath: string;
    rule?: FolderTrackingRule;
} | null {
    if (!isRecord(payload)) {
        return null;
    }

    const folderPath = getStringProp(payload, "folderPath")?.trim();
    if (!folderPath) {
        return null;
    }

    return {
        folderPath,
        rule: isRecord(payload["rule"])
            ? cloneFolderTrackingRule(payload["rule"])
            : undefined,
    };
}

function parseDailyStateOpPayload(payload: unknown): Record<string, unknown> | null {
    return isRecord(payload) ? cloneUnknown(payload as Record<string, unknown>) : null;
}

function parseUuidAliasBatchPayload(payload: unknown): SyroUuidAliasBatchPayload | null {
    if (!isRecord(payload)) {
        return null;
    }

    const rawGroups = getArrayProp(payload, "groups");
    const groups: SyroUuidAliasGroup[] = [];

    for (const rawGroup of rawGroups) {
        if (!isRecord(rawGroup)) {
            continue;
        }

        const entityType = getStringProp(rawGroup, "entityType")?.trim() as SyroUuidAliasEntityType;
        const emitterPrimaryUuid = getStringProp(rawGroup, "emitterPrimaryUuid")?.trim() ?? "";
        const equivalentUuids = mergeEquivalentUuids(
            emitterPrimaryUuid,
            [],
            getArrayProp(rawGroup, "equivalentUuids").filter(
                (entry): entry is string => typeof entry === "string",
            ),
        );
        const rawEvidence = rawGroup["evidence"];
        if (
            (entityType !== "tracked-file" &&
                entityType !== "card-item" &&
                entityType !== "note-review") ||
            !emitterPrimaryUuid ||
            equivalentUuids.length === 0 ||
            !isRecord(rawEvidence)
        ) {
            continue;
        }

        const matchedBy = getStringProp(rawEvidence, "matchedBy")?.trim() as
            | SyroUuidAliasEvidence["matchedBy"]
            | undefined;
        const sourceDeviceId = getStringProp(rawEvidence, "sourceDeviceId")?.trim() ?? "";
        if (
            !sourceDeviceId ||
            (matchedBy !== "canonical-hit" &&
                matchedBy !== "alias-hit" &&
                matchedBy !== "tracked-file-match" &&
                matchedBy !== "note-path" &&
                matchedBy !== "snapshot-reconcile")
        ) {
            continue;
        }

        groups.push({
            entityType,
            equivalentUuids: [emitterPrimaryUuid, ...equivalentUuids],
            pathHint: getStringProp(rawGroup, "pathHint")?.trim(),
            emitterPrimaryUuid,
            evidence: {
                sourceDeviceId,
                sourcePath: getStringProp(rawEvidence, "sourcePath")?.trim(),
                matchedBy,
                lineNo: typeof rawEvidence["lineNo"] === "number" ? rawEvidence["lineNo"] : undefined,
                clozeId: typeof rawEvidence["clozeId"] === "string" ? rawEvidence["clozeId"] : undefined,
                fingerprintUnique:
                    typeof rawEvidence["fingerprintUnique"] === "boolean"
                        ? rawEvidence["fingerprintUnique"]
                        : undefined,
            },
        });
    }

    return groups.length > 0 ? { groups } : null;
}

function normalizeEquivalentUuids(
    emitterPrimaryUuid: string,
    equivalentUuids: readonly string[],
): string[] {
    return [emitterPrimaryUuid, ...normalizeUuidAliases(emitterPrimaryUuid, equivalentUuids)];
}

function buildAliasGroupKey(group: SyroUuidAliasGroup): string {
    const normalized = normalizeEquivalentUuids(group.emitterPrimaryUuid, group.equivalentUuids)
        .slice()
        .sort((left, right) => left.localeCompare(right));
    return `${group.entityType}:${normalized.join("|")}`;
}

function logAliasDebug(
    deps: ReplayDependencies,
    event: string,
    payload: Record<string, unknown>,
): void {
    if (deps.shouldLogDebug?.()) {
        deps.logDebug?.(`[SR-SyroAlias] ${event}`, payload);
    }
}

function buildNegativeCacheKey(record: SyroSessionRecord): string {
    return `${record.deviceId}|${record.domain}|${record.entityType}|${record.targetUuid}`;
}

function ensureDailyStateDate(
    data: ReplayDependencies["data"],
    date: string,
): "applied" | "stale" {
    if (!date) {
        return "stale";
    }

    const currentDate = data.dailyDeckStats.date || data.buryDate || "";
    if (currentDate && currentDate > date) {
        return "stale";
    }

    if (data.buryDate !== date) {
        data.buryDate = date;
        data.buryList.splice(0, data.buryList.length);
    }

    if (data.dailyDeckStats.date !== date) {
        data.dailyDeckStats = {
            date,
            counts: {},
        };
    }

    return "applied";
}

function hasNewerOrEqualTimestamp(current: string | null | undefined, next: string): boolean {
    return !!current && compareIsoTime(current, next) >= 0;
}

function getTrackingRuleWatermark(
    deps: ReplayDependencies,
    folderPath: string,
): string | null {
    const liveUpdatedAt = deps.trackingRulesUpdatedAtByFolderPath[folderPath];
    const tombstoneUpdatedAt = deps.trackingRulesTombstones[folderPath]?.updatedAt;
    if (!liveUpdatedAt) {
        return tombstoneUpdatedAt ?? null;
    }
    if (!tombstoneUpdatedAt) {
        return liveUpdatedAt;
    }
    return compareIsoTime(liveUpdatedAt, tombstoneUpdatedAt) >= 0
        ? liveUpdatedAt
        : tombstoneUpdatedAt;
}

export async function replaySyroSessionRecords(
    records: SyroSessionRecord[],
    deps: ReplayDependencies,
): Promise<SyroSessionReplaySummary> {
    const sharedSettingsFields = new Set<string>(SHARED_SETTINGS_FIELDS as readonly string[]);
    let deckOptionsChanged = false;
    let sharedSettingsChanged = false;
    let trackingRulesChanged = false;
    let dailyStateChanged = false;
    let dailyStateMetadataChanged = false;
    let notesChanged = false;
    let timelineChanged = false;
    let cardsChanged = false;
    const replaySummary = createEmptySyroSessionReplaySummary();
    const pendingAliasGroups: Record<SyroUuidAliasEntityType, Map<string, SyroUuidAliasGroup>> = {
        "tracked-file": new Map<string, SyroUuidAliasGroup>(),
        "card-item": new Map<string, SyroUuidAliasGroup>(),
        "note-review": new Map<string, SyroUuidAliasGroup>(),
    };
    const discoveredAliasGroups: Record<"cards" | "notes", Map<string, SyroUuidAliasGroup>> = {
        cards: new Map<string, SyroUuidAliasGroup>(),
        notes: new Map<string, SyroUuidAliasGroup>(),
    };
    const deferredRecords: DeferredReplayRecord[] = [];
    const negativeCache = new Set<string>();

    const registerPendingAliasGroup = (group: SyroUuidAliasGroup): void => {
        const registry = pendingAliasGroups[group.entityType];
        for (const uuid of normalizeEquivalentUuids(group.emitterPrimaryUuid, group.equivalentUuids)) {
            registry.set(uuid, group);
        }
    };

    const clearPendingAliasGroup = (group: SyroUuidAliasGroup): void => {
        const registry = pendingAliasGroups[group.entityType];
        for (const uuid of normalizeEquivalentUuids(group.emitterPrimaryUuid, group.equivalentUuids)) {
            registry.delete(uuid);
        }
    };

    const rememberDiscoveredAliasGroup = (group: SyroUuidAliasGroup): void => {
        if (normalizeEquivalentUuids(group.emitterPrimaryUuid, group.equivalentUuids).length < 2) {
            return;
        }
        const domain = getUuidAliasBatchDomain(group.entityType);
        discoveredAliasGroups[domain].set(buildAliasGroupKey(group), {
            ...group,
            equivalentUuids: normalizeEquivalentUuids(
                group.emitterPrimaryUuid,
                group.equivalentUuids,
            ),
        });
    };

    const buildEvidence = (
        record: SyroSessionRecord,
        matchedBy: SyroUuidAliasEvidence["matchedBy"],
        pathHint?: string,
        extras: Partial<SyroUuidAliasEvidence> = {},
    ): SyroUuidAliasEvidence => ({
        sourceDeviceId: record.deviceId,
        sourcePath: pathHint ?? record.pathHint,
        matchedBy,
        ...extras,
    });

    const resolveTrackedFileSnapshot = (
        snapshot: Pick<TrackedCardsFileSnapshot, "uuid" | "path">,
    ): ReplayEntityResolution | null => {
        const exactFileId = deps.store.findFileIdByUuid(snapshot.uuid);
        if (exactFileId) {
            return { kind: "tracked-file", fileID: exactFileId, matchedBy: "canonical-hit" };
        }

        const aliasFileId = deps.store.findFileIdByUuidOrAlias(snapshot.uuid);
        if (aliasFileId) {
            return { kind: "tracked-file", fileID: aliasFileId, matchedBy: "alias-hit" };
        }

        const pathFileId = deps.store.getFileID(snapshot.path);
        if (pathFileId) {
            return { kind: "tracked-file", fileID: pathFileId, matchedBy: "snapshot-reconcile" };
        }

        return null;
    };

    const resolveCardSnapshot = (snapshot: TrackedCardSnapshot): ReplayEntityResolution | null => {
        const exactItem = deps.store.findItemByUuid(snapshot.item.uuid);
        if (exactItem) {
            return { kind: "card-item", itemId: exactItem.ID, matchedBy: "canonical-hit" };
        }

        const aliasItem = deps.store.findItemByUuidOrAlias(snapshot.item.uuid);
        if (aliasItem) {
            return { kind: "card-item", itemId: aliasItem.ID, matchedBy: "alias-hit" };
        }

        const matchedItem = deps.store.findMatchingItemByTrackedSnapshot(snapshot);
        if (matchedItem) {
            return { kind: "card-item", itemId: matchedItem.ID, matchedBy: "tracked-file-match" };
        }

        return null;
    };

    const resolveNoteSnapshot = (
        snapshot: NoteReviewEntrySnapshot,
    ): ReplayEntityResolution | null => {
        const exactPath = deps.noteReviewStore.findPathByUuid(snapshot.item.uuid);
        if (exactPath) {
            return { kind: "note-review", path: exactPath, matchedBy: "canonical-hit" };
        }

        const aliasPath = deps.noteReviewStore.findPathByUuidOrAlias(snapshot.item.uuid);
        if (aliasPath) {
            return { kind: "note-review", path: aliasPath, matchedBy: "alias-hit" };
        }

        if (deps.noteReviewStore.getEntry(snapshot.path)) {
            return { kind: "note-review", path: snapshot.path, matchedBy: "note-path" };
        }

        return null;
    };

    const maybeRecordAliasGroup = (
        entityType: SyroUuidAliasEntityType,
        beforeUuids: readonly string[],
        afterUuids: readonly string[],
        evidence: SyroUuidAliasEvidence,
        pathHint?: string,
    ): void => {
        if (afterUuids.length <= beforeUuids.length || afterUuids.length < 2) {
            return;
        }

        rememberDiscoveredAliasGroup({
            entityType,
            equivalentUuids: [...afterUuids],
            pathHint,
            emitterPrimaryUuid: afterUuids[0],
            evidence,
        });
    };

    const absorbPendingAliasGroups = (
        entityType: SyroUuidAliasEntityType,
        knownUuids: readonly string[],
        applyIncoming: (incomingUuids: string[]) => void,
    ): void => {
        const registry = pendingAliasGroups[entityType];
        const groups = new Map<string, SyroUuidAliasGroup>();
        for (const uuid of knownUuids) {
            const group = registry.get(uuid);
            if (!group) {
                continue;
            }
            groups.set(buildAliasGroupKey(group), group);
        }

        for (const group of groups.values()) {
            clearPendingAliasGroup(group);
            applyIncoming(normalizeEquivalentUuids(group.emitterPrimaryUuid, group.equivalentUuids));
        }
    };

    const mergeTrackedFileAliases = (
        fileID: string,
        incomingUuids: readonly string[],
        evidence: SyroUuidAliasEvidence,
        pathHint?: string,
        emit = true,
        recordDiscovery = true,
    ): boolean => {
        const beforeUuids = deps.store.getFileEquivalentUuids(fileID);
        deps.store.mergeFileUuidEquivalence(fileID, incomingUuids);
        absorbPendingAliasGroups("tracked-file", deps.store.getFileEquivalentUuids(fileID), (pendingUuids) => {
            deps.store.mergeFileUuidEquivalence(fileID, pendingUuids);
        });
        const afterUuids = deps.store.getFileEquivalentUuids(fileID);
        const changed = afterUuids.length > beforeUuids.length;
        if (recordDiscovery) {
            maybeRecordAliasGroup("tracked-file", beforeUuids, afterUuids, evidence, pathHint);
        }
        if (changed) {
            cardsChanged = true;
        }
        if (emit && changed) {
            logAliasDebug(deps, "alias-merged", {
                entityType: "tracked-file",
                pathHint,
                beforeUuids,
                afterUuids,
                matchedBy: evidence.matchedBy,
            });
        }
        return changed;
    };

    const mergeCardAliases = (
        itemId: number,
        incomingUuids: readonly string[],
        evidence: SyroUuidAliasEvidence,
        pathHint?: string,
        emit = true,
        recordDiscovery = true,
    ): boolean => {
        const beforeUuids = deps.store.getItemEquivalentUuids(itemId);
        deps.store.mergeItemUuidEquivalence(itemId, incomingUuids);
        absorbPendingAliasGroups("card-item", deps.store.getItemEquivalentUuids(itemId), (pendingUuids) => {
            deps.store.mergeItemUuidEquivalence(itemId, pendingUuids);
        });
        const afterUuids = deps.store.getItemEquivalentUuids(itemId);
        const changed = afterUuids.length > beforeUuids.length;
        if (recordDiscovery) {
            maybeRecordAliasGroup("card-item", beforeUuids, afterUuids, evidence, pathHint);
        }
        if (changed) {
            cardsChanged = true;
        }
        if (emit && changed) {
            logAliasDebug(deps, "alias-merged", {
                entityType: "card-item",
                pathHint,
                beforeUuids,
                afterUuids,
                matchedBy: evidence.matchedBy,
            });
        }
        return changed;
    };

    const mergeNoteAliases = (
        path: string,
        incomingUuids: readonly string[],
        evidence: SyroUuidAliasEvidence,
        emit = true,
        recordDiscovery = true,
    ): boolean => {
        const beforeUuids = deps.noteReviewStore.getEquivalentUuidsForPath(path);
        deps.noteReviewStore.mergeUuidEquivalenceForPath(path, incomingUuids);
        absorbPendingAliasGroups(
            "note-review",
            deps.noteReviewStore.getEquivalentUuidsForPath(path),
            (pendingUuids) => {
                deps.noteReviewStore.mergeUuidEquivalenceForPath(path, pendingUuids);
            },
        );
        const afterUuids = deps.noteReviewStore.getEquivalentUuidsForPath(path);
        const changed = afterUuids.length > beforeUuids.length;
        if (recordDiscovery) {
            maybeRecordAliasGroup("note-review", beforeUuids, afterUuids, evidence, path);
        }
        if (changed) {
            notesChanged = true;
        }
        if (emit && changed) {
            logAliasDebug(deps, "alias-merged", {
                entityType: "note-review",
                pathHint: path,
                beforeUuids,
                afterUuids,
                matchedBy: evidence.matchedBy,
            });
        }
        return changed;
    };

    const preloadAliasBatchGroup = (group: SyroUuidAliasGroup): void => {
        if (group.entityType === "tracked-file") {
            let resolution: ReplayEntityResolution | null = null;
            for (const uuid of normalizeEquivalentUuids(group.emitterPrimaryUuid, group.equivalentUuids)) {
                resolution =
                    resolveTrackedFileSnapshot({
                        uuid,
                        path: group.pathHint ?? "",
                    }) ?? resolution;
                if (resolution) {
                    break;
                }
            }
            if (resolution?.kind === "tracked-file") {
                mergeTrackedFileAliases(
                    resolution.fileID,
                    normalizeEquivalentUuids(group.emitterPrimaryUuid, group.equivalentUuids),
                    group.evidence,
                    group.pathHint,
                    false,
                    false,
                );
                return;
            }
        } else if (group.entityType === "card-item") {
            let resolution: ReplayEntityResolution | null = null;
            for (const uuid of normalizeEquivalentUuids(group.emitterPrimaryUuid, group.equivalentUuids)) {
                const exactItem = deps.store.findItemByUuid(uuid) ?? deps.store.findItemByUuidOrAlias(uuid);
                if (exactItem) {
                    resolution = {
                        kind: "card-item",
                        itemId: exactItem.ID,
                        matchedBy: exactItem.uuid === uuid ? "canonical-hit" : "alias-hit",
                    };
                    break;
                }
            }
            if (
                !resolution &&
                group.pathHint &&
                typeof group.evidence.lineNo === "number"
            ) {
                const trackedFile = deps.store.getTrackedFile(group.pathHint);
                const trackedItem = trackedFile?.getTrackedItem(
                    group.evidence.lineNo,
                    group.evidence.clozeId ?? "c1",
                );
                if (trackedItem?.reviewId != null && trackedItem.reviewId >= 0) {
                    resolution = {
                        kind: "card-item",
                        itemId: trackedItem.reviewId,
                        matchedBy: "tracked-file-match",
                    };
                }
            }
            if (resolution?.kind === "card-item") {
                mergeCardAliases(
                    resolution.itemId,
                    normalizeEquivalentUuids(group.emitterPrimaryUuid, group.equivalentUuids),
                    group.evidence,
                    group.pathHint,
                    false,
                    false,
                );
                return;
            }
        } else {
            let resolution: ReplayEntityResolution | null = null;
            for (const uuid of normalizeEquivalentUuids(group.emitterPrimaryUuid, group.equivalentUuids)) {
                const path =
                    deps.noteReviewStore.findPathByUuid(uuid) ??
                    deps.noteReviewStore.findPathByUuidOrAlias(uuid);
                if (path) {
                    resolution = {
                        kind: "note-review",
                        path,
                        matchedBy:
                            deps.noteReviewStore.findPathByUuid(uuid) === path
                                ? "canonical-hit"
                                : "alias-hit",
                    };
                    break;
                }
            }
            if (!resolution && group.pathHint && deps.noteReviewStore.getEntry(group.pathHint)) {
                resolution = {
                    kind: "note-review",
                    path: group.pathHint,
                    matchedBy: "note-path",
                };
            }
            if (resolution?.kind === "note-review") {
                mergeNoteAliases(
                    resolution.path,
                    normalizeEquivalentUuids(group.emitterPrimaryUuid, group.equivalentUuids),
                    group.evidence,
                    false,
                    false,
                );
                return;
            }
        }

        registerPendingAliasGroup(group);
    };

    const loadRemoteCardSnapshot = async (
        record: SyroSessionRecord,
        snapshot: TrackedCardSnapshot,
    ): Promise<TrackedCardSnapshot | null> => {
        const negativeKey = buildNegativeCacheKey(record);
        if (negativeCache.has(negativeKey)) {
            logAliasDebug(deps, "snapshot-negative-cache-hit", {
                deviceId: record.deviceId,
                targetUuid: record.targetUuid,
                entityType: record.entityType,
            });
            return null;
        }
        if (!deps.loadRemoteCardsSnapshots) {
            return null;
        }

        logAliasDebug(deps, "snapshot-fetch", {
            deviceId: record.deviceId,
            targetUuid: record.targetUuid,
            entityType: record.entityType,
        });
        const remoteSnapshots = await deps.loadRemoteCardsSnapshots(record.deviceId);
        const remoteCard =
            remoteSnapshots?.cards.find(
                (candidate) =>
                    candidate.item.uuid === snapshot.item.uuid ||
                    candidate.item.aliases.includes(snapshot.item.uuid),
            ) ??
            remoteSnapshots?.cards.find(
                (candidate) =>
                    candidate.path === snapshot.path &&
                    candidate.trackedItem?.fingerprint === snapshot.trackedItem?.fingerprint &&
                    candidate.trackedItem?.lineNo === snapshot.trackedItem?.lineNo,
            ) ??
            null;
        if (!remoteCard) {
            negativeCache.add(negativeKey);
            return null;
        }
        return remoteCard;
    };

    const loadRemoteNoteSnapshot = async (
        record: SyroSessionRecord,
        snapshot: NoteReviewEntrySnapshot,
    ): Promise<NoteReviewEntrySnapshot | null> => {
        const negativeKey = buildNegativeCacheKey(record);
        if (negativeCache.has(negativeKey)) {
            logAliasDebug(deps, "snapshot-negative-cache-hit", {
                deviceId: record.deviceId,
                targetUuid: record.targetUuid,
                entityType: record.entityType,
            });
            return null;
        }
        if (!deps.loadRemoteNotesSnapshots) {
            return null;
        }

        logAliasDebug(deps, "snapshot-fetch", {
            deviceId: record.deviceId,
            targetUuid: record.targetUuid,
            entityType: record.entityType,
        });
        const remoteSnapshots = await deps.loadRemoteNotesSnapshots(record.deviceId);
        const remoteNote =
            remoteSnapshots?.notes.find(
                (candidate) =>
                    candidate.item.uuid === snapshot.item.uuid ||
                    candidate.item.aliases.includes(snapshot.item.uuid),
            ) ??
            remoteSnapshots?.notes.find((candidate) => candidate.path === snapshot.path) ??
            null;
        if (!remoteNote) {
            negativeCache.add(negativeKey);
            return null;
        }
        return remoteNote;
    };

    const applyCardRecord = async (
        record: SyroSessionRecord,
        snapshot: TrackedCardSnapshot,
        allowRemoteFetch: boolean,
    ): Promise<"applied" | "deferred" | "skipped"> => {
        let workingSnapshot: TrackedCardSnapshot = {
            ...snapshot,
            trackedFileAliases: [...(snapshot.trackedFileAliases ?? [])],
            trackedFileTags: [...snapshot.trackedFileTags],
            trackedItem: snapshot.trackedItem ? cloneUnknown(snapshot.trackedItem) : null,
            item: RepetitionItem.create(snapshot.item),
        };

        let fileResolution = resolveTrackedFileSnapshot({
            uuid: workingSnapshot.trackedFileUuid,
            path: workingSnapshot.path,
        });
        if (!fileResolution && allowRemoteFetch) {
            const remoteSnapshot = await loadRemoteCardSnapshot(record, workingSnapshot);
            if (remoteSnapshot) {
                workingSnapshot = remoteSnapshot;
                fileResolution = resolveTrackedFileSnapshot({
                    uuid: workingSnapshot.trackedFileUuid,
                    path: workingSnapshot.path,
                });
            }
        }
        if (!fileResolution || fileResolution.kind !== "tracked-file") {
            logAliasDebug(deps, "resolve-miss", {
                entityType: "tracked-file",
                deviceId: record.deviceId,
                targetUuid: record.targetUuid,
                pathHint: workingSnapshot.path,
            });
            return allowRemoteFetch ? "skipped" : "deferred";
        }

        const fileEvidence = buildEvidence(record, fileResolution.matchedBy, workingSnapshot.path);
        mergeTrackedFileAliases(
            fileResolution.fileID,
            [workingSnapshot.trackedFileUuid, ...(workingSnapshot.trackedFileAliases ?? [])],
            fileEvidence,
            workingSnapshot.path,
        );
        const resolvedFile = deps.store.getFileByID(fileResolution.fileID);
        if (!resolvedFile) {
            return allowRemoteFetch ? "skipped" : "deferred";
        }

        workingSnapshot.trackedFileUuid = resolvedFile.uuid;
        workingSnapshot.trackedFileAliases = [...(resolvedFile.aliases ?? [])];
        workingSnapshot.path = resolvedFile.path;
        workingSnapshot.trackedFileTags = [...(resolvedFile.tags ?? [])];

        const cardResolution = resolveCardSnapshot(workingSnapshot);
        if (cardResolution?.kind === "card-item") {
            const fingerprintUnique = workingSnapshot.trackedItem
                ? deps.store.isTrackedFingerprintUnique(
                      workingSnapshot.path,
                      workingSnapshot.trackedItem.fingerprint,
                  )
                : undefined;
            const cardEvidence = buildEvidence(record, cardResolution.matchedBy, workingSnapshot.path, {
                lineNo: workingSnapshot.trackedItem?.lineNo,
                clozeId: workingSnapshot.trackedItem?.clozeId,
                fingerprintUnique,
            });
            mergeCardAliases(
                cardResolution.itemId,
                [workingSnapshot.item.uuid, ...(workingSnapshot.item.aliases ?? [])],
                cardEvidence,
                workingSnapshot.path,
            );
            const resolvedItem = deps.store.getItembyID(cardResolution.itemId);
            if (resolvedItem) {
                workingSnapshot.item.uuid = resolvedItem.uuid;
                workingSnapshot.item.aliases = [...(resolvedItem.aliases ?? [])];
            }
        }

        const cardTargetUuid = buildCardTargetUuid(workingSnapshot.item.uuid);
        if (!deps.store.shouldApplySyncEntity(cardTargetUuid, record.updatedAt)) {
            return "skipped";
        }

        if (record.opType === "remove") {
            deps.store.removeCardByUuid(workingSnapshot.item.uuid, workingSnapshot.path);
        } else {
            deps.store.upsertCardSnapshot(workingSnapshot);
        }
        deps.store.markSyncEntity({
            targetUuid: cardTargetUuid,
            updatedAt: record.updatedAt,
            deleted: record.opType === "remove",
            entityType: "card-item",
            pathHint: workingSnapshot.path,
        });

        cardsChanged = true;
        if (classifySyroSessionRecordImpact(record) === "runtime-only") {
            replaySummary.cardsRuntimeChanged = true;
        } else {
            replaySummary.requiresGlobalSync = true;
        }
        logAliasDebug(deps, "resolve-hit", {
            entityType: "card-item",
            deviceId: record.deviceId,
            targetUuid: cardTargetUuid,
            matchedBy: cardResolution?.matchedBy ?? "snapshot-reconcile",
            pathHint: workingSnapshot.path,
        });
        return "applied";
    };

    const applyNoteRecord = async (
        record: SyroSessionRecord,
        snapshot: NoteReviewEntrySnapshot,
        allowRemoteFetch: boolean,
    ): Promise<"applied" | "skipped"> => {
        let workingSnapshot: NoteReviewEntrySnapshot = {
            ...snapshot,
            item: RepetitionItem.create(snapshot.item),
        };

        let noteResolution = resolveNoteSnapshot(workingSnapshot);
        if (!noteResolution && allowRemoteFetch) {
            const remoteSnapshot = await loadRemoteNoteSnapshot(record, workingSnapshot);
            if (remoteSnapshot) {
                workingSnapshot = remoteSnapshot;
                noteResolution = resolveNoteSnapshot(workingSnapshot);
            }
        }

        if (noteResolution?.kind === "note-review") {
            const noteEvidence = buildEvidence(record, noteResolution.matchedBy, workingSnapshot.path);
            mergeNoteAliases(
                noteResolution.path,
                [workingSnapshot.item.uuid, ...(workingSnapshot.item.aliases ?? [])],
                noteEvidence,
            );
            const currentEntry = deps.noteReviewStore.getEntry(noteResolution.path);
            if (currentEntry) {
                workingSnapshot.item.uuid = currentEntry.item.uuid;
                workingSnapshot.item.aliases = [...(currentEntry.item.aliases ?? [])];
            }
        }

        const targetUuid = workingSnapshot.item.uuid || record.targetUuid;
        if (!deps.noteReviewStore.shouldApplySyncEntity(targetUuid, record.updatedAt)) {
            return "skipped";
        }

        if (record.opType === "remove") {
            deps.noteReviewStore.removeByUuid(workingSnapshot.item.uuid, workingSnapshot.path);
        } else {
            deps.noteReviewStore.upsertSnapshot(workingSnapshot);
        }
        deps.noteReviewStore.markSyncEntity({
            targetUuid,
            updatedAt: record.updatedAt,
            deleted: record.opType === "remove",
            entityType: "note-review",
            pathHint: workingSnapshot.path,
        });
        notesChanged = true;
        if (classifySyroSessionRecordImpact(record) === "runtime-only") {
            replaySummary.noteReviewChanged = true;
        } else {
            replaySummary.requiresGlobalSync = true;
        }
        logAliasDebug(deps, "resolve-hit", {
            entityType: "note-review",
            deviceId: record.deviceId,
            targetUuid,
            matchedBy: noteResolution?.matchedBy ?? "snapshot-reconcile",
            pathHint: workingSnapshot.path,
        });
        return "applied";
    };

    for (const record of records) {
        if (record.entityType === "uuid-alias-batch") {
            const batchPayload = parseUuidAliasBatchPayload(record.payload);
            if (!batchPayload) {
                continue;
            }

            for (const group of batchPayload.groups) {
                preloadAliasBatchGroup(group);
            }
        }
    }

    for (const record of records) {
        switch (record.domain) {
            case "settings": {
                const patch = parseSharedSettingsPatch(record.payload);
                if (!patch) {
                    continue;
                }

                for (const [field, value] of Object.entries(patch.changed)) {
                    if (!sharedSettingsFields.has(field)) {
                        continue;
                    }

                    if (
                        hasNewerOrEqualTimestamp(
                            deps.sharedSettingsUpdatedAtByField[field],
                            record.updatedAt,
                        )
                    ) {
                        continue;
                    }

                    const mutableSettings = deps.settings as unknown as Record<string, unknown>;
                    mutableSettings[field] = cloneUnknown(value);
                    deps.sharedSettingsUpdatedAtByField[field] = record.updatedAt;
                    sharedSettingsChanged = true;
                    replaySummary.requiresGlobalSync = true;
                }
                break;
            }

            case "tracking-rules": {
                const payload = parseTrackingRulePayload(record.payload);
                if (!payload) {
                    continue;
                }

                if (
                    hasNewerOrEqualTimestamp(
                        getTrackingRuleWatermark(deps, payload.folderPath),
                        record.updatedAt,
                    )
                ) {
                    continue;
                }

                if (record.opType === "remove-rule") {
                    delete deps.data.folderTrackingRules[payload.folderPath];
                    delete deps.trackingRulesUpdatedAtByFolderPath[payload.folderPath];
                    deps.trackingRulesTombstones[payload.folderPath] = {
                        updatedAt: record.updatedAt,
                    };
                } else if (payload.rule) {
                    deps.data.folderTrackingRules[payload.folderPath] = cloneUnknown(payload.rule);
                    deps.trackingRulesUpdatedAtByFolderPath[payload.folderPath] = record.updatedAt;
                    delete deps.trackingRulesTombstones[payload.folderPath];
                }

                trackingRulesChanged = true;
                replaySummary.requiresGlobalSync = true;
                break;
            }

            case "daily-state": {
                const payload = parseDailyStateOpPayload(record.payload);
                if (
                    !payload ||
                    deps.dailyStateAppliedOpIds[record.opId] ||
                    deps.dailyStateAppliedOpIds[record.targetUuid]
                ) {
                    continue;
                }

                const date = getStringProp(payload, "date")?.trim() ?? "";
                if (record.opType === "rollover-reset") {
                    if (ensureDailyStateDate(deps.data, date) === "stale") {
                        continue;
                    }
                    deps.data.buryList.splice(0, deps.data.buryList.length);
                    deps.data.dailyDeckStats = {
                        date,
                        counts: {},
                    };
                } else if (record.opType === "bury-add") {
                    if (ensureDailyStateDate(deps.data, date) === "stale") {
                        continue;
                    }
                    for (const entry of getArrayProp(payload, "entries")) {
                        if (typeof entry !== "string" || deps.data.buryList.includes(entry)) {
                            continue;
                        }
                        deps.data.buryList.push(entry);
                    }
                } else if (record.opType === "bury-clear") {
                    if (ensureDailyStateDate(deps.data, date) === "stale") {
                        continue;
                    }
                    deps.data.buryList.splice(
                        0,
                        deps.data.buryList.length,
                        ...getArrayProp(payload, "buryList").filter(
                            (entry): entry is string => typeof entry === "string",
                        ),
                    );
                } else if (record.opType === "deck-stats-delta") {
                    if (ensureDailyStateDate(deps.data, date) === "stale") {
                        continue;
                    }
                    const deckName = getStringProp(payload, "deckName")?.trim();
                    if (!deckName) {
                        continue;
                    }
                    const newDelta = Number(payload["newDelta"] ?? 0);
                    const reviewDelta = Number(payload["reviewDelta"] ?? 0);
                    const currentCounts = deps.data.dailyDeckStats.counts[deckName] ?? {
                        new: 0,
                        review: 0,
                    };
                    deps.data.dailyDeckStats.counts[deckName] = {
                        new: Math.max(0, currentCounts.new + (Number.isFinite(newDelta) ? newDelta : 0)),
                        review: Math.max(
                            0,
                            currentCounts.review + (Number.isFinite(reviewDelta) ? reviewDelta : 0),
                        ),
                    };
                } else {
                    continue;
                }

                deps.dailyStateAppliedOpIds[record.opId] = record.updatedAt;
                deps.dailyStateAppliedOpIds[record.targetUuid] = record.updatedAt;
                dailyStateChanged = true;
                dailyStateMetadataChanged = true;
                replaySummary.dailyStateChanged = true;
                break;
            }

            case "deck-options": {
                if (!deps.deckOptionsStore.shouldApplySyncEntity(record.targetUuid, record.updatedAt)) {
                    continue;
                }

                const state = parseDeckOptionsPayload(record.payload);
                if (!state) {
                    continue;
                }

                applyDeckOptionsStateToSettings(deps.settings, state);
                deps.deckOptionsStore.markSyncEntity({
                    targetUuid: record.targetUuid,
                    updatedAt: record.updatedAt,
                    deleted: false,
                    entityType: record.entityType,
                    pathHint: record.pathHint,
                });
                deckOptionsChanged = true;
                replaySummary.requiresGlobalSync = true;
                break;
            }

            case "notes": {
                if (record.entityType === "uuid-alias-batch") {
                    continue;
                }
                const snapshot = parseNoteSnapshotPayload(record.payload);
                if (!snapshot) {
                    continue;
                }
                await applyNoteRecord(record, snapshot, false);
                break;
            }

            case "timeline": {
                if (record.entityType === "timeline-entry") {
                    const payload = parseTimelineEntryPayload(record.payload);
                    if (!payload) {
                        continue;
                    }

                    const childTargetUuid = buildTimelineEntryTargetUuid(payload.commit.id);
                    if (
                        !deps.reviewCommitStore.shouldApplySyncEntity(
                            childTargetUuid,
                            record.updatedAt,
                        )
                    ) {
                        continue;
                    }

                    if (record.opType === "delete") {
                        deps.reviewCommitStore.removeCommitById(payload.commit.id, payload.notePath);
                    } else {
                        deps.reviewCommitStore.upsertCommitSnapshot(payload.notePath, payload.commit);
                    }
                    deps.reviewCommitStore.markSyncEntity({
                        targetUuid: childTargetUuid,
                        updatedAt: record.updatedAt,
                        deleted: record.opType === "delete",
                        entityType: "timeline-entry",
                        pathHint: payload.notePath,
                    });

                    timelineChanged = true;
                    replaySummary.timelineChanged = true;
                    break;
                }

                const payload = parseTimelineFilePayload(record.payload);
                if (!payload) {
                    continue;
                }

                if (!deps.reviewCommitStore.shouldApplySyncEntity(record.targetUuid, record.updatedAt)) {
                    continue;
                }

                if (record.opType === "rename-file" && payload.newPath) {
                    for (const commit of payload.commits) {
                        const childTargetUuid = buildTimelineEntryTargetUuid(commit.id);
                        if (
                            !deps.reviewCommitStore.shouldApplySyncEntity(
                                childTargetUuid,
                                record.updatedAt,
                            )
                        ) {
                            continue;
                        }

                        deps.reviewCommitStore.upsertCommitSnapshot(payload.newPath, commit);
                        deps.reviewCommitStore.markSyncEntity({
                            targetUuid: childTargetUuid,
                            updatedAt: record.updatedAt,
                            deleted: false,
                            entityType: "timeline-entry",
                            pathHint: payload.newPath,
                        });
                    }

                    if (payload.oldPath && payload.oldPath !== payload.newPath) {
                        deps.reviewCommitStore.deleteFile(payload.oldPath);
                    }
                    deps.reviewCommitStore.markSyncEntity({
                        targetUuid: record.targetUuid,
                        updatedAt: record.updatedAt,
                        deleted: false,
                        entityType: "timeline-file",
                        pathHint: payload.newPath,
                    });
                    timelineChanged = true;
                    replaySummary.requiresGlobalSync = true;
                    break;
                }

                if (record.opType === "delete-file") {
                    const targetPath = payload.notePath ?? payload.oldPath;
                    for (const commit of payload.commits) {
                        const childTargetUuid = buildTimelineEntryTargetUuid(commit.id);
                        if (
                            !deps.reviewCommitStore.shouldApplySyncEntity(
                                childTargetUuid,
                                record.updatedAt,
                            )
                        ) {
                            continue;
                        }

                        deps.reviewCommitStore.removeCommitById(commit.id, targetPath);
                        deps.reviewCommitStore.markSyncEntity({
                            targetUuid: childTargetUuid,
                            updatedAt: record.updatedAt,
                            deleted: true,
                            entityType: "timeline-entry",
                            pathHint: targetPath,
                        });
                    }

                    deps.reviewCommitStore.markSyncEntity({
                        targetUuid: record.targetUuid,
                        updatedAt: record.updatedAt,
                        deleted: true,
                        entityType: "timeline-file",
                        pathHint: targetPath,
                    });
                    timelineChanged = true;
                    replaySummary.requiresGlobalSync = true;
                }
                break;
            }

            case "cards": {
                if (record.entityType === "uuid-alias-batch") {
                    continue;
                }
                if (record.entityType === "card-item") {
                    const snapshot = parseCardSnapshotPayload(record.payload);
                    if (!snapshot) {
                        continue;
                    }
                    const outcome = await applyCardRecord(record, snapshot, false);
                    if (outcome === "deferred") {
                        deferredRecords.push({
                            kind: "card-item",
                            record,
                            snapshot,
                        });
                    }
                    break;
                }

                const snapshot = parseTrackedFilePayload(record.payload);
                if (!snapshot) {
                    continue;
                }
                const fileResolution = resolveTrackedFileSnapshot(snapshot);
                const resolvedFileId =
                    fileResolution?.kind === "tracked-file" ? fileResolution.fileID : null;
                const resolvedFile =
                    resolvedFileId != null ? deps.store.getFileByID(resolvedFileId) : null;
                if (resolvedFile) {
                    mergeTrackedFileAliases(
                        resolvedFileId,
                        [snapshot.uuid, ...(snapshot.aliases ?? [])],
                        buildEvidence(record, fileResolution.matchedBy, snapshot.path),
                        snapshot.path,
                    );
                    snapshot.uuid = resolvedFile.uuid;
                    snapshot.aliases = [...(resolvedFile.aliases ?? [])];
                    snapshot.path = resolvedFile.path;
                    snapshot.tags = [...(resolvedFile.tags ?? [])];
                }

                const fileTargetUuid = buildTrackedFileTargetUuid(snapshot.uuid);
                if (!deps.store.shouldApplySyncEntity(fileTargetUuid, record.updatedAt)) {
                    continue;
                }
                if (record.opType === "delete-file") {
                    deps.store.removeTrackedFileByUuid(snapshot.uuid, snapshot.path);
                    deps.store.markSyncEntity({
                        targetUuid: fileTargetUuid,
                        updatedAt: record.updatedAt,
                        deleted: true,
                        entityType: "tracked-file",
                        pathHint: snapshot.path,
                    });
                    for (const relatedItem of snapshot.relatedItems) {
                        const currentItem =
                            deps.store.findItemByUuid(relatedItem.uuid) ??
                            deps.store.findItemByUuidOrAlias(relatedItem.uuid);
                        deps.store.markSyncEntity({
                            targetUuid: buildCardTargetUuid(currentItem?.uuid ?? relatedItem.uuid),
                            updatedAt: record.updatedAt,
                            deleted: true,
                            entityType: "card-item",
                            pathHint: snapshot.path,
                        });
                    }
                } else if (record.opType === "rename-file") {
                    deps.store.renameTrackedFileFromSnapshot(snapshot);
                    deps.store.markSyncEntity({
                        targetUuid: fileTargetUuid,
                        updatedAt: record.updatedAt,
                        deleted: false,
                        entityType: "tracked-file",
                        pathHint: snapshot.path,
                    });
                    for (const relatedItem of snapshot.relatedItems) {
                        const currentItem =
                            deps.store.findItemByUuid(relatedItem.uuid) ??
                            deps.store.findItemByUuidOrAlias(relatedItem.uuid);
                        deps.store.markSyncEntity({
                            targetUuid: buildCardTargetUuid(currentItem?.uuid ?? relatedItem.uuid),
                            updatedAt: record.updatedAt,
                            deleted: false,
                            entityType: "card-item",
                            pathHint: snapshot.path,
                        });
                    }
                }

                cardsChanged = true;
                replaySummary.requiresGlobalSync = true;
                break;
            }
        }
    }

    for (const deferredRecord of deferredRecords) {
        if (deferredRecord.kind === "card-item") {
            const outcome = await applyCardRecord(
                deferredRecord.record,
                deferredRecord.snapshot,
                true,
            );
            if (outcome !== "applied") {
                logAliasDebug(deps, "equivalence-unresolved", {
                    entityType: "card-item",
                    deviceId: deferredRecord.record.deviceId,
                    targetUuid: deferredRecord.record.targetUuid,
                    pathHint: deferredRecord.snapshot.path,
                });
            }
            continue;
        }

        const outcome = await applyNoteRecord(deferredRecord.record, deferredRecord.snapshot, true);
        if (outcome !== "applied") {
            logAliasDebug(deps, "equivalence-unresolved", {
                entityType: "note-review",
                deviceId: deferredRecord.record.deviceId,
                targetUuid: deferredRecord.record.targetUuid,
                pathHint: deferredRecord.snapshot.path,
            });
        }
    }

    if (cardsChanged) {
        await deps.store.save();
    }
    if (notesChanged) {
        await deps.noteReviewStore.save();
    }
    if (timelineChanged) {
        await deps.reviewCommitStore.save();
    }
    if (deckOptionsChanged) {
        const snapshot = createDeckOptionsStoreSnapshot(
            deps.settings,
            deps.deckOptionsStore.getSyncEntities(),
        );
        await deps.deckOptionsStore.saveSerialized(snapshot.serialized);
    }
    if (sharedSettingsChanged) {
        await deps.sharedSettingsStore.save(
            extractSharedSettingsWithMetadata(
                deps.settings,
                deps.sharedSettingsUpdatedAtByField,
            ),
        );
    }
    if (trackingRulesChanged) {
        await deps.trackingRulesStore.save(
            extractTrackingRules(
                deps.data.folderTrackingRules,
                deps.trackingRulesUpdatedAtByFolderPath,
                deps.trackingRulesTombstones,
            ),
        );
    }
    if (dailyStateChanged || dailyStateMetadataChanged) {
        await deps.dailyStateStore.save(
            extractDailyStateWithMetadata(
                {
                    buryDate: deps.data.buryDate,
                    buryList: deps.data.buryList,
                    dailyDeckStats: deps.data.dailyDeckStats,
                    deviceReviewCount: deps.currentDeviceReviewCount,
                },
                deps.dailyStateAppliedOpIds,
            ),
        );
    }

    for (const domain of ["cards", "notes"] as const) {
        const groups = [...discoveredAliasGroups[domain].values()];
        if (groups.length === 0) {
            continue;
        }

        deps.collectAliasGroups?.(domain, groups);
        logAliasDebug(deps, "alias-batch-emitted", {
            domain,
            groups: groups.length,
        });
    }

    return replaySummary;
}
