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
import { DataStore, type TrackedCardSnapshot, type TrackedCardsFileSnapshot } from "./data";
import { cloneFolderTrackingRule } from "src/folderTracking";
import {
    NoteReviewStore,
    type NoteReviewEntrySnapshot,
    type NoteReviewSource,
} from "./noteReviewStore";
import { RepetitionItem } from "./repetitionItem";
import { ReviewCommitStore, type ReviewCommitLog } from "./reviewCommitStore";
import type { SyroSessionRecord } from "./syroSessionManager";
import type { SRSettings } from "src/settings";
import type { FolderTrackingRule } from "src/folderTracking";
import { getArrayProp, getStringProp, isRecord } from "src/util/typeGuards";
import { compareIsoTime } from "./syroSyncMeta";

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
    const trackedFileTags = getArrayProp(payload, "trackedFileTags").filter(
        (tag): tag is string => typeof tag === "string",
    );

    if (!path || !trackedFileUuid || !isRecord(payload["item"])) {
        return null;
    }

    return {
        path,
        trackedFileUuid,
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
): Promise<void> {
    const sharedSettingsFields = new Set<string>(SHARED_SETTINGS_FIELDS as readonly string[]);
    let deckOptionsChanged = false;
    let sharedSettingsChanged = false;
    let trackingRulesChanged = false;
    let dailyStateChanged = false;
    let dailyStateMetadataChanged = false;
    let notesChanged = false;
    let timelineChanged = false;
    let cardsChanged = false;

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
                break;
            }

            case "notes": {
                const snapshot = parseNoteSnapshotPayload(record.payload);
                if (!snapshot) {
                    continue;
                }

                const targetUuid = snapshot.item.uuid || record.targetUuid;
                if (!deps.noteReviewStore.shouldApplySyncEntity(targetUuid, record.updatedAt)) {
                    continue;
                }

                if (record.opType === "remove") {
                    deps.noteReviewStore.removeByUuid(snapshot.item.uuid, snapshot.path);
                } else {
                    deps.noteReviewStore.upsertSnapshot(snapshot);
                }
                deps.noteReviewStore.markSyncEntity({
                    targetUuid,
                    updatedAt: record.updatedAt,
                    deleted: record.opType === "remove",
                    entityType: "note-review",
                    pathHint: snapshot.path,
                });
                notesChanged = true;
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
                }
                break;
            }

            case "cards": {
                if (record.entityType === "card-item") {
                    const snapshot = parseCardSnapshotPayload(record.payload);
                    if (!snapshot) {
                        continue;
                    }

                    const cardTargetUuid = buildCardTargetUuid(snapshot.item.uuid);
                    if (!deps.store.shouldApplySyncEntity(cardTargetUuid, record.updatedAt)) {
                        continue;
                    }

                    if (record.opType === "remove") {
                        deps.store.removeCardByUuid(snapshot.item.uuid, snapshot.path);
                    } else {
                        const fileTargetUuid = buildTrackedFileTargetUuid(snapshot.trackedFileUuid);
                        const fileMergeState = deps.store.getSyncEntities()[fileTargetUuid];
                        if (fileMergeState && fileMergeState.updatedAt > record.updatedAt) {
                            const currentFileId = deps.store.findFileIdByUuid(snapshot.trackedFileUuid);
                            const currentFile = currentFileId
                                ? deps.store.getFileByID(currentFileId)
                                : null;
                            if (currentFile) {
                                snapshot.path = currentFile.path;
                                snapshot.trackedFileTags = [...(currentFile.tags ?? [])];
                            }
                        }

                        deps.store.upsertCardSnapshot(snapshot);
                    }
                    deps.store.markSyncEntity({
                        targetUuid: cardTargetUuid,
                        updatedAt: record.updatedAt,
                        deleted: record.opType === "remove",
                        entityType: "card-item",
                        pathHint: snapshot.path,
                    });

                    cardsChanged = true;
                    break;
                }

                const snapshot = parseTrackedFilePayload(record.payload);
                if (!snapshot) {
                    continue;
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
                        deps.store.markSyncEntity({
                            targetUuid: buildCardTargetUuid(relatedItem.uuid),
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
                        deps.store.markSyncEntity({
                            targetUuid: buildCardTargetUuid(relatedItem.uuid),
                            updatedAt: record.updatedAt,
                            deleted: false,
                            entityType: "card-item",
                            pathHint: snapshot.path,
                        });
                    }
                }

                cardsChanged = true;
                break;
            }
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
                },
                deps.dailyStateAppliedOpIds,
            ),
        );
    }
}
