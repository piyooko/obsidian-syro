jest.mock("obsidian", () => {
    const decorateElement = <T extends HTMLDivElement>(element: T): T => {
        Object.assign(element, {
            empty: () => {
                element.innerHTML = "";
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

    class Component {
        load() {}

        unload() {}
    }

    class Modal {
        app: unknown;
        containerEl: HTMLDivElement;
        modalEl: HTMLDivElement;
        contentEl: HTMLDivElement;
        onClose: () => void = () => {};

        constructor(app: unknown) {
            this.app = app;
            this.containerEl = decorateElement(document.createElement("div"));
            this.modalEl = decorateElement(document.createElement("div"));
            this.contentEl = decorateElement(document.createElement("div"));
            this.modalEl.className = "modal";
            this.modalEl.appendChild(this.contentEl);
            this.containerEl.appendChild(this.modalEl);
        }

        open() {
            document.body.appendChild(this.containerEl);
        }

        close() {
            this.onClose();
            this.containerEl.remove();
        }
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

        onClick(callback: () => void) {
            this.buttonEl.addEventListener("click", callback);
            return this;
        }

        setCta() {
            this.buttonEl.classList.add("mod-cta");
            return this;
        }
    }

    return {
        App: class App {},
        ButtonComponent,
        Component,
        MarkdownRenderer: {
            render: jest.fn(
                async (_app: unknown, message: string, containerEl: HTMLElement): Promise<void> => {
                    containerEl.innerHTML = message
                        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                        .replace(/`([^`]+)`/g, "<code>$1</code>");
                },
            ),
        },
        Modal,
        moment: {
            locale: () => "en",
        },
    };
});

import { App } from "obsidian";
import ConfirmModal from "src/ui/modals/confirm";

function findButton(label: string): HTMLButtonElement {
    const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.textContent === label,
    );
    if (!button) {
        throw new Error(`Unable to find button: ${label}`);
    }
    return button;
}

describe("ConfirmModal", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("applies destructive classes to the modal and confirm button when requested", () => {
        const modal = new ConfirmModal(
            { app: new App() } as never,
            "Use `${source}` to **overwrite the current device** `${current}`?",
            () => undefined,
            { destructive: true },
        );

        modal.open();

        expect(modal.modal.modalEl.classList.contains("sr-confirm-modal")).toBe(true);
        expect(modal.modal.modalEl.classList.contains("is-destructive")).toBe(true);
        expect(modal.modal.contentEl.querySelector("strong")?.textContent).toBe(
            "overwrite the current device",
        );

        const confirmButton = findButton("Confirm");
        expect(confirmButton.classList.contains("mod-cta")).toBe(true);
        expect(confirmButton.classList.contains("is-destructive")).toBe(true);
    });
});
