import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "fs";
import { join } from "path";
import { CardType } from "src/Question";
import { CardFrontBackUtil } from "src/question-type";
import { DEFAULT_PROGRESS_BAR_STYLE, DEFAULT_SETTINGS, SRSettings } from "src/settings";
import type SRPlugin from "src/main";
import { hasCurrentExtractWrapper } from "src/ui/components/ExtractContextEditorView";
import { LinearCard, CardState } from "src/ui/components/LinearCard";

(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("framer-motion", () => {
    const React = require("react");
    const componentCache = new Map<string, React.ComponentType<Record<string, unknown>>>();

    const createMotionComponent = (tag: string) =>
        React.forwardRef(
            ({ children, ...props }: Record<string, unknown>, ref: React.Ref<Element>) => {
                const {
                    animate,
                    custom,
                    exit,
                    initial,
                    layout,
                    mode,
                    onAnimationComplete,
                    transition,
                    variants,
                    whileHover,
                    whileTap,
                    ...domProps
                } = props;
                return React.createElement(tag, { ...domProps, ref }, children);
            },
        );

    const getMotionComponent = (tag: string) => {
        if (!componentCache.has(tag)) {
            componentCache.set(tag, createMotionComponent(tag));
        }
        return componentCache.get(tag);
    };

    return {
        AnimatePresence: ({ children }: { children: React.ReactNode }) =>
            React.createElement(React.Fragment, null, children),
        motion: new Proxy(
            {},
            {
                get: (_target, prop: string) => getMotionComponent(prop),
            },
        ),
    };
});

type PendingRender = {
    content: string;
    resolve: () => void;
};

type RenderMarkdownFn = (content: string, el: HTMLElement) => Promise<void> | void;
type ReviewerClozeSource = "highlight" | "bold" | "anki";

const FORMULA_LABEL = "**\u6838\u5fc3\u516c\u5f0f**:";
const PLAIN_FORMULA_LABEL = "\u6838\u5fc3\u516c\u5f0f:";
const FORMULA_LATEX =
    "$f'(x) = \\\\lim_{\\\\Delta x \\\\to 0} \\\\frac{f(x + \\\\Delta x) - f(x)}{\\\\Delta x}$";

function createManualExtractContext(markdown: string, outerFrom: number, outerTo: number) {
    const openToken = "{{ir::";
    return {
        sourceFrom: 0,
        sourceTo: markdown.length,
        markdown,
        currentOuterFrom: outerFrom,
        currentOuterTo: outerTo,
        currentInnerFrom: outerFrom + openToken.length,
        currentInnerTo: outerTo - 2,
        currentOpenTokenFrom: outerFrom,
        currentOpenTokenTo: outerFrom + openToken.length,
        currentCloseTokenFrom: outerTo - 2,
        currentCloseTokenTo: outerTo,
    };
}

function createAutoExtractContext(markdown: string) {
    return {
        sourceFrom: 0,
        sourceTo: markdown.length,
        markdown,
        currentOuterFrom: 0,
        currentOuterTo: markdown.length,
        currentInnerFrom: 0,
        currentInnerTo: markdown.length,
        currentOpenTokenFrom: 0,
        currentOpenTokenTo: 0,
        currentCloseTokenFrom: markdown.length,
        currentCloseTokenTo: markdown.length,
    };
}

function createMinimalPlugin(): SRPlugin {
    return {
        data: {
            settings: {
                isPro: true,
                showRuntimeDebugMessages: false,
            },
        },
    } as unknown as SRPlugin;
}

test("validates the hidden current extract wrapper before saving", () => {
    const markdown = "before {{ir::target}} after";
    const ranges = {
        currentOuterFrom: 7,
        currentOuterTo: 21,
        currentInnerFrom: 13,
        currentInnerTo: 19,
        currentOpenTokenFrom: 7,
        currentOpenTokenTo: 13,
        currentCloseTokenFrom: 19,
        currentCloseTokenTo: 21,
    };

    expect(hasCurrentExtractWrapper(markdown, ranges)).toBe(true);
    expect(hasCurrentExtractWrapper("before target after", ranges)).toBe(false);
});

test("extract review renders direct actions without show-answer or hard/easy labels", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onAnswer = jest.fn();
    const onSetExtractDate = jest.fn();
    const onDelete = jest.fn();

    act(() => {
        root.render(
            React.createElement(LinearCard, {
                reviewKind: "extract",
                card: {
                    front: "{{ir::text}}",
                    back: "",
                    responseButtonLabels: ["1m", "3d"],
                },
                renderMarkdown: (content: string, el: HTMLElement) => {
                    el.textContent = content;
                },
                onAnswer,
                onSetExtractDate,
                onDelete,
                extractActionLabels: {
                    again: "重来",
                    good: "良好",
                    set: "指定",
                    graduate: "毕业",
                },
            }),
        );
    });

    expect(container.querySelector(".sr-show-answer-btn")).toBeNull();
    expect(container.textContent).toContain("重来");
    expect(container.textContent).toContain("良好");
    expect(container.textContent).toContain("指定");
    expect(container.textContent).toContain("毕业");
    expect(container.textContent).not.toContain("较难");
    expect(container.textContent).not.toContain("简单");

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(".sr-linear-btn"));
    act(() => {
        buttons[0].click();
        buttons[1].click();
        buttons[2].click();
        buttons[3].click();
    });

    expect(onAnswer).toHaveBeenNthCalledWith(1, 0);
    expect(onAnswer).toHaveBeenNthCalledWith(2, 1);
    expect(onSetExtractDate).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
});

test("extract review menu hides card info", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
        root.render(
            React.createElement(LinearCard, {
                reviewKind: "extract",
                card: {
                    front: "{{ir::text}}",
                    back: "",
                },
                renderMarkdown: (content: string, el: HTMLElement) => {
                    el.textContent = content;
                },
                extractActionLabels: {
                    again: "重来",
                    good: "良好",
                    set: "指定",
                    graduate: "毕业",
                },
            }),
        );
    });

    const menuButton = Array.from(
        container.querySelectorAll<HTMLButtonElement>(".sr-header-btn"),
    ).at(-1);
    expect(menuButton).toBeDefined();

    act(() => {
        menuButton?.click();
    });

    expect(container.textContent).not.toContain("Card info");
    expect(container.textContent).not.toContain("卡片信息");
});

test("readonly extract context uses persistent hybrid markdown renderer", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const before = "before **context**\n\n";
    const wrapped = "{{ir::outer {{ir::inner}} text\n\n| A | B |\n| - | - |\n| 1 | **two** |}}";
    const markdown = `${before}${wrapped}\n\nafter`;
    const context = createManualExtractContext(
        markdown,
        before.length,
        before.length + wrapped.length,
    );
    const renderMarkdown = jest.fn(async (content: string, el: HTMLElement) => {
        if (content.includes("| A | B |")) {
            el.innerHTML =
                "<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>1</td><td><strong>two</strong></td></tr></tbody></table>";
            return;
        }
        el.innerHTML = content.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    });

    try {
        act(() => {
            root.render(
                React.createElement(LinearCard, {
                    reviewKind: "extract",
                    card: { front: wrapped, back: "" },
                    extractContext: context,
                    extractContextDraft: { markdown, ranges: context },
                    plugin: createMinimalPlugin(),
                    renderMarkdown,
                }),
            );
        });

        await flushEffects();
        await flushEffects();

        const hybridHost = container.querySelector(".sr-hybrid-markdown-source");
        expect(hybridHost).not.toBeNull();
        expect(hybridHost?.classList.contains("markdown-source-view")).toBe(true);
        expect(hybridHost?.classList.contains("cm-s-obsidian")).toBe(true);
        expect(hybridHost?.classList.contains("mod-cm6")).toBe(true);
        expect(hybridHost?.classList.contains("is-live-preview")).toBe(true);
        expect(hybridHost?.classList.contains("is-readable-line-width")).toBe(false);
        expect(container.querySelector(".cm-editor")).not.toBeNull();
        expect(renderMarkdown).toHaveBeenCalled();
        expect(container.querySelector("table")).not.toBeNull();
        expect(container.querySelector(".cm-strong")?.textContent).toBe("context");
    } finally {
        act(() => root.unmount());
    }
});

test("readonly extract context strips only the current outer IR wrapper", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const before = "before\n\n";
    const wrapped = "{{ir::outer {{ir::inner}} text}}";
    const markdown = `${before}${wrapped}\n\nafter`;
    const context = createManualExtractContext(
        markdown,
        before.length,
        before.length + wrapped.length,
    );
    const renderMarkdown = jest.fn(async (content: string, el: HTMLElement) => {
        el.textContent = content;
    });

    try {
        act(() => {
            root.render(
                React.createElement(LinearCard, {
                    reviewKind: "extract",
                    card: { front: wrapped, back: "" },
                    extractContext: context,
                    extractContextDraft: { markdown, ranges: context },
                    plugin: createMinimalPlugin(),
                    renderMarkdown,
                }),
            );
        });

        await flushEffects();
        await flushEffects();

        const visibleText = container.textContent ?? "";
        expect(visibleText).not.toContain("{{ir::outer");
        expect(visibleText).not.toContain("text}}");
        expect(visibleText).toContain("outer {{ir::inner}} text");
    } finally {
        act(() => root.unmount());
    }
});

test("extract hybrid editor keeps the same CodeMirror node across review and edit mode", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const markdown = "before\n\n{{ir::target}}\n\nafter";
    const context = createManualExtractContext(
        markdown,
        "before\n\n".length,
        "before\n\n{{ir::target}}".length,
    );

    try {
        act(() => {
            root.render(
                React.createElement(LinearCard, {
                    reviewKind: "extract",
                    card: { front: "{{ir::target}}", back: "" },
                    extractContext: context,
                    extractContextDraft: { markdown, ranges: context },
                    plugin: createMinimalPlugin(),
                    renderMarkdown: (content: string, el: HTMLElement) => {
                        el.textContent = content;
                    },
                }),
            );
        });
        await flushEffects();

        const editorBefore = container.querySelector(".cm-editor");
        expect(editorBefore).not.toBeNull();

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
        });
        await flushEffects();

        expect(container.querySelector(".cm-editor")).toBe(editorBefore);
        expect(container.querySelector(".sr-exit-edit-btn")).not.toBeNull();

        const content = container.querySelector<HTMLElement>(".cm-content");
        act(() => {
            content?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "e", altKey: true, bubbles: true }),
            );
        });
        await flushEffects();

        expect(container.querySelector(".cm-editor")).toBe(editorBefore);
        expect(container.querySelector(".sr-exit-edit-btn")).toBeNull();
    } finally {
        act(() => root.unmount());
    }
});

test("extract hybrid table cells edit as rendered table and write back markdown", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const markdown = "| A | B |\n| - | - |\n| 1 | two |";
    const context = createAutoExtractContext(markdown);
    const onUpdateExtractContext = jest.fn();
    const renderMarkdown = jest.fn(async (content: string, el: HTMLElement) => {
        if (content.includes("| A | B |")) {
            el.innerHTML =
                "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>two</td></tr></tbody></table>";
            return;
        }
        el.textContent = content;
    });

    try {
        act(() => {
            root.render(
                React.createElement(LinearCard, {
                    reviewKind: "extract",
                    card: { front: markdown, back: "" },
                    extractContext: context,
                    extractContextDraft: { markdown, ranges: context },
                    onUpdateExtractContext,
                    plugin: createMinimalPlugin(),
                    renderMarkdown,
                }),
            );
        });
        await flushEffects();
        await flushEffects();

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
        });
        await flushEffects();
        await flushEffects();

        const tableWidget = container.querySelector(".cm-embed-block.cm-table-widget");
        const tableWrapper = container.querySelector(".table-wrapper");
        const table = container.querySelector("table.table-editor");
        const cell = Array.from(container.querySelectorAll<HTMLElement>("td")).find(
            (element) => element.textContent === "two",
        );
        expect(tableWidget).not.toBeNull();
        expect(tableWrapper).not.toBeNull();
        expect(table).not.toBeNull();
        expect(cell).not.toBeNull();

        act(() => {
            if (cell) {
                cell.textContent = "changed";
                cell.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
                );
            }
        });
        await flushEffects();

        expect(onUpdateExtractContext).toHaveBeenCalled();
        expect(onUpdateExtractContext.mock.calls.at(-1)?.[0].markdown).toContain("| 1 | changed |");
    } finally {
        act(() => root.unmount());
    }
});

test("extract hybrid edit mode keeps list rendering instead of exposing the whole source block", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const markdown = "1. **绳镖**: first\n2. **火狱瞬移**: second";
    const context = createAutoExtractContext(markdown);
    const renderMarkdown = jest.fn(async (content: string, el: HTMLElement) => {
        el.textContent = content;
    });

    try {
        act(() => {
            root.render(
                React.createElement(LinearCard, {
                    reviewKind: "extract",
                    card: { front: markdown, back: "" },
                    extractContext: context,
                    extractContextDraft: { markdown, ranges: context },
                    plugin: createMinimalPlugin(),
                    renderMarkdown,
                }),
            );
        });
        await flushEffects();
        await flushEffects();

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
        });
        await flushEffects();
        await flushEffects();

        expect(
            container.querySelector('.sr-hybrid-rendered-block[data-sr-hybrid-block-kind="list"]'),
        ).toBeNull();
        expect(container.querySelector(".HyperMD-list-line")).not.toBeNull();
        expect(container.querySelector(".cm-formatting-list-ol")).not.toBeNull();
        expect(container.querySelector(".cm-strong")?.textContent).toBe("绳镖");
        expect(container.textContent).not.toContain("**绳镖**");
        expect(container.querySelector(".sr-exit-edit-btn")).not.toBeNull();
    } finally {
        act(() => root.unmount());
    }
});

test("extract hybrid table blur keeps edit mode and waits for an explicit commit", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const markdown = "| A | B |\n| - | - |\n| 1 | two |";
    const context = createAutoExtractContext(markdown);
    const onUpdateExtractContext = jest.fn();
    const renderMarkdown = jest.fn(async (content: string, el: HTMLElement) => {
        if (content.includes("| A | B |")) {
            el.innerHTML =
                "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>two</td></tr></tbody></table>";
            return;
        }
        el.textContent = content;
    });

    try {
        act(() => {
            root.render(
                React.createElement(LinearCard, {
                    reviewKind: "extract",
                    card: { front: markdown, back: "" },
                    extractContext: context,
                    extractContextDraft: { markdown, ranges: context },
                    onUpdateExtractContext,
                    plugin: createMinimalPlugin(),
                    renderMarkdown,
                }),
            );
        });
        await flushEffects();
        await flushEffects();

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
        });
        await flushEffects();
        await flushEffects();

        const cell = Array.from(container.querySelectorAll<HTMLElement>("td")).find(
            (element) => element.textContent === "two",
        );
        expect(cell).not.toBeNull();

        act(() => {
            if (cell) {
                cell.textContent = "changed";
                cell.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
            }
        });
        await flushEffects();

        expect(onUpdateExtractContext).not.toHaveBeenCalled();
        expect(container.querySelector(".sr-exit-edit-btn")).not.toBeNull();
        expect(container.querySelector("table.table-editor")).not.toBeNull();

        act(() => {
            cell?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        });
        await flushEffects();

        expect(onUpdateExtractContext).toHaveBeenCalled();
        expect(onUpdateExtractContext.mock.calls.at(-1)?.[0].markdown).toContain("| 1 | changed |");
    } finally {
        act(() => root.unmount());
    }
});

test("extract hybrid table draft flushes when exiting edit mode with Alt+E", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const markdown = "| A | B |\n| - | - |\n| 1 | two |";
    const context = createAutoExtractContext(markdown);
    const onUpdateExtractContext = jest.fn();
    const renderMarkdown = jest.fn(async (content: string, el: HTMLElement) => {
        if (content.includes("| A | B |")) {
            el.innerHTML =
                "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>two</td></tr></tbody></table>";
            return;
        }
        el.textContent = content;
    });

    try {
        act(() => {
            root.render(
                React.createElement(LinearCard, {
                    reviewKind: "extract",
                    card: { front: markdown, back: "" },
                    extractContext: context,
                    extractContextDraft: { markdown, ranges: context },
                    onUpdateExtractContext,
                    plugin: createMinimalPlugin(),
                    renderMarkdown,
                }),
            );
        });
        await flushEffects();
        await flushEffects();

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
        });
        await flushEffects();
        await flushEffects();

        const cell = Array.from(container.querySelectorAll<HTMLElement>("td")).find(
            (element) => element.textContent === "two",
        );
        const editor = container.querySelector<HTMLElement>(".cm-content");
        expect(cell).not.toBeNull();
        expect(editor).not.toBeNull();

        act(() => {
            if (cell) {
                cell.textContent = "changed";
                cell.dispatchEvent(new InputEvent("input", { bubbles: true }));
            }
            editor?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "e", altKey: true, bubbles: true }),
            );
        });
        await flushEffects();

        expect(onUpdateExtractContext).toHaveBeenCalled();
        expect(onUpdateExtractContext.mock.calls.at(-1)?.[0].markdown).toContain("| 1 | changed |");
        expect(container.querySelector(".sr-exit-edit-btn")).toBeNull();
    } finally {
        act(() => root.unmount());
    }
});

test("extract card content updates do not reset the active edit session", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const firstMarkdown = "before\n\nactive extract";
    const nextMarkdown = "before\n\nactive extract edited";
    const firstContext = createAutoExtractContext(firstMarkdown);
    const nextContext = createAutoExtractContext(nextMarkdown);
    const renderMarkdown = jest.fn(async (content: string, el: HTMLElement) => {
        el.textContent = content;
    });

    try {
        act(() => {
            root.render(
                React.createElement(LinearCard, {
                    reviewKind: "extract",
                    uiResetToken: 1,
                    card: { front: firstMarkdown, back: "" },
                    extractContext: firstContext,
                    extractContextDraft: { markdown: firstMarkdown, ranges: firstContext },
                    plugin: createMinimalPlugin(),
                    renderMarkdown,
                }),
            );
        });
        await flushEffects();

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
        });
        await flushEffects();
        expect(container.querySelector(".sr-exit-edit-btn")).not.toBeNull();

        act(() => {
            root.render(
                React.createElement(LinearCard, {
                    reviewKind: "extract",
                    uiResetToken: 1,
                    card: { front: nextMarkdown, back: "" },
                    extractContext: nextContext,
                    extractContextDraft: { markdown: nextMarkdown, ranges: nextContext },
                    plugin: createMinimalPlugin(),
                    renderMarkdown,
                }),
            );
        });
        await flushEffects();

        expect(container.querySelector(".sr-exit-edit-btn")).not.toBeNull();
        expect(container.querySelector(".cm-editor")).not.toBeNull();
    } finally {
        act(() => root.unmount());
    }
});

test("Alt+E toggles edit mode and Escape does not exit edit mode", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
        root.render(
            React.createElement(LinearCard, {
                card: {
                    front: "front",
                    back: "back",
                },
                renderMarkdown: (content: string, el: HTMLElement) => {
                    el.textContent = content;
                },
                type: "basic",
            }),
        );
    });

    expect(container.querySelector(".sr-exit-edit-btn")).toBeNull();

    act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
    });

    expect(container.querySelector(".sr-exit-edit-btn")).not.toBeNull();

    act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(container.querySelector(".sr-exit-edit-btn")).not.toBeNull();

    act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
    });

    expect(container.querySelector(".sr-exit-edit-btn")).toBeNull();
});

test("Alt+E exits edit mode once from CodeMirror", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
        act(() => {
            root.render(
                React.createElement(LinearCard, {
                    card: {
                        front: "front",
                        back: "back",
                    },
                    plugin: createMinimalPlugin(),
                    rawContent: "front",
                    renderMarkdown: (content: string, el: HTMLElement) => {
                        el.textContent = content;
                    },
                    type: "basic",
                }),
            );
        });

        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", altKey: true }));
        });
        await flushEffects();

        const editor = container.querySelector<HTMLElement>(".cm-content");
        expect(editor).not.toBeNull();

        act(() => {
            editor?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "e", altKey: true, bubbles: true }),
            );
        });
        await flushEffects();

        expect(container.querySelector(".sr-exit-edit-btn")).toBeNull();
        expect(container.textContent).toContain("Exited edit mode");
        expect(container.textContent).not.toContain("Entered edit mode");
        expect(container.textContent).not.toContain("Esc to exit");
    } finally {
        act(() => root.unmount());
    }
});

test("editing mode does not add a left border indicator", () => {
    const css = readFileSync(join(process.cwd(), "src/ui/styles/linear-card.css"), "utf8");

    expect(css).not.toMatch(/\.sr-card-content-area\.sr-is-editing\s*\{[^}]*border-left/s);
});

test("hybrid editor content uses the same padding variables as review content", () => {
    const css = readFileSync(join(process.cwd(), "src/ui/styles/linear-card.css"), "utf8");

    expect(css).toMatch(
        /\.sr-hybrid-markdown-source\.markdown-source-view\.mod-cm6\s+\.cm-content\s*\{[^}]*max-width:\s*none\s*!important;[^}]*width:\s*100%\s*!important;[^}]*box-sizing:\s*border-box;[^}]*padding:\s*var\(--syro-desktop-review-content-padding-y,\s*24px\)\s+var\(--syro-desktop-review-content-padding-x,\s*40px\)\s*!important/s,
    );
});

test("hybrid rendered blocks keep preview classes without preview layout padding", () => {
    const css = readFileSync(join(process.cwd(), "src/ui/styles/linear-card.css"), "utf8");

    expect(css).toMatch(
        /\.sr-hybrid-rendered-block\.markdown-preview-view\s*\{[^}]*max-width:\s*none\s*!important;[^}]*margin:\s*0\s*!important;[^}]*padding:\s*0\s*!important/s,
    );
});

test("hybrid editor initializes detached before appending to avoid first paint jump", () => {
    const source = readFileSync(
        join(process.cwd(), "src/ui/components/ExtractHybridMarkdownEditorView.tsx"),
        "utf8",
    );

    expect(source).not.toMatch(/new EditorView\s*\(\s*\{[^}]*parent:\s*container/s);
    expect(source).toMatch(/view\.dispatch\s*\(\s*\{[^}]*setExtractContextRangesEffect\.of\(ranges\)[^}]*setHybridModeEffect\.of\(mode\)/s);
    expect(source).toMatch(/container\.appendChild\(view\.dom\)/);
});

function createDeferredRenderMarkdown() {
    const pending: PendingRender[] = [];
    const renderMarkdown = jest.fn((content: string, el: HTMLElement) => {
        return new Promise<void>((resolve) => {
            pending.push({
                content,
                resolve: () => {
                    if (content.includes("\\color{#60a5fa}")) {
                        el.innerHTML = '<span data-rendered="answer">rendered-answer</span>';
                    } else if (content.includes("\\color{#3b82f6}")) {
                        el.innerHTML = '<span data-rendered="masked">rendered-mask</span>';
                    } else {
                        el.textContent = content;
                    }
                    resolve();
                },
            });
        });
    });

    return { pending, renderMarkdown };
}

function getPendingRender(pending: PendingRender[], colorToken: string): PendingRender {
    const renders = pending.filter((entry) => entry.content.includes(colorToken));
    const render = renders[renders.length - 1];
    if (!render) {
        throw new Error(`Missing pending render for ${colorToken}`);
    }
    return render;
}

function getActiveFace(container: HTMLElement): HTMLElement | null {
    return container.querySelector<HTMLElement>('[data-sr-active="true"]');
}

function mountLinearCard(renderMarkdown: RenderMarkdownFn) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const card: CardState = {
        front: "$\\frac{{{c1::1}}}{2}$",
        back: "$\\frac{{{c1::1}}}{2}$",
        review: "$\\frac{{\u82a6\u82a6SR_C:%5B...%5D:1\u7984\u7984}}{2}$",
    };

    act(() => {
        root.render(
            React.createElement(LinearCard, {
                autoAdvanceSeconds: 0,
                card,
                renderMarkdown,
                type: "cloze",
            }),
        );
    });

    return {
        container,
        root,
    };
}

function mountCard(
    card: CardState,
    renderMarkdown: RenderMarkdownFn,
    type: "basic" | "cloze" = "cloze",
) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
        root.render(
            React.createElement(LinearCard, {
                autoAdvanceSeconds: 0,
                card,
                renderMarkdown,
                type,
            }),
        );
    });

    return {
        container,
        root,
    };
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\u82a6/g, "&laquo;")
        .replace(/\u7984/g, "&raquo;");
}

function createCodeBlockRenderMarkdown() {
    return jest.fn(async (content: string, el: HTMLElement) => {
        const fencedMatch = content.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
        if (!fencedMatch) {
            el.textContent = content;
            return;
        }

        el.innerHTML = `<pre><code>${escapeHtml(fencedMatch[1])}</code></pre>`;
    });
}

function replaceTextNode(parent: Node, target: Text, fragments: Node[]) {
    fragments.forEach((fragment) => parent.insertBefore(fragment, target));
    parent.removeChild(target);
}

function splitMarkerTextIntoNodes(text: string): Node[] {
    const prefix = text.slice(0, 5);
    const suffix = text.slice(5);
    const nodes: Node[] = [document.createTextNode(prefix)];

    if (suffix.length > 0) {
        const wrapper = document.createElement("span");
        wrapper.textContent = suffix;
        nodes.push(wrapper);
    }

    return nodes;
}

function applyReviewerMarkdownFormatting(root: HTMLElement) {
    const markerOpen = "\u00ab\u00abSR_";
    const markerClose = "\u00bb\u00bb";
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const replacements: Array<{ node: Text; fragments: Node[] }> = [];
    let node: Text | null;

    while ((node = walker.nextNode() as Text | null)) {
        const text = node.textContent ?? "";
        if (!text.includes("**") && !text.includes(markerOpen)) {
            continue;
        }

        const fragments: Node[] = [];
        let cursor = 0;

        while (cursor < text.length) {
            const boldMatch = /\*\*([^*]+)\*\*/.exec(text.slice(cursor));
            const boldIndex = boldMatch ? cursor + (boldMatch.index ?? 0) : -1;
            const markerIndex = text.indexOf(markerOpen, cursor);
            let nextIndex = -1;
            let nextType: "bold" | "marker" | null = null;

            if (boldIndex !== -1 && (markerIndex === -1 || boldIndex <= markerIndex)) {
                nextIndex = boldIndex;
                nextType = "bold";
            } else if (markerIndex !== -1) {
                nextIndex = markerIndex;
                nextType = "marker";
            }

            if (nextIndex === -1 || nextType === null) {
                fragments.push(document.createTextNode(text.slice(cursor)));
                break;
            }

            if (nextIndex > cursor) {
                fragments.push(document.createTextNode(text.slice(cursor, nextIndex)));
            }

            if (nextType === "bold" && boldMatch) {
                const strong = document.createElement("strong");
                strong.textContent = boldMatch[1];
                fragments.push(strong);
                cursor = nextIndex + boldMatch[0].length;
                continue;
            }

            const markerEnd = text.indexOf(markerClose, nextIndex);
            const markerText =
                markerEnd === -1 ? text.slice(nextIndex) : text.slice(nextIndex, markerEnd + 2);
            fragments.push(...splitMarkerTextIntoNodes(markerText));
            cursor = nextIndex + markerText.length;
        }

        if (fragments.length > 0) {
            replacements.push({ node, fragments });
        }
    }

    replacements.forEach(({ node: textNode, fragments }) => {
        if (textNode.parentNode) {
            replaceTextNode(textNode.parentNode, textNode, fragments);
        }
    });
}

function createSplitMarkerFormulaRenderMarkdown() {
    return jest.fn(async (content: string, el: HTMLElement) => {
        const trimmed = content.trim();
        if (
            (/^\$[\s\S]*\$$/.test(trimmed) || /^\$\$[\s\S]*\$\$$/.test(trimmed)) &&
            !trimmed.includes("\u00ab\u00abSR_")
        ) {
            el.innerHTML = '<span class="math-rendered">rendered-formula</span>';
            return;
        }

        const buffer = document.createElement("div");
        buffer.innerHTML = content;
        applyReviewerMarkdownFormatting(buffer);
        el.replaceChildren(...Array.from(buffer.childNodes));
    });
}

function createCrossBoundaryMarkdownRender() {
    return jest.fn(async (content: string, el: HTMLElement) => {
        const buffer = document.createElement("div");
        buffer.textContent = content;
        applyReviewerMarkdownFormatting(buffer);
        el.replaceChildren(...Array.from(buffer.childNodes));
    });
}

function createStaticClozeRenderMarkdown() {
    return jest.fn(async (_content: string, el: HTMLElement) => {
        el.innerHTML = `
            <div class="sr-test-cloze-layout">
                <p>Intro</p>
                <p>
                    <span class="sr-cloze-wrapper">
                        <span class="sr-cloze-placeholder">[...]</span>
                        <span class="sr-cloze-answer">answer</span>
                    </span>
                </p>
                <p>Outro</p>
            </div>
        `;
    });
}

async function flushAnimationFrame() {
    await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
}

function installScrollableClozeGeometry(
    container: HTMLElement,
    options: {
        scrollTop?: number;
        scrollHeight?: number;
        clientHeight?: number;
        scrollContainerTop?: number;
        safeTopInset?: number;
        safeBottomInset?: number;
        placeholderTop?: number;
        answerTop?: number;
        targetHeight?: number;
    } = {},
) {
    const scrollContainer = container.querySelector<HTMLElement>(".sr-card-content-scroll");
    const placeholder = container.querySelector<HTMLElement>(".sr-cloze-placeholder");
    const answer = container.querySelector<HTMLElement>(".sr-cloze-answer");

    if (!scrollContainer || !placeholder || !answer) {
        throw new Error("Missing cloze scroll test elements");
    }

    let scrollHeight = options.scrollHeight ?? 2000;
    const clientHeight = options.clientHeight ?? 400;
    const scrollContainerTop = options.scrollContainerTop ?? 100;
    const safeTopInset = options.safeTopInset ?? 50;
    const safeBottomInset = options.safeBottomInset ?? 50;
    let placeholderTop = options.placeholderTop ?? 830;
    let answerTop = options.answerTop ?? placeholderTop;
    const targetHeight = options.targetHeight ?? 40;

    scrollContainer.scrollTop = options.scrollTop ?? 500;
    scrollContainer.style.scrollPaddingTop = `${safeTopInset}px`;
    scrollContainer.style.scrollPaddingBottom = `${safeBottomInset}px`;

    Object.defineProperty(scrollContainer, "scrollHeight", {
        configurable: true,
        get: () => scrollHeight,
    });
    Object.defineProperty(scrollContainer, "clientHeight", {
        configurable: true,
        get: () => clientHeight,
    });

    scrollContainer.getBoundingClientRect = jest.fn(() => ({
        top: scrollContainerTop,
        left: 0,
        right: 320,
        bottom: scrollContainerTop + clientHeight,
        width: 320,
        height: clientHeight,
        x: 0,
        y: scrollContainerTop,
        toJSON: () => undefined,
    }));

    const assignTargetRect = (element: HTMLElement, getAbsoluteTop: () => number) => {
        element.getBoundingClientRect = jest.fn(() => {
            const top = scrollContainerTop + (getAbsoluteTop() - scrollContainer.scrollTop);
            return {
                top,
                left: 0,
                right: 240,
                bottom: top + targetHeight,
                width: 240,
                height: targetHeight,
                x: 0,
                y: top,
                toJSON: () => undefined,
            };
        });
    };

    assignTargetRect(placeholder, () => placeholderTop);
    assignTargetRect(answer, () => answerTop);

    return {
        scrollContainer,
        setPlaceholderTop(nextTop: number) {
            placeholderTop = nextTop;
        },
        setAnswerTop(nextTop: number) {
            answerTop = nextTop;
        },
        setScrollHeight(nextHeight: number) {
            scrollHeight = nextHeight;
        },
    };
}

function installMockResizeObserver() {
    const originalResizeObserver = globalThis.ResizeObserver;

    class MockResizeObserver {
        static instances: MockResizeObserver[] = [];
        private readonly callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
            this.callback = callback;
            MockResizeObserver.instances.push(this);
        }

        observe() {}

        unobserve() {}

        disconnect() {}

        trigger() {
            this.callback([], this as unknown as ResizeObserver);
        }
    }

    Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: MockResizeObserver,
    });

    return {
        MockResizeObserver,
        restore() {
            if (originalResizeObserver) {
                Object.defineProperty(globalThis, "ResizeObserver", {
                    configurable: true,
                    value: originalResizeObserver,
                });
                return;
            }

            delete (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver })
                .ResizeObserver;
        },
    };
}

function installHeaderLayoutGeometry(
    container: HTMLElement,
    availableWidth: number,
    widths: {
        expandedRegular: number;
        truncatedRegular: number;
        inlineRegular: number;
        inlineCompact: number;
    },
) {
    const liveHeader = container.querySelector<HTMLElement>(
        ".sr-card-header:not(.sr-card-header-measure)",
    );
    if (!liveHeader) {
        throw new Error("Missing live header");
    }

    liveHeader.getBoundingClientRect = jest.fn(() => ({
        top: 0,
        left: 0,
        right: availableWidth,
        bottom: 40,
        width: availableWidth,
        height: 40,
        x: 0,
        y: 0,
        toJSON: () => undefined,
    }));

    const widthByMeasure = new Map<string, number>([
        ["header-expanded-regular", widths.expandedRegular],
        ["header-truncated-regular", widths.truncatedRegular],
        ["inline-regular", widths.inlineRegular],
        ["inline-compact", widths.inlineCompact],
    ]);

    const measures = Array.from(
        container.querySelectorAll<HTMLElement>(".sr-card-header.sr-card-header-measure"),
    );
    measures.forEach((element) => {
        const key = element.dataset.srLayoutMeasure ?? "";
        const width = widthByMeasure.get(key) ?? availableWidth;
        element.getBoundingClientRect = jest.fn(() => ({
            top: 0,
            left: 0,
            right: width,
            bottom: 40,
            width,
            height: 40,
            x: 0,
            y: 0,
            toJSON: () => undefined,
        }));
    });

    return liveHeader;
}

function createReviewerSettings(source: ReviewerClozeSource): {
    questionType: CardType;
    settings: SRSettings;
    sourceText: string;
} {
    switch (source) {
        case "bold":
            return {
                questionType: CardType.Cloze,
                settings: {
                    ...DEFAULT_SETTINGS,
                    convertHighlightsToClozes: false,
                    convertBoldTextToClozes: true,
                    clozePatterns: ["**[123;;]answer[;;hint]**"],
                },
                sourceText: `${PLAIN_FORMULA_LABEL} **${FORMULA_LATEX}**`,
            };
        case "anki":
            return {
                questionType: CardType.AnkiCloze,
                settings: {
                    ...DEFAULT_SETTINGS,
                    convertAnkiClozesToClozes: true,
                },
                sourceText: `${FORMULA_LABEL} {{c1::${FORMULA_LATEX}}}`,
            };
        case "highlight":
        default:
            return {
                questionType: CardType.Cloze,
                settings: {
                    ...DEFAULT_SETTINGS,
                    convertHighlightsToClozes: true,
                    clozePatterns: ["==[123;;]answer[;;hint]=="],
                },
                sourceText: `${FORMULA_LABEL} ==${FORMULA_LATEX}==`,
            };
    }
}

function buildReviewerCard(source: ReviewerClozeSource): CardState {
    const { questionType, settings, sourceText } = createReviewerSettings(source);
    const [card] = CardFrontBackUtil.expand(questionType, sourceText, settings);
    if (!card) {
        throw new Error(`Failed to build reviewer card for ${source}`);
    }

    return {
        front: card.front,
        back: card.back,
        review: card.review,
    };
}

async function flushEffects() {
    await act(async () => {
        await Promise.resolve();
    });
}

async function resolvePendingRender(render: PendingRender) {
    await act(async () => {
        render.resolve();
        await Promise.resolve();
    });
}

describe("LinearCard math cloze rendering", () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;

    beforeAll(() => {
        window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
            window.setTimeout(
                () => cb(performance.now()),
                0,
            )) as typeof window.requestAnimationFrame;
        window.cancelAnimationFrame = ((id: number) => {
            window.clearTimeout(id);
        }) as typeof window.cancelAnimationFrame;
    });

    afterAll(() => {
        window.requestAnimationFrame = originalRequestAnimationFrame;
        window.cancelAnimationFrame = originalCancelAnimationFrame;
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("keeps auto-flip working when the progress bar is hidden", async () => {
        jest.useFakeTimers();

        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const onShowAnswer = jest.fn();

        act(() => {
            root.render(
                React.createElement(LinearCard, {
                    autoAdvanceSeconds: 1,
                    showProgressBar: false,
                    card: {
                        front: "Question",
                        back: "Answer",
                    },
                    onShowAnswer,
                    type: "basic",
                }),
            );
        });

        try {
            expect(container.querySelector(".sr-timer-bar")).toBeNull();
            expect(container.querySelector(".sr-show-answer-btn")).not.toBeNull();

            await act(async () => {
                jest.advanceTimersByTime(1000);
                await Promise.resolve();
            });

            expect(onShowAnswer).toHaveBeenCalledTimes(1);
            expect(container.querySelector(".sr-show-answer-btn")).toBeNull();
            expect(container.querySelector(".sr-rating-buttons")).not.toBeNull();
        } finally {
            act(() => root.unmount());
            jest.useRealTimers();
        }
    });

    test("applies progress bar style props to the visible timer bar", () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(
                React.createElement(LinearCard, {
                    autoAdvanceSeconds: 10,
                    showProgressBar: true,
                    progressBarStyle: {
                        ...DEFAULT_PROGRESS_BAR_STYLE,
                        color: "#112233",
                        warningColor: "#445566",
                        height: 7,
                        rightToLeft: true,
                    },
                    card: {
                        front: "Question",
                        back: "Answer",
                    },
                    type: "basic",
                }),
            );
        });

        try {
            const containerEl = container.querySelector<HTMLElement>(".sr-timer-bar-container");
            const timerBar = container.querySelector<HTMLElement>(".sr-timer-bar");

            expect(containerEl).not.toBeNull();
            expect(containerEl?.style.height).toBe("7px");
            expect(timerBar).not.toBeNull();
            expect(timerBar?.style.backgroundColor).toBe("rgb(17, 34, 51)");
            expect(timerBar?.style.right).toBe("0px");
            expect(timerBar?.style.transformOrigin).toBe("right center");
            expect(timerBar?.style.getPropertyValue("--sr-progress-bar-color")).toBe("#112233");
            expect(timerBar?.style.getPropertyValue("--sr-progress-bar-warning-color")).toBe(
                "#445566",
            );
        } finally {
            act(() => root.unmount());
        }
    });

    test("does not expose intermediate LaTeX source while face renders are pending", async () => {
        const { pending, renderMarkdown } = createDeferredRenderMarkdown();
        const { container, root } = mountLinearCard(renderMarkdown);

        await flushEffects();

        expect(renderMarkdown.mock.calls.length).toBeGreaterThanOrEqual(2);

        const activeFace = getActiveFace(container);
        const activeText = activeFace?.textContent ?? "";
        expect(activeFace?.getAttribute("data-sr-face")).toBe("front");
        expect(activeText).not.toContain("$\\frac{{\\color{#3b82f6}1}}{2}$");
        expect(activeText).not.toContain("SR_");
        expect(activeText).not.toContain("<<");
        expect(activeText).toBe("");

        act(() => root.unmount());
    });

    test("flip uses the pre-rendered back face without showing math source or starting a new render", async () => {
        const { pending, renderMarkdown } = createDeferredRenderMarkdown();
        const { container, root } = mountLinearCard(renderMarkdown);

        await flushEffects();

        expect(renderMarkdown.mock.calls.length).toBeGreaterThanOrEqual(2);

        const frontRender = getPendingRender(pending, "\\color{#3b82f6}");
        const backRender = getPendingRender(pending, "\\color{#60a5fa}");

        await resolvePendingRender(frontRender);

        let activeFace = getActiveFace(container);
        expect(activeFace?.getAttribute("data-sr-face")).toBe("front");
        expect(activeFace?.textContent).toContain("rendered-mask");

        const showAnswerButton = container.querySelector<HTMLButtonElement>(".sr-show-answer-btn");
        expect(showAnswerButton).not.toBeNull();
        const renderCallsBeforeFlip = renderMarkdown.mock.calls.length;

        act(() => {
            showAnswerButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        activeFace = getActiveFace(container);
        const activeText = activeFace?.textContent ?? "";
        expect(renderMarkdown.mock.calls.length).toBe(renderCallsBeforeFlip);
        expect(activeFace?.getAttribute("data-sr-face")).toBe("back");
        expect(activeText).not.toContain("$\\frac{{\\color{#60a5fa}1}}{2}$");
        expect(activeText).not.toContain("SR_");
        expect(activeText).not.toContain("<<");
        expect(activeText).toBe("");

        await resolvePendingRender(backRender);

        activeFace = getActiveFace(container);
        expect(activeFace?.getAttribute("data-sr-face")).toBe("back");
        expect(activeFace?.textContent).toContain("rendered-answer");

        act(() => root.unmount());
    });

    test("decodes leaked SR_C markers inside code blocks before display", async () => {
        const payload = `${encodeURIComponent("[...]")}:${encodeURIComponent("return")}`;
        const renderMarkdown = createCodeBlockRenderMarkdown();
        const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});

        try {
            const { container, root } = mountCard(
                {
                    front: `\`\`\`js\nconst answer = \u82a6\u82a6SR_C:${payload}\u7984\u7984;\n\`\`\``,
                    back: `\`\`\`js\nconst answer = \u82a6\u82a6SR_C:${payload}\u7984\u7984;\n\`\`\``,
                },
                renderMarkdown,
                "basic",
            );

            await flushEffects();

            const codeBlock = container.querySelector<HTMLElement>(".sr-code-block-card");
            expect(codeBlock).not.toBeNull();
            expect(codeBlock?.textContent).toContain("[...]");
            expect(codeBlock?.textContent).toContain("return");
            expect(codeBlock?.textContent).not.toContain("SR_C:");
            expect(codeBlock?.querySelector(".sr-cloze-placeholder")?.textContent).toBe("[...]");
            expect(codeBlock?.querySelector(".sr-cloze-answer")?.textContent).toBe("return");

            act(() => root.unmount());
        } finally {
            debugSpy.mockRestore();
        }
    });

    test("sizes the code line-number gutter for five-digit rows and keeps ellipsis rows blank", async () => {
        const encodedAnswer = encodeURIComponent("return 42;");
        const renderMarkdown = createCodeBlockRenderMarkdown();
        const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});

        try {
            const { container, root } = mountCard(
                {
                    front:
                        "<!--SR_CODE_CLOZE:3:10000-->\n" +
                        "```ts\n" +
                        "// ...\n" +
                        "const alpha = 1;\n" +
                        `const beta = \u82a6\u82a6SR_CLOZE:${encodedAnswer}\u7984\u7984;\n` +
                        "```",
                    back:
                        "<!--SR_CODE_CLOZE:3:10000-->\n" +
                        "```ts\n" +
                        "// ...\n" +
                        "const alpha = 1;\n" +
                        `const beta = \u82a6\u82a6SR_CLOZE:${encodedAnswer}\u7984\u7984;\n` +
                        "```",
                },
                renderMarkdown,
                "basic",
            );

            await flushEffects();

            const codeBlock = container.querySelector<HTMLElement>(".sr-code-block-card");
            const lineNumbers = Array.from(
                container.querySelectorAll<HTMLElement>(".sr-code-line-number"),
            ).map((node) => node.textContent ?? "");

            expect(codeBlock).not.toBeNull();
            expect(lineNumbers).toEqual(["", "10000", "10001"]);
            expect(codeBlock?.style.getPropertyValue("--sr-code-line-number-digits")).toBe("5");
            expect(
                codeBlock?.querySelector(".sr-code-ellipsis .sr-code-line-number")?.textContent,
            ).toBe("");

            act(() => root.unmount());
        } finally {
            debugSpy.mockRestore();
        }
    });

    test("recenters standard cloze placeholders and answers whenever scrolling room exists", async () => {
        const resizeObserver = installMockResizeObserver();
        const renderMarkdown = createStaticClozeRenderMarkdown();
        const { container, root } = mountCard(
            {
                front: "placeholder",
                back: "answer",
                review: "review",
            },
            renderMarkdown,
            "cloze",
        );

        try {
            await flushEffects();
            const geometry = installScrollableClozeGeometry(container, {
                scrollTop: 500,
                scrollHeight: 2000,
                placeholderTop: 830,
                answerTop: 830,
            });

            act(() => {
                resizeObserver.MockResizeObserver.instances.forEach((observer) =>
                    observer.trigger(),
                );
            });
            await flushAnimationFrame();

            expect(geometry.scrollContainer.scrollTop).toBe(650);

            geometry.scrollContainer.scrollTop = 200;

            const showAnswerButton =
                container.querySelector<HTMLButtonElement>(".sr-show-answer-btn");
            expect(showAnswerButton).not.toBeNull();

            act(() => {
                showAnswerButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            await flushEffects();
            await flushAnimationFrame();

            expect(geometry.scrollContainer.scrollTop).toBe(200);
        } finally {
            act(() => root.unmount());
            resizeObserver.restore();
        }
    });

    test("switches footer actions immediately when revealing the answer", async () => {
        const renderMarkdown = createStaticClozeRenderMarkdown();
        const { container, root } = mountCard(
            {
                front: "placeholder",
                back: "answer",
                review: "review",
            },
            renderMarkdown,
            "cloze",
        );

        try {
            await flushEffects();

            const footer = container.querySelector<HTMLElement>(".sr-card-footer");
            const showAnswerButton =
                footer?.querySelector<HTMLButtonElement>(".sr-show-answer-btn");
            expect(showAnswerButton).not.toBeNull();
            expect(footer?.querySelector(".sr-rating-buttons")).toBeNull();

            act(() => {
                showAnswerButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(footer?.querySelector(".sr-show-answer-btn")).toBeNull();
            expect(footer?.querySelector(".sr-rating-buttons")).not.toBeNull();
        } finally {
            act(() => root.unmount());
        }
    });

    test("repositions standard cloze after resize-driven layout changes and clamps at content edges", async () => {
        const resizeObserver = installMockResizeObserver();
        const renderMarkdown = createStaticClozeRenderMarkdown();
        const { container, root } = mountCard(
            {
                front: "placeholder",
                back: "answer",
                review: "review",
            },
            renderMarkdown,
            "cloze",
        );

        try {
            await flushEffects();
            const geometry = installScrollableClozeGeometry(container, {
                scrollTop: 500,
                scrollHeight: 1200,
                placeholderTop: 830,
                answerTop: 830,
            });

            act(() => {
                resizeObserver.MockResizeObserver.instances.forEach((observer) =>
                    observer.trigger(),
                );
            });
            await flushAnimationFrame();

            expect(geometry.scrollContainer.scrollTop).toBe(650);

            geometry.scrollContainer.scrollTop = 500;
            geometry.setPlaceholderTop(1090);
            geometry.setAnswerTop(1090);
            geometry.setScrollHeight(1200);

            act(() => {
                resizeObserver.MockResizeObserver.instances.forEach((observer) =>
                    observer.trigger(),
                );
            });

            await flushAnimationFrame();

            expect(geometry.scrollContainer.scrollTop).toBe(800);
        } finally {
            act(() => root.unmount());
            resizeObserver.restore();
        }
    });

    test("card reset shows the front-side footer and hides back-side content on the next card frame", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const renderMarkdown = jest.fn();
        const firstCard: CardState = {
            front: "First question",
            back: "First answer",
        };
        const secondCard: CardState = {
            front: "Second question",
            back: "Second answer",
        };

        try {
            act(() => {
                root.render(
                    React.createElement(LinearCard, {
                        autoAdvanceSeconds: 0,
                        card: firstCard,
                        renderMarkdown,
                        type: "basic",
                        uiResetToken: 1,
                    }),
                );
            });

            const showAnswerButton =
                container.querySelector<HTMLButtonElement>(".sr-show-answer-btn");
            expect(showAnswerButton).not.toBeNull();

            act(() => {
                showAnswerButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(container.querySelector(".sr-rating-buttons")).not.toBeNull();
            expect(container.querySelector(".sr-answer-section")).not.toBeNull();

            act(() => {
                root.render(
                    React.createElement(LinearCard, {
                        autoAdvanceSeconds: 0,
                        card: secondCard,
                        renderMarkdown,
                        type: "basic",
                        uiResetToken: 2,
                    }),
                );
            });

            expect(container.querySelector(".sr-show-answer-btn")).not.toBeNull();
            expect(container.querySelector(".sr-rating-buttons")).toBeNull();
            expect(container.querySelector(".sr-answer-section")).toBeNull();
        } finally {
            act(() => root.unmount());
        }
    });

    test.each([["highlight" as const], ["bold" as const], ["anki" as const]])(
        "pre-tokenizes reviewer formula clozes for %s sources before markdown splits marker text",
        async (source) => {
            const renderMarkdown = createSplitMarkerFormulaRenderMarkdown();
            const { container, root } = mountCard(
                buildReviewerCard(source),
                renderMarkdown,
                "cloze",
            );

            try {
                await flushEffects();

                const contentRoot = container.querySelector<HTMLElement>(".sr-markdown-content");
                expect(contentRoot).not.toBeNull();
                expect(contentRoot?.innerHTML).not.toContain("SR_C:");
                expect(contentRoot?.innerHTML).not.toContain("%24");
                expect(contentRoot?.innerHTML).not.toContain("\\lim");
                expect(contentRoot?.querySelector(".sr-cloze-wrapper")).not.toBeNull();
                expect(contentRoot?.querySelector(".sr-cloze-placeholder")?.textContent).toBe(
                    "[...]",
                );

                const showAnswerButton =
                    container.querySelector<HTMLButtonElement>(".sr-show-answer-btn");
                expect(showAnswerButton).not.toBeNull();

                act(() => {
                    showAnswerButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                });

                await flushEffects();

                const flippedContent = container.querySelector<HTMLElement>(
                    ".sr-cloze-content.sr-flipped .sr-markdown-content",
                );
                expect(flippedContent?.innerHTML).not.toContain("SR_C:");
                expect(flippedContent?.innerHTML).not.toContain("%24");
                expect(flippedContent?.innerHTML).not.toContain("\\lim");
                expect(
                    flippedContent?.querySelector(".sr-cloze-answer .math-rendered"),
                ).not.toBeNull();
            } finally {
                act(() => root.unmount());
            }
        },
    );

    test("renders crossed disabled markdown around the active cloze marker without leaking raw placeholders", async () => {
        const renderMarkdown = createCrossBoundaryMarkdownRender();
        const settings: SRSettings = {
            ...DEFAULT_SETTINGS,
            convertHighlightsToClozes: true,
            convertBoldTextToClozes: false,
            clozePatterns: ["==[123;;]answer[;;hint]=="],
        };
        const sourceText = "**\u542c==\u7235\u58eb\u4e50\u6216\u8005\u4e00\u4e9b OST**==";
        const [card] = CardFrontBackUtil.expand(CardType.Cloze, sourceText, settings);

        if (!card) {
            throw new Error("Failed to build crossed cloze reviewer card");
        }

        const { container, root } = mountCard(
            {
                front: card.front,
                back: card.back,
                review: card.review,
            },
            renderMarkdown,
            "cloze",
        );

        try {
            await flushEffects();

            expect(
                renderMarkdown.mock.calls.some(([content]) => content.includes("SR_SENTINEL_")),
            ).toBe(true);
            expect(
                renderMarkdown.mock.calls.some(([content]) => content.includes("**\u542c")),
            ).toBe(true);

            let activeFace = getActiveFace(container);
            let contentRoot = activeFace?.querySelector<HTMLElement>(".sr-markdown-content");
            expect(contentRoot?.querySelector("strong .sr-cloze-wrapper")).not.toBeNull();
            expect(contentRoot?.querySelector(".sr-cloze-placeholder")?.textContent).toBe("[...]");
            expect(contentRoot?.textContent).toContain("\u542c");
            expect(contentRoot?.textContent).not.toContain("SR_C:");
            expect(contentRoot?.textContent).not.toContain("SR_SENTINEL_");
            expect(contentRoot?.textContent).not.toContain("**");

            const showAnswerButton =
                container.querySelector<HTMLButtonElement>(".sr-show-answer-btn");
            expect(showAnswerButton).not.toBeNull();

            act(() => {
                showAnswerButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            await flushEffects();

            activeFace = getActiveFace(container);
            contentRoot = activeFace?.querySelector<HTMLElement>(".sr-markdown-content");
            expect(contentRoot?.querySelector("strong .sr-cloze-wrapper")).not.toBeNull();
            expect(contentRoot?.querySelector(".sr-cloze-answer")?.textContent).toBe(
                "\u7235\u58eb\u4e50\u6216\u8005\u4e00\u4e9b OST",
            );
            expect(contentRoot?.textContent).toContain("\u542c");
            expect(contentRoot?.textContent).toContain(
                "\u7235\u58eb\u4e50\u6216\u8005\u4e00\u4e9b OST",
            );
            expect(contentRoot?.textContent).not.toContain("SR_C:");
            expect(contentRoot?.textContent).not.toContain("SR_SENTINEL_");
            expect(contentRoot?.textContent).not.toContain("**");
        } finally {
            act(() => root.unmount());
        }
    });

    test("desktop header layout truncates breadcrumbs before moving them inline and only compacts stats last", async () => {
        const resizeObserver = installMockResizeObserver();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const breadcrumbs = [
            { label: "Root heading", line: 0, level: 1 },
            { label: "Very long child heading", line: 5, level: 2 },
        ];

        try {
            act(() => {
                root.render(
                    React.createElement(LinearCard, {
                        autoAdvanceSeconds: 0,
                        card: { front: "Q", back: "A" },
                        breadcrumbs,
                        filename: "note.md",
                        renderMarkdown: async (content: string, el: HTMLElement) => {
                            el.textContent = content;
                        },
                        type: "basic",
                    }),
                );
            });

            await flushEffects();

            let liveHeader = installHeaderLayoutGeometry(container, 420, {
                expandedRegular: 560,
                truncatedRegular: 380,
                inlineRegular: 320,
                inlineCompact: 260,
            });

            act(() => {
                resizeObserver.MockResizeObserver.instances.forEach((observer) =>
                    observer.trigger(),
                );
            });
            await flushAnimationFrame();

            expect(liveHeader.dataset.srBreadcrumbPlacement).toBe("header");
            expect(liveHeader.dataset.srBreadcrumbDisplay).toBe("truncated");
            expect(liveHeader.dataset.srStatsMode).toBe("regular");
            expect(
                liveHeader.querySelectorAll(".sr-breadcrumbs-trail .sr-breadcrumb-item"),
            ).toHaveLength(2);
            expect(container.querySelector(".sr-inline-breadcrumbs")).toBeNull();

            liveHeader = installHeaderLayoutGeometry(container, 300, {
                expandedRegular: 560,
                truncatedRegular: 380,
                inlineRegular: 280,
                inlineCompact: 220,
            });

            act(() => {
                resizeObserver.MockResizeObserver.instances.forEach((observer) =>
                    observer.trigger(),
                );
            });
            await flushAnimationFrame();

            expect(liveHeader.dataset.srBreadcrumbPlacement).toBe("inline");
            expect(liveHeader.dataset.srStatsMode).toBe("regular");
            expect(
                container.querySelectorAll(".sr-inline-breadcrumbs .sr-breadcrumb-item"),
            ).toHaveLength(2);

            liveHeader = installHeaderLayoutGeometry(container, 200, {
                expandedRegular: 560,
                truncatedRegular: 380,
                inlineRegular: 280,
                inlineCompact: 180,
            });

            act(() => {
                resizeObserver.MockResizeObserver.instances.forEach((observer) =>
                    observer.trigger(),
                );
            });
            await flushAnimationFrame();

            expect(liveHeader.dataset.srBreadcrumbPlacement).toBe("inline");
            expect(liveHeader.dataset.srStatsMode).toBe("compact");
        } finally {
            act(() => root.unmount());
            resizeObserver.restore();
        }
    });

    test("mobile header layout always uses inline breadcrumbs with compact stats", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        try {
            act(() => {
                root.render(
                    React.createElement(LinearCard, {
                        autoAdvanceSeconds: 0,
                        card: { front: "Q", back: "A" },
                        breadcrumbs: [{ label: "Root", line: 0, level: 1 }],
                        filename: "note.md",
                        isMobile: true,
                        renderMarkdown: async (content: string, el: HTMLElement) => {
                            el.textContent = content;
                        },
                        type: "basic",
                    }),
                );
            });

            await flushEffects();

            const liveHeader = container.querySelector<HTMLElement>(
                ".sr-card-header:not(.sr-card-header-measure)",
            );
            expect(liveHeader?.dataset.srBreadcrumbPlacement).toBe("inline");
            expect(liveHeader?.dataset.srStatsMode).toBe("compact");
            expect(
                container.querySelectorAll(".sr-inline-breadcrumbs .sr-breadcrumb-item"),
            ).toHaveLength(1);
        } finally {
            act(() => root.unmount());
        }
    });

    test("keeps file and breadcrumb clicks on separate handlers in the header", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const onOpenNote = jest.fn();
        const onOpenBreadcrumb = jest.fn();
        const breadcrumbs = [
            { label: "日志 10.24--11.21", line: 3, level: 1 },
            { label: "11.3-11.9", line: 8, level: 2 },
        ];

        try {
            act(() => {
                root.render(
                    React.createElement(LinearCard, {
                        autoAdvanceSeconds: 0,
                        card: { front: "Q", back: "A" },
                        breadcrumbs,
                        filename: "8号.md",
                        onOpenNote,
                        onOpenBreadcrumb,
                        renderMarkdown: async (content: string, el: HTMLElement) => {
                            el.textContent = content;
                        },
                        type: "basic",
                    }),
                );
            });

            await flushEffects();

            const liveHeader = container.querySelector<HTMLElement>(
                ".sr-card-header:not(.sr-card-header-measure)",
            );
            const fileButton = liveHeader?.querySelector<HTMLElement>(".sr-filename-badge");
            const crumbButtons = Array.from(
                liveHeader?.querySelectorAll<HTMLElement>(
                    ".sr-breadcrumbs-trail .sr-breadcrumb-item",
                ) ?? [],
            );

            expect(fileButton).not.toBeNull();
            expect(crumbButtons).toHaveLength(2);

            act(() => {
                fileButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });
            act(() => {
                crumbButtons[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(onOpenNote).toHaveBeenCalledTimes(1);
            expect(onOpenBreadcrumb).toHaveBeenCalledTimes(1);
            expect(onOpenBreadcrumb).toHaveBeenCalledWith(breadcrumbs[1], undefined);
        } finally {
            act(() => root.unmount());
        }
    });

    test("renders clickable inline breadcrumbs in mobile layout", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const onOpenBreadcrumb = jest.fn();
        const breadcrumbs = [
            { label: "Root", line: 0, level: 1 },
            { label: "Child", line: 4, level: 2 },
        ];

        try {
            act(() => {
                root.render(
                    React.createElement(LinearCard, {
                        autoAdvanceSeconds: 0,
                        card: { front: "Q", back: "A" },
                        breadcrumbs,
                        filename: "note.md",
                        isMobile: true,
                        onOpenBreadcrumb,
                        renderMarkdown: async (content: string, el: HTMLElement) => {
                            el.textContent = content;
                        },
                        type: "basic",
                    }),
                );
            });

            await flushEffects();

            const inlineButtons = container.querySelectorAll<HTMLElement>(
                ".sr-inline-breadcrumbs .sr-breadcrumb-item",
            );
            expect(inlineButtons).toHaveLength(2);

            act(() => {
                inlineButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            });

            expect(onOpenBreadcrumb).toHaveBeenCalledTimes(1);
            expect(onOpenBreadcrumb).toHaveBeenCalledWith(breadcrumbs[0], undefined);
        } finally {
            act(() => root.unmount());
        }
    });
});
