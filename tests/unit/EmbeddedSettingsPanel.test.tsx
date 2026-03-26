import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { EmbeddedSettingsPanel } from "src/ui/components/EmbeddedSettingsPanel";
import type { UISettingsState } from "src/ui/types/settingsTypes";

jest.mock("obsidian", () => ({
    Notice: class Notice {
        constructor(_message?: string) {}
    },
    moment: {
        locale: () => "en",
    },
}));

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createSettings(overrides: Partial<UISettingsState> = {}): UISettingsState {
    return {
        flashcardTags: [],
        convertFoldersToDecks: false,
        burySiblingCards: false,
        flashcardCardOrder: "DueFirstSequential",
        singleLineCardSeparator: "::",
        multilineCardSeparator: "?",
        convertHighlightsToClozes: true,
        convertBoldTextToClozes: false,
        convertCurlyBracketsToClozes: false,
        convertAnkiClozesToClozes: false,
        enableNoteCachePersistence: true,
        autoIncrementalSync: true,
        syncProgressDisplayMode: "full-only",
        parseClozesInCodeBlocks: false,
        codeContextLines: 15,
        clozeContextMode: "single",
        clozeContextPerformanceMode: "off",
        clozeContextSoftLimitLines: 15,
        showOtherAnkiClozeVisual: false,
        showOtherHighlightClozeVisual: false,
        showOtherBoldClozeVisual: false,
        tagsToReview: [],
        autoNextNote: false,
        openRandomNote: false,
        enableNoteReviewPaneOnStartup: true,
        sidebarIgnoredTags: [],
        hideNoteReviewSidebarFilters: false,
        showSidebarProgressIndicator: true,
        sidebarProgressRingColor: "#a0b0a9",
        sidebarProgressIndicatorMode: "ring",
        sidebarProgressRingDirection: "counterclockwise",
        showScrollPercentage: true,
        autoExpandTimeline: true,
        timelineAutoCommitReviewSelection: true,
        timelineEnableDurationPrefixSyntax: true,
        cardAlgorithm: "Fsrs",
        noteAlgorithm: "WeightedMultiplier",
        baseEase: 250,
        easyBonus: 1.3,
        wmsImpMin: "1",
        wmsImpMax: "2.5",
        wmsAgainInterval: 1,
        wmsHardFactor: 0.7,
        wmsGoodFactor: 1.3,
        wmsEasyFactor: 2,
        showStatusBar: true,
        openViewInNewTab: true,
        progressBarStyle: {
            color: "#00ccff",
            warningColor: "#ff9900",
            height: 4,
            rightToLeft: false,
        },
        noteStatusBarColor: "#ff9900",
        noteStatusBarAnimation: "Breathing",
        noteStatusBarPeriod: 2,
        flashcardStatusBarColor: "#00ccff",
        flashcardStatusBarAnimation: "Breathing",
        flashcardStatusBarPeriod: 2,
        showStatusBarDueNotification: true,
        showRuntimeDebugMessages: false,
        dataLocation: "PluginFolder",
        trackedNoteToDecks: false,
        disableFileMenuReviewOptions: false,
        licenseKey: "",
        isPro: true,
        licenseInstallationId: "",
        licenseState: null,
        ...overrides,
    };
}

function findSettingItemByName(container: HTMLElement, names: string[]): HTMLElement | null {
    return (
        Array.from(container.querySelectorAll<HTMLElement>(".setting-item")).find((item) =>
            names.some((name) => {
                const itemName = item
                    .querySelector(".setting-item-name")
                    ?.textContent?.toLowerCase();
                return itemName?.includes(name.toLowerCase());
            }),
        ) ?? null
    );
}

function renderPanel(settings: UISettingsState) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
        root.render(
            React.createElement(EmbeddedSettingsPanel, {
                settings,
                onSettingsChange: jest.fn(),
                version: "0.0.7",
            }),
        );
    });

    return {
        container,
        root,
        cleanup: () => {
            act(() => root.unmount());
            container.remove();
        },
    };
}

function openTab(container: HTMLElement, label: string) {
    const tab = Array.from(container.querySelectorAll<HTMLElement>(".sr-style-tab")).find((item) =>
        item.textContent?.includes(label),
    );

    if (!tab) {
        throw new Error(`Unable to find tab: ${label}`);
    }

    act(() => {
        tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

describe("EmbeddedSettingsPanel", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("keeps the progress bar settings as style-only controls on the UI tab", () => {
        const view = renderPanel(createSettings());

        try {
            openTab(view.container, "Interface");

            const colorItem = findSettingItemByName(view.container, ["Bar color"]);
            expect(colorItem).not.toBeNull();
            expect(
                colorItem?.querySelector(".setting-item-description")?.textContent ?? "",
            ).toContain("deck options");
            expect(findSettingItemByName(view.container, ["Show progress bar"])).toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("shows the sidebar progress controls on the Incremental Reading tab", () => {
        const view = renderPanel(createSettings());

        try {
            openTab(view.container, "Incremental");

            expect(
                findSettingItemByName(view.container, ["Show Sidebar Progress Indicator"]),
            ).not.toBeNull();
            expect(
                findSettingItemByName(view.container, ["Sidebar Progress Indicator"]),
            ).not.toBeNull();
            expect(
                findSettingItemByName(view.container, ["Sidebar Progress Indicator Color"]),
            ).not.toBeNull();
            expect(
                findSettingItemByName(view.container, ["Sidebar Progress Ring Direction"]),
            ).not.toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("keeps the sidebar progress color control for percentage mode but hides the ring direction control", () => {
        const view = renderPanel(
            createSettings({
                sidebarProgressIndicatorMode: "percentage",
            }),
        );

        try {
            openTab(view.container, "Incremental");

            expect(
                findSettingItemByName(view.container, ["Sidebar Progress Indicator"]),
            ).not.toBeNull();
            expect(
                findSettingItemByName(view.container, ["Sidebar Progress Indicator Color"]),
            ).not.toBeNull();
            expect(
                findSettingItemByName(view.container, ["Sidebar Progress Ring Direction"]),
            ).toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("hides color and direction controls when the sidebar indicator is hidden", () => {
        const view = renderPanel(
            createSettings({
                showSidebarProgressIndicator: false,
                sidebarProgressIndicatorMode: "percentage",
            }),
        );

        try {
            openTab(view.container, "Incremental");

            expect(
                findSettingItemByName(view.container, ["Sidebar Progress Indicator"]),
            ).not.toBeNull();
            expect(
                findSettingItemByName(view.container, ["Sidebar Progress Indicator Color"]),
            ).toBeNull();
            expect(
                findSettingItemByName(view.container, ["Sidebar Progress Ring Direction"]),
            ).toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("hides code context lines when code block cloze is disabled", () => {
        const view = renderPanel(createSettings({ parseClozesInCodeBlocks: false }));

        try {
            expect(findSettingItemByName(view.container, ["Code block cloze"])).not.toBeNull();
            expect(findSettingItemByName(view.container, ["Code context lines"])).toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("renders code context lines as a separate indented block directly below code block cloze", () => {
        const view = renderPanel(createSettings({ parseClozesInCodeBlocks: true }));

        try {
            const codeBlockItem = findSettingItemByName(view.container, ["Code block cloze"]);
            const codeContextItem = findSettingItemByName(view.container, ["Code context lines"]);
            const clozeContextItem = findSettingItemByName(view.container, ["Cloze context range"]);

            expect(codeBlockItem).not.toBeNull();
            expect(codeContextItem).not.toBeNull();
            expect(clozeContextItem).not.toBeNull();
            expect(codeBlockItem?.contains(codeContextItem as Node)).toBe(false);

            const codeContextWrapper = codeContextItem?.parentElement as HTMLElement | null;
            expect(codeContextWrapper).not.toBeNull();
            expect(codeBlockItem?.nextElementSibling).toBe(codeContextWrapper);
            expect(codeContextWrapper?.nextElementSibling).toBe(clozeContextItem);
            expect(codeContextWrapper?.getAttribute("style")).toContain("padding-left: 20px");
        } finally {
            view.cleanup();
        }
    });

    it("hides trim lines when long context optimization is off", () => {
        const view = renderPanel(createSettings({ clozeContextPerformanceMode: "off" }));

        try {
            expect(
                findSettingItemByName(view.container, ["Long Context Optimization"]),
            ).not.toBeNull();
            expect(findSettingItemByName(view.container, ["Trim Lines"])).toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("renders trim lines as a separate indented block directly below long context optimization", () => {
        const view = renderPanel(createSettings({ clozeContextPerformanceMode: "safe-trim" }));

        try {
            const performanceItem = findSettingItemByName(view.container, [
                "Long Context Optimization",
            ]);
            const trimLinesItem = findSettingItemByName(view.container, ["Trim Lines"]);
            const showOtherHighlightItem = findSettingItemByName(view.container, [
                "Show other highlight clozes",
            ]);

            expect(performanceItem).not.toBeNull();
            expect(trimLinesItem).not.toBeNull();
            expect(showOtherHighlightItem).not.toBeNull();
            expect(performanceItem?.contains(trimLinesItem as Node)).toBe(false);

            const trimLinesWrapper = trimLinesItem?.parentElement as HTMLElement | null;
            expect(trimLinesWrapper).not.toBeNull();
            expect(performanceItem?.nextElementSibling).toBe(trimLinesWrapper);
            expect(trimLinesWrapper?.nextElementSibling).toBe(showOtherHighlightItem);
            expect(trimLinesWrapper?.getAttribute("style")).toContain("padding-left: 20px");
        } finally {
            view.cleanup();
        }
    });
});
