class Plugin {}

class ItemView {
    constructor(leaf) {
        this.leaf = leaf;
        this.app = {
            workspace: {
                on: jest.fn(),
                getActiveFile: jest.fn(),
                detachLeavesOfType: jest.fn(),
                getLeavesOfType: jest.fn(() => []),
                getActiveViewOfType: jest.fn(() => null),
                getLeaf: jest.fn(() => ({ openFile: jest.fn(), view: null })),
                trigger: jest.fn(),
                openPopoutLeaf: jest.fn(() => ({ openFile: jest.fn() })),
            },
            vault: {
                on: jest.fn(),
                trash: jest.fn(),
                read: jest.fn(),
                modify: jest.fn(),
                getAbstractFileByPath: jest.fn(() => null),
            },
            metadataCache: {
                on: jest.fn(),
                off: jest.fn(),
            },
            fileManager: {
                promptForFileRename: jest.fn(),
            },
        };
        this.containerEl = {
            children: [
                null,
                {
                    empty: jest.fn(),
                    addClass: jest.fn(),
                    style: {},
                },
            ],
        };
        this.scope = null;
    }

    registerEvent() {}
}

class WorkspaceLeaf {
    openFile() {}
}

class MenuItem {
    setTitle() {
        return this;
    }

    setIcon() {
        return this;
    }

    onClick() {
        return this;
    }
}

class Menu {
    addItem(callback) {
        callback(new MenuItem());
        return this;
    }

    addSeparator() {
        return this;
    }

    showAtPosition() {}

    showAtMouseEvent() {}
}

class TAbstractFile {}

class TFile extends TAbstractFile {}

class Notice {
    constructor(message) {
        this.message = message;
    }
}

class Scope {
    register() {}
}

class MarkdownView {
    constructor() {
        this.file = null;
        this.leaf = null;
        this.editor = {
            getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
            getValue: jest.fn(() => ""),
            posToOffset: jest.fn(() => 0),
            getScrollInfo: jest.fn(() => ({ top: 0, left: 0, height: 0, clientHeight: 0 })),
            scrollIntoView: jest.fn(),
            setCursor: jest.fn(),
        };
        this.containerEl = { offsetWidth: 0, offsetHeight: 0 };
    }
}

const Dummy = function () {};

module.exports = new Proxy(
    {
        FrontMatterCache: class FrontMatterCache {},
        ItemView,
        MarkdownView,
        Menu,
        Modal: class Modal {},
        Notice,
        Plugin,
        PluginSettingTab: jest.fn().mockImplementation(() => ({})),
        Platform: {
            isMobile: false,
        },
        requestUrl: jest.fn(),
        Scope,
        TAbstractFile,
        TFile,
        WorkspaceLeaf,
        getAllTags: jest.fn(() => []),
        moment: {
            locale: jest.fn(() => "en"),
        },
        setTooltip: jest.fn(),
    },
    {
        get(target, prop) {
            if (prop in target) {
                return target[prop];
            }
            return Dummy;
        },
    },
);
