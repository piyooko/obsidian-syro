import {
    createDeckOptionsStoreSnapshot,
    DeckOptionsStore,
} from "src/dataStore/deckOptionsStore";
import { Iadapter } from "src/dataStore/adapter";
import { DataStore } from "src/dataStore/data";
import { NoteReviewStore } from "src/dataStore/noteReviewStore";
import { Queue } from "src/dataStore/queue";
import { RepetitionItem, RPITEMTYPE } from "src/dataStore/repetitionItem";
import { ReviewCommitStore } from "src/dataStore/reviewCommitStore";
import { SyroMergeStateStore } from "src/dataStore/syroMergeState";
import { replaySyroSessionRecords } from "src/dataStore/syroSessionReplay";
import { CardType } from "src/Question";
import { DEFAULT_SETTINGS } from "src/settings";
import { TrackedItem } from "src/dataStore/trackedFile";

function createMockAdapter() {
    const files = new Map<string, string>();
    const timestamps = new Map<string, number>();
    const adapter = {
        exists: jest.fn(async (path: string) => files.has(path)),
        read: jest.fn(async (path: string) => files.get(path) ?? ""),
        write: jest.fn(async (path: string, value: string) => {
            files.set(path, value);
            timestamps.set(path, Date.now());
        }),
        append: jest.fn(async (path: string, value: string) => {
            files.set(path, `${files.get(path) ?? ""}${value}`);
            timestamps.set(path, Date.now());
        }),
        remove: jest.fn(async (path: string) => {
            files.delete(path);
            timestamps.delete(path);
        }),
        stat: jest.fn(async (path: string) =>
            files.has(path)
                ? {
                      mtime: timestamps.get(path) ?? Date.now(),
                  }
                : null,
        ),
    };

    return { adapter, files };
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
        cardsOverlayPath: "local-state/Desktop--d84f/cards.review_overlay.json",
        auxiliaryDataDir: "local-state/Desktop--d84f",
    });
    store.resetData();
    store.data.queues = Queue.create(store.data.queues as any);
    return store;
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
        const store = createStoreWithAdapter(adapter);
        const noteReviewStore = new NoteReviewStore(settings, {
            notesPath: "syro/devices/Desktop--d84f/notes.json",
        });
        const reviewCommitStore = new ReviewCommitStore(settings, {
            timelinePath: "syro/devices/Desktop--d84f/timeline.json",
        });
        const deckOptionsStore = new DeckOptionsStore({
            deckOptionsPath: "syro/devices/Desktop--d84f/deck-options.json",
        });
        const mergeState = new SyroMergeStateStore("local-state/Desktop--d84f/sync-merge-state.json");
        await mergeState.load();

        const noteItem = new RepetitionItem(1, "", RPITEMTYPE.NOTE, "default", { currentInterval: 1 });
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
        const deckOptionsState = createDeckOptionsStoreSnapshot({
            ...deckSettings,
        }).state;

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
            {
                settings,
                store,
                noteReviewStore,
                reviewCommitStore,
                deckOptionsStore,
                mergeState,
            },
        );

        expect(noteReviewStore.getEntry("notes/A.md")?.item.uuid).toBe("note-1");
        expect(reviewCommitStore.getCommit("notes/A.md", "commit-1")).toEqual(
            expect.objectContaining({ id: "commit-1", message: "hello" }),
        );
        expect(settings.fsrsSettings.enable_fuzz).toBe(false);
        expect(files.get("local-state/Desktop--d84f/sync-merge-state.json")).toContain("note-1");
        expect(files.get("syro/devices/Desktop--d84f/deck-options.json")).toContain('"enable_fuzz": false');
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
        const noteReviewStore = new NoteReviewStore(settings, {
            notesPath: "syro/devices/Desktop--d84f/notes.json",
        });
        const reviewCommitStore = new ReviewCommitStore(settings, {
            timelinePath: "syro/devices/Desktop--d84f/timeline.json",
        });
        const deckOptionsStore = new DeckOptionsStore({
            deckOptionsPath: "syro/devices/Desktop--d84f/deck-options.json",
        });
        const mergeState = new SyroMergeStateStore("local-state/Desktop--d84f/sync-merge-state.json");
        await mergeState.load();

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
            {
                settings,
                store: targetStore,
                noteReviewStore,
                reviewCommitStore,
                deckOptionsStore,
                mergeState,
            },
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
        const noteReviewStore = new NoteReviewStore(settings, {
            notesPath: "syro/devices/Desktop--d84f/notes.json",
        });
        const reviewCommitStore = new ReviewCommitStore(settings, {
            timelinePath: "syro/devices/Desktop--d84f/timeline.json",
        });
        const deckOptionsStore = new DeckOptionsStore({
            deckOptionsPath: "syro/devices/Desktop--d84f/deck-options.json",
        });
        const mergeState = new SyroMergeStateStore("local-state/Desktop--d84f/sync-merge-state.json");
        await mergeState.load();

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
            {
                settings,
                store: targetStore,
                noteReviewStore,
                reviewCommitStore,
                deckOptionsStore,
                mergeState,
            },
        );

        expect(targetStore.findFileIdByUuid(fileSnapshot.uuid)).toBe("");
        expect(targetStore.findItemByUuid(cardSnapshot.item.uuid)?.isTracked).toBe(false);
    });
});
