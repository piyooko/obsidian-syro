import {
    cloneFsrsSettings,
    DEFAULT_SETTINGS,
    DEFAULT_SYNC_PROGRESS_DISPLAY_MODE,
    getDeckOptionsPresetDisplayName,
    parseDeckOptionsStepInput,
    resolveDeckFsrsSettings,
    resolveDeckOptionsPreset,
    SRSettings,
    upgradeSettings,
    updateDeckOptionsPresetStepProxy,
} from "src/settings";
import { t } from "src/lang/helpers";
import { mergeUIStateToSettings, settingsToUIState } from "src/ui/adapters/settingsAdapter";
import { moment } from "obsidian";

describe("sync progress display defaults", () => {
    test("new installs default to full-only progress tips", () => {
        expect(DEFAULT_SETTINGS.syncProgressDisplayMode).toBe(DEFAULT_SYNC_PROGRESS_DISPLAY_MODE);
        expect(DEFAULT_SETTINGS.syncProgressDisplayMode).toBe("full-only");
    });

    test("new installs enable FSRS fuzzing and keep official step defaults", () => {
        expect(DEFAULT_SETTINGS.fsrsSettings.enable_fuzz).toBe(true);
        expect(DEFAULT_SETTINGS.fsrsSettings.learning_steps).toEqual(
            DEFAULT_SETTINGS.deckOptionsPresets[0]?.fsrs?.learning_steps,
        );
        expect(DEFAULT_SETTINGS.fsrsSettings.relearning_steps).toEqual(
            DEFAULT_SETTINGS.deckOptionsPresets[0]?.fsrs?.relearning_steps,
        );
    });

    test("new deck presets enable auto-advance with the progress bar by default", () => {
        expect(DEFAULT_SETTINGS.deckOptionsPresets[0]?.autoAdvance).toBe(true);
        expect(DEFAULT_SETTINGS.deckOptionsPresets[0]?.showProgressBar).toBe(true);
    });

    test("deck option step parser accepts valid values, blanks, and rejects malformed entries", () => {
        expect(parseDeckOptionsStepInput("1m 10m")).toEqual(["1m", "10m"]);
        expect(parseDeckOptionsStepInput("   ")).toEqual([]);
        expect(parseDeckOptionsStepInput("1 10m")).toBeNull();
    });

    test("legacy step proxy keeps the previous valid steps when an edit is malformed", () => {
        const updated = updateDeckOptionsPresetStepProxy(
            {
                ...DEFAULT_SETTINGS.deckOptionsPresets[0],
                learningSteps: "3m 30m",
                lapseSteps: "15m",
                fsrs: {
                    ...cloneFsrsSettings(DEFAULT_SETTINGS.fsrsSettings),
                    learning_steps: ["3m", "30m"],
                    relearning_steps: ["15m"],
                },
            },
            {
                learningSteps: "3m 30",
            },
            DEFAULT_SETTINGS.fsrsSettings,
        );

        expect(updated.learningSteps).toBe("3m 30m");
        expect(updated.fsrs?.learning_steps).toEqual(["3m", "30m"]);
    });

    test("default preset display name follows the current locale for built-in names", () => {
        const previousLocale = moment.locale();

        moment.locale("en");
        expect(
            getDeckOptionsPresetDisplayName(
                {
                    name: "\u9ed8\u8ba4\u65b9\u6848",
                },
                0,
            ),
        ).toBe("Default preset");

        moment.locale("zh-cn");
        expect(
            getDeckOptionsPresetDisplayName(
                {
                    name: "Default preset",
                },
                0,
            ),
        ).toBe("\u9ed8\u8ba4\u65b9\u6848");

        moment.locale(previousLocale);
        expect(
            getDeckOptionsPresetDisplayName(
                {
                    name: "My Preset",
                },
                0,
            ),
        ).toBe("My Preset");
    });

    test("deck preset usage count copy uses proper English singular and plural forms", () => {
        const previousLocale = moment.locale();

        moment.locale("en");
        expect(
            t("DECK_OPTIONS_PRESET_USAGE_COUNT_SINGULAR", {
                presetName: "Default preset",
                count: 1,
            }),
        ).toBe("Default preset (1 deck uses this)");
        expect(
            t("DECK_OPTIONS_PRESET_USAGE_COUNT_PLURAL", {
                presetName: "Default preset",
                count: 2,
            }),
        ).toBe("Default preset (2 decks use this)");

        moment.locale(previousLocale);
    });

    test("upgradeSettings backfills the new default when the setting is missing", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            syncProgressDisplayMode: undefined,
        } as unknown as SRSettings;

        upgradeSettings(settings);

        expect(settings.syncProgressDisplayMode).toBe(DEFAULT_SYNC_PROGRESS_DISPLAY_MODE);
    });

    test("anki cloze conversion stays disabled by default when the setting is missing", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            convertAnkiClozesToClozes: undefined,
        } as unknown as SRSettings;

        upgradeSettings(settings);

        expect(settings.convertAnkiClozesToClozes).toBe(false);
        expect(settingsToUIState(settings).convertAnkiClozesToClozes).toBe(false);
    });

    test("settings UI falls back to the new default when persisted data is missing it", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            syncProgressDisplayMode: undefined,
        } as unknown as SRSettings;

        expect(settingsToUIState(settings).syncProgressDisplayMode).toBe(
            DEFAULT_SYNC_PROGRESS_DISPLAY_MODE,
        );
    });

    test("settings UI keeps progress bar style values when persisted data exists", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            progressBarStyle: {
                color: "#101010",
                warningColor: "#202020",
                height: 9,
                rightToLeft: true,
            },
        } as SRSettings;

        expect(settingsToUIState(settings).progressBarStyle).toEqual(settings.progressBarStyle);
    });

    test("settings UI merges progress bar style changes without dropping untouched fields", () => {
        const merged = mergeUIStateToSettings(DEFAULT_SETTINGS, {
            progressBarStyle: {
                color: "#abcdef",
                warningColor: DEFAULT_SETTINGS.progressBarStyle.warningColor,
                height: DEFAULT_SETTINGS.progressBarStyle.height,
                rightToLeft: DEFAULT_SETTINGS.progressBarStyle.rightToLeft,
            },
        });

        expect(merged.progressBarStyle.color).toBe("#abcdef");
        expect(merged.progressBarStyle.warningColor).toBe(
            DEFAULT_SETTINGS.progressBarStyle.warningColor,
        );
        expect(merged.progressBarStyle.height).toBe(DEFAULT_SETTINGS.progressBarStyle.height);
        expect(merged.progressBarStyle.rightToLeft).toBe(
            DEFAULT_SETTINGS.progressBarStyle.rightToLeft,
        );
    });

    test("settings UI fans out the fuzz toggle to every preset and keeps the mirror aligned", () => {
        const alternateFsrs = {
            ...cloneFsrsSettings(DEFAULT_SETTINGS.fsrsSettings),
            enable_fuzz: false,
        };
        const settings = {
            ...DEFAULT_SETTINGS,
            fsrsSettings: alternateFsrs,
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
                    name: "Preset 2",
                    fsrs: {
                        ...DEFAULT_SETTINGS.deckOptionsPresets[0].fsrs,
                        enable_fuzz: false,
                    },
                },
            ],
        } as SRSettings;

        const merged = mergeUIStateToSettings(settings, {
            fsrsEnableFuzz: true,
        });

        expect(merged.fsrsSettings.enable_fuzz).toBe(true);
        expect(merged.deckOptionsPresets.every((preset) => preset.fsrs?.enable_fuzz)).toBe(true);
    });

    test("new installs enable sidebar file path tooltips with a 1000ms delay by default", () => {
        expect(DEFAULT_SETTINGS.sidebarFilePathTooltipEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.sidebarFilePathTooltipDelayMs).toBe(1000);
    });

    test("new installs keep auto-following the current note in the sidebar enabled by default", () => {
        expect(DEFAULT_SETTINGS.autoExpandTimeline).toBe(true);
        expect(settingsToUIState(DEFAULT_SETTINGS).autoExpandTimeline).toBe(true);
    });

    test("experimental timeline follow helpers stay disabled by default", () => {
        expect(DEFAULT_SETTINGS.timelineAllowUntrackedNotes).toBe(false);
        expect(DEFAULT_SETTINGS.timelineAutoFollowReviewCards).toBe(false);
        expect(settingsToUIState(DEFAULT_SETTINGS).timelineAllowUntrackedNotes).toBe(false);
        expect(settingsToUIState(DEFAULT_SETTINGS).timelineAutoFollowReviewCards).toBe(false);
    });

    test("settings UI normalizes sidebar file path tooltip delay to a non-negative integer", () => {
        const merged = mergeUIStateToSettings(DEFAULT_SETTINGS, {
            sidebarFilePathTooltipDelayMs: -12.6,
        });

        expect(merged.sidebarFilePathTooltipDelayMs).toBe(0);

        const uiState = settingsToUIState({
            ...DEFAULT_SETTINGS,
            sidebarFilePathTooltipDelayMs: 999.8,
        });
        expect(uiState.sidebarFilePathTooltipDelayMs).toBe(1000);
    });

    test("upgradeSettings silently resets non-current FSRS weights and backfills missing steps", () => {
        const legacyW = [
            0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26,
            0.29, 2.61,
        ];
        const settings = {
            ...DEFAULT_SETTINGS,
            fsrsSettings: {
                ...DEFAULT_SETTINGS.fsrsSettings,
                w: legacyW,
                learning_steps: undefined,
                relearning_steps: undefined,
            },
        } as unknown as SRSettings;

        upgradeSettings(settings);

        expect(settings.fsrsSettings.w).toEqual(DEFAULT_SETTINGS.fsrsSettings.w);
        expect(settings.fsrsSettings.learning_steps).toEqual(
            DEFAULT_SETTINGS.fsrsSettings.learning_steps,
        );
        expect(settings.fsrsSettings.relearning_steps).toEqual(
            DEFAULT_SETTINGS.fsrsSettings.relearning_steps,
        );
    });

    test("preset-level FSRS resolution ignores legacy step strings and uses preset fsrs truth", () => {
        const alphaPreset = {
            ...DEFAULT_SETTINGS.deckOptionsPresets[0],
            uuid: "deck-preset-alpha",
            createdAt: "2026-04-18T00:00:00.000Z",
            name: "Alpha preset",
            learningSteps: "99m",
            lapseSteps: "88m",
            fsrs: {
                ...cloneFsrsSettings(DEFAULT_SETTINGS.fsrsSettings),
                learning_steps: ["2m", "20m"],
                relearning_steps: ["15m"],
            },
        };
        const settings = {
            ...DEFAULT_SETTINGS,
            deckPresetAssignment: {
                alpha: alphaPreset.uuid,
            },
            deckOptionsPresets: [
                DEFAULT_SETTINGS.deckOptionsPresets[0],
                alphaPreset,
            ],
        } as SRSettings;

        const preset = resolveDeckOptionsPreset(settings, "alpha");
        const fsrs = resolveDeckFsrsSettings(settings, "alpha");

        expect(preset.learningSteps).toBe("2m 20m");
        expect(preset.lapseSteps).toBe("15m");
        expect(fsrs.learning_steps).toEqual(["2m", "20m"]);
        expect(fsrs.relearning_steps).toEqual(["15m"]);
    });
});
