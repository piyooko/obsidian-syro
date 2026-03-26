import { App, ButtonComponent, Modal, Notice, Setting } from "obsidian";
import {
    cloneFolderTrackingRule,
    DEFAULT_FOLDER_TRACKING_RULE,
    formatFolderTrackingTagInput,
    parseFolderTrackingTagInput,
} from "src/folderTracking";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";

export class FolderTrackingSettingsModal extends Modal {
    private readonly plugin: SRPlugin;
    private readonly folderPath: string;
    private readonly hasExistingRule: boolean;
    private trackFolder: boolean;
    private autoTag: boolean;
    private tagsInput: string;

    constructor(app: App, plugin: SRPlugin, folderPath: string) {
        super(app);
        this.plugin = plugin;
        this.folderPath = folderPath;

        const existingRule = plugin.getFolderTrackingRule(folderPath);
        this.hasExistingRule = existingRule !== null;
        const initialRule = existingRule ?? {
            ...cloneFolderTrackingRule(DEFAULT_FOLDER_TRACKING_RULE),
            track: true,
        };

        this.trackFolder = initialRule.track;
        this.autoTag = initialRule.autoTag;
        this.tagsInput = formatFolderTrackingTagInput(initialRule.tags);
    }

    onOpen(): void {
        this.modalEl.addClass("sr-folder-tracking-modal-shell");
        this.contentEl.addClass("sr-settings-panel", "sr-folder-tracking-panel");
        this.render();
    }

    onClose(): void {
        this.modalEl.removeClass("sr-folder-tracking-modal-shell");
        this.contentEl.removeClass("sr-settings-panel", "sr-folder-tracking-panel");
        this.contentEl.empty();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();

        const headerEl = contentEl.createDiv({ cls: "sr-style-setting-header" });
        const headerTabsEl = headerEl.createDiv({ cls: "sr-style-setting-tab-group" });
        headerTabsEl.createDiv({
            cls: "sr-folder-tracking-title",
            text: t("FOLDER_TRACKING_TITLE"),
        });

        contentEl.createDiv({
            cls: "sr-folder-tracking-path",
            text: this.folderPath,
        });

        const bodyEl = contentEl.createDiv({ cls: "sr-folder-tracking-body" });

        const trackingSection = this.createSection(bodyEl, t("FOLDER_TRACKING_SECTION_TRACKING"));
        new Setting(trackingSection)
            .setName(t("FOLDER_TRACKING_TRACK_FOLDER"))
            .setDesc(t("FOLDER_TRACKING_TRACK_FOLDER_DESC"))
            .addToggle((toggle) =>
                toggle.setValue(this.trackFolder).onChange((value) => {
                    this.trackFolder = value;
                    this.render();
                }),
            );

        if (this.trackFolder) {
            const tagSection = this.createSection(bodyEl, t("FOLDER_TRACKING_SECTION_TAGS"));
            new Setting(tagSection)
                .setName(t("FOLDER_TRACKING_AUTO_TAGS"))
                .setDesc(t("FOLDER_TRACKING_AUTO_TAGS_DESC"))
                .addToggle((toggle) =>
                    toggle.setValue(this.autoTag).onChange((value) => {
                        this.autoTag = value;
                        this.render();
                    }),
                );

            if (this.autoTag) {
                const tagsSetting = new Setting(tagSection)
                    .setName(t("FOLDER_TRACKING_TAGS"))
                    .setDesc(t("FOLDER_TRACKING_TAGS_DESC"));
                tagsSetting.settingEl.addClass("sr-folder-tracking-tags-setting");
                tagsSetting.controlEl.empty();

                const textareaEl = tagsSetting.controlEl.createEl("textarea", {
                    cls: "sr-folder-tracking-textarea",
                });
                textareaEl.placeholder = t("FOLDER_TRACKING_TAGS_PLACEHOLDER");
                textareaEl.rows = 4;
                textareaEl.value = this.tagsInput;
                textareaEl.addEventListener("input", () => {
                    this.tagsInput = textareaEl.value;
                });
            }
        }

        const footerEl = contentEl.createDiv({ cls: "sr-folder-tracking-footer" });
        footerEl.createDiv({
            cls: "sr-folder-tracking-footer-note",
            text: t("FOLDER_TRACKING_FOOTER_NOTE"),
        });

        const actionsEl = footerEl.createDiv({ cls: "sr-folder-tracking-actions" });

        if (this.hasExistingRule) {
            new ButtonComponent(actionsEl).setButtonText(t("FOLDER_TRACKING_RESET")).onClick(() => {
                void (async () => {
                    await this.plugin.resetFolderTrackingRuleConfig(this.folderPath);
                    new Notice(t("FOLDER_TRACKING_RESET_SUCCESS"));
                    this.close();
                })();
            });
        }

        new ButtonComponent(actionsEl).setButtonText(t("CANCEL")).onClick(() => {
            this.close();
        });

        new ButtonComponent(actionsEl)
            .setButtonText(t("DECK_OPTIONS_BTN_SAVE"))
            .setCta()
            .onClick(() => {
                void (async () => {
                    await this.plugin.saveFolderTrackingRuleConfig(this.folderPath, {
                        track: this.trackFolder,
                        autoTag: this.trackFolder ? this.autoTag : false,
                        tags: parseFolderTrackingTagInput(this.tagsInput),
                    });
                    new Notice(t("FOLDER_TRACKING_SAVE_SUCCESS"));
                    this.close();
                })();
            });
    }

    private createSection(parent: HTMLElement, title: string): HTMLElement {
        const sectionEl = parent.createDiv({ cls: "sr-setting-section" });
        sectionEl.createDiv({ cls: "setting-item-heading", text: title });
        return sectionEl.createDiv({ cls: "setting-items" });
    }
}
