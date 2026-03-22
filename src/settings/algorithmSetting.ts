/**
 * 绠楁硶璁剧疆閫昏緫
 * 灞炰簬锛氶€昏緫灞?/ 鐣岄潰灞?
 *
 * 杩欎釜鏂囦欢璐熻矗鏋勫缓璁剧疆闈㈡澘涓笌鈥滃涔犵畻娉曗€濈浉鍏崇殑璁剧疆椤广€?
 * 瀹冨寘鍚細
 * 1. `addCardAlgorithmSetting`: 涓嬫媺妗嗛€夋嫨鍗＄墖澶嶄範绠楁硶锛堝 Default, FSRS, Anki 绛夛級銆?
 * 2. `addNoteAlgorithmSetting`: 涓嬫媺妗嗛€夋嫨绗旇澶嶄範绠楁硶銆?
 * 3. 绠楁硶鍒囨崲鏃剁殑纭瀵硅瘽妗嗭紙ConfirmModal锛夛紝澶勭悊鏁版嵁鍏煎鎬ц鍛娿€?
 * 4. `addCardResponseButtonTextSetting` / `addNoteResponseButtonTextSetting`: 閰嶇疆璇勫垎鎸夐挳锛圧eset, Hard, Good, Easy锛夌殑鏂囨湰銆?
 *
 * 褰撶敤鎴峰垏鎹㈢畻娉曟椂锛屽畠浼氳Е鍙戞彃浠堕噸杞芥垨鏁版嵁杩佺Щ閫昏緫銆?
 *
 * 鐢ㄥ埌锛?
 * - src/algorithms/algorithms_switch (绠楁硶鍒囨崲閫昏緫)
 * - src/ui/modals/confirm (纭妗?
 *
 * 琚敤鍒帮細
 * - src/ui/settings/SRSettingTab.ts (鏋勫缓璁剧疆椤?
 * - src/ui/components/EmbeddedSettingsPanel.tsx (鍙兘闂存帴寮曠敤锛屾垨浣滀负鐙珛璁剧疆閮ㄥ垎)
 */
import { Setting } from "obsidian";
import { algorithmNames } from "src/algorithms/algorithms";
import { algorithmSwitchData, algorithms } from "src/algorithms/algorithms_switch";
import ConfirmModal from "src/ui/modals/confirm";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";
import { applySettingsUpdate } from "src/ui/settings/applySettingsUpdate";

type PluginController = {
    disablePlugin(id: string): Promise<void>;
    enablePlugin(id: string): Promise<void>;
};

type TranslationKey = Parameters<typeof t>[0];

// Legacy migration note retained from the pre-Syro codebase.

export const DEFAULT_responseOptionBtnsText: Record<string, string[]> = {
    Default: [t("RESET"), t("HARD"), t("GOOD"), t("EASY")],
    Fsrs: [t("RESET"), t("HARD"), t("GOOD"), t("EASY")],
    Anki: [t("RESET"), t("HARD"), t("GOOD"), t("EASY")],
    SM2: ["Blackout", "Incorrect", "Incorrect (Easy)", t("HARD"), t("GOOD"), t("EASY")],
    WeightedMultiplier: [t("RESET"), t("HARD"), t("GOOD"), t("EASY")],
};

function runAsync(task: Promise<void>, label: string): void {
    void task.catch((error: unknown) => {
        console.error(`[algorithmSetting] ${label}`, error);
    });
}

function getPluginController(plugin: SRPlugin): PluginController {
    return (plugin.app as unknown as { plugins: PluginController }).plugins;
}

async function reloadPlugin(plugin: SRPlugin): Promise<void> {
    const pluginController = getPluginController(plugin);
    await pluginController.disablePlugin(plugin.manifest.id);
    await pluginController.enablePlugin(plugin.manifest.id);
}

function getResponseLabelKey(opt: string): TranslationKey {
    return `FLASHCARD_${opt.toUpperCase()}_LABEL` as TranslationKey;
}

function getResponseDescKey(opt: string): TranslationKey {
    return `FLASHCARD_${opt.toUpperCase()}_DESC` as TranslationKey;
}

/**
 * 鍗＄墖绠楁硶璁剧疆
 */
export function addCardAlgorithmSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    const settings = plugin.data.settings;
    const desc = createFragment((frag) => {
        frag.createDiv({ text: t("ALGO_CARD_SELECT_DESC") });
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
                new ConfirmModal(plugin, t("ALGO_SWITCH_CONFIRM"), (confirmed) => {
                    if (!confirmed) {
                        dropdown.setValue(settings.cardAlgorithm);
                        return;
                    }

                    runAsync(
                        (async () => {
                            settings.cardAlgorithm = newValue;
                            await plugin.savePluginData();
                            await reloadPlugin(plugin);
                        })(),
                        "Failed to switch card algorithm.",
                    );
                }).open();
            });
        });
}

/**
 * 绗旇绠楁硶璁剧疆
 */
export function addNoteAlgorithmSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    const settings = plugin.data.settings;
    const desc = createFragment((frag) => {
        frag.createDiv({ text: t("ALGO_NOTE_SELECT_DESC") });
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
                new ConfirmModal(plugin, t("ALGO_NOTE_SWITCH_CONFIRM"), (confirmed) => {
                    if (!confirmed) {
                        dropdown.setValue(settings.noteAlgorithm);
                        return;
                    }

                    runAsync(
                        (async () => {
                            const oldAlgo = settings.noteAlgorithm as algorithmNames;
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
                            await reloadPlugin(plugin);
                        })(),
                        "Failed to switch note algorithm.",
                    );
                }).open();
            });
        });
}

/**
 * 鏄剧ず鍗＄墖绠楁硶鐨勭壒瀹氳缃?
 */
export function addCardAlgorithmSpecificDisplaySetting(containerEl: HTMLElement, plugin: SRPlugin) {
    const update = (settings: unknown, refresh?: boolean): void => {
        runAsync(
            (async () => {
                plugin.data.settings.algorithmSettings[plugin.data.settings.cardAlgorithm] = settings;
                await plugin.savePluginData();
                if (refresh) {
                    plugin.cardAlgorithm.displaySettings(containerEl, update);
                }
            })(),
            "Failed to update card algorithm settings.",
        );
    };
    plugin.cardAlgorithm.displaySettings(containerEl.createDiv(), update);
}

/**
 * 鏄剧ず绗旇绠楁硶鐨勭壒瀹氳缃?
 */
export function addNoteAlgorithmSpecificDisplaySetting(containerEl: HTMLElement, plugin: SRPlugin) {
    const update = (settings: unknown, refresh?: boolean): void => {
        runAsync(
            (async () => {
                plugin.data.settings.algorithmSettings[plugin.data.settings.noteAlgorithm] = settings;
                await plugin.savePluginData();
                if (refresh) {
                    plugin.noteAlgorithm.displaySettings(containerEl, update);
                }
            })(),
            "Failed to update note algorithm settings.",
        );
    };
    plugin.noteAlgorithm.displaySettings(containerEl.createDiv(), update);
}

/**
 * 鍗＄墖鍝嶅簲鎸夐挳鏂囨湰璁剧疆
 */
export function addCardResponseButtonTextSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    containerEl.empty();
    const options = plugin.cardAlgorithm.srsOptions();
    const settings = plugin.data.settings;
    const algo = settings.cardAlgorithm;
    const btnText = settings.responseOptionBtnsText;

    if (btnText[algo] == null) {
        btnText[algo] = [];
        options.forEach((opt, ind) => (btnText[algo][ind] = t(opt.toUpperCase() as TranslationKey)));
    }

    options.forEach((opt, ind) => {
        const btnTextEl = new Setting(containerEl)
            .setName(t(getResponseLabelKey(opt)))
            .setDesc(t(getResponseDescKey(opt)));
        btnTextEl.addText((text) =>
            text.setValue(btnText[algo][ind]).onChange((value) => {
                applySettingsUpdate(() => {
                    btnText[algo][ind] = value;
                    void plugin.savePluginData();
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
                    void plugin.savePluginData();
                    addCardResponseButtonTextSetting(containerEl, plugin);
                });
        });
    });
}

/**
 * 绗旇鍝嶅簲鎸夐挳鏂囨湰璁剧疆
 */
export function addNoteResponseButtonTextSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    containerEl.empty();
    const options = plugin.noteAlgorithm.srsOptions();
    const settings = plugin.data.settings;
    const algo = settings.noteAlgorithm;
    const btnText = settings.responseOptionBtnsText;

    if (btnText[algo] == null) {
        btnText[algo] = [];
        options.forEach((opt, ind) => (btnText[algo][ind] = t(opt.toUpperCase() as TranslationKey)));
    }

    options.forEach((opt, ind) => {
        const btnTextEl = new Setting(containerEl)
            .setName(t(getResponseLabelKey(opt)))
            .setDesc(t(getResponseDescKey(opt)));
        btnTextEl.addText((text) =>
            text.setValue(btnText[algo][ind]).onChange((value) => {
                applySettingsUpdate(() => {
                    btnText[algo][ind] = value;
                    void plugin.savePluginData();
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
                    void plugin.savePluginData();
                    addNoteResponseButtonTextSetting(containerEl, plugin);
                });
        });
    });
}

// ===== 淇濈暀鏃у嚱鏁扮敤浜庡吋瀹规€?=====
export function addAlgorithmSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    // 榛樿璋冪敤绗旇绠楁硶璁剧疆锛堝悜鍚庡吋瀹癸級
    addNoteAlgorithmSetting(containerEl, plugin);
}

export function addAlgorithmSpecificDisplaySetting(containerEl: HTMLElement, plugin: SRPlugin) {
    // 榛樿璋冪敤绗旇绠楁硶璁剧疆鏄剧ず锛堝悜鍚庡吋瀹癸級
    addNoteAlgorithmSpecificDisplaySetting(containerEl, plugin);
}

export function addResponseButtonTextSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    // 榛樿璋冪敤绗旇绠楁硶鎸夐挳鏂囨湰璁剧疆锛堝悜鍚庡吋瀹癸級
    addNoteResponseButtonTextSetting(containerEl, plugin);
}
