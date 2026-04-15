import SRPlugin from "src/main";
import { FlashcardReviewMode } from "src/scheduling";
import { SR_TAB_VIEW } from "src/constants";
import { DEFAULT_SETTINGS } from "src/settings";

describe("SRPlugin sync request orchestration", () => {
    test("requestSync queues a rebuild instead of dropping it while a sync is running", async () => {
        const plugin = {
            data: { settings: { showSchedulingDebugMessages: false } },
            shouldSkipDisabledAutomaticIncrementalSync: jest.fn(() => false),
            shouldSkipAutomaticSync: jest.fn(() => false),
            syncLock: true,
            queueSyncRequest: jest.fn((request) => request),
            sync: jest.fn(async () => undefined),
        };

        const result = await (SRPlugin.prototype.requestSync as unknown as Function).call(plugin, {
            reviewMode: FlashcardReviewMode.Review,
            mode: "full",
            trigger: "manual",
        });

        expect(plugin.queueSyncRequest).toHaveBeenCalledWith({
            reviewMode: FlashcardReviewMode.Review,
            mode: "full",
            trigger: "manual",
            force: false,
        });
        expect(plugin.sync).not.toHaveBeenCalled();
        expect(result).toEqual({
            reviewMode: FlashcardReviewMode.Review,
            mode: "full",
            trigger: "manual",
            force: false,
            status: "queued",
            reason: "busy",
        });
    });

    test("requestSync seals the active syro session before manual sync runs", async () => {
        const plugin = {
            data: { settings: { showSchedulingDebugMessages: false } },
            shouldSkipDisabledAutomaticIncrementalSync: jest.fn(() => false),
            shouldSkipAutomaticSync: jest.fn(() => false),
            syncLock: false,
            syroSessionManager: {
                flushActiveSession: jest.fn(async () => "2026-04-13T12-00-00__d84f__0001"),
            },
            importPendingSyroSessions: jest.fn(async () => null),
            sync: jest.fn(async () => undefined),
            updateRemoteDeltaFingerprint: jest.fn(async () => undefined),
        };

        const result = await (SRPlugin.prototype.requestSync as unknown as Function).call(plugin, {
            reviewMode: FlashcardReviewMode.Review,
            mode: "full",
            trigger: "manual",
        });

        expect(plugin.syroSessionManager.flushActiveSession).toHaveBeenCalledWith("manual");
        expect(plugin.sync).toHaveBeenCalledWith(FlashcardReviewMode.Review, "full", {
            trigger: "manual",
            force: false,
        });
        expect(result).toEqual({
            reviewMode: FlashcardReviewMode.Review,
            mode: "full",
            trigger: "manual",
            force: false,
            status: "executed",
        });
    });

    test("requestSync skips active session sealing during remote-poll and imports without sealing its own buffer", async () => {
        const plugin: any = {
            data: {
                settings: {
                    showSchedulingDebugMessages: false,
                    showRuntimeDebugMessages: false,
                },
            },
            shouldSkipDisabledAutomaticIncrementalSync: jest.fn(() => false),
            shouldSkipAutomaticSync: jest.fn(() => false),
            syncLock: false,
            syroReadOnlyReason: null,
            syroSessionManager: {
                flushActiveSession: jest.fn(async () => "2026-04-13T12-00-00__d84f__0001"),
            },
            importPendingSyroSessions: jest.fn(async () => null),
            sync: jest.fn(async () => undefined),
            updateRemoteDeltaFingerprint: jest.fn(async () => undefined),
        };

        await (SRPlugin.prototype.requestSync as unknown as Function).call(plugin, {
            reviewMode: FlashcardReviewMode.Review,
            mode: "incremental",
            trigger: "remote-poll",
            force: true,
        });

        expect(plugin.syroSessionManager.flushActiveSession).not.toHaveBeenCalled();
        expect(plugin.importPendingSyroSessions).toHaveBeenCalledWith({
            sealOwnOpenSession: false,
        });
        expect(plugin.sync).toHaveBeenCalledWith(FlashcardReviewMode.Review, "incremental", {
            trigger: "remote-poll",
            force: true,
        });
    });

    test("replayQueuedSyncRequest reissues the pending request with force enabled", () => {
        const pendingRequest = {
            reviewMode: FlashcardReviewMode.Review,
            mode: "full" as const,
            trigger: "manual" as const,
            force: false,
        };
        const plugin = {
            takePendingSyncRequest: jest.fn(() => pendingRequest),
            logRuntimeDebug: jest.fn(),
            requestSync: jest.fn(() => Promise.resolve({ status: "executed" })),
            runAsync: jest.fn(),
        };

        (
            SRPlugin.prototype as unknown as { replayQueuedSyncRequest: Function }
        ).replayQueuedSyncRequest.call(plugin);

        expect(plugin.requestSync).toHaveBeenCalledWith({
            ...pendingRequest,
            force: true,
        });
        expect(plugin.runAsync).toHaveBeenCalledTimes(1);
    });

    test("reloadOpenReviewSessions reloads every open Syro tab view", async () => {
        const reloadA = jest.fn(async () => undefined);
        const reloadB = jest.fn(async () => undefined);
        const plugin = {
            app: {
                workspace: {
                    getLeavesOfType: jest.fn(() => [
                        { view: { reloadSession: reloadA } },
                        { view: { reloadSession: reloadB } },
                        { view: {} },
                    ]),
                },
            },
        };

        await (
            SRPlugin.prototype as unknown as { reloadOpenReviewSessions: Function }
        ).reloadOpenReviewSessions.call(plugin);

        expect(plugin.app.workspace.getLeavesOfType).toHaveBeenCalledWith(SR_TAB_VIEW);
        expect(reloadA).toHaveBeenCalledTimes(1);
        expect(reloadB).toHaveBeenCalledTimes(1);
    });

    test("consumePendingReviewSessionReloadAfterSync reloads review tabs only after a full sync", async () => {
        const plugin = {
            pendingReviewSessionReloadAfterFullSync: true,
            reloadOpenReviewSessions: jest.fn(async () => undefined),
        };

        await (
            SRPlugin.prototype as unknown as {
                consumePendingReviewSessionReloadAfterSync: Function;
            }
        ).consumePendingReviewSessionReloadAfterSync.call(plugin, "full");

        expect(plugin.reloadOpenReviewSessions).toHaveBeenCalledTimes(1);
        expect(plugin.pendingReviewSessionReloadAfterFullSync).toBe(false);
    });

    test("consumePendingReviewSessionReloadAfterSync ignores incremental syncs and waits for the queued full rebuild", async () => {
        const plugin = {
            pendingReviewSessionReloadAfterFullSync: true,
            reloadOpenReviewSessions: jest.fn(async () => undefined),
        };

        const consumePendingReviewSessionReloadAfterSync = (
            SRPlugin.prototype as unknown as {
                consumePendingReviewSessionReloadAfterSync: Function;
            }
        ).consumePendingReviewSessionReloadAfterSync;

        await consumePendingReviewSessionReloadAfterSync.call(plugin, "incremental");
        expect(plugin.reloadOpenReviewSessions).not.toHaveBeenCalled();
        expect(plugin.pendingReviewSessionReloadAfterFullSync).toBe(true);

        await consumePendingReviewSessionReloadAfterSync.call(plugin, "full");
        await consumePendingReviewSessionReloadAfterSync.call(plugin, "full");

        expect(plugin.reloadOpenReviewSessions).toHaveBeenCalledTimes(1);
        expect(plugin.pendingReviewSessionReloadAfterFullSync).toBe(false);
    });

    test("openFlashcardsInNoteReview syncs before opening the resolved deck review tab", async () => {
        const file = { path: "folder/note.md" };
        const plugin = {
            data: {
                settings: {
                    convertFoldersToDecks: true,
                    trackedNoteToDecks: false,
                },
            },
            logRuntimeDebug: jest.fn(),
            requestSync: jest.fn(async () => ({ status: "executed" })),
            createSrTFile: jest.fn((inputFile) => ({
                path: inputFile.path,
                getAllTagsFromCache: () => [],
            })),
            tabViewManager: {
                openSRTabView: jest.fn(async () => undefined),
            },
        };

        await (
            SRPlugin.prototype as unknown as { openFlashcardsInNoteReview: Function }
        ).openFlashcardsInNoteReview.call(plugin, FlashcardReviewMode.Review, file);

        expect(plugin.requestSync).toHaveBeenCalledWith({
            reviewMode: FlashcardReviewMode.Review,
            trigger: "review-entry",
        });
        expect(plugin.tabViewManager.openSRTabView).toHaveBeenCalledWith(
            FlashcardReviewMode.Review,
            { targetDeckPath: "folder/note" },
        );
    });

    test("savePluginData persists split state files, deck options, and a shell-only data.json", async () => {
        const saveDataShell = (SRPlugin.prototype as unknown as { saveDataShell: Function }).saveDataShell;
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            deckOptionsStore: {
                getSyncEntities: jest.fn(() => ({})),
                markSyncEntity: jest.fn(),
                hasSerializedStateChanged: jest.fn(async () => true),
                saveSerialized: jest.fn(async () => undefined),
            },
            syroSessionManager: {
                appendRecord: jest.fn(async () => true),
                appendDeckOptionsChange: jest.fn(async () => true),
            },
            sharedSettingsStore: {
                save: jest.fn(async () => undefined),
            },
            trackingRulesStore: {
                save: jest.fn(async () => undefined),
            },
            dailyStateStore: {
                save: jest.fn(async () => undefined),
            },
            deviceStateStore: {
                save: jest.fn(async () => undefined),
            },
            licenseStateStore: {
                save: jest.fn(async () => undefined),
            },
            saveDataShell,
            dataShell: null as Record<string, unknown> | null,
            data: {
                settings: {
                    ...DEFAULT_SETTINGS,
                    fsrsSettings: {
                        ...DEFAULT_SETTINGS.fsrsSettings,
                        enable_fuzz: false,
                    },
                    deckOptionsPresets: [
                        ...DEFAULT_SETTINGS.deckOptionsPresets,
                        {
                            ...DEFAULT_SETTINGS.deckOptionsPresets[0],
                            name: "Reading",
                        },
                    ],
                    deckPresetAssignment: { Reading: 1 },
                },
                buryDate: "",
                buryList: [] as string[],
                historyDeck: null as string | null,
                dailyDeckStats: {
                    date: "",
                    counts: {},
                },
                folderTrackingRules: {},
            },
            trackingRulesTombstones: {},
            saveData: jest.fn(async () => undefined),
        });

        await (SRPlugin.prototype.savePluginData as unknown as Function).call(plugin);

        expect(plugin.deckOptionsStore.hasSerializedStateChanged).toHaveBeenCalledWith(
            expect.any(String),
        );
        expect(plugin.syroSessionManager.appendDeckOptionsChange).toHaveBeenCalledWith(
            expect.objectContaining({
                version: 1,
                fsrsSettings: expect.anything(),
                deckOptionsPresets: expect.anything(),
                deckPresetAssignment: expect.anything(),
            }),
            expect.any(String),
        );
        expect(plugin.sharedSettingsStore.save).toHaveBeenCalledTimes(1);
        expect(plugin.trackingRulesStore.save).toHaveBeenCalledTimes(1);
        expect(plugin.dailyStateStore.save).toHaveBeenCalledTimes(1);
        expect(plugin.deviceStateStore.save).toHaveBeenCalledTimes(1);
        expect(plugin.licenseStateStore.save).toHaveBeenCalledTimes(1);
        expect(plugin.deckOptionsStore.saveSerialized).toHaveBeenCalledWith(expect.any(String));
        expect(plugin.saveData).toHaveBeenCalledWith(
            expect.objectContaining({
                schemaVersion: "0.0.12",
                migrations: expect.objectContaining({
                    syro012: expect.objectContaining({
                        completedAt: expect.any(String),
                        sourceVersion: "0.0.11",
                    }),
                }),
            }),
        );
    });

    test("savePluginData with daily-state only persists just daily-state and the shell", async () => {
        const saveDataShell = (SRPlugin.prototype as unknown as { saveDataShell: Function }).saveDataShell;
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            deckOptionsStore: {
                getSyncEntities: jest.fn(() => ({})),
                markSyncEntity: jest.fn(),
                hasSerializedStateChanged: jest.fn(async () => true),
                saveSerialized: jest.fn(async () => undefined),
            },
            syroSessionManager: {
                appendRecord: jest.fn(async () => true),
                appendDeckOptionsChange: jest.fn(async () => true),
            },
            sharedSettingsStore: {
                save: jest.fn(async () => undefined),
            },
            trackingRulesStore: {
                save: jest.fn(async () => undefined),
            },
            dailyStateStore: {
                save: jest.fn(async () => undefined),
            },
            deviceStateStore: {
                save: jest.fn(async () => undefined),
            },
            licenseStateStore: {
                save: jest.fn(async () => undefined),
            },
            saveDataShell,
            dataShell: null as Record<string, unknown> | null,
            persistedDailyState: {
                version: 1,
                buryDate: "2026-04-14",
                buryList: [],
                dailyDeckStats: {
                    date: "2026-04-14",
                    counts: {
                        Deck: { new: 0, review: 0 },
                    },
                },
                deviceReviewCount: 3,
                appliedOpIds: {},
            },
            sharedSettingsUpdatedAtByField: {},
            trackingRulesUpdatedAtByFolderPath: {},
            trackingRulesTombstones: {},
            dailyStateAppliedOpIds: {},
            currentDeviceReviewCount: 4,
            saveData: jest.fn(async () => undefined),
            data: {
                settings: {
                    ...DEFAULT_SETTINGS,
                },
                buryDate: "2026-04-14",
                buryList: [] as string[],
                historyDeck: null as string | null,
                dailyDeckStats: {
                    date: "2026-04-14",
                    counts: {
                        Deck: { new: 0, review: 1 },
                    },
                },
                folderTrackingRules: {},
            },
        });

        await (SRPlugin.prototype.savePluginData as unknown as Function).call(plugin, {
            domains: ["daily-state"],
        });

        expect(plugin.dailyStateStore.save).toHaveBeenCalledTimes(1);
        expect(plugin.dailyStateStore.save).toHaveBeenCalledWith(
            expect.objectContaining({
                deviceReviewCount: 4,
            }),
        );
        expect(plugin.sharedSettingsStore.save).not.toHaveBeenCalled();
        expect(plugin.trackingRulesStore.save).not.toHaveBeenCalled();
        expect(plugin.deviceStateStore.save).not.toHaveBeenCalled();
        expect(plugin.licenseStateStore.save).not.toHaveBeenCalled();
        expect(plugin.deckOptionsStore.saveSerialized).not.toHaveBeenCalled();
        expect(plugin.syroSessionManager.appendDeckOptionsChange).not.toHaveBeenCalled();
        expect(plugin.syroSessionManager.appendRecord).toHaveBeenCalled();
        expect(
            plugin.syroSessionManager.appendRecord.mock.calls.every(
                ([record]: [{ domain: string }]) => record.domain === "daily-state",
            ),
        ).toBe(true);
        expect(plugin.saveData).toHaveBeenCalledTimes(1);
    });

    test("requestPluginDataSave merges pending domains within the debounce window", async () => {
        jest.useFakeTimers();
        try {
            const plugin = Object.assign(Object.create(SRPlugin.prototype), {
                pendingPluginDataSaveTimer: null,
                pendingPluginDataSaveRequested: false,
                pendingPluginDataSaveDomains: new Set(),
                pendingPluginDataSavePromise: null,
                pluginDataSaveFailureNotified: false,
                savePluginData: jest.fn(async () => undefined),
                runAsync: jest.fn((task: Promise<unknown>) => {
                    void task.catch(() => undefined);
                }),
            });

            (SRPlugin.prototype.requestPluginDataSave as unknown as Function).call(plugin, {
                delayMs: 100,
                domains: ["device-state"],
            });
            (SRPlugin.prototype.requestPluginDataSave as unknown as Function).call(plugin, {
                delayMs: 100,
                domains: ["daily-state"],
            });

            await jest.advanceTimersByTimeAsync(100);

            expect(plugin.savePluginData).toHaveBeenCalledTimes(1);
            const domains = [...plugin.savePluginData.mock.calls[0][0].domains].sort();
            expect(domains).toEqual(["daily-state", "device-state"]);
        } finally {
            jest.useRealTimers();
        }
    });

    test("incrementDailyCounts only requests daily-state persistence", () => {
        const plugin = {
            data: {
                settings: {
                    rolloverHour: 4,
                },
                dailyDeckStats: {
                    date: "2026-04-15",
                    counts: {},
                },
            },
            getRolloverDate: jest.fn(() => "2026-04-15"),
            loadDailyDeckStats: SRPlugin.prototype.loadDailyDeckStats,
            currentDeviceReviewCount: 0,
            requestPluginDataSave: jest.fn(),
        };

        (SRPlugin.prototype.incrementDailyCounts as unknown as Function).call(plugin, "A/B", false);

        expect(plugin.currentDeviceReviewCount).toBe(1);
        expect(plugin.requestPluginDataSave).toHaveBeenCalledWith({
            domains: ["daily-state"],
        });
    });
});
