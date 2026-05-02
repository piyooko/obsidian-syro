/** @jsxImportSource react */
import { readFileSync } from "fs";
import { join } from "path";
import React, { act } from "react";
import type SRPlugin from "src/main";
import { cloneFsrsSettings, DEFAULT_SETTINGS } from "src/settings";
import { DeckOptionsModal, getDeckOptionsModalAnchorRect } from "src/ui/modals/DeckOptionsModal";
import { t } from "src/lang/helpers";

jest.mock("obsidian");

jest.mock("src/ui/components/useMobileNavbarOffset", () => ({
    useMobileNavbarOffset: () => 0,
}));

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createPlugin(): SRPlugin {
    return {
        app: {},
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

async function clickButton(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
    });
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

describe("DeckOptionsModal", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("renders deck options inside an Obsidian modal shell and closes after save", async () => {
        const plugin = createPlugin();
        const onSaved = jest.fn();
        const modal = new DeckOptionsModal(plugin.app, {
            plugin,
            deckName: "Spanish",
            deckPath: "Spanish",
            onSaved,
        });

        act(() => modal.open());

        expect(modal.modalEl.classList.contains("sr-deck-options-modal-shell")).toBe(true);
        expect(modal.contentEl.querySelector(".sr-deck-options-anchor-panel")).not.toBeNull();
        expect(modal.contentEl.textContent).toContain(t("DECK_OPTIONS_SECTION_DAILY_LIMITS"));

        await clickButton(findButtonByText(modal.contentEl, t("DECK_OPTIONS_BTN_SAVE")));

        expect(plugin.saveDeckOptionsAndRequestSync).toHaveBeenCalledTimes(1);
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(modal.contentEl.querySelector(".sr-deck-options-anchor-panel")).toBeNull();
        expect(modal.modalEl.classList.contains("sr-deck-options-modal-shell")).toBe(false);
    });

    it("uses the deck tree anchor width for horizontal positioning and centers vertically in the viewport", () => {
        Object.defineProperty(window, "innerWidth", {
            configurable: true,
            value: 1600,
        });
        Object.defineProperty(window, "innerHeight", {
            configurable: true,
            value: 1000,
        });

        const plugin = createPlugin();
        const modal = new DeckOptionsModal(plugin.app, {
            plugin,
            deckName: "Spanish",
            deckPath: "Spanish",
            anchorRect: {
                left: 320,
                top: 120,
                width: 700,
                height: 700,
            },
        });

        act(() => modal.open());

        expect(modal.modalEl.classList.contains("sr-deck-options-modal-shell--anchored")).toBe(
            true,
        );
        expect(modal.modalEl.style.getPropertyValue("--sr-deck-options-modal-left")).toBe("670px");
        expect(modal.modalEl.style.getPropertyValue("--sr-deck-options-modal-top")).toBe("500px");
    });

    it("does not move the modal toward the top when the deck tree anchor is short", () => {
        Object.defineProperty(window, "innerWidth", {
            configurable: true,
            value: 1600,
        });
        Object.defineProperty(window, "innerHeight", {
            configurable: true,
            value: 1000,
        });

        const plugin = createPlugin();
        const modal = new DeckOptionsModal(plugin.app, {
            plugin,
            deckName: "Spanish",
            deckPath: "Spanish",
            anchorRect: {
                left: 320,
                top: 120,
                width: 700,
                height: 110,
            },
        });

        act(() => modal.open());

        expect(modal.modalEl.style.getPropertyValue("--sr-deck-options-modal-left")).toBe("670px");
        expect(modal.modalEl.style.getPropertyValue("--sr-deck-options-modal-top")).toBe("500px");
    });

    it("adds and removes a deck tree backdrop when anchored", () => {
        const plugin = createPlugin();
        const modal = new DeckOptionsModal(plugin.app, {
            plugin,
            deckName: "Spanish",
            deckPath: "Spanish",
            anchorRect: {
                left: 320,
                top: 120,
                width: 700,
                height: 700,
            },
        });

        act(() => modal.open());

        const backdrop = document.querySelector<HTMLElement>(".sr-deck-options-anchor-backdrop");
        expect(backdrop).not.toBeNull();
        expect(backdrop?.style.getPropertyValue("--sr-deck-options-anchor-left")).toBe("320px");
        expect(backdrop?.style.getPropertyValue("--sr-deck-options-anchor-top")).toBe("120px");
        expect(backdrop?.style.getPropertyValue("--sr-deck-options-anchor-width")).toBe("700px");
        expect(backdrop?.style.getPropertyValue("--sr-deck-options-anchor-height")).toBe("700px");

        act(() => modal.close());

        expect(document.querySelector(".sr-deck-options-anchor-backdrop")).toBeNull();
    });

    it("keeps the deck tree backdrop below the anchored deck options modal", () => {
        const css = readFileSync(join(process.cwd(), "src/ui/styles/settings-panel.css"), "utf8");

        expect(css).toMatch(
            /\.modal\.sr-deck-options-modal-shell\.sr-deck-options-modal-shell--anchored[\s\S]*z-index:\s*calc\(var\(--layer-modal,\s*50\)\s*\+\s*2\)/,
        );
        expect(css).toMatch(
            /\.sr-deck-options-anchor-backdrop[\s\S]*z-index:\s*calc\(var\(--layer-modal,\s*50\)\s*\+\s*1\)/,
        );
    });

    it("uses the deck tree shell instead of the clicked settings button as the anchor", () => {
        const shell = document.createElement("div");
        shell.className = "sr-deck-tree-shell";
        const button = document.createElement("button");
        shell.appendChild(button);
        document.body.appendChild(shell);

        shell.getBoundingClientRect = jest.fn(
            () =>
                ({
                    left: 300,
                    top: 80,
                    width: 800,
                    height: 720,
                    right: 1100,
                    bottom: 800,
                    x: 300,
                    y: 80,
                    toJSON: () => ({}),
                }) as DOMRect,
        );
        button.getBoundingClientRect = jest.fn(
            () =>
                ({
                    left: 1060,
                    top: 120,
                    width: 24,
                    height: 24,
                    right: 1084,
                    bottom: 144,
                    x: 1060,
                    y: 120,
                    toJSON: () => ({}),
                }) as DOMRect,
        );

        expect(getDeckOptionsModalAnchorRect(button)).toEqual({
            left: 300,
            top: 80,
            width: 800,
            height: 720,
        });
    });

    it("connects deck options modal and buttons to the deck tree square-corner style setting", () => {
        const css = readFileSync(join(process.cwd(), "src/ui/styles/settings-panel.css"), "utf8");

        expect(css).toContain(
            "body.syro-desktop-deck-tree-square-corners .modal.sr-deck-options-modal-shell",
        );
        expect(css).toContain(
            "body.syro-mobile-deck-tree-square-corners .modal.sr-deck-options-modal-shell",
        );
        expect(css).toMatch(
            /syro-desktop-deck-tree-square-corners[\s\S]*\.sr-deck-options-anchor-panel[\s\S]*button[\s\S]*border-radius:\s*0 !important/,
        );
        expect(css).toMatch(
            /syro-mobile-deck-tree-square-corners[\s\S]*\.sr-deck-options-anchor-panel[\s\S]*button[\s\S]*border-radius:\s*0 !important/,
        );
        expect(css).not.toContain(
            "body.syro-desktop-deck-tree-square-corners .sr-deck-options-anchor-panel .setting-items",
        );
        expect(css).not.toContain(
            "body.syro-mobile-deck-tree-square-corners .sr-deck-options-anchor-panel .setting-items",
        );
    });
});
