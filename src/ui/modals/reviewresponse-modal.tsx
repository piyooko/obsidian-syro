// https://img.shields.io/github/v/release/chetachiezikeuzor/cMenu-Plugin
import { App, MarkdownView, Menu, MenuItem, Platform, TFile, setIcon, Notice } from "obsidian";
import { textInterval } from "src/scheduling";
import { SRSettings } from "src/settings";
import { t } from "src/lang/helpers";
// import { FlashcardModalMode } from "src/gui/flashcard-modal";
import { SrsAlgorithm } from "src/algorithms/algorithms";
import { RepetitionItem } from "src/dataStore/repetitionItem";
// import { debug } from "src/util/utils_recall";
import { TouchOnMobile } from "src/Events/touchEvent";
import { Iadapter } from "src/dataStore/adapter";
import SRPlugin from "src/main";
import * as MixQueSet from "src/dataStore/mixQueSet";
import { FlashcardReviewMode } from "src/FlashcardReviewSequencer";

/**
 * reviewResponseModal 类
 *
 * 这是一个悬浮的评分栏 (Floating Bar)，用于在用户复习笔记或卡片时进行评分（Easy, Good, Hard, Reset 等）。
 * 它通常显示在笔记界面的底部或其他显著位置。
 *
 * 它支持：
 * 1. 响应按钮 (Hard, Good, Easy) 的动态生成。
 * 2. 移动端触摸手势支持。
 * 3. 显示/隐藏间隔时间 (Intervals)。
 * 4. FSRS 和默认 Anki 算法的适配。
 */
export class reviewResponseModal {
    private static instance: reviewResponseModal;
    private app: App;
    public plugin: SRPlugin;
    private settings: SRSettings;
    public submitCallback: (resp: number) => void;
    private algorithm: SrsAlgorithm;
    private ownerdoc: Document; // 所属文档对象，用于事件监听
    private vwcontainerEl: HTMLElement; // 视图容器
    private containerEl: HTMLElement; // 自身容器
    private contentEl: HTMLElement;

    barId = "reviewResponseModalBar";
    private barItemId: string = "ResponseFloatBarCommandItem";
    answerBtn: HTMLButtonElement;
    buttons: HTMLButtonElement[];
    response: HTMLDivElement; // 评分按钮区域
    controls: HTMLDivElement; // 控制按钮区域 (用于卡片)
    private notecontrols: HTMLDivElement; // 笔记控制按钮区域
    private skipButton: HTMLButtonElement;
    private responseInterval: number[]; // 各个评分对应的下次复习间隔
    private item: RepetitionItem; // 当前复习项
    private showInterval = true; // 是否显示间隔时间文本
    private buttonTexts: string[];
    private options: string[]; // 评分选项 (e.g. ['Reset', 'Hard', 'Good', 'Easy'])
    private _reviewMode: FlashcardReviewMode;

    // 回调函数
    respCallback: (resp: number) => void;
    showAnsCB: () => void;
    public cardtotalCB: () => number;
    public notetotalCB: () => number;
    public openNextCardCB: () => void;
    public openNextNoteCB: () => void;
    public barCloseHandler: () => void;
    infoButton: HTMLButtonElement;

    // 单例获取
    static getInstance() {
        return reviewResponseModal.instance;
    }

    constructor(plugin: SRPlugin, settings: SRSettings) {
        this.app = plugin.app;
        this.plugin = plugin;
        this.settings = settings;
        const algo = settings.algorithm;
        // 根据算法载入按钮文本
        this.buttonTexts = settings.responseOptionBtnsText[algo];
        this.algorithm = SrsAlgorithm.getInstance();
        this.options = this.algorithm.srsOptions();
        reviewResponseModal.instance = this;
    }

    /**
     * 显示评分栏
     * @param item 复习项
     * @param callback 评分回调
     * @param front 是否显示正面（如果是卡片）
     */
    public display(
        item?: RepetitionItem,
        callback?: (resp: number) => Promise<void>,
        front?: boolean,
    ): void {
        const settings = this.settings;

        // 检查设置是否允许显示
        if (!settings.reviewResponseFloatBar || !settings.autoNextNote) return;

        if (item) {
            this.item = item;
            // 预计算各个评分的下一次复习间隔
            this.responseInterval = this.algorithm.calcAllOptsIntervals(item);
        } else {
            this.item = undefined;
            this.responseInterval = null;
        }

        // 如果还没创建 DOM，先构建
        if (!this.hasBar() || !this.buttons) {
            this.build();
        }
        this.containerEl.show();

        if (callback) {
            this.respCallback = callback;
        }

        // 状态更新：显示问题还是答案
        if (this.item.isCard && front !== false) {
            this.showQuestion();
        } else {
            this.showAnswer();
        }
    }

    /**
     * 构建 DOM 结构
     */
    build() {
        if (this.isDisplay()) return;

        const optBtnCounts = this.options.length;
        let btnCols = 4;
        // 移动端适配
        if (!Platform.isMobile && optBtnCounts > btnCols) {
            btnCols = optBtnCounts;
        }

        this.containerEl = createEl("div");
        this.containerEl.setAttribute("id", this.barId);
        this.containerEl.hide();

        // 插入到当前激活的 Markdown 视图中
        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        view?.containerEl?.appendChild(this.containerEl);

        if (view) {
            this.vwcontainerEl = view.containerEl;
            this.ownerdoc = view.containerEl.ownerDocument;
            this.addKeysEvent(); // 绑定键盘事件

            // 视图卸载时清理自身
            view.onunload = () => {
                this.close();
                view.containerEl.removeChild(this.containerEl);
            };
        }

        // 创建内容容器
        this.contentEl = this.containerEl.createDiv("sr-show-response");
        this.contentEl.addClass("sr-modal-content");
        this.contentEl.addClass("sr-flashcard");

        // 控制区域
        this.notecontrols = this.contentEl.createDiv();
        this.controls = this.contentEl.createDiv();

        // 响应区域 (Grid 布局)
        this.response = this.contentEl.createDiv("sr-show-response");
        this.response.setAttribute("style", `grid-template-columns: ${"1fr ".repeat(btnCols)}`);

        this.buttons = [];
        this._createNoteControls();
        this.createButtons_responses(); // 创建评分按钮
        this.createButton_showAnswer(); // 创建“显示答案”按钮

        this.addMenuEvent(); // 绑定菜单
        this.addTouchEvent(); // 绑定触摸
        this._autoClose();
    }

    set reviewMode(reviewMode: FlashcardReviewMode) {
        this._reviewMode = reviewMode;
    }

    /**
     * 按钮点击处理
     * @param s 选中的选项字符串
     */
    private async buttonClick(s: string) {
        this.hideControls();
        let mqs: ReturnType<typeof MixQueSet.getInstance> | undefined;
        const iscard = this.item.isCard;

        // 混合队列逻辑 (Card/Note 混合复习)
        if (
            this._reviewMode === FlashcardReviewMode.Review &&
            this.settings.mixCardNote &&
            this.openNextCardCB &&
            this.openNextNoteCB
        ) {
            mqs = MixQueSet.getInstance();
            MixQueSet.arbitrateCardNote(this.item, this.cardtotalCB(), this.notetotalCB());
        }

        // 调用对应的回调
        if (iscard && this.respCallback) {
            await this.respCallback(this.options.indexOf(s));
        } else if (!iscard && this.submitCallback) {
            this.submitCallback(this.options.indexOf(s));
        }

        // 自动跳转下一个
        if (mqs) {
            if (!iscard && MixQueSet.isCard()) {
                this.openNextCardCB();
                this._updateControls(true);
            } else if (iscard && !MixQueSet.isCard()) {
                this.openNextNoteCB();
                this._updateControls(false);
            }
        }
    }

    private _createNoteControls() {
        this.notecontrols.addClass("sr-header");
        this._createCloseButton(this.notecontrols);

        const div = this.notecontrols.createDiv();
        this._createIntervalButton(div); // 间隔显示切换按钮
        this._createResetButton(div); // 重置按钮
        this._createCardInfoButton(div); // 详情按钮
        this._createSkipButton(div); // 跳过按钮
        div.addClass("sr-controls");
        this.notecontrols.hide();
    }

    private _createResetButton(containerEl: HTMLElement) {
        const btn = containerEl.createEl("button");
        btn.addClasses(["sr-button", "sr-reset-button"]);
        setIcon(btn, "refresh-cw");
        btn.setAttribute("aria-label", t("RESET_CARD_PROGRESS"));
        btn.addEventListener("click", () => {
            this.buttonClick(this.options[0]); // 假设第一个选项是 Reset
        });
    }

    private createButtons_responses() {
        this.options.forEach((opt: string, index) => {
            const btn = this.response.createEl("button");
            btn.setAttribute("id", "sr-" + opt.toLowerCase() + "-btn");
            btn.addClasses(["sr-response-button", "sr-is-hidden"]);

            // 获取带间隔时间的文本
            const text = this.getTextWithInterval(index);
            btn.setText(text);
            btn.addEventListener("click", () => this.buttonClick(opt));
            this.buttons.push(btn);
        });
    }

    private createButton_showAnswer() {
        this.answerBtn = this.response.createEl("button");
        this.answerBtn.setAttribute("id", "sr-show-answer");
        this.answerBtn.addClasses(["sr-response-button", "sr-show-answer-button", "sr-bg-blue"]);
        this.answerBtn.setText(t("SHOW_ANSWER"));
        this.answerBtn.addEventListener("click", () => {
            this.hideControls();
            this.showAnsCB();
            this.showAnswer();
        });
        this.answerBtn.addClass("sr-is-hidden");
    }

    // ... (其他的 createButton 方法类似，略过详细注释)

    /**
     * 键盘事件处理
     * 支持 Numpad 和 Digit 键进行评分
     */
    private _keydownHandler = (e: KeyboardEvent) => {
        // 确保不会在编辑器输入时触发
        const bar = this.vwcontainerEl.querySelector("#" + this.barId);

        if (
            bar &&
            bar.checkVisibility() &&
            this.isDisplay() &&
            Iadapter.instance.app.workspace.getActiveViewOfType(MarkdownView).getMode() ===
                "preview" && // 仅在预览模式生效，防止误触
            this.answerBtn.hasClass("sr-is-hidden") // 仅在显示答案后（评分阶段）生效
        ) {
            const consume = () => {
                e.preventDefault();
                e.stopPropagation();
            };
            this.options.some((_opt, idx) => {
                const num = "Numpad" + idx;
                const dig = "Digit" + idx;
                if (e.code === num || e.code === dig) {
                    this.buttonClick(this.options[idx]);
                    consume();
                    return true;
                }
            });
        }
    };

    /**
     * 切换是否显示下次复习的间隔时间
     */
    private toggleShowInterval() {
        this.showInterval = this.showInterval ? false : true;
    }

    /**
     * 切换到“显示答案”模式
     * 隐藏 Show Answer 按钮，显示评分按钮
     */
    private showAnswer() {
        this.answerBtn.addClass("sr-is-hidden");
        this.response.removeClass("sr-is-hidden");

        let _stIndx = 1;
        if (this.item.isCard) {
            _stIndx = 1; // Card 通常从索引1开始(忽略Reset?)，需结合具体算法配置
        }

        // 更新按钮文本（可能需要更新 Intervals）
        this.options.slice(_stIndx).forEach((opt, index) => {
            const btn =
                this.vwcontainerEl.querySelector("#sr-" + opt.toLowerCase() + "-btn") ??
                this.buttons[_stIndx + index];
            const text = this.getTextWithInterval(_stIndx + index);
            btn.setText(text);
            if (!this.item.isCard) {
                btn.removeClass("sr-is-hidden");
            }
        });
    }

    /**
     * 切换到“显示问题”模式
     * 隐藏评分按钮，显示 Show Answer 按钮
     */
    private showQuestion() {
        this.answerBtn.removeClass("sr-is-hidden");
        this.buttons.forEach((btn, _index) => {
            btn.addClass("sr-is-hidden");
        });
    }

    /**
     * 获取带间隔时间的按钮文本
     * @param index 选项索引
     */
    private getTextWithInterval(index: number) {
        let text = this.buttonTexts[index];
        if (this.showInterval) {
            text =
                this.responseInterval == null
                    ? `${text}`
                    : Platform.isMobile
                      ? textInterval(this.responseInterval[index], true) // 移动端简化显示
                      : `${text} - ${textInterval(this.responseInterval[index], false)}`; // 桌面端显示完整
        }
        return text;
    }

    public hasBar() {
        return this.vwcontainerEl?.querySelector("#" + this.barId) != null;
    }

    public isDisplay() {
        return this.hasBar() && this.containerEl?.isShown();
    }

    hide() {
        if (this.containerEl?.isShown()) {
            this.containerEl.hide();
        }
    }

    close() {
        const rrBar = this.vwcontainerEl?.querySelector("#" + this.barId) as HTMLElement;
        if (rrBar) {
            this.removeKeysEvent();
            rrBar.style.visibility = "hidden";
            if (rrBar.firstChild) {
                rrBar.removeChild(rrBar.firstChild);
            }
            rrBar.remove();
        }
    }

    private _autoClose() {
        // ... 代码被注释或直接 return，暂不起作用
        return;
    }

    /**
     * 添加键盘事件监听
     */
    addKeysEvent() {
        if (this.ownerdoc && this._keydownHandler) {
            this.ownerdoc.addEventListener("keydown", this._keydownHandler);
        }
    }

    /**
     * 移除键盘事件监听
     */
    removeKeysEvent() {
        if (this.ownerdoc && this._keydownHandler) {
            this.ownerdoc.removeEventListener("keydown", this._keydownHandler);
        }
    }

    /**
     * 添加菜单事件
     */
    addMenuEvent() {
        // 如果需要右键菜单，可以在这里添加
    }

    /**
     * 添加触摸事件（移动端）
     */
    addTouchEvent() {
        if (Platform.isMobile && this.contentEl) {
            TouchOnMobile.create();
        }
    }

    /**
     * 隐藏控制按钮
     */
    hideControls() {
        if (this.notecontrols) {
            this.notecontrols.hide();
        }
        if (this.controls) {
            this.controls.hide();
        }
    }

    /**
     * 更新控制按钮显示
     */
    private _updateControls(isCard: boolean) {
        if (isCard) {
            this.notecontrols.hide();
            this.controls.show();
        } else {
            this.controls.hide();
            this.notecontrols.show();
        }
    }

    /**
     * 创建关闭按钮
     */
    private _createCloseButton(containerEl: HTMLElement) {
        const btn = containerEl.createEl("button");
        btn.addClasses(["sr-button", "sr-close-button"]);
        setIcon(btn, "x");
        btn.setAttribute("aria-label", t("CLOSE"));
        btn.addEventListener("click", () => {
            this.hide();
            if (this.barCloseHandler) {
                this.barCloseHandler();
            }
        });
    }

    /**
     * 创建间隔显示切换按钮
     */
    private _createIntervalButton(containerEl: HTMLElement) {
        const btn = containerEl.createEl("button");
        btn.addClasses(["sr-button"]);
        setIcon(btn, "clock");
        btn.setAttribute("aria-label", "切换间隔显示");
        btn.addEventListener("click", () => {
            this.toggleShowInterval();
            this.showAnswer(); // 刷新按钮文本
        });
    }

    /**
     * 创建详情按钮
     */
    private _createCardInfoButton(containerEl: HTMLElement) {
        this.infoButton = containerEl.createEl("button");
        this.infoButton.addClasses(["sr-button"]);
        setIcon(this.infoButton, "info");
        this.infoButton.setAttribute("aria-label", "查看详情");
        this.infoButton.addEventListener("click", () => {
            // 显示当前项目详情
            if (this.item) {
                new Notice(`复习次数: ${this.item.timesReviewed}`);
            }
        });
    }

    /**
     * 创建跳过按钮
     */
    private _createSkipButton(containerEl: HTMLElement) {
        this.skipButton = containerEl.createEl("button");
        this.skipButton.addClasses(["sr-button"]);
        setIcon(this.skipButton, "skip-forward");
        this.skipButton.setAttribute("aria-label", "跳过");
        this.skipButton.addEventListener("click", () => {
            this.hide();
        });
    }
}
