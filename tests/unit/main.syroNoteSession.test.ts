import SRPlugin from "src/main";
import { DEFAULT_DECKNAME } from "src/constants";
import { ReviewResponse } from "src/scheduling";
import { DEFAULT_SETTINGS } from "src/settings";
import { autoCommitReviewResponseToTimeline } from "src/ui/timeline/reviewResponseTimeline";

jest.mock("src/ui/timeline/reviewResponseTimeline", () => ({
    autoCommitReviewResponseToTimeline: jest.fn(),
}));

describe("SRPlugin syro note and timeline session hooks", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("trackNoteFromMenu emits a track session after saving the note review entry", async () => {
        const snapshot = {
            path: "notes/Tracked.md",
            source: "manual",
            deckName: DEFAULT_DECKNAME,
            item: { uuid: "note-1" },
        };
        const plugin = {
            clearFolderTrackingExclusion: jest.fn(),
            noteAlgorithm: {},
            noteReviewStore: {
                ensureTracked: jest.fn(),
                save: jest.fn(async () => undefined),
                getEntrySnapshot: jest.fn(() => snapshot),
            },
            appendSyroNoteUpsert: jest.fn(async () => true),
            refreshNoteReview: jest.fn(async () => undefined),
        };

        await (SRPlugin.prototype.trackNoteFromMenu as unknown as Function).call(plugin, {
            path: snapshot.path,
        });

        expect(plugin.noteReviewStore.ensureTracked).toHaveBeenCalledWith(
            snapshot.path,
            DEFAULT_DECKNAME,
            "manual",
            plugin.noteAlgorithm,
        );
        expect(plugin.appendSyroNoteUpsert).toHaveBeenCalledWith(snapshot, "track");
        expect(plugin.refreshNoteReview).toHaveBeenCalledWith({ trigger: "manual" });
    });

    test("untrackNoteFromMenu emits a remove session with the removed snapshot", async () => {
        const snapshot = {
            path: "notes/Tracked.md",
            source: "manual",
            deckName: DEFAULT_DECKNAME,
            item: { uuid: "note-1" },
        };
        const plugin = {
            getResolvedFolderTrackingRule: jest.fn(() => null),
            noteReviewStore: {
                removeWithSnapshot: jest.fn(() => snapshot),
                save: jest.fn(async () => undefined),
            },
            appendSyroNoteRemove: jest.fn(async () => true),
            reviewFloatBar: {
                isDisplay: jest.fn(() => false),
            },
            data: {
                settings: {
                    autoNextNote: false,
                },
            },
            refreshNoteReview: jest.fn(async () => undefined),
        };

        await (SRPlugin.prototype.untrackNoteFromMenu as unknown as Function).call(plugin, {
            path: snapshot.path,
        });

        expect(plugin.noteReviewStore.removeWithSnapshot).toHaveBeenCalledWith(snapshot.path);
        expect(plugin.appendSyroNoteRemove).toHaveBeenCalledWith(snapshot, "remove");
        expect(plugin.refreshNoteReview).toHaveBeenCalledWith({ trigger: "manual" });
    });

    test("saveReviewResponse emits note and auto timeline sessions when review logging is enabled", async () => {
        const notePath = "notes/Review.md";
        const item = {
            uuid: "note-1",
            isNew: false,
            nextReview: 0,
            reviewUpdate: jest.fn(function (result: { nextReview: number }) {
                this.nextReview = result.nextReview;
            }),
            get interval() {
                return 3;
            },
            get ease() {
                return 1.2;
            },
        };
        const noteSnapshot = {
            path: notePath,
            source: "manual",
            deckName: DEFAULT_DECKNAME,
            item,
        };
        const timelineCommit = {
            id: "timeline-1",
            message: "",
            timestamp: 1,
            entryType: "review-response",
            reviewResponse: "Good",
            displayDuration: {
                raw: "3d",
                totalDays: 3,
            },
        };
        jest.mocked(autoCommitReviewResponseToTimeline).mockResolvedValue(timelineCommit as never);

        const plugin = {
            data: {
                settings: {
                    ...DEFAULT_SETTINGS,
                    showSchedulingDebugMessages: false,
                    burySiblingCardsByNoteReview: false,
                    timelineAutoCommitReviewSelection: true,
                },
            },
            getNoteReviewIgnoreReason: jest.fn(() => null),
            showNoteReviewIgnoreNotice: jest.fn(),
            resolveNoteReviewTracking: jest.fn(() => ({
                deckName: DEFAULT_DECKNAME,
                source: "manual",
            })),
            noteReviewStore: {
                ensureTracked: jest.fn(() => item),
                save: jest.fn(async () => undefined),
                getEntrySnapshot: jest.fn(() => noteSnapshot),
            },
            noteAlgorithm: {
                calcAllOptsIntervals: jest.fn(() => ({
                    [ReviewResponse.Good]: 3,
                })),
                srsOptions: jest.fn(() => ({
                    [ReviewResponse.Good]: { id: "good" },
                })),
                onSelection: jest.fn(() => ({
                    correct: true,
                    nextReview: 3 * 24 * 60 * 60 * 1000,
                })),
            },
            reviewCommitStore: {},
            app: {},
            currentDeviceReviewCount: 0,
            requestPluginDataSave: jest.fn(),
            appendSyroNoteUpsert: jest.fn(async () => true),
            appendSyroTimelineAdd: jest.fn(async () => true),
            postponeResponse: jest.fn(),
            syncEvents: {
                emit: jest.fn(),
            },
        };

        await (SRPlugin.prototype.saveReviewResponse as unknown as Function).call(
            plugin,
            { path: notePath },
            ReviewResponse.Good,
        );

        expect(plugin.noteReviewStore.save).toHaveBeenCalled();
        expect(plugin.currentDeviceReviewCount).toBe(1);
        expect(plugin.requestPluginDataSave).toHaveBeenCalledWith({
            domains: ["daily-state"],
        });
        expect(plugin.appendSyroNoteUpsert).toHaveBeenCalledWith(noteSnapshot, "review");
        expect(autoCommitReviewResponseToTimeline).toHaveBeenCalledWith(
            expect.objectContaining({
                notePath,
                response: ReviewResponse.Good,
                enabled: true,
            }),
        );
        expect(plugin.appendSyroTimelineAdd).toHaveBeenCalledWith(notePath, timelineCommit);
        expect(plugin.syncEvents.emit).toHaveBeenCalledWith("note-review-updated");
    });

    test("saveReviewResponse only persists daily-state when note review bury is enabled", async () => {
        const notePath = "notes/Review.md";
        const item = {
            uuid: "note-2",
            isNew: false,
            nextReview: 0,
            reviewUpdate: jest.fn(function (result: { nextReview: number }) {
                this.nextReview = result.nextReview;
            }),
        };
        const noteSnapshot = {
            path: notePath,
            source: "manual",
            deckName: DEFAULT_DECKNAME,
            item,
        };
        jest.mocked(autoCommitReviewResponseToTimeline).mockResolvedValue(null as never);

        const plugin = {
            data: {
                settings: {
                    ...DEFAULT_SETTINGS,
                    showSchedulingDebugMessages: false,
                    burySiblingCardsByNoteReview: true,
                    timelineAutoCommitReviewSelection: false,
                },
            },
            getNoteReviewIgnoreReason: jest.fn(() => null),
            showNoteReviewIgnoreNotice: jest.fn(),
            resolveNoteReviewTracking: jest.fn(() => ({
                deckName: DEFAULT_DECKNAME,
                source: "manual",
            })),
            noteReviewStore: {
                ensureTracked: jest.fn(() => item),
                save: jest.fn(async () => undefined),
                getEntrySnapshot: jest.fn(() => noteSnapshot),
            },
            noteAlgorithm: {
                calcAllOptsIntervals: jest.fn(() => ({
                    [ReviewResponse.Good]: 3,
                })),
                srsOptions: jest.fn(() => ({
                    [ReviewResponse.Good]: { id: "good" },
                })),
                onSelection: jest.fn(() => ({
                    correct: true,
                    nextReview: 3 * 24 * 60 * 60 * 1000,
                })),
            },
            reviewCommitStore: {},
            app: {},
            currentDeviceReviewCount: 0,
            requestPluginDataSave: jest.fn(),
            savePluginData: jest.fn(async () => undefined),
            appendSyroNoteUpsert: jest.fn(async () => true),
            appendSyroTimelineAdd: jest.fn(async () => true),
            postponeResponse: jest.fn(),
            syncEvents: {
                emit: jest.fn(),
            },
        };

        await (SRPlugin.prototype.saveReviewResponse as unknown as Function).call(
            plugin,
            { path: notePath },
            ReviewResponse.Good,
        );

        expect(plugin.currentDeviceReviewCount).toBe(1);
        expect(plugin.savePluginData).toHaveBeenCalledWith({
            domains: ["daily-state"],
        });
        expect(plugin.requestPluginDataSave).not.toHaveBeenCalled();
        expect(plugin.appendSyroNoteUpsert).toHaveBeenCalledWith(noteSnapshot, "review");
    });
});
