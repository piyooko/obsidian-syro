import {
    createDefaultDailyState,
    diffTrackingRules,
    diffDailyState,
    extractDeviceState,
    extractSharedSettingsWithMetadata,
    extractTrackingRules,
    parseDailyState,
} from "src/dataStore/syroPluginDataStore";
import { DEFAULT_SETTINGS } from "src/settings";

describe("syroPluginDataStore daily-state device review count", () => {
    test("parseDailyState defaults deviceReviewCount to zero when the field is missing", () => {
        const parsed = parseDailyState({
            version: 1,
            buryDate: "2026-04-15",
            buryList: [],
            dailyDeckStats: {
                date: "2026-04-15",
                counts: {},
            },
            appliedOpIds: {},
        });

        expect(parsed?.deviceReviewCount).toBe(0);
    });

    test("diffDailyState ignores deviceReviewCount-only changes", () => {
        const previous = {
            ...createDefaultDailyState(),
            buryDate: "2026-04-15",
            dailyDeckStats: {
                date: "2026-04-15",
                counts: {},
            },
            deviceReviewCount: 2,
        };
        const next = {
            ...previous,
            deviceReviewCount: 9,
        };

        expect(diffDailyState(previous, next)).toEqual([]);
    });

    test("extractSharedSettingsWithMetadata excludes device-local fields", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            flashcardTags: ["shared"],
            showStatusBar: false,
            reactDeckTreeWidth: 420,
        };

        const sharedState = extractSharedSettingsWithMetadata(settings, {
            flashcardTags: "2026-04-19T10:00:00.000Z",
            showStatusBar: "2026-04-19T10:01:00.000Z",
        });

        expect(sharedState.settings.flashcardTags).toEqual(["shared"]);
        expect(sharedState.settings).not.toHaveProperty("showStatusBar");
        expect(sharedState.settings).not.toHaveProperty("reactDeckTreeWidth");
        expect(sharedState.updatedAtByField).toEqual({
            flashcardTags: "2026-04-19T10:00:00.000Z",
            showStatusBar: "2026-04-19T10:01:00.000Z",
        });
    });

    test("extractDeviceState keeps device-local fields out of shared behavior fields", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            flashcardTags: ["shared"],
            showStatusBar: false,
            reactDeckTreeWidth: 420,
        };

        const deviceState = extractDeviceState({
            settings,
            historyDeck: "Desktop/Deck",
        });

        expect(deviceState.settings.showStatusBar).toBe(false);
        expect(deviceState.settings.reactDeckTreeWidth).toBe(420);
        expect(deviceState.settings).not.toHaveProperty("flashcardTags");
        expect(deviceState.historyDeck).toBe("Desktop/Deck");
    });

    test("diffTrackingRules uses folderPath as the natural key", () => {
        const previous = extractTrackingRules({
            Projects: {
                track: true,
                autoTag: false,
                tags: ["#project"],
                ownedTagsByPath: {},
                excludedPaths: [],
            },
        });
        const next = extractTrackingRules(
            {
                Archive: {
                    track: true,
                    autoTag: true,
                    tags: ["#archive"],
                    ownedTagsByPath: {},
                    excludedPaths: [],
                },
            },
            {
                Archive: "2026-04-19T11:00:00.000Z",
            },
            {
                Projects: {
                    updatedAt: "2026-04-19T11:00:00.000Z",
                },
            },
        );

        expect(diffTrackingRules(previous, next)).toEqual({
            upserts: [
                {
                    folderPath: "Archive",
                    rule: {
                        track: true,
                        autoTag: true,
                        tags: ["#archive"],
                        ownedTagsByPath: {},
                        excludedPaths: [],
                    },
                    updatedAt: "2026-04-19T11:00:00.000Z",
                },
            ],
            removals: [
                {
                    folderPath: "Projects",
                    updatedAt: "2026-04-19T11:00:00.000Z",
                },
            ],
        });
    });
});
