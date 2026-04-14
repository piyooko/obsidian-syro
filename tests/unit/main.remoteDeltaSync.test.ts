import SRPlugin from "src/main";
import { FlashcardReviewMode } from "src/scheduling";
import { createEmptySyroSessionReplaySummary } from "src/dataStore/syroSessionImpact";

describe("SRPlugin remote delta sync", () => {
    test("shouldEnableRemoteDeltaPolling requires a writable ready Syro layout without pending recovery", () => {
        const shouldEnableRemoteDeltaPolling = (
            SRPlugin.prototype as unknown as {
                shouldEnableRemoteDeltaPolling: Function;
            }
        ).shouldEnableRemoteDeltaPolling;

        expect(
            shouldEnableRemoteDeltaPolling.call({
                syroLayout: {},
                syroSessionManager: {},
                syroReadOnlyReason: null,
                pendingSyroRecoveryContext: null,
                pendingSyroDeviceSelectionContext: null,
                data: {
                    settings: {
                        autoIncrementalSync: true,
                    },
                },
            }),
        ).toBe(true);

        expect(
            shouldEnableRemoteDeltaPolling.call({
                syroLayout: {},
                syroSessionManager: {},
                syroReadOnlyReason: null,
                pendingSyroRecoveryContext: null,
                pendingSyroDeviceSelectionContext: null,
                data: {
                    settings: {
                        autoIncrementalSync: false,
                    },
                },
            }),
        ).toBe(false);

        expect(
            shouldEnableRemoteDeltaPolling.call({
                syroLayout: {},
                syroSessionManager: {},
                syroReadOnlyReason: "read-only",
                pendingSyroRecoveryContext: null,
                pendingSyroDeviceSelectionContext: null,
                data: {
                    settings: {
                        autoIncrementalSync: true,
                    },
                },
            }),
        ).toBe(false);

        expect(
            shouldEnableRemoteDeltaPolling.call({
                syroLayout: {},
                syroSessionManager: {},
                syroReadOnlyReason: null,
                pendingSyroRecoveryContext: {
                    kind: "baseline-required",
                },
                pendingSyroDeviceSelectionContext: null,
                data: {
                    settings: {
                        autoIncrementalSync: true,
                    },
                },
            }),
        ).toBe(false);
    });

    test("queueRemoteDeltaSyncCheck coalesces while another sync lock is active", () => {
        const queueRemoteDeltaSyncCheck = (
            SRPlugin.prototype as unknown as {
                queueRemoteDeltaSyncCheck: Function;
            }
        ).queueRemoteDeltaSyncCheck;

        const plugin = {
            shouldEnableRemoteDeltaPolling: jest.fn(() => true),
            remoteDeltaSyncLock: false,
            remoteDeltaSyncPending: false,
            syncLock: true,
            noteReviewRefreshLock: false,
            runAsync: jest.fn(),
        };

        queueRemoteDeltaSyncCheck.call(plugin, "interval");

        expect(plugin.remoteDeltaSyncPending).toBe(true);
        expect(plugin.runAsync).not.toHaveBeenCalled();
    });

    test("queueBackgroundSyroSessionSeal flushes the local open session when Syro is writable", () => {
        const queueBackgroundSyroSessionSeal = (
            SRPlugin.prototype as unknown as {
                queueBackgroundSyroSessionSeal: Function;
            }
        ).queueBackgroundSyroSessionSeal;

        const plugin: any = {
            syroReadOnlyReason: null,
            syroSessionManager: {
                flushActiveSession: jest.fn(async () => "2026-04-14T06-00-00__0dc4__0001"),
            },
            runAsync: jest.fn(),
        };

        queueBackgroundSyroSessionSeal.call(plugin, "hidden");

        expect(plugin.syroSessionManager.flushActiveSession).toHaveBeenCalledWith("background");
        expect(plugin.runAsync).toHaveBeenCalledTimes(1);
    });

    test("runRemoteDeltaSyncOnce ignores unchanged fingerprints", async () => {
        const runRemoteDeltaSyncOnce = (
            SRPlugin.prototype as unknown as {
                runRemoteDeltaSyncOnce: Function;
            }
        ).runRemoteDeltaSyncOnce;

        const plugin = {
            shouldEnableRemoteDeltaPolling: jest.fn(() => true),
            syncLock: false,
            noteReviewRefreshLock: false,
            remoteDeltaFingerprint: "same",
            captureRemoteDeltaFingerprint: jest.fn(async () => "same"),
            logRuntimeDebug: jest.fn(),
            syroSessionManager: {
                peekPendingSessions: jest.fn(async () => ({
                    pendingSessionIds: [],
                    impact: null,
                })),
            },
            requestSync: jest.fn(async () => ({ status: "executed" })),
            importPendingSyroSessions: jest.fn(async () => null),
            applyLightweightSessionDelta: jest.fn(async () => "noop"),
            updateRemoteDeltaFingerprint: jest.fn(async () => undefined),
        };

        await runRemoteDeltaSyncOnce.call(plugin, "interval");

        expect(plugin.syroSessionManager.peekPendingSessions).toHaveBeenCalledTimes(1);
        expect(plugin.importPendingSyroSessions).not.toHaveBeenCalled();
        expect(plugin.requestSync).not.toHaveBeenCalled();
    });

    test("runRemoteDeltaSyncOnce still imports pending sessions even when the fingerprint was already observed", async () => {
        const runRemoteDeltaSyncOnce = (
            SRPlugin.prototype as unknown as {
                runRemoteDeltaSyncOnce: Function;
            }
        ).runRemoteDeltaSyncOnce;

        const plugin = {
            shouldEnableRemoteDeltaPolling: jest.fn(() => true),
            syncLock: false,
            noteReviewRefreshLock: false,
            remoteDeltaFingerprint: "same",
            captureRemoteDeltaFingerprint: jest.fn(async () => "same"),
            logRuntimeDebug: jest.fn(),
            data: {
                settings: {
                    showRuntimeDebugMessages: false,
                },
            },
            syroSessionManager: {
                peekPendingSessions: jest.fn(async () => ({
                    pendingSessionIds: ["2026-04-14T04-37-41__dfdd__0001"],
                    impact: "runtime-only",
                })),
            },
            requestSync: jest.fn(async () => ({ status: "executed" })),
            importPendingSyroSessions: jest.fn(async () => ({
                importedSessionIds: ["2026-04-14T04-37-41__dfdd__0001"],
                deletedSessionIds: [],
                archivedSessionIds: [],
                replayImpact: {
                    ...createEmptySyroSessionReplaySummary(),
                    cardsRuntimeChanged: true,
                },
            })),
            applyLightweightSessionDelta: jest.fn(async () => "applied"),
            updateRemoteDeltaFingerprint: jest.fn(async () => undefined),
        };

        await runRemoteDeltaSyncOnce.call(plugin, "interval");

        expect(plugin.syroSessionManager.peekPendingSessions).toHaveBeenCalledTimes(1);
        expect(plugin.importPendingSyroSessions).toHaveBeenCalledWith({
            sealOwnOpenSession: false,
        });
        expect(plugin.applyLightweightSessionDelta).toHaveBeenCalledTimes(1);
    });

    test("runRemoteDeltaSyncOnce escalates structural remote sessions to the heavy sync path", async () => {
        const runRemoteDeltaSyncOnce = (
            SRPlugin.prototype as unknown as {
                runRemoteDeltaSyncOnce: Function;
            }
        ).runRemoteDeltaSyncOnce;

        const plugin = {
            shouldEnableRemoteDeltaPolling: jest.fn(() => true),
            syncLock: false,
            noteReviewRefreshLock: false,
            remoteDeltaFingerprint: "old",
            captureRemoteDeltaFingerprint: jest.fn(async () => "new"),
            logRuntimeDebug: jest.fn(),
            syroSessionManager: {
                peekPendingSessions: jest.fn(async () => ({
                    pendingSessionIds: ["2026-04-14T00-00-00__91ac__0001"],
                    impact: "requires-global-sync",
                })),
            },
            requestSync: jest.fn(async () => ({ status: "executed" })),
            importPendingSyroSessions: jest.fn(async () => null),
            applyLightweightSessionDelta: jest.fn(async () => "noop"),
            updateRemoteDeltaFingerprint: jest.fn(async () => undefined),
        };

        await runRemoteDeltaSyncOnce.call(plugin, "interval");

        expect(plugin.requestSync).toHaveBeenCalledWith({
            trigger: "remote-poll",
            force: true,
        });
        expect(plugin.importPendingSyroSessions).not.toHaveBeenCalled();
        expect(plugin.updateRemoteDeltaFingerprint).toHaveBeenCalledTimes(1);
    });

    test("runRemoteDeltaSyncOnce imports runtime-only sessions without forcing a full sync", async () => {
        const runRemoteDeltaSyncOnce = (
            SRPlugin.prototype as unknown as {
                runRemoteDeltaSyncOnce: Function;
            }
        ).runRemoteDeltaSyncOnce;

        const plugin = {
            shouldEnableRemoteDeltaPolling: jest.fn(() => true),
            syncLock: false,
            noteReviewRefreshLock: false,
            remoteDeltaFingerprint: "old",
            captureRemoteDeltaFingerprint: jest.fn(async () => "new"),
            logRuntimeDebug: jest.fn(),
            data: {
                settings: {
                    showRuntimeDebugMessages: false,
                },
            },
            syroSessionManager: {
                peekPendingSessions: jest.fn(async () => ({
                    pendingSessionIds: ["2026-04-14T00-00-00__91ac__0001"],
                    impact: "runtime-only",
                })),
            },
            requestSync: jest.fn(async () => ({ status: "executed" })),
            importPendingSyroSessions: jest.fn(async () => ({
                importedSessionIds: ["2026-04-14T00-00-00__91ac__0001"],
                deletedSessionIds: [],
                archivedSessionIds: [],
                replayImpact: {
                    ...createEmptySyroSessionReplaySummary(),
                    cardsRuntimeChanged: true,
                },
            })),
            applyLightweightSessionDelta: jest.fn(async () => "applied"),
            updateRemoteDeltaFingerprint: jest.fn(async () => undefined),
        };

        await runRemoteDeltaSyncOnce.call(plugin, "interval");

        expect(plugin.importPendingSyroSessions).toHaveBeenCalledWith({
            sealOwnOpenSession: false,
        });
        expect(plugin.applyLightweightSessionDelta).toHaveBeenCalledTimes(1);
        expect(plugin.requestSync).not.toHaveBeenCalled();
        expect(plugin.updateRemoteDeltaFingerprint).toHaveBeenCalledTimes(1);
    });

    test("applyLightweightSessionDelta escalates when deck runtime rebind fails", async () => {
        const applyLightweightSessionDelta = (
            SRPlugin.prototype as unknown as {
                applyLightweightSessionDelta: Function;
            }
        ).applyLightweightSessionDelta;

        const plugin = {
            requestSync: jest.fn(async () => ({ status: "executed" })),
            rebindDeckTreeRuntimeBindings: jest.fn(() => false),
            refreshCurrentDeckRuntimeState: jest.fn(),
            refreshNoteReview: jest.fn(async () => undefined),
            syncEvents: {
                emit: jest.fn(),
            },
            lastSyncReviewMode: FlashcardReviewMode.Review,
        };

        const result = await applyLightweightSessionDelta.call(plugin, {
            importedSessionIds: ["2026-04-14T00-00-00__91ac__0001"],
            deletedSessionIds: [],
            archivedSessionIds: [],
            replayImpact: {
                ...createEmptySyroSessionReplaySummary(),
                cardsRuntimeChanged: true,
            },
        });

        expect(result).toBe("escalated");
        expect(plugin.requestSync).toHaveBeenCalledWith({
            trigger: "remote-poll",
            force: true,
        });
        expect(plugin.syncEvents.emit).not.toHaveBeenCalled();
    });

    test("applyLightweightSessionDelta refreshes runtime views for note-review deltas", async () => {
        const applyLightweightSessionDelta = (
            SRPlugin.prototype as unknown as {
                applyLightweightSessionDelta: Function;
            }
        ).applyLightweightSessionDelta;

        const plugin = {
            requestSync: jest.fn(async () => ({ status: "executed" })),
            rebindDeckTreeRuntimeBindings: jest.fn(() => true),
            refreshCurrentDeckRuntimeState: jest.fn(),
            refreshNoteReview: jest.fn(async () => undefined),
            syncEvents: {
                emit: jest.fn(),
            },
            lastSyncReviewMode: FlashcardReviewMode.Review,
        };

        const result = await applyLightweightSessionDelta.call(plugin, {
            importedSessionIds: ["2026-04-14T00-00-00__91ac__0001"],
            deletedSessionIds: [],
            archivedSessionIds: [],
            replayImpact: {
                ...createEmptySyroSessionReplaySummary(),
                noteReviewChanged: true,
                dailyStateChanged: true,
            },
        });

        expect(result).toBe("applied");
        expect(plugin.refreshNoteReview).toHaveBeenCalledWith({
            trigger: "remote-poll",
        });
        expect(plugin.syncEvents.emit).toHaveBeenCalledWith("sync-complete");
        expect(plugin.requestSync).not.toHaveBeenCalled();
    });
});
