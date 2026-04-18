/**
 * 牌组选项模态框
 * 属于：界面层
 *
 * 复用设置面板的分组和控件样式，让牌组选项与主设置界面保持一致。
 */
import { App, Modal, Notice, Setting } from "obsidian";
import SRPlugin from "src/main";
import { t } from "src/lang/helpers";
import {
    createDefaultDeckOptionsPreset,
    createNewDeckOptionsPreset,
    DeckOptionsPreset,
    DEFAULT_DECK_OPTIONS_PRESET_UUID,
    findDeckOptionsPresetIndexByUuid,
    getDeckOptionsPresetDisplayName,
    normalizeDeckOptionsPreset,
    normalizeDeckOptionsPresets,
    syncFsrsSettingsCompatibilityMirror,
    updateDeckOptionsPresetStepProxy,
} from "src/settings";

export class DeckOptionsModal extends Modal {
    private plugin: SRPlugin;
    private deckName: string;
    private currentPresetUuid: string;
    private onSaveCallback?: () => void;

    constructor(app: App, plugin: SRPlugin, deckName: string, onSaveCallback?: () => void) {
        super(app);
        this.plugin = plugin;
        this.deckName = deckName;
        this.onSaveCallback = onSaveCallback;
        this.currentPresetUuid =
            this.plugin.data.settings.deckPresetAssignment[deckName] ??
            DEFAULT_DECK_OPTIONS_PRESET_UUID;
    }

    onOpen() {
        this.modalEl.addClass("sr-deck-options-modal-shell");
        this.contentEl.addClass("sr-settings-panel", "sr-deck-options-panel");
        this.render();
    }

    onClose() {
        this.modalEl.removeClass("sr-deck-options-modal-shell");
        this.contentEl.removeClass("sr-settings-panel", "sr-deck-options-panel");
        this.contentEl.empty();
    }

    private render() {
        const { contentEl } = this;
        contentEl.empty();

        const layoutEl = contentEl.createDiv({ cls: "sr-deck-options-layout" });
        this.renderHeader(layoutEl);

        const bodyEl = layoutEl.createDiv({ cls: "sr-deck-options-body" });
        this.renderPresetSection(bodyEl);
        this.renderPresetEditor(bodyEl);
        this.renderNewCardsSection(bodyEl);
        this.renderLapsesSection(bodyEl);
        this.renderReviewsSection(bodyEl);
        this.renderAutoAdvanceSection(bodyEl);
        this.renderDangerSection(bodyEl);
        this.renderFooter(layoutEl);
    }

    private renderHeader(parent: HTMLElement) {
        const headerEl = parent.createDiv({ cls: "sr-deck-options-header" });
        headerEl.createDiv({ cls: "sr-deck-options-kicker", text: t("DECK_OPTIONS_TITLE") });

        const titleRowEl = headerEl.createDiv({ cls: "sr-deck-options-title-row" });
        titleRowEl.createEl("h2", {
            cls: "sr-deck-options-title",
            text: t("DECK_OPTIONS_TITLE"),
        });
        titleRowEl.createDiv({
            cls: "sr-deck-options-deck-chip",
            text: this.deckName,
        });

        const preset = this.getCurrentPreset();
        headerEl.createDiv({
            cls: "sr-deck-options-subtitle",
            text: `${t("DECK_OPTIONS_EDIT_PRESET")}: ${getDeckOptionsPresetDisplayName(
                preset,
                this.getCurrentPresetIndex(),
            )}`,
        });
    }

    private renderPresetSection(parent: HTMLElement) {
        const itemsEl = this.createSection(parent, t("DECK_OPTIONS_PRESET_SELECT"));
        const presets = this.getPresets();

        new Setting(itemsEl)
            .setName(t("DECK_OPTIONS_PRESET_SELECT"))
            .setDesc(t("DECK_OPTIONS_PRESET_SELECT_DESC"))
            .addDropdown((dropdown) => {
                presets.forEach((preset, index) => {
                    dropdown.addOption(preset.uuid, getDeckOptionsPresetDisplayName(preset, index));
                });
                dropdown.setValue(this.currentPresetUuid);
                dropdown.onChange(async (value) => {
                    this.currentPresetUuid = value || DEFAULT_DECK_OPTIONS_PRESET_UUID;
                    if (this.currentPresetUuid === DEFAULT_DECK_OPTIONS_PRESET_UUID) {
                        delete this.plugin.data.settings.deckPresetAssignment[this.deckName];
                    } else {
                        this.plugin.data.settings.deckPresetAssignment[this.deckName] =
                            this.currentPresetUuid;
                    }
                    await this.saveSettings();
                    this.render();
                });
            })
            .addButton((btn) => {
                btn.setIcon("plus");
                btn.setTooltip(t("DECK_OPTIONS_NEW_PRESET"));
                btn.onClick(async () => {
                    await this.createNewPreset();
                });
            });
    }

    private renderPresetEditor(parent: HTMLElement) {
        const itemsEl = this.createSection(parent, t("DECK_OPTIONS_EDIT_PRESET"));
        const preset = this.getCurrentPreset();

        new Setting(itemsEl).setName(t("DECK_OPTIONS_PRESET_NAME")).addText((text) =>
            text
                .setValue(getDeckOptionsPresetDisplayName(preset, this.getCurrentPresetIndex()))
                .onChange(async (value) => {
                    const nextName = value.trim();
                    if (!nextName) return;
                    preset.name = nextName;
                    await this.saveSettings();
                }),
        );
    }

    private renderNewCardsSection(parent: HTMLElement) {
        const itemsEl = this.createSection(parent, t("DECK_OPTIONS_SECTION_NEW_CARDS"));
        const preset = this.getCurrentPreset();

        new Setting(itemsEl)
            .setName(t("DECK_OPTIONS_LEARNING_STEPS"))
            .setDesc(t("DECK_OPTIONS_LEARNING_STEPS_DESC"))
            .addText((text) =>
                text
                    .setPlaceholder("1m 10m")
                    .setValue(preset.learningSteps)
                    .onChange(async (value) => {
                        Object.assign(
                            preset,
                            updateDeckOptionsPresetStepProxy(
                                preset,
                                { learningSteps: value },
                                this.plugin.data.settings.fsrsSettings,
                            ),
                        );
                        await this.saveSettings();
                    }),
            );

        new Setting(itemsEl)
            .setName(t("DECK_OPTIONS_MAX_NEW_CARDS"))
            .setDesc(t("DECK_OPTIONS_MAX_NEW_CARDS_DESC"))
            .addText((text) =>
                text.setValue(String(preset.maxNewCards)).onChange(async (value) => {
                    const num = parseInt(value, 10);
                    if (Number.isNaN(num) || num < 0) return;
                    preset.maxNewCards = num;
                    await this.saveSettings();
                }),
            );
    }

    private renderLapsesSection(parent: HTMLElement) {
        const itemsEl = this.createSection(parent, t("DECK_OPTIONS_SECTION_LAPSES"));
        const preset = this.getCurrentPreset();

        new Setting(itemsEl)
            .setName(t("DECK_OPTIONS_RELEARNING_STEPS"))
            .setDesc(t("DECK_OPTIONS_RELEARNING_STEPS_DESC"))
            .addText((text) =>
                text
                    .setPlaceholder("10m")
                    .setValue(preset.lapseSteps)
                    .onChange(async (value) => {
                        Object.assign(
                            preset,
                            updateDeckOptionsPresetStepProxy(
                                preset,
                                { lapseSteps: value },
                                this.plugin.data.settings.fsrsSettings,
                            ),
                        );
                        await this.saveSettings();
                    }),
            );
    }

    private renderReviewsSection(parent: HTMLElement) {
        const itemsEl = this.createSection(parent, t("DECK_OPTIONS_SECTION_REVIEWS"));
        const preset = this.getCurrentPreset();

        new Setting(itemsEl)
            .setName(t("DECK_OPTIONS_MAX_REVIEWS"))
            .setDesc(t("DECK_OPTIONS_MAX_REVIEWS_DESC"))
            .addText((text) =>
                text.setValue(String(preset.maxReviews)).onChange(async (value) => {
                    const num = parseInt(value, 10);
                    if (Number.isNaN(num) || num < 0) return;
                    preset.maxReviews = num;
                    await this.saveSettings();
                }),
            );
    }

    private renderAutoAdvanceSection(parent: HTMLElement) {
        const itemsEl = this.createSection(parent, t("DECK_OPTIONS_SECTION_AUTO_ADVANCE"));
        const preset = this.getCurrentPreset();

        new Setting(itemsEl)
            .setName(t("DECK_OPTIONS_AUTO_ADVANCE"))
            .setDesc(t("DECK_OPTIONS_AUTO_ADVANCE_DESC"))
            .addToggle((toggle) =>
                toggle.setValue(preset.autoAdvance).onChange(async (value) => {
                    preset.autoAdvance = value;
                    await this.saveSettings();
                    this.render();
                }),
            );

        if (!preset.autoAdvance) return;

        new Setting(itemsEl)
            .setName(t("DECK_OPTIONS_AUTO_ADVANCE_SECONDS"))
            .setDesc(t("DECK_OPTIONS_AUTO_ADVANCE_SECONDS_DESC"))
            .addText((text) =>
                text.setValue(String(preset.autoAdvanceSeconds)).onChange(async (value) => {
                    const num = parseFloat(value);
                    if (Number.isNaN(num) || num <= 0) return;
                    preset.autoAdvanceSeconds = num;
                    await this.saveSettings();
                }),
            );

        new Setting(itemsEl)
            .setName(t("DECK_OPTIONS_SHOW_PROGRESS_BAR"))
            .setDesc(t("DECK_OPTIONS_SHOW_PROGRESS_BAR_DESC"))
            .addToggle((toggle) =>
                toggle.setValue(preset.showProgressBar).onChange(async (value) => {
                    preset.showProgressBar = value;
                    await this.saveSettings();
                }),
            );
    }

    private renderDangerSection(parent: HTMLElement) {
        if (this.currentPresetUuid === DEFAULT_DECK_OPTIONS_PRESET_UUID) return;

        const itemsEl = this.createSection(parent, t("DECK_OPTIONS_DELETE_PRESET"));
        new Setting(itemsEl)
            .setName(t("DECK_OPTIONS_DELETE_PRESET"))
            .setDesc(t("DECK_OPTIONS_DELETE_PRESET_DESC"))
            .addButton((btn) => {
                btn.setButtonText(t("DECK_OPTIONS_BTN_DELETE_PRESET"));
                btn.setWarning();
                btn.onClick(async () => {
                    await this.deleteCurrentPreset();
                });
            });
    }

    private renderFooter(parent: HTMLElement) {
        const footerEl = parent.createDiv({ cls: "sr-deck-options-footer" });
        footerEl.createDiv({
            cls: "sr-deck-options-footer-note",
            text: t("DECK_OPTIONS_PRESET_SELECT_DESC"),
        });

        const actionsEl = footerEl.createDiv({ cls: "sr-deck-options-actions" });

        const cancelBtn = actionsEl.createEl("button", {
            cls: "mod-muted",
            text: t("CANCEL"),
        });
        cancelBtn.addEventListener("click", () => this.close());

        const saveBtn = actionsEl.createEl("button", {
            cls: "mod-cta",
            text: t("DECK_OPTIONS_BTN_SAVE"),
        });
        saveBtn.addEventListener("click", () => {
            void (async () => {
                await this.plugin.saveDeckOptionsAndRequestSync();
                this.onSaveCallback?.();
                new Notice(`${t("DECK_OPTIONS_TITLE")} ${t("DECK_OPTIONS_BTN_SAVE")}`);
                this.close();
            })();
        });
    }

    private createSection(parent: HTMLElement, title: string) {
        const sectionEl = parent.createDiv({ cls: "sr-setting-section" });
        sectionEl.createDiv({ cls: "setting-item-heading", text: title });
        return sectionEl.createDiv({ cls: "setting-items" });
    }

    private getPresets() {
        if (!this.plugin.data.settings.deckOptionsPresets?.length) {
            this.plugin.data.settings.deckOptionsPresets = [
                createDefaultDeckOptionsPreset(this.plugin.data.settings.fsrsSettings),
            ];
        }
        this.plugin.data.settings.deckOptionsPresets =
            normalizeDeckOptionsPresets(
                this.plugin.data.settings.deckOptionsPresets,
                this.plugin.data.settings.fsrsSettings,
            ).map((preset) =>
                normalizeDeckOptionsPreset(preset, this.plugin.data.settings.fsrsSettings),
            );
        syncFsrsSettingsCompatibilityMirror(this.plugin.data.settings);
        return this.plugin.data.settings.deckOptionsPresets;
    }

    private getCurrentPreset() {
        const presets = this.getPresets();
        const safeIndex = this.getCurrentPresetIndex();
        const safePreset = presets[safeIndex] ?? presets[0];
        if (safePreset && safePreset.uuid !== this.currentPresetUuid) {
            this.currentPresetUuid = safePreset.uuid;
            if (safePreset.uuid === DEFAULT_DECK_OPTIONS_PRESET_UUID) {
                delete this.plugin.data.settings.deckPresetAssignment[this.deckName];
            } else {
                this.plugin.data.settings.deckPresetAssignment[this.deckName] = safePreset.uuid;
            }
        }
        return safePreset;
    }

    private getCurrentPresetIndex() {
        return findDeckOptionsPresetIndexByUuid(this.getPresets(), this.currentPresetUuid);
    }

    private async createNewPreset() {
        const presets = this.getPresets();
        const newPreset: DeckOptionsPreset = createNewDeckOptionsPreset(
            this.plugin.data.settings.fsrsSettings,
            {
                name: `${t("DECK_OPTIONS_DEFAULT_PRESET_NAME")} ${presets.length}`,
            },
        );
        presets.push(newPreset);
        this.currentPresetUuid = newPreset.uuid;
        this.plugin.data.settings.deckPresetAssignment[this.deckName] = this.currentPresetUuid;
        await this.saveSettings();
        this.render();
    }

    private async deleteCurrentPreset() {
        const presets = this.getPresets();
        const deletedPresetUuid = this.currentPresetUuid;
        const deletedIndex = this.getCurrentPresetIndex();
        presets.splice(deletedIndex, 1);

        const assignment = this.plugin.data.settings.deckPresetAssignment;
        for (const deck in assignment) {
            if (assignment[deck] === deletedPresetUuid) {
                delete assignment[deck];
            }
        }

        this.currentPresetUuid = DEFAULT_DECK_OPTIONS_PRESET_UUID;
        await this.saveSettings();
        this.render();
    }

    private async saveSettings() {
        syncFsrsSettingsCompatibilityMirror(this.plugin.data.settings);
        await Promise.resolve();
    }
}
