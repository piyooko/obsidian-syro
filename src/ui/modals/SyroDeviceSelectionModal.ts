import { App, ButtonComponent, Modal, Setting } from "obsidian";
import type { SyroValidDeviceEntry } from "src/dataStore/syroWorkspace";
import { t } from "src/lang/helpers";

export interface SyroDeviceSelectionModalContext {
    defaultDeviceName: string;
    candidates: SyroValidDeviceEntry[];
}

export type SyroDeviceSelectionModalResult =
    | {
          action: "use-existing";
          deviceId: string;
      }
    | {
          action: "create-new";
      };

export class SyroDeviceSelectionModal extends Modal {
    private resolvePromise:
        | ((value: SyroDeviceSelectionModalResult | null) => void)
        | null = null;
    private submitted = false;
    private isSubmitting = false;
    private cancelButton: ButtonComponent | null = null;
    private createNewButton: ButtonComponent | null = null;
    private candidateButtons: ButtonComponent[] = [];
    private removeCloseGuards: (() => void) | null = null;

    constructor(
        app: App,
        private readonly context: SyroDeviceSelectionModalContext,
    ) {
        super(app);
    }

    openAndWait(): Promise<SyroDeviceSelectionModalResult | null> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.candidateButtons = [];
        this.installCloseGuards();

        contentEl.createEl("h2", {
            text: t("SYRO_SELECT_CURRENT_DEVICE_TITLE"),
        });
        contentEl.createEl("p", {
            text: t("SYRO_SELECT_CURRENT_DEVICE_DESC"),
        });

        for (const candidate of this.context.candidates) {
            new Setting(contentEl)
                .setName(`${candidate.deviceName} (${candidate.shortDeviceId})`)
                .setDesc(
                    `${t("SYRO_SELECT_CURRENT_DEVICE_FOLDER")}: ${candidate.deviceFolderName} · ${t("SYRO_SELECT_CURRENT_DEVICE_LAST_SEEN")}: ${candidate.lastSeenAt}`,
                )
                .addButton((button) => {
                    this.candidateButtons.push(button);
                    button
                        .setButtonText(t("SYRO_SELECT_CURRENT_DEVICE_USE"))
                        .setCta()
                        .onClick(() => {
                            if (this.isSubmitting) {
                                return;
                            }

                            this.setSubmitting(true);
                            this.submitted = true;
                            this.closeWithResult({
                                action: "use-existing",
                                deviceId: candidate.deviceId,
                            });
                            this.close();
                        });
                });
        }

        const buttonRow = contentEl.createDiv("srs-flex-row sr-confirm-modal-actions");
        this.cancelButton = new ButtonComponent(buttonRow).setButtonText(t("CANCEL")).onClick(() => {
            if (this.isSubmitting) {
                return;
            }

            this.close();
        });
        this.createNewButton = new ButtonComponent(buttonRow)
            .setButtonText(t("SYRO_SELECT_CURRENT_DEVICE_CREATE_NEW"))
            .onClick(() => {
                if (this.isSubmitting) {
                    return;
                }

                this.setSubmitting(true);
                this.submitted = true;
                this.closeWithResult({ action: "create-new" });
                this.close();
            });
    }

    onClose(): void {
        this.removeCloseGuards?.();
        this.removeCloseGuards = null;
        this.contentEl.empty();
        if (!this.submitted) {
            this.closeWithResult(null);
        }
    }

    private setSubmitting(isSubmitting: boolean): void {
        this.isSubmitting = isSubmitting;
        this.cancelButton?.setDisabled(isSubmitting);
        this.createNewButton?.setDisabled(isSubmitting);
        for (const button of this.candidateButtons) {
            button.setDisabled(isSubmitting);
        }
    }

    private installCloseGuards(): void {
        const blockBackdropClose = (event: MouseEvent): void => {
            const target = event.target;
            if (!(target instanceof Node) || this.modalEl.contains(target)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
        };
        const blockEscapeClose = (event: KeyboardEvent): void => {
            if (event.key !== "Escape") {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
        };

        this.containerEl.addEventListener("mousedown", blockBackdropClose, true);
        this.containerEl.addEventListener("click", blockBackdropClose, true);
        window.addEventListener("keydown", blockEscapeClose, true);
        this.removeCloseGuards = () => {
            this.containerEl.removeEventListener("mousedown", blockBackdropClose, true);
            this.containerEl.removeEventListener("click", blockBackdropClose, true);
            window.removeEventListener("keydown", blockEscapeClose, true);
        };
    }

    private closeWithResult(result: SyroDeviceSelectionModalResult | null): void {
        const resolve = this.resolvePromise;
        this.resolvePromise = null;
        if (resolve) {
            resolve(result);
        }
    }
}
