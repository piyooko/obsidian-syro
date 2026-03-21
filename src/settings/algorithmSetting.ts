/**
 * 算法设置逻辑
 * 属于：逻辑层 / 界面层
 *
 * 这个文件负责构建设置面板中与“复习算法”相关的设置项。
 * 它包含：
 * 1. `addCardAlgorithmSetting`: 下拉框选择卡片复习算法（如 Default, FSRS, Anki 等）。
 * 2. `addNoteAlgorithmSetting`: 下拉框选择笔记复习算法。
 * 3. 算法切换时的确认对话框（ConfirmModal），处理数据兼容性警告。
 * 4. `addCardResponseButtonTextSetting` / `addNoteResponseButtonTextSetting`: 配置评分按钮（Reset, Hard, Good, Easy）的文本。
 *
 * 当用户切换算法时，它会触发插件重载或数据迁移逻辑。
 *
 * 用到：
 * - src/algorithms/algorithms_switch (算法切换逻辑)
 * - src/ui/modals/confirm (确认框)
 *
 * 被用到：
 * - src/ui/settings/SRSettingTab.ts (构建设置页)
 * - src/ui/components/EmbeddedSettingsPanel.tsx (可能间接引用，或作为独立设置部分)
 */
import { Setting } from "obsidian";
import { algorithmNames } from "src/algorithms/algorithms";
import { algorithmSwitchData, algorithms } from "src/algorithms/algorithms_switch";
import ConfirmModal from "src/ui/modals/confirm";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";
import { applySettingsUpdate } from "src/ui/settings/applySettingsUpdate";

// Legacy migration note retained from the pre-Syro codebase.

export const DEFAULT_responseOptionBtnsText: Record<string, string[]> = {
    Default: [t("RESET"), t("HARD"), t("GOOD"), t("EASY")],
    Fsrs: [t("RESET"), t("HARD"), t("GOOD"), t("EASY")],
    Anki: [t("RESET"), t("HARD"), t("GOOD"), t("EASY")],
    SM2: ["Blackout", "Incorrect", "Incorrect (Easy)", t("HARD"), t("GOOD"), t("EASY")],
    WeightedMultiplier: [t("RESET"), t("HARD"), t("GOOD"), t("EASY")],
};

/**
 * 卡片算法设置
 */
export function addCardAlgorithmSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    const settings = plugin.data.settings;
    const desc = createFragment((frag) => {
        frag.createDiv().innerHTML = t("ALGO_CARD_SELECT_DESC");
    });

    new Setting(containerEl)
        .setName(t("ALGO_CARD_SELECT"))
        .setDesc(desc)
        .addDropdown((dropdown) => {
            Object.keys(algorithms).forEach((val) => {
                dropdown.addOption(val, val);
            });
            dropdown.setValue(plugin.data.settings.cardAlgorithm);
            dropdown.onChange((newValue) => {
                new ConfirmModal(plugin, t("ALGO_SWITCH_CONFIRM"), async (confirmed) => {
                    if (confirmed) {
                        // 直接更新设置，不进行数据迁移（卡片保留原算法数据）
                        settings.cardAlgorithm = newValue;
                        await plugin.savePluginData();

                        // 重新加载插件
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        await plugin.app.plugins.disablePlugin(plugin.manifest.id);
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        await plugin.app.plugins.enablePlugin(plugin.manifest.id);
                    } else {
                        dropdown.setValue(settings.cardAlgorithm);
                    }
                }).open();
            });
        });
}

/**
 * 笔记算法设置
 */
export function addNoteAlgorithmSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    const settings = plugin.data.settings;
    const desc = createFragment((frag) => {
        frag.createDiv().innerHTML = t("ALGO_NOTE_SELECT_DESC");
    });

    new Setting(containerEl)
        .setName(t("ALGO_NOTE_SELECT"))
        .setDesc(desc)
        .addDropdown((dropdown) => {
            Object.keys(algorithms).forEach((val) => {
                dropdown.addOption(val, val);
            });
            dropdown.setValue(plugin.data.settings.noteAlgorithm);
            dropdown.onChange((newValue) => {
                new ConfirmModal(plugin, t("ALGO_NOTE_SWITCH_CONFIRM"), async (confirmed) => {
                    if (confirmed) {
                        const oldAlgo = settings.noteAlgorithm as algorithmNames;

                        // 对笔记进行数据迁移
                        const result = await algorithmSwitchData(
                            plugin,
                            oldAlgo,
                            newValue as algorithmNames,
                        );

                        if (!result) {
                            dropdown.setValue(settings.noteAlgorithm);
                            return;
                        }

                        settings.noteAlgorithm = newValue;
                        await plugin.savePluginData();

                        // 重新加载插件
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        await plugin.app.plugins.disablePlugin(plugin.manifest.id);
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        // @ts-ignore
                        await plugin.app.plugins.enablePlugin(plugin.manifest.id);
                    } else {
                        dropdown.setValue(settings.noteAlgorithm);
                    }
                }).open();
            });
        });
}

/**
 * 显示卡片算法的特定设置
 */
export function addCardAlgorithmSpecificDisplaySetting(containerEl: HTMLElement, plugin: SRPlugin) {
    const update = async (settings: unknown, refresh: boolean) => {
        plugin.data.settings.algorithmSettings[plugin.data.settings.cardAlgorithm] = settings;
        await plugin.savePluginData();
        if (refresh) plugin.cardAlgorithm.displaySettings(containerEl, update);
    };
    plugin.cardAlgorithm.displaySettings(containerEl.createDiv(), update);
}

/**
 * 显示笔记算法的特定设置
 */
export function addNoteAlgorithmSpecificDisplaySetting(containerEl: HTMLElement, plugin: SRPlugin) {
    const update = async (settings: unknown, refresh: boolean) => {
        plugin.data.settings.algorithmSettings[plugin.data.settings.noteAlgorithm] = settings;
        await plugin.savePluginData();
        if (refresh) plugin.noteAlgorithm.displaySettings(containerEl, update);
    };
    plugin.noteAlgorithm.displaySettings(containerEl.createDiv(), update);
}

/**
 * 卡片响应按钮文本设置
 */
export function addCardResponseButtonTextSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    containerEl.empty();
    const options = plugin.cardAlgorithm.srsOptions();
    const settings = plugin.data.settings;
    const algo = settings.cardAlgorithm;
    const btnText = settings.responseOptionBtnsText;

    if (btnText[algo] == null) {
        btnText[algo] = [];
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        options.forEach((opt, ind) => (btnText[algo][ind] = t(opt.toUpperCase())));
    }

    options.forEach((opt, ind) => {
        const btnTextEl = new Setting(containerEl)
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            .setName(t("FLASHCARD_" + opt.toUpperCase() + "_LABEL"))
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            .setDesc(t("FLASHCARD_" + opt.toUpperCase() + "_DESC"));
        btnTextEl.addText((text) =>
            text.setValue(btnText[algo][ind]).onChange((value) => {
                applySettingsUpdate(() => {
                    btnText[algo][ind] = value;
                    plugin.savePluginData();
                });
            }),
        );
        btnTextEl.addExtraButton((button) => {
            button
                .setIcon("reset")
                .setTooltip(t("RESET_DEFAULT"))
                .onClick(() => {
                    settings.responseOptionBtnsText[algo][ind] =
                        DEFAULT_responseOptionBtnsText[algo][ind];
                    plugin.savePluginData();
                    addCardResponseButtonTextSetting(containerEl, plugin);
                });
        });
    });
}

/**
 * 笔记响应按钮文本设置
 */
export function addNoteResponseButtonTextSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    containerEl.empty();
    const options = plugin.noteAlgorithm.srsOptions();
    const settings = plugin.data.settings;
    const algo = settings.noteAlgorithm;
    const btnText = settings.responseOptionBtnsText;

    if (btnText[algo] == null) {
        btnText[algo] = [];
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        options.forEach((opt, ind) => (btnText[algo][ind] = t(opt.toUpperCase())));
    }

    options.forEach((opt, ind) => {
        const btnTextEl = new Setting(containerEl)
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            .setName(t("FLASHCARD_" + opt.toUpperCase() + "_LABEL"))
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            .setDesc(t("FLASHCARD_" + opt.toUpperCase() + "_DESC"));
        btnTextEl.addText((text) =>
            text.setValue(btnText[algo][ind]).onChange((value) => {
                applySettingsUpdate(() => {
                    btnText[algo][ind] = value;
                    plugin.savePluginData();
                });
            }),
        );
        btnTextEl.addExtraButton((button) => {
            button
                .setIcon("reset")
                .setTooltip(t("RESET_DEFAULT"))
                .onClick(() => {
                    settings.responseOptionBtnsText[algo][ind] =
                        DEFAULT_responseOptionBtnsText[algo][ind];
                    plugin.savePluginData();
                    addNoteResponseButtonTextSetting(containerEl, plugin);
                });
        });
    });
}

// ===== 保留旧函数用于兼容性 =====
export function addAlgorithmSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    // 默认调用笔记算法设置（向后兼容）
    addNoteAlgorithmSetting(containerEl, plugin);
}

export function addAlgorithmSpecificDisplaySetting(containerEl: HTMLElement, plugin: SRPlugin) {
    // 默认调用笔记算法设置显示（向后兼容）
    addNoteAlgorithmSpecificDisplaySetting(containerEl, plugin);
}

export function addResponseButtonTextSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    // 默认调用笔记算法按钮文本设置（向后兼容）
    addNoteResponseButtonTextSetting(containerEl, plugin);
}
