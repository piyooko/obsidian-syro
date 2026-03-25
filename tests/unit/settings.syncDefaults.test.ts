import {
    DEFAULT_SETTINGS,
    DEFAULT_SYNC_PROGRESS_DISPLAY_MODE,
    SRSettings,
    upgradeSettings,
} from "src/settings";
import { settingsToUIState } from "src/ui/adapters/settingsAdapter";

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
});
