import {
    DEFAULT_SETTINGS,
    DEFAULT_SYNC_PROGRESS_DISPLAY_MODE,
    SRSettings,
    upgradeSettings,
} from "src/settings";
import { mergeUIStateToSettings, settingsToUIState } from "src/ui/adapters/settingsAdapter";

describe("sync progress display defaults", () => {
    test("new installs default to full-only progress tips", () => {
        expect(DEFAULT_SETTINGS.syncProgressDisplayMode).toBe(DEFAULT_SYNC_PROGRESS_DISPLAY_MODE);
        expect(DEFAULT_SETTINGS.syncProgressDisplayMode).toBe("full-only");
    });

    test("new deck presets enable auto-advance with the progress bar by default", () => {
        expect(DEFAULT_SETTINGS.deckOptionsPresets[0]?.autoAdvance).toBe(true);
        expect(DEFAULT_SETTINGS.deckOptionsPresets[0]?.showProgressBar).toBe(true);
    });

    test("upgradeSettings backfills the new default when the setting is missing", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            syncProgressDisplayMode: undefined,
        } as unknown as SRSettings;

        upgradeSettings(settings);

        expect(settings.syncProgressDisplayMode).toBe(DEFAULT_SYNC_PROGRESS_DISPLAY_MODE);
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
});
