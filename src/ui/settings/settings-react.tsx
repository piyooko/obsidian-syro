import { App, Notice, PluginSettingTab } from "obsidian";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { t } from "src/lang/helpers";
import type SRPlugin from "src/main";
import { EmbeddedSettingsPanel } from "src/ui/components/EmbeddedSettingsPanel";
import { settingsToUIState, mergeUIStateToSettings } from "src/ui/adapters/settingsAdapter";
import ConfirmModal from "src/ui/modals/confirm";
import { UISettingsState } from "src/ui/types/settingsTypes";
import { applySettingsUpdate } from "./applySettingsUpdate";

type RedrawableView = {
    redraw: () => void;
};

function isRedrawableView(view: unknown): view is RedrawableView {
    return (
        typeof view === "object" &&
        view !== null &&
        "redraw" in view &&
        typeof view.redraw === "function"
    );
}


export class SRSettingTab extends PluginSettingTab {
    private plugin: SRPlugin;
    private root: Root | null = null;

    constructor(app: App, plugin: SRPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.addClass("sr-settings-container");

        const reactContainer = containerEl.createDiv({ cls: "sr-settings-react-root" });
        this.root = createRoot(reactContainer);

        const uiSettings = settingsToUIState(this.plugin.data.settings);

        this.root.render(
            React.createElement(EmbeddedSettingsPanel, {
                settings: uiSettings,
                onSettingsChange: (newSettings) => this.handleSettingsChange(newSettings),
                version: this.plugin.manifest.version,
            }),
        );
    }

    private handleSettingsChange(newUISettings: UISettingsState): void {
        const previousSettings = this.plugin.data.settings;
        const mergedSettings = mergeUIStateToSettings(previousSettings, newUISettings);

        this.plugin.data.settings = mergedSettings;
        this.plugin.markCardCaptureSettingsChange(previousSettings, mergedSettings);

        applySettingsUpdate(() => {
            void this.plugin.savePluginData();

            this.plugin.updateStatusBarStyles();
            this.plugin.updateStatusBarVisibility();
            this.plugin.updateStatusBar();

            const leaves = this.app.workspace.getLeavesOfType("react-review-queue-list-view");
            for (const leaf of leaves) {
                if (isRedrawableView(leaf.view)) {
                    leaf.view.redraw();
                }
            }

            if (this.plugin.consumePendingCardCaptureRebuildPrompt()) {
                new ConfirmModal(
                    this.plugin,
                    t("SETTINGS_CARD_CAPTURE_REBUILD_CONFIRM"),
                    (confirmed) => {
                        if (!confirmed) {
                            return;
                        }

                        void this.plugin
                            .requestSync({ trigger: "manual", mode: "full" })
                            .then((result) => {
                                if (result.status === "queued") {
                                    new Notice(t("SETTINGS_CARD_CAPTURE_REBUILD_QUEUED"));
                                }
                            })
                            .catch((error) => {
                                console.error(
                                    "[SR-Settings] Failed to rebuild after card capture setting change:",
                                    error,
                                );
                            });
                    },
                ).open();
            }
        });
    }

    hide(): void {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        this.containerEl.empty();
    }
}
