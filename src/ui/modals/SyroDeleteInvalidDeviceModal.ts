import { App, ButtonComponent, Modal, Setting, TextComponent } from "obsidian";
import { t } from "src/lang/helpers";

export class SyroDeleteInvalidDeviceModal extends Modal {
    private resolvePromise: ((value: boolean) => void) | null = null;
    private confirmInput!: TextComponent;
    private confirmButton!: ButtonComponent;
    private submitted = false;

    constructor(
        app: App,
        private readonly deviceFolderName: string,
    ) {
        super(app);
    }

    openAndWait(): Promise<boolean> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        const requiredPhrase = this.getRequiredPhrase();

        contentEl.createEl("h2", {
            text: t("SYRO_DELETE_INVALID_DEVICE_TITLE"),
        });
        contentEl.createEl("p", {
            text: t("SYRO_DELETE_INVALID_DEVICE_DESC", {
                folder: this.deviceFolderName,
            }),
        });

        new Setting(contentEl)
            .setName(t("SYRO_DELETE_INVALID_DEVICE_CONFIRM_LABEL"))
            .setDesc(
                t("SYRO_DELETE_INVALID_DEVICE_CONFIRM_DESC", {
                    phrase: requiredPhrase,
                }),
            )
            .addText((text) => {
                this.confirmInput = text;
                text.onChange(() => {
                    this.syncConfirmState();
                });
            });

        const buttonRow = contentEl.createDiv("srs-flex-row sr-confirm-modal-actions");
        new ButtonComponent(buttonRow).setButtonText(t("CANCEL")).onClick(() => {
            this.close();
        });
        this.confirmButton = new ButtonComponent(buttonRow)
            .setButtonText(t("SYRO_DELETE_INVALID_DEVICE_BUTTON"))
            .setWarning()
            .onClick(() => {
                if (!this.isConfirmed()) {
                    return;
                }

                this.submitted = true;
                this.close();
                this.closeWithResult(true);
            });

        this.syncConfirmState();
    }

    onClose(): void {
        this.contentEl.empty();
        if (!this.submitted) {
            this.closeWithResult(false);
        }
    }

    private getRequiredPhrase(): string {
        return t("SYRO_DELETE_INVALID_DEVICE_PHRASE");
    }

    private isConfirmed(): boolean {
        return this.confirmInput?.getValue().trim() === this.getRequiredPhrase().trim();
    }

    private syncConfirmState(): void {
        this.confirmButton?.setDisabled(!this.isConfirmed());
    }

    private closeWithResult(result: boolean): void {
        const resolve = this.resolvePromise;
        this.resolvePromise = null;
        if (resolve) {
            resolve(result);
        }
    }
}
