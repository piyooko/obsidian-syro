/**
 * 这个文件主要是干什么的：
 * [数据层] 定义数据存储位置的枚举和辅助函数。
 * 决定插件的数据（复习进度、卡片关联）是存储在插件目录下的 JSON 文件中，还是存储在 Vault 根目录，或者是分散在笔记的 Frontmatter 里。
 *
 * 它在项目中属于：数据层 (Data Layer) / 配置 (Config)
 *
 * 它会用到哪些文件：
 * 1. src/settings.ts
 *
 * 哪些文件会用到它：
 * 1. src/dataStore/data.ts
 * 2. src/location_switch.ts
 */
/**
 * [数据层：负责数据的持久化、读取和内存状态管理] [配置] 决定数据是存在 `tracked_files.json` 还是分散在笔记的 Frontmatter 中。
 */
import { SRSettings } from "src/settings";
import { t } from "src/lang/helpers";

const ROOT_DATA_PATH = "./tracked_files.json";
// const PLUGIN_DATA_PATH = "./.obsidian/plugins/syro/tracked_files.json";

// recall trackfile
export enum DataLocation {
    PluginFolder = "In Plugin Folder",
    RootFolder = "In Vault Folder",
    SpecifiedFolder = "In the folder specified below",
    SaveOnNoteFile = "Save On Note File",
}

export const locationMap: Record<string, DataLocation> = {
    "In Vault Folder": DataLocation.RootFolder,
    "In Plugin Folder": DataLocation.PluginFolder,
    "In the folder specified below": DataLocation.SpecifiedFolder,
    "Save On Note File": DataLocation.SaveOnNoteFile,
};

// Функция для получения локализованного маппинга
export function getLocalizedLocationMap(): Record<string, DataLocation> {
    return {
        [t("DATA_LOCATION_ROOT_FOLDER")]: DataLocation.RootFolder,
        [t("DATA_LOCATION_PLUGIN_FOLDER")]: DataLocation.PluginFolder,
        [t("DATA_LOCATION_SPECIFIED_FOLDER")]: DataLocation.SpecifiedFolder,
        [t("DATA_LOCATION_SAVE_ON_NOTE_FILE")]: DataLocation.SaveOnNoteFile,
    };
}

/**
 * getStorePath.
 *
 * @returns {string}
 */
export function getStorePath(manifestDir: string, settings: SRSettings): string {
    const dir = manifestDir;
    const dataLocation = settings.dataLocation;
    if (dataLocation == DataLocation.PluginFolder) {
        // return PLUGIN_DATA_PATH;
        return dir + ROOT_DATA_PATH.substring(1);
    } else if (dataLocation == DataLocation.RootFolder) {
        return ROOT_DATA_PATH;
    } else if (dataLocation == DataLocation.SpecifiedFolder) {
        return settings.customFolder;
    } else if (dataLocation == DataLocation.SaveOnNoteFile) {
        // return PLUGIN_DATA_PATH;
        return dir + ROOT_DATA_PATH.substring(1);
    }
}
