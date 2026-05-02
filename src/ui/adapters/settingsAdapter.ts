/**
 * Converts between persisted plugin settings and the UI-facing settings state.
 */

import {
    createDefaultFsrsSettings,
    SRSettings,
    DEFAULT_PROGRESS_BAR_STYLE,
    DEFAULT_SYNC_PROGRESS_DISPLAY_MODE,
    SidebarProgressIndicatorMode,
    SidebarProgressRingDirection,
    WeightedMultiplierSettings,
    hasSupporterLicenseState,
    normalizeFsrsSettings,
    setFsrsFuzzForAllDeckOptionsPresets,
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
    return settings.weightedMultiplierSettings ?? {};
}

function normalizeSidebarProgressIndicatorMode(
    mode: SRSettings["sidebarProgressIndicatorMode"] | undefined,
): SidebarProgressIndicatorMode {
    return mode === "percentage" ? mode : "ring";
}

function normalizeSidebarProgressRingDirection(
    direction: SRSettings["sidebarProgressRingDirection"] | undefined,
): SidebarProgressRingDirection {
    return direction === "clockwise" ? direction : "counterclockwise";
}

function normalizeShowSidebarProgressIndicator(
    settings: SRSettings,
): UISettingsState["showSidebarProgressIndicator"] {
    const legacyMode = (settings as { sidebarProgressIndicatorMode?: string })
        .sidebarProgressIndicatorMode;

    if (typeof settings.showSidebarProgressIndicator === "boolean") {
        return settings.showSidebarProgressIndicator;
    }

    return legacyMode !== "hidden";
}

function normalizeSidebarFilePathTooltipDelayMs(
    delayMs: SRSettings["sidebarFilePathTooltipDelayMs"] | undefined,
): UISettingsState["sidebarFilePathTooltipDelayMs"] {
    if (typeof delayMs !== "number" || !Number.isFinite(delayMs)) {
        return 1000;
    }

    return Math.max(0, Math.round(delayMs));
}

function normalizeTooltipDelayMs(delayMs: number | undefined): number {
    if (typeof delayMs !== "number" || !Number.isFinite(delayMs)) {
        return 300;
    }

    return Math.max(0, Math.round(delayMs));
}

/**
 * Extract the subset of settings needed by the UI.
 */
export function settingsToUIState(settings: SRSettings): UISettingsState {
    const weightedMultiplierSettings = getWeightedMultiplierSettings(settings);
    const fsrsSettings = normalizeFsrsSettings(settings.fsrsSettings);
    const licenseState = settings.licenseState ?? null;
    const isPro = hasSupporterLicenseState(licenseState) || settings.isPro === true;
    const licenseKey = licenseState?.licenseKey || settings.licenseKey || "";

    return {
        // Flashcards
        flashcardTags: settings.flashcardTags || [],
        convertFoldersToDecks: settings.convertFoldersToDecks ?? false,
        burySiblingCards: settings.burySiblingCards ?? false,
        singleLineCardSeparator: settings.singleLineCardSeparator || "::",
        multilineCardSeparator: settings.multilineCardSeparator || "?",
        convertHighlightsToClozes: settings.convertHighlightsToClozes ?? true,
        convertBoldTextToClozes: settings.convertBoldTextToClozes ?? false,
        convertCurlyBracketsToClozes: settings.convertCurlyBracketsToClozes ?? false,
        convertAnkiClozesToClozes: settings.convertAnkiClozesToClozes ?? false,
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
        showSidebarProgressIndicator: normalizeShowSidebarProgressIndicator(settings),
        sidebarProgressRingColor: settings.sidebarProgressRingColor ?? "#a0b0a9",
        sidebarProgressIndicatorMode: normalizeSidebarProgressIndicatorMode(
            settings.sidebarProgressIndicatorMode,
        ),
        sidebarProgressRingDirection: normalizeSidebarProgressRingDirection(
            settings.sidebarProgressRingDirection,
        ),
        sidebarFilePathTooltipEnabled: settings.sidebarFilePathTooltipEnabled ?? true,
        sidebarFilePathTooltipDelayMs: normalizeSidebarFilePathTooltipDelayMs(
            settings.sidebarFilePathTooltipDelayMs,
        ),
        showScrollPercentage: settings.showScrollPercentage ?? true,
        autoExpandTimeline: settings.autoExpandTimeline ?? true,
        timelineAllowUntrackedNotes: settings.timelineAllowUntrackedNotes ?? false,
        timelineAutoFollowReviewCards: settings.timelineAutoFollowReviewCards ?? false,
        timelineAutoCommitReviewSelection: settings.timelineAutoCommitReviewSelection ?? true,
        timelineEnableDurationPrefixSyntax: settings.timelineEnableDurationPrefixSyntax ?? true,
        enableExtracts: settings.enableExtracts ?? true,
        enableAutoExtracts: settings.enableAutoExtracts ?? true,
        showExtractMemoTooltip: settings.showExtractMemoTooltip ?? true,
        extractMemoTooltipDelayMs: normalizeTooltipDelayMs(settings.extractMemoTooltipDelayMs),

        // Weighted Multiplier Algorithm defaults (convert number to string for UI)
        fsrsEnableFuzz: fsrsSettings.enable_fuzz,
        wmsImpMin: (weightedMultiplierSettings.impMin ?? 1.0).toString(),
        wmsImpMax: (weightedMultiplierSettings.impMax ?? 2.5).toString(),
        wmsBaseEase: weightedMultiplierSettings.baseEase ?? 250,
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
    const weightedMultiplierSettings: WeightedMultiplierUiSettings = {
        ...(merged.weightedMultiplierSettings ?? {}),
    };

    delete merged.enableCardLevelTrace;

    // Flashcards
    if (uiChanges.flashcardTags !== undefined) merged.flashcardTags = uiChanges.flashcardTags;
    if (uiChanges.convertFoldersToDecks !== undefined)
        merged.convertFoldersToDecks = uiChanges.convertFoldersToDecks;
    if (uiChanges.burySiblingCards !== undefined)
        merged.burySiblingCards = uiChanges.burySiblingCards;
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
    if (uiChanges.showSidebarProgressIndicator !== undefined)
        merged.showSidebarProgressIndicator = uiChanges.showSidebarProgressIndicator;
    if (uiChanges.sidebarProgressRingColor !== undefined)
        merged.sidebarProgressRingColor = uiChanges.sidebarProgressRingColor;
    if (uiChanges.sidebarProgressIndicatorMode !== undefined)
        merged.sidebarProgressIndicatorMode = uiChanges.sidebarProgressIndicatorMode;
    if (uiChanges.sidebarProgressRingDirection !== undefined)
        merged.sidebarProgressRingDirection = uiChanges.sidebarProgressRingDirection;
    if (uiChanges.sidebarFilePathTooltipEnabled !== undefined)
        merged.sidebarFilePathTooltipEnabled = uiChanges.sidebarFilePathTooltipEnabled;
    if (uiChanges.sidebarFilePathTooltipDelayMs !== undefined)
        merged.sidebarFilePathTooltipDelayMs = normalizeSidebarFilePathTooltipDelayMs(
            uiChanges.sidebarFilePathTooltipDelayMs,
        );
    if (uiChanges.showScrollPercentage !== undefined)
        merged.showScrollPercentage = uiChanges.showScrollPercentage;
    if (uiChanges.autoExpandTimeline !== undefined)
        merged.autoExpandTimeline = uiChanges.autoExpandTimeline;
    if (uiChanges.timelineAllowUntrackedNotes !== undefined)
        merged.timelineAllowUntrackedNotes = uiChanges.timelineAllowUntrackedNotes;
    if (uiChanges.timelineAutoFollowReviewCards !== undefined)
        merged.timelineAutoFollowReviewCards = uiChanges.timelineAutoFollowReviewCards;
    if (uiChanges.timelineAutoCommitReviewSelection !== undefined)
        merged.timelineAutoCommitReviewSelection = uiChanges.timelineAutoCommitReviewSelection;
    if (uiChanges.timelineEnableDurationPrefixSyntax !== undefined)
        merged.timelineEnableDurationPrefixSyntax = uiChanges.timelineEnableDurationPrefixSyntax;
    if (uiChanges.enableExtracts !== undefined)
        merged.enableExtracts = uiChanges.enableExtracts;
    if (uiChanges.enableAutoExtracts !== undefined)
        merged.enableAutoExtracts = uiChanges.enableAutoExtracts;
    if (uiChanges.showExtractMemoTooltip !== undefined)
        merged.showExtractMemoTooltip = uiChanges.showExtractMemoTooltip;
    if (uiChanges.extractMemoTooltipDelayMs !== undefined)
        merged.extractMemoTooltipDelayMs = normalizeTooltipDelayMs(
            uiChanges.extractMemoTooltipDelayMs,
        );

    // Update WeightedMultiplier settings if changed
    if (uiChanges.fsrsEnableFuzz !== undefined) {
        merged.fsrsSettings = normalizeFsrsSettings(
            {
                ...(merged.fsrsSettings ?? createDefaultFsrsSettings()),
                enable_fuzz: uiChanges.fsrsEnableFuzz,
            },
            merged.fsrsSettings ?? createDefaultFsrsSettings(),
        );
        setFsrsFuzzForAllDeckOptionsPresets(merged, uiChanges.fsrsEnableFuzz);
    }

    if (
        uiChanges.wmsImpMin !== undefined ||
        uiChanges.wmsImpMax !== undefined ||
        uiChanges.wmsBaseEase !== undefined ||
        uiChanges.wmsAgainInterval !== undefined ||
        uiChanges.wmsHardFactor !== undefined ||
        uiChanges.wmsGoodFactor !== undefined ||
        uiChanges.wmsEasyFactor !== undefined
    ) {
        if (uiChanges.wmsImpMin !== undefined) {
            const val = parseFloat(uiChanges.wmsImpMin);
            if (!isNaN(val)) weightedMultiplierSettings.impMin = val;
        }
        if (uiChanges.wmsImpMax !== undefined) {
            const val = parseFloat(uiChanges.wmsImpMax);
            if (!isNaN(val)) weightedMultiplierSettings.impMax = val;
        }
        if (uiChanges.wmsBaseEase !== undefined) {
            weightedMultiplierSettings.baseEase = uiChanges.wmsBaseEase;
        }

        if (uiChanges.wmsAgainInterval !== undefined)
            weightedMultiplierSettings.againInterval = uiChanges.wmsAgainInterval;
        if (uiChanges.wmsHardFactor !== undefined)
            weightedMultiplierSettings.hardFactor = uiChanges.wmsHardFactor;
        if (uiChanges.wmsGoodFactor !== undefined)
            weightedMultiplierSettings.goodFactor = uiChanges.wmsGoodFactor;
        if (uiChanges.wmsEasyFactor !== undefined)
            weightedMultiplierSettings.easyFactor = uiChanges.wmsEasyFactor;

        if (weightedMultiplierSettings.baseEase === undefined) {
            weightedMultiplierSettings.baseEase = 250;
        }

        merged.weightedMultiplierSettings =
            weightedMultiplierSettings as WeightedMultiplierSettings;
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
