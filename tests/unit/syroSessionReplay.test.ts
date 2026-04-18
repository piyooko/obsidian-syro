import {
    createDeckOptionsStoreSnapshot,
    DeckOptionsStore,
} from "src/dataStore/deckOptionsStore";
import { Iadapter } from "src/dataStore/adapter";
import { DataStore } from "src/dataStore/data";
import { DEFAULT_FOLDER_TRACKING_RULE, type FolderTrackingRule } from "src/folderTracking";
import { NoteReviewStore } from "src/dataStore/noteReviewStore";
import { Queue } from "src/dataStore/queue";
import { RepetitionItem, RPITEMTYPE } from "src/dataStore/repetitionItem";
import { ReviewCommitStore } from "src/dataStore/reviewCommitStore";
import { replaySyroSessionRecords } from "src/dataStore/syroSessionReplay";
import {
    createDefaultDailyState,
    createDefaultTrackingRulesState,
    parseDailyState,
    parseSharedSettingsState,
    parseTrackingRulesState,
    SyroJsonStateStore,
} from "src/dataStore/syroPluginDataStore";
import { CardType } from "src/Question";
import { DEFAULT_SETTINGS } from "src/settings";
import { TrackedItem } from "src/dataStore/trackedFile";

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/g, "");
}

function createMockAdapter() {
    const files = new Map<string, string>();
    const timestamps = new Map<string, number>();
    const directories = new Set<string>(["syro", "syro/devices", "syro/devices/Desktop--d84f"]);

    const ensureParentDirectories = (path: string): void => {
        const parts = normalizePath(path)
            .split("/")
            .filter((part) => part.length > 0);
        let current = "";
        for (let index = 0; index < Math.max(0, parts.length - 1); index++) {
            current = current ? `${current}/${parts[index]}` : parts[index];
            directories.add(current);
        }
    };

    const adapter = {
        exists: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            return files.has(normalized) || directories.has(normalized);
        }),
        read: jest.fn(async (path: string) => files.get(normalizePath(path)) ?? ""),
        write: jest.fn(async (path: string, value: string) => {
            const normalized = normalizePath(path);
            ensureParentDirectories(normalized);
            files.set(normalized, value);
            timestamps.set(normalized, Date.now());
        }),
        append: jest.fn(async (path: string, value: string) => {
            const normalized = normalizePath(path);
            ensureParentDirectories(normalized);
            files.set(normalized, `${files.get(normalized) ?? ""}${value}`);
            timestamps.set(normalized, Date.now());
        }),
        remove: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            files.delete(normalized);
            timestamps.delete(normalized);
        }),
        stat: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            return files.has(normalized)
                ? {
                      mtime: timestamps.get(normalized) ?? Date.now(),
                  }
                : null;
        }),
        mkdir: jest.fn(async (path: string) => {
            directories.add(normalizePath(path));
        }),
    };

    return { adapter, files, directories };
}

function createSettings() {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function createStoreWithAdapter(adapter: ReturnType<typeof createMockAdapter>["adapter"]): DataStore {
    (Iadapter as any)._instance = {
        adapter,
        vault: {
            getAbstractFileByPath: (): null => null,
        },
    };
    const store = new DataStore(DEFAULT_SETTINGS, {
        cardsPath: "syro/devices/Desktop--d84f/cards.json",
        pendingOverlayPath: "syro/devices/Desktop--d84f/pending.overlay.json",
        auxiliaryDataDir: "syro/devices/Desktop--d84f",
    });
    store.resetData();
    store.data.queues = Queue.create(store.data.queues as any);
    return store;
}

function createReplayDependencies(
    adapter: ReturnType<typeof createMockAdapter>["adapter"],
    settings: ReturnType<typeof createSettings>,
    store?: DataStore,
) {
    const currentStore = store ?? createStoreWithAdapter(adapter);
    const noteReviewStore = new NoteReviewStore(settings, {
        notesPath: "syro/devices/Desktop--d84f/notes.json",
    });
    const reviewCommitStore = new ReviewCommitStore(settings, {
        timelinePath: "syro/devices/Desktop--d84f/timeline.json",
    });
    const deckOptionsStore = new DeckOptionsStore({
        deckOptionsPath: "syro/devices/Desktop--d84f/deck-options.json",
    });
    const sharedSettingsStore = new SyroJsonStateStore(
        "syro/devices/Desktop--d84f/settings.json",
        parseSharedSettingsState,
    );
    const trackingRulesStore = new SyroJsonStateStore(
        "syro/devices/Desktop--d84f/tracking-rules.json",
        parseTrackingRulesState,
    );
    const dailyStateStore = new SyroJsonStateStore(
        "syro/devices/Desktop--d84f/daily-state.json",
        parseDailyState,
    );
    const data = {
        buryDate: "",
        buryList: [] as string[],
        dailyDeckStats: createDefaultDailyState().dailyDeckStats,
        folderTrackingRules: {} as Record<string, FolderTrackingRule>,
    };

    return {
        settings,
        data,
        store: currentStore,
        noteReviewStore,
        reviewCommitStore,
        deckOptionsStore,
        sharedSettingsStore,
        trackingRulesStore,
        dailyStateStore,
        sharedSettingsUpdatedAtByField: {} as Record<string, string>,
        trackingRulesUpdatedAtByFolderPath: {} as Record<string, string>,
        trackingRulesTombstones: createDefaultTrackingRulesState().tombstones,
        dailyStateAppliedOpIds: {} as Record<string, string>,
        currentDeviceReviewCount: 7,
    };
}

describe("replaySyroSessionRecords", () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date("2026-04-13T12:34:56.000Z"));
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test("replays note, timeline, and deck-options records into formal stores", async () => {
        const { adapter, files } = createMockAdapter();
        const settings = createSettings();
        const deps = createReplayDependencies(adapter, settings);

        const noteItem = new RepetitionItem(1, "", RPITEMTYPE.NOTE, "default", {
            currentInterval: 1,
        });
        noteItem.uuid = "note-1";
        const deckSettings = {
            ...settings,
            fsrsSettings: {
                ...settings.fsrsSettings,
                enable_fuzz: false,
            },
            deckOptionsPresets: settings.deckOptionsPresets.map(
                (preset: (typeof settings.deckOptionsPresets)[number]) => ({
                    ...preset,
                    fsrs: {
                        ...preset.fsrs,
                        enable_fuzz: false,
                    },
                }),
            ),
        };
        const deckOptionsState = createDeckOptionsStoreSnapshot(deckSettings).state;

        const summary = await replaySyroSessionRecords(
            [
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-note",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "notes",
                    entityType: "note-review",
                    opType: "review",
                    targetUuid: "note-1",
                    createdAt: "2026-04-13T12:00:00.000Z",
                    updatedAt: "2026-04-13T12:00:00.000Z",
                    payload: {
                        path: "notes/A.md",
                        source: "manual",
                        deckName: "default",
                        item: noteItem,
                    },
                    pathHint: "notes/A.md",
                },
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-timeline",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "timeline",
                    entityType: "timeline-entry",
                    opType: "add",
                    targetUuid: "timeline-entry:commit-1",
                    createdAt: "2026-04-13T12:01:00.000Z",
                    updatedAt: "2026-04-13T12:01:00.000Z",
                    payload: {
                        notePath: "notes/A.md",
                        commit: {
                            id: "commit-1",
                            message: "hello",
                            timestamp: 1,
                        },
                    },
                    pathHint: "notes/A.md",
                },
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-deck",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "deck-options",
                    entityType: "deck-options",
                    opType: "replace",
                    targetUuid: "deck-options:global",
                    createdAt: "2026-04-13T12:02:00.000Z",
                    updatedAt: "2026-04-13T12:02:00.000Z",
                    payload: deckOptionsState,
                    pathHint: "syro/devices/Desktop--d84f/deck-options.json",
                },
            ],
            deps,
        );

        expect(summary).toEqual({
            cardsRuntimeChanged: false,
            noteReviewChanged: true,
            timelineChanged: true,
            dailyStateChanged: false,
            requiresGlobalSync: true,
        });
        expect(deps.noteReviewStore.getEntry("notes/A.md")?.item.uuid).toBe("note-1");
        expect(deps.reviewCommitStore.getCommit("notes/A.md", "commit-1")).toEqual(
            expect.objectContaining({ id: "commit-1", message: "hello" }),
        );
        expect(settings.fsrsSettings.enable_fuzz).toBe(false);
        expect(files.get("syro/devices/Desktop--d84f/notes.json")).toContain('"syncEntities"');
        expect(files.get("syro/devices/Desktop--d84f/timeline.json")).toContain(
            '"timeline-entry:commit-1"',
        );
        expect(files.get("syro/devices/Desktop--d84f/deck-options.json")).toContain(
            '"enable_fuzz": false',
        );
        expect(files.get("syro/devices/Desktop--d84f/deck-options.json")).toContain(
            '"syncEntities"',
        );
    });

    test("replays split plugin domains into settings, tracking rules, and daily state stores", async () => {
        const { adapter, files } = createMockAdapter();
        const settings = createSettings();
        const deps = createReplayDependencies(adapter, settings);

        const summary = await replaySyroSessionRecords(
            [
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-settings",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "settings",
                    entityType: "shared-settings",
                    opType: "patch",
                    targetUuid: "settings:batch:1",
                    createdAt: "2026-04-13T12:00:00.000Z",
                    updatedAt: "2026-04-13T12:00:00.000Z",
                    payload: {
                        changed: {
                            openRandomNote: true,
                            reviewButtonDelay: 700,
                        },
                    },
                    pathHint: "syro/devices/Desktop--d84f/settings.json",
                },
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-rule-upsert",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "tracking-rules",
                    entityType: "folder-tracking-rule",
                    opType: "upsert-rule",
                    targetUuid: "tracking-rule:Inbox",
                    createdAt: "2026-04-13T12:01:00.000Z",
                    updatedAt: "2026-04-13T12:01:00.000Z",
                    payload: {
                        folderPath: "Inbox",
                        rule: {
                            ...DEFAULT_FOLDER_TRACKING_RULE,
                            track: true,
                            autoTag: true,
                            tags: ["#inbox"],
                        },
                    },
                    pathHint: "syro/devices/Desktop--d84f/tracking-rules.json",
                },
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-bury-add",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "daily-state",
                    entityType: "daily-state-op",
                    opType: "bury-add",
                    targetUuid: "daily-op:1",
                    createdAt: "2026-04-13T12:02:00.000Z",
                    updatedAt: "2026-04-13T12:02:00.000Z",
                    payload: {
                        date: "2026-04-13",
                        entries: ["note-a"],
                    },
                    pathHint: "syro/devices/Desktop--d84f/daily-state.json",
                },
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-delta",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "daily-state",
                    entityType: "daily-state-op",
                    opType: "deck-stats-delta",
                    targetUuid: "daily-op:2",
                    createdAt: "2026-04-13T12:03:00.000Z",
                    updatedAt: "2026-04-13T12:03:00.000Z",
                    payload: {
                        date: "2026-04-13",
                        deckName: "default",
                        newDelta: 1,
                        reviewDelta: 2,
                    },
                    pathHint: "syro/devices/Desktop--d84f/daily-state.json",
                },
            ],
            deps,
        );

        expect(summary).toEqual({
            cardsRuntimeChanged: false,
            noteReviewChanged: false,
            timelineChanged: false,
            dailyStateChanged: true,
            requiresGlobalSync: true,
        });
        expect(settings.openRandomNote).toBe(true);
        expect(settings.reviewButtonDelay).toBe(700);
        expect(deps.data.folderTrackingRules.Inbox).toEqual(
            expect.objectContaining({
                track: true,
                autoTag: true,
                tags: ["#inbox"],
            }),
        );
        expect(deps.data.buryDate).toBe("2026-04-13");
        expect(deps.data.buryList).toEqual(["note-a"]);
        expect(deps.data.dailyDeckStats.counts.default).toEqual({
            new: 1,
            review: 2,
        });

        expect(files.get("syro/devices/Desktop--d84f/settings.json")).toContain(
            '"openRandomNote": true',
        );
        expect(files.get("syro/devices/Desktop--d84f/settings.json")).toContain(
            '"updatedAtByField"',
        );
        expect(files.get("syro/devices/Desktop--d84f/tracking-rules.json")).toContain('"Inbox"');
        expect(files.get("syro/devices/Desktop--d84f/tracking-rules.json")).toContain(
            '"updatedAt"',
        );
        expect(files.get("syro/devices/Desktop--d84f/daily-state.json")).toContain('"note-a"');
        expect(files.get("syro/devices/Desktop--d84f/daily-state.json")).toContain(
            '"appliedOpIds"',
        );
        expect(files.get("syro/devices/Desktop--d84f/daily-state.json")).toContain(
            '"deviceReviewCount": 7',
        );
    });

    test("merges remote daily-state deck deltas incrementally on top of local counts", async () => {
        const { adapter } = createMockAdapter();
        const settings = createSettings();
        const deps = createReplayDependencies(adapter, settings);
        deps.data.dailyDeckStats = {
            date: "2026-04-13",
            counts: {
                default: {
                    new: 3,
                    review: 0,
                },
            },
        };

        const summary = await replaySyroSessionRecords(
            [
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-delta-incremental",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "daily-state",
                    entityType: "daily-state-op",
                    opType: "deck-stats-delta",
                    targetUuid: "daily-op:incremental",
                    createdAt: "2026-04-13T12:05:00.000Z",
                    updatedAt: "2026-04-13T12:05:00.000Z",
                    payload: {
                        date: "2026-04-13",
                        deckName: "default",
                        newDelta: 2,
                        reviewDelta: 0,
                    },
                    pathHint: "syro/devices/Desktop--d84f/daily-state.json",
                },
            ],
            deps,
        );

        expect(summary.dailyStateChanged).toBe(true);
        expect(deps.data.dailyDeckStats.counts.default).toEqual({
            new: 5,
            review: 0,
        });
    });

    test("same-day remote rollover-reset does not wipe already accumulated local deck counts", async () => {
        const { adapter } = createMockAdapter();
        const settings = createSettings();
        const deps = createReplayDependencies(adapter, settings);
        deps.data.buryDate = "2026-04-13";
        deps.data.dailyDeckStats = {
            date: "2026-04-13",
            counts: {
                default: {
                    new: 3,
                    review: 0,
                },
            },
        };

        const summary = await replaySyroSessionRecords(
            [
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-same-day-reset",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "daily-state",
                    entityType: "daily-state-op",
                    opType: "rollover-reset",
                    targetUuid: "daily-op:remote:0:rollover-reset",
                    createdAt: "2026-04-13T12:05:00.000Z",
                    updatedAt: "2026-04-13T12:05:00.000Z",
                    payload: {
                        date: "2026-04-13",
                    },
                    pathHint: "syro/devices/Desktop--d84f/daily-state.json",
                },
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-same-day-delta",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "daily-state",
                    entityType: "daily-state-op",
                    opType: "deck-stats-delta",
                    targetUuid: "daily-op:remote:1:deck-stats-delta",
                    createdAt: "2026-04-13T12:05:01.000Z",
                    updatedAt: "2026-04-13T12:05:01.000Z",
                    payload: {
                        date: "2026-04-13",
                        deckName: "default",
                        newDelta: 2,
                        reviewDelta: 0,
                    },
                    pathHint: "syro/devices/Desktop--d84f/daily-state.json",
                },
            ],
            deps,
        );

        expect(summary.dailyStateChanged).toBe(true);
        expect(deps.data.dailyDeckStats.counts.default).toEqual({
            new: 5,
            review: 0,
        });
    });

    test("returns a runtime-only replay summary for pure card review session deltas", async () => {
        const { adapter } = createMockAdapter();
        const settings = createSettings();
        const sourceStore = createStoreWithAdapter(adapter);
        sourceStore.trackFile("cards/runtime.md", RPITEMTYPE.CARD, false);
        const trackedFile = sourceStore.getTrackedFile("cards/runtime.md");
        const trackedItem = new TrackedItem(
            "hash-runtime",
            0,
            "context",
            CardType.SingleLineBasic,
            {
                startOffset: 0,
                endOffset: 1,
                blockStartOffset: 0,
                blockEndOffset: 1,
            },
            "c1",
        );
        trackedFile.trackedItems.push(trackedItem);
        sourceStore.updateCardItems(trackedFile, trackedItem, "#flashcards", false);
        const cardSnapshot = sourceStore.getCardSnapshot(trackedItem.reviewId);
        const fileSnapshot = sourceStore.getTrackedFileSnapshot("cards/runtime.md");
        if (!cardSnapshot) {
            throw new Error("Expected card snapshot");
        }
        if (!fileSnapshot) {
            throw new Error("Expected file snapshot");
        }

        const targetStore = createStoreWithAdapter(adapter);
        targetStore.renameTrackedFileFromSnapshot(fileSnapshot);
        const deps = createReplayDependencies(adapter, settings, targetStore);

        const summary = await replaySyroSessionRecords(
            [
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-card-runtime",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "cards",
                    entityType: "card-item",
                    opType: "review",
                    targetUuid: cardSnapshot.item.uuid,
                    createdAt: "2026-04-13T12:00:00.000Z",
                    updatedAt: "2026-04-13T12:00:00.000Z",
                    payload: cardSnapshot,
                    pathHint: "cards/runtime.md",
                },
            ],
            deps,
        );

        expect(summary).toEqual({
            cardsRuntimeChanged: true,
            noteReviewChanged: false,
            timelineChanged: false,
            dailyStateChanged: false,
            requiresGlobalSync: false,
        });
    });

    test("keeps the renamed tracked file path when an older card upsert arrives later", async () => {
        const { adapter } = createMockAdapter();
        const settings = createSettings();
        const sourceStore = createStoreWithAdapter(adapter);
        sourceStore.trackFile("cards/old.md", RPITEMTYPE.CARD, false);
        const trackedFile = sourceStore.getTrackedFile("cards/old.md");
        const trackedItem = new TrackedItem(
            "hash-1",
            0,
            "context",
            CardType.SingleLineBasic,
            {
                startOffset: 0,
                endOffset: 1,
                blockStartOffset: 0,
                blockEndOffset: 1,
            },
            "c1",
        );
        trackedFile.trackedItems.push(trackedItem);
        sourceStore.updateCardItems(trackedFile, trackedItem, "#flashcards", false);
        const cardSnapshot = sourceStore.getCardSnapshot(trackedItem.reviewId);
        const fileSnapshot = sourceStore.getTrackedFileSnapshot("cards/old.md");
        if (!cardSnapshot || !fileSnapshot) {
            throw new Error("Expected source snapshots");
        }
        fileSnapshot.path = "cards/new.md";

        const targetStore = createStoreWithAdapter(adapter);
        const deps = createReplayDependencies(adapter, settings, targetStore);

        await replaySyroSessionRecords(
            [
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-rename",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "cards",
                    entityType: "tracked-file",
                    opType: "rename-file",
                    targetUuid: fileSnapshot.uuid,
                    createdAt: "2026-04-13T12:01:00.000Z",
                    updatedAt: "2026-04-13T12:01:00.000Z",
                    payload: fileSnapshot,
                    pathHint: "cards/new.md",
                },
                {
                    version: 1,
                    sessionId: "2026-04-13T11-00-00__91ac__0001",
                    opId: "op-card",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "cards",
                    entityType: "card-item",
                    opType: "review",
                    targetUuid: cardSnapshot.item.uuid,
                    createdAt: "2026-04-13T11:00:00.000Z",
                    updatedAt: "2026-04-13T11:00:00.000Z",
                    payload: cardSnapshot,
                    pathHint: "cards/old.md",
                },
            ],
            deps as any,
        );

        const fileId = targetStore.findFileIdByUuid(fileSnapshot.uuid);
        expect(fileId).not.toBe("");
        expect(targetStore.getFileByID(fileId)?.path).toBe("cards/new.md");
    });

    test("accepts a semantically newer card review even when its updatedAt is older", async () => {
        const { adapter } = createMockAdapter();
        const settings = createSettings();
        const targetStore = createStoreWithAdapter(adapter);
        targetStore.trackFile("cards/skew.md", RPITEMTYPE.CARD, false);
        const trackedFile = targetStore.getTrackedFile("cards/skew.md");
        const trackedItem = new TrackedItem(
            "hash-skew",
            0,
            "context",
            CardType.SingleLineBasic,
            {
                startOffset: 0,
                endOffset: 1,
                blockStartOffset: 0,
                blockEndOffset: 1,
            },
            "c1",
        );
        trackedFile.trackedItems.push(trackedItem);
        targetStore.updateCardItems(trackedFile, trackedItem, "#flashcards", false);
        const localItem = targetStore.getItembyID(trackedItem.reviewId);
        if (!localItem) {
            throw new Error("Expected local item");
        }
        targetStore.reviewId(localItem.ID, 2, settings.fsrsSettings);
        const localSnapshot = targetStore.getCardSnapshot(localItem.ID);
        if (!localSnapshot) {
            throw new Error("Expected local card snapshot");
        }

        targetStore.markSyncEntity({
            targetUuid: localSnapshot.item.uuid,
            updatedAt: "2026-04-13T12:34:56.000Z",
            deleted: false,
            entityType: "card-item",
            pathHint: "cards/skew.md",
        });

        const remoteSnapshot = JSON.parse(JSON.stringify(localSnapshot));
        remoteSnapshot.item.timesReviewed = 2;
        remoteSnapshot.item.timesCorrect = 2;
        remoteSnapshot.item.nextReview = Date.parse("2026-04-15T12:00:00.000Z");
        remoteSnapshot.item.data = {
            ...remoteSnapshot.item.data,
            due: "2026-04-15T12:00:00.000Z",
            last_review: "2026-04-13T12:00:00.000Z",
            reps: 2,
            learning_steps: 0,
            scheduled_days: 2,
            state: 2,
        };

        const deps = createReplayDependencies(adapter, settings, targetStore);
        const summary = await replaySyroSessionRecords(
            [
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-card-skew",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "cards",
                    entityType: "card-item",
                    opType: "review",
                    targetUuid: remoteSnapshot.item.uuid,
                    createdAt: "2026-04-13T12:00:00.000Z",
                    updatedAt: "2026-04-13T12:00:00.000Z",
                    payload: remoteSnapshot,
                    pathHint: "cards/skew.md",
                },
            ],
            deps,
        );

        expect(summary.cardsRuntimeChanged).toBe(true);
        const replayedItem = targetStore.findItemByUuid(remoteSnapshot.item.uuid);
        expect(replayedItem?.timesReviewed).toBe(2);
        expect(replayedItem?.timesCorrect).toBe(2);
        expect(replayedItem?.nextReview).toBe(Date.parse("2026-04-15T12:00:00.000Z"));
    });

    test("delete-file tombstones block older card upserts from resurrecting removed cards", async () => {
        const { adapter } = createMockAdapter();
        const settings = createSettings();
        const sourceStore = createStoreWithAdapter(adapter);
        sourceStore.trackFile("cards/ghost.md", RPITEMTYPE.CARD, false);
        const trackedFile = sourceStore.getTrackedFile("cards/ghost.md");
        const trackedItem = new TrackedItem(
            "hash-2",
            0,
            "context",
            CardType.SingleLineBasic,
            {
                startOffset: 0,
                endOffset: 1,
                blockStartOffset: 0,
                blockEndOffset: 1,
            },
            "c1",
        );
        trackedFile.trackedItems.push(trackedItem);
        sourceStore.updateCardItems(trackedFile, trackedItem, "#flashcards", false);
        const cardSnapshot = sourceStore.getCardSnapshot(trackedItem.reviewId);
        const fileSnapshot = sourceStore.getTrackedFileSnapshot("cards/ghost.md");
        if (!cardSnapshot || !fileSnapshot) {
            throw new Error("Expected source snapshots");
        }

        const targetStore = createStoreWithAdapter(adapter);
        const deps = createReplayDependencies(adapter, settings, targetStore);

        await replaySyroSessionRecords(
            [
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-delete-file",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "cards",
                    entityType: "tracked-file",
                    opType: "delete-file",
                    targetUuid: fileSnapshot.uuid,
                    createdAt: "2026-04-13T12:02:00.000Z",
                    updatedAt: "2026-04-13T12:02:00.000Z",
                    payload: fileSnapshot,
                    pathHint: "cards/ghost.md",
                },
                {
                    version: 1,
                    sessionId: "2026-04-13T11-00-00__91ac__0001",
                    opId: "op-card-old",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "cards",
                    entityType: "card-item",
                    opType: "review",
                    targetUuid: cardSnapshot.item.uuid,
                    createdAt: "2026-04-13T11:00:00.000Z",
                    updatedAt: "2026-04-13T11:00:00.000Z",
                    payload: cardSnapshot,
                    pathHint: "cards/ghost.md",
                },
            ],
            deps as any,
        );

        expect(targetStore.findFileIdByUuid(fileSnapshot.uuid)).toBe("");
        expect(targetStore.findItemByUuid(cardSnapshot.item.uuid)).toBeNull();
    });

    test("absorbs uuid alias batch into local store without re-emitting the same group", async () => {
        const { adapter, files } = createMockAdapter();
        const settings = createSettings();
        const targetStore = createStoreWithAdapter(adapter);
        targetStore.trackFile("cards/alias.md", RPITEMTYPE.CARD, false);
        const trackedFile = targetStore.getTrackedFile("cards/alias.md");
        const trackedItem = new TrackedItem(
            "hash-alias",
            0,
            "context",
            CardType.SingleLineBasic,
            {
                startOffset: 0,
                endOffset: 1,
                blockStartOffset: 0,
                blockEndOffset: 1,
            },
            "c1",
        );
        trackedFile.trackedItems.push(trackedItem);
        targetStore.updateCardItems(trackedFile, trackedItem, "#flashcards", false);
        const cardSnapshot = targetStore.getCardSnapshot(trackedItem.reviewId);
        const fileSnapshot = targetStore.getTrackedFileSnapshot("cards/alias.md");
        if (!cardSnapshot || !fileSnapshot) {
            throw new Error("Expected local snapshots");
        }

        const deps = createReplayDependencies(adapter, settings, targetStore) as ReturnType<
            typeof createReplayDependencies
        > & {
            collectAliasGroups?: (domain: "cards" | "notes", groups: unknown[]) => void;
        };
        const collectAliasGroups = jest.fn();
        deps.collectAliasGroups = collectAliasGroups;

        const summary = await replaySyroSessionRecords(
            [
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-alias-batch",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "cards",
                    entityType: "uuid-alias-batch",
                    opType: "merge-aliases",
                    targetUuid: "uuid-alias-batch:cards:1",
                    createdAt: "2026-04-13T12:00:00.000Z",
                    updatedAt: "2026-04-13T12:00:00.000Z",
                    payload: {
                        groups: [
                            {
                                entityType: "tracked-file",
                                equivalentUuids: [fileSnapshot.uuid, "tf-remote"],
                                pathHint: "cards/alias.md",
                                emitterPrimaryUuid: "tf-remote",
                                evidence: {
                                    sourceDeviceId: "91ac",
                                    sourcePath: "cards/alias.md",
                                    matchedBy: "snapshot-reconcile",
                                },
                            },
                            {
                                entityType: "card-item",
                                equivalentUuids: [cardSnapshot.item.uuid, "i-remote"],
                                pathHint: "cards/alias.md",
                                emitterPrimaryUuid: "i-remote",
                                evidence: {
                                    sourceDeviceId: "91ac",
                                    sourcePath: "cards/alias.md",
                                    matchedBy: "tracked-file-match",
                                    lineNo: 0,
                                    clozeId: "c1",
                                    fingerprintUnique: true,
                                },
                            },
                        ],
                    },
                    pathHint: "cards/alias.md",
                },
            ],
            deps,
        );

        expect(summary).toEqual({
            cardsRuntimeChanged: false,
            noteReviewChanged: false,
            timelineChanged: false,
            dailyStateChanged: false,
            requiresGlobalSync: false,
        });
        expect(targetStore.getTrackedFile("cards/alias.md")?.aliases).toContain("tf-remote");
        expect(targetStore.findItemByUuid(cardSnapshot.item.uuid)?.aliases).toContain("i-remote");
        expect(collectAliasGroups).not.toHaveBeenCalled();
        expect(files.get("syro/devices/Desktop--d84f/cards.json")).toContain('"tf-remote"');
        expect(files.get("syro/devices/Desktop--d84f/cards.json")).toContain('"i-remote"');
    });

    test("preloads tracked-file alias batches before card replay and avoids ghost files", async () => {
        const { adapter } = createMockAdapter();
        const settings = createSettings();
        const targetStore = createStoreWithAdapter(adapter);
        targetStore.trackFile("cards/deferred.md", RPITEMTYPE.CARD, false);
        const localFile = targetStore.getTrackedFile("cards/deferred.md");
        const localTrackedItem = new TrackedItem(
            "hash-deferred",
            0,
            "context",
            CardType.SingleLineBasic,
            {
                startOffset: 0,
                endOffset: 1,
                blockStartOffset: 0,
                blockEndOffset: 1,
            },
            "c1",
        );
        localFile.trackedItems.push(localTrackedItem);
        targetStore.updateCardItems(localFile, localTrackedItem, "#flashcards", false);
        const localCardSnapshot = targetStore.getCardSnapshot(localTrackedItem.reviewId);
        const localFileSnapshot = targetStore.getTrackedFileSnapshot("cards/deferred.md");
        if (!localCardSnapshot || !localFileSnapshot) {
            throw new Error("Expected local snapshots");
        }

        const remoteCardSnapshot = JSON.parse(JSON.stringify(localCardSnapshot));
        remoteCardSnapshot.trackedFileUuid = "tf-remote-deferred";
        remoteCardSnapshot.trackedFileAliases = [];
        remoteCardSnapshot.item.uuid = "i-remote-deferred";
        remoteCardSnapshot.item.aliases = [];

        const deps = createReplayDependencies(adapter, settings, targetStore);
        await replaySyroSessionRecords(
            [
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-card-deferred",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "cards",
                    entityType: "card-item",
                    opType: "review",
                    targetUuid: "i-remote-deferred",
                    createdAt: "2026-04-13T12:00:00.000Z",
                    updatedAt: "2026-04-13T12:00:00.000Z",
                    payload: remoteCardSnapshot,
                    pathHint: "cards/deferred.md",
                },
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-file-alias",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "cards",
                    entityType: "uuid-alias-batch",
                    opType: "merge-aliases",
                    targetUuid: "uuid-alias-batch:cards:2",
                    createdAt: "2026-04-13T12:00:01.000Z",
                    updatedAt: "2026-04-13T12:00:01.000Z",
                    payload: {
                        groups: [
                            {
                                entityType: "tracked-file",
                                equivalentUuids: [localFileSnapshot.uuid, "tf-remote-deferred"],
                                pathHint: "cards/deferred.md",
                                emitterPrimaryUuid: "tf-remote-deferred",
                                evidence: {
                                    sourceDeviceId: "91ac",
                                    sourcePath: "cards/deferred.md",
                                    matchedBy: "snapshot-reconcile",
                                },
                            },
                        ],
                    },
                    pathHint: "cards/deferred.md",
                },
            ],
            deps,
        );

        expect(Object.keys((targetStore as any).data.trackedFiles)).toHaveLength(1);
        expect(targetStore.getTrackedFile("cards/deferred.md")?.aliases).toContain(
            "tf-remote-deferred",
        );
        expect(targetStore.findItemByUuid(localCardSnapshot.item.uuid)?.aliases).toContain(
            "i-remote-deferred",
        );
    });

    test("negative cache prevents repeated remote snapshot fetches for the same ghost uuid", async () => {
        const { adapter } = createMockAdapter();
        const settings = createSettings();
        const sourceStore = createStoreWithAdapter(adapter);
        sourceStore.trackFile("cards/ghost-remote.md", RPITEMTYPE.CARD, false);
        const trackedFile = sourceStore.getTrackedFile("cards/ghost-remote.md");
        const trackedItem = new TrackedItem(
            "hash-ghost",
            0,
            "context",
            CardType.SingleLineBasic,
            {
                startOffset: 0,
                endOffset: 1,
                blockStartOffset: 0,
                blockEndOffset: 1,
            },
            "c1",
        );
        trackedFile.trackedItems.push(trackedItem);
        sourceStore.updateCardItems(trackedFile, trackedItem, "#flashcards", false);
        const cardSnapshot = sourceStore.getCardSnapshot(trackedItem.reviewId);
        if (!cardSnapshot) {
            throw new Error("Expected card snapshot");
        }

        const deps = createReplayDependencies(adapter, settings, createStoreWithAdapter(adapter)) as
            ReturnType<typeof createReplayDependencies> & {
                loadRemoteCardsSnapshots?: (deviceId: string) => Promise<{
                    files: unknown[];
                    cards: unknown[];
                }>;
            };
        const loadRemoteCardsSnapshots = jest.fn(async () => ({ files: [], cards: [] }));
        deps.loadRemoteCardsSnapshots = loadRemoteCardsSnapshots;

        await replaySyroSessionRecords(
            [
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-ghost-1",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "cards",
                    entityType: "card-item",
                    opType: "review",
                    targetUuid: "ghost-card-uuid",
                    createdAt: "2026-04-13T12:00:00.000Z",
                    updatedAt: "2026-04-13T12:00:00.000Z",
                    payload: cardSnapshot,
                    pathHint: "cards/ghost-remote.md",
                },
                {
                    version: 1,
                    sessionId: "2026-04-13T12-00-00__91ac__0001",
                    opId: "op-ghost-2",
                    deviceId: "91ac",
                    deviceName: "Mobile",
                    domain: "cards",
                    entityType: "card-item",
                    opType: "review",
                    targetUuid: "ghost-card-uuid",
                    createdAt: "2026-04-13T12:00:01.000Z",
                    updatedAt: "2026-04-13T12:00:01.000Z",
                    payload: cardSnapshot,
                    pathHint: "cards/ghost-remote.md",
                },
            ],
            deps as any,
        );

        expect(loadRemoteCardsSnapshots).toHaveBeenCalledTimes(1);
    });

    test("persists tracked-file and card aliases across save and load", async () => {
        const { adapter } = createMockAdapter();
        const store = createStoreWithAdapter(adapter);
        store.trackFile("cards/persist-alias.md", RPITEMTYPE.CARD, false);
        const trackedFile = store.getTrackedFile("cards/persist-alias.md");
        const trackedItem = new TrackedItem(
            "hash-persist",
            0,
            "context",
            CardType.SingleLineBasic,
            {
                startOffset: 0,
                endOffset: 1,
                blockStartOffset: 0,
                blockEndOffset: 1,
            },
            "c1",
        );
        trackedFile.trackedItems.push(trackedItem);
        store.updateCardItems(trackedFile, trackedItem, "#flashcards", false);
        trackedFile.aliases = ["tf-persist-remote"];
        const item = store.getItembyID(trackedItem.reviewId);
        if (!item) {
            throw new Error("Expected local item");
        }
        item.aliases = ["i-persist-remote"];

        await store.save();

        const reloadedStore = new DataStore(DEFAULT_SETTINGS, {
            cardsPath: "syro/devices/Desktop--d84f/cards.json",
            pendingOverlayPath: "syro/devices/Desktop--d84f/pending.overlay.json",
            auxiliaryDataDir: "syro/devices/Desktop--d84f",
        });
        await reloadedStore.load();

        expect(reloadedStore.getTrackedFile("cards/persist-alias.md")?.aliases).toEqual([
            "tf-persist-remote",
        ]);
        expect(reloadedStore.findItemByUuid(item.uuid)?.aliases).toEqual(["i-persist-remote"]);
    });
});
