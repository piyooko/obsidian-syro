import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { EmbeddedSettingsPanel } from "src/ui/components/EmbeddedSettingsPanel";
import type { UISettingsState } from "src/ui/types/settingsTypes";

jest.mock("obsidian", () => {
    const platform = {
        isMobile: false,
    };

    return {
        Notice: class Notice {
            constructor(_message?: string) {}
        },
        Platform: platform,
        moment: {
            locale: () => "en",
        },
    };
});

const { Platform: platformMock } = jest.requireMock("obsidian") as {
    Platform: { isMobile: boolean };
};

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
        sidebarFilePathTooltipEnabled: true,
        sidebarFilePathTooltipDelayMs: 1000,
        showScrollPercentage: true,
        autoExpandTimeline: true,
        timelineAllowUntrackedNotes: false,
        timelineAutoFollowReviewCards: false,
        timelineAutoCommitReviewSelection: true,
        timelineEnableDurationPrefixSyntax: true,
        fsrsEnableFuzz: true,
        wmsImpMin: "1",
        wmsImpMax: "2.5",
        wmsBaseEase: 250,
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
        Array.from(
            container.querySelectorAll<HTMLElement>(".setting-item:not(.setting-item-heading)"),
        ).find((item) =>
            names.some((name) => {
                const itemName = item
                    .querySelector(".setting-item-name")
                    ?.textContent?.toLowerCase();
                return itemName?.includes(name.toLowerCase());
            }),
        ) ?? null
    );
}

function findFirstSettingGroup(container: HTMLElement): HTMLElement | null {
    return container.querySelector<HTMLElement>(".setting-group");
}

function renderPanel(settings: UISettingsState, options: { mobile?: boolean } = {}) {
    const container = document.createElement("div");
    container.classList.add("sr-settings-container");
    document.body.appendChild(container);
    const isMobile = options.mobile === true;
    document.body.classList.toggle("is-mobile", isMobile);
    platformMock.isMobile = isMobile;
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
            document.body.classList.remove("is-mobile");
            platformMock.isMobile = false;
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

function getActiveTabText(container: HTMLElement): string {
    return container.querySelector<HTMLElement>(".sr-style-tab-active")?.textContent ?? "";
}

function dispatchTouchEvent(
    target: HTMLElement,
    type: "touchstart" | "touchmove" | "touchend",
    x: number,
    y: number,
) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const touch = { clientX: x, clientY: y, target };

    Object.defineProperty(event, "touches", {
        value: type === "touchend" ? [] : [touch],
    });
    Object.defineProperty(event, "changedTouches", {
        value: [touch],
    });

    act(() => {
        target.dispatchEvent(event);
    });
}

function swipeElement(
    target: HTMLElement,
    start: { x: number; y: number },
    end: { x: number; y: number },
) {
    dispatchTouchEvent(target, "touchstart", start.x, start.y);
    dispatchTouchEvent(target, "touchmove", end.x, end.y);
    dispatchTouchEvent(target, "touchend", end.x, end.y);
}

describe("EmbeddedSettingsPanel", () => {
    afterEach(() => {
        document.body.classList.remove("is-mobile");
        platformMock.isMobile = false;
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
            expect(
                findSettingItemByName(view.container, ["Show File Path Tooltip"]),
            ).not.toBeNull();
            expect(
                findSettingItemByName(view.container, ["File Path Tooltip Delay"]),
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
            expect(codeContextWrapper?.classList.contains("sr-setting-subgroup")).toBe(true);
            expect(codeContextWrapper?.getAttribute("style")).toBeNull();
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

    it("explains that cloze context range only changes display context, not same-line Anki linkage", () => {
        const view = renderPanel(createSettings());

        try {
            const clozeContextItem = findSettingItemByName(view.container, ["Cloze context range"]);
            expect(clozeContextItem).not.toBeNull();
            expect(
                clozeContextItem?.querySelector(".setting-item-description")?.textContent ?? "",
            ).toContain("same-number Anki clozes");
            expect(
                clozeContextItem?.querySelector(".setting-item-description")?.textContent ?? "",
            ).toContain("current line");
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
            expect(trimLinesWrapper?.classList.contains("sr-setting-subgroup")).toBe(true);
            expect(trimLinesWrapper?.getAttribute("style")).toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("keeps separator inputs opt-in inline on mobile", () => {
        const view = renderPanel(createSettings(), { mobile: true });

        try {
            const inlineRows = Array.from(
                view.container.querySelectorAll<HTMLElement>(
                    ".setting-item.setting-item--mobile-inline",
                ),
            );

            expect(inlineRows).toHaveLength(2);
            expect(
                inlineRows.every((row) => row.querySelector('input[type="text"]') !== null),
            ).toBe(true);
        } finally {
            view.cleanup();
        }
    });

    it("shows only the FSRS random due drift toggle on the algorithm tab", () => {
        const view = renderPanel(createSettings());

        try {
            openTab(view.container, "Algorithm");

            expect(
                findSettingItemByName(view.container, ["Random due drift", "Fuzzing"]),
            ).not.toBeNull();
            expect(view.container.textContent ?? "").not.toContain(
                "industry-leading memory scheduling algorithm",
            );
        } finally {
            view.cleanup();
        }
    });

    it("hides the WMS simulator on mobile while keeping the base parameter inputs", () => {
        const view = renderPanel(createSettings(), { mobile: true });

        try {
            openTab(view.container, "Algorithm");

            expect(view.container.querySelector(".sr-wms-simulator")).toBeNull();
            expect(
                findSettingItemByName(view.container, ["Random due drift", "Fuzzing"]),
            ).not.toBeNull();
            expect(view.container.textContent ?? "").toContain("Base multiplier configuration");
        } finally {
            view.cleanup();
        }
    });

    it("keeps the compact WMS simulator input on desktop with its dedicated class", () => {
        const view = renderPanel(createSettings());

        try {
            openTab(view.container, "Algorithm");

            const compactInput = view.container.querySelector(
                '.sr-wms-simulator input.sr-input-compact[type="number"]',
            ) as HTMLInputElement | null;

            expect(compactInput).not.toBeNull();
            expect(compactInput?.value).toBe("10");
        } finally {
            view.cleanup();
        }
    });

    it("renders toggles as checkbox containers wrapping native checkbox inputs", () => {
        const view = renderPanel(createSettings());

        try {
            const toggleContainer = view.container.querySelector(".mod-toggle .checkbox-container");
            const toggleInput = toggleContainer?.querySelector('input[type="checkbox"]');

            expect(toggleContainer).not.toBeNull();
            expect(toggleContainer?.tagName).toBe("LABEL");
            expect(toggleContainer?.getAttribute("tabindex")).toBe("0");
            expect(toggleInput).not.toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("shows LAB badges on experimental timeline settings and keeps them off by default", () => {
        const view = renderPanel(createSettings());

        try {
            openTab(view.container, "Incremental");

            const untrackedItem = findSettingItemByName(view.container, [
                "Allow Timeline For Untracked Notes",
            ]);
            const reviewCardItem = findSettingItemByName(view.container, [
                "Follow Current Review Card Note",
            ]);

            expect(untrackedItem?.querySelector(".sr-supporter-badge")?.textContent).toContain(
                "LAB",
            );
            expect(reviewCardItem?.querySelector(".sr-supporter-badge")?.textContent).toContain(
                "LAB",
            );
            expect(
                (untrackedItem?.querySelector('input[type="checkbox"]') as HTMLInputElement | null)
                    ?.checked,
            ).toBe(false);
            expect(
                (reviewCardItem?.querySelector('input[type="checkbox"]') as HTMLInputElement | null)
                    ?.checked,
            ).toBe(false);
        } finally {
            view.cleanup();
        }
    });

    it("keeps mobile toggle rows on a dedicated control cell with the native checkbox container", () => {
        const view = renderPanel(createSettings(), { mobile: true });

        try {
            const toggleItem = view.container.querySelector(
                ".setting-item.mod-toggle",
            ) as HTMLElement | null;
            const toggleControl = toggleItem?.querySelector(".setting-item-control");
            const toggleContainer = toggleControl?.querySelector(".checkbox-container");

            expect(toggleItem).not.toBeNull();
            expect(toggleControl).not.toBeNull();
            expect(toggleContainer).not.toBeNull();
            expect(toggleContainer?.querySelector('input[type="checkbox"]')).not.toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("keeps mobile action rows inline with their button in the control cell", () => {
        const view = renderPanel(createSettings({ isPro: false }), { mobile: true });

        try {
            openTab(view.container, "License");

            const actionItem = view.container.querySelector(
                ".setting-item.setting-item--action",
            ) as HTMLElement | null;
            const actionControl = actionItem?.querySelector(".setting-item-control");
            const actionButton = actionControl?.querySelector("button") as HTMLButtonElement | null;

            expect(actionItem).not.toBeNull();
            expect(actionItem?.className).toContain("setting-item--mobile-inline");
            expect(actionControl).not.toBeNull();
            expect(actionButton).not.toBeNull();
            expect(actionButton?.closest(".setting-item-control")).toBe(actionControl);
            expect(actionButton?.getAttribute("style")).toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("renders sections with Obsidian-style setting-group headings", () => {
        const view = renderPanel(createSettings());

        try {
            const firstGroup = findFirstSettingGroup(view.container);
            const heading = firstGroup?.querySelector(
                ".setting-item.setting-item-heading",
            ) as HTMLElement | null;
            const headingName = heading?.querySelector(".setting-item-name");
            const headingControl = heading?.querySelector(".setting-item-control");
            const groupItems = firstGroup?.querySelector(".setting-items");

            expect(firstGroup).not.toBeNull();
            expect(heading).not.toBeNull();
            expect(headingName?.textContent).toBeTruthy();
            expect(headingControl).not.toBeNull();
            expect(groupItems).not.toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("renders narrow input rows with official setting-item structure without JS-only stack marker classes", () => {
        const previousInnerWidth = window.innerWidth;
        Object.defineProperty(window, "innerWidth", {
            configurable: true,
            value: 320,
        });

        const view = renderPanel(createSettings(), { mobile: true });

        try {
            openTab(view.container, "Incremental");

            const textareaItem = findSettingItemByName(view.container, ["Ignored tags"]);
            const numberItem = findSettingItemByName(view.container, ["File Path Tooltip Delay"]);
            const selectItem = findSettingItemByName(view.container, [
                "Sidebar Progress Ring Direction",
            ]);
            const numberInput = numberItem?.querySelector(
                'input[type="number"]',
            ) as HTMLInputElement | null;
            const selectInput = selectItem?.querySelector("select") as HTMLSelectElement | null;
            const textarea = textareaItem?.querySelector("textarea") as HTMLTextAreaElement | null;

            expect(textareaItem).not.toBeNull();
            expect(numberItem).not.toBeNull();
            expect(selectItem).not.toBeNull();
            expect(numberInput).not.toBeNull();
            expect(selectInput).not.toBeNull();
            expect(textarea).not.toBeNull();
            expect(textareaItem?.className).toContain("setting-item--textarea");
            expect(textareaItem?.className).not.toContain("setting-item--textarea-input");
            expect(textareaItem?.className).not.toContain("sr-mobile-stack");
            expect(numberItem?.className).not.toContain("sr-mobile-stack");
            expect(selectItem?.className).not.toContain("sr-mobile-stack");
            expect(numberItem?.className).not.toContain("setting-item--number-input");
            expect(selectItem?.className).not.toContain("setting-item--select-input");
            expect(numberInput?.getAttribute("style")).toBeNull();
            expect(selectInput?.getAttribute("style")).toBeNull();
            expect(textarea?.getAttribute("style")).toBeNull();
        } finally {
            Object.defineProperty(window, "innerWidth", {
                configurable: true,
                value: previousInnerWidth,
            });
            view.cleanup();
        }
    });

    it("renders the license intro as plain text without the custom support card", () => {
        const view = renderPanel(createSettings());

        try {
            openTab(view.container, "License");

            expect(view.container.querySelector(".sr-settings-support-card")).toBeNull();
            expect(
                view.container.querySelector(".sr-settings-license-note")?.textContent,
            ).toBeTruthy();
        } finally {
            view.cleanup();
        }
    });

    it("keeps the mobile license key input flexible without an inline fixed width", () => {
        const view = renderPanel(createSettings({ isPro: false }), { mobile: true });

        try {
            openTab(view.container, "License");

            const licenseRow = view.container
                .querySelector(".sr-license-key-input")
                ?.closest(".setting-item") as HTMLElement | null;
            const licenseInput = view.container.querySelector(
                ".sr-license-key-input",
            ) as HTMLInputElement | null;

            expect(licenseRow).not.toBeNull();
            expect(licenseRow?.className).not.toContain("setting-item--text-input");
            expect(licenseInput).not.toBeNull();
            expect(licenseInput?.getAttribute("style")).toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("keeps header dragging scroll-only and suppresses accidental tab changes", () => {
        const view = renderPanel(createSettings());

        try {
            const header = view.container.querySelector(
                ".sr-style-setting-header",
            ) as HTMLElement | null;
            const incrementalTab = Array.from(
                view.container.querySelectorAll<HTMLElement>(".sr-style-tab"),
            ).find((tab) => tab.textContent?.includes("Incremental"));

            expect(header).not.toBeNull();
            expect(incrementalTab).not.toBeNull();

            swipeElement(header as HTMLElement, { x: 220, y: 20 }, { x: 90, y: 26 });

            act(() => {
                incrementalTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(getActiveTabText(view.container)).toContain("Flashcards");
        } finally {
            view.cleanup();
        }
    });

    it("switches tabs when the settings content area is swiped horizontally", () => {
        jest.useFakeTimers();
        const view = renderPanel(createSettings());

        try {
            const content = view.container.querySelector(
                ".sr-style-setting-content",
            ) as HTMLElement | null;
            expect(content).not.toBeNull();
            expect(
                view.container.querySelectorAll(".sr-style-setting-content-pane[data-pane-role]")
                    .length,
            ).toBe(3);
            expect(
                view.container.querySelectorAll(".sr-style-setting-content-pane-body").length,
            ).toBe(3);
            expect(
                view.container.querySelectorAll(".sr-style-setting-content-pane-scroll").length,
            ).toBe(3);
            expect(
                view.container.querySelectorAll(".sr-style-setting-content-pane-inner").length,
            ).toBe(3);
            expect(
                view.container.querySelector(
                    '.sr-style-setting-content-pane[data-pane-role="next"][data-tab-id="notes"]',
                ),
            ).not.toBeNull();

            dispatchTouchEvent(content as HTMLElement, "touchstart", 240, 180);
            dispatchTouchEvent(content as HTMLElement, "touchmove", 160, 188);

            expect(
                view.container.querySelector(
                    '.sr-style-setting-content-pane[data-pane-role="next"][data-tab-id="notes"]',
                ),
            ).not.toBeNull();
            expect(
                view.container
                    .querySelector<HTMLElement>(".sr-style-setting-content-track")
                    ?.style.getPropertyValue("--sr-swipe-offset"),
            ).toContain("-80px");

            dispatchTouchEvent(content as HTMLElement, "touchend", 110, 188);
            expect(getActiveTabText(view.container)).toContain("Incremental");
            expect(
                view.container
                    .querySelector<HTMLElement>(
                        '.sr-style-setting-content-pane[data-pane-role="current"]',
                    )
                    ?.getAttribute("data-tab-id"),
            ).toBe("flashcards");
            act(() => {
                jest.advanceTimersByTime(240);
            });
            expect(getActiveTabText(view.container)).toContain("Incremental");
            expect(
                view.container
                    .querySelector<HTMLElement>(".sr-style-setting-content-track")
                    ?.style.getPropertyValue("--sr-swipe-offset"),
            ).toBe("0px");

            swipeElement(content as HTMLElement, { x: 110, y: 180 }, { x: 250, y: 186 });
            expect(getActiveTabText(view.container)).toContain("Flashcards");
            act(() => {
                jest.advanceTimersByTime(240);
            });
            expect(getActiveTabText(view.container)).toContain("Flashcards");
            expect(
                view.container
                    .querySelector<HTMLElement>(".sr-style-setting-content-track")
                    ?.style.getPropertyValue("--sr-swipe-offset"),
            ).toBe("0px");
        } finally {
            jest.useRealTimers();
            view.cleanup();
        }
    });

    it("resets the newly active tab content to the top after switching tabs", () => {
        const view = renderPanel(createSettings());

        try {
            const currentScroll = view.container.querySelector(
                '.sr-style-setting-content-pane[data-pane-role="current"] .sr-style-setting-content-pane-scroll',
            ) as HTMLDivElement | null;

            expect(currentScroll).not.toBeNull();
            if (currentScroll) {
                currentScroll.scrollTop = 180;
            }

            openTab(view.container, "Incremental");

            const nextCurrentScroll = view.container.querySelector(
                '.sr-style-setting-content-pane[data-pane-role="current"] .sr-style-setting-content-pane-scroll',
            ) as HTMLDivElement | null;

            expect(nextCurrentScroll).not.toBeNull();
            expect(nextCurrentScroll?.scrollTop).toBe(0);
        } finally {
            view.cleanup();
        }
    });

    it("resets the next current pane scroll position after a swipe-driven tab switch", () => {
        jest.useFakeTimers();
        const view = renderPanel(createSettings());

        try {
            const content = view.container.querySelector(
                ".sr-style-setting-content",
            ) as HTMLElement | null;
            const currentScroll = view.container.querySelector(
                '.sr-style-setting-content-pane[data-pane-role="current"] .sr-style-setting-content-pane-scroll',
            ) as HTMLDivElement | null;

            expect(content).not.toBeNull();
            expect(currentScroll).not.toBeNull();

            if (currentScroll) {
                currentScroll.scrollTop = 220;
            }

            dispatchTouchEvent(content as HTMLElement, "touchstart", 240, 180);
            dispatchTouchEvent(content as HTMLElement, "touchmove", 160, 188);
            dispatchTouchEvent(content as HTMLElement, "touchend", 110, 188);

            act(() => {
                jest.advanceTimersByTime(240);
            });

            const nextCurrentScroll = view.container.querySelector(
                '.sr-style-setting-content-pane[data-pane-role="current"] .sr-style-setting-content-pane-scroll',
            ) as HTMLDivElement | null;

            expect(getActiveTabText(view.container)).toContain("Incremental");
            expect(nextCurrentScroll?.scrollTop).toBe(0);
        } finally {
            jest.useRealTimers();
            view.cleanup();
        }
    });

    it("switches tabs when swiping from the empty bottom area on a short mobile page", () => {
        jest.useFakeTimers();
        const view = renderPanel(createSettings(), { mobile: true });

        try {
            openTab(view.container, "License");

            const content = view.container.querySelector(
                ".sr-style-setting-content",
            ) as HTMLElement | null;
            expect(content).not.toBeNull();

            dispatchTouchEvent(content as HTMLElement, "touchstart", 110, 620);
            dispatchTouchEvent(content as HTMLElement, "touchmove", 250, 626);
            dispatchTouchEvent(content as HTMLElement, "touchend", 250, 626);

            act(() => {
                jest.advanceTimersByTime(240);
            });

            expect(getActiveTabText(view.container)).toContain("Sync");
        } finally {
            jest.useRealTimers();
            view.cleanup();
        }
    });

    it("does not switch tabs when swiping from excluded interactive controls", () => {
        const view = renderPanel(createSettings());

        try {
            const textInput = view.container.querySelector(
                'input[type="text"]',
            ) as HTMLElement | null;
            const select = view.container.querySelector("select") as HTMLElement | null;
            const toggleInput = view.container.querySelector(
                '.mod-toggle input[type="checkbox"]',
            ) as HTMLElement | null;

            expect(textInput).not.toBeNull();
            expect(select).not.toBeNull();
            expect(toggleInput).not.toBeNull();

            swipeElement(textInput as HTMLElement, { x: 220, y: 120 }, { x: 70, y: 126 });
            expect(getActiveTabText(view.container)).toContain("Flashcards");

            swipeElement(select as HTMLElement, { x: 220, y: 120 }, { x: 70, y: 126 });
            expect(getActiveTabText(view.container)).toContain("Flashcards");

            swipeElement(toggleInput as HTMLElement, { x: 220, y: 120 }, { x: 70, y: 126 });
            expect(getActiveTabText(view.container)).toContain("Flashcards");

            openTab(view.container, "Incremental");
            const textArea = view.container.querySelector("textarea") as HTMLElement | null;
            expect(textArea).not.toBeNull();

            swipeElement(textArea as HTMLElement, { x: 220, y: 220 }, { x: 70, y: 226 });
            expect(getActiveTabText(view.container)).toContain("Incremental");

            openTab(view.container, "Interface");
            const rangeInput = view.container.querySelector(
                'input[type="range"]',
            ) as HTMLElement | null;
            const colorInput = view.container.querySelector(
                'input[type="color"]',
            ) as HTMLElement | null;

            expect(rangeInput).not.toBeNull();
            expect(colorInput).not.toBeNull();

            swipeElement(rangeInput as HTMLElement, { x: 220, y: 240 }, { x: 70, y: 246 });
            expect(getActiveTabText(view.container)).toContain("Interface");

            swipeElement(colorInput as HTMLElement, { x: 220, y: 240 }, { x: 70, y: 246 });
            expect(getActiveTabText(view.container)).toContain("Interface");

            openTab(view.container, "License");
            const actionButton = view.container.querySelector(
                ".setting-item--action button",
            ) as HTMLElement | null;

            expect(actionButton).not.toBeNull();

            swipeElement(actionButton as HTMLElement, { x: 220, y: 180 }, { x: 70, y: 186 });
            expect(getActiveTabText(view.container)).toContain("License");
        } finally {
            view.cleanup();
        }
    });
});
