import { ButtonComponent, Component, MarkdownRenderer, Modal, Setting, TFile } from "obsidian";
import { FsrsData } from "src/algorithms/fsrs";
import { DataStore } from "src/dataStore/data";
import { RepetitionItem } from "src/dataStore/repetitionItem";
import { TrackedFile } from "src/dataStore/trackedFile";
import SRPlugin from "src/main";
import { SRSettings } from "src/settings";
import { t } from "src/lang/helpers";

type LegacyScheduleData = {
    lastInterval?: number;
};

function formatDebugValue(value: unknown): string {
    if (value == null) {
        return "";
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    try {
        return JSON.stringify(value);
    } catch {
        return "[unserializable object]";
    }
}

export class ItemInfoModal extends Modal {
    plugin: SRPlugin;
    store: DataStore;
    settings: SRSettings;
    file: TFile;
    item: RepetitionItem;
    markdownComponent: Component;

    mnextReview: Map<number, number> = new Map();
    lastInterval: number;

    constructor(plugin: SRPlugin, file: TFile, item: RepetitionItem = null) {
        super(plugin.app);
        this.plugin = plugin;
        this.store = DataStore.getInstance();
        this.settings = plugin.data.settings;
        this.file = file;
        this.markdownComponent = new Component();

        if (item == null) {
            this.item = plugin.noteReviewStore.getItem(file.path);
        } else {
            this.item = item;
        }

        this.modalEl.style.height = this.settings.flashcardHeightPercentage + "%";
    }

    onOpen() {
        const { contentEl } = this;
        const path = this.file.path;

        this.markdownComponent.load();

        const buttonDivAll = contentEl.createDiv("srs-flex-row");
        buttonDivAll.setAttr("style", "position: sticky;top: 0");

        const contentdiv = contentEl.createEl("div");

        const tkfile = this.store.getTrackedFile(path);

        if (tkfile.hasCards) {
            if (this.item) {
                new ButtonComponent(buttonDivAll).setButtonText(this.item.itemType).onClick(() => {
                    this.displayitem(contentdiv, this.item);
                });
            }
            new ButtonComponent(buttonDivAll).setButtonText(t("CARDS_IN_NOTE")).onClick(() => {
                this.displayAllitems(contentdiv, tkfile);
            });
        }

        if (this.item) {
            this.displayitem(contentdiv, this.item);
        } else {
            this.displayAllitems(contentdiv, tkfile);
        }

        const buttonDiv = contentEl.createDiv("srs-flex-row");
        buttonDiv.setAttr("style", "position: sticky;bottom: 0;margin-top: auto;");

        new ButtonComponent(buttonDiv)
            .setButtonText(t("SAVE_ITEM_INFO"))
            .setTooltip(t("SAVE_ITEM_INFO_TOOLTIP"))
            .onClick(() => {
                this.submit();
                this.close();
            });

        new ButtonComponent(buttonDiv).setButtonText(t("CLOSE_ITEM_INFO")).onClick(() => {
            this.close();
        });
    }

    displayAllitems(contentEl: HTMLElement, tkfile: TrackedFile) {
        contentEl.empty();
        const stext = t("LINE_NO");
        tkfile.cardItems.forEach((cinfo) => {
            const ln = cinfo.lineNo + 1;
            const ids = Object.values(cinfo.itemMap).filter((id) => id >= 0);
            this.displayitemWithSummary(contentEl, this.store.getItems(ids), stext + ln);
        });
    }

    displayitemWithSummary(contentEl: HTMLElement, items: RepetitionItem[], text: string) {
        const details = contentEl.createEl("details");
        const summary = details.createEl("summary");

        details.open = true;
        summary.setText(text);
        summary.addClass("tree-item");

        items.forEach((item) => {
            const divdetails = details.createEl("details");
            const divsummary = divdetails.createEl("summary");
            let cardmsg = "";

            if (item.hasDue) {
                const dt = window.moment(item.nextReview).format("YYYY-MM-DD HH:mm:ss");
                cardmsg = `${t("NEXT_REVIEW")} ${dt}`;
            } else {
                cardmsg = t("NEW_CARD");
            }

            divsummary.setText(`ID: ${item.ID} \t ${cardmsg}`);
            divsummary.addClass("tree-item-children");

            const div = divdetails.createDiv();
            div.addClass("tree-item-children");

            this.displayitem(div, item);
        });
    }

    displayitem(contentEl: HTMLElement, item: RepetitionItem) {
        const path = this.store.getFilePath(item);
        contentEl.empty();
        contentEl.createEl("p").setText(t("ITEM_INFO_TITLE") + " " + path);
        const contentdiv = contentEl.createEl("div");

        console.debug("item: ", item);

        const title =
            "key | value \n\
            ---|---\n";
        let tablestr = "";

        Object.keys(item).forEach((key) => {
            if (key != "data") {
                if (key === "nextReview") {
                    new Setting(contentdiv).setDesc(key).addText((text) => {
                        const dt = window.moment(item.nextReview).format("YYYY-MM-DD HH:mm:ss");
                        text.setValue(dt).onChange((value) => {
                            const nr = window.moment(value).valueOf();
                            this.mnextReview.set(item.ID, nr ?? 0);
                        });
                    });
                } else {
                    tablestr += ` ${key} | ${formatDebugValue(item[key as keyof typeof item])} \n`;
                }
            }
        });
        void MarkdownRenderer.render(
            this.plugin.app,
            title + tablestr,
            contentdiv,
            "",
            this.markdownComponent,
        );

        contentdiv.createEl("p").setText(t("ITEM_DATA_INFO"));

        tablestr = "";
        Object.keys(item.data).forEach((key) => {
            const dkey = key as keyof typeof item.data;
            if (key === "lastInterval") {
                new Setting(contentdiv).setDesc(key).addText((text) => {
                    const data = item.data as LegacyScheduleData;
                    this.lastInterval = undefined;
                    text.setValue(data.lastInterval?.toString()).onChange((value) => {
                        const parsedValue = Number(value);
                        this.lastInterval = Number.isNaN(parsedValue) ? 0 : parsedValue;
                    });
                });
            } else {
                tablestr += ` ${key} | ${formatDebugValue(item.data[dkey])} \n`;
            }
        });
        void MarkdownRenderer.render(
            this.plugin.app,
            title + tablestr,
            contentdiv,
            "",
            this.markdownComponent,
        );
    }

    submit() {
        const item = this.item;
        console.debug(this);

        if (this.mnextReview.size > 0) {
            this.mnextReview.forEach((v, id) => {
                const item = this.store.getItembyID(id);
                console.debug(
                    `update item priority from ${item.nextReview} to ${v}, current item info:`,
                    item,
                );
                const nr = window.moment(v).valueOf() ?? 0;
                item.nextReview = nr > 0 ? nr : item.nextReview;

                if (item.isFsrs) {
                    const data = item.data as FsrsData;
                    data.due = new Date(item.nextReview);
                }
            });
        }

        if (!item.isFsrs) {
            const data = item.data as LegacyScheduleData;
            data.lastInterval = this.lastInterval ? this.lastInterval : data.lastInterval;
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.markdownComponent.unload();
        this.markdownComponent = new Component();
    }
}
