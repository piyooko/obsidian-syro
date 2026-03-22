import { Setting } from "obsidian";
import * as MixQueSet from "src/dataStore/mixQueSet";
import { applySettingsUpdate } from "src/ui/settings/applySettingsUpdate";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";
import { DEFAULT_SETTINGS } from "src/settings";

export function addmixQueueSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    const settings = plugin.data.settings;
    new Setting(containerEl)
        .setName(t("MIX_QUEUE"))
        .setDesc(t("MIX_QUEUE_DESC"))
        .addSlider((slider) =>
            slider
                .setLimits(1, 7, 1)
                .setValue(settings.mixDue + settings.mixNew)
                .setDynamicTooltip()
                .onChange((value) => {
                    applySettingsUpdate(() => {
                        settings.mixDue = Math.min(value, settings.mixDue);
                        settings.mixNew = value - settings.mixDue;
                        void update();
                    });
                }),
        )
        .addSlider((slider) =>
            slider
                .setLimits(0, Math.min(7, settings.mixDue + settings.mixNew), 1)
                .setValue(settings.mixDue)
                .setDynamicTooltip()
                .onChange((value) => {
                    applySettingsUpdate(() => {
                        settings.mixDue = value;
                        void update();
                    });
                }),
        )
        .addExtraButton((button) => {
            button
                .setIcon("reset")
                .setTooltip(t("RESET_DEFAULT"))
                .onClick(() => {
                    applySettingsUpdate(() => {
                        settings.mixDue = DEFAULT_SETTINGS.mixDue;
                        settings.mixNew = DEFAULT_SETTINGS.mixNew;
                        void update();
                    });
                });
        });

    async function update() {
        await plugin.savePluginData();
        plugin.settingTab.display();
        MixQueSet.create(settings.mixDue, settings.mixNew, settings.mixCard, settings.mixNote);
    }
}
