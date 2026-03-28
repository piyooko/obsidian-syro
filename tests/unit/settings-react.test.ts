import { SRSettingTab } from "src/ui/settings/settings-react";

const createRootMock = jest.fn((_container?: unknown) => ({
    render: jest.fn(),
    unmount: jest.fn(),
}));

jest.mock("react-dom/client", () => ({
    createRoot: (container: unknown) => createRootMock(container),
}));

jest.mock("src/ui/adapters/settingsAdapter", () => ({
    settingsToUIState: jest.fn(() => ({})),
    mergeUIStateToSettings: jest.fn(),
}));

jest.mock("src/ui/settings/applySettingsUpdate", () => ({
    applySettingsUpdate: (fn: () => void) => fn(),
}));

jest.mock("obsidian", () => {
    class MockPluginSettingTab {
        app: unknown;
        plugin: unknown;
        containerEl: HTMLElement & {
            empty: () => void;
            createDiv: (options?: { cls?: string }) => HTMLDivElement;
            addClass: (...classNames: string[]) => void;
        };

        constructor(app: unknown, plugin: unknown) {
            this.app = app;
            this.plugin = plugin;
            const el = document.createElement("div") as MockPluginSettingTab["containerEl"];
            el.empty = () => {
                el.innerHTML = "";
            };
            el.createDiv = (options?: { cls?: string }) => {
                const div = document.createElement("div");
                if (options?.cls) {
                    div.className = options.cls;
                }
                el.appendChild(div);
                return div;
            };
            el.addClass = (...classNames: string[]) => {
                el.classList.add(...classNames);
            };
            this.containerEl = el;
        }
    }

    return {
        App: class App {},
        Notice: class Notice {
            constructor(_message?: string) {}
        },
        PluginSettingTab: MockPluginSettingTab,
        moment: {
            locale: () => "en",
        },
    };
});

describe("SRSettingTab", () => {
    beforeEach(() => {
        createRootMock.mockClear();
    });

    it("mounts React into a dedicated settings root instead of reusing sr-settings-panel", () => {
        const plugin = {
            data: { settings: {} },
            manifest: { version: "0.0.8" },
        };

        const tab = new SRSettingTab({} as never, plugin as never);
        tab.display();

        expect(tab.containerEl.classList.contains("sr-settings-container")).toBe(true);
        expect(tab.containerEl.querySelector(".sr-settings-react-root")).not.toBeNull();
        expect(tab.containerEl.querySelector(".sr-settings-panel")).toBeNull();
        expect(createRootMock).toHaveBeenCalledTimes(1);
        expect((createRootMock.mock.calls[0] as unknown[] | undefined)?.[0]).toBe(
            tab.containerEl.querySelector(".sr-settings-react-root"),
        );
    });
});
