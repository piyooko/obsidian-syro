import { Setting } from "obsidian";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";

export function addMultiClozeSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    new Setting(containerEl)
        .setName(t("MULTI_CLOZE"))
        .setDesc(t("MULTI_CLOZE_DESC"))
        .addToggle((toggle) => {
            toggle.setValue(plugin.data.settings.multiClozeCard).onChange((newValue) => {
                plugin.data.settings.multiClozeCard = newValue;
                plugin.savePluginData();
            });
        });
}
