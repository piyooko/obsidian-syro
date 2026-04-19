/** @jsxImportSource react */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type SRPlugin from "src/main";
import { t } from "src/lang/helpers";
import { cloneFsrsSettings, DEFAULT_SETTINGS } from "src/settings";
import { DeckOptionsPanel } from "src/ui/components/DeckOptionsPanel";

jest.mock("obsidian");

jest.mock("src/ui/components/useMobileNavbarOffset", () => ({
    useMobileNavbarOffset: () => 0,
}));

const { Notice: mockNotice } = jest.requireMock("obsidian") as {
    Notice: jest.Mock;
};

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function installMockResizeObserver() {
    const originalResizeObserver = globalThis.ResizeObserver;

    class MockResizeObserver {
        static instances: MockResizeObserver[] = [];
        private readonly callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
            this.callback = callback;
            MockResizeObserver.instances.push(this);
        }

        observe() {}

        unobserve() {}

        disconnect() {}

        trigger() {
            this.callback([], this as unknown as ResizeObserver);
        }
    }

    Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: MockResizeObserver,
    });

    return {
        restore() {
            if (originalResizeObserver) {
                Object.defineProperty(globalThis, "ResizeObserver", {
                    configurable: true,
                    value: originalResizeObserver,
                });
                return;
            }

            delete (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver })
                .ResizeObserver;
        },
    };
}

function setElementClientSize(element: HTMLElement, width: number, height: number) {
    Object.defineProperty(element, "clientWidth", {
        configurable: true,
        value: width,
    });
    Object.defineProperty(element, "clientHeight", {
        configurable: true,
        value: height,
    });
}

function createPlugin(): SRPlugin {
    return {
        deckTree: null,
        data: {
            settings: {
                ...DEFAULT_SETTINGS,
                fsrsSettings: cloneFsrsSettings(DEFAULT_SETTINGS.fsrsSettings),
                deckOptionsPresets: [
                    {
                        ...DEFAULT_SETTINGS.deckOptionsPresets[0],
                        fsrs: cloneFsrsSettings(
                            DEFAULT_SETTINGS.deckOptionsPresets[0]?.fsrs ??
                                DEFAULT_SETTINGS.fsrsSettings,
                        ),
                    },
                ],
                deckPresetAssignment: {},
            },
        },
        saveDeckOptionsAndRequestSync: jest.fn(async () => ({
            status: "executed",
        })),
    } as unknown as SRPlugin;
}

function findInputByLabel(container: HTMLElement, label: string): HTMLInputElement {
    const settingItem =
        Array.from(container.querySelectorAll<HTMLElement>(".setting-item")).find(
            (item) => item.querySelector(".setting-item-name")?.textContent === label,
        ) ?? null;

    const input = settingItem?.querySelector("input") as HTMLInputElement | null;
    if (!input) {
        throw new Error(`Unable to find input for label: ${label}`);
    }

    return input;
}

function findButtonByText(container: HTMLElement, label: string): HTMLButtonElement {
    const button =
        Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
            (item) => item.textContent?.trim() === label,
        ) ?? null;

    if (!button) {
        throw new Error(`Unable to find button: ${label}`);
    }

    return button;
}

function changeInputValue(input: HTMLInputElement, value: string) {
    const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
    )?.set;

    if (!valueSetter) {
        throw new Error("Unable to resolve HTMLInputElement.value setter");
    }

    act(() => {
        valueSetter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function clickButton(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
    });
}

function renderPanel() {
    const resizeObserver = installMockResizeObserver();
    const renderTarget = document.createElement("div");
    const panelHost = document.createElement("div");
    setElementClientSize(panelHost, 960, 720);
    document.body.appendChild(renderTarget);
    document.body.appendChild(panelHost);

    const root = createRoot(renderTarget);
    const plugin = createPlugin();
    const onClose = jest.fn();
    const onSaved = jest.fn();

    act(() => {
        root.render(
            <DeckOptionsPanel
                plugin={plugin}
                deckName="Spanish"
                deckPath="Spanish"
                containerElement={panelHost}
                preferredWidth={680}
                onClose={onClose}
                onSaved={onSaved}
            />,
        );
    });

    return {
        container: renderTarget,
        plugin,
        onClose,
        onSaved,
        cleanup() {
            act(() => root.unmount());
            resizeObserver.restore();
            renderTarget.remove();
            panelHost.remove();
        },
    };
}

describe("DeckOptionsPanel", () => {
    afterEach(() => {
        mockNotice.mockClear();
        document.body.innerHTML = "";
    });

    it("keeps intermediate step edits instead of snapping back to the last valid value", () => {
        const view = renderPanel();

        try {
            const learningStepsInput = findInputByLabel(
                view.container,
                t("DECK_OPTIONS_LEARNING_STEPS"),
            );

            changeInputValue(learningStepsInput, "1m 10");
            expect(learningStepsInput.value).toBe("1m 10");

            changeInputValue(learningStepsInput, "1m ");
            expect(learningStepsInput.value).toBe("1m ");
        } finally {
            view.cleanup();
        }
    });

    it("blocks save and shows a notice when step input is still invalid", async () => {
        const view = renderPanel();

        try {
            const learningStepsInput = findInputByLabel(
                view.container,
                t("DECK_OPTIONS_LEARNING_STEPS"),
            );
            changeInputValue(learningStepsInput, "1m 10");

            await clickButton(findButtonByText(view.container, t("DECK_OPTIONS_BTN_SAVE")));

            expect(mockNotice).toHaveBeenCalledWith(t("DECK_OPTIONS_INVALID_STEP_FORMAT"));
            expect(view.plugin.saveDeckOptionsAndRequestSync).not.toHaveBeenCalled();
            expect(view.onClose).not.toHaveBeenCalled();
            expect(learningStepsInput.value).toBe("1m 10");
        } finally {
            view.cleanup();
        }
    });

    it("persists parsed fsrs step arrays after the user corrects the input", async () => {
        const view = renderPanel();

        try {
            const learningStepsInput = findInputByLabel(
                view.container,
                t("DECK_OPTIONS_LEARNING_STEPS"),
            );

            changeInputValue(learningStepsInput, "1m 10");
            await clickButton(findButtonByText(view.container, t("DECK_OPTIONS_BTN_SAVE")));

            changeInputValue(learningStepsInput, "2m 20m");
            await clickButton(findButtonByText(view.container, t("DECK_OPTIONS_BTN_SAVE")));

            expect(view.plugin.saveDeckOptionsAndRequestSync).toHaveBeenCalledTimes(1);
            expect(view.onSaved).toHaveBeenCalledTimes(1);
            expect(view.onClose).toHaveBeenCalledTimes(1);
            expect(view.plugin.data.settings.deckOptionsPresets[0]?.learningSteps).toBe("2m 20m");
            expect(view.plugin.data.settings.deckOptionsPresets[0]?.fsrs?.learning_steps).toEqual([
                "2m",
                "20m",
            ]);
            expect(view.plugin.data.settings.fsrsSettings.learning_steps).toEqual([
                "2m",
                "20m",
            ]);
        } finally {
            view.cleanup();
        }
    });

    it("creates a preset with a stable uuid and assigns the current deck to it on save", async () => {
        const view = renderPanel();

        try {
            await clickButton(findButtonByText(view.container, "+"));
            const presetNameInput = findInputByLabel(
                view.container,
                t("DECK_OPTIONS_PRESET_NAME"),
            );
            changeInputValue(presetNameInput, "Focused");

            await clickButton(findButtonByText(view.container, t("DECK_OPTIONS_BTN_SAVE")));

            expect(view.plugin.saveDeckOptionsAndRequestSync).toHaveBeenCalledTimes(1);
            expect(view.plugin.data.settings.deckOptionsPresets).toHaveLength(2);
            const createdPreset = view.plugin.data.settings.deckOptionsPresets.find(
                (preset) => preset.uuid !== DEFAULT_SETTINGS.deckOptionsPresets[0]?.uuid,
            );
            expect(createdPreset).toEqual(
                expect.objectContaining({
                    uuid: expect.any(String),
                    createdAt: expect.any(String),
                    name: "Focused",
                }),
            );
            expect(view.plugin.data.settings.deckPresetAssignment["Spanish"]).toBe(
                createdPreset?.uuid,
            );
        } finally {
            view.cleanup();
        }
    });

    it("deletes a created preset by uuid and clears the current deck assignment on save", async () => {
        const view = renderPanel();

        try {
            await clickButton(findButtonByText(view.container, "+"));
            await clickButton(
                findButtonByText(view.container, t("DECK_OPTIONS_BTN_DELETE_PRESET")),
            );
            await clickButton(findButtonByText(view.container, t("DECK_OPTIONS_BTN_SAVE")));

            expect(view.plugin.saveDeckOptionsAndRequestSync).toHaveBeenCalledTimes(1);
            expect(view.plugin.data.settings.deckOptionsPresets).toHaveLength(1);
            expect(view.plugin.data.settings.deckOptionsPresets[0]?.uuid).toBe(
                DEFAULT_SETTINGS.deckOptionsPresets[0]?.uuid,
            );
            expect(view.plugin.data.settings.deckPresetAssignment["Spanish"]).toBeUndefined();
        } finally {
            view.cleanup();
        }
    });
});
