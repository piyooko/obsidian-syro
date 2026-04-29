import { App, Modal, Notice, Setting } from "obsidian";
import { t } from "src/lang/helpers";

export function getDefaultExtractReviewDelayDaysValue(): string {
    return "1";
}

export function buildExtractDueAtFromDelayDaysValue(value: string, now = new Date()): number {
    const normalizedValue = value.trim();
    if (!/^\d+$/.test(normalizedValue)) {
        return Number.NaN;
    }

    const delayDays = Number(normalizedValue);
    if (!Number.isSafeInteger(delayDays) || delayDays <= 0) {
        return Number.NaN;
    }

    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + delayDays);
    dueDate.setHours(4, 0, 0, 0);
    return dueDate.valueOf();
}

export class ExtractReviewDateModal extends Modal {
    private delayDaysValue = getDefaultExtractReviewDelayDaysValue();

    constructor(
        app: App,
        private readonly onSubmit: (dueAt: number) => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: t("EXTRACT_SET_DATE_TITLE") });

        const submitDelayDays = () => {
            const dueAt = buildExtractDueAtFromDelayDaysValue(this.delayDaysValue);
            if (!Number.isFinite(dueAt) || dueAt <= Date.now()) {
                new Notice(t("EXTRACT_SET_DATE_INVALID"));
                return;
            }
            this.onSubmit(dueAt);
            this.close();
        };

        new Setting(contentEl)
            .setName(t("EXTRACT_SET_DATE_LABEL"))
            .addText((text) => {
                text.inputEl.type = "number";
                text.inputEl.min = "1";
                text.inputEl.step = "1";
                text.inputEl.inputMode = "numeric";
                text.setPlaceholder("22");
                text.setValue(this.delayDaysValue);
                text.onChange((value) => {
                    this.delayDaysValue = value;
                });
                text.inputEl.addEventListener("keydown", (event) => {
                    if (event.key !== "Enter") {
                        return;
                    }
                    event.preventDefault();
                    submitDelayDays();
                });
                window.setTimeout(() => {
                    text.inputEl.focus();
                    text.inputEl.select();
                });
            });

        const actions = contentEl.createDiv("sr-confirm-modal-actions");
        actions.createEl("button", { text: t("CANCEL") }).addEventListener("click", () => {
            this.close();
        });

        const submit = actions.createEl("button", { text: t("SAVE"), cls: "mod-cta" });
        submit.addEventListener("click", submitDelayDays);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
