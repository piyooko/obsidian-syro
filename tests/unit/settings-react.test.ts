import { SRSettingTab } from "src/ui/settings/settings-react";

const createRootMock: jest.Mock = jest.fn((_container?: unknown) => ({
    render: jest.fn(),
    unmount: jest.fn(),
}));
const settingsToUIStateMock: jest.Mock = jest.fn(() => ({}));
const mergeUIStateToSettingsMock: jest.Mock = jest.fn();
const confirmModalOpenMock: jest.Mock = jest.fn();
const noticeMock: jest.Mock = jest.fn();

jest.mock("react-dom/client", () => ({
    createRoot: (container: unknown) => createRootMock(container),
}));

jest.mock("src/ui/adapters/settingsAdapter", () => ({
    settingsToUIState: (settings: unknown) => settingsToUIStateMock(settings),
    mergeUIStateToSettings: (previous: unknown, next: unknown) =>
        mergeUIStateToSettingsMock(previous, next),
}));

jest.mock("src/ui/settings/applySettingsUpdate", () => ({
    applySettingsUpdate: (fn: () => void) => fn(),
}));

jest.mock("src/ui/modals/confirm", () => {
    return jest
        .fn()
        .mockImplementation(
            (_plugin: unknown, _message: string, callback: (confirmed: boolean) => void) => ({
                open: () => {
                    confirmModalOpenMock();
                    callback(true);
                },
            }),
        );
});

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
            constructor(message?: string) {
                noticeMock(message);
            }
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
        settingsToUIStateMock.mockClear();
        mergeUIStateToSettingsMock.mockReset();
        confirmModalOpenMock.mockClear();
        noticeMock.mockClear();
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

    it("marks review tabs to reload before requesting a full rebuild for card capture setting changes", async () => {
        const previousSettings = { convertBoldTextToClozes: false };
        const mergedSettings = { convertBoldTextToClozes: true };
        const requestSync = jest.fn(async () => ({ status: "queued" as const }));
        const plugin = {
            data: { settings: previousSettings },
            manifest: { version: "0.0.8" },
            markCardCaptureSettingsChange: jest.fn(),
            savePluginData: jest.fn(async () => undefined),
            updateStatusBarStyles: jest.fn(),
            updateStatusBarVisibility: jest.fn(),
            updateStatusBar: jest.fn(),
            consumePendingCardCaptureRebuildPrompt: jest.fn(() => true),
            requestReviewSessionReloadAfterNextFullSync: jest.fn(),
            clearPendingReviewSessionReloadAfterNextFullSync: jest.fn(),
            requestSync,
        };
        const app = {
            workspace: {
                getLeavesOfType: jest.fn(() => []),
            },
        };
        mergeUIStateToSettingsMock.mockReturnValue(mergedSettings);

        const tab = new SRSettingTab(app as never, plugin as never);
        tab.display();

        const root = createRootMock.mock.results[0]?.value as { render: jest.Mock };
        const renderedElement = root.render.mock.calls[0]?.[0] as {
            props: { onSettingsChange: (settings: unknown) => void };
        };

        renderedElement.props.onSettingsChange({});
        await Promise.resolve();

        expect(plugin.data.settings).toBe(mergedSettings);
        expect(plugin.markCardCaptureSettingsChange).toHaveBeenCalledWith(
            previousSettings,
            mergedSettings,
        );
        expect(confirmModalOpenMock).toHaveBeenCalledTimes(1);
        expect(plugin.requestReviewSessionReloadAfterNextFullSync).toHaveBeenCalledTimes(1);
        expect(requestSync).toHaveBeenCalledWith({ trigger: "manual", mode: "full" });
        expect(
            plugin.requestReviewSessionReloadAfterNextFullSync.mock.invocationCallOrder[0],
        ).toBeLessThan(requestSync.mock.invocationCallOrder[0]);
        expect(plugin.clearPendingReviewSessionReloadAfterNextFullSync).not.toHaveBeenCalled();
        expect(noticeMock).toHaveBeenCalledTimes(1);
    });

    it("wires device management callbacks to plugin actions without remounting the settings panel", async () => {
        const plugin = {
            data: { settings: {} },
            manifest: { version: "0.0.8" },
            getSyroDeviceManagementState: jest.fn(async () => ({
                currentDevice: null,
                devices: [],
                invalidDevices: [],
                hasPendingAction: false,
                readOnlyReason: null,
            })),
            renameCurrentSyroDevice: jest.fn(async () => undefined),
            pullSyroDeviceToCurrent: jest.fn(async () => undefined),
            deleteValidSyroDevice: jest.fn(async () => undefined),
            openPendingSyroRecovery: jest.fn(async () => undefined),
            deleteInvalidSyroDeviceDirectory: jest.fn(async () => undefined),
        };

        const tab = new SRSettingTab({} as never, plugin as never);
        tab.display();

        const root = createRootMock.mock.results[0]?.value as { render: jest.Mock };
        const renderedElement = root.render.mock.calls[0]?.[0] as {
            props: {
                loadSyroDeviceManagement: () => Promise<unknown>;
                onSyroRenameCurrentDevice: (deviceName: string) => Promise<void>;
                onSyroPullToCurrentDevice: (deviceId: string) => Promise<void>;
                onSyroDeleteValidDevice: (deviceId: string) => Promise<void>;
                onSyroDeleteInvalidDevice: (deviceFolderName: string) => Promise<void>;
            };
        };

        await renderedElement.props.loadSyroDeviceManagement();
        await renderedElement.props.onSyroRenameCurrentDevice("Desktop Prime");
        await renderedElement.props.onSyroPullToCurrentDevice("device-2");
        await renderedElement.props.onSyroDeleteValidDevice("device-3");
        await renderedElement.props.onSyroDeleteInvalidDevice("orphan-folder");

        expect(plugin.getSyroDeviceManagementState).toHaveBeenCalledTimes(1);
        expect(plugin.renameCurrentSyroDevice).toHaveBeenCalledWith("Desktop Prime");
        expect(plugin.pullSyroDeviceToCurrent).toHaveBeenCalledWith("device-2");
        expect(plugin.deleteValidSyroDevice).toHaveBeenCalledWith("device-3");
        expect(plugin.deleteInvalidSyroDeviceDirectory).toHaveBeenCalledWith("orphan-folder");
        expect(createRootMock).toHaveBeenCalledTimes(1);
    });
});
