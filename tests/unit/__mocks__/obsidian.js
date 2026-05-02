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
    constructor() {
        this.submenu = null;
        this.checked = false;
    }

    setTitle() {
        return this;
    }

    setIcon() {
        return this;
    }

    onClick() {
        return this;
    }

    setChecked(checked) {
        this.checked = checked;
        return this;
    }

    setSubmenu() {
        this.submenu = new Menu();
        return this.submenu;
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

class ClassListShim {
    constructor() {
        this.values = new Set();
    }

    add(...classNames) {
        classNames.forEach((className) => this.values.add(className));
    }

    remove(...classNames) {
        classNames.forEach((className) => this.values.delete(className));
    }

    contains(className) {
        return this.values.has(className);
    }

    toString() {
        return Array.from(this.values).join(" ");
    }
}

function createMockElement(tagName = "div") {
    if (typeof document !== "undefined") {
        const element = document.createElement(tagName);
        element.addClass = function addClass(...classNames) {
            this.classList.add(...classNames);
        };
        element.removeClass = function removeClass(...classNames) {
            this.classList.remove(...classNames);
        };
        element.empty = function empty() {
            this.replaceChildren();
        };
        element.createDiv = function createDiv(options = {}) {
            const child = createMockElement("div");
            if (typeof options === "string") {
                child.addClass(options);
            } else if (options?.cls) {
                child.addClass(options.cls);
            }
            if (options?.text) {
                child.textContent = options.text;
            }
            this.appendChild(child);
            return child;
        };
        element.createEl = function createEl(childTagName, options = {}) {
            const child = createMockElement(childTagName);
            if (options?.cls) {
                child.addClass(options.cls);
            }
            if (options?.text) {
                child.textContent = options.text;
            }
            this.appendChild(child);
            return child;
        };
        return element;
    }

    return {
        children: [],
        classList: new ClassListShim(),
        textContent: "",
        innerHTML: "",
        style: {},
        addClass(...classNames) {
            this.classList.add(...classNames);
        },
        removeClass(...classNames) {
            this.classList.remove(...classNames);
        },
        empty() {
            this.children = [];
            this.textContent = "";
            this.innerHTML = "";
        },
        createDiv(options = {}) {
            const child = createMockElement("div");
            if (typeof options === "string") {
                child.addClass(options);
            } else if (options?.cls) {
                child.addClass(options.cls);
            }
            if (options?.text) {
                child.textContent = options.text;
            }
            this.children.push(child);
            return child;
        },
        createEl(tag, options = {}) {
            const child = createMockElement(tag);
            if (options?.cls) {
                child.addClass(options.cls);
            }
            if (options?.text) {
                child.textContent = options.text;
            }
            this.children.push(child);
            return child;
        },
    };
}

class Modal {
    constructor(app) {
        this.app = app;
        this.modalEl = createMockElement("div");
        this.contentEl = createMockElement("div");
        this.isOpen = false;
    }

    open() {
        this.isOpen = true;
        this.onOpen?.();
    }

    close() {
        this.isOpen = false;
        this.onClose?.();
    }
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
        Modal,
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
        debounce: (fn) => fn,
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
