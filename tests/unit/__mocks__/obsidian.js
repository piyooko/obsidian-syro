const { createMockMoment } = require("../helpers/createMockMoment");
const moment = createMockMoment();

if (typeof window !== "undefined") {
    window.moment = moment;
}

class Plugin {}

class Component {
    load() {}

    unload() {}
}

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
                processFrontMatter: jest.fn(async (_file, fn) => {
                    const frontmatter = {};
                    fn(frontmatter);
                }),
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

class TFolder extends TAbstractFile {}

const Notice = jest.fn().mockImplementation(function Notice(message) {
    this.message = message;
});

class Scope {
    register() {}
}

class MarkdownView {
    constructor() {
        this.file = null;
        this.leaf = null;
        this.editor = {
            getCursor: jest.fn(() => ({ line: 0, ch: 0 })),
            getLine: jest.fn(() => ""),
            getValue: jest.fn(() => ""),
            lineCount: jest.fn(() => 1),
            posToOffset: jest.fn(() => 0),
            getScrollInfo: jest.fn(() => ({ top: 0, left: 0, height: 0, clientHeight: 0 })),
            scrollIntoView: jest.fn(),
            setSelection: jest.fn(),
            setCursor: jest.fn(),
        };
        this.containerEl = { offsetWidth: 0, offsetHeight: 0 };
    }
}

const MarkdownRenderer = {
    render: jest.fn(async (_app, content, el) => {
        el.textContent = content;
    }),
};

const Dummy = function () {};

module.exports = new Proxy(
    {
        FrontMatterCache: class FrontMatterCache {},
        Component,
        ItemView,
        MarkdownRenderer,
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
        TFolder,
        WorkspaceLeaf,
        getAllTags: jest.fn(() => []),
        moment,
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
