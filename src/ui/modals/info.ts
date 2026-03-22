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
        return Object.prototype.toString.call(value);
    }
}

/**
 * ItemInfoModal 绫?
 *
 * 鍗＄墖璇︾粏淇℃伅妯℃€佹銆?
 * 鐢ㄤ簬鏌ョ湅鍜屾墜鍔ㄤ慨鏀瑰崱鐗囩殑璋冨害鏁版嵁锛堝 Next Review 鏃堕棿, Interval, Ease 绛夛級銆?
 * 杩欐槸涓€涓珮绾у姛鑳界晫闈紝涓昏鐢ㄤ簬璋冭瘯鎴栨墜鍔ㄥ共棰勮皟搴︺€?
 */
export class ItemInfoModal extends Modal {
    plugin: SRPlugin;
    store: DataStore;
    settings: SRSettings;
    file: TFile;
    item: RepetitionItem; // 褰撳墠鏌ョ湅鐨勬暟鎹」

    // 鏆傚瓨淇敼鍚庣殑涓嬫澶嶄範鏃堕棿锛宬ey=itemID, value=鏃堕棿鎴?
    mnextReview: Map<number, number> = new Map();
    // 鏆傚瓨淇敼鍚庣殑 Intervals
    lastInterval: number;

    constructor(plugin: SRPlugin, file: TFile, item: RepetitionItem = null) {
        super(plugin.app);
        this.plugin = plugin;
        this.store = DataStore.getInstance();
        this.settings = plugin.data.settings;
        this.file = file;

        // 濡傛灉娌℃湁鎸囧畾鍏蜂綋 item (Card)锛屽垯榛樿涓哄綋鍓嶆枃浠剁殑 Note item
        if (item == null) {
            this.item = plugin.noteReviewStore.getItem(file.path);
        } else {
            this.item = item;
        }

        // 璁剧疆寮圭獥楂樺害涓虹敤鎴疯瀹氱殑鐧惧垎姣?
        this.modalEl.style.height = this.settings.flashcardHeightPercentage + "%";
    }

    onOpen() {
        const { contentEl } = this;
        const path = this.file.path;

        // 椤堕儴鎸夐挳鏍忥紙绮樻€у畾浣?sticky锛?
        const buttonDivAll = contentEl.createDiv("srs-flex-row");
        buttonDivAll.setAttr("style", "position: sticky;top: 0");

        // 鍐呭鏄剧ず鍖哄煙
        const contentdiv = contentEl.createEl("div");

        // 鑾峰彇璇ユ枃浠剁殑璺熻釜淇℃伅
        const tkfile = this.store.getTrackedFile(path);

        // 濡傛灉鏂囦欢閲屾湁鍗＄墖锛屾樉绀哄垏鎹㈡寜閽?
        if (tkfile.hasCards) {
            // 鎸夐挳1锛氭樉绀哄綋鍓嶉€変腑鐨?item 璇︽儏
            if (this.item) {
                new ButtonComponent(buttonDivAll).setButtonText(this.item.itemType).onClick(() => {
                    this.displayitem(contentdiv, this.item);
                });
            }
            // 鎸夐挳2锛氭樉绀鸿鏂囦欢涓嬫墍鏈?items 鐨勮鎯?
            new ButtonComponent(buttonDivAll).setButtonText(t("CARDS_IN_NOTE")).onClick(() => {
                this.displayAllitems(contentdiv, tkfile);
            });
        }

        // 榛樿鏄剧ず鍐呭
        if (this.item) {
            this.displayitem(contentdiv, this.item);
        } else {
            this.displayAllitems(contentdiv, tkfile);
        }

        // 搴曢儴鎸夐挳鏍忥紙淇濆瓨/鍏抽棴锛?
        const buttonDiv = contentEl.createDiv("srs-flex-row");
        buttonDiv.setAttr("style", "position: sticky;bottom: 0;margin-top: auto;");

        new ButtonComponent(buttonDiv)
            .setButtonText(t("SAVE_ITEM_INFO"))
            .setTooltip(t("SAVE_ITEM_INFO_TOOLTIP"))
            .onClick(() => {
                this.submit(); // 淇濆瓨鏇存敼
                this.close();
            });

        new ButtonComponent(buttonDiv).setButtonText(t("CLOSE_ITEM_INFO")).onClick(() => {
            this.close();
        });
    }

    /**
     * 鏄剧ず璇ユ枃浠朵笅鎵€鏈夊崱鐗囩殑鎽樿鍒楄〃
     */
    displayAllitems(contentEl: HTMLElement, tkfile: TrackedFile) {
        contentEl.empty();
        const stext = t("LINE_NO");
        tkfile.cardItems.forEach((cinfo) => {
            const ln = cinfo.lineNo + 1;
            // 鏄剧ず姣忎竴寮犲崱鐗囩殑鎽樿锛圛tem IDs 鍙兘鍖呭惈澶氫釜锛屽洜涓哄彲鑳芥湁 cloze锛?
            const ids = Object.values(cinfo.itemMap || {}).filter((id) => id >= 0);
            this.displayitemWithSummary(contentEl, this.store.getItems(ids), stext + ln);
        });
    }

    /**
     * 鍒涘缓涓€涓姌鍙犻潰鏉?(details/summary) 鏉ユ樉绀轰竴缁?items
     */
    displayitemWithSummary(contentEl: HTMLElement, items: RepetitionItem[], text: string) {
        const details = contentEl.createEl("details");
        const summary = details.createEl("summary");

        details.open = true; // 榛樿灞曞紑
        summary.setText(text);
        summary.addClass("tree-item");

        items.forEach((item) => {
            const divdetails = details.createEl("details");
            const divsummary = divdetails.createEl("summary");
            let cardmsg = "";

            // 鏍煎紡鍖栦笅娆″涔犳椂闂?
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

            // 閫掑綊璋冪敤 displayitem 鏄剧ず璇︾粏淇℃伅琛ㄦ牸
            this.displayitem(div, item);
        });
    }

    /**
     * 鏄剧ず鍗曚釜 item 鐨勮缁?JSON 鏁版嵁琛ㄦ牸
     * 骞舵彁渚涢儴鍒嗗瓧娈碉紙濡?nextReview, lastInterval锛夌殑缂栬緫杈撳叆妗?
     */
    displayitem(contentEl: HTMLElement, item: RepetitionItem) {
        const path = this.store.getFilePath(item);
        contentEl.empty();
        contentEl.createEl("p").setText(t("ITEM_INFO_TITLE") + " " + path);
        const contentdiv = contentEl.createEl("div");

        console.debug("item: ", item);

        // 浣跨敤 Markdown 琛ㄦ牸璇硶鏋勫缓鏄剧ず鍐呭
        const title =
            "key | value \n\
            ---|---\n";
        let tablestr = "";

        // 閬嶅巻 item 鐨勫熀鏈睘鎬?
        Object.keys(item).forEach((key) => {
            if (key != "data") {
                // 'data' 鏄叿浣撶殑绠楁硶鏁版嵁锛屽崟鐙鐞?
                if (key === "nextReview") {
                    // 瀵逛簬 nextReview锛屽垱寤轰竴涓彲缂栬緫鐨?Setting
                    new Setting(contentdiv).setDesc(key).addText((text) => {
                        const dt = window.moment(item.nextReview).format("YYYY-MM-DD HH:mm:ss");
                        text.setValue(dt).onChange((value) => {
                            // 瑙ｆ瀽鐢ㄦ埛杈撳叆鐨勬棩鏈熷瓧绗︿覆
                            const nr = window.moment(value).valueOf();
                            this.mnextReview.set(item.ID, nr ?? 0); // 鏆傚瓨淇敼
                        });
                    });
                } else {
                    tablestr += ` ${key} | ${formatDebugValue(item[key as keyof typeof item])} \n`;
                }
            }
        });
        // 娓叉煋鍩烘湰灞炴€ц〃鏍?
        void MarkdownRenderer.render(this.plugin.app, title + tablestr, contentdiv, "", this);

        contentdiv.createEl("p").setText(t("ITEM_DATA_INFO"));

        // 閬嶅巻 item.data (鐗瑰畾绠楁硶鐨勬暟鎹紝濡?FSRS 鎴?Anki 鏁版嵁)
        tablestr = "";
        Object.keys(item.data).forEach((key) => {
            const dkey = key as keyof typeof item.data;
            if (key === "lastInterval") {
                const akey = key as keyof AnkiData;
                // lastInterval 鍙紪杈?
                new Setting(contentdiv).setDesc(key).addText((text) => {
                    const data = item.data as AnkiData;
                    this.lastInterval = undefined;
                    text.setValue(data[akey]?.toString()).onChange((value) => {
                        const parsedValue = Number(value);
                        this.lastInterval = Number.isNaN(parsedValue) ? 0 : parsedValue;
                    });
                });
            } else {
                tablestr += ` ${key} | ${formatDebugValue(item.data[dkey])} \n`;
            }
        });
        // 娓叉煋绠楁硶鏁版嵁琛ㄦ牸
        void MarkdownRenderer.render(this.plugin.app, title + tablestr, contentdiv, "", this);
    }

    /**
     * 淇濆瓨淇敼
     */
    submit() {
        const item = this.item;
        console.debug(this);
        const algo = this.settings.algorithm;

        // 1. 淇濆瓨涓嬫澶嶄範鏃堕棿 (Next Review)
        if (this.mnextReview.size > 0) {
            this.mnextReview.forEach((v, id) => {
                const item = this.store.getItembyID(id);
                console.debug(
                    `update item priority from ${item.nextReview} to ${v}, current item info:`,
                    item,
                );
                const nr = window.moment(v).valueOf() ?? 0;
                // 鏇存柊 item 瀵硅薄鐨?nextReview 灞炴€?
                item.nextReview = nr > 0 ? nr : item.nextReview;

                // 濡傛灉鏄?FSRS 绠楁硶锛岃繕闇€瑕佸悓姝ユ洿鏂?data.due
                if (String(algo) === String(algorithmNames.Fsrs)) {
                    const data = item.data as FsrsData;
                    data.due = new Date(item.nextReview);
                }
            });
        }

        // 2. 淇濆瓨 Last Interval (闈?FSRS 妯″紡涓?
        if (String(algo) !== String(algorithmNames.Fsrs)) {
            const data = item.data as AnkiData;
            data.lastInterval = this.lastInterval ? this.lastInterval : data.lastInterval;
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

