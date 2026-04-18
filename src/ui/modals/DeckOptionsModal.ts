import React from "react";
import { App, Modal } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import SRPlugin from "src/main";
import { DeckOptionsPanel } from "src/ui/components/DeckOptionsPanel";

export class DeckOptionsModal extends Modal {
    private readonly plugin: SRPlugin;
    private readonly deckPath: string;
    private readonly onSaveCallback?: () => void;
    private reactRoot: Root | null = null;

    constructor(app: App, plugin: SRPlugin, deckPath: string, onSaveCallback?: () => void) {
        super(app);
        this.plugin = plugin;
        this.deckPath = deckPath;
        this.onSaveCallback = onSaveCallback;
    }

    onOpen() {
        this.modalEl.addClass("sr-deck-options-modal-shell");
        this.contentEl.addClass("sr-deck-options-modal-host");
        this.contentEl.empty();
        this.reactRoot = createRoot(this.contentEl);
        const deckName = this.deckPath.split("/").pop() ?? this.deckPath;

        this.reactRoot.render(
            React.createElement(DeckOptionsPanel, {
                plugin: this.plugin,
                deckName,
                deckPath: this.deckPath,
                containerElement: this.modalEl,
                preferredWidth: 680,
                onClose: () => this.close(),
                onSaved: () => this.onSaveCallback?.(),
            }),
        );
    }

    onClose() {
        this.reactRoot?.unmount();
        this.reactRoot = null;
        this.modalEl.removeClass("sr-deck-options-modal-shell");
        this.contentEl.removeClass("sr-deck-options-modal-host");
        this.contentEl.empty();
    }
}
