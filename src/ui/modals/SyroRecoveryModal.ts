import {
    App,
    ButtonComponent,
    DropdownComponent,
    Modal,
    Setting,
    TextComponent,
} from "obsidian";
import { t } from "src/lang/helpers";
import type { SyroBaselineCandidate } from "src/dataStore/syroWorkspace";

export type SyroRecoveryMode = "baseline-required" | "rebuild-required";

export interface SyroRecoveryModalContext {
    mode: SyroRecoveryMode;
    defaultDeviceName: string;
    candidates: SyroBaselineCandidate[];
    recommendedSourceDeviceId: string | null;
}

export interface SyroRecoveryModalResult {
    deviceName: string;
    sourceDeviceId: string;
}

export class SyroRecoveryModal extends Modal {
    private deviceNameValue: string;
    private selectedSourceDeviceId: string;
    private deviceNameInput!: TextComponent;
    private sourceDropdown!: DropdownComponent;
    private confirmButton!: ButtonComponent;
    private resolvePromise: ((value: SyroRecoveryModalResult | null) => void) | null = null;
    private submitted = false;

    constructor(
        app: App,
        private readonly context: SyroRecoveryModalContext,
    ) {
        super(app);
        this.deviceNameValue = context.defaultDeviceName;
        this.selectedSourceDeviceId =
            context.recommendedSourceDeviceId ?? context.candidates[0]?.deviceId ?? "";
    }

    openAndWait(): Promise<SyroRecoveryModalResult | null> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", {
            text:
                this.context.mode === "baseline-required"
                    ? t("SYRO_RECOVERY_BASELINE_TITLE")
                    : t("SYRO_RECOVERY_REBUILD_TITLE"),
        });
        contentEl.createEl("p", {
            text:
                this.context.mode === "baseline-required"
                    ? t("SYRO_RECOVERY_BASELINE_DESC")
                    : t("SYRO_RECOVERY_REBUILD_DESC"),
        });

        new Setting(contentEl)
            .setName(t("SYRO_RECOVERY_DEVICE_NAME"))
            .addText((text) => {
                this.deviceNameInput = text;
                text.setValue(this.deviceNameValue).onChange((value) => {
                    this.deviceNameValue = value;
                });
            });

        new Setting(contentEl)
            .setName(t("SYRO_RECOVERY_SOURCE_DEVICE"))
            .addDropdown((dropdown) => {
                this.sourceDropdown = dropdown;
                for (const candidate of this.context.candidates) {
                    dropdown.addOption(
                        candidate.deviceId,
                        `${candidate.deviceName} (${candidate.shortDeviceId}) · ${candidate.lastSeenAt}`,
                    );
                }
                if (this.selectedSourceDeviceId) {
                    dropdown.setValue(this.selectedSourceDeviceId);
                }
                dropdown.onChange((value) => {
                    this.selectedSourceDeviceId = value;
                    this.syncConfirmState();
                });
            });

        const buttonRow = contentEl.createDiv("srs-flex-row sr-confirm-modal-actions");
        new ButtonComponent(buttonRow).setButtonText(t("CANCEL")).onClick(() => {
            this.close();
        });
        this.confirmButton = new ButtonComponent(buttonRow)
            .setButtonText(t("CONFIRM"))
            .setCta()
            .onClick(() => {
                if (!this.selectedSourceDeviceId) {
                    return;
                }

                this.submitted = true;
                this.closeWithResult({
                    deviceName: this.deviceNameValue.trim() || this.context.defaultDeviceName,
                    sourceDeviceId: this.selectedSourceDeviceId,
                });
            });

        this.syncConfirmState();
    }

    onClose(): void {
        this.contentEl.empty();
        if (!this.submitted) {
            this.closeWithResult(null);
        }
    }

    private syncConfirmState(): void {
        this.confirmButton?.setDisabled(!this.selectedSourceDeviceId);
    }

    private closeWithResult(result: SyroRecoveryModalResult | null): void {
        const resolve = this.resolvePromise;
        this.resolvePromise = null;
        if (resolve) {
            resolve(result);
        }
    }
}
