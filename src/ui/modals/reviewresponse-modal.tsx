import { MarkdownView, Notice, Platform, setIcon } from "obsidian";
import { TouchOnMobile } from "src/Events/touchEvent";
import { FlashcardReviewMode } from "src/FlashcardReviewSequencer";
import { t } from "src/lang/helpers";
import { textInterval } from "src/scheduling";
import { SRSettings } from "src/settings";
import { Iadapter } from "src/dataStore/adapter";
import * as MixQueSet from "src/dataStore/mixQueSet";
import { RepetitionItem } from "src/dataStore/repetitionItem";
import SRPlugin from "src/main";
import { SrsAlgorithm } from "src/algorithms/algorithms";

export class reviewResponseModal {
    private static instance: reviewResponseModal;
    public plugin: SRPlugin;
    private settings: SRSettings;
    public submitCallback: (resp: number) => void;
    private algorithm: SrsAlgorithm | null = null;
    private ownerdoc: Document;
    private vwcontainerEl: HTMLElement;
    private containerEl: HTMLElement;
    private contentEl: HTMLElement;

    barId = "reviewResponseModalBar";
    answerBtn: HTMLButtonElement;
    buttons: HTMLButtonElement[];
    response: HTMLDivElement;
    controls: HTMLDivElement;
    private notecontrols: HTMLDivElement;
    private skipButton: HTMLButtonElement;
    private responseInterval: number[] | null = null;
    private item: RepetitionItem | undefined;
    private showInterval = true;
    private buttonTexts: string[] = [];
    private options: string[] = [];
    private _reviewMode: FlashcardReviewMode;

    respCallback: (resp: number) => Promise<void> | void;
    showAnsCB: () => void;
    public cardtotalCB: () => number;
    public notetotalCB: () => number;
    public openNextCardCB: () => void;
    public openNextNoteCB: () => void;
    public barCloseHandler: () => void;
    infoButton: HTMLButtonElement;

    static getInstance() {
        return reviewResponseModal.instance;
    }

    constructor(plugin: SRPlugin, settings: SRSettings) {
        this.plugin = plugin;
        this.settings = settings;
        reviewResponseModal.instance = this;
    }

    private getResponseTexts(item: RepetitionItem): string[] {
        const texts = item.isCard
            ? this.settings.flashcardResponseTexts
            : this.settings.noteResponseTexts;
        return [texts.again, texts.hard, texts.good, texts.easy];
    }

    private syncDisplayState(item: RepetitionItem | undefined): void {
        const isCard = item?.isCard ?? false;
        this.algorithm = isCard ? this.plugin.cardAlgorithm : this.plugin.noteAlgorithm;
        this.options = this.algorithm?.srsOptions() ?? [];
        this.buttonTexts = item ? this.getResponseTexts(item) : [];
    }

    public display(
        item?: RepetitionItem,
        callback?: (resp: number) => Promise<void>,
        front?: boolean,
    ): void {
        const settings = this.settings;

        if (!settings.reviewResponseFloatBar || !settings.autoNextNote) return;

        this.item = item;
        this.syncDisplayState(item);

        if (item && this.algorithm) {
            this.responseInterval = this.algorithm.calcAllOptsIntervals(item);
        } else {
            this.responseInterval = null;
        }

        if (!this.hasBar() || !this.buttons) {
            this.build();
        }
        this.containerEl.show();

        if (callback) {
            this.respCallback = callback;
        }

        this._updateControls(this.item?.isCard ?? false);

        if (this.item?.isCard && front !== false) {
            this.showQuestion();
        } else {
            this.showAnswer();
        }
    }

    build() {
        if (this.isDisplay()) return;

        const optBtnCounts = this.options.length || 4;
        let btnCols = 4;
        if (!Platform.isMobile && optBtnCounts > btnCols) {
            btnCols = optBtnCounts;
        }

        this.containerEl = createEl("div");
        this.containerEl.setAttribute("id", this.barId);
        this.containerEl.hide();

        const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        view?.containerEl?.appendChild(this.containerEl);

        if (view) {
            this.vwcontainerEl = view.containerEl;
            this.ownerdoc = view.containerEl.ownerDocument;
            this.addKeysEvent();

            view.onunload = () => {
                this.close();
                view.containerEl.removeChild(this.containerEl);
            };
        }

        this.contentEl = this.containerEl.createDiv("sr-show-response");
        this.contentEl.addClass("sr-modal-content");
        this.contentEl.addClass("sr-flashcard");

        this.notecontrols = this.contentEl.createDiv();
        this.controls = this.contentEl.createDiv();

        this.response = this.contentEl.createDiv("sr-show-response");
        this.response.setAttribute("style", `grid-template-columns: ${"1fr ".repeat(btnCols)}`);

        this.buttons = [];
        this._createNoteControls();
        this.createButtons_responses();
        this.createButton_showAnswer();

        this.addMenuEvent();
        this.addTouchEvent();
        this._autoClose();
    }

    set reviewMode(reviewMode: FlashcardReviewMode) {
        this._reviewMode = reviewMode;
    }

    private async buttonClick(option: string) {
        this.hideControls();
        let mqs: ReturnType<typeof MixQueSet.getInstance> | undefined;
        const isCard = this.item?.isCard ?? false;

        if (
            this._reviewMode === FlashcardReviewMode.Review &&
            this.settings.mixCardNote &&
            this.openNextCardCB &&
            this.openNextNoteCB &&
            this.item
        ) {
            mqs = MixQueSet.getInstance();
            MixQueSet.arbitrateCardNote(this.item, this.cardtotalCB(), this.notetotalCB());
        }

        const optionIndex = this.options.indexOf(option);
        if (isCard && this.respCallback) {
            await Promise.resolve(this.respCallback(optionIndex));
        } else if (!isCard && this.submitCallback) {
            this.submitCallback(optionIndex);
        }

        if (mqs) {
            if (!isCard && MixQueSet.isCard()) {
                this.openNextCardCB();
                this._updateControls(true);
            } else if (isCard && !MixQueSet.isCard()) {
                this.openNextNoteCB();
                this._updateControls(false);
            }
        }
    }

    private _createNoteControls() {
        this.notecontrols.addClass("sr-header");
        this._createCloseButton(this.notecontrols);

        const div = this.notecontrols.createDiv();
        this._createIntervalButton(div);
        this._createResetButton(div);
        this._createCardInfoButton(div);
        this._createSkipButton(div);
        div.addClass("sr-controls");
        this.notecontrols.hide();
    }

    private _createResetButton(containerEl: HTMLElement) {
        const btn = containerEl.createEl("button");
        btn.addClasses(["sr-button", "sr-reset-button"]);
        setIcon(btn, "refresh-cw");
        btn.setAttribute("aria-label", t("RESET_CARD_PROGRESS"));
        btn.addEventListener("click", () => {
            if (this.options[0]) {
                void this.buttonClick(this.options[0]);
            }
        });
    }

    private createButtons_responses() {
        this.options.forEach((opt, index) => {
            const btn = this.response.createEl("button");
            btn.setAttribute("id", `sr-${opt.toLowerCase()}-btn`);
            btn.addClasses(["sr-response-button", "sr-is-hidden"]);
            btn.setText(this.getTextWithInterval(index));
            btn.addEventListener("click", () => {
                void this.buttonClick(opt);
            });
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
            this.showAnsCB?.();
            this.showAnswer();
        });
        this.answerBtn.addClass("sr-is-hidden");
    }

    private _keydownHandler = (e: KeyboardEvent) => {
        const bar = this.vwcontainerEl.querySelector(`#${this.barId}`);

        if (
            bar &&
            bar.checkVisibility() &&
            this.isDisplay() &&
            Iadapter.instance.app.workspace.getActiveViewOfType(MarkdownView).getMode() ===
                "preview" &&
            this.answerBtn.hasClass("sr-is-hidden")
        ) {
            const consume = () => {
                e.preventDefault();
                e.stopPropagation();
            };
            this.options.some((_opt, idx) => {
                const num = `Numpad${idx}`;
                const dig = `Digit${idx}`;
                if (e.code === num || e.code === dig) {
                    void this.buttonClick(this.options[idx]);
                    consume();
                    return true;
                }
                return false;
            });
        }
    };

    private toggleShowInterval() {
        this.showInterval = !this.showInterval;
    }

    private showAnswer() {
        this.answerBtn.addClass("sr-is-hidden");
        this.response.removeClass("sr-is-hidden");

        this.options.forEach((opt, index) => {
            const btn =
                this.vwcontainerEl.querySelector<HTMLButtonElement>(
                    `#sr-${opt.toLowerCase()}-btn`,
                ) ?? this.buttons[index];
            btn.setText(this.getTextWithInterval(index));
            btn.removeClass("sr-is-hidden");
        });
    }

    private showQuestion() {
        this.answerBtn.removeClass("sr-is-hidden");
        this.buttons.forEach((btn) => {
            btn.addClass("sr-is-hidden");
        });
    }

    private getTextWithInterval(index: number) {
        let text = this.buttonTexts[index] ?? this.options[index] ?? "";
        if (this.showInterval) {
            text =
                this.responseInterval == null
                    ? text
                    : Platform.isMobile
                      ? textInterval(this.responseInterval[index], true)
                      : `${text} - ${textInterval(this.responseInterval[index], false)}`;
        }
        return text;
    }

    public hasBar() {
        return this.vwcontainerEl?.querySelector(`#${this.barId}`) != null;
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
        const rrBar = this.vwcontainerEl?.querySelector(`#${this.barId}`);
        if (rrBar) {
            this.removeKeysEvent();
            if (rrBar.firstChild) {
                rrBar.removeChild(rrBar.firstChild);
            }
            rrBar.remove();
        }
    }

    private _autoClose() {
        return;
    }

    addKeysEvent() {
        if (this.ownerdoc && this._keydownHandler) {
            this.ownerdoc.addEventListener("keydown", this._keydownHandler);
        }
    }

    removeKeysEvent() {
        if (this.ownerdoc && this._keydownHandler) {
            this.ownerdoc.removeEventListener("keydown", this._keydownHandler);
        }
    }

    addMenuEvent() {}

    addTouchEvent() {
        if (Platform.isMobile && this.contentEl) {
            TouchOnMobile.create();
        }
    }

    hideControls() {
        this.notecontrols?.hide();
        this.controls?.hide();
    }

    private _updateControls(isCard: boolean) {
        if (isCard) {
            this.notecontrols.hide();
            this.controls.show();
        } else {
            this.controls.hide();
            this.notecontrols.show();
        }
    }

    private _createCloseButton(containerEl: HTMLElement) {
        const btn = containerEl.createEl("button");
        btn.addClasses(["sr-button", "sr-close-button"]);
        setIcon(btn, "x");
        btn.setAttribute("aria-label", t("CLOSE"));
        btn.addEventListener("click", () => {
            this.hide();
            this.barCloseHandler?.();
        });
    }

    private _createIntervalButton(containerEl: HTMLElement) {
        const btn = containerEl.createEl("button");
        btn.addClasses(["sr-button"]);
        setIcon(btn, "clock");
        btn.setAttribute("aria-label", t("INTERVAL_SHOWHIDE"));
        btn.addEventListener("click", () => {
            this.toggleShowInterval();
            this.showAnswer();
        });
    }

    private _createCardInfoButton(containerEl: HTMLElement) {
        this.infoButton = containerEl.createEl("button");
        this.infoButton.addClasses(["sr-button"]);
        setIcon(this.infoButton, "info");
        this.infoButton.setAttribute("aria-label", t("UI_CARD_INFO"));
        this.infoButton.addEventListener("click", () => {
            if (this.item) {
                new Notice(t("REVIEW_TIMES_REVIEWED", { count: this.item.timesReviewed }));
            }
        });
    }

    private _createSkipButton(containerEl: HTMLElement) {
        this.skipButton = containerEl.createEl("button");
        this.skipButton.addClasses(["sr-button"]);
        setIcon(this.skipButton, "skip-forward");
        this.skipButton.setAttribute("aria-label", t("SKIP"));
        this.skipButton.addEventListener("click", () => {
            this.hide();
        });
    }
}
