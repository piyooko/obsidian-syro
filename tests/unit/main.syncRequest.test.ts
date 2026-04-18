import SRPlugin from "src/main";
import { FlashcardReviewMode } from "src/scheduling";
import { SR_TAB_VIEW } from "src/constants";
import { DEFAULT_SETTINGS } from "src/settings";
import { SyroDeleteValidDeviceModal } from "src/ui/modals/SyroDeleteValidDeviceModal";

function createMomentStub(timestamp: number) {
    return {
        valueOf: () => timestamp,
        format: (_pattern: string) => "2026-04-16",
    };
}

describe("SRPlugin sync request orchestration", () => {
    test("requestSync queues a rebuild instead of dropping it while a sync is running", async () => {
        const plugin = {
            data: { settings: { showSchedulingDebugMessages: false } },
            guardSyroDataReady: jest.fn(() => true),
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
            guardSyroDataReady: jest.fn(() => true),
            shouldSkipDisabledAutomaticIncrementalSync: jest.fn(() => false),
            shouldSkipAutomaticSync: jest.fn(() => false),
            syncLock: false,
            flushReviewPersistence: jest.fn(async () => true),
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

    test("pullSyroDeviceToCurrent aligns only the copied source device sessions after overwrite", async () => {
        const currentLayout = {
            device: {
                deviceId: "desktop-id",
                deviceName: "Desktop",
            },
        };
        const overwrittenLayout = {
            device: {
                deviceId: "desktop-id",
                deviceName: "Desktop",
            },
        };
        const plugin: any = {
            syroWorkspace: {
                listDeviceInventory: jest.fn(async () => ({
                    currentDevice: {
                        deviceId: "desktop-id",
                        deviceName: "Desktop",
                        deviceFolderName: "Desktop--d84f",
                    },
                    validDevices: [
                        {
                            deviceId: "mobile-id",
                            deviceName: "Mobile",
                            deviceFolderName: "Mobile--91ac",
                        },
                    ],
                })),
                overwriteCurrentDeviceFromSource: jest.fn(async () => overwrittenLayout),
            },
            syroLayout: currentLayout,
            syroSessionManager: {
                alignRemoteDeviceSessionsToEof: jest.fn(async () => undefined),
            },
            syroReadOnlyReason: null,
            confirmSyroAction: jest.fn(async () => true),
            flushBeforeSyroDeviceMutation: jest.fn(async () => undefined),
            reloadAfterSyroDeviceChange: jest.fn(async () => undefined),
        };

        const result = await (SRPlugin.prototype.pullSyroDeviceToCurrent as unknown as Function).call(
            plugin,
            "mobile-id",
        );

        expect(plugin.syroWorkspace.overwriteCurrentDeviceFromSource).toHaveBeenCalledWith(
            currentLayout,
            "mobile-id",
        );
        expect(plugin.syroSessionManager.alignRemoteDeviceSessionsToEof).toHaveBeenCalledWith(
            "Mobile--91ac",
        );
        expect(plugin.reloadAfterSyroDeviceChange).toHaveBeenCalledTimes(1);
        expect(result).toBe(true);
    });

    test("importPendingSyroSessions aligns fresh baseline source sessions to EOF before first import", async () => {
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            syroReadOnlyReason: null,
            syroLayout: {
                device: {
                    baselineFromDeviceId: "desktop-id",
                },
            },
            syroSessionManager: {
                hasRestoredCurrentDeviceCursorSnapshot: jest.fn(() => false),
                alignRemoteDeviceSessionsToEof: jest.fn(async () => undefined),
                importPendingSessions: jest.fn(async () => ({
                    importedSessionIds: ["Desktop--70ad/2026-04-16"],
                    deletedSessionIds: [],
                    archivedSessionIds: [],
                    replayImpact: {
                        cardsRuntimeChanged: false,
                        noteReviewChanged: false,
                        timelineChanged: false,
                        deckOptionsChanged: false,
                        sharedSettingsChanged: false,
                        trackingRulesChanged: false,
                        dailyStateChanged: false,
                        requiresGlobalSync: false,
                    },
                })),
            },
            syroWorkspace: {
                listDeviceInventory: jest.fn(async () => ({
                    validDevices: [
                        {
                            deviceId: "desktop-id",
                            deviceFolderName: "Desktop--70ad",
                            deviceRoot: ".obsidian/plugins/syro/devices/Desktop--70ad",
                        },
                    ],
                })),
            },
            deckOptionsStore: {},
            sharedSettingsStore: {},
            trackingRulesStore: {},
            dailyStateStore: {},
            store: {
                hasPendingReviewOverlayEntries: jest.fn(() => false),
            },
            noteReviewStore: {},
            reviewCommitStore: {},
            data: {
                settings: {
                    ...DEFAULT_SETTINGS,
                },
                buryDate: "2026-04-16",
                buryList: [] as string[],
                historyDeck: null as string | null,
                dailyDeckStats: {
                    date: "2026-04-16",
                    counts: {},
                },
                folderTrackingRules: {},
            },
            sharedSettingsUpdatedAtByField: {},
            trackingRulesUpdatedAtByFolderPath: {},
            trackingRulesTombstones: {},
            dailyStateAppliedOpIds: {},
            currentDeviceReviewCount: 0,
            bufferedStateDirtyRevisions: {
                "shared-settings": 0,
                "tracking-rules": 0,
                "daily-state": 0,
            },
            bufferedStatePersistedRevisions: {
                "shared-settings": 0,
                "tracking-rules": 0,
                "daily-state": 0,
            },
            reviewStateCommitCoordinator: {
                hasPendingWork: jest.fn(() => false),
            },
            flushPendingPluginDataSave: jest.fn(async () => true),
            appendSyroUuidAliasBatch: jest.fn(async () => undefined),
            logRuntimeDebug: jest.fn(),
            pruneSyroInlineSyncMetadata: jest.fn(async () => undefined),
            requestPluginDataSave: jest.fn(),
        });

        const result = await (
            SRPlugin.prototype as unknown as { importPendingSyroSessions: Function }
        ).importPendingSyroSessions.call(plugin, {
            reason: "startup",
        });

        expect(plugin.syroSessionManager.alignRemoteDeviceSessionsToEof).toHaveBeenCalledWith(
            "Desktop--70ad",
        );
        expect(plugin.syroSessionManager.importPendingSessions).toHaveBeenCalledTimes(1);
        expect(plugin.logRuntimeDebug).toHaveBeenCalledWith(
            "[SR-Syro] fresh-baseline source sessions aligned to EOF before first import",
            expect.objectContaining({
                reason: "startup",
                sourceDeviceFolderName: "Desktop--70ad",
            }),
        );
        expect(result).toEqual(
            expect.objectContaining({
                importedSessionIds: ["Desktop--70ad/2026-04-16"],
            }),
        );
    });

    test("importPendingSyroSessions skips first import when fresh baseline source cannot be resolved", async () => {
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            syroReadOnlyReason: null,
            syroLayout: {
                device: {
                    baselineFromDeviceId: "desktop-id",
                },
            },
            syroSessionManager: {
                hasRestoredCurrentDeviceCursorSnapshot: jest.fn(() => false),
                alignRemoteDeviceSessionsToEof: jest.fn(async () => undefined),
                importPendingSessions: jest.fn(async () => {
                    throw new Error("should not import");
                }),
            },
            syroWorkspace: {
                listDeviceInventory: jest.fn(async () => ({
                    validDevices: [],
                })),
            },
            deckOptionsStore: {},
            sharedSettingsStore: {},
            trackingRulesStore: {},
            dailyStateStore: {},
            store: {
                hasPendingReviewOverlayEntries: jest.fn(() => false),
            },
            noteReviewStore: {},
            reviewCommitStore: {},
            data: {
                settings: {
                    ...DEFAULT_SETTINGS,
                },
                buryDate: "2026-04-16",
                buryList: [] as string[],
                historyDeck: null as string | null,
                dailyDeckStats: {
                    date: "2026-04-16",
                    counts: {},
                },
                folderTrackingRules: {},
            },
            sharedSettingsUpdatedAtByField: {},
            trackingRulesUpdatedAtByFolderPath: {},
            trackingRulesTombstones: {},
            dailyStateAppliedOpIds: {},
            currentDeviceReviewCount: 0,
            bufferedStateDirtyRevisions: {
                "shared-settings": 0,
                "tracking-rules": 0,
                "daily-state": 0,
            },
            bufferedStatePersistedRevisions: {
                "shared-settings": 0,
                "tracking-rules": 0,
                "daily-state": 0,
            },
            reviewStateCommitCoordinator: {
                hasPendingWork: jest.fn(() => false),
            },
            flushPendingPluginDataSave: jest.fn(async () => true),
            appendSyroUuidAliasBatch: jest.fn(async () => undefined),
            logRuntimeDebug: jest.fn(),
            pruneSyroInlineSyncMetadata: jest.fn(async () => undefined),
            requestPluginDataSave: jest.fn(),
        });

        const result = await (
            SRPlugin.prototype as unknown as { importPendingSyroSessions: Function }
        ).importPendingSyroSessions.call(plugin, {
            reason: "startup",
        });

        expect(plugin.syroSessionManager.alignRemoteDeviceSessionsToEof).not.toHaveBeenCalled();
        expect(plugin.syroSessionManager.importPendingSessions).not.toHaveBeenCalled();
        expect(plugin.logRuntimeDebug).toHaveBeenCalledWith(
            "[SR-Syro] fresh-baseline source alignment skipped before first import",
            expect.objectContaining({
                reason: "startup",
                status: "missing-source-device",
            }),
        );
        expect(result).toEqual({
            importedSessionIds: [],
            deletedSessionIds: [],
            archivedSessionIds: [],
            replayImpact: expect.objectContaining({
                dailyStateChanged: false,
            }),
        });
    });

    test("deleteValidSyroDevice deletes a peer device only after modal confirmation", async () => {
        const openAndWaitSpy = jest
            .spyOn(SyroDeleteValidDeviceModal.prototype, "openAndWait")
            .mockResolvedValue(true);
        const plugin: any = {
            app: {},
            syroWorkspace: {
                listDeviceInventory: jest.fn(async () => ({
                    currentDevice: {
                        deviceId: "desktop-id",
                        deviceName: "Desktop",
                        deviceFolderName: "Desktop--d84f",
                    },
                    validDevices: [
                        {
                            deviceId: "mobile-id",
                            deviceName: "Mobile",
                            deviceFolderName: "Mobile--91ac",
                        },
                    ],
                })),
                deleteValidDevice: jest.fn(async () => undefined),
            },
            syroSessionManager: {
                pruneRemoteDeviceCursorState: jest.fn(async () => undefined),
            },
            syroReadOnlyReason: null,
            flushBeforeSyroDeviceMutation: jest.fn(async () => undefined),
        };

        try {
            const result = await (SRPlugin.prototype.deleteValidSyroDevice as unknown as Function).call(
                plugin,
                "mobile-id",
            );

            expect(openAndWaitSpy).toHaveBeenCalledTimes(1);
            expect(plugin.flushBeforeSyroDeviceMutation).toHaveBeenCalledTimes(1);
            expect(plugin.syroWorkspace.deleteValidDevice).toHaveBeenCalledWith("mobile-id");
            expect(plugin.syroSessionManager.pruneRemoteDeviceCursorState).toHaveBeenCalledWith(
                "Mobile--91ac",
            );
            expect(result).toBe(true);
        } finally {
            openAndWaitSpy.mockRestore();
        }
    });

    test("deleteValidSyroDevice skips deletion when the modal is cancelled", async () => {
        const openAndWaitSpy = jest
            .spyOn(SyroDeleteValidDeviceModal.prototype, "openAndWait")
            .mockResolvedValue(false);
        const plugin: any = {
            app: {},
            syroWorkspace: {
                listDeviceInventory: jest.fn(async () => ({
                    currentDevice: {
                        deviceId: "desktop-id",
                        deviceName: "Desktop",
                        deviceFolderName: "Desktop--d84f",
                    },
                    validDevices: [
                        {
                            deviceId: "mobile-id",
                            deviceName: "Mobile",
                            deviceFolderName: "Mobile--91ac",
                        },
                    ],
                })),
                deleteValidDevice: jest.fn(async () => undefined),
            },
            syroSessionManager: {
                pruneRemoteDeviceCursorState: jest.fn(async () => undefined),
            },
            syroReadOnlyReason: null,
            flushBeforeSyroDeviceMutation: jest.fn(async () => undefined),
        };

        try {
            const result = await (SRPlugin.prototype.deleteValidSyroDevice as unknown as Function).call(
                plugin,
                "mobile-id",
            );

            expect(openAndWaitSpy).toHaveBeenCalledTimes(1);
            expect(plugin.flushBeforeSyroDeviceMutation).not.toHaveBeenCalled();
            expect(plugin.syroWorkspace.deleteValidDevice).not.toHaveBeenCalled();
            expect(plugin.syroSessionManager.pruneRemoteDeviceCursorState).not.toHaveBeenCalled();
            expect(result).toBe(false);
        } finally {
            openAndWaitSpy.mockRestore();
        }
    });

    test("requestSync skips active session sealing during remote-poll and imports without sealing its own buffer", async () => {
        const plugin: any = {
            data: {
                settings: {
                    showSchedulingDebugMessages: false,
                    showRuntimeDebugMessages: false,
                },
            },
            guardSyroDataReady: jest.fn(() => true),
            shouldSkipDisabledAutomaticIncrementalSync: jest.fn(() => false),
            shouldSkipAutomaticSync: jest.fn(() => false),
            syncLock: false,
            syroReadOnlyReason: null,
            flushReviewPersistence: jest.fn(async () => true),
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
            reason: "remote-poll",
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
            guardSyroDataReady: jest.fn(() => true),
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
            dailyStateAppliedOpIds: {},
            currentDeviceReviewCount: 0,
            pendingDailyStateCommittedTargetUuids: new Set(),
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
        const pendingOverlayStore = {
            getDailyStateSection: jest.fn(async () => ({
                version: 3,
                commitId: "daily-state:test-1",
                buryDate: "2026-04-14",
                buryList: [],
                dailyDeckStats: {
                    date: "2026-04-14",
                    counts: {
                        Deck: { new: 0, review: 1 },
                    },
                },
                deviceReviewCount: 4,
                committedTargetUuids: [],
            })),
            stageDailyStateSection: jest.fn(),
            clearDailyStateSection: jest.fn(),
            requestFlush: jest.fn(),
            drainFlush: jest.fn(async () => true),
        };
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
            pendingDailyStateCommittedTargetUuids: new Set(),
            pendingOverlayStore,
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
                appliedOpIds: expect.objectContaining({
                    "daily-op:daily-state:test-1:0:deck-stats-delta": expect.any(String),
                }),
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
        expect(
            plugin.syroSessionManager.appendRecord.mock.calls.every(
                ([record]: [{ targetUuid: string }]) =>
                    record.targetUuid.startsWith("daily-op:daily-state:test-1:"),
            ),
        ).toBe(true);
        expect(pendingOverlayStore.clearDailyStateSection).toHaveBeenCalledTimes(1);
        expect(pendingOverlayStore.stageDailyStateSection).toHaveBeenCalledWith(
            expect.objectContaining({
                commitId: "daily-state:test-1",
                committedTargetUuids: ["daily-op:daily-state:test-1:0:deck-stats-delta"],
            }),
        );
        expect(pendingOverlayStore.requestFlush).toHaveBeenCalledTimes(2);
        expect(pendingOverlayStore.drainFlush).toHaveBeenCalledTimes(2);
        expect(plugin.saveData).toHaveBeenCalledTimes(1);
    });

    test("savePluginData retains daily-state overlay when session append fails", async () => {
        const saveDataShell = (SRPlugin.prototype as unknown as { saveDataShell: Function }).saveDataShell;
        const pendingOverlayStore = {
            getDailyStateSection: jest.fn(async () => ({
                version: 3,
                commitId: "daily-state:test-2",
                buryDate: "2026-04-14",
                buryList: [],
                dailyDeckStats: {
                    date: "2026-04-14",
                    counts: {
                        Deck: { new: 0, review: 1 },
                    },
                },
                deviceReviewCount: 4,
                committedTargetUuids: [],
            })),
            stageDailyStateSection: jest.fn(),
            clearDailyStateSection: jest.fn(),
            requestFlush: jest.fn(),
            drainFlush: jest.fn(async () => true),
        };
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            deckOptionsStore: {
                getSyncEntities: jest.fn(() => ({})),
                markSyncEntity: jest.fn(),
                hasSerializedStateChanged: jest.fn(async () => true),
                saveSerialized: jest.fn(async () => undefined),
            },
            syroSessionManager: {
                appendRecord: jest.fn(async () => false),
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
            pendingDailyStateCommittedTargetUuids: new Set(),
            pendingOverlayStore,
            logRuntimeDebug: jest.fn(),
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

        await expect(
            (SRPlugin.prototype.savePluginData as unknown as Function).call(plugin, {
                domains: ["daily-state"],
            }),
        ).rejects.toThrow("Failed to append daily-state session record");

        expect(plugin.dailyStateStore.save).not.toHaveBeenCalled();
        expect(pendingOverlayStore.clearDailyStateSection).not.toHaveBeenCalled();
    });

    test("savePluginData skips already committed daily-state targetUuids from pending overlay", async () => {
        const saveDataShell = (SRPlugin.prototype as unknown as { saveDataShell: Function }).saveDataShell;
        const pendingOverlayStore = {
            getDailyStateSection: jest.fn(async () => ({
                version: 3,
                commitId: "daily-state:test-3",
                buryDate: "2026-04-14",
                buryList: [],
                dailyDeckStats: {
                    date: "2026-04-14",
                    counts: {
                        DeckA: { new: 0, review: 1 },
                        DeckB: { new: 0, review: 1 },
                    },
                },
                deviceReviewCount: 2,
                committedTargetUuids: ["daily-op:daily-state:test-3:0:deck-stats-delta"],
            })),
            stageDailyStateSection: jest.fn(),
            clearDailyStateSection: jest.fn(),
            requestFlush: jest.fn(),
            drainFlush: jest.fn(async () => true),
        };
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            deckOptionsStore: {
                getSyncEntities: jest.fn(() => ({})),
                markSyncEntity: jest.fn(),
                hasSerializedStateChanged: jest.fn(async () => false),
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
                    counts: {},
                },
                deviceReviewCount: 0,
                appliedOpIds: {},
            },
            sharedSettingsUpdatedAtByField: {},
            trackingRulesUpdatedAtByFolderPath: {},
            trackingRulesTombstones: {},
            dailyStateAppliedOpIds: {},
            pendingDailyStateCommitId: "daily-state:test-3",
            pendingDailyStateCommittedTargetUuids: new Set([
                "daily-op:daily-state:test-3:0:deck-stats-delta",
            ]),
            currentDeviceReviewCount: 2,
            pendingOverlayStore,
            logRuntimeDebug: jest.fn(),
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
                        DeckA: { new: 0, review: 1 },
                        DeckB: { new: 0, review: 1 },
                    },
                },
                folderTrackingRules: {},
            },
        });

        await (SRPlugin.prototype.savePluginData as unknown as Function).call(plugin, {
            domains: ["daily-state"],
        });

        expect(plugin.syroSessionManager.appendRecord).toHaveBeenCalledTimes(1);
        expect(plugin.syroSessionManager.appendRecord).toHaveBeenCalledWith(
            expect.objectContaining({
                targetUuid: "daily-op:daily-state:test-3:1:deck-stats-delta",
            }),
        );
        expect(plugin.dailyStateStore.save).toHaveBeenCalledWith(
            expect.objectContaining({
                appliedOpIds: expect.objectContaining({
                    "daily-op:daily-state:test-3:0:deck-stats-delta": expect.any(String),
                    "daily-op:daily-state:test-3:1:deck-stats-delta": expect.any(String),
                }),
            }),
        );
        expect(pendingOverlayStore.stageDailyStateSection).toHaveBeenCalledWith(
            expect.objectContaining({
                committedTargetUuids: expect.arrayContaining([
                    "daily-op:daily-state:test-3:0:deck-stats-delta",
                    "daily-op:daily-state:test-3:1:deck-stats-delta",
                ]),
            }),
        );
    });

    test("requestPluginDataSave stages daily-state into pending overlay immediately", () => {
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
            pendingOverlayStore: {
                stageDailyStateSection: jest.fn(),
                requestFlush: jest.fn(),
            },
            data: {
                settings: {
                    ...DEFAULT_SETTINGS,
                },
                buryDate: "2026-04-16",
                buryList: [] as string[],
                historyDeck: null as string | null,
                dailyDeckStats: {
                    date: "2026-04-16",
                    counts: {},
                },
                folderTrackingRules: {},
            },
            currentDeviceReviewCount: 2,
            pendingDailyStateCommittedTargetUuids: new Set(),
        });

        (SRPlugin.prototype.requestPluginDataSave as unknown as Function).call(plugin, {
            delayMs: 100,
            domains: ["daily-state"],
        });

        expect(plugin.pendingOverlayStore.stageDailyStateSection).toHaveBeenCalledTimes(1);
        expect(plugin.pendingOverlayStore.requestFlush).toHaveBeenCalledTimes(1);
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
                pendingOverlayStore: {
                    stageDailyStateSection: jest.fn(),
                    requestFlush: jest.fn(),
                },
                savePluginData: jest.fn(async () => undefined),
                runAsync: jest.fn((task: Promise<unknown>) => {
                    void task.catch(() => undefined);
                }),
                data: {
                    settings: {
                        ...DEFAULT_SETTINGS,
                    },
                    buryDate: "2026-04-16",
                    buryList: [] as string[],
                    historyDeck: null as string | null,
                    dailyDeckStats: {
                        date: "2026-04-16",
                        counts: {},
                    },
                    folderTrackingRules: {},
                },
                currentDeviceReviewCount: 0,
                pendingDailyStateCommittedTargetUuids: new Set(),
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

    test("importPendingSyroSessions skips remote replay when buffered split-state flush times out", async () => {
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            syroReadOnlyReason: null,
            syroSessionManager: {
                importPendingSessions: jest.fn(async () => {
                    throw new Error("should not reach replay");
                }),
            },
            syroWorkspace: {
                listDeviceInventory: jest.fn(async () => ({
                    validDevices: [],
                })),
            },
            deckOptionsStore: {},
            sharedSettingsStore: {},
            trackingRulesStore: {},
            dailyStateStore: {},
            store: {
                hasPendingReviewOverlayEntries: jest.fn(() => false),
            },
            noteReviewStore: {},
            reviewCommitStore: {},
            data: {
                settings: {
                    ...DEFAULT_SETTINGS,
                },
                buryDate: "",
                buryList: [] as string[],
                historyDeck: null as string | null,
                dailyDeckStats: {
                    date: "2026-04-16",
                    counts: {},
                },
                folderTrackingRules: {},
            },
            sharedSettingsUpdatedAtByField: {},
            trackingRulesUpdatedAtByFolderPath: {},
            trackingRulesTombstones: {},
            dailyStateAppliedOpIds: {},
            currentDeviceReviewCount: 0,
            bufferedStateDirtyRevisions: {
                "shared-settings": 0,
                "tracking-rules": 0,
                "daily-state": 1,
            },
            bufferedStatePersistedRevisions: {
                "shared-settings": 0,
                "tracking-rules": 0,
                "daily-state": 0,
            },
            reviewStateCommitCoordinator: {
                hasPendingWork: jest.fn(() => false),
            },
            flushPendingPluginDataSave: jest.fn(async () => false),
            logRuntimeDebug: jest.fn(),
            pruneSyroInlineSyncMetadata: jest.fn(async () => undefined),
        });

        const result = await (
            SRPlugin.prototype as unknown as { importPendingSyroSessions: Function }
        ).importPendingSyroSessions.call(plugin, {
            reason: "remote-delta:test",
        });

        expect(plugin.flushPendingPluginDataSave).toHaveBeenCalledWith(1200);
        expect(plugin.syroSessionManager.importPendingSessions).not.toHaveBeenCalled();
        expect(result).toEqual({
            importedSessionIds: [],
            deletedSessionIds: [],
            archivedSessionIds: [],
            replayImpact: expect.objectContaining({
                dailyStateChanged: false,
            }),
        });
    });

    test("importPendingSyroSessions preserves persisted daily-state baseline when local dirty changes appear during import", async () => {
        const oldDailyState = {
            version: 1,
            buryDate: "2026-04-16",
            buryList: [] as string[],
            dailyDeckStats: {
                date: "2026-04-16",
                counts: {
                    Deck: { new: 1, review: 0 },
                },
            },
            deviceReviewCount: 1,
            appliedOpIds: {},
        };
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            syroReadOnlyReason: null,
            syroSessionManager: {
                importPendingSessions: jest.fn(async () => {
                    plugin.data.dailyDeckStats = {
                        date: "2026-04-16",
                        counts: {
                            Deck: { new: 5, review: 0 },
                        },
                    };
                    plugin.currentDeviceReviewCount = 5;
                    plugin.bufferedStateDirtyRevisions["daily-state"] = 1;
                    return {
                        importedSessionIds: ["Mobile--cf8e/2026-04-16"],
                        deletedSessionIds: [],
                        archivedSessionIds: [],
                        replayImpact: {
                            cardsRuntimeChanged: false,
                            noteReviewChanged: false,
                            timelineChanged: false,
                            deckOptionsChanged: false,
                            sharedSettingsChanged: false,
                            trackingRulesChanged: false,
                            dailyStateChanged: false,
                            requiresGlobalSync: false,
                        },
                    };
                }),
            },
            syroWorkspace: {
                listDeviceInventory: jest.fn(async () => ({
                    validDevices: [],
                })),
            },
            deckOptionsStore: {},
            sharedSettingsStore: {},
            trackingRulesStore: {},
            dailyStateStore: {},
            store: {
                hasPendingReviewOverlayEntries: jest.fn(() => false),
            },
            noteReviewStore: {},
            reviewCommitStore: {},
            data: {
                settings: {
                    ...DEFAULT_SETTINGS,
                },
                buryDate: "2026-04-16",
                buryList: [] as string[],
                historyDeck: null as string | null,
                dailyDeckStats: {
                    date: "2026-04-16",
                    counts: {
                        Deck: { new: 1, review: 0 },
                    },
                },
                folderTrackingRules: {},
            },
            persistedDailyState: oldDailyState,
            sharedSettingsUpdatedAtByField: {},
            trackingRulesUpdatedAtByFolderPath: {},
            trackingRulesTombstones: {},
            dailyStateAppliedOpIds: {},
            currentDeviceReviewCount: 1,
            pendingPluginDataSaveTimer: null,
            pendingPluginDataSaveRequested: false,
            pendingPluginDataSaveDomains: new Set(),
            pendingPluginDataSavePromise: null,
            bufferedStateDirtyRevisions: {
                "shared-settings": 0,
                "tracking-rules": 0,
                "daily-state": 0,
            },
            bufferedStatePersistedRevisions: {
                "shared-settings": 0,
                "tracking-rules": 0,
                "daily-state": 0,
            },
            reviewStateCommitCoordinator: {
                hasPendingWork: jest.fn(() => false),
            },
            flushPendingPluginDataSave: jest.fn(async () => true),
            logRuntimeDebug: jest.fn(),
            pruneSyroInlineSyncMetadata: jest.fn(async () => undefined),
        });
        await (
            SRPlugin.prototype as unknown as { importPendingSyroSessions: Function }
        ).importPendingSyroSessions.call(plugin, {
            reason: "manual",
        });

        expect(plugin.persistedDailyState).toBe(oldDailyState);
        expect(plugin.bufferedStatePersistedRevisions["daily-state"]).toBe(0);
        expect(plugin.logRuntimeDebug).toHaveBeenCalledWith(
            "[SR-BufferedState] buffered-state-baseline-preserved-due-to-local-dirty",
            expect.objectContaining({
                reason: "manual",
                domains: ["daily-state"],
            }),
        );
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

    test("incrementDeviceReviewCount only requests daily-state persistence", () => {
        const plugin = {
            currentDeviceReviewCount: 0,
            requestPluginDataSave: jest.fn(),
        };

        (SRPlugin.prototype.incrementDeviceReviewCount as unknown as Function).call(plugin);

        expect(plugin.currentDeviceReviewCount).toBe(1);
        expect(plugin.requestPluginDataSave).toHaveBeenCalledWith({
            domains: ["daily-state"],
        });
    });

    test("sync merges review overlay before cleaning dirty new items", async () => {
        (window as Window & { moment?: (value: number) => ReturnType<typeof createMomentStub> }).moment =
            (value: number) => createMomentStub(value);
        const callOrder: string[] = [];
        const plugin: any = {
            guardSyroDataReady: jest.fn(() => true),
            syncLock: false,
            syncEvents: { emit: jest.fn() },
            data: {
                settings: {
                    ...DEFAULT_SETTINGS,
                    enableNoteCachePersistence: false,
                    showSchedulingDebugMessages: false,
                },
                buryDate: "2026-04-16",
            },
            getSyncSignature: jest.fn(() => "sig"),
            shouldShowSyncProgressTip: jest.fn(() => false),
            store: {
                ensureReviewOverlayMerged: jest.fn(async () => {
                    callOrder.push("merge");
                    return true;
                }),
                cleanDirtyNewItems: jest.fn(() => {
                    callOrder.push("clean");
                }),
                suspendSaves: jest.fn(() => () => undefined),
                flushSaveIfNeeded: jest.fn(async () => undefined),
                save: jest.fn(async () => undefined),
            },
            app: {
                vault: {
                    getMarkdownFiles: jest.fn(() => {
                        callOrder.push("notes");
                        return [];
                    }),
                },
                metadataCache: {},
            },
            linkRank: { readLinks: jest.fn() },
            questionPostponementList: { clear: jest.fn() },
            noteCache: new Map(),
            noteCacheSignature: "",
            shouldPersistNoteCacheAfterSync: jest.fn(() => false),
            collectLearningCardsFromStore: jest.fn(),
            updateStatusBar: jest.fn(),
            reviewFloatBar: {},
            logRuntimeDebug: jest.fn(),
            getCardCaptureSignature: jest.fn(() => "cap"),
            consumePendingReviewSessionReloadAfterSync: jest.fn(async () => undefined),
            replayQueuedSyncRequest: jest.fn(),
            replayPendingRemoteDeltaSyncIfNeeded: jest.fn(),
            pendingCardCapturePromptSignature: "",
            lastSuccessfulCardCaptureSignature: "",
            reviewDecks: {},
            getReviewQueueView: jest.fn(() => null),
        };

        await (SRPlugin.prototype.sync as unknown as Function).call(
            plugin,
            FlashcardReviewMode.Review,
            "incremental",
            { trigger: "manual", force: false },
        );

        expect(callOrder.slice(0, 3)).toEqual(["merge", "clean", "notes"]);
    });
});
