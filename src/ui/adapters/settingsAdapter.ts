/**
 * Converts between persisted plugin settings and the UI-facing settings state.
 */






import { SRSettings, DEFAULT_PROGRESS_BAR_STYLE, syncDefaultClozePatterns } from "../../settings";
import { DataLocation } from "../../dataStore/dataLocation";
import { UISettingsState } from "../types/settingsTypes";

/**
 * Extract the subset of settings needed by the UI.
 */
export function settingsToUIState(settings: SRSettings): UISettingsState {
    return {
        // Flashcards
        flashcardTags: settings.flashcardTags || [],
        convertFoldersToDecks: settings.convertFoldersToDecks ?? false,
        burySiblingCards: settings.burySiblingCards ?? false,
        flashcardCardOrder: settings.flashcardCardOrder || "DueFirstSequential",
        singleLineCardSeparator: settings.singleLineCardSeparator || "::",
        multilineCardSeparator: settings.multilineCardSeparator || "?",
        convertHighlightsToClozes: settings.convertHighlightsToClozes ?? true,
        convertBoldTextToClozes: settings.convertBoldTextToClozes ?? false,
        convertCurlyBracketsToClozes: settings.convertCurlyBracketsToClozes ?? false,
        convertAnkiClozesToClozes: settings.convertAnkiClozesToClozes ?? true,
        enableNoteCachePersistence: settings.enableNoteCachePersistence ?? true,
        autoIncrementalSync: settings.autoIncrementalSync ?? true,
        syncProgressDisplayMode: settings.syncProgressDisplayMode ?? "always",
        parseClozesInCodeBlocks: settings.parseClozesInCodeBlocks ?? false,
        codeContextLines: settings.codeContextLines ?? 15,
        clozeContextMode: settings.clozeContextMode ?? "single",
        clozeContextPerformanceMode: settings.clozeContextPerformanceMode ?? "off",
        clozeContextSoftLimitLines: settings.clozeContextSoftLimitLines ?? 15,
        showOtherAnkiClozeVisual:
            settings.showOtherAnkiClozeVisual ?? settings.showOtherClozesVisual ?? false,
        showOtherHighlightClozeVisual:
            settings.showOtherHighlightClozeVisual ?? settings.showOtherClozesVisual ?? false,
        showOtherBoldClozeVisual:
            settings.showOtherBoldClozeVisual ?? settings.showOtherClozesVisual ?? false,
        // Notes
        tagsToReview: settings.tagsToReview || [],
        autoNextNote: settings.autoNextNote ?? false,
        openRandomNote: settings.openRandomNote ?? false,
        enableNoteReviewPaneOnStartup: settings.enableNoteReviewPaneOnStartup ?? true,
        sidebarIgnoredTags: settings.sidebarIgnoredTags || [],
        hideNoteReviewSidebarFilters: settings.hideNoteReviewSidebarFilters ?? false,
        showScrollPercentage: settings.showScrollPercentage ?? true,
        autoExpandTimeline: settings.autoExpandTimeline ?? true,
        timelineAutoCommitReviewSelection: settings.timelineAutoCommitReviewSelection ?? true,
        timelineEnableDurationPrefixSyntax: settings.timelineEnableDurationPrefixSyntax ?? true,

        // Algorithm
        cardAlgorithm: settings.cardAlgorithm || "Fsrs",
        noteAlgorithm: settings.noteAlgorithm || "WeightedMultiplier",
        baseEase: settings.baseEase ?? 250,
        easyBonus: settings.easyBonus ?? 1.3,

        // Weighted Multiplier Algorithm defaults (convert number to string for UI)
        wmsImpMin: (settings.algorithmSettings?.WeightedMultiplier?.impMin ?? 1.0).toString(),
        wmsImpMax: (settings.algorithmSettings?.WeightedMultiplier?.impMax ?? 2.5).toString(),
        wmsAgainInterval: settings.algorithmSettings?.WeightedMultiplier?.againInterval ?? 1.0,
        wmsHardFactor: settings.algorithmSettings?.WeightedMultiplier?.hardFactor ?? 0.7,
        wmsGoodFactor: settings.algorithmSettings?.WeightedMultiplier?.goodFactor ?? 1.3,
        wmsEasyFactor: settings.algorithmSettings?.WeightedMultiplier?.easyFactor ?? 2.0,

        // UI
        showStatusBar: settings.showStatusBar ?? true,
        openViewInNewTab: true,
        progressBarStyle: {
            color: settings.progressBarStyle?.color || DEFAULT_PROGRESS_BAR_STYLE.color,
            warningColor:
                settings.progressBarStyle?.warningColor || DEFAULT_PROGRESS_BAR_STYLE.warningColor,
            height: settings.progressBarStyle?.height ?? DEFAULT_PROGRESS_BAR_STYLE.height,
            rightToLeft:
                settings.progressBarStyle?.rightToLeft ?? DEFAULT_PROGRESS_BAR_STYLE.rightToLeft,
        },
        // Status bar styling
        noteStatusBarColor: settings.noteStatusBarColor ?? "#ff9900",
        noteStatusBarAnimation: settings.noteStatusBarAnimation ?? "Breathing",
        noteStatusBarPeriod: settings.noteStatusBarPeriod ?? 2.0,
        flashcardStatusBarColor: settings.flashcardStatusBarColor ?? "#00ccff",
        flashcardStatusBarAnimation: settings.flashcardStatusBarAnimation ?? "Breathing",
        flashcardStatusBarPeriod: settings.flashcardStatusBarPeriod ?? 2.0,
        showStatusBarDueNotification: settings.showStatusBarDueNotification ?? true,

        // Advanced & Debug
        showRuntimeDebugMessages: settings.showRuntimeDebugMessages ?? false,
        enableCardLevelTrace: settings.enableCardLevelTrace ?? false,

        // Storage
        dataLocation: settings.dataLocation || DataLocation.PluginFolder,
        trackedNoteToDecks: settings.trackedNoteToDecks ?? false,
        disableFileMenuReviewOptions: settings.disableFileMenuReviewOptions ?? false,

        // License
        licenseKey: settings.licenseKey || "",
        isPro: settings.isPro ?? false,
    };
}

/**
 * Merge UI state changes back into the full settings object.
 */
export function mergeUIStateToSettings(
    originalSettings: SRSettings,
    uiChanges: Partial<UISettingsState>,
): SRSettings {
    const merged = { ...originalSettings };

    // Flashcards
    if (uiChanges.flashcardTags !== undefined) merged.flashcardTags = uiChanges.flashcardTags;
    if (uiChanges.convertFoldersToDecks !== undefined)
        merged.convertFoldersToDecks = uiChanges.convertFoldersToDecks;
    if (uiChanges.burySiblingCards !== undefined)
        merged.burySiblingCards = uiChanges.burySiblingCards;
    if (uiChanges.flashcardCardOrder !== undefined)
        merged.flashcardCardOrder = uiChanges.flashcardCardOrder;
    if (uiChanges.singleLineCardSeparator !== undefined)
        merged.singleLineCardSeparator = uiChanges.singleLineCardSeparator;
    if (uiChanges.multilineCardSeparator !== undefined)
        merged.multilineCardSeparator = uiChanges.multilineCardSeparator;
    if (uiChanges.convertHighlightsToClozes !== undefined)
        merged.convertHighlightsToClozes = uiChanges.convertHighlightsToClozes;
    if (uiChanges.convertBoldTextToClozes !== undefined)
        merged.convertBoldTextToClozes = uiChanges.convertBoldTextToClozes;
    if (uiChanges.convertCurlyBracketsToClozes !== undefined)
        merged.convertCurlyBracketsToClozes = uiChanges.convertCurlyBracketsToClozes;
    if (uiChanges.convertAnkiClozesToClozes !== undefined)
        merged.convertAnkiClozesToClozes = uiChanges.convertAnkiClozesToClozes;
    if (uiChanges.enableNoteCachePersistence !== undefined)
        merged.enableNoteCachePersistence = uiChanges.enableNoteCachePersistence;
    if (uiChanges.autoIncrementalSync !== undefined)
        merged.autoIncrementalSync = uiChanges.autoIncrementalSync;
    if (uiChanges.syncProgressDisplayMode !== undefined)
        merged.syncProgressDisplayMode = uiChanges.syncProgressDisplayMode;
    if (uiChanges.parseClozesInCodeBlocks !== undefined)
        merged.parseClozesInCodeBlocks = uiChanges.parseClozesInCodeBlocks;
    if (uiChanges.codeContextLines !== undefined)
        merged.codeContextLines = uiChanges.codeContextLines;
    if (uiChanges.clozeContextMode !== undefined)
        merged.clozeContextMode = uiChanges.clozeContextMode as any;
    if (uiChanges.clozeContextPerformanceMode !== undefined)
        merged.clozeContextPerformanceMode = uiChanges.clozeContextPerformanceMode as any;
    if (uiChanges.clozeContextSoftLimitLines !== undefined)
        merged.clozeContextSoftLimitLines = uiChanges.clozeContextSoftLimitLines;
    if (uiChanges.showOtherAnkiClozeVisual !== undefined)
        merged.showOtherAnkiClozeVisual = uiChanges.showOtherAnkiClozeVisual;
    if (uiChanges.showOtherHighlightClozeVisual !== undefined)
        merged.showOtherHighlightClozeVisual = uiChanges.showOtherHighlightClozeVisual;
    if (uiChanges.showOtherBoldClozeVisual !== undefined)
        merged.showOtherBoldClozeVisual = uiChanges.showOtherBoldClozeVisual;
    // Notes
    if (uiChanges.tagsToReview !== undefined) merged.tagsToReview = uiChanges.tagsToReview;
    if (uiChanges.autoNextNote !== undefined) merged.autoNextNote = uiChanges.autoNextNote;
    if (uiChanges.openRandomNote !== undefined) merged.openRandomNote = uiChanges.openRandomNote;
    if (uiChanges.enableNoteReviewPaneOnStartup !== undefined)
        merged.enableNoteReviewPaneOnStartup = uiChanges.enableNoteReviewPaneOnStartup;
    if (uiChanges.sidebarIgnoredTags !== undefined)
        merged.sidebarIgnoredTags = uiChanges.sidebarIgnoredTags;
    if (uiChanges.hideNoteReviewSidebarFilters !== undefined)
        merged.hideNoteReviewSidebarFilters = uiChanges.hideNoteReviewSidebarFilters;
    if (uiChanges.showScrollPercentage !== undefined)
        merged.showScrollPercentage = uiChanges.showScrollPercentage;
    if (uiChanges.autoExpandTimeline !== undefined)
        merged.autoExpandTimeline = uiChanges.autoExpandTimeline;
    if (uiChanges.timelineAutoCommitReviewSelection !== undefined)
        merged.timelineAutoCommitReviewSelection = uiChanges.timelineAutoCommitReviewSelection;
    if (uiChanges.timelineEnableDurationPrefixSyntax !== undefined)
        merged.timelineEnableDurationPrefixSyntax = uiChanges.timelineEnableDurationPrefixSyntax;

    // Algorithm
    if (uiChanges.cardAlgorithm !== undefined) merged.cardAlgorithm = uiChanges.cardAlgorithm;
    if (uiChanges.noteAlgorithm !== undefined) merged.noteAlgorithm = uiChanges.noteAlgorithm;
    if (uiChanges.baseEase !== undefined) merged.baseEase = uiChanges.baseEase;
    if (uiChanges.easyBonus !== undefined) merged.easyBonus = uiChanges.easyBonus;

    // Update WeightedMultiplier settings if changed
    if (
        uiChanges.wmsImpMin !== undefined ||
        uiChanges.wmsImpMax !== undefined ||
        uiChanges.wmsAgainInterval !== undefined ||
        uiChanges.wmsHardFactor !== undefined ||
        uiChanges.wmsGoodFactor !== undefined ||
        uiChanges.wmsEasyFactor !== undefined
    ) {
        if (!merged.algorithmSettings) merged.algorithmSettings = {};
        if (!merged.algorithmSettings.WeightedMultiplier)
            merged.algorithmSettings.WeightedMultiplier = {};

        if (uiChanges.wmsImpMin !== undefined) {
            const val = parseFloat(uiChanges.wmsImpMin);
            if (!isNaN(val)) merged.algorithmSettings.WeightedMultiplier.impMin = val;
        }
        if (uiChanges.wmsImpMax !== undefined) {
            const val = parseFloat(uiChanges.wmsImpMax);
            if (!isNaN(val)) merged.algorithmSettings.WeightedMultiplier.impMax = val;
        }

        if (uiChanges.wmsAgainInterval !== undefined)
            merged.algorithmSettings.WeightedMultiplier.againInterval = uiChanges.wmsAgainInterval;
        if (uiChanges.wmsHardFactor !== undefined)
            merged.algorithmSettings.WeightedMultiplier.hardFactor = uiChanges.wmsHardFactor;
        if (uiChanges.wmsGoodFactor !== undefined)
            merged.algorithmSettings.WeightedMultiplier.goodFactor = uiChanges.wmsGoodFactor;
        if (uiChanges.wmsEasyFactor !== undefined)
            merged.algorithmSettings.WeightedMultiplier.easyFactor = uiChanges.wmsEasyFactor;

        // Ensure baseEase is preserved or copied if needed, though wmsBaseEase wasn't added yet
        // If the implementation requires baseEase in WMS settings, ensure it exists
        if (merged.algorithmSettings.WeightedMultiplier.baseEase === undefined) {
            merged.algorithmSettings.WeightedMultiplier.baseEase = merged.baseEase ?? 250;
        }
    }

    // UI
    if (uiChanges.showStatusBar !== undefined) merged.showStatusBar = uiChanges.showStatusBar;
    merged.openViewInNewTab = true;
    if (uiChanges.progressBarStyle !== undefined) {
        merged.progressBarStyle = { ...merged.progressBarStyle, ...uiChanges.progressBarStyle };
    }
    if (uiChanges.showStatusBarDueNotification !== undefined)
        merged.showStatusBarDueNotification = uiChanges.showStatusBarDueNotification;

    // Advanced & Debug
    if (uiChanges.showRuntimeDebugMessages !== undefined)
        merged.showRuntimeDebugMessages = uiChanges.showRuntimeDebugMessages;
    if (uiChanges.enableCardLevelTrace !== undefined)
        merged.enableCardLevelTrace = uiChanges.enableCardLevelTrace;

    // Status bar styling
    if (uiChanges.noteStatusBarColor !== undefined)
        merged.noteStatusBarColor = uiChanges.noteStatusBarColor;
    if (uiChanges.noteStatusBarAnimation !== undefined)
        merged.noteStatusBarAnimation = uiChanges.noteStatusBarAnimation as any;
    if (uiChanges.noteStatusBarPeriod !== undefined)
        merged.noteStatusBarPeriod = uiChanges.noteStatusBarPeriod;
    if (uiChanges.flashcardStatusBarColor !== undefined)
        merged.flashcardStatusBarColor = uiChanges.flashcardStatusBarColor;
    if (uiChanges.flashcardStatusBarAnimation !== undefined)
        merged.flashcardStatusBarAnimation = uiChanges.flashcardStatusBarAnimation as any;
    if (uiChanges.flashcardStatusBarPeriod !== undefined)
        merged.flashcardStatusBarPeriod = uiChanges.flashcardStatusBarPeriod;

    // Storage
    if (uiChanges.dataLocation !== undefined)
        merged.dataLocation = uiChanges.dataLocation as DataLocation;
    if (uiChanges.trackedNoteToDecks !== undefined)
        merged.trackedNoteToDecks = uiChanges.trackedNoteToDecks;
    if (uiChanges.disableFileMenuReviewOptions !== undefined)
        merged.disableFileMenuReviewOptions = uiChanges.disableFileMenuReviewOptions;

    // License
    if (uiChanges.licenseKey !== undefined) merged.licenseKey = uiChanges.licenseKey;
    if (uiChanges.isPro !== undefined) merged.isPro = uiChanges.isPro;

    syncDefaultClozePatterns(merged);

    return merged;
}
