/**
 * Central settings model for the plugin.
 * This file defines the persisted settings shape, default values, and migration helpers.
 */












import { Platform } from "obsidian";
import { t } from "src/lang/helpers";

// Legacy migration note retained from the pre-Syro codebase.

import { algorithms } from "./algorithms/algorithms_switch";
import { DataLocation } from "./dataStore/dataLocation";
import { DEFAULT_responseOptionBtnsText } from "./settings/algorithmSetting";
import { pathMatchesPattern } from "src/utils/fs";

// ============ Status Bar Animation ===========
export type StatusBarAnimationStyle = "None" | "Breathing";
export type ClozeContextMode = "single" | "double-break" | "expanded" | "full";
export type ClozeContextPerformanceMode = "off" | "safe-trim";
export type SyncProgressDisplayMode = "always" | "full-only" | "never";

// ============ Deck Option Presets ===========
// Per-preset configuration.
export interface DeckOptionsPreset {
    name: string; // Preset name
    autoAdvance: boolean; // Whether cards auto-advance
    autoAdvanceSeconds: number; // Delay before auto-advance
    showProgressBar: boolean; // Whether to show the countdown progress bar
    maxNewCards: number; // Daily new card limit
    maxReviews: number; // Daily review limit
    learningSteps: string; // Learning steps, e.g. "1m 10m"
    lapseSteps: string; // Relearning steps, e.g. "10m"
}

// Shared progress bar style.
export interface ProgressBarStyle {
    color: string; // Main bar color
    warningColor: string; // Color used near completion
    height: number; // Bar height in px
    rightToLeft: boolean; // Animation direction
}

export const DEFAULT_DECK_OPTIONS_PRESET: DeckOptionsPreset = {
    name: "\u9ed8\u8ba4\u65b9\u6848",
    autoAdvance: false,
    autoAdvanceSeconds: 10,
    showProgressBar: true,
    maxNewCards: 20, // Default daily new card limit
    maxReviews: 200, // Default daily review limit
    learningSteps: "1m 10m", // Default learning steps
    lapseSteps: "10m", // Default relearning steps
};

// Default progress bar style.
export const DEFAULT_PROGRESS_BAR_STYLE: ProgressBarStyle = {
    color: "#7c3aed", // Purple
    warningColor: "#ef4444", // Red
    height: 4,
    rightToLeft: false, // Default left-origin animation
};

export interface SRSettings {
    // flashcards
    responseOptionBtnsText: Record<string, string[]>;

    flashcardTags: string[]; // [Deprecated] Use convertFoldersToDecks instead
    convertFoldersToDecks: boolean;
    burySiblingCards: boolean;
    burySiblingCardsByNoteReview: boolean;
    multiClozeCard: boolean;
    enableNoteCachePersistence: boolean;
    autoIncrementalSync: boolean;
    syncProgressDisplayMode: SyncProgressDisplayMode;
    cardBlockID: boolean;
    randomizeCardOrder: boolean;
    flashcardCardOrder: string;
    flashcardDeckOrder: string;
    convertHighlightsToClozes: boolean;
    convertBoldTextToClozes: boolean;
    convertCurlyBracketsToClozes: boolean;
    convertAnkiClozesToClozes: boolean;
    clozePatterns: string[];
    singleLineCardSeparator: string;
    singleLineReversedCardSeparator: string;
    multilineCardSeparator: string;
    multilineReversedCardSeparator: string;
    multilineCardEndMarker: string;
    parseClozesInCodeBlocks: boolean; // Whether to parse {{c1::...}} cloze syntax in code blocks
    enableLatexPopover: boolean; // Whether to enable the LaTeX cloze popover
    codeContextLines: number; // code context lines
    clozeContextMode: ClozeContextMode;
    clozeContextPerformanceMode: ClozeContextPerformanceMode;
    clozeContextSoftLimitLines: number;
    showOtherClozesVisual: boolean; // [Deprecated] Legacy master switch kept for migration
    showOtherAnkiClozeVisual: boolean; // Show styling for other Anki clozes during review
    showOtherHighlightClozeVisual: boolean; // Show styling for other highlight clozes during review
    showOtherBoldClozeVisual: boolean; // Show styling for other bold clozes during review
    editLaterTag: string;
    intervalShowHide: boolean;
    // notes
    enableNoteReviewPaneOnStartup: boolean;
    tagsToReview: string[];
    noteFoldersToIgnore: string[];
    tagsToIgnore: string[];
    openRandomNote: boolean;
    autoNextNote: boolean;
    mixDue: number;
    mixNew: number;
    mixCardNote: boolean;
    mixCard: number;
    mixNote: number;
    reviewResponseFloatBar: boolean;
    responseBarPositionPercentage: number;
    reviewingNoteDirectly: boolean;
    disableFileMenuReviewOptions: boolean;
    maxNDaysNotesReviewQueue: number;

    // UI preferences
    showRibbonIcon: boolean;
    showStatusBar: boolean;
    collapsedDeckPaths: string[]; // Legacy collapsed deck paths, kept for migration
    deckCollapseState: Record<string, boolean>; // Persisted collapsed state by deck path
    showContextInCards: boolean;
    showIntervalInReviewButtons: boolean;
    flashcardHeightPercentage: number;
    flashcardWidthPercentage: number;
    // React UI Specific
    reactFlashcardWidth: number;
    reactFlashcardHeight: number;
    flashcardEasyText: string;
    flashcardGoodText: string;
    flashcardHardText: string;
    reviewButtonDelay: number;
    openViewInNewTab: boolean; // Deprecated: flashcard review is always opened in a tab.
    enableVolumeKeyControl: boolean;
    volumeUpMapping: number;
    volumeDownMapping: number;
    useReactCardUI: boolean; // Whether to use the React flashcard review UI

    // algorithm
    algorithm: string; // Legacy field retained for backward compatibility
    cardAlgorithm: string; // Flashcard review algorithm
    noteAlgorithm: string; // Note review algorithm
    baseEase: number;
    lapsesIntervalChange: number;
    easyBonus: number;
    loadBalance: boolean;
    maximumInterval: number;
    maxLinkFactor: number;

    // storage
    dataStore: string;
    cardCommentOnSameLine: boolean;

    // logging
    showSchedulingDebugMessages: boolean;
    showParserDebugMessages: boolean;
    showRuntimeDebugMessages: boolean;

    // Track-file settings preserved for legacy migration support.
    dataLocation: DataLocation;
    customFolder: string;
    maxNewPerDay: number;
    repeatItems: boolean;
    trackedNoteToDecks: boolean;
    untrackWithReviewTag: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    algorithmSettings: any;

    // Deck option presets
    deckOptionsPresets: DeckOptionsPreset[]; // All presets, where index 0 is the default preset
    deckPresetAssignment: Record<string, number>; // Deck path -> preset index
    progressBarStyle: ProgressBarStyle; // Shared progress bar styling

    // Daily rollover settings
    rolloverHour: number; // Hour that starts a new day, defaulting to 4 AM

    // Learning queue settings
    learnAheadMinutes: number; // Learn-ahead window in minutes

    // Sidebar tag settings
    sidebarIgnoredTags: string[]; // Ignored tags
    sidebarTagSortMode: "a-z" | "frequency" | "custom"; // Sidebar tag sorting mode
    sidebarCustomTagOrder: string[]; // User-defined tag order
    sidebarFilterBarHeight: number; // Filter bar height in px
    hideNoteReviewSidebarFilters: boolean; // Whether to hide the sidebar filter header

    // Status bar styling
    noteStatusBarColor: string; // Note due status bar color
    noteStatusBarAnimation: StatusBarAnimationStyle; // Note status bar animation
    noteStatusBarPeriod: number; // Note status bar animation period in seconds
    flashcardStatusBarColor: string; // Flashcard due status bar color
    flashcardStatusBarAnimation: StatusBarAnimationStyle; // Flashcard status bar animation
    flashcardStatusBarPeriod: number; // Flashcard status bar animation period in seconds
    showStatusBarDueNotification: boolean; // Whether due notifications are enabled in the status bar

    // Timeline Settings
    showScrollPercentage: boolean;
    autoExpandTimeline: boolean;
    timelineAutoCommitReviewSelection: boolean;
    timelineEnableDurationPrefixSyntax: boolean;

    // License state
    licenseKey: string; // User-entered license key
    isPro: boolean; // Cached Pro membership state
    vaultId: string; // Per-vault device identifier
    licenseToken: string; // Server-issued verification token
    lastVerification: number; // Timestamp of the last online verification

    previousRelease: string;

    // Debugging Options
    enableCardLevelTrace: boolean; // Whether to enable per-card trace logging
}

export const DEFAULT_SETTINGS: SRSettings = {
    // flashcards
    responseOptionBtnsText: DEFAULT_responseOptionBtnsText,

    flashcardTags: ["#flashcards"],
    convertFoldersToDecks: true,
    burySiblingCards: false,
    burySiblingCardsByNoteReview: false,
    multiClozeCard: false,
    enableNoteCachePersistence: true,
    autoIncrementalSync: true,
    syncProgressDisplayMode: "always",
    cardBlockID: false,
    randomizeCardOrder: null,
    flashcardCardOrder: "DueFirstRandom",
    flashcardDeckOrder: "PrevDeckComplete_Sequential",

    convertHighlightsToClozes: true,
    convertBoldTextToClozes: false,
    convertCurlyBracketsToClozes: false,
    convertAnkiClozesToClozes: false,
    clozePatterns: ["==[123;;]answer[;;hint]=="],
    singleLineCardSeparator: "::",
    singleLineReversedCardSeparator: ":::",
    multilineCardSeparator: "?",
    multilineReversedCardSeparator: "??",
    multilineCardEndMarker: "",
    parseClozesInCodeBlocks: false, // Disabled by default
    enableLatexPopover: false,
    codeContextLines: 15, // default code context lines
    clozeContextMode: "single",
    clozeContextPerformanceMode: "off",
    clozeContextSoftLimitLines: 15,
    editLaterTag: "#edit-later",
    intervalShowHide: true,
    showOtherClozesVisual: false,
    showOtherAnkiClozeVisual: false,
    showOtherHighlightClozeVisual: false,
    showOtherBoldClozeVisual: false,
    // notes
    enableNoteReviewPaneOnStartup: true,
    tagsToReview: ["#review"],
    noteFoldersToIgnore: ["**/*.excalidraw.md"],
    tagsToIgnore: [],
    openRandomNote: false,
    autoNextNote: false,
    mixDue: 3,
    mixNew: 2,
    mixCardNote: false,
    mixCard: 4,
    mixNote: 1,
    reviewResponseFloatBar: false,
    responseBarPositionPercentage: 5,
    reviewingNoteDirectly: false,
    disableFileMenuReviewOptions: false,
    maxNDaysNotesReviewQueue: 365,

    // UI settings
    showRibbonIcon: true,
    showStatusBar: true,
    collapsedDeckPaths: [], // Legacy field starts empty
    deckCollapseState: {},
    showContextInCards: true,
    showIntervalInReviewButtons: true,
    flashcardHeightPercentage: Platform.isMobile ? 100 : 80,
    flashcardWidthPercentage: Platform.isMobile ? 100 : 40,
    reactFlashcardWidth: 720,
    reactFlashcardHeight: 600,
    flashcardEasyText: t("EASY"),
    flashcardGoodText: t("GOOD"),
    flashcardHardText: t("HARD"),
    reviewButtonDelay: 0,
    openViewInNewTab: true,
    enableVolumeKeyControl: true,
    volumeUpMapping: 1, // ReviewResponse.Hard
    volumeDownMapping: 2, // ReviewResponse.Good
    useReactCardUI: false, // Use the classic UI by default

    // algorithm
    baseEase: 250,
    lapsesIntervalChange: 0.5,
    easyBonus: 1.3,
    loadBalance: true,
    maximumInterval: 36525,
    maxLinkFactor: 1.0,

    // storage
    // dataStore: DataStoreName.NOTES,
    dataStore: "NOTES",
    cardCommentOnSameLine: false,

    // logging
    showSchedulingDebugMessages: false,
    showParserDebugMessages: false,
    showRuntimeDebugMessages: false,

    // Track-file settings preserved for legacy migration support.
    dataLocation: DataLocation.PluginFolder,
    customFolder: "",
    maxNewPerDay: -1,
    repeatItems: false,
    trackedNoteToDecks: false,
    untrackWithReviewTag: false,
    algorithm: Object.keys(algorithms)[0], // Legacy compatibility field
    cardAlgorithm: "Fsrs", // Default flashcard algorithm
    noteAlgorithm: "WeightedMultiplier", // Default note review algorithm
    algorithmSettings: { algorithm: Object.values(algorithms)[0].settings },

    // Deck option presets
    deckOptionsPresets: [{ ...DEFAULT_DECK_OPTIONS_PRESET }], // Start with a single default preset
    deckPresetAssignment: {}, // Decks use the default preset unless assigned
    progressBarStyle: { ...DEFAULT_PROGRESS_BAR_STYLE },

    // Daily rollover settings
    rolloverHour: 4, // A new day starts at 4 AM

    learnAheadMinutes: 15, // Default learn-ahead window

    // Sidebar tag settings
    sidebarIgnoredTags: [], // Ignore no tags by default
    sidebarTagSortMode: "frequency", // Sort tags by frequency by default
    sidebarCustomTagOrder: [], // Custom order starts empty
    sidebarFilterBarHeight: 80, // Default filter bar height
    hideNoteReviewSidebarFilters: false, // Show the filter header by default

    // Status bar defaults
    noteStatusBarColor: "#ff9900", // Default note color
    noteStatusBarAnimation: "Breathing" as StatusBarAnimationStyle, // Default animation
    noteStatusBarPeriod: 2.0, // Two-second animation period
    flashcardStatusBarColor: "#00ccff", // Default flashcard color
    flashcardStatusBarAnimation: "Breathing" as StatusBarAnimationStyle, // Default animation
    flashcardStatusBarPeriod: 2.0, // Two-second animation period
    showStatusBarDueNotification: true, // Enabled by default

    // Timeline Settings
    showScrollPercentage: true,
    autoExpandTimeline: true,
    timelineAutoCommitReviewSelection: true,
    timelineEnableDurationPrefixSyntax: true,

    // License defaults
    licenseKey: "",
    isPro: false,
    vaultId: "",
    licenseToken: "",
    lastVerification: 0,

    previousRelease: "0.0.0",

    enableCardLevelTrace: false,
};

const DEFAULT_HIGHLIGHT_CLOZE_PATTERN = "==[123;;]answer[;;hint]==";
const DEFAULT_BOLD_CLOZE_PATTERN = "**[123;;]answer[;;hint]**";
const DEFAULT_CURLY_CLOZE_PATTERN = "{{[123;;]answer[;;hint]}}";

export function syncDefaultClozePatterns(settings: SRSettings) {
    const existingPatterns = settings.clozePatterns ?? [];
    const customPatterns = existingPatterns.filter(
        (pattern) =>
            pattern !== DEFAULT_HIGHLIGHT_CLOZE_PATTERN &&
            pattern !== DEFAULT_BOLD_CLOZE_PATTERN &&
            pattern !== DEFAULT_CURLY_CLOZE_PATTERN,
    );

    settings.clozePatterns = [...customPatterns];

    if (settings.convertHighlightsToClozes) {
        settings.clozePatterns.push(DEFAULT_HIGHLIGHT_CLOZE_PATTERN);
    }

    if (settings.convertBoldTextToClozes) {
        settings.clozePatterns.push(DEFAULT_BOLD_CLOZE_PATTERN);
    }

    if (settings.convertCurlyBracketsToClozes) {
        settings.clozePatterns.push(DEFAULT_CURLY_CLOZE_PATTERN);
    }
}

export function upgradeSettings(settings: SRSettings) {
    if (
        settings.randomizeCardOrder != null &&
        settings.flashcardCardOrder == null &&
        settings.flashcardDeckOrder == null
    ) {
        console.log(`loadPluginData: Upgrading settings: ${settings.randomizeCardOrder}`);
        settings.flashcardCardOrder = settings.randomizeCardOrder
            ? "DueFirstRandom"
            : "DueFirstSequential";
        settings.flashcardDeckOrder = "PrevDeckComplete_Sequential";

        // After the upgrade, we don't need the old attribute any more
        settings.randomizeCardOrder = null;
    }

    syncDefaultClozePatterns(settings);

    if (settings.convertAnkiClozesToClozes === undefined) {
        settings.convertAnkiClozesToClozes = true;
    }

    // Keep the unfinished popover disabled for all vaults until it is production-ready.
    settings.enableLatexPopover = false;

    if (settings.enableNoteCachePersistence === undefined) {
        settings.enableNoteCachePersistence = true;
    }

    if (settings.autoIncrementalSync === undefined) {
        settings.autoIncrementalSync = true;
    }

    if (settings.syncProgressDisplayMode === undefined) {
        settings.syncProgressDisplayMode = "always";
    }

    if (settings.showRuntimeDebugMessages === undefined) {
        settings.showRuntimeDebugMessages = false;
    }

    settings.openViewInNewTab = true;
    if (settings.clozeContextMode === undefined) {
        settings.clozeContextMode = "single";
    }

    if (settings.clozeContextPerformanceMode === undefined) {
        settings.clozeContextPerformanceMode = "off";
    }

    if (settings.clozeContextSoftLimitLines === undefined) {
        settings.clozeContextSoftLimitLines = 15;
    }
    if (settings.showOtherAnkiClozeVisual === undefined) {
        settings.showOtherAnkiClozeVisual = settings.showOtherClozesVisual ?? false;
    }

    if (settings.showOtherHighlightClozeVisual === undefined) {
        settings.showOtherHighlightClozeVisual = settings.showOtherClozesVisual ?? false;
    }

    if (settings.showOtherBoldClozeVisual === undefined) {
        settings.showOtherBoldClozeVisual = settings.showOtherClozesVisual ?? false;
    }

    // Upgrade deck option presets by filling any missing fields introduced in newer versions.
    if (settings.deckOptionsPresets && settings.deckOptionsPresets.length > 0) {
        for (const preset of settings.deckOptionsPresets) {
            if (preset.maxNewCards === undefined) {
                preset.maxNewCards = DEFAULT_DECK_OPTIONS_PRESET.maxNewCards;
            }
            if (preset.maxReviews === undefined) {
                preset.maxReviews = DEFAULT_DECK_OPTIONS_PRESET.maxReviews;
            }
        }
    }

    // Upgrade legacy single-algorithm settings to separate card and note algorithms.
    if (!settings.cardAlgorithm) {
        settings.cardAlgorithm = settings.algorithm || "Fsrs";
        console.log("Upgrading to dual algorithm: cards=" + settings.cardAlgorithm);
    }
    if (!settings.noteAlgorithm) {
        settings.noteAlgorithm = "WeightedMultiplier";
        console.log("Upgrading to dual algorithm: notes=" + settings.noteAlgorithm);
    }

    // Create algorithm settings storage when upgrading old settings.
    if (!settings.algorithmSettings) {
        settings.algorithmSettings = {};
    }

    // Create response button label storage when upgrading old settings.
    if (!settings.responseOptionBtnsText) {
        settings.responseOptionBtnsText = {};
    }

    // Ensure every algorithm has a default set of response button labels.
    const defaultTexts = [t("RESET"), t("HARD"), t("GOOD"), t("EASY")];
    const algorithmList = ["Default", "Anki", "Fsrs", "SM2", "WeightedMultiplier"];
    algorithmList.forEach((algoName) => {
        if (!settings.responseOptionBtnsText[algoName]) {
            settings.responseOptionBtnsText[algoName] = defaultTexts;
        }
    });

    // Keep data in the plugin folder; the old track-file mode is no longer supported.
    if (settings.dataLocation !== DataLocation.PluginFolder) {
        console.log(`Upgrading dataLocation from ${settings.dataLocation} to PluginFolder`);
        settings.dataLocation = DataLocation.PluginFolder;
    }

    if (settings.cardBlockID) {
        console.log("Disabling legacy cardBlockID setting");
        settings.cardBlockID = false;
    }

    // Migrate legacy collapsed deck paths into the keyed collapse-state map.
    if (
        settings.collapsedDeckPaths &&
        settings.collapsedDeckPaths.length > 0 &&
        Object.keys(settings.deckCollapseState || {}).length === 0
    ) {
        if (!settings.deckCollapseState) settings.deckCollapseState = {};
        for (const path of settings.collapsedDeckPaths) {
            settings.deckCollapseState[path] = true;
        }
    }
}

export class SettingsUtil {
    static isFlashcardTag(settings: SRSettings, tag: string): boolean {
        return SettingsUtil.isTagInList(settings.flashcardTags, tag);
    }

    static isPathInNoteIgnoreFolder(settings: SRSettings, path: string): boolean {
        return settings.noteFoldersToIgnore.some((folder) => pathMatchesPattern(path, folder));
    }

    static isAnyTagANoteReviewTag(settings: SRSettings, tags: string[]): boolean {
        for (const tag of tags) {
            if (
                settings.tagsToReview.some(
                    (tagToReview) => tag === tagToReview || tag.startsWith(tagToReview + "/"),
                )
            ) {
                return true;
            }
        }
        return false;
    }

    // Given a list of tags, return the subset that is in settings.tagsToReview
    static filterForNoteReviewTag(settings: SRSettings, tags: string[]): string[] {
        const result: string[] = [];
        for (const tagToReview of settings.tagsToReview) {
            if (tags.some((tag) => tag === tagToReview || tag.startsWith(tagToReview + "/"))) {
                result.push(tagToReview);
            }
        }
        return result;
    }

    private static isTagInList(tagList: string[], tag: string): boolean {
        for (const tagFromList of tagList) {
            if (tag === tagFromList || tag.startsWith(tagFromList + "/")) {
                return true;
            }
        }
        return false;
    }
}
