/**
 * [旧 UI 层 / 桥接层：Obsidian 原生 API 与 React 的混合地带] [桥接] 将新的 React 设置面板挂载到 Obsidian 设置页。
 */
/**
 * 设置面板 (React 版本)
 *
 * 使用 React 组件替代原有的 Obsidian 设置 API
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

// 防抖动函数：确保用户连续输入时不会频繁触发保存操作

/**
 * SRSettingTab 类 (设置面板)
 *
 * 使用 React 组件渲染现代化设置界面
 */
export class SRSettingTab extends PluginSettingTab {
    private plugin: SRPlugin;
    private root: Root | null = null;

    constructor(app: App, plugin: SRPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * 显示设置页内容
     */
    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.addClass("sr-settings-container");

        // 创建 React 挂载点
        const reactContainer = containerEl.createDiv({ cls: "sr-settings-panel" });
        this.root = createRoot(reactContainer);

        // 获取当前设置并转换为 UI 状态
        const uiSettings = settingsToUIState(this.plugin.data.settings);

        // 渲染 React 组件
        this.root.render(
            React.createElement(EmbeddedSettingsPanel, {
                settings: uiSettings,
                onSettingsChange: (newSettings) => this.handleSettingsChange(newSettings),
                version: this.plugin.manifest.version,
            }),
        );
    }

    /**
     * 处理设置变更
     */
    private handleSettingsChange(newUISettings: UISettingsState): void {
        const previousSettings = this.plugin.data.settings;
        const mergedSettings = mergeUIStateToSettings(previousSettings, newUISettings);

        // 立即更新运行时设置，保证紧接着的手动同步按新规则生效。
        this.plugin.data.settings = mergedSettings;
        this.plugin.markCardCaptureSettingsChange(previousSettings, mergedSettings);

        // 使用防抖保存
        applySettingsUpdate(async () => {
            await this.plugin.savePluginData();

            // 实时更新状态栏样式
            this.plugin.updateStatusBarStyles();
            this.plugin.updateStatusBarVisibility();
            this.plugin.updateStatusBar();

            // 实时刷新笔记复习侧边栏
            const leaves = this.app.workspace.getLeavesOfType("react-review-queue-list-view");
            for (const leaf of leaves) {
                if (leaf.view && typeof (leaf.view as any).redraw === "function") {
                    (leaf.view as any).redraw();
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
     * 隐藏/销毁设置页
     */
    hide(): void {
        // 卸载 React 组件
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        this.containerEl.empty();
    }
}
