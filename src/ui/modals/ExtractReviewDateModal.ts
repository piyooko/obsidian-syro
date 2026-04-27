import { App, Modal, Notice, Setting } from "obsidian";
import { t } from "src/lang/helpers";

function formatDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function getDefaultExtractReviewDateValue(now = new Date()): string {
    const next = new Date(now);
    if (now.getHours() >= 4) {
        next.setDate(next.getDate() + 1);
    }
    return formatDateInputValue(next);
}

export function buildExtractDueAtFromDateValue(value: string): number {
    const [year, month, day] = value.split("-").map((part) => Number(part));
    return new Date(year, month - 1, day, 4, 0, 0, 0).valueOf();
}

export class ExtractReviewDateModal extends Modal {
    private dateValue = getDefaultExtractReviewDateValue();

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

        new Setting(contentEl)
            .setName(t("EXTRACT_SET_DATE_LABEL"))
            .addText((text) => {
                text.inputEl.type = "date";
                text.setValue(this.dateValue);
                text.onChange((value) => {
                    this.dateValue = value;
                });
            });

        const actions = contentEl.createDiv("sr-confirm-modal-actions");
        actions.createEl("button", { text: t("CANCEL") }).addEventListener("click", () => {
            this.close();
        });

        const submit = actions.createEl("button", { text: t("SAVE"), cls: "mod-cta" });
        submit.addEventListener("click", () => {
            const dueAt = buildExtractDueAtFromDateValue(this.dateValue);
            if (!Number.isFinite(dueAt) || dueAt <= Date.now()) {
                new Notice(t("EXTRACT_SET_DATE_INVALID"));
                return;
            }
            this.onSubmit(dueAt);
            this.close();
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
