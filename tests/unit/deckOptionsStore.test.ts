import {
    applyDeckOptionsStateToSettings,
    createPersistableSettingsSnapshot,
    DeckOptionsStore,
} from "src/dataStore/deckOptionsStore";
import { Iadapter } from "src/dataStore/adapter";
import { DEFAULT_SETTINGS } from "src/settings";

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
                    {
                        ...DEFAULT_SETTINGS.deckOptionsPresets[0],
                        fsrs: {
                            ...DEFAULT_SETTINGS.deckOptionsPresets[0].fsrs,
                            enable_fuzz: false,
                        },
                    },
                    {
                        ...DEFAULT_SETTINGS.deckOptionsPresets[0],
                        name: "Reading",
                        maxNewCards: 7,
                        fsrs: {
                            ...DEFAULT_SETTINGS.deckOptionsPresets[0].fsrs,
                            enable_fuzz: false,
                        },
                    },
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
        expect(settings.deckOptionsPresets[1].name).toBe("Reading");
        expect(settings.deckPresetAssignment).toEqual({ Reading: 1 });
    });

    it("creates deck-options.json from current settings when the file is missing", async () => {
        const settings = cloneSettings();
        settings.fsrsSettings.enable_fuzz = false;
        settings.deckOptionsPresets = [
            {
                ...DEFAULT_SETTINGS.deckOptionsPresets[0],
                fsrs: {
                    ...DEFAULT_SETTINGS.deckOptionsPresets[0].fsrs,
                    enable_fuzz: false,
                },
            },
            {
                ...DEFAULT_SETTINGS.deckOptionsPresets[0],
                name: "Sprint",
                maxReviews: 33,
                fsrs: {
                    ...DEFAULT_SETTINGS.deckOptionsPresets[0].fsrs,
                    enable_fuzz: false,
                },
            },
        ];
        settings.deckPresetAssignment = {
            Sprint: 1,
        };

        const store = new DeckOptionsStore(
            ".obsidian/plugins/syro/devices/Desktop--d84f/deck-options.json",
        );
        await store.loadIntoSettings(settings);

        const saved = JSON.parse(
            files.get(".obsidian/plugins/syro/devices/Desktop--d84f/deck-options.json") ??
                "{}",
        );
        expect(saved.fsrsSettings.enable_fuzz).toBe(false);
        expect(saved.deckOptionsPresets[1].name).toBe("Sprint");
        expect(saved.deckPresetAssignment).toEqual({ Sprint: 1 });
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
                    ...DEFAULT_SETTINGS.deckOptionsPresets[0],
                    name: "Focused",
                    fsrs: {
                        ...DEFAULT_SETTINGS.deckOptionsPresets[0].fsrs,
                        enable_fuzz: false,
                    },
                },
            ],
            deckPresetAssignment: {
                Focused: 1,
                Default: 0,
            },
        });

        expect(settings.fsrsSettings.enable_fuzz).toBe(false);
        expect(settings.deckPresetAssignment).toEqual({ Focused: 1 });
    });
});
