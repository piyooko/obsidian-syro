/**
 * [闁?UI 閻?/ 婵℃ぜ鍎茬敮瀵镐沪閸岋妇绐桹bsidian 闁告鍠撻弫?API 濞?React 闁汇劌瀚拹鈺呭触閸繃鍕鹃悽顖ｆ碀 [婵℃ぜ鍎茬敮纰?閻忓繐妫欓弻濠囨儍?React 閻犱礁澧介悿鍡涙閵忊剝绶查柟绋垮€藉ù鍥礆?Obsidian 閻犱礁澧介悿鍡樸亜閻愬厜鍋?
 */
/**
 * 閻犱礁澧介悿鍡涙閵忊剝绶?(React 闁绘鐗婂﹢?
 *
 * 濞达綀娉曢弫?React 缂備礁瀚▎銏ゅ即婢剁鏁╅柛妯煎枑濠€渚€鎯?Obsidian 閻犱礁澧介悿?API
 */
import { App, PluginSettingTab } from "obsidian";
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
    return typeof view === "object" && view !== null && "redraw" in view && typeof view.redraw === "function";
}


// 闂傚啫寮舵慨鍫ュ礉閵娿儱姣愰柡浣稿簻缁辨壆娑甸鑽ょ闁活潿鍔嶉崺娑欐交閻愮數鏁鹃弶鍫熸尭閸欏棝寮張鐢电憹濞村吋宀搁。鍓佹崲娴ｅ彨鏇㈠矗閹存粎绠介悗娑櫳戦幖閿嬫媴?

/**
 * SRSettingTab 缂?(閻犱礁澧介悿鍡涙閵忊剝绶?
 *
 * 濞达綀娉曢弫?React 缂備礁瀚▎銏犮€掗崣澶屽帬闁绘粓顣﹂崬顒勫礌閺嶎剦鍟庣紓鍐惧枤閺咁偊妫?
 */
export class SRSettingTab extends PluginSettingTab {
    private plugin: SRPlugin;
    private root: Root | null = null;

    constructor(app: App, plugin: SRPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * 闁哄嫬澧介妵姘辨媼閸撗呮瀭濡炪倝娼ч崬瀵糕偓?
     */
    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.addClass("sr-settings-container");

        // 闁告帗绋戠紓?React 闁圭鍊藉ù鍥倷?
        const reactContainer = containerEl.createDiv({ cls: "sr-settings-panel" });
        this.root = createRoot(reactContainer);

        // 闁兼儳鍢茶ぐ鍥亹閹惧啿顤呴悹浣稿⒔閻ゅ棝鐛幆鐗堢ギ闁硅婢€鐠?UI 闁绘鍩栭埀?
        const uiSettings = settingsToUIState(this.plugin.data.settings);

        // 婵炴挸寮堕悡?React 缂備礁瀚▎?
        this.root.render(
            React.createElement(EmbeddedSettingsPanel, {
                settings: uiSettings,
                onSettingsChange: (newSettings) => this.handleSettingsChange(newSettings),
                version: this.plugin.manifest.version,
            }),
        );
    }

    /**
     * 濠㈣泛瀚幃濠勬媼閸撗呮瀭闁告瑦蓱濞?
     */
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
                new ConfirmModal(this.plugin, t("SETTINGS_CARD_CAPTURE_REBUILD_CONFIRM"), (confirmed) => {
                    if (!confirmed) {
                        return;
                    }

                    void this.plugin.requestSync({ trigger: "manual", mode: "full" }).catch((error) => {
                        console.error(
                            "[SR-Settings] Failed to rebuild after card capture setting change:",
                            error,
                        );
                    });
                }).open();
            }
        });
    }

    /**
     * 闂傚懏鍔樺Λ?闂佸簱鍋撴慨锝勬祰椤旀洜绱旈鈧妴?
     */
    hide(): void {
        // 闁告鐡曞ù?React 缂備礁瀚▎?
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        this.containerEl.empty();
    }
}
