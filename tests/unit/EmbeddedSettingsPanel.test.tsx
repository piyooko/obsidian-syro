import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
    EmbeddedSettingsPanel,
    normalizeRelativeTimestampSpacing,
} from "src/ui/components/EmbeddedSettingsPanel";
import type {
    SyroDeviceCardState,
    SyroDeviceManagementViewState,
    SyroInvalidDeviceCardState,
} from "src/ui/types/syroDeviceManagement";
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

function renderPanel(
    settings: UISettingsState,
    options: {
        mobile?: boolean;
        loadSyroDeviceManagement?: () => Promise<any>;
        onSyroRenameCurrentDevice?: (deviceName: string) => Promise<boolean | void>;
        onSyroPullToCurrentDevice?: (deviceId: string) => Promise<boolean | void>;
        onSyroDeleteValidDevice?: (deviceId: string) => Promise<boolean | void>;
        onSyroOpenRecovery?: () => Promise<boolean | void>;
        onSyroDeleteInvalidDevice?: (
            deviceFolderName: string,
        ) => Promise<boolean | void>;
    } = {},
) {
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
                loadSyroDeviceManagement: options.loadSyroDeviceManagement,
                onSyroRenameCurrentDevice: options.onSyroRenameCurrentDevice,
                onSyroPullToCurrentDevice: options.onSyroPullToCurrentDevice,
                onSyroDeleteValidDevice: options.onSyroDeleteValidDevice,
                onSyroOpenRecovery: options.onSyroOpenRecovery,
                onSyroDeleteInvalidDevice: options.onSyroDeleteInvalidDevice,
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

async function flushPromises() {
    await act(async () => {
        await Promise.resolve();
    });
}

function createDeviceManagementState(
    overrides: Partial<SyroDeviceManagementViewState> = {},
): SyroDeviceManagementViewState {
    const currentDevice: SyroDeviceCardState = {
        deviceId: "cd411111-2222-3333-4444-555555555555",
        deviceName: "Desktop",
        isCurrent: true,
        footprintBytes: 2048,
        reviewCount: 18,
        lastSeenAt: "2026-04-13T00:00:00.000Z",
        latestSessionAt: "2026-04-14T00:00:00.000Z",
        lastPulledIntoCurrentAt: null,
        inactiveDays: 2,
        status: "current",
        canRename: true,
        canPullToCurrent: false,
        canDelete: false,
    };
    const peerDevice: SyroDeviceCardState = {
        deviceId: "91ac1111-2222-3333-4444-555555555555",
        deviceName: "Mobile",
        isCurrent: false,
        footprintBytes: 4096,
        reviewCount: 42,
        lastSeenAt: "2026-04-12T00:00:00.000Z",
        latestSessionAt: "2026-04-14T06:00:00.000Z",
        lastPulledIntoCurrentAt: "2026-04-13T12:00:00.000Z",
        inactiveDays: 3,
        status: "needs-sync",
        canRename: false,
        canPullToCurrent: true,
        canDelete: true,
    };
    const invalidDevice: SyroInvalidDeviceCardState = {
        deviceFolderName: "Desktop--ec3c",
        footprintBytes: 512,
        reviewCount: 13,
        lastSeenAt: "2026-04-11T00:00:00.000Z",
        invalidReason: "missing-device-json",
        files: ["settings.json", "device-state.json"],
        folders: [],
        canDelete: true,
    };

    return {
        currentDevice,
        devices: [peerDevice],
        invalidDevices: [invalidDevice],
        hasPendingAction: true,
        readOnlyReason: null,
        ...overrides,
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

function findDeviceActionButton(container: HTMLElement, label: string): HTMLButtonElement | null {
    return (
        Array.from(
            container.querySelectorAll<HTMLButtonElement>("button.sr-device-action-button"),
        ).find((button) => button.textContent?.includes(label)) ?? null
    );
}

function findSyncInfoTooltipIcon(container: HTMLElement, label: string): HTMLElement | null {
    return (
        Array.from(container.querySelectorAll<HTMLElement>(".sr-sync-info-tooltip-icon")).find(
            (element) => element.getAttribute("data-tooltip-label") === label,
        ) ?? null
    );
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

    it("adds spaces between digits and Chinese relative time units", () => {
        expect(normalizeRelativeTimestampSpacing("24小时前")).toBe("24 小时前");
        expect(normalizeRelativeTimestampSpacing("7秒钟前")).toBe("7 秒钟前");
        expect(normalizeRelativeTimestampSpacing("yesterday")).toBe("yesterday");
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

    it("shows parsing update controls on the Parsing tab and keeps them off the Sync tab", () => {
        const view = renderPanel(createSettings());

        try {
            openTab(view.container, "Parsing");

            const currentPane = view.container.querySelector<HTMLElement>(
                '.sr-style-setting-content-pane[data-pane-role="current"]',
            );
            const parsingSection = currentPane
                ? findFirstSettingGroup(currentPane)
                : null;
            expect(currentPane?.textContent).toContain("Data updates");
            expect(parsingSection?.textContent).toContain("Data updates");
            expect(
                findSettingItemByName(view.container, ["Automatic incremental parsing"]),
            ).not.toBeNull();
            expect(findSettingItemByName(view.container, ["Persist parse cache"])).not.toBeNull();
            expect(findSettingItemByName(view.container, ["Update progress tip"])).not.toBeNull();

            openTab(view.container, "Sync");
            const syncCurrentPane = view.container.querySelector<HTMLElement>(
                '.sr-style-setting-content-pane[data-pane-role="current"]',
            );

            expect(
                findSettingItemByName(syncCurrentPane ?? view.container, [
                    "Automatic incremental parsing",
                ]),
            ).toBeNull();
            expect(findSettingItemByName(syncCurrentPane ?? view.container, ["Persist parse cache"]))
                .toBeNull();
            expect(findSettingItemByName(syncCurrentPane ?? view.container, ["Update progress tip"]))
                .toBeNull();
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

    it("shows Syro device management details on the Sync tab", async () => {
        const deviceManagement = createDeviceManagementState();
        const view = renderPanel(createSettings(), {
            loadSyroDeviceManagement: async () => deviceManagement,
        });

        try {
            openTab(view.container, "Sync");
            await flushPromises();

            const primaryMetricRows = Array.from(
                view.container.querySelectorAll<HTMLElement>(
                    ".sr-device-flat-item .sr-device-inline-metrics:not(.sr-device-inline-secondary)",
                ),
            ).slice(0, 2);
            const metricLabels = primaryMetricRows.map((row) =>
                Array.from(row.querySelectorAll<HTMLElement>(".sr-device-inline-metric-label")).map(
                    (label) => label.textContent?.trim(),
                ),
            );
            const syncSummaryGroup =
                Array.from(view.container.querySelectorAll<HTMLElement>(".setting-group")).find(
                    (group) =>
                        group.textContent?.includes("Multi-device incremental sync") === true,
                ) ?? null;

            expect(syncSummaryGroup?.textContent).toContain("Multi-device incremental sync");
            expect(syncSummaryGroup?.textContent).toContain("LAB");
            expect(syncSummaryGroup?.textContent).toContain(
                'By isolating device identities, this mechanism prevents plugin data conflicts during multi-device sync and uses recorded sessions to incrementally sync data changes across devices. Before running "pull overwrite", "rebuild", or "delete", Manually back up the plugin files.',
            );
            expect(view.container.textContent).toContain("Current device");
            expect(view.container.textContent).toContain("Other devices");
            expect(view.container.textContent).toContain("Invalid devices");
            expect(view.container.textContent).toContain("Desktop");
            expect(view.container.textContent).toContain("Mobile");
            expect(view.container.textContent).toContain("Desktop--ec3c");
            expect(view.container.textContent).toContain("Missing device.JSON");
            expect(view.container.textContent).toContain("Device reviews");
            expect(view.container.textContent).toContain("Last seen");
            expect(view.container.textContent).toContain("Storage");
            expect(view.container.textContent).not.toContain("Latest session");
            expect(view.container.textContent).not.toContain("Last pulled");
            expect(view.container.textContent).not.toContain("Idle time");
            expect(metricLabels).toEqual([
                ["Storage:", "Device reviews:", "Last seen:"],
                ["Storage:", "Device reviews:", "Last seen:"],
            ]);
            const invalidCard = Array.from(
                view.container.querySelectorAll<HTMLElement>(".sr-device-flat-item"),
            ).find((item) => item.textContent?.includes("Desktop--ec3c"));
            const invalidMetricLabels = Array.from(
                invalidCard?.querySelectorAll<HTMLElement>(
                    ".sr-device-inline-secondary .sr-device-inline-metric-label",
                ) ?? [],
            ).map((label) => label.textContent?.trim());

            expect(invalidMetricLabels).toEqual(["Storage:", "Device reviews:", "Last seen:"]);
            expect(view.container.textContent).not.toContain("Device management");
            expect(view.container.textContent).not.toContain("Device ID");
            expect(view.container.textContent).not.toContain("Short ID");
            expect(view.container.textContent).not.toContain("Set as current device");
            expect(view.container.textContent).not.toContain("cd411111-2222-3333");
        } finally {
            view.cleanup();
        }
    });

    it("invokes the pull-to-current callback from the Sync tab", async () => {
        const onSyroPullToCurrentDevice = jest.fn(async () => {});
        const deviceManagement = createDeviceManagementState();
        const view = renderPanel(createSettings(), {
            loadSyroDeviceManagement: async () => deviceManagement,
            onSyroPullToCurrentDevice,
        });

        try {
            openTab(view.container, "Sync");
            await flushPromises();

            const button = findDeviceActionButton(
                view.container,
                "Pull this device data (overwrites current review progress)",
            );
            expect(button).toBeTruthy();

            await act(async () => {
                button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(onSyroPullToCurrentDevice).toHaveBeenCalledWith(
                "91ac1111-2222-3333-4444-555555555555",
            );
        } finally {
            view.cleanup();
        }
    });

    it("uses inline rename and delete icon callbacks on the Sync tab", async () => {
        const onSyroRenameCurrentDevice = jest.fn(async () => {});
        const onSyroDeleteValidDevice = jest.fn(async () => {});
        const onSyroDeleteInvalidDevice = jest.fn(async () => {});
        const view = renderPanel(createSettings(), {
            loadSyroDeviceManagement: async () => createDeviceManagementState(),
            onSyroRenameCurrentDevice,
            onSyroDeleteValidDevice,
            onSyroDeleteInvalidDevice,
        });

        try {
            openTab(view.container, "Sync");
            await flushPromises();

            const renameButton = findDeviceActionButton(view.container, "Rename device");
            expect(renameButton).not.toBeNull();
            expect(renameButton?.getAttribute("title")).toBeNull();

            await act(async () => {
                renameButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            const renameInput = view.container.querySelector(
                'input[aria-label="Rename device"]',
            ) as HTMLInputElement | null;
            expect(renameInput).not.toBeNull();
            const renameControls = Array.from(
                view.container.querySelectorAll<HTMLButtonElement>(
                    ".setting-item-control button.sr-device-action-button",
                ),
            ).filter(
                (button) =>
                    button.textContent?.includes("Cancel rename") ||
                    button.textContent?.includes("Save device name"),
            );
            expect(renameControls.map((button) => button.textContent?.trim())).toEqual([
                "Cancel rename",
                "Save device name",
            ]);

            await act(async () => {
                if (renameInput) {
                    const valueSetter = Object.getOwnPropertyDescriptor(
                        HTMLInputElement.prototype,
                        "value",
                    )?.set;
                    valueSetter?.call(renameInput, "Desktop Prime");
                    renameInput.dispatchEvent(new Event("input", { bubbles: true }));
                }
            });

            const saveRenameButton = findDeviceActionButton(view.container, "Save device name");
            expect(saveRenameButton).not.toBeNull();
            expect(saveRenameButton?.disabled).toBe(false);

            await act(async () => {
                saveRenameButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(onSyroRenameCurrentDevice).toHaveBeenCalledWith("Desktop Prime");

            const deleteButtons = Array.from(
                view.container.querySelectorAll<HTMLButtonElement>("button.sr-device-action-button"),
            ).filter((button) => button.textContent?.includes("Delete device"));
            expect(deleteButtons).toHaveLength(1);

            await act(async () => {
                deleteButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(onSyroDeleteValidDevice).toHaveBeenCalledWith(
                "91ac1111-2222-3333-4444-555555555555",
            );

            const deleteInvalidButton = findDeviceActionButton(
                view.container,
                "Delete invalid directory",
            );
            expect(deleteInvalidButton).not.toBeNull();

            await act(async () => {
                deleteInvalidButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(onSyroDeleteInvalidDevice).toHaveBeenCalledWith("Desktop--ec3c");
        } finally {
            view.cleanup();
        }
    });

    it("shows sync info tooltips without relying on title attributes", async () => {
        const view = renderPanel(createSettings(), {
            loadSyroDeviceManagement: async () => createDeviceManagementState(),
        });

        try {
            openTab(view.container, "Sync");
            await flushPromises();

            const tooltipLabels = [
                "Manually reopen the guided flow for device recovery, baseline setup, or rebuild after an abnormal state.",
                "The independent device identity bound to this installation. Multi-device sync uses it to isolate writes from different devices.",
                "Other valid devices participating in sync. They can be used as a source for baseline setup or pull-to-overwrite.",
                "Device directories with missing or damaged metadata. The system will not treat them as normal sync sources.",
            ];

            for (const tooltipLabel of tooltipLabels) {
                const icon = findSyncInfoTooltipIcon(view.container, tooltipLabel);
                expect(icon).not.toBeNull();
                expect(icon?.getAttribute("title")).toBeNull();
                expect(icon?.getAttribute("aria-label")).toBeNull();
            }

            const recoveryInfoIcon = findSyncInfoTooltipIcon(view.container, tooltipLabels[0]);
            expect(recoveryInfoIcon).not.toBeNull();

            await act(async () => {
                recoveryInfoIcon?.focus();
            });

            const tooltip = document.body.querySelector(".sr-device-action-tooltip");
            expect(tooltip).not.toBeNull();
            expect(tooltip?.textContent).toContain(tooltipLabels[0]);

            await act(async () => {
                recoveryInfoIcon?.blur();
            });

            expect(document.body.querySelector(".sr-device-action-tooltip")).toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("reloads device management in place after Sync actions and stays on the Sync tab", async () => {
        let deviceManagement = createDeviceManagementState();
        const loadSyroDeviceManagement = jest.fn(async () => deviceManagement);
        const onSyroDeleteValidDevice = jest.fn(async () => {
            deviceManagement = createDeviceManagementState({
                devices: [],
            });
            return true;
        });
        const view = renderPanel(createSettings(), {
            loadSyroDeviceManagement,
            onSyroDeleteValidDevice,
        });

        try {
            openTab(view.container, "Sync");
            await flushPromises();

            const deleteDeviceButton = findDeviceActionButton(view.container, "Delete device");
            expect(deleteDeviceButton).not.toBeNull();
            expect(loadSyroDeviceManagement).toHaveBeenCalledTimes(1);
            expect(view.container.textContent).toContain("Other devices");
            expect(view.container.textContent).toContain("Mobile");

            await act(async () => {
                deleteDeviceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });
            await flushPromises();

            expect(onSyroDeleteValidDevice).toHaveBeenCalledWith(
                "91ac1111-2222-3333-4444-555555555555",
            );
            expect(loadSyroDeviceManagement).toHaveBeenCalledTimes(2);
            expect(view.container.textContent).toContain("Other devices");
            expect(view.container.textContent).not.toContain("Mobile");
            expect(getActiveTabText(view.container)).toContain("Sync");
        } finally {
            view.cleanup();
        }
    });

    it("does not reload device management when a Sync confirmation flow is cancelled", async () => {
        const loadSyroDeviceManagement = jest.fn(async () => createDeviceManagementState());
        const onSyroDeleteValidDevice = jest.fn(async () => false);
        const view = renderPanel(createSettings(), {
            loadSyroDeviceManagement,
            onSyroDeleteValidDevice,
        });

        try {
            openTab(view.container, "Sync");
            await flushPromises();

            const deleteDeviceButton = findDeviceActionButton(view.container, "Delete device");
            expect(deleteDeviceButton).not.toBeNull();
            expect(loadSyroDeviceManagement).toHaveBeenCalledTimes(1);

            await act(async () => {
                deleteDeviceButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });
            await flushPromises();

            expect(onSyroDeleteValidDevice).toHaveBeenCalledWith(
                "91ac1111-2222-3333-4444-555555555555",
            );
            expect(loadSyroDeviceManagement).toHaveBeenCalledTimes(1);
            expect(view.container.textContent).toContain("Mobile");
            expect(getActiveTabText(view.container)).toContain("Sync");
        } finally {
            view.cleanup();
        }
    });

    it("shows a custom device action tooltip without relying on button title attributes", async () => {
        const view = renderPanel(createSettings(), {
            loadSyroDeviceManagement: async () => createDeviceManagementState(),
        });

        try {
            openTab(view.container, "Sync");
            await flushPromises();

            const renameButton = findDeviceActionButton(view.container, "Rename device");
            expect(renameButton).not.toBeNull();
            expect(renameButton?.getAttribute("title")).toBeNull();

            await act(async () => {
                renameButton?.focus();
            });

            const tooltip = document.body.querySelector(".sr-device-action-tooltip");
            expect(tooltip).not.toBeNull();
            expect(tooltip?.textContent).toContain("Rename device");

            await act(async () => {
                renameButton?.blur();
            });

            expect(document.body.querySelector(".sr-device-action-tooltip")).toBeNull();
        } finally {
            view.cleanup();
        }
    });

    it("renders device management groups as sibling setting blocks and hides the invalid group when empty", async () => {
        const view = renderPanel(createSettings(), {
            loadSyroDeviceManagement: async () =>
                createDeviceManagementState({
                    invalidDevices: [],
                }),
        });

        try {
            openTab(view.container, "Sync");
            await flushPromises();

            const deviceManagementSection = view.container.querySelector<HTMLElement>(
                ".setting-group.sr-setting-section.sr-device-management-section",
            );

            expect(deviceManagementSection).toBeTruthy();
            expect(
                deviceManagementSection?.querySelector(
                    '.setting-item.setting-item-heading > .setting-item-name',
                ),
            ).toBeNull();

            const directGroupHeadings = Array.from(deviceManagementSection?.children ?? []).filter(
                (child): child is HTMLElement =>
                    child instanceof HTMLElement && child.classList.contains("sr-device-group-heading"),
            );
            expect(directGroupHeadings).toHaveLength(2);
            expect(
                directGroupHeadings.map(
                    (heading) =>
                        heading
                            .querySelector<HTMLElement>(".sr-supporter-label-wrap > span")
                            ?.textContent?.trim() ?? null,
                ),
            ).toEqual(["Current device", "Other devices"]);

            expect(view.container.textContent).not.toContain("Invalid devices");
            expect(view.container.textContent).not.toContain(
                "There are no invalid device directories.",
            );
        } finally {
            view.cleanup();
        }
    });
});
