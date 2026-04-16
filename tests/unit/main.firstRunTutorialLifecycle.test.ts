jest.mock("obsidian");

import { TFile } from "obsidian";
import { DEFAULT_DECKNAME } from "src/constants";
import { getFirstRunTutorial } from "src/firstRunTutorial";
import SRPlugin from "src/main";

describe("SRPlugin first run tutorial lifecycle", () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test("initializeFirstRunTutorialNote returns deferred when stores are not ready", async () => {
        const plugin: any = Object.create(SRPlugin.prototype);
        plugin.noteReviewStore = undefined;
        plugin.noteAlgorithm = {};

        const result = await (SRPlugin.prototype as unknown as {
            initializeFirstRunTutorialNote: () => Promise<string>;
        }).initializeFirstRunTutorialNote.call(plugin);

        expect(result).toBe("deferred");
    });

    test("maybeInitializeFirstRunTutorialNote keeps the pending flag when initialization is deferred", async () => {
        const plugin: any = Object.create(SRPlugin.prototype);
        plugin.pendingFirstRunTutorialInitialization = true;
        plugin.noteReviewStore = undefined;
        plugin.noteAlgorithm = undefined;
        plugin.logRuntimeDebug = jest.fn();

        await (SRPlugin.prototype as unknown as {
            maybeInitializeFirstRunTutorialNote: (trigger: "startup" | "device-change") => Promise<void>;
        }).maybeInitializeFirstRunTutorialNote.call(plugin, "startup");

        expect(plugin.pendingFirstRunTutorialInitialization).toBe(true);
        expect(plugin.logRuntimeDebug).toHaveBeenCalledWith(
            expect.stringContaining("[SR-FirstRunTutorial] Initialization deferred: trigger=startup"),
        );
    });

    test("maybeInitializeFirstRunTutorialNote clears the pending flag after a successful retry", async () => {
        const plugin: any = Object.create(SRPlugin.prototype);
        plugin.pendingFirstRunTutorialInitialization = true;
        plugin.initializeFirstRunTutorialNote = jest.fn(async () => "initialized");

        await (SRPlugin.prototype as unknown as {
            maybeInitializeFirstRunTutorialNote: (trigger: "startup" | "device-change") => Promise<void>;
        }).maybeInitializeFirstRunTutorialNote.call(plugin, "device-change");

        expect(plugin.initializeFirstRunTutorialNote).toHaveBeenCalledTimes(1);
        expect(plugin.pendingFirstRunTutorialInitialization).toBe(false);
    });

    test("maybeInitializeFirstRunTutorialNote warns and continues when initialization fails", async () => {
        const plugin: any = Object.create(SRPlugin.prototype);
        plugin.pendingFirstRunTutorialInitialization = true;
        plugin.initializeFirstRunTutorialNote = jest.fn(async () => "failed");
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

        await expect(
            (SRPlugin.prototype as unknown as {
                maybeInitializeFirstRunTutorialNote: (
                    trigger: "startup" | "device-change",
                ) => Promise<void>;
            }).maybeInitializeFirstRunTutorialNote.call(plugin, "startup"),
        ).resolves.toBeUndefined();

        expect(plugin.pendingFirstRunTutorialInitialization).toBe(true);
        expect(warnSpy).toHaveBeenCalledWith(
            "[SR-FirstRunTutorial] Initialization failed; continuing plugin startup. trigger=startup",
        );
    });

    test("initializeFirstRunTutorialNote reuses an existing tutorial file and refreshes note review state", async () => {
        const tutorial = getFirstRunTutorial("en");
        const tutorialFile = Object.assign(new TFile(), {
            path: tutorial.path,
            extension: "md",
        });
        const buildReviewDecksResult = { deck: { deckName: DEFAULT_DECKNAME } };
        const plugin: any = Object.create(SRPlugin.prototype);
        plugin.noteAlgorithm = { id: "note-algorithm" };
        plugin.noteReviewStore = {
            ensureTracked: jest.fn(),
            save: jest.fn(async () => undefined),
            buildReviewDecks: jest.fn(() => buildReviewDecksResult),
        };
        plugin.app = {
            vault: {
                getAbstractFileByPath: jest.fn(() => tutorialFile),
                create: jest.fn(),
            },
        };
        plugin.updateAndSortDueNotes = jest.fn();
        plugin.syncEvents = { emit: jest.fn() };

        const result = await (SRPlugin.prototype as unknown as {
            initializeFirstRunTutorialNote: () => Promise<string>;
        }).initializeFirstRunTutorialNote.call(plugin);

        expect(result).toBe("initialized");
        expect(plugin.app.vault.create).not.toHaveBeenCalled();
        expect(plugin.noteReviewStore.ensureTracked).toHaveBeenCalledWith(
            tutorialFile.path,
            DEFAULT_DECKNAME,
            "manual",
            plugin.noteAlgorithm,
        );
        expect(plugin.noteReviewStore.save).toHaveBeenCalledTimes(1);
        expect(plugin.reviewDecks).toBe(buildReviewDecksResult);
        expect(plugin.updateAndSortDueNotes).toHaveBeenCalledTimes(1);
        expect(plugin.syncEvents.emit).toHaveBeenCalledWith("note-review-updated");
    });

    test("reloadAfterSyroDeviceChange retries tutorial initialization after stores become ready", async () => {
        const callOrder: string[] = [];
        const plugin: any = Object.create(SRPlugin.prototype);
        plugin.pendingSyroRecoveryContext = { id: "recovery" };
        plugin.pendingSyroDeviceSelectionContext = { id: "selection" };
        plugin.clearSyroReadOnly = jest.fn(() => {
            callOrder.push("clear");
        });
        plugin.loadPluginData = jest.fn(async () => {
            callOrder.push("load");
        });
        plugin.initializeSyroDataBackedRuntimeIfReady = jest.fn(async (trigger) => {
            callOrder.push(`initialize:${trigger}`);
            return true;
        });
        plugin.maybeInitializeFirstRunTutorialNote = jest.fn(async (trigger) => {
            callOrder.push(`tutorial:${trigger}`);
        });
        plugin.refreshNoteReview = jest.fn(async ({ trigger }) => {
            callOrder.push(`refresh:${trigger}`);
        });
        plugin.syncEvents = {
            emit: jest.fn((event: string) => {
                callOrder.push(`emit:${event}`);
            }),
        };

        await (SRPlugin.prototype as unknown as {
            reloadAfterSyroDeviceChange: () => Promise<void>;
        }).reloadAfterSyroDeviceChange.call(plugin);

        expect(plugin.pendingSyroRecoveryContext).toBeNull();
        expect(plugin.pendingSyroDeviceSelectionContext).toBeNull();
        expect(callOrder).toEqual([
            "clear",
            "load",
            "initialize:device-change",
            "tutorial:device-change",
            "refresh:startup",
            "emit:note-review-updated",
            "emit:sync-complete",
        ]);
    });
});
