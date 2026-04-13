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
        cardsOverlayPath: "syro/devices/Desktop--d84f/cards.review_overlay.json",
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

        await replaySyroSessionRecords(
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

        await replaySyroSessionRecords(
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
            deps,
        );

        const fileId = targetStore.findFileIdByUuid(fileSnapshot.uuid);
        expect(fileId).not.toBe("");
        expect(targetStore.getFileByID(fileId)?.path).toBe("cards/new.md");
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
            deps,
        );

        expect(targetStore.findFileIdByUuid(fileSnapshot.uuid)).toBe("");
        expect(targetStore.findItemByUuid(cardSnapshot.item.uuid)?.isTracked).toBe(false);
    });
});
