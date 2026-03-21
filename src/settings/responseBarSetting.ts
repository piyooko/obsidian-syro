import { Setting } from "obsidian";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";

export function addResponseFloatBarSetting(containerEl: HTMLElement, plugin: SRPlugin) {
    // const plugin = this.plugin;

    new Setting(containerEl)
        .setName(t("REVIEW_FLOATBAR"))
        .setDesc(t("REVIEW_FLOATBAR_DESC"))
        .addToggle((toggle) => {
            toggle.setValue(plugin.data.settings.reviewResponseFloatBar).onChange((newValue) => {
                plugin.data.settings.reviewResponseFloatBar = newValue;
                plugin.savePluginData();
            });
        });
}
