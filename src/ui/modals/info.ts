import { ButtonComponent, MarkdownRenderer, Modal, Setting, TFile } from "obsidian";
import { algorithmNames } from "src/algorithms/algorithms";
import { AnkiData } from "src/algorithms/anki";
import { FsrsData } from "src/algorithms/fsrs";
import { DataStore } from "src/dataStore/data";
import { RepetitionItem } from "src/dataStore/repetitionItem";
import { TrackedFile } from "src/dataStore/trackedFile";
import SRPlugin from "src/main";
import { SRSettings } from "src/settings";
import { t } from "src/lang/helpers";

/**
 * ItemInfoModal 类
 *
 * 卡片详细信息模态框。
 * 用于查看和手动修改卡片的调度数据（如 Next Review 时间, Interval, Ease 等）。
 * 这是一个高级功能界面，主要用于调试或手动干预调度。
 */
export class ItemInfoModal extends Modal {
    plugin: SRPlugin;
    store: DataStore;
    settings: SRSettings;
    file: TFile;
    item: RepetitionItem; // 当前查看的数据项

    // 暂存修改后的下次复习时间，key=itemID, value=时间戳
    mnextReview: Map<number, number> = new Map();
    // 暂存修改后的 Intervals
    lastInterval: number;

    constructor(plugin: SRPlugin, file: TFile, item: RepetitionItem = null) {
        super(plugin.app);
        this.plugin = plugin;
        this.store = DataStore.getInstance();
        this.settings = plugin.data.settings;
        this.file = file;

        // 如果没有指定具体 item (Card)，则默认为当前文件的 Note item
        if (item == null) {
            this.item = plugin.noteReviewStore.getItem(file.path);
        } else {
            this.item = item;
        }

        // 设置弹窗高度为用户设定的百分比
        this.modalEl.style.height = this.settings.flashcardHeightPercentage + "%";
    }

    onOpen() {
        const { contentEl } = this;
        const path = this.file.path;

        // 顶部按钮栏（粘性定位 sticky）
        const buttonDivAll = contentEl.createDiv("srs-flex-row");
        buttonDivAll.setAttr("style", "position: sticky;top: 0");

        // 内容显示区域
        const contentdiv = contentEl.createEl("div");

        // 获取该文件的跟踪信息
        const tkfile = this.store.getTrackedFile(path);

        // 如果文件里有卡片，显示切换按钮
        if (tkfile.hasCards) {
            // 按钮1：显示当前选中的 item 详情
            if (this.item) {
                new ButtonComponent(buttonDivAll).setButtonText(this.item.itemType).onClick(() => {
                    this.displayitem(contentdiv, this.item);
                });
            }
            // 按钮2：显示该文件下所有 items 的详情
            new ButtonComponent(buttonDivAll).setButtonText(t("CARDS_IN_NOTE")).onClick(() => {
                this.displayAllitems(contentdiv, tkfile);
            });
        }

        // 默认显示内容
        if (this.item) {
            this.displayitem(contentdiv, this.item);
        } else {
            this.displayAllitems(contentdiv, tkfile);
        }

        // 底部按钮栏（保存/关闭）
        const buttonDiv = contentEl.createDiv("srs-flex-row");
        buttonDiv.setAttr("style", "position: sticky;bottom: 0;margin-top: auto;");

        new ButtonComponent(buttonDiv)
            .setButtonText(t("SAVE_ITEM_INFO"))
            .setTooltip(t("SAVE_ITEM_INFO_TOOLTIP"))
            .onClick(() => {
                this.submit(); // 保存更改
                this.close();
            });

        new ButtonComponent(buttonDiv).setButtonText(t("CLOSE_ITEM_INFO")).onClick(() => {
            this.close();
        });
    }

    /**
     * 显示该文件下所有卡片的摘要列表
     */
    displayAllitems(contentEl: HTMLElement, tkfile: TrackedFile) {
        contentEl.empty();
        const stext = t("LINE_NO");
        tkfile.cardItems.forEach((cinfo) => {
            const ln = cinfo.lineNo + 1;
            // 显示每一张卡片的摘要（Item IDs 可能包含多个，因为可能有 cloze）
            const ids = Object.values(cinfo.itemMap || {}).filter((id) => id >= 0);
            this.displayitemWithSummary(contentEl, this.store.getItems(ids), stext + ln);
        });
    }

    /**
     * 创建一个折叠面板 (details/summary) 来显示一组 items
     */
    displayitemWithSummary(contentEl: HTMLElement, items: RepetitionItem[], text: string) {
        const details = contentEl.createEl("details");
        const summary = details.createEl("summary");

        details.open = true; // 默认展开
        summary.setText(text);
        summary.addClass("tree-item");

        items.forEach((item) => {
            const divdetails = details.createEl("details");
            const divsummary = divdetails.createEl("summary");
            let cardmsg = "";

            // 格式化下次复习时间
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

            // 递归调用 displayitem 显示详细信息表格
            this.displayitem(div, item);
        });
    }

    /**
     * 显示单个 item 的详细 JSON 数据表格
     * 并提供部分字段（如 nextReview, lastInterval）的编辑输入框
     */
    displayitem(contentEl: HTMLElement, item: RepetitionItem) {
        const path = this.store.getFilePath(item);
        contentEl.empty();
        contentEl.createEl("p").setText(t("ITEM_INFO_TITLE") + " " + path);
        const contentdiv = contentEl.createEl("div");

        console.debug("item: ", item);

        // 使用 Markdown 表格语法构建显示内容
        const title =
            "key | value \n\
            ---|---\n";
        let tablestr = "";

        // 遍历 item 的基本属性
        Object.keys(item).forEach((key) => {
            if (key != "data") {
                // 'data' 是具体的算法数据，单独处理
                if (key === "nextReview") {
                    // 对于 nextReview，创建一个可编辑的 Setting
                    new Setting(contentdiv).setDesc(key).addText((text) => {
                        const dt = window.moment(item.nextReview).format("YYYY-MM-DD HH:mm:ss");
                        text.setValue(dt).onChange((value) => {
                            // 解析用户输入的日期字符串
                            const nr = window.moment(value).valueOf();
                            this.mnextReview.set(item.ID, nr ?? 0); // 暂存修改
                        });
                    });
                } else {
                    tablestr += ` ${key} | ${item[key as keyof typeof item]} \n`;
                }
            }
        });
        // 渲染基本属性表格
        MarkdownRenderer.render(this.plugin.app, title + tablestr, contentdiv, "", this.plugin);

        contentdiv.createEl("p").setText(t("ITEM_DATA_INFO"));

        // 遍历 item.data (特定算法的数据，如 FSRS 或 Anki 数据)
        tablestr = "";
        Object.keys(item.data).forEach((key) => {
            const dkey = key as keyof typeof item.data;
            if (key === "lastInterval") {
                const akey = key as keyof AnkiData;
                // lastInterval 可编辑
                new Setting(contentdiv).setDesc(key).addText((text) => {
                    const data = item.data as AnkiData;
                    this.lastInterval = undefined;
                    text.setValue(data[akey]?.toString()).onChange((value) => {
                        this.lastInterval = Number(value) ?? 0;
                    });
                });
            } else {
                tablestr += ` ${key} | ${item.data[dkey]} \n`;
            }
        });
        // 渲染算法数据表格
        MarkdownRenderer.render(this.plugin.app, title + tablestr, contentdiv, "", this.plugin);
    }

    /**
     * 保存修改
     */
    submit() {
        const item = this.item;
        console.debug(this);
        const algo = this.settings.algorithm;

        // 1. 保存下次复习时间 (Next Review)
        if (this.mnextReview.size > 0) {
            this.mnextReview.forEach((v, id) => {
                const item = this.store.getItembyID(id);
                console.log(
                    `update item priority from ${item.nextReview} to ${v}, current item info:`,
                    item,
                );
                const nr = window.moment(v).valueOf() ?? 0;
                // 更新 item 对象的 nextReview 属性
                item.nextReview = nr > 0 ? nr : item.nextReview;

                // 如果是 FSRS 算法，还需要同步更新 data.due
                if (algo === algorithmNames.Fsrs) {
                    const data = item.data as FsrsData;
                    data.due = new Date(item.nextReview);
                }
            });
        }

        // 2. 保存 Last Interval (非 FSRS 模式下)
        if (algo !== algorithmNames.Fsrs) {
            const data = item.data as AnkiData;
            data.lastInterval = this.lastInterval ? this.lastInterval : data.lastInterval;
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
