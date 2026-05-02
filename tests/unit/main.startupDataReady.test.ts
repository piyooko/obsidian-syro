jest.mock("obsidian");

import SRPlugin from "src/main";
import { IReviewNote } from "src/reviewNote/review-note";

describe("SRPlugin startup data readiness gates", () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test("initializeSyroDataBackedRuntimeIfReady skips cleanly when Syro stores are not ready", async () => {
        const createSpy = jest.spyOn(IReviewNote, "create");
        const plugin: any = Object.create(SRPlugin.prototype);
        plugin.data = {
            settings: {
                showRuntimeDebugMessages: false,
            },
        };
        plugin.syroLayout = null;
        plugin.store = null;
        plugin.noteReviewStore = null;
        plugin.reviewCommitStore = null;
        plugin.reviewPersistenceCoordinator = null;
        plugin.pendingSyroRecoveryContext = null;
        plugin.pendingSyroDeviceSelectionContext = null;
        plugin.syroReadOnlyReason = null;
        plugin.logRuntimeDebug = jest.fn();

        const result = await (
            SRPlugin.prototype as unknown as {
                initializeSyroDataBackedRuntimeIfReady: (
                    context: "startup" | "layout-ready" | "device-change",
                ) => Promise<boolean>;
            }
        ).initializeSyroDataBackedRuntimeIfReady.call(plugin, "startup");

        expect(result).toBe(false);
        expect(createSpy).not.toHaveBeenCalled();
        expect(plugin.logRuntimeDebug).toHaveBeenCalledWith(
            "[SR-DataReady] skipped data-backed runtime initialization: context=startup",
        );
    });

    test("requestSync returns a skipped not-ready result before entering sync flow", async () => {
        const plugin: any = Object.create(SRPlugin.prototype);
        plugin.guardSyroDataReady = jest.fn(() => false);
        plugin.sync = jest.fn();
        plugin.data = {
            settings: {
                showSchedulingDebugMessages: false,
            },
        };

        const result = await (
            SRPlugin.prototype as unknown as {
                requestSync: (options?: unknown) => Promise<{
                    status: string;
                    reason?: string;
                    trigger: string;
                }>;
            }
        ).requestSync.call(plugin, {
            trigger: "manual",
        });

        expect(result).toMatchObject({
            status: "skipped",
            reason: "not-ready",
            trigger: "manual",
        });
        expect(plugin.sync).not.toHaveBeenCalled();
    });

    test("initReviewQueueView still registers the view but skips activation when Syro data is not ready", async () => {
        const plugin: any = Object.create(SRPlugin.prototype);
        plugin.ensureReviewQueueViewRegistered = jest.fn();
        plugin.guardSyroDataReady = jest.fn(() => false);
        plugin.activateReviewQueueViewPanel = jest.fn();
        plugin.getActiveLeaf = jest.fn(() => null);
        plugin.data = {
            settings: {
                enableNoteReviewPaneOnStartup: true,
            },
        };

        await (
            SRPlugin.prototype as unknown as {
                initReviewQueueView: () => Promise<void>;
            }
        ).initReviewQueueView.call(plugin);

        expect(plugin.ensureReviewQueueViewRegistered).toHaveBeenCalledTimes(1);
        expect(plugin.activateReviewQueueViewPanel).not.toHaveBeenCalled();
    });

    test("openReviewQueueView waits for revealLeaf before refreshing due notes", async () => {
        let resolveReveal!: () => void;
        const revealPromise = new Promise<void>((resolve) => {
            resolveReveal = resolve;
        });
        const reviewQueueLeaf = { id: "review-queue-leaf" };
        const plugin: any = Object.create(SRPlugin.prototype);
        plugin.ensureReviewQueueViewRegistered = jest.fn();
        plugin.guardSyroDataReady = jest.fn(() => true);
        plugin.getActiveLeaf = jest.fn(() => reviewQueueLeaf);
        plugin.activateReviewQueueViewPanel = jest.fn();
        plugin.updateAndSortDueNotes = jest.fn();
        plugin.app = {
            workspace: {
                revealLeaf: jest.fn(() => revealPromise),
            },
        };

        const openReviewQueueView = (
            SRPlugin.prototype as unknown as {
                openReviewQueueView: () => Promise<void>;
            }
        ).openReviewQueueView;

        const pending = openReviewQueueView.call(plugin);

        expect(plugin.ensureReviewQueueViewRegistered).toHaveBeenCalledTimes(1);
        expect(plugin.app.workspace.revealLeaf).toHaveBeenCalledWith(reviewQueueLeaf);
        expect(plugin.updateAndSortDueNotes).not.toHaveBeenCalled();

        resolveReveal();
        await pending;

        expect(plugin.updateAndSortDueNotes).toHaveBeenCalledTimes(1);
    });
});

describe("Review note startup behavior", () => {
    test("IReviewNote.create no longer requires a DataStore singleton during construction", () => {
        expect(() => IReviewNote.create({} as never)).not.toThrow();
    });
});
