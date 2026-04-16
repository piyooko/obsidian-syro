jest.mock("obsidian", () => {
    const decorateElement = <T extends HTMLDivElement | HTMLElement>(element: T): T => {
        Object.assign(element, {
            empty: () => {
                element.innerHTML = "";
            },
            createEl: (tagName: string, options?: { text?: string }) => {
                const child = decorateElement(document.createElement(tagName));
                if (options?.text) {
                    child.textContent = options.text;
                }
                element.appendChild(child);
                return child;
            },
            createDiv: (className?: string) => {
                const child = decorateElement(document.createElement("div"));
                if (className) {
                    child.className = className;
                }
                element.appendChild(child);
                return child;
            },
        });
        return element;
    };

    class Modal {
        app: unknown;
        containerEl: HTMLDivElement;
        modalEl: HTMLDivElement;
        contentEl: HTMLDivElement;

        constructor(app: unknown) {
            this.app = app;
            this.containerEl = decorateElement(document.createElement("div"));
            this.modalEl = decorateElement(document.createElement("div"));
            this.contentEl = decorateElement(document.createElement("div"));
            this.modalEl.appendChild(this.contentEl);
            this.containerEl.appendChild(this.modalEl);
        }

        open() {
            document.body.appendChild(this.containerEl);
            this.onOpen();
        }

        close() {
            this.onClose();
            this.containerEl.remove();
        }

        onOpen() {}

        onClose() {}
    }

    class ButtonComponent {
        buttonEl: HTMLButtonElement;

        constructor(containerEl: HTMLElement) {
            this.buttonEl = document.createElement("button");
            containerEl.appendChild(this.buttonEl);
        }

        setButtonText(text: string) {
            this.buttonEl.textContent = text;
            return this;
        }

        setCta() {
            this.buttonEl.classList.add("mod-cta");
            return this;
        }

        setWarning() {
            this.buttonEl.classList.add("mod-warning");
            return this;
        }

        onClick(callback: () => void) {
            this.buttonEl.addEventListener("click", callback);
            return this;
        }

        setDisabled(disabled: boolean) {
            this.buttonEl.disabled = disabled;
            return this;
        }
    }

    class TextComponent {
        inputEl: HTMLInputElement;

        constructor(containerEl: HTMLElement) {
            this.inputEl = document.createElement("input");
            this.inputEl.type = "text";
            containerEl.appendChild(this.inputEl);
        }

        setValue(value: string) {
            this.inputEl.value = value;
            return this;
        }

        getValue() {
            return this.inputEl.value;
        }

        onChange(callback: (value: string) => void) {
            this.inputEl.addEventListener("input", () => callback(this.inputEl.value));
            return this;
        }

        setDisabled(disabled: boolean) {
            this.inputEl.disabled = disabled;
            return this;
        }
    }

    class DropdownComponent {
        selectEl: HTMLSelectElement;

        constructor(containerEl: HTMLElement) {
            this.selectEl = document.createElement("select");
            containerEl.appendChild(this.selectEl);
        }

        addOption(value: string, label: string) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            this.selectEl.appendChild(option);
            return this;
        }

        setValue(value: string) {
            this.selectEl.value = value;
            return this;
        }

        onChange(callback: (value: string) => void) {
            this.selectEl.addEventListener("change", () => callback(this.selectEl.value));
            return this;
        }

        setDisabled(disabled: boolean) {
            this.selectEl.disabled = disabled;
            return this;
        }
    }

    class Setting {
        settingEl: HTMLDivElement;
        nameEl: HTMLDivElement;
        descEl: HTMLDivElement;
        controlEl: HTMLDivElement;

        constructor(containerEl: HTMLElement) {
            this.settingEl = document.createElement("div");
            this.settingEl.className = "setting-item";
            this.nameEl = document.createElement("div");
            this.nameEl.className = "setting-item-name";
            this.descEl = document.createElement("div");
            this.descEl.className = "setting-item-description";
            this.controlEl = document.createElement("div");
            this.controlEl.className = "setting-item-control";
            this.settingEl.append(this.nameEl, this.descEl, this.controlEl);
            containerEl.appendChild(this.settingEl);
        }

        setName(name: string) {
            this.nameEl.textContent = name;
            return this;
        }

        setDesc(desc: string) {
            this.descEl.textContent = desc;
            return this;
        }

        addButton(callback: (button: ButtonComponent) => void) {
            callback(new ButtonComponent(this.controlEl));
            return this;
        }

        addText(callback: (text: TextComponent) => void) {
            callback(new TextComponent(this.controlEl));
            return this;
        }

        addDropdown(callback: (dropdown: DropdownComponent) => void) {
            callback(new DropdownComponent(this.controlEl));
            return this;
        }
    }

    return {
        App: class App {},
        ButtonComponent,
        DropdownComponent,
        Modal,
        moment: {
            locale: () => "en",
        },
        Setting,
        TextComponent,
    };
});

import { App } from "obsidian";
import { SyroDeleteInvalidDeviceModal } from "src/ui/modals/SyroDeleteInvalidDeviceModal";
import { SyroDeleteValidDeviceModal } from "src/ui/modals/SyroDeleteValidDeviceModal";
import { SyroDeviceSelectionModal } from "src/ui/modals/SyroDeviceSelectionModal";
import { SyroRecoveryModal } from "src/ui/modals/SyroRecoveryModal";

function findButton(label: string): HTMLButtonElement {
    const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.textContent === label,
    );
    if (!button) {
        throw new Error(`Unable to find button: ${label}`);
    }
    return button;
}

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
}

describe("Syro recovery modals", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("does not close the recovery modal on backdrop click or Escape", async () => {
        const modal = new SyroRecoveryModal(new App(), {
            mode: "baseline-required",
            defaultDeviceName: "Mobile",
            candidates: [
                {
                    deviceId: "91ac1111-2222-3333-4444-555555555555",
                    deviceName: "Desktop",
                    shortDeviceId: "91ac",
                    deviceFolderName: "Desktop--91ac",
                    lastSeenAt: "2026-04-13T00:00:00.000Z",
                    baselineFromDeviceId: null,
                    baselineBuiltAt: null,
                },
            ],
            recommendedSourceDeviceId: "91ac1111-2222-3333-4444-555555555555",
        });

        let resolved = false;
        const resultPromise = modal.openAndWait().then((value) => {
            resolved = true;
            return value;
        });

        modal.containerEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        modal.containerEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await flushMicrotasks();

        expect(resolved).toBe(false);
        expect(modal.containerEl.isConnected).toBe(true);

        findButton("Cancel").click();
        await expect(resultPromise).resolves.toBeNull();
    });

    it("submits the recovery modal only once and closes immediately", async () => {
        const modal = new SyroRecoveryModal(new App(), {
            mode: "baseline-required",
            defaultDeviceName: "Mobile",
            candidates: [
                {
                    deviceId: "91ac1111-2222-3333-4444-555555555555",
                    deviceName: "Desktop",
                    shortDeviceId: "91ac",
                    deviceFolderName: "Desktop--91ac",
                    lastSeenAt: "2026-04-13T00:00:00.000Z",
                    baselineFromDeviceId: null,
                    baselineBuiltAt: null,
                },
            ],
            recommendedSourceDeviceId: "91ac1111-2222-3333-4444-555555555555",
        });

        const resultPromise = modal.openAndWait();
        const confirmButton = findButton("Confirm");

        confirmButton.click();
        confirmButton.click();

        await expect(resultPromise).resolves.toEqual({
            deviceName: "Mobile",
            sourceDeviceId: "91ac1111-2222-3333-4444-555555555555",
        });
        expect(modal.containerEl.isConnected).toBe(false);
    });

    it("does not close the device selection modal on backdrop click or Escape", async () => {
        const modal = new SyroDeviceSelectionModal(new App(), {
            defaultDeviceName: "Mobile",
            candidates: [
                {
                    deviceId: "91ac1111-2222-3333-4444-555555555555",
                    deviceName: "Desktop",
                    shortDeviceId: "91ac",
                    deviceFolderName: "Desktop--91ac",
                    deviceReviewCount: 12,
                    lastSeenAt: "2026-04-13T00:00:00.000Z",
                    baselineFromDeviceId: null,
                    baselineBuiltAt: null,
                    deviceRoot: ".obsidian/plugins/syro/devices/Desktop--91ac",
                    deviceMetaPath: ".obsidian/plugins/syro/devices/Desktop--91ac/device.json",
                    metadata: {
                        version: 1,
                        deviceId: "91ac1111-2222-3333-4444-555555555555",
                        deviceName: "Desktop",
                        shortDeviceId: "91ac",
                        createdAt: "2026-04-12T00:00:00.000Z",
                        updatedAt: "2026-04-13T00:00:00.000Z",
                        lastSeenAt: "2026-04-13T00:00:00.000Z",
                        ownerInstallIdHash: null,
                        baselineFromDeviceId: null,
                        baselineBuiltAt: null,
                        importedSessionIds: [],
                        importedSessionRetentionUntil: {},
                    },
                },
            ],
        });

        let resolved = false;
        const resultPromise = modal.openAndWait().then((value) => {
            resolved = true;
            return value;
        });

        modal.containerEl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        modal.containerEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await flushMicrotasks();

        expect(resolved).toBe(false);
        expect(modal.containerEl.isConnected).toBe(true);

        findButton("Cancel").click();
        await expect(resultPromise).resolves.toBeNull();
    });

    it("submits the device selection modal only once", async () => {
        const modal = new SyroDeviceSelectionModal(new App(), {
            defaultDeviceName: "Mobile",
            candidates: [
                {
                    deviceId: "91ac1111-2222-3333-4444-555555555555",
                    deviceName: "Desktop",
                    shortDeviceId: "91ac",
                    deviceFolderName: "Desktop--91ac",
                    deviceReviewCount: 12,
                    lastSeenAt: "2026-04-13T00:00:00.000Z",
                    baselineFromDeviceId: null,
                    baselineBuiltAt: null,
                    deviceRoot: ".obsidian/plugins/syro/devices/Desktop--91ac",
                    deviceMetaPath: ".obsidian/plugins/syro/devices/Desktop--91ac/device.json",
                    metadata: {
                        version: 1,
                        deviceId: "91ac1111-2222-3333-4444-555555555555",
                        deviceName: "Desktop",
                        shortDeviceId: "91ac",
                        createdAt: "2026-04-12T00:00:00.000Z",
                        updatedAt: "2026-04-13T00:00:00.000Z",
                        lastSeenAt: "2026-04-13T00:00:00.000Z",
                        ownerInstallIdHash: null,
                        baselineFromDeviceId: null,
                        baselineBuiltAt: null,
                        importedSessionIds: [],
                        importedSessionRetentionUntil: {},
                    },
                },
            ],
        });

        const resultPromise = modal.openAndWait();
        const createButton = findButton("Create new device");

        createButton.click();
        createButton.click();

        await expect(resultPromise).resolves.toEqual({ action: "create-new" });
        expect(modal.containerEl.isConnected).toBe(false);
    });

    it("submits the invalid device delete modal only once and closes immediately", async () => {
        const modal = new SyroDeleteInvalidDeviceModal(new App(), "Desktop--91ac");

        const resultPromise = modal.openAndWait();
        const confirmInput = document.querySelector("input");
        expect(confirmInput).not.toBeNull();

        if (!(confirmInput instanceof HTMLInputElement)) {
            throw new Error("Unable to find invalid device confirmation input.");
        }

        confirmInput.value = "I understand the risks and want to delete";
        confirmInput.dispatchEvent(new Event("input", { bubbles: true }));

        const deleteButton = findButton("Delete invalid directory");
        expect(deleteButton.disabled).toBe(false);

        deleteButton.click();
        deleteButton.click();

        await expect(resultPromise).resolves.toBe(true);
        expect(modal.containerEl.isConnected).toBe(false);
    });

    it("submits the valid device delete modal only once and closes immediately", async () => {
        const modal = new SyroDeleteValidDeviceModal(new App(), "Desktop");

        const resultPromise = modal.openAndWait();
        const confirmInput = document.querySelector("input");
        expect(confirmInput).not.toBeNull();

        if (!(confirmInput instanceof HTMLInputElement)) {
            throw new Error("Unable to find valid device confirmation input.");
        }

        confirmInput.value = "I understand the risks and want to delete";
        confirmInput.dispatchEvent(new Event("input", { bubbles: true }));

        const deleteButton = findButton("Delete device");
        expect(deleteButton.disabled).toBe(false);

        deleteButton.click();
        deleteButton.click();

        await expect(resultPromise).resolves.toBe(true);
        expect(modal.containerEl.isConnected).toBe(false);
    });
});
