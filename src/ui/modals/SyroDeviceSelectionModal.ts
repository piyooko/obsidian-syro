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
                    button
                        .setButtonText(t("SYRO_SELECT_CURRENT_DEVICE_USE"))
                        .setCta()
                        .onClick(() => {
                            this.submitted = true;
                            this.closeWithResult({
                                action: "use-existing",
                                deviceId: candidate.deviceId,
                            });
                        });
                });
        }

        const buttonRow = contentEl.createDiv("srs-flex-row sr-confirm-modal-actions");
        new ButtonComponent(buttonRow).setButtonText(t("CANCEL")).onClick(() => {
            this.close();
        });
        new ButtonComponent(buttonRow)
            .setButtonText(t("SYRO_SELECT_CURRENT_DEVICE_CREATE_NEW"))
            .onClick(() => {
                this.submitted = true;
                this.closeWithResult({ action: "create-new" });
            });
    }

    onClose(): void {
        this.contentEl.empty();
        if (!this.submitted) {
            this.closeWithResult(null);
        }
    }

    private closeWithResult(result: SyroDeviceSelectionModalResult | null): void {
        const resolve = this.resolvePromise;
        this.resolvePromise = null;
        if (resolve) {
            resolve(result);
        }
    }
}
