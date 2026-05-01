import React from "react";
import { App, Modal } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import type SRPlugin from "src/main";
import { DeckOptionsPanel } from "src/ui/components/DeckOptionsPanel";

export interface DeckOptionsModalAnchorRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface DeckOptionsModalOptions {
    plugin: SRPlugin;
    deckName: string;
    deckPath: string;
    onSaved?: () => void;
    anchorRect?: DeckOptionsModalAnchorRect | null;
}

const MODAL_WIDTH = 720;
const MODAL_HEIGHT = 760;
const VIEWPORT_PADDING = 24;

function clamp(value: number, min: number, max: number): number {
    if (min > max) {
        return value;
    }
    return Math.min(Math.max(value, min), max);
}

function normalizeRect(rect: DOMRect): DeckOptionsModalAnchorRect {
    return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
    };
}

export function getDeckOptionsModalAnchorRect(
    anchorEl: HTMLElement | null | undefined,
): DeckOptionsModalAnchorRect | null {
    if (!anchorEl) {
        return null;
    }

    const anchorContainer =
        anchorEl.closest<HTMLElement>(".sr-deck-tree-shell") ??
        anchorEl.closest<HTMLElement>(".sr-deck-list-view") ??
        anchorEl.closest<HTMLElement>(".workspace-leaf-content") ??
        anchorEl;

    return normalizeRect(anchorContainer.getBoundingClientRect());
}

export class DeckOptionsModal extends Modal {
    private root: Root | null = null;
    private anchorBackdropEl: HTMLDivElement | null = null;
    private readonly options: DeckOptionsModalOptions;

    constructor(app: App, options: DeckOptionsModalOptions) {
        super(app);
        this.options = options;
    }

    onOpen(): void {
        this.modalEl.addClass("sr-deck-options-modal-shell");
        this.contentEl.addClass("sr-deck-options-modal-content");
        this.contentEl.empty();
        this.applyAnchorPosition();

        this.root = createRoot(this.contentEl);
        this.root.render(
            React.createElement(DeckOptionsPanel, {
                plugin: this.options.plugin,
                deckName: this.options.deckName,
                deckPath: this.options.deckPath,
                onClose: () => this.close(),
                onSaved: this.options.onSaved,
            }),
        );
    }

    onClose(): void {
        this.root?.unmount();
        this.root = null;
        this.contentEl.empty();
        this.contentEl.removeClass("sr-deck-options-modal-content");
        this.modalEl.removeClass("sr-deck-options-modal-shell");
        this.clearAnchorPosition();
    }

    private applyAnchorPosition(): void {
        const rect = this.options.anchorRect;
        if (!rect) {
            this.clearAnchorPosition();
            return;
        }

        this.applyAnchorBackdrop(rect);
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const modalWidth = Math.min(MODAL_WIDTH, viewportWidth * 0.92);
        const modalHeight = Math.min(MODAL_HEIGHT, viewportHeight * 0.82);
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const left = clamp(
            centerX,
            VIEWPORT_PADDING + modalWidth / 2,
            viewportWidth - VIEWPORT_PADDING - modalWidth / 2,
        );
        const top = clamp(
            centerY,
            VIEWPORT_PADDING + modalHeight / 2,
            viewportHeight - VIEWPORT_PADDING - modalHeight / 2,
        );

        this.modalEl.addClass("sr-deck-options-modal-shell--anchored");
        this.modalEl.style.setProperty("--sr-deck-options-modal-left", `${Math.round(left)}px`);
        this.modalEl.style.setProperty("--sr-deck-options-modal-top", `${Math.round(top)}px`);
    }

    private clearAnchorPosition(): void {
        this.modalEl.removeClass("sr-deck-options-modal-shell--anchored");
        this.modalEl.style.removeProperty("--sr-deck-options-modal-left");
        this.modalEl.style.removeProperty("--sr-deck-options-modal-top");
        this.anchorBackdropEl?.remove();
        this.anchorBackdropEl = null;
    }

    private applyAnchorBackdrop(rect: DeckOptionsModalAnchorRect): void {
        this.anchorBackdropEl?.remove();

        const backdropEl = document.createElement("div");
        backdropEl.classList.add("sr-deck-options-anchor-backdrop");
        backdropEl.style.setProperty("--sr-deck-options-anchor-left", `${Math.round(rect.left)}px`);
        backdropEl.style.setProperty("--sr-deck-options-anchor-top", `${Math.round(rect.top)}px`);
        backdropEl.style.setProperty(
            "--sr-deck-options-anchor-width",
            `${Math.round(rect.width)}px`,
        );
        backdropEl.style.setProperty(
            "--sr-deck-options-anchor-height",
            `${Math.round(rect.height)}px`,
        );
        const hostEl = this.modalEl.parentElement ?? document.body;
        hostEl.insertBefore(backdropEl, this.modalEl.parentElement ? this.modalEl : null);
        this.anchorBackdropEl = backdropEl;
    }
}
