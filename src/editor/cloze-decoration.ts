/**
 * [编辑器层：增强 Obsidian 编辑体验] [UI] CodeMirror 插件，用于在编辑模式下高亮/隐藏填空（Cloze）语法。
 */
import {
    Decoration,
    DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { App } from "obsidian";
import { ClozePopoverManager } from "../ui/editor/ClozePopoverManager";

// 全局 App 实例引用
let pluginApp: App;

export function initializeClozeDecoration(app: App) {
    pluginApp = app;
}

// 正则：匹配 {{c1::内容}} 或 {{c1::内容::提示}}
const CLOZE_REGEX = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g;

/**
 * 检测位置是否在 LaTeX 公式内（$...$ 或 $$...$$）
 */
function isInsideLatexFormula(text: string, position: number): boolean {
    // 查找所有 LaTeX 公式范围
    const formulas: { from: number; to: number }[] = [];

    // 块级公式 $$...$$
    let i = 0;
    while (i < text.length) {
        if (text.startsWith("$$", i)) {
            const start = i;
            i += 2;
            const endIndex = text.indexOf("$$", i);
            if (endIndex !== -1) {
                formulas.push({ from: start, to: endIndex + 2 });
                i = endIndex + 2;
                continue;
            }
        }
        // 行内公式 $...$
        if (
            text[i] === "$" &&
            (i === 0 || text[i - 1] !== "$") &&
            i + 1 < text.length &&
            text[i + 1] !== "$"
        ) {
            const start = i;
            i += 1;
            let endIndex = -1;
            for (let j = i; j < text.length; j++) {
                if (text[j] === "$" && (j + 1 >= text.length || text[j + 1] !== "$")) {
                    endIndex = j;
                    break;
                }
            }
            if (endIndex !== -1) {
                formulas.push({ from: start, to: endIndex + 1 });
                i = endIndex + 1;
                continue;
            }
        }
        i++;
    }

    // 检查位置是否在任何公式范围内
    return formulas.some((f) => position >= f.from && position <= f.to);
}

/**
 * 获取当前位置所在的"卡片上下文"（段落边界）
 */
function getCardContext(doc: { toString(): string }, pos: number): { from: number; to: number; text: string } {
    const docText = doc.toString();
    let from = pos;
    while (from > 0) {
        if (docText[from - 1] === "\n" && (from === 1 || docText[from - 2] === "\n")) break;
        from--;
    }
    let to = pos;
    while (to < docText.length) {
        if (docText[to] === "\n" && (to === docText.length - 1 || docText[to + 1] === "\n")) break;
        to++;
    }
    return { from, to, text: docText.slice(from, to) };
}

function getExistingClozeIdsInContext(contextText: string): Map<string, string> {
    const idMap = new Map<string, string>();
    const regex = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g;
    let match;
    while ((match = regex.exec(contextText)) !== null) {
        const id = match[1];
        const content = match[2];
        if (!idMap.has(id)) idMap.set(id, content);
    }
    return idMap;
}

// Chevron 图标 SVG
const CHEVRON_ICON = `<svg viewBox="0 0 24 24" width="8" height="8" stroke="currentColor" stroke-width="3" fill="none"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

/**
 * 下拉按钮 Widget - 放在 Cloze 内容末尾（高亮内部）
 */
class ClozeButtonWidget extends WidgetType {
    constructor(
        readonly id: string,
        readonly text: string,
        readonly hint: string | undefined,
        readonly clozeFrom: number,
        readonly clozeTo: number,
    ) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const button = document.createElement("span");
        button.addClass("sr-cloze-button");
        button.innerHTML = CHEVRON_ICON;
        button.title = "管理填空";

        // 阻止所有鼠标事件冒泡，防止 CodeMirror 接管
        button.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showPopover(view, button);
        });

        return button;
    }

    showPopover(view: EditorView, buttonEl: HTMLElement) {
        if (!pluginApp) {
            console.error("SRPlugin: App not initialized for Cloze Decoration");
            return;
        }

        new ClozePopoverManager(
            pluginApp,
            view,
            this.clozeFrom,
            this.clozeTo,
            this.id,
            this.text,
            buttonEl,
        ).open();
    }

    // 关键：返回 true 表示 Widget 自己处理事件，不让 CodeMirror 接管
    ignoreEvent(): boolean {
        return true;
    }
}

/**
 * Cloze 装饰 ViewPlugin
 * - 始终应用高亮（无论光标是否在内部）
 * - 光标不在内部时隐藏语法
 * - 光标在内部时显示源码但保留高亮
 */
export const clozeDecorationPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view: EditorView): DecorationSet {
            const builder = new RangeSetBuilder<Decoration>();
            const { state } = view;
            const doc = state.doc;
            const selection = state.selection.main;
            const cursorFrom = selection.from;
            const cursorTo = selection.to;

            const decorations: Array<{ from: number; to: number; decoration: Decoration }> = [];

            for (const { from, to } of view.visibleRanges) {
                const text = doc.sliceString(from, to);
                let match;
                CLOZE_REGEX.lastIndex = 0;

                // 检测 Live Preview 模式
                const isLivePreview = !!view.dom.closest(".is-live-preview");

                while ((match = CLOZE_REGEX.exec(text)) !== null) {
                    const start = from + match.index;
                    const end = start + match[0].length;
                    const id = match[1];
                    const content = match[2];
                    const hint = match[3];

                    // 跳过 LaTeX 公式内的 cloze
                    if (isInsideLatexFormula(text, match.index)) {
                        continue;
                    }

                    // 检查当前卡片上下文中唯一 cloze ID 数量
                    const cardContext = getCardContext(doc, start);
                    const uniqueIds = getExistingClozeIdsInContext(cardContext.text);
                    const hasMultipleClozeIds = uniqueIds.size > 1;

                    const isCursorInside =
                        (cursorFrom >= start && cursorFrom <= end) ||
                        (cursorTo >= start && cursorTo <= end) ||
                        (cursorFrom <= start && cursorTo >= end);

                    // 计算内容位置
                    const prefixLen = 2 + 1 + id.length + 2; // {{ + c + id + ::
                    const contentStart = start + prefixLen;
                    const contentEnd = contentStart + content.length;

                    // 1. 基础高亮 (始终应用，为了视觉效果)
                    // 注意：如果被 replace 覆盖，mark 可能不显示，但在 Obsidian 中通常 mark + replace(empty) 是可以共存的(作用于 text)
                    // 当隐藏语法时，我们希望高亮 content 部分。
                    // 当显示语法时，我们希望高亮整个部分。

                    if (isLivePreview && !isCursorInside) {
                        // === Live Preview 且光标不在内部：渲染模式 ===

                        // 高亮内容
                        decorations.push({
                            from: contentStart,
                            to: contentEnd,
                            decoration: Decoration.mark({ class: "sr-cloze-highlight" }),
                        });

                        // 隐藏前缀 {{c1::
                        decorations.push({
                            from: start,
                            to: contentStart,
                            decoration: Decoration.replace({}),
                        });

                        // 隐藏后缀 }} 或 ::hint}}
                        decorations.push({
                            from: contentEnd,
                            to: end,
                            decoration: Decoration.replace({}),
                        });

                        // 此时不显示按钮，以免干扰阅读
                    } else {
                        // === Source Mode 或 Live Preview 编辑中：源码模式 ===

                        // 高亮整个区域 (编辑态样式)
                        decorations.push({
                            from: start,
                            to: end,
                            decoration: Decoration.mark({
                                class: "sr-cloze-highlight sr-cloze-editing",
                            }),
                        });
                    }

                    // 始终在多ID情况下显示管理按钮 (用户要求：编辑模式和源码模式都要展示)
                    // 只要有多个ID，就显示以便合并
                    if (hasMultipleClozeIds) {
                        decorations.push({
                            from: contentEnd,
                            to: contentEnd,
                            decoration: Decoration.widget({
                                widget: new ClozeButtonWidget(id, content, hint, start, end),
                                side: -1,
                            }),
                        });
                    }
                }
            }

            // 按位置排序后添加
            decorations.sort((a, b) => a.from - b.from || a.to - b.to);
            for (const d of decorations) {
                builder.add(d.from, d.to, d.decoration);
            }

            return builder.finish();
        }
    },
    {
        decorations: (v) => v.decorations,
    },
);
