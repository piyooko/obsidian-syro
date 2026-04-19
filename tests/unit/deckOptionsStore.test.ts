import {
    applyDeckOptionsStateToSettings,
    createPersistableSettingsSnapshot,
    DeckOptionsStore,
    diffDeckOptionsState,
    removeDeckOptionsAssignmentPaths,
    removeDeckOptionsPresetFromSettings,
    renameDeckOptionsAssignmentPaths,
} from "src/dataStore/deckOptionsStore";
import { Iadapter } from "src/dataStore/adapter";
import { DEFAULT_DECK_OPTIONS_PRESET_UUID, DEFAULT_SETTINGS } from "src/settings";

interface AdapterSingleton {
    _instance: {
        adapter: {
            exists: (path: string) => Promise<boolean>;
            read: (path: string) => Promise<string>;
            write: (path: string, value: string) => Promise<void>;
        };
    };
}

function cloneSettings() {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function createLegacyPreset(overrides: Record<string, unknown> = {}) {
    const {
        uuid: _uuid,
        createdAt: _createdAt,
        ...preset
    } = DEFAULT_SETTINGS.deckOptionsPresets[0];
    return {
        ...preset,
        ...overrides,
    };
}

describe("deckOptionsStore", () => {
    const files = new Map<string, string>();
    const adapter = {
        exists: jest.fn(async (path: string) => files.has(path)),
        read: jest.fn(async (path: string) => files.get(path) ?? ""),
        write: jest.fn(async (path: string, value: string) => {
            files.set(path, value);
        }),
    };

    beforeEach(() => {
        files.clear();
        jest.clearAllMocks();
        (Iadapter as unknown as AdapterSingleton)._instance = { adapter };
    });

    it("loads deck options state into runtime settings", async () => {
        files.set(
            ".obsidian/plugins/syro/devices/Desktop--d84f/deck-options.json",
            JSON.stringify({
                version: 1,
                fsrsSettings: {
                    ...DEFAULT_SETTINGS.fsrsSettings,
                    enable_fuzz: false,
                },
                deckOptionsPresets: [
                    createLegacyPreset({
                        fsrs: {
                            ...DEFAULT_SETTINGS.deckOptionsPresets[0].fsrs,
                            enable_fuzz: false,
                        },
                    }),
                    createLegacyPreset({
                        name: "Reading",
                        maxNewCards: 7,
                        fsrs: {
                            ...DEFAULT_SETTINGS.deckOptionsPresets[0].fsrs,
                            enable_fuzz: false,
                        },
                    }),
                ],
                deckPresetAssignment: {
                    Reading: 1,
                    Default: 0,
                    Broken: 9,
                },
            }),
        );

        const settings = cloneSettings();
        const store = new DeckOptionsStore(
            ".obsidian/plugins/syro/devices/Desktop--d84f/deck-options.json",
        );

        await store.loadIntoSettings(settings);

        expect(settings.fsrsSettings.enable_fuzz).toBe(false);
        expect(settings.deckOptionsPresets).toHaveLength(2);
        expect(settings.deckOptionsPresets[0].uuid).toBe(DEFAULT_DECK_OPTIONS_PRESET_UUID);
        expect(settings.deckOptionsPresets[1].name).toBe("Reading");
        expect(settings.deckPresetAssignment).toEqual({
            Reading: settings.deckOptionsPresets[1].uuid,
        });
    });

    it("migrates the same legacy deck-options payload to stable preset UUIDs", async () => {
        const legacyPath = ".obsidian/plugins/syro/devices/Desktop--d84f/deck-options.json";
        files.set(
            legacyPath,
            JSON.stringify({
                version: 1,
                fsrsSettings: DEFAULT_SETTINGS.fsrsSettings,
                deckOptionsPresets: [
                    createLegacyPreset(),
                    createLegacyPreset({
                        name: "Reading",
                    }),
                ],
                deckPresetAssignment: {
                    Reading: 1,
                },
            }),
        );

        const firstSettings = cloneSettings();
        const secondSettings = cloneSettings();
        const firstStore = new DeckOptionsStore(legacyPath);
        const secondStore = new DeckOptionsStore(legacyPath);

        await firstStore.loadIntoSettings(firstSettings);
        await secondStore.loadIntoSettings(secondSettings);

        expect(firstSettings.deckOptionsPresets[1].uuid).toBe(
            secondSettings.deckOptionsPresets[1].uuid,
        );
        expect(firstSettings.deckPresetAssignment).toEqual(secondSettings.deckPresetAssignment);
    });

    it("creates deck-options.json from current settings when the file is missing", async () => {
        const settings = cloneSettings();
        const sprintPreset = {
            ...DEFAULT_SETTINGS.deckOptionsPresets[0],
            uuid: "deck-preset-sprint",
            createdAt: "2026-04-18T00:00:00.000Z",
            name: "Sprint",
            maxReviews: 33,
            fsrs: {
                ...DEFAULT_SETTINGS.deckOptionsPresets[0].fsrs,
                enable_fuzz: false,
            },
        };
        settings.fsrsSettings.enable_fuzz = false;
        settings.deckOptionsPresets = [
            {
                ...DEFAULT_SETTINGS.deckOptionsPresets[0],
                fsrs: {
                    ...DEFAULT_SETTINGS.deckOptionsPresets[0].fsrs,
                    enable_fuzz: false,
                },
            },
            sprintPreset,
        ];
        settings.deckPresetAssignment = {
            Sprint: sprintPreset.uuid,
        };

        const store = new DeckOptionsStore(
            ".obsidian/plugins/syro/devices/Desktop--d84f/deck-options.json",
        );
        await store.loadIntoSettings(settings);

        const saved = JSON.parse(
            files.get(".obsidian/plugins/syro/devices/Desktop--d84f/deck-options.json") ?? "{}",
        );
        expect(saved.version).toBe(2);
        expect(saved.fsrsSettings.enable_fuzz).toBe(false);
        expect(saved.deckOptionsPresets[1].name).toBe("Sprint");
        expect(saved.deckPresetAssignment).toEqual({
            Sprint: saved.deckOptionsPresets[1].uuid,
        });
    });

    it("creates a plugin-data snapshot without deck-options fields", () => {
        const settings = cloneSettings();
        const snapshot = createPersistableSettingsSnapshot(settings);

        expect(snapshot.fsrsSettings).toBeUndefined();
        expect(snapshot.deckOptionsPresets).toBeUndefined();
        expect(snapshot.deckPresetAssignment).toBeUndefined();
        expect(snapshot.showStatusBar).toBe(DEFAULT_SETTINGS.showStatusBar);
    });

    it("normalizes loaded state onto a settings object", () => {
        const settings = cloneSettings();
        const focusedPreset = {
            ...createLegacyPreset(),
            uuid: "deck-preset-focused",
            createdAt: "2026-04-18T00:00:00.000Z",
            name: "Focused",
            fsrs: {
                ...DEFAULT_SETTINGS.deckOptionsPresets[0].fsrs,
                enable_fuzz: false,
            },
        };
        applyDeckOptionsStateToSettings(settings, {
            fsrsSettings: {
                ...DEFAULT_SETTINGS.fsrsSettings,
                enable_fuzz: false,
            },
            deckOptionsPresets: [
                {
                    ...DEFAULT_SETTINGS.deckOptionsPresets[0],
                    fsrs: {
                        ...DEFAULT_SETTINGS.deckOptionsPresets[0].fsrs,
                        enable_fuzz: false,
                    },
                },
                {
                    ...focusedPreset,
                },
            ],
            deckPresetAssignment: {
                Focused: focusedPreset.uuid,
                Default: DEFAULT_DECK_OPTIONS_PRESET_UUID,
            },
        });

        expect(settings.fsrsSettings.enable_fuzz).toBe(false);
        expect(settings.deckPresetAssignment).toEqual({
            Focused: settings.deckOptionsPresets[1].uuid,
        });
    });

    it("diffs presets and assignments by preset uuid instead of array position", () => {
        const previousSettings = cloneSettings();
        const nextSettings = cloneSettings();
        const readingPreset = {
            ...DEFAULT_SETTINGS.deckOptionsPresets[0],
            uuid: "deck-preset-reading",
            createdAt: "2026-04-18T00:00:00.000Z",
            name: "Reading",
        };
        const focusPreset = {
            ...DEFAULT_SETTINGS.deckOptionsPresets[0],
            uuid: "deck-preset-focus",
            createdAt: "2026-04-18T00:00:01.000Z",
            name: "Focus",
        };

        previousSettings.deckOptionsPresets = [
            previousSettings.deckOptionsPresets[0],
            readingPreset,
        ];
        previousSettings.deckPresetAssignment = {
            Reading: readingPreset.uuid,
        };

        nextSettings.deckOptionsPresets = [nextSettings.deckOptionsPresets[0], focusPreset];
        nextSettings.deckPresetAssignment = {
            Reading: focusPreset.uuid,
        };

        const diff = diffDeckOptionsState(previousSettings, nextSettings);

        expect(diff.presetUpserts).toEqual([
            expect.objectContaining({
                uuid: focusPreset.uuid,
            }),
        ]);
        expect(diff.presetRemovals).toEqual([{ presetUuid: readingPreset.uuid }]);
        expect(diff.assignmentUpserts).toEqual([
            {
                deckPath: "Reading",
                presetUuid: focusPreset.uuid,
            },
        ]);
        expect(diff.assignmentRemovals).toEqual([]);
    });

    it("removes deleted preset uuid assignments from settings", () => {
        const settings = cloneSettings();
        const readingPreset = {
            ...DEFAULT_SETTINGS.deckOptionsPresets[0],
            uuid: "deck-preset-reading",
            createdAt: "2026-04-18T00:00:00.000Z",
            name: "Reading",
        };

        settings.deckOptionsPresets = [settings.deckOptionsPresets[0], readingPreset];
        settings.deckPresetAssignment = {
            Reading: readingPreset.uuid,
        };

        removeDeckOptionsPresetFromSettings(settings, readingPreset.uuid);

        expect(settings.deckOptionsPresets).toHaveLength(1);
        expect(settings.deckOptionsPresets[0].uuid).toBe(DEFAULT_DECK_OPTIONS_PRESET_UUID);
        expect(settings.deckPresetAssignment).toEqual({});
    });

    it("renames deck assignment paths for direct note renames", () => {
        const result = renameDeckOptionsAssignmentPaths(
            {
                "Archive/Original": "deck-preset-reading",
                "Archive/Other": "deck-preset-focus",
            },
            "Archive/Original.md",
            "Archive/Renamed.md",
        );

        expect(result.deckPresetAssignment).toEqual({
            "Archive/Renamed": "deck-preset-reading",
            "Archive/Other": "deck-preset-focus",
        });
        expect(result.affectedDeckPaths).toEqual(["Archive/Original", "Archive/Renamed"]);
    });

    it("renames nested deck assignment paths for folder renames without overwriting existing targets", () => {
        const result = renameDeckOptionsAssignmentPaths(
            {
                "Archive/Folder/Card One": "deck-preset-reading",
                "Archive/Folder/Card Two": "deck-preset-reading",
                "Archive/Renamed/Card One": "deck-preset-focus",
            },
            "Archive/Folder",
            "Archive/Renamed",
        );

        expect(result.deckPresetAssignment).toEqual({
            "Archive/Renamed/Card One": "deck-preset-focus",
            "Archive/Renamed/Card Two": "deck-preset-reading",
        });
        expect(result.affectedDeckPaths).toEqual([
            "Archive/Folder/Card One",
            "Archive/Folder/Card Two",
            "Archive/Renamed/Card One",
            "Archive/Renamed/Card Two",
        ]);
    });

    it("removes deck assignment paths for deleted notes and folders", () => {
        const result = removeDeckOptionsAssignmentPaths(
            {
                "Archive/Folder/Card One": "deck-preset-reading",
                "Archive/Folder/Sub/Card Two": "deck-preset-focus",
                "Archive/Keep/Card Three": "deck-preset-keep",
            },
            "Archive/Folder",
        );

        expect(result.deckPresetAssignment).toEqual({
            "Archive/Keep/Card Three": "deck-preset-keep",
        });
        expect(result.affectedDeckPaths).toEqual([
            "Archive/Folder/Card One",
            "Archive/Folder/Sub/Card Two",
        ]);
    });

    it("removes deck assignment paths for deleted markdown notes", () => {
        const result = removeDeckOptionsAssignmentPaths(
            {
                "Archive/Folder/Card One": "deck-preset-reading",
                "Archive/Folder/Card Two": "deck-preset-focus",
            },
            "Archive/Folder/Card One.md",
        );

        expect(result.deckPresetAssignment).toEqual({
            "Archive/Folder/Card Two": "deck-preset-focus",
        });
        expect(result.affectedDeckPaths).toEqual(["Archive/Folder/Card One"]);
    });
});
