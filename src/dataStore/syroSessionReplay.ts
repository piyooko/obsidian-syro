import {
    assignDeckOptionsPresetToDeck,
    buildDeckOptionsAssignmentTargetUuid,
    buildDeckOptionsPresetTargetUuid,
    createDeckOptionsStoreSnapshot,
    DeckOptionsStore,
    DECK_OPTIONS_ASSIGNMENT_ENTITY_TYPE,
    DECK_OPTIONS_PRESET_ENTITY_TYPE,
    parseDeckOptionsAssignmentPathFromTarget,
    parseDeckOptionsPresetUuidFromTarget,
    removeDeckOptionsPresetFromSettings,
    upsertDeckOptionsPresetInSettings,
    type DeckOptionsAssignmentPayload,
    type DeckOptionsPresetRemovalPayload,
} from "./deckOptionsStore";
import {
    buildFileIdentityTargetUuid,
    createDeterministicFileIdentityUuid,
    parseFileIdentityUuidFromTarget,
    SyroFileIdentityStore,
} from "./syroFileIdentityStore";
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
    buildSyroSessionCardFormalStateDigest,
    classifySyroSessionRecordImpact,
    createEmptySyroSessionReplayReceipt,
    createEmptySyroSessionReplaySummary,
    type SyroSessionReplayReceipt,
    type SyroSessionReplaySummary,
} from "./syroSessionImpact";
import type { SyroSessionRecord } from "./syroSessionManager";
import type { DeckOptionsPreset, SRSettings } from "src/settings";
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
import { DEFAULT_DECK_OPTIONS_PRESET_UUID, normalizeDeckOptionsPreset } from "src/settings";

type ReplayDependencies = {
    settings: SRSettings;
    data: {
        buryDate: string;
        buryList: string[];
        dailyDeckStats: DailyDeckStats;
        folderTrackingRules: Record<string, FolderTrackingRule>;
    };
    store: DataStore;
    fileIdentityStore: SyroFileIdentityStore;
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
    loadRemoteCardsSnapshots?: (
        deviceId: string,
    ) => Promise<ParsedTrackedCardsStoreSnapshots | null>;
    loadRemoteNotesSnapshots?: (deviceId: string) => Promise<ParsedNoteReviewStoreSnapshots | null>;
    collectAliasGroups?: (domain: "cards" | "notes", groups: SyroUuidAliasGroup[]) => void;
    collectReplayReceipt?: (receipt: SyroSessionReplayReceipt) => void;
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

function getCardReviewWatermark(item: RepetitionItem | null | undefined): number {
    if (!item) {
        return 0;
    }

    const scheduleData = isRecord(item.data) ? item.data : null;
    const lastReviewValue = scheduleData?.["last_review"];
    const parsedLastReview =
        lastReviewValue instanceof Date
            ? lastReviewValue.getTime()
            : typeof lastReviewValue === "string"
              ? Date.parse(lastReviewValue)
              : Number.NaN;
    if (Number.isFinite(parsedLastReview)) {
        return parsedLastReview;
    }
    if (item.timesReviewed > 0 && Number.isFinite(item.nextReview) && item.nextReview > 0) {
        return item.nextReview;
    }
    return 0;
}

function isSemanticallyNewerCardState(
    remoteItem: RepetitionItem,
    localItem: RepetitionItem | null | undefined,
): boolean {
    if (!localItem) {
        return true;
    }

    if (remoteItem.timesReviewed !== localItem.timesReviewed) {
        return remoteItem.timesReviewed > localItem.timesReviewed;
    }
    if (remoteItem.timesCorrect !== localItem.timesCorrect) {
        return remoteItem.timesCorrect > localItem.timesCorrect;
    }
    if (remoteItem.errorStreak !== localItem.errorStreak) {
        return remoteItem.errorStreak < localItem.errorStreak;
    }

    const remoteWatermark = getCardReviewWatermark(remoteItem);
    const localWatermark = getCardReviewWatermark(localItem);
    if (remoteWatermark !== localWatermark) {
        return remoteWatermark > localWatermark;
    }

    if (remoteItem.nextReview !== localItem.nextReview) {
        return remoteItem.nextReview > localItem.nextReview;
    }

    return false;
}

function isNoteReviewSource(value: unknown): value is NoteReviewSource {
    return value === "manual" || value === "tag" || value === "folder";
}

function buildTimelineEntryTargetUuid(commitId: string): string {
    return `timeline-entry:${commitId}`;
}

function buildTimelineFileTargetUuid(fileUuid: string): string {
    return `timeline-file:${fileUuid}`;
}

function parseTimelineFileUuidFromTarget(targetUuid: string): string {
    return targetUuid.startsWith("timeline-file:")
        ? targetUuid.substring("timeline-file:".length)
        : "";
}

function buildCardTargetUuid(itemUuid: string): string {
    return itemUuid;
}

function buildTrackedFileTargetUuid(fileUuid: string): string {
    return `tracked-file:${fileUuid}`;
}

function parseDeckOptionsPresetPayload(payload: unknown): DeckOptionsPreset | null {
    if (!isRecord(payload)) {
        return null;
    }

    return normalizeDeckOptionsPreset(payload);
}

function parseDeckOptionsPresetRemovalPayload(
    payload: unknown,
): DeckOptionsPresetRemovalPayload | null {
    if (!isRecord(payload)) {
        return null;
    }

    const uuid = getStringProp(payload, "uuid")?.trim();
    return uuid ? { uuid } : null;
}

function parseDeckOptionsAssignmentPayload(payload: unknown): DeckOptionsAssignmentPayload | null {
    if (!isRecord(payload)) {
        return null;
    }

    const deckPath = getStringProp(payload, "deckPath")?.trim();
    const presetUuid = getStringProp(payload, "presetUuid")?.trim();
    if (!deckPath) {
        return null;
    }

    return {
        deckPath,
        ...(presetUuid ? { presetUuid } : {}),
    };
}

function parseFileIdentityPayload(payload: unknown): {
    uuid: string;
    createdAt?: string;
    path?: string;
    aliases: string[];
} | null {
    if (!isRecord(payload)) {
        return null;
    }

    const uuid = getStringProp(payload, "uuid")?.trim();
    if (!uuid) {
        return null;
    }

    return {
        uuid,
        createdAt: getStringProp(payload, "createdAt")?.trim(),
        path: getStringProp(payload, "path")?.trim(),
        aliases: getArrayProp(payload, "aliases").filter(
            (alias): alias is string => typeof alias === "string",
        ),
    };
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

function parseTimelineEntryPayload(payload: unknown): {
    notePath: string;
    fileUuid?: string;
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
        fileUuid: getStringProp(payload, "fileUuid")?.trim(),
        commit: cloneUnknown(payload["commit"] as unknown as ReviewCommitLog),
    };
}

function parseTimelineFilePayload(payload: unknown): {
    fileUuid?: string;
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
        fileUuid: getStringProp(payload, "fileUuid")?.trim(),
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
    const fileUuid =
        getStringProp(payload, "fileUuid")?.trim() ||
        getStringProp(payload, "trackedFileUuid")?.trim();
    const trackedFileAliases = getArrayProp(payload, "trackedFileAliases").filter(
        (tag): tag is string => typeof tag === "string",
    );
    const trackedFileTags = getArrayProp(payload, "trackedFileTags").filter(
        (tag): tag is string => typeof tag === "string",
    );

    if (!path || !fileUuid || !isRecord(payload["item"])) {
        return null;
    }

    return {
        path,
        fileUuid,
        trackedFileUuid: fileUuid,
        trackedFileAliases,
        trackedFileTags,
        trackedItem: isRecord(payload["trackedItem"])
            ? cloneUnknown(
                  payload["trackedItem"] as unknown as NonNullable<
                      TrackedCardSnapshot["trackedItem"]
                  >,
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
    const tags = getArrayProp(payload, "tags").filter(
        (tag): tag is string => typeof tag === "string",
    );

    if (!uuid || !path) {
        return null;
    }

    return {
        uuid,
        aliases: getArrayProp(payload, "aliases").filter(
            (alias): alias is string => typeof alias === "string",
        ),
        path,
        oldPath: getStringProp(payload, "oldPath")?.trim(),
        newPath: getStringProp(payload, "newPath")?.trim(),
        tags,
        items: isRecord(payload["items"]) ? (payload["items"] as Record<string, number>) : {},
        trackedItems: getArrayProp(payload, "trackedItems")
            .filter((item): item is NonNullable<TrackedCardsFileSnapshot["trackedItems"]>[number] =>
                isRecord(item),
            )
            .map((item) => cloneUnknown(item)),
        relatedItems: getArrayProp(payload, "relatedItems")
            .filter((item): item is RepetitionItem => isRecord(item))
            .map((item) => RepetitionItem.create(item as unknown as RepetitionItem)),
    };
}

function parseSharedSettingsPatch(payload: unknown): {
    changed: Record<string, unknown>;
} | null {
    if (!isRecord(payload) || !isRecord(payload["changed"])) {
        return null;
    }

    return {
        changed: cloneUnknown(payload["changed"] as Record<string, unknown>),
    };
}

function parseTrackingRulePayload(payload: unknown): {
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
        rule: isRecord(payload["rule"]) ? cloneFolderTrackingRule(payload["rule"]) : undefined,
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
                lineNo:
                    typeof rawEvidence["lineNo"] === "number" ? rawEvidence["lineNo"] : undefined,
                clozeId:
                    typeof rawEvidence["clozeId"] === "string" ? rawEvidence["clozeId"] : undefined,
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

function logDailyStateDebug(
    deps: ReplayDependencies,
    event: string,
    payload: Record<string, unknown>,
): void {
    if (deps.shouldLogDebug?.()) {
        deps.logDebug?.(`[SR-DailyState] ${event}`, payload);
    }
}

function buildNegativeCacheKey(record: SyroSessionRecord): string {
    return `${record.deviceId}|${record.domain}|${record.entityType}|${record.targetUuid}`;
}

function ensureDailyStateDate(
    data: ReplayDependencies["data"],
    date: string,
): "applied" | "same-day" | "stale" {
    if (!date) {
        return "stale";
    }

    const currentDate = data.dailyDeckStats.date || data.buryDate || "";
    if (currentDate && currentDate > date) {
        return "stale";
    }

    const sameDay = data.buryDate === date && data.dailyDeckStats.date === date;

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

    return sameDay ? "same-day" : "applied";
}

function hasNewerOrEqualTimestamp(current: string | null | undefined, next: string): boolean {
    return !!current && compareIsoTime(current, next) >= 0;
}

function getTrackingRuleWatermark(deps: ReplayDependencies, folderPath: string): string | null {
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
    let fileIdentitiesChanged = false;
    let deckOptionsChanged = false;
    let sharedSettingsChanged = false;
    let trackingRulesChanged = false;
    let dailyStateChanged = false;
    let dailyStateMetadataChanged = false;
    let notesChanged = false;
    let timelineChanged = false;
    let cardsChanged = false;
    const replaySummary = createEmptySyroSessionReplaySummary();
    const replayReceipt = createEmptySyroSessionReplayReceipt();
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
    const dailyStateReplayStats = {
        seen: 0,
        applied: 0,
        skippedInvalid: 0,
        skippedAlreadyApplied: 0,
        skippedStaleDate: 0,
        skippedUnsupportedOp: 0,
        affectedDeckLineages: new Set<string>(),
    };

    const registerPendingAliasGroup = (group: SyroUuidAliasGroup): void => {
        const registry = pendingAliasGroups[group.entityType];
        for (const uuid of normalizeEquivalentUuids(
            group.emitterPrimaryUuid,
            group.equivalentUuids,
        )) {
            registry.set(uuid, group);
        }
    };

    const clearPendingAliasGroup = (group: SyroUuidAliasGroup): void => {
        const registry = pendingAliasGroups[group.entityType];
        for (const uuid of normalizeEquivalentUuids(
            group.emitterPrimaryUuid,
            group.equivalentUuids,
        )) {
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
        const fileIdentity =
            deps.fileIdentityStore.getByUuidOrAlias(snapshot.uuid) ??
            deps.fileIdentityStore.getByPath(snapshot.path);
        const canonicalUuid = fileIdentity?.uuid || snapshot.uuid;
        const canonicalPath = fileIdentity?.path || snapshot.path;

        const exactFileId = deps.store.findFileIdByUuid(canonicalUuid);
        if (exactFileId) {
            return {
                kind: "tracked-file",
                fileID: exactFileId,
                matchedBy:
                    canonicalUuid !== snapshot.uuid || canonicalPath !== snapshot.path
                        ? "file-identity"
                        : "canonical-hit",
            };
        }

        const aliasFileId =
            deps.store.findFileIdByUuidOrAlias(canonicalUuid) ||
            deps.store.findFileIdByUuidOrAlias(snapshot.uuid);
        if (aliasFileId) {
            return {
                kind: "tracked-file",
                fileID: aliasFileId,
                matchedBy:
                    canonicalUuid !== snapshot.uuid || canonicalPath !== snapshot.path
                        ? "file-identity"
                        : "alias-hit",
            };
        }

        const pathFileId =
            deps.store.getFileID(canonicalPath) || deps.store.getFileID(snapshot.path);
        if (pathFileId) {
            return {
                kind: "tracked-file",
                fileID: pathFileId,
                matchedBy:
                    canonicalUuid !== snapshot.uuid || canonicalPath !== snapshot.path
                        ? "file-identity"
                        : "snapshot-reconcile",
            };
        }

        return null;
    };

    const collectTrackedFileCandidateIds = (
        snapshot: Pick<
            TrackedCardsFileSnapshot,
            "uuid" | "aliases" | "path" | "oldPath" | "newPath"
        >,
    ): {
        fileIDs: string[];
        matchedBy: SyroUuidAliasEvidence["matchedBy"];
        canonicalUuid: string;
    } => {
        const candidatePaths = [
            snapshot.oldPath?.trim() ?? "",
            snapshot.newPath?.trim() ?? "",
            snapshot.path.trim(),
        ].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
        const snapshotUuids = normalizeEquivalentUuids(snapshot.uuid, snapshot.aliases ?? []);
        const fileIdentities = [
            ...snapshotUuids
                .map((uuid) => deps.fileIdentityStore.getByUuidOrAlias(uuid))
                .filter((identity): identity is NonNullable<typeof identity> => identity !== null),
            ...candidatePaths
                .map((path) => deps.fileIdentityStore.getByPath(path))
                .filter((identity): identity is NonNullable<typeof identity> => identity !== null),
        ];
        const canonicalIdentity = fileIdentities[0] ?? null;
        const candidateUuids = [
            ...snapshotUuids,
            ...fileIdentities.flatMap((identity) => [identity.uuid, ...(identity.aliases ?? [])]),
        ].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
        const fileIDs = deps.store.findTrackedFileIds({
            uuids: candidateUuids,
            paths: [...candidatePaths, ...fileIdentities.map((identity) => identity.path)].filter(
                (value, index, values) => value.length > 0 && values.indexOf(value) === index,
            ),
        });

        return {
            fileIDs,
            matchedBy:
                fileIDs.length === 0
                    ? canonicalIdentity
                        ? "file-identity"
                        : "snapshot-reconcile"
                    : canonicalIdentity
                      ? "file-identity"
                      : candidateUuids.some((uuid) => deps.store.findFileIdsByUuid(uuid).length > 0)
                        ? "canonical-hit"
                        : candidatePaths.some(
                                (path) => deps.store.findFileIdsByPath(path).length > 0,
                            )
                          ? "snapshot-reconcile"
                          : "alias-hit",
            canonicalUuid: canonicalIdentity?.uuid ?? snapshot.uuid,
        };
    };

    const selectCanonicalTrackedFileId = (
        fileIDs: readonly string[],
        snapshot: Pick<
            TrackedCardsFileSnapshot,
            "uuid" | "aliases" | "path" | "oldPath" | "newPath"
        >,
        canonicalUuid: string,
    ): string | null => {
        const preferredPaths = [
            snapshot.newPath?.trim() ?? "",
            snapshot.path.trim(),
            snapshot.oldPath?.trim() ?? "",
        ].filter((value) => value.length > 0);
        const normalizedSnapshotUuids = normalizeEquivalentUuids(
            snapshot.uuid,
            snapshot.aliases ?? [],
        );

        for (const path of preferredPaths) {
            const match = fileIDs.find((fileID) => deps.store.getFileByID(fileID)?.path === path);
            if (match) {
                return match;
            }
        }

        const exactUuidMatch = fileIDs.find((fileID) => {
            const trackedFile = deps.store.getFileByID(fileID);
            return trackedFile?.uuid === canonicalUuid || trackedFile?.uuid === snapshot.uuid;
        });
        if (exactUuidMatch) {
            return exactUuidMatch;
        }

        const aliasMatch = fileIDs.find((fileID) => {
            const trackedFile = deps.store.getFileByID(fileID);
            return normalizedSnapshotUuids.some((uuid) => trackedFile?.aliases?.includes(uuid));
        });
        return aliasMatch ?? fileIDs[0] ?? null;
    };

    const canonicalizeTrackedFilesFromFileIdentities = (): boolean => {
        let changed = false;
        for (const identity of Object.values(deps.fileIdentityStore.getState().entries)) {
            const candidateFileIds = deps.store.findTrackedFileIds({
                uuids: [identity.uuid, ...(identity.aliases ?? [])],
                paths: [identity.path],
            });
            if (candidateFileIds.length === 0) {
                continue;
            }

            if (identity.deleted) {
                changed = deps.store.removeTrackedFilesByIds(candidateFileIds) || changed;
                continue;
            }

            if (candidateFileIds.length < 2) {
                continue;
            }

            const canonicalFileId =
                candidateFileIds.find(
                    (fileID) => deps.store.getFileByID(fileID)?.path === identity.path,
                ) ?? candidateFileIds[0];
            if (!canonicalFileId) {
                continue;
            }

            changed =
                deps.store.collapseTrackedFilesToCanonical(
                    canonicalFileId,
                    candidateFileIds.filter((fileID) => fileID !== canonicalFileId),
                ) || changed;
        }
        return changed;
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

    const resolveTimelineFileIdentity = (input: {
        path: string;
        fileUuid?: string;
        updatedAt: string;
    }): { fileUuid: string; path: string } | null => {
        const candidatePath = input.path.trim();
        const candidateFileUuid = input.fileUuid?.trim() ?? "";
        if (!candidatePath && !candidateFileUuid) {
            return null;
        }

        const existingIdentityByUuid = candidateFileUuid
            ? deps.fileIdentityStore.getByUuidOrAlias(candidateFileUuid)
            : null;
        const existingIdentityByPath = deps.fileIdentityStore.getByPath(candidatePath);
        const existingIdentity = existingIdentityByUuid ?? existingIdentityByPath;
        const trackedFileUuid = deps.store.getTrackedFile(candidatePath)?.uuid?.trim() ?? "";
        const noteFileUuid = deps.noteReviewStore.getEntry(candidatePath)?.item.uuid?.trim() ?? "";
        const canonicalFileUuid =
            existingIdentity?.uuid ||
            trackedFileUuid ||
            noteFileUuid ||
            candidateFileUuid ||
            createDeterministicFileIdentityUuid(candidatePath);
        const shouldRefreshIdentity =
            !!candidatePath &&
            (!existingIdentity ||
                (!existingIdentityByUuid &&
                    compareIsoTime(existingIdentity.updatedAt, input.updatedAt) <= 0));
        if (shouldRefreshIdentity) {
            deps.fileIdentityStore.upsert({
                uuid: canonicalFileUuid,
                createdAt: existingIdentity?.createdAt ?? input.updatedAt,
                updatedAt: input.updatedAt,
                path: candidatePath,
                aliases: [
                    ...(existingIdentity?.aliases ?? []),
                    ...[candidateFileUuid, trackedFileUuid, noteFileUuid].filter(
                        (value): value is string =>
                            typeof value === "string" &&
                            value.trim().length > 0 &&
                            value.trim() !== canonicalFileUuid,
                    ),
                ],
                deleted: false,
            });
        }

        return {
            fileUuid: canonicalFileUuid,
            path: existingIdentityByUuid?.path
                ? existingIdentityByUuid.path
                : shouldRefreshIdentity || !existingIdentity?.path
                  ? candidatePath
                  : existingIdentity.path,
        };
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
            applyIncoming(
                normalizeEquivalentUuids(group.emitterPrimaryUuid, group.equivalentUuids),
            );
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
        absorbPendingAliasGroups(
            "tracked-file",
            deps.store.getFileEquivalentUuids(fileID),
            (pendingUuids) => {
                deps.store.mergeFileUuidEquivalence(fileID, pendingUuids);
            },
        );
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
        absorbPendingAliasGroups(
            "card-item",
            deps.store.getItemEquivalentUuids(itemId),
            (pendingUuids) => {
                deps.store.mergeItemUuidEquivalence(itemId, pendingUuids);
            },
        );
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
            for (const uuid of normalizeEquivalentUuids(
                group.emitterPrimaryUuid,
                group.equivalentUuids,
            )) {
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
            for (const uuid of normalizeEquivalentUuids(
                group.emitterPrimaryUuid,
                group.equivalentUuids,
            )) {
                const exactItem =
                    deps.store.findItemByUuid(uuid) ?? deps.store.findItemByUuidOrAlias(uuid);
                if (exactItem) {
                    resolution = {
                        kind: "card-item",
                        itemId: exactItem.ID,
                        matchedBy: exactItem.uuid === uuid ? "canonical-hit" : "alias-hit",
                    };
                    break;
                }
            }
            if (!resolution && group.pathHint && typeof group.evidence.lineNo === "number") {
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
            for (const uuid of normalizeEquivalentUuids(
                group.emitterPrimaryUuid,
                group.equivalentUuids,
            )) {
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
            fileUuid: snapshot.fileUuid ?? snapshot.trackedFileUuid,
            trackedFileAliases: [...(snapshot.trackedFileAliases ?? [])],
            trackedFileTags: [...snapshot.trackedFileTags],
            trackedItem: snapshot.trackedItem ? cloneUnknown(snapshot.trackedItem) : null,
            item: RepetitionItem.create(snapshot.item),
        };

        let fileResolution = resolveTrackedFileSnapshot({
            uuid: workingSnapshot.fileUuid ?? workingSnapshot.trackedFileUuid,
            path: workingSnapshot.path,
        });
        if (!fileResolution && allowRemoteFetch) {
            const remoteSnapshot = await loadRemoteCardSnapshot(record, workingSnapshot);
            if (remoteSnapshot) {
                workingSnapshot = remoteSnapshot;
                fileResolution = resolveTrackedFileSnapshot({
                    uuid: workingSnapshot.fileUuid ?? workingSnapshot.trackedFileUuid,
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
            [
                workingSnapshot.fileUuid ?? workingSnapshot.trackedFileUuid,
                ...(workingSnapshot.trackedFileAliases ?? []),
            ],
            fileEvidence,
            workingSnapshot.path,
        );
        const resolvedFile = deps.store.getFileByID(fileResolution.fileID);
        if (!resolvedFile) {
            return allowRemoteFetch ? "skipped" : "deferred";
        }

        workingSnapshot.fileUuid = resolvedFile.uuid;
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
            const cardEvidence = buildEvidence(
                record,
                cardResolution.matchedBy,
                workingSnapshot.path,
                {
                    lineNo: workingSnapshot.trackedItem?.lineNo,
                    clozeId: workingSnapshot.trackedItem?.clozeId,
                    fingerprintUnique,
                },
            );
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
        const currentItemBeforeApply =
            cardResolution?.kind === "card-item"
                ? deps.store.getItembyID(cardResolution.itemId)
                : deps.store.findItemByUuidOrAlias(workingSnapshot.item.uuid);
        const shouldApplyByTimestamp = deps.store.shouldApplySyncEntity(
            cardTargetUuid,
            record.updatedAt,
        );
        const shouldApplyBySemanticProgress =
            !shouldApplyByTimestamp &&
            isSemanticallyNewerCardState(workingSnapshot.item, currentItemBeforeApply);
        if (!shouldApplyByTimestamp && !shouldApplyBySemanticProgress) {
            return "skipped";
        }
        if (shouldApplyBySemanticProgress) {
            deps.logDebug?.("[SR-Syro] card replay accepted semantically newer state", {
                targetUuid: cardTargetUuid,
                recordUpdatedAt: record.updatedAt,
                localTimesReviewed: currentItemBeforeApply?.timesReviewed ?? 0,
                remoteTimesReviewed: workingSnapshot.item.timesReviewed,
                localNextReview: currentItemBeforeApply?.nextReview ?? 0,
                remoteNextReview: workingSnapshot.item.nextReview,
            });
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
        const currentItem = deps.store.findItemByUuidOrAlias(cardTargetUuid);
        const currentSnapshot =
            currentItem && currentItem.ID >= 0 ? deps.store.getCardSnapshot(currentItem.ID) : null;
        replayReceipt.cards.push({
            targetUuid: cardTargetUuid,
            updatedAt: record.updatedAt,
            pathHint: workingSnapshot.path,
            stateDigest: buildSyroSessionCardFormalStateDigest(
                currentSnapshot ?? {
                    path: workingSnapshot.path,
                    trackedFileUuid: workingSnapshot.trackedFileUuid,
                    trackedFileAliases: [...(workingSnapshot.trackedFileAliases ?? [])],
                    trackedItem: workingSnapshot.trackedItem ?? null,
                    item: workingSnapshot.item,
                },
            ),
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

        const trackedFileUuid = deps.store.getTrackedFile(workingSnapshot.path)?.uuid?.trim() ?? "";
        const existingFileIdentity =
            deps.fileIdentityStore.getByUuidOrAlias(workingSnapshot.item.uuid) ??
            deps.fileIdentityStore.getByPath(workingSnapshot.path);
        const canonicalFileUuid =
            existingFileIdentity?.uuid ||
            trackedFileUuid ||
            workingSnapshot.item.uuid ||
            createDeterministicFileIdentityUuid(workingSnapshot.path);
        const mergedNoteAliases = mergeEquivalentUuids(
            canonicalFileUuid,
            workingSnapshot.item.aliases,
            [workingSnapshot.item.uuid, ...(existingFileIdentity?.aliases ?? [])],
        );
        const shouldRefreshFileIdentity =
            !existingFileIdentity ||
            compareIsoTime(existingFileIdentity.updatedAt, record.updatedAt) <= 0;
        if (shouldRefreshFileIdentity) {
            deps.fileIdentityStore.upsert({
                uuid: canonicalFileUuid,
                createdAt: existingFileIdentity?.createdAt ?? record.createdAt,
                updatedAt: record.updatedAt,
                path: workingSnapshot.path,
                aliases: mergedNoteAliases,
                deleted: false,
            });
        } else if (existingFileIdentity?.path) {
            workingSnapshot.path = existingFileIdentity.path;
        }
        workingSnapshot.item.uuid = canonicalFileUuid;
        workingSnapshot.item.aliases = mergedNoteAliases;
        workingSnapshot.item.setTracked(workingSnapshot.path);
        workingSnapshot.item.updateDeckName(workingSnapshot.deckName, false);

        let noteResolution = resolveNoteSnapshot(workingSnapshot);
        if (!noteResolution && allowRemoteFetch) {
            const remoteSnapshot = await loadRemoteNoteSnapshot(record, workingSnapshot);
            if (remoteSnapshot) {
                workingSnapshot = remoteSnapshot;
                const remoteTrackedFileUuid =
                    deps.store.getTrackedFile(workingSnapshot.path)?.uuid?.trim() ?? "";
                const remoteExistingFileIdentity =
                    deps.fileIdentityStore.getByUuidOrAlias(workingSnapshot.item.uuid) ??
                    deps.fileIdentityStore.getByPath(workingSnapshot.path);
                const remoteCanonicalFileUuid =
                    remoteExistingFileIdentity?.uuid ||
                    remoteTrackedFileUuid ||
                    workingSnapshot.item.uuid ||
                    createDeterministicFileIdentityUuid(workingSnapshot.path);
                workingSnapshot.item.aliases = mergeEquivalentUuids(
                    remoteCanonicalFileUuid,
                    workingSnapshot.item.aliases,
                    [workingSnapshot.item.uuid, ...(remoteExistingFileIdentity?.aliases ?? [])],
                );
                workingSnapshot.item.uuid = remoteCanonicalFileUuid;
                workingSnapshot.item.setTracked(workingSnapshot.path);
                workingSnapshot.item.updateDeckName(workingSnapshot.deckName, false);
                noteResolution = resolveNoteSnapshot(workingSnapshot);
            }
        }

        if (noteResolution?.kind === "note-review") {
            const noteEvidence = buildEvidence(
                record,
                noteResolution.matchedBy,
                workingSnapshot.path,
            );
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
        if (record.domain !== "file-identities" || record.entityType !== "file-identity") {
            continue;
        }

        const payload = parseFileIdentityPayload(record.payload);
        const fileUuid = parseFileIdentityUuidFromTarget(record.targetUuid) || payload?.uuid || "";
        const path = payload?.path?.trim() || record.pathHint?.trim() || "";
        if (!fileUuid || !path) {
            continue;
        }

        const targetUuid = buildFileIdentityTargetUuid(fileUuid);
        if (!deps.fileIdentityStore.shouldApplySyncEntity(targetUuid, record.updatedAt)) {
            continue;
        }

        if (record.opType === "delete") {
            deps.fileIdentityStore.upsert({
                uuid: fileUuid,
                createdAt: payload?.createdAt || record.createdAt,
                updatedAt: record.updatedAt,
                path,
                aliases: payload?.aliases ?? [],
                deleted: true,
            });
            deps.fileIdentityStore.markSyncEntity({
                targetUuid,
                updatedAt: record.updatedAt,
                deleted: true,
                entityType: "file-identity",
                pathHint: path,
            });
        } else if (record.opType === "upsert") {
            deps.fileIdentityStore.upsert({
                uuid: fileUuid,
                createdAt: payload?.createdAt || record.createdAt,
                updatedAt: record.updatedAt,
                path,
                aliases: payload?.aliases ?? [],
                deleted: false,
            });
            deps.fileIdentityStore.markSyncEntity({
                targetUuid,
                updatedAt: record.updatedAt,
                deleted: false,
                entityType: "file-identity",
                pathHint: path,
            });
        } else {
            continue;
        }

        fileIdentitiesChanged = true;
        replaySummary.requiresGlobalSync = true;
    }

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
            case "file-identities":
                break;

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
                dailyStateReplayStats.seen++;
                const payload = parseDailyStateOpPayload(record.payload);
                if (!payload) {
                    dailyStateReplayStats.skippedInvalid++;
                    continue;
                }
                if (
                    deps.dailyStateAppliedOpIds[record.opId] ||
                    deps.dailyStateAppliedOpIds[record.targetUuid]
                ) {
                    dailyStateReplayStats.skippedAlreadyApplied++;
                    continue;
                }

                const date = getStringProp(payload, "date")?.trim() ?? "";
                if (record.opType === "rollover-reset") {
                    const ensureResult = ensureDailyStateDate(deps.data, date);
                    if (ensureResult === "stale") {
                        dailyStateReplayStats.skippedStaleDate++;
                        continue;
                    }
                    if (ensureResult !== "same-day") {
                        deps.data.buryList.splice(0, deps.data.buryList.length);
                        deps.data.dailyDeckStats = {
                            date,
                            counts: {},
                        };
                    }
                } else if (record.opType === "bury-add") {
                    if (ensureDailyStateDate(deps.data, date) === "stale") {
                        dailyStateReplayStats.skippedStaleDate++;
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
                        dailyStateReplayStats.skippedStaleDate++;
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
                        dailyStateReplayStats.skippedStaleDate++;
                        continue;
                    }
                    const deckName = getStringProp(payload, "deckName")?.trim();
                    if (!deckName) {
                        dailyStateReplayStats.skippedInvalid++;
                        continue;
                    }
                    const newDelta = Number(payload["newDelta"] ?? 0);
                    const reviewDelta = Number(payload["reviewDelta"] ?? 0);
                    const currentCounts = deps.data.dailyDeckStats.counts[deckName] ?? {
                        new: 0,
                        review: 0,
                    };
                    deps.data.dailyDeckStats.counts[deckName] = {
                        new: Math.max(
                            0,
                            currentCounts.new + (Number.isFinite(newDelta) ? newDelta : 0),
                        ),
                        review: Math.max(
                            0,
                            currentCounts.review + (Number.isFinite(reviewDelta) ? reviewDelta : 0),
                        ),
                    };
                    replayReceipt.dailyStateDeckCounts[deckName] = {
                        ...deps.data.dailyDeckStats.counts[deckName],
                    };
                    dailyStateReplayStats.affectedDeckLineages.add(deckName);
                } else {
                    dailyStateReplayStats.skippedUnsupportedOp++;
                    continue;
                }

                deps.dailyStateAppliedOpIds[record.opId] = record.updatedAt;
                deps.dailyStateAppliedOpIds[record.targetUuid] = record.updatedAt;
                replayReceipt.dailyStateTargetUuids.push(record.targetUuid);
                dailyStateChanged = true;
                dailyStateMetadataChanged = true;
                replaySummary.dailyStateChanged = true;
                dailyStateReplayStats.applied++;
                break;
            }

            case "deck-options": {
                if (record.entityType === DECK_OPTIONS_PRESET_ENTITY_TYPE) {
                    const removalPayload = parseDeckOptionsPresetRemovalPayload(record.payload);
                    const preset =
                        record.opType === "delete"
                            ? null
                            : parseDeckOptionsPresetPayload(record.payload);
                    const presetUuid =
                        parseDeckOptionsPresetUuidFromTarget(record.targetUuid) ||
                        removalPayload?.uuid ||
                        preset?.uuid ||
                        "";
                    if (!presetUuid) {
                        continue;
                    }

                    if (
                        !deps.deckOptionsStore.shouldApplySyncEntity(
                            record.targetUuid,
                            record.updatedAt,
                            {
                                deleted: record.opType === "delete",
                                preferDeleteOnEqual: true,
                            },
                        )
                    ) {
                        continue;
                    }

                    if (record.opType === "delete") {
                        removeDeckOptionsPresetFromSettings(deps.settings, presetUuid);
                    } else {
                        if (!preset || preset.uuid !== presetUuid) {
                            continue;
                        }
                        upsertDeckOptionsPresetInSettings(deps.settings, preset);
                    }

                    deps.deckOptionsStore.markSyncEntity(
                        {
                            targetUuid: buildDeckOptionsPresetTargetUuid(presetUuid),
                            updatedAt: record.updatedAt,
                            deleted: record.opType === "delete",
                            entityType: DECK_OPTIONS_PRESET_ENTITY_TYPE,
                            pathHint: record.pathHint,
                        },
                        {
                            preferDeleteOnEqual: true,
                        },
                    );
                    deckOptionsChanged = true;
                    replaySummary.requiresGlobalSync = true;
                    break;
                }

                if (record.entityType === DECK_OPTIONS_ASSIGNMENT_ENTITY_TYPE) {
                    const payload = parseDeckOptionsAssignmentPayload(record.payload);
                    const deckPath =
                        payload?.deckPath ||
                        parseDeckOptionsAssignmentPathFromTarget(record.targetUuid);
                    if (!deckPath) {
                        continue;
                    }

                    if (
                        !deps.deckOptionsStore.shouldApplySyncEntity(
                            record.targetUuid,
                            record.updatedAt,
                            {
                                deleted: record.opType === "unassign",
                                preferDeleteOnEqual: true,
                            },
                        )
                    ) {
                        continue;
                    }

                    if (record.opType === "assign") {
                        assignDeckOptionsPresetToDeck(
                            deps.settings,
                            deckPath,
                            payload?.presetUuid ?? DEFAULT_DECK_OPTIONS_PRESET_UUID,
                        );
                    } else {
                        assignDeckOptionsPresetToDeck(
                            deps.settings,
                            deckPath,
                            DEFAULT_DECK_OPTIONS_PRESET_UUID,
                        );
                    }

                    deps.deckOptionsStore.markSyncEntity(
                        {
                            targetUuid: buildDeckOptionsAssignmentTargetUuid(deckPath),
                            updatedAt: record.updatedAt,
                            deleted: record.opType === "unassign",
                            entityType: DECK_OPTIONS_ASSIGNMENT_ENTITY_TYPE,
                            pathHint: record.pathHint,
                        },
                        {
                            preferDeleteOnEqual: true,
                        },
                    );
                    deckOptionsChanged = true;
                    replaySummary.requiresGlobalSync = true;
                }
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

                    const resolvedTimelineFile = resolveTimelineFileIdentity({
                        path: payload.notePath,
                        fileUuid: payload.fileUuid,
                        updatedAt: record.updatedAt,
                    });
                    const canonicalPath = resolvedTimelineFile?.path ?? payload.notePath;

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
                        deps.reviewCommitStore.removeCommitById(payload.commit.id, canonicalPath);
                    } else {
                        deps.reviewCommitStore.upsertCommitSnapshot(canonicalPath, payload.commit);
                    }
                    deps.reviewCommitStore.markSyncEntity({
                        targetUuid: childTargetUuid,
                        updatedAt: record.updatedAt,
                        deleted: record.opType === "delete",
                        entityType: "timeline-entry",
                        pathHint: canonicalPath,
                    });

                    timelineChanged = true;
                    replaySummary.timelineChanged = true;
                    break;
                }

                const payload = parseTimelineFilePayload(record.payload);
                if (!payload) {
                    continue;
                }

                const resolvedTimelineFile = resolveTimelineFileIdentity({
                    path:
                        payload.newPath ??
                        payload.notePath ??
                        payload.oldPath ??
                        record.pathHint ??
                        "",
                    fileUuid: payload.fileUuid,
                    updatedAt: record.updatedAt,
                });
                const timelineFileUuid =
                    resolvedTimelineFile?.fileUuid ||
                    payload.fileUuid ||
                    parseTimelineFileUuidFromTarget(record.targetUuid) ||
                    createDeterministicFileIdentityUuid(
                        payload.newPath ??
                            payload.notePath ??
                            payload.oldPath ??
                            record.pathHint ??
                            "",
                    );
                const fileTargetUuid = buildTimelineFileTargetUuid(timelineFileUuid);
                if (
                    !deps.reviewCommitStore.shouldApplySyncEntity(fileTargetUuid, record.updatedAt)
                ) {
                    continue;
                }

                if (record.opType === "rename-file" && payload.newPath) {
                    const targetPath = resolvedTimelineFile?.path ?? payload.newPath;
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

                        deps.reviewCommitStore.upsertCommitSnapshot(targetPath, commit);
                        deps.reviewCommitStore.markSyncEntity({
                            targetUuid: childTargetUuid,
                            updatedAt: record.updatedAt,
                            deleted: false,
                            entityType: "timeline-entry",
                            pathHint: targetPath,
                        });
                    }

                    if (payload.oldPath && payload.oldPath !== targetPath) {
                        deps.reviewCommitStore.deleteFile(payload.oldPath);
                    }
                    deps.reviewCommitStore.markSyncEntity({
                        targetUuid: fileTargetUuid,
                        updatedAt: record.updatedAt,
                        deleted: false,
                        entityType: "timeline-file",
                        pathHint: targetPath,
                    });
                    timelineChanged = true;
                    replaySummary.requiresGlobalSync = true;
                    break;
                }

                if (record.opType === "delete-file") {
                    const targetPath =
                        resolvedTimelineFile?.path ?? payload.notePath ?? payload.oldPath ?? "";
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
                        targetUuid: fileTargetUuid,
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
                const candidateResolution = collectTrackedFileCandidateIds(snapshot);
                const canonicalFileId = selectCanonicalTrackedFileId(
                    candidateResolution.fileIDs,
                    snapshot,
                    candidateResolution.canonicalUuid,
                );
                if (canonicalFileId) {
                    mergeTrackedFileAliases(
                        canonicalFileId,
                        [snapshot.uuid, ...(snapshot.aliases ?? [])],
                        buildEvidence(
                            record,
                            candidateResolution.matchedBy,
                            snapshot.newPath ?? snapshot.path,
                        ),
                        snapshot.newPath ?? snapshot.path,
                    );
                    const duplicateFileIds = candidateResolution.fileIDs.filter(
                        (fileID) => fileID !== canonicalFileId,
                    );
                    if (duplicateFileIds.length > 0) {
                        cardsChanged =
                            deps.store.collapseTrackedFilesToCanonical(
                                canonicalFileId,
                                duplicateFileIds,
                            ) || cardsChanged;
                    }
                    const canonicalFile = deps.store.getFileByID(canonicalFileId);
                    if (canonicalFile) {
                        snapshot.uuid = canonicalFile.uuid;
                        snapshot.aliases = [...(canonicalFile.aliases ?? [])];
                    }
                }

                const fileTargetUuid = buildTrackedFileTargetUuid(snapshot.uuid);
                if (!deps.store.shouldApplySyncEntity(fileTargetUuid, record.updatedAt)) {
                    continue;
                }
                if (record.opType === "delete-file") {
                    const deleteCandidateIds =
                        candidateResolution.fileIDs.length > 0
                            ? candidateResolution.fileIDs
                            : deps.store.findTrackedFileIds({
                                  uuids: [snapshot.uuid, ...(snapshot.aliases ?? [])],
                                  paths: [
                                      snapshot.oldPath ?? "",
                                      snapshot.newPath ?? "",
                                      snapshot.path,
                                  ],
                              });
                    if (deleteCandidateIds.length > 0) {
                        deps.store.removeTrackedFilesByIds(deleteCandidateIds);
                    } else {
                        deps.store.removeTrackedFileByUuid(
                            snapshot.uuid,
                            snapshot.oldPath ?? snapshot.path,
                        );
                    }
                    deps.store.markSyncEntity({
                        targetUuid: fileTargetUuid,
                        updatedAt: record.updatedAt,
                        deleted: true,
                        entityType: "tracked-file",
                        pathHint: snapshot.oldPath ?? snapshot.path,
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
                    snapshot.path = snapshot.newPath ?? snapshot.path;
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

    cardsChanged = canonicalizeTrackedFilesFromFileIdentities() || cardsChanged;

    if (fileIdentitiesChanged) {
        await deps.fileIdentityStore.save();
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
            extractSharedSettingsWithMetadata(deps.settings, deps.sharedSettingsUpdatedAtByField),
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

    if (dailyStateReplayStats.seen > 0) {
        logDailyStateDebug(deps, "replay-summary", {
            seen: dailyStateReplayStats.seen,
            applied: dailyStateReplayStats.applied,
            skippedInvalid: dailyStateReplayStats.skippedInvalid,
            skippedAlreadyApplied: dailyStateReplayStats.skippedAlreadyApplied,
            skippedStaleDate: dailyStateReplayStats.skippedStaleDate,
            skippedUnsupportedOp: dailyStateReplayStats.skippedUnsupportedOp,
            affectedDeckLineages: Array.from(dailyStateReplayStats.affectedDeckLineages).sort(),
        });
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

    deps.collectReplayReceipt?.(replayReceipt);
    return replaySummary;
}
