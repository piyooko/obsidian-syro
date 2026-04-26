/**
 * UI-specific settings types used by the settings screens.
 */

import type {
    SidebarProgressIndicatorMode,
    SidebarProgressRingDirection,
    StatusBarAnimationStyle,
} from "../../settings";

// Re-export full plugin settings types for adapter code.
export type {
    SRSettings,
    DeckOptionsPreset,
    ProgressBarStyle,
    StatusBarAnimationStyle,
    LicenseState,
    SidebarProgressIndicatorMode,
    SidebarProgressRingDirection,
} from "../../settings";

/**
 * Subset of settings exposed to the settings UI.
 */
export interface UISettingsState {
    // Flashcards
    flashcardTags: string[];
    convertFoldersToDecks: boolean;
    burySiblingCards: boolean;
    flashcardCardOrder: string;
    singleLineCardSeparator: string;
    multilineCardSeparator: string;
    convertHighlightsToClozes: boolean;
    convertBoldTextToClozes: boolean;
    convertCurlyBracketsToClozes: boolean;
    convertAnkiClozesToClozes: boolean;
    enableNoteCachePersistence: boolean;
    autoIncrementalSync: boolean;
    syncProgressDisplayMode: "always" | "full-only" | "never";
    parseClozesInCodeBlocks: boolean; // Parse {{c1::...}} cloze syntax in code blocks
    codeContextLines: number; // code context lines
    clozeContextMode: string;
    clozeContextPerformanceMode: string;
    clozeContextSoftLimitLines: number;
    showOtherAnkiClozeVisual: boolean;
    showOtherHighlightClozeVisual: boolean;
    showOtherBoldClozeVisual: boolean;

    // Notes
    tagsToReview: string[];
    autoNextNote: boolean;
    openRandomNote: boolean;
    enableNoteReviewPaneOnStartup: boolean;
    sidebarIgnoredTags: string[]; // Ignored tags
    hideNoteReviewSidebarFilters: boolean; // Hide the sidebar filter header
    showSidebarProgressIndicator: boolean; // Show or hide the sidebar progress indicator
    sidebarProgressRingColor: string; // Review queue progress ring color
    sidebarProgressIndicatorMode: SidebarProgressIndicatorMode; // Sidebar progress indicator mode
    sidebarProgressRingDirection: SidebarProgressRingDirection; // Sidebar progress ring direction
    sidebarFilePathTooltipEnabled: boolean; // Show or hide file path tooltips for sidebar note items
    sidebarFilePathTooltipDelayMs: number; // Hover delay before showing sidebar file path tooltips
    showScrollPercentage: boolean; // Show saved scroll percentage in timeline items
    autoExpandTimeline: boolean; // Auto-expand the timeline when opening a reviewed note
    timelineAllowUntrackedNotes: boolean; // Experimental: allow timeline access for untracked notes
    timelineAutoFollowReviewCards: boolean; // Experimental: follow the current review card note
    timelineAutoCommitReviewSelection: boolean; // Auto-write note review selections to timeline
    timelineEnableDurationPrefixSyntax: boolean; // Enable Nd:: prefix parsing and rendering
    enableExtracts: boolean; // Enable incremental reading extracts
    maxNewExtractsPerDay: number; // Daily new extract limit
    maxExtractReviewsPerDay: number; // Daily extract review limit

    // Weighted Multiplier Algorithm Settings
    fsrsEnableFuzz: boolean;
    wmsImpMin: string;
    wmsImpMax: string;
    wmsBaseEase: number;
    wmsAgainInterval: number;
    wmsHardFactor: number;
    wmsGoodFactor: number;
    wmsEasyFactor: number;

    // UI
    showStatusBar: boolean;
    openViewInNewTab: boolean;
    progressBarStyle: {
        color: string;
        warningColor: string;
        height: number;
        rightToLeft: boolean;
    };
    // Status bar styling
    noteStatusBarColor: string;
    noteStatusBarAnimation: string;
    noteStatusBarPeriod: number;
    flashcardStatusBarColor: string;
    flashcardStatusBarAnimation: StatusBarAnimationStyle;
    flashcardStatusBarPeriod: number;
    showStatusBarDueNotification: boolean;

    // Advanced & Debug
    showRuntimeDebugMessages: boolean;

    // Storage
    dataLocation: string; // DataLocation enum value
    trackedNoteToDecks: boolean; // Put tracked notes into deck assignments
    disableFileMenuReviewOptions: boolean; // Disable review options in the file menu

    // License
    licenseKey: string; // User-entered license key
    isPro: boolean; // Whether the current vault is Pro-enabled
    licenseInstallationId: string; // Stable installation UUID
    licenseState: import("../../settings").LicenseState | null; // Persisted license cache
}

// The remaining settings component props are defined alongside their React components.
