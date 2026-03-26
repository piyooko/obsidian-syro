/**
 * Converts between persisted plugin settings and the UI-facing settings state.
 */

import {
    SRSettings,
    DEFAULT_PROGRESS_BAR_STYLE,
    DEFAULT_SYNC_PROGRESS_DISPLAY_MODE,
    hasSupporterLicenseState,
    syncDefaultClozePatterns,
} from "../../settings";
import {
    DEFAULT_CLOZE_CONTEXT_SOFT_LIMIT_LINES,
    MAX_CLOZE_CONTEXT_SOFT_LIMIT_LINES,
    MIN_CLOZE_CONTEXT_SOFT_LIMIT_LINES,
} from "../../settings/clozeContext";
import { DataLocation } from "../../dataStore/dataLocation";
import { UISettingsState } from "../types/settingsTypes";

type WeightedMultiplierUiSettings = {
    impMin?: number;
    impMax?: number;
    againInterval?: number;
    hardFactor?: number;
    goodFactor?: number;
    easyFactor?: number;
    baseEase?: number;
};

function clampClozeContextSoftLimitLines(value: number): number {
    return Math.max(
        MIN_CLOZE_CONTEXT_SOFT_LIMIT_LINES,
        Math.min(MAX_CLOZE_CONTEXT_SOFT_LIMIT_LINES, value),
    );
}

function getWeightedMultiplierSettings(settings: SRSettings): WeightedMultiplierUiSettings {
    return (
        (settings.algorithmSettings?.WeightedMultiplier as
            | WeightedMultiplierUiSettings
            | undefined) ?? {}
    );
}

/**
 * Extract the subset of settings needed by the UI.
 */
export function settingsToUIState(settings: SRSettings): UISettingsState {
    const weightedMultiplierSettings = getWeightedMultiplierSettings(settings);
    const licenseState = settings.licenseState ?? null;
    const isPro = hasSupporterLicenseState(licenseState) || settings.isPro === true;
    const licenseKey = licenseState?.licenseKey || settings.licenseKey || "";

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
        syncProgressDisplayMode:
            settings.syncProgressDisplayMode ?? DEFAULT_SYNC_PROGRESS_DISPLAY_MODE,
        parseClozesInCodeBlocks: settings.parseClozesInCodeBlocks ?? false,
        codeContextLines: settings.codeContextLines ?? 15,
        clozeContextMode: settings.clozeContextMode ?? "single",
        clozeContextPerformanceMode: settings.clozeContextPerformanceMode ?? "off",
        clozeContextSoftLimitLines: clampClozeContextSoftLimitLines(
            settings.clozeContextSoftLimitLines ?? DEFAULT_CLOZE_CONTEXT_SOFT_LIMIT_LINES,
        ),
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
        wmsImpMin: (weightedMultiplierSettings.impMin ?? 1.0).toString(),
        wmsImpMax: (weightedMultiplierSettings.impMax ?? 2.5).toString(),
        wmsAgainInterval: weightedMultiplierSettings.againInterval ?? 1.0,
        wmsHardFactor: weightedMultiplierSettings.hardFactor ?? 0.7,
        wmsGoodFactor: weightedMultiplierSettings.goodFactor ?? 1.3,
        wmsEasyFactor: weightedMultiplierSettings.easyFactor ?? 2.0,

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

        // Storage
        dataLocation: settings.dataLocation || DataLocation.PluginFolder,
        trackedNoteToDecks: settings.trackedNoteToDecks ?? false,
        disableFileMenuReviewOptions: settings.disableFileMenuReviewOptions ?? false,

        // License
        licenseKey,
        isPro,
        licenseInstallationId: settings.licenseInstallationId || "",
        licenseState,
    };
}

/**
 * Merge UI state changes back into the full settings object.
 */
export function mergeUIStateToSettings(
    originalSettings: SRSettings,
    uiChanges: Partial<UISettingsState>,
): SRSettings {
    const merged = {
        ...originalSettings,
    } as SRSettings & { enableCardLevelTrace?: boolean };
    const weightedMultiplierSettings =
        (merged.algorithmSettings?.WeightedMultiplier as
            | WeightedMultiplierUiSettings
            | undefined) ?? {};

    delete merged.enableCardLevelTrace;

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
        merged.clozeContextMode = uiChanges.clozeContextMode as SRSettings["clozeContextMode"];
    if (uiChanges.clozeContextPerformanceMode !== undefined)
        merged.clozeContextPerformanceMode =
            uiChanges.clozeContextPerformanceMode as SRSettings["clozeContextPerformanceMode"];
    if (uiChanges.clozeContextSoftLimitLines !== undefined)
        merged.clozeContextSoftLimitLines = clampClozeContextSoftLimitLines(
            uiChanges.clozeContextSoftLimitLines,
        );
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
        merged.algorithmSettings.WeightedMultiplier = weightedMultiplierSettings;

        if (uiChanges.wmsImpMin !== undefined) {
            const val = parseFloat(uiChanges.wmsImpMin);
            if (!isNaN(val)) weightedMultiplierSettings.impMin = val;
        }
        if (uiChanges.wmsImpMax !== undefined) {
            const val = parseFloat(uiChanges.wmsImpMax);
            if (!isNaN(val)) weightedMultiplierSettings.impMax = val;
        }

        if (uiChanges.wmsAgainInterval !== undefined)
            weightedMultiplierSettings.againInterval = uiChanges.wmsAgainInterval;
        if (uiChanges.wmsHardFactor !== undefined)
            weightedMultiplierSettings.hardFactor = uiChanges.wmsHardFactor;
        if (uiChanges.wmsGoodFactor !== undefined)
            weightedMultiplierSettings.goodFactor = uiChanges.wmsGoodFactor;
        if (uiChanges.wmsEasyFactor !== undefined)
            weightedMultiplierSettings.easyFactor = uiChanges.wmsEasyFactor;

        // Ensure baseEase is preserved or copied if needed, though wmsBaseEase wasn't added yet
        // If the implementation requires baseEase in WMS settings, ensure it exists
        if (weightedMultiplierSettings.baseEase === undefined) {
            weightedMultiplierSettings.baseEase = merged.baseEase ?? 250;
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

    // Status bar styling
    if (uiChanges.noteStatusBarColor !== undefined)
        merged.noteStatusBarColor = uiChanges.noteStatusBarColor;
    if (uiChanges.noteStatusBarAnimation !== undefined)
        merged.noteStatusBarAnimation =
            uiChanges.noteStatusBarAnimation as SRSettings["noteStatusBarAnimation"];
    if (uiChanges.noteStatusBarPeriod !== undefined)
        merged.noteStatusBarPeriod = uiChanges.noteStatusBarPeriod;
    if (uiChanges.flashcardStatusBarColor !== undefined)
        merged.flashcardStatusBarColor = uiChanges.flashcardStatusBarColor;
    if (uiChanges.flashcardStatusBarAnimation !== undefined)
        merged.flashcardStatusBarAnimation = uiChanges.flashcardStatusBarAnimation;
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
    if (uiChanges.licenseInstallationId !== undefined)
        merged.licenseInstallationId = uiChanges.licenseInstallationId;
    if (uiChanges.licenseState !== undefined) merged.licenseState = uiChanges.licenseState;

    syncDefaultClozePatterns(merged);

    return merged;
}
