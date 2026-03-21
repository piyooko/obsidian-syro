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
import type SRPlugin from "src/main";
import { EmbeddedSettingsPanel } from "src/ui/components/EmbeddedSettingsPanel";
import { settingsToUIState, mergeUIStateToSettings } from "src/ui/adapters/settingsAdapter";
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
        // 使用防抖保存
        applySettingsUpdate(async () => {
            // 将 UI 设置合并回完整设置
            const mergedSettings = mergeUIStateToSettings(this.plugin.data.settings, newUISettings);

            // 保存设置
            this.plugin.data.settings = mergedSettings;
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
