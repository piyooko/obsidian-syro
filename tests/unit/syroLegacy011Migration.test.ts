import { DEFAULT_SETTINGS } from "src/settings";
import {
    cleanupLegacy011ArchivedFiles,
    listLegacy011SourceFiles,
    migrateLegacy011PluginState,
    migrateLegacy011WorkspaceFiles,
} from "src/dataStore/syroLegacy011Migration";

type MockAdapter = {
    exists: jest.Mock<Promise<boolean>, [string]>;
    mkdir: jest.Mock<Promise<void>, [string]>;
    read: jest.Mock<Promise<string>, [string]>;
    remove: jest.Mock<Promise<void>, [string]>;
    rmdir: jest.Mock<Promise<void>, [string, boolean]>;
    write: jest.Mock<Promise<void>, [string, string]>;
};

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/g, "");
}

function createMockAdapter() {
    const files = new Map<string, string>();
    const directories = new Set<string>([
        ".obsidian",
        ".obsidian/plugins",
        ".obsidian/plugins/syro",
    ]);

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

    const adapter: MockAdapter = {
        exists: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            return files.has(normalized) || directories.has(normalized);
        }),
        mkdir: jest.fn(async (path: string) => {
            directories.add(normalizePath(path));
        }),
        read: jest.fn(async (path: string) => files.get(normalizePath(path)) ?? ""),
        remove: jest.fn(async (path: string) => {
            files.delete(normalizePath(path));
        }),
        rmdir: jest.fn(async (path: string, recursive: boolean) => {
            const normalized = normalizePath(path);
            if (recursive) {
                for (const key of Array.from(files.keys())) {
                    if (key === normalized || key.startsWith(`${normalized}/`)) {
                        files.delete(key);
                    }
                }
                for (const entry of Array.from(directories)) {
                    if (entry === normalized || entry.startsWith(`${normalized}/`)) {
                        directories.delete(entry);
                    }
                }
                return;
            }

            const hasNestedFiles = Array.from(files.keys()).some((key) =>
                key.startsWith(`${normalized}/`),
            );
            const hasNestedDirs = Array.from(directories).some(
                (entry) => entry !== normalized && entry.startsWith(`${normalized}/`),
            );
            if (hasNestedFiles || hasNestedDirs) {
                throw new Error("Directory is not empty.");
            }
            directories.delete(normalized);
        }),
        write: jest.fn(async (path: string, value: string) => {
            const normalized = normalizePath(path);
            ensureParentDirectories(normalized);
            files.set(normalized, value);
        }),
    };

    return { adapter, files, directories };
}

function createLayout(): any {
    return {
        syncRoot: ".obsidian/plugins/syro",
        devicesRoot: ".obsidian/plugins/syro/devices",
        sessionsRoot: ".obsidian/plugins/syro/sessions",
        deviceRoot: ".obsidian/plugins/syro/devices/Desktop--d84f",
        deviceMetaPath: ".obsidian/plugins/syro/devices/Desktop--d84f/device.json",
        cardsPath: ".obsidian/plugins/syro/devices/Desktop--d84f/cards.json",
        notesPath: ".obsidian/plugins/syro/devices/Desktop--d84f/notes.json",
        timelinePath: ".obsidian/plugins/syro/devices/Desktop--d84f/timeline.json",
        deckOptionsPath: ".obsidian/plugins/syro/devices/Desktop--d84f/deck-options.json",
        fileIdentitiesPath: ".obsidian/plugins/syro/devices/Desktop--d84f/file-identities.json",
        settingsPath: ".obsidian/plugins/syro/devices/Desktop--d84f/settings.json",
        trackingRulesPath: ".obsidian/plugins/syro/devices/Desktop--d84f/tracking-rules.json",
        dailyStatePath: ".obsidian/plugins/syro/devices/Desktop--d84f/daily-state.json",
        deviceStatePath: ".obsidian/plugins/syro/devices/Desktop--d84f/device-state.json",
        licenseStatePath: ".obsidian/plugins/syro/devices/Desktop--d84f/license-state.json",
        pendingOverlayPath: ".obsidian/plugins/syro/devices/Desktop--d84f/pending.overlay.json",
        currentDeviceSessionsRoot: ".obsidian/plugins/syro/sessions/Desktop--d84f",
        currentDeviceSessionFilePath:
            ".obsidian/plugins/syro/sessions/Desktop--d84f/2026-04-19.session.jsonl",
        noteCachePath: ".obsidian/plugins/syro/devices/Desktop--d84f/note-cache.json",
        device: {
            version: 1,
            deviceId: "d84f1111-2222-3333-4444-555555555555",
            deviceName: "Desktop",
            shortDeviceId: "d84f",
            createdAt: "2026-04-19T00:00:00.000Z",
            updatedAt: "2026-04-19T00:00:00.000Z",
            lastSeenAt: "2026-04-19T00:00:00.000Z",
            ownerInstallIdHash: null,
            baselineFromDeviceId: null,
            baselineBuiltAt: null,
        },
    };
}

describe("syroLegacy011Migration source discovery", () => {
    test("lists the full legacy source set including compatibility inputs", async () => {
        const { adapter, files } = createMockAdapter();
        const layout = createLayout();
        files.set(".obsidian/plugins/syro/data.json", '{"settings":{"openRandomNote":true}}');
        files.set(".obsidian/plugins/syro/tracked_files.json", '{"items":[]}');
        files.set(
            ".obsidian/plugins/syro/review_notes.json",
            '{"version":1,"nextItemId":1,"items":{}}',
        );
        files.set(".obsidian/plugins/syro/review_commits.json", '{"note.md":[{"id":"1"}]}');
        files.set(
            ".obsidian/plugins/syro/tracked_files.review_overlay.json",
            '{"items":[{"id":1}]}',
        );
        files.set(".obsidian/plugins/syro/note_cache.json", '{"version":3,"items":[]}');
        files.set(".obsidian/plugins/syro/ob_revlog.csv", "date,grade\n");
        files.set(
            ".obsidian/plugins/syro/devices/Desktop--d84f/sync-merge-state.json",
            '{"version":1}',
        );
        files.set(
            ".obsidian/plugins/syro/local-state/cards.review_overlay.json",
            '{"items":[{"id":"compat"}]}',
        );

        const result = await listLegacy011SourceFiles({
            adapter,
            manifestDir: ".obsidian/plugins/syro",
            settings: DEFAULT_SETTINGS,
            layout,
        });

        expect(result.presentEntries.map((entry) => entry.name)).toEqual(
            expect.arrayContaining([
                "data.json",
                "tracked_files.json",
                "review_notes.json",
                "review_commits.json",
                "tracked_files.review_overlay.json",
                "note_cache.json",
                "ob_revlog.csv",
                "sync-merge-state.json",
                "local-state/cards.review_overlay.json",
            ]),
        );
        expect(
            result.legacyEntries.find((entry) => entry.name === "data.json")?.isLegacyPluginData,
        ).toBe(true);
    });

    test("does not treat a migrated 0.0.12 shell as a legacy input", async () => {
        const { adapter, files } = createMockAdapter();
        files.set(
            ".obsidian/plugins/syro/data.json",
            JSON.stringify({
                version: 2,
                schemaVersion: "0.0.12",
                migrations: {
                    syro012: {
                        completedAt: "2026-04-14T06:00:00.000Z",
                        sourceVersion: "0.0.11",
                    },
                },
            }),
        );

        const result = await listLegacy011SourceFiles({
            adapter,
            manifestDir: ".obsidian/plugins/syro",
            settings: DEFAULT_SETTINGS,
        });

        expect(result.presentEntries.map((entry) => entry.name)).toContain("data.json");
        expect(result.legacyEntries.map((entry) => entry.name)).not.toContain("data.json");
    });

    test("treats malformed data.json as a legacy input", async () => {
        const { adapter, files } = createMockAdapter();
        files.set(".obsidian/plugins/syro/data.json", "{broken");

        const result = await listLegacy011SourceFiles({
            adapter,
            manifestDir: ".obsidian/plugins/syro",
            settings: DEFAULT_SETTINGS,
        });

        expect(result.legacyEntries.map((entry) => entry.name)).toContain("data.json");
    });

    test("returns only partial legacy inputs when other files are missing", async () => {
        const { adapter, files } = createMockAdapter();
        files.set(
            ".obsidian/plugins/syro/review_notes.json",
            '{"version":1,"nextItemId":1,"items":{}}',
        );

        const result = await listLegacy011SourceFiles({
            adapter,
            manifestDir: ".obsidian/plugins/syro",
            settings: DEFAULT_SETTINGS,
        });

        expect(result.legacyEntries.map((entry) => entry.name)).toEqual(["review_notes.json"]);
    });
});

describe("syroLegacy011Migration workspace migration", () => {
    test("copies wrapped timeline payloads and tolerates missing overlay and note cache", async () => {
        const { adapter, files } = createMockAdapter();
        const layout = createLayout();
        files.set(".obsidian/plugins/syro/data.json", '{"settings":{"openRandomNote":true}}');
        files.set(".obsidian/plugins/syro/tracked_files.json", '{"items":[]}');
        files.set(
            ".obsidian/plugins/syro/review_notes.json",
            '{"version":1,"nextItemId":1,"items":{}}',
        );
        files.set(
            ".obsidian/plugins/syro/review_commits.json",
            '{"version":1,"files":{"note.md":[{"id":"1"}]},"syncEntities":{}}',
        );

        const result = await migrateLegacy011WorkspaceFiles({
            adapter,
            manifestDir: ".obsidian/plugins/syro",
            settings: DEFAULT_SETTINGS,
            layout,
            deviceNameAtMigration: layout.device.deviceName,
            now: () => "2026-04-19T10:00:00.000Z",
        });

        expect(files.get(normalizePath(layout.timelinePath))).toBe(
            '{"version":1,"files":{"note.md":[{"id":"1"}]},"syncEntities":{}}',
        );
        expect(result.overlayMigration.migrated).toBe(false);
        expect(files.has(normalizePath(layout.noteCachePath))).toBe(false);
    });
});

describe("syroLegacy011Migration archived cleanup", () => {
    test("removes archived legacy root files after the shell has migrated", async () => {
        const { adapter, files, directories } = createMockAdapter();
        const layout = createLayout();
        files.set(
            ".obsidian/plugins/syro/data.json",
            JSON.stringify({
                version: 2,
                schemaVersion: "0.0.12",
                migrations: {
                    syro012: {
                        completedAt: "2026-04-19T10:03:54.288Z",
                        sourceVersion: "0.0.11",
                    },
                },
            }),
        );
        files.set(".obsidian/plugins/syro/tracked_files.json", '{"items":[]}');
        files.set(
            ".obsidian/plugins/syro/review_notes.json",
            '{"version":1,"nextItemId":1,"items":{}}',
        );
        files.set(".obsidian/plugins/syro/review_commits.json", '{"note.md":[{"id":"1"}]}');
        files.set(".obsidian/plugins/syro/note_cache.json", '{"version":3,"items":[]}');
        files.set(".obsidian/plugins/syro/ob_revlog.csv", "date,grade\n");
        files.set(
            ".obsidian/plugins/syro/local-state/cards.review_overlay.json",
            '{"items":[{"id":"compat"}]}',
        );
        directories.add(".obsidian/plugins/syro/migration-backups");
        directories.add(".obsidian/plugins/syro/local-state");

        const result = await cleanupLegacy011ArchivedFiles({
            adapter,
            manifestDir: ".obsidian/plugins/syro",
            settings: DEFAULT_SETTINGS,
            layout,
        });

        expect(result.skipped).toBe(false);
        expect(files.has(".obsidian/plugins/syro/tracked_files.json")).toBe(false);
        expect(files.has(".obsidian/plugins/syro/review_notes.json")).toBe(false);
        expect(files.has(".obsidian/plugins/syro/review_commits.json")).toBe(false);
        expect(files.has(".obsidian/plugins/syro/note_cache.json")).toBe(false);
        expect(files.has(".obsidian/plugins/syro/ob_revlog.csv")).toBe(false);
        expect(files.has(".obsidian/plugins/syro/local-state/cards.review_overlay.json")).toBe(
            false,
        );
        expect(files.has(".obsidian/plugins/syro/data.json")).toBe(true);
        expect(result.removedFiles).toEqual(
            expect.arrayContaining([
                ".obsidian/plugins/syro/tracked_files.json",
                ".obsidian/plugins/syro/review_notes.json",
                ".obsidian/plugins/syro/review_commits.json",
                ".obsidian/plugins/syro/note_cache.json",
                ".obsidian/plugins/syro/ob_revlog.csv",
                ".obsidian/plugins/syro/local-state/cards.review_overlay.json",
            ]),
        );
    });

    test("skips cleanup until the shell has migrated and an archive exists", async () => {
        const { adapter, files } = createMockAdapter();
        const layout = createLayout();
        files.set(".obsidian/plugins/syro/data.json", '{"settings":{"openRandomNote":true}}');
        files.set(".obsidian/plugins/syro/tracked_files.json", '{"items":[]}');

        const result = await cleanupLegacy011ArchivedFiles({
            adapter,
            manifestDir: ".obsidian/plugins/syro",
            settings: DEFAULT_SETTINGS,
            layout,
        });

        expect(result).toEqual(
            expect.objectContaining({
                skipped: true,
                skippedBecause: "archive-missing",
                removedFiles: [],
            }),
        );
        expect(files.has(".obsidian/plugins/syro/tracked_files.json")).toBe(true);
    });
});

describe("syroLegacy011Migration split-state routing", () => {
    test("routes 0.0.11 timeline settings into shared and device-local stores", async () => {
        const sharedSettingsStore = { save: jest.fn(async () => undefined) };
        const trackingRulesStore = { save: jest.fn(async () => undefined) };
        const dailyStateStore = { save: jest.fn(async () => undefined) };
        const deviceStateStore = { save: jest.fn(async () => undefined) };
        const licenseStateStore = { save: jest.fn(async () => undefined) };
        const saveDataShell = jest.fn(async () => undefined);
        const settings = {
            ...DEFAULT_SETTINGS,
            timelineAllowUntrackedNotes: true,
            timelineAutoFollowReviewCards: true,
            timelineAutoCommitReviewSelection: false,
            timelineEnableDurationPrefixSyntax: false,
            sidebarTimelineHeight: 444,
            sidebarTimelineOpen: true,
            sidebarTimelineSelectedPath: "folder/note.md",
        };

        const result = await migrateLegacy011PluginState({
            rawData: {},
            data: {
                settings,
                buryDate: "",
                buryList: [],
                historyDeck: "Desktop/Deck",
                dailyDeckStats: {
                    date: "",
                    counts: {},
                },
                folderTrackingRules: {},
            },
            sharedSettingsStore,
            trackingRulesStore,
            dailyStateStore,
            deviceStateStore,
            licenseStateStore,
            buildDailyStateSnapshot: () => ({
                version: 1,
                buryDate: "",
                buryList: [],
                dailyDeckStats: {
                    date: "",
                    counts: {},
                },
                deviceReviewCount: 0,
                appliedOpIds: {},
            }),
            buildCurrentDeviceState: () => ({
                version: 1,
                settings: {
                    sidebarTimelineHeight: 444,
                    sidebarTimelineOpen: true,
                    sidebarTimelineSelectedPath: "folder/note.md",
                },
                historyDeck: "Desktop/Deck",
                deckOptionsProtocolVersion: 1,
            }),
            validateSplitState: async () => null,
            saveDataShell,
            now: () => "2026-04-19T10:01:00.000Z",
        });

        expect(result).toEqual({
            skipped: false,
            skippedBecause: null,
            wroteSplitState: true,
            wroteShellMarker: true,
            validationError: null,
            completedAt: "2026-04-19T10:01:00.000Z",
        });
        expect(sharedSettingsStore.save).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: expect.objectContaining({
                    timelineAllowUntrackedNotes: true,
                    timelineAutoFollowReviewCards: true,
                    timelineAutoCommitReviewSelection: false,
                    timelineEnableDurationPrefixSyntax: false,
                }),
            }),
        );
        const persistedSharedState = (sharedSettingsStore.save as jest.Mock).mock.calls[0]?.[0] as {
            settings: Record<string, unknown>;
        };
        expect(persistedSharedState.settings).not.toHaveProperty("sidebarTimelineHeight");
        expect(deviceStateStore.save).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: expect.objectContaining({
                    sidebarTimelineHeight: 444,
                    sidebarTimelineOpen: true,
                    sidebarTimelineSelectedPath: "folder/note.md",
                }),
                historyDeck: "Desktop/Deck",
            }),
        );
        expect(saveDataShell).toHaveBeenCalledWith("2026-04-19T10:01:00.000Z");
    });

    test("skips the shell marker when split-state validation fails", async () => {
        const sharedSettingsStore = { save: jest.fn(async () => undefined) };
        const trackingRulesStore = { save: jest.fn(async () => undefined) };
        const dailyStateStore = { save: jest.fn(async () => undefined) };
        const deviceStateStore = { save: jest.fn(async () => undefined) };
        const licenseStateStore = { save: jest.fn(async () => undefined) };
        const saveDataShell = jest.fn(async () => undefined);

        const result = await migrateLegacy011PluginState({
            rawData: {},
            data: {
                settings: DEFAULT_SETTINGS,
                buryDate: "",
                buryList: [],
                historyDeck: null,
                dailyDeckStats: {
                    date: "",
                    counts: {},
                },
                folderTrackingRules: {},
            },
            sharedSettingsStore,
            trackingRulesStore,
            dailyStateStore,
            deviceStateStore,
            licenseStateStore,
            buildDailyStateSnapshot: () => ({
                version: 1,
                buryDate: "",
                buryList: [],
                dailyDeckStats: {
                    date: "",
                    counts: {},
                },
                deviceReviewCount: 0,
                appliedOpIds: {},
            }),
            buildCurrentDeviceState: () => ({
                version: 1,
                settings: {},
                historyDeck: null,
                deckOptionsProtocolVersion: 1,
            }),
            validateSplitState: async () => "[SR-Syro] Invalid settings.json schema.",
            saveDataShell,
        });

        expect(result).toEqual({
            skipped: false,
            skippedBecause: null,
            wroteSplitState: true,
            wroteShellMarker: false,
            validationError: "[SR-Syro] Invalid settings.json schema.",
            completedAt: null,
        });
        expect(saveDataShell).not.toHaveBeenCalled();
    });
});
