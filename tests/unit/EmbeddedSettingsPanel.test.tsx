import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { EmbeddedSettingsPanel } from "src/ui/components/EmbeddedSettingsPanel";
import type { UISettingsState } from "src/ui/types/settingsTypes";

jest.mock("obsidian", () => ({
    Notice: class Notice {
        // No-op test double for settings interactions.
        constructor(_message?: string) {}
    },
    moment: {
        locale: () => "en",
    },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;

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
        enableCardLevelTrace: false,
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
            names.some((name) => item.querySelector(".setting-item-name")?.textContent?.includes(name)),
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
                version: "0.0.6",
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

describe("EmbeddedSettingsPanel", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("hides code context lines when code block cloze is disabled", () => {
        const view = renderPanel(createSettings({ parseClozesInCodeBlocks: false }));

        try {
            expect(findSettingItemByName(view.container, ["Code block cloze", "代码块填空"])).not.toBeNull();
            expect(findSettingItemByName(view.container, ["Code context lines", "代码上下文行数"])).toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("renders code context lines as a separate indented block directly below code block cloze", () => {
        const view = renderPanel(createSettings({ parseClozesInCodeBlocks: true }));

        try {
            const codeBlockItem = findSettingItemByName(view.container, ["Code block cloze", "代码块填空"]);
            const codeContextItem = findSettingItemByName(view.container, [
                "Code context lines",
                "代码上下文行数",
            ]);
            const clozeContextItem = findSettingItemByName(view.container, [
                "Cloze context range",
                "Cloze 上下文范围",
            ]);

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
});
