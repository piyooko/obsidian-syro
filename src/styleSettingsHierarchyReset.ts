import type { App, WorkspaceLeaf } from "obsidian";

type StyleSettingsLeafView = {
    setSettings?: (settings: StyleSettingsSection[], errors: unknown[]) => void;
    rerender?: () => void;
};

type StyleSettingsLeaf = WorkspaceLeaf & {
    view: StyleSettingsLeafView;
};

type StyleSettingsManagerLike = {
    settings: Record<string, unknown>;
    save: () => Promise<void>;
    removeClasses: () => void;
    initClasses: () => void;
};

type StyleSettingsHeading = {
    id: string;
    type: string;
    level?: number;
    resetFn?: () => void;
};

type StyleSettingsSection = {
    id: string;
    settings?: StyleSettingsHeading[];
};

type StyleSettingsTabLike = {
    setSettings?: (settings: StyleSettingsSection[], errors: unknown[]) => void;
    rerender?: () => void;
};

type StyleSettingsPluginLike = {
    app: App;
    settingsManager: StyleSettingsManagerLike;
    settingsList: StyleSettingsSection[];
    errorList: unknown[];
    settingsTab?: StyleSettingsTabLike;
    parseCSS: () => void;
    __syroHierarchyResetPatched?: boolean;
};

const STYLE_SETTINGS_PLUGIN_IDS = ["obsidian-style-settings", "style-settings"] as const;
const STYLE_SETTINGS_VIEW_TYPE = "style-settings";
const SYRO_SECTION_PREFIX = "syro-";
const HEADING_TYPE = "heading";
const THEME_SUFFIXES = ["@@light", "@@dark"] as const;
const RERENDER_DELAY_MS = 180;

function getStyleSettingsPlugin(app: App): StyleSettingsPluginLike | null {
    const plugins = (app as App & {
        plugins?: {
            plugins?: Record<string, unknown>;
        };
    }).plugins?.plugins;

    if (!plugins) {
        return null;
    }

    for (const pluginId of STYLE_SETTINGS_PLUGIN_IDS) {
        const plugin = plugins[pluginId];
        if (plugin) {
            return plugin as StyleSettingsPluginLike;
        }
    }

    return null;
}

function getHeadingChildrenIds(settings: StyleSettingsHeading[], headingIndex: number): string[] {
    const heading = settings[headingIndex];
    const currentLevel = heading.level ?? 0;
    const childrenIds: string[] = [];

    for (let index = headingIndex + 1; index < settings.length; index++) {
        const candidate = settings[index];
        if ((candidate.level ?? 0) <= currentLevel && candidate.type === HEADING_TYPE) {
            break;
        }

        if (candidate.type !== HEADING_TYPE) {
            childrenIds.push(candidate.id);
        }
    }

    return childrenIds;
}

function clearSettingValue(
    settingsManager: StyleSettingsManagerLike,
    sectionId: string,
    settingId: string,
): boolean {
    const baseKey = `${sectionId}@@${settingId}`;
    let changed = false;

    if (Object.prototype.hasOwnProperty.call(settingsManager.settings, baseKey)) {
        delete settingsManager.settings[baseKey];
        changed = true;
    }

    for (const suffix of THEME_SUFFIXES) {
        const themedKey = `${baseKey}${suffix}`;
        if (Object.prototype.hasOwnProperty.call(settingsManager.settings, themedKey)) {
            delete settingsManager.settings[themedKey];
            changed = true;
        }
    }

    return changed;
}

function refreshStyleSettingsUi(plugin: StyleSettingsPluginLike): void {
    plugin.settingsTab?.setSettings?.(plugin.settingsList, plugin.errorList);
    plugin.settingsTab?.rerender?.();

    const leaves = plugin.app.workspace.getLeavesOfType(STYLE_SETTINGS_VIEW_TYPE) as StyleSettingsLeaf[];
    for (const leaf of leaves) {
        leaf.view.setSettings?.(plugin.settingsList, plugin.errorList);
        leaf.view.rerender?.();
    }
}

function applyHierarchyResetFns(plugin: StyleSettingsPluginLike): boolean {
    let updated = false;

    for (const section of plugin.settingsList ?? []) {
        if (!section?.id?.startsWith(SYRO_SECTION_PREFIX) || !Array.isArray(section.settings)) {
            continue;
        }

        section.settings.forEach((setting, index) => {
            if (setting.type !== HEADING_TYPE || (setting.level ?? 0) < 2) {
                return;
            }

            const childIds = getHeadingChildrenIds(section.settings ?? [], index);
            if (childIds.length === 0) {
                return;
            }

            setting.resetFn = () => {
                let hasChanges = false;

                for (const childId of childIds) {
                    hasChanges =
                        clearSettingValue(plugin.settingsManager, section.id, childId) || hasChanges;
                }

                if (!hasChanges) {
                    refreshStyleSettingsUi(plugin);
                    return;
                }

                plugin.settingsManager.removeClasses();
                plugin.settingsManager.initClasses();

                void plugin.settingsManager.save().finally(() => {
                    refreshStyleSettingsUi(plugin);
                });
            };
            updated = true;
        });
    }

    return updated;
}

export function installStyleSettingsHierarchyResetSupport(app: App): boolean {
    const plugin = getStyleSettingsPlugin(app);
    if (!plugin) {
        return false;
    }

    if (!plugin.__syroHierarchyResetPatched) {
        const originalParseCss = plugin.parseCSS.bind(plugin);
        plugin.parseCSS = () => {
            originalParseCss();
            window.setTimeout(() => {
                if (applyHierarchyResetFns(plugin)) {
                    refreshStyleSettingsUi(plugin);
                }
            }, RERENDER_DELAY_MS);
        };
        plugin.__syroHierarchyResetPatched = true;
    }

    if (applyHierarchyResetFns(plugin)) {
        refreshStyleSettingsUi(plugin);
    }

    return true;
}
