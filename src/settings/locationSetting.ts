import { Setting } from "obsidian";
import { DataLocation, getLocalizedLocationMap } from "src/dataStore/dataLocation";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";

export function addDataLocationSettings(containerEl: HTMLElement, plugin: SRPlugin) {
    containerEl.empty();

    new Setting(containerEl)
        .setName(t("DATA_LOC"))
        .setDesc(t("DATA_LOC_DESC"))
        .addDropdown((dropdown) => {
            const localizedMap = getLocalizedLocationMap();
            Object.entries(localizedMap).forEach(([localizedName, dataLocation]) => {
                if (dataLocation === DataLocation.PluginFolder) {
                    dropdown.addOption(dataLocation, localizedName);
                }
            });

            if (plugin.data.settings.dataLocation !== DataLocation.PluginFolder) {
                plugin.data.settings.dataLocation = DataLocation.PluginFolder;
                void plugin.savePluginData();
            }

            dropdown.setValue(DataLocation.PluginFolder);
            dropdown.setDisabled(true);
        });
}
