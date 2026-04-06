import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { CardType } from "src/Question";
import { CardFrontBackUtil } from "src/question-type";
import { DEFAULT_PROGRESS_BAR_STYLE, DEFAULT_SETTINGS, SRSettings } from "src/settings";
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

            delete (
                globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }
            ).ResizeObserver;
        },
    };
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
            expect(codeBlock?.querySelector(".sr-code-ellipsis .sr-code-line-number")?.textContent).toBe(
                "",
            );

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
                resizeObserver.MockResizeObserver.instances.forEach((observer) => observer.trigger());
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
                resizeObserver.MockResizeObserver.instances.forEach((observer) => observer.trigger());
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
});
