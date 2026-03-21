/**
 * [编辑器层：增强 Obsidian 编辑体验] [UI] 实时预览模式下的装饰器逻辑。
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

// ==========================================
// 正则表达式定义
// ==========================================

const BOLD_REGEX = /\*\*(.+?)\*\*/g;
const ITALIC_REGEX = /(?<!\*)\*([^*]+?)\*(?!\*)/g;
const HIGHLIGHT_REGEX = /==(.+?)==/g;
const CLOZE_REGEX = /\{\{c(\d+)::(.+?)(?:::(.+?))?\}\}/g;

// ==========================================
// 辅助函数
// ==========================================

/**
 * 检查光标是否在指定范围内
 */
function isCursorInRange(
    cursorFrom: number,
    cursorTo: number,
    rangeFrom: number,
    rangeTo: number,
): boolean {
    return (
        (cursorFrom >= rangeFrom && cursorFrom <= rangeTo) ||
        (cursorTo >= rangeFrom && cursorTo <= rangeTo) ||
        (cursorFrom <= rangeFrom && cursorTo >= rangeTo)
    );
}

// ==========================================
// 装饰构建
// ==========================================

interface DecorationItem {
    from: number;
    to: number;
    decoration: Decoration;
}

/**
 * 构建所有装饰
 */
function buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const { state } = view;
    const doc = state.doc;
    const selection = state.selection.main;
    const cursorFrom = selection.from;
    const cursorTo = selection.to;

    const decorations: DecorationItem[] = [];

    for (const { from, to } of view.visibleRanges) {
        const text = doc.sliceString(from, to);

        // 处理粗体 **text**
        processBold(text, from, cursorFrom, cursorTo, decorations);

        // 处理斜体 *text*
        processItalic(text, from, cursorFrom, cursorTo, decorations);

        // 处理高亮 ==text==
        processHighlight(text, from, cursorFrom, cursorTo, decorations);

        // 处理挖空 {{c1::text}}
        processCloze(text, from, cursorFrom, cursorTo, decorations);
    }

    // 按位置排序后添加
    decorations.sort((a, b) => a.from - b.from || a.to - b.to);

    // 过滤重叠的装饰（保留先出现的）
    const added = new Set<string>();
    for (const d of decorations) {
        const key = `${d.from}-${d.to}`;
        if (!added.has(key)) {
            builder.add(d.from, d.to, d.decoration);
            added.add(key);
        }
    }

    return builder.finish();
}

/**
 * 处理粗体语法
 */
function processBold(
    text: string,
    offset: number,
    cursorFrom: number,
    cursorTo: number,
    decorations: DecorationItem[],
): void {
    BOLD_REGEX.lastIndex = 0;
    let match;

    while ((match = BOLD_REGEX.exec(text)) !== null) {
        const start = offset + match.index;
        const end = start + match[0].length;
        const content = match[1];
        const contentStart = start + 2; // 跳过 **
        const contentEnd = end - 2; // 跳过 **

        const isCursorInside = isCursorInRange(cursorFrom, cursorTo, start, end);

        if (!isCursorInside) {
            // 渲染模式：隐藏语法，应用粗体样式
            decorations.push({
                from: start,
                to: contentStart,
                decoration: Decoration.replace({}),
            });
            decorations.push({
                from: contentStart,
                to: contentEnd,
                decoration: Decoration.mark({ class: "sr-live-bold" }),
            });
            decorations.push({
                from: contentEnd,
                to: end,
                decoration: Decoration.replace({}),
            });
        } else {
            // 编辑模式：显示源码，但仍应用背景高亮
            decorations.push({
                from: start,
                to: end,
                decoration: Decoration.mark({ class: "sr-live-bold-editing" }),
            });
        }
    }
}

/**
 * 处理斜体语法
 */
function processItalic(
    text: string,
    offset: number,
    cursorFrom: number,
    cursorTo: number,
    decorations: DecorationItem[],
): void {
    ITALIC_REGEX.lastIndex = 0;
    let match;

    while ((match = ITALIC_REGEX.exec(text)) !== null) {
        const start = offset + match.index;
        const end = start + match[0].length;
        const contentStart = start + 1; // 跳过 *
        const contentEnd = end - 1; // 跳过 *

        const isCursorInside = isCursorInRange(cursorFrom, cursorTo, start, end);

        if (!isCursorInside) {
            decorations.push({
                from: start,
                to: contentStart,
                decoration: Decoration.replace({}),
            });
            decorations.push({
                from: contentStart,
                to: contentEnd,
                decoration: Decoration.mark({ class: "sr-live-italic" }),
            });
            decorations.push({
                from: contentEnd,
                to: end,
                decoration: Decoration.replace({}),
            });
        } else {
            decorations.push({
                from: start,
                to: end,
                decoration: Decoration.mark({ class: "sr-live-italic-editing" }),
            });
        }
    }
}

/**
 * 处理高亮语法
 */
function processHighlight(
    text: string,
    offset: number,
    cursorFrom: number,
    cursorTo: number,
    decorations: DecorationItem[],
): void {
    HIGHLIGHT_REGEX.lastIndex = 0;
    let match;

    while ((match = HIGHLIGHT_REGEX.exec(text)) !== null) {
        const start = offset + match.index;
        const end = start + match[0].length;
        const contentStart = start + 2; // 跳过 ==
        const contentEnd = end - 2; // 跳过 ==

        const isCursorInside = isCursorInRange(cursorFrom, cursorTo, start, end);

        if (!isCursorInside) {
            decorations.push({
                from: start,
                to: contentStart,
                decoration: Decoration.replace({}),
            });
            decorations.push({
                from: contentStart,
                to: contentEnd,
                decoration: Decoration.mark({ class: "sr-live-highlight" }),
            });
            decorations.push({
                from: contentEnd,
                to: end,
                decoration: Decoration.replace({}),
            });
        } else {
            decorations.push({
                from: start,
                to: end,
                decoration: Decoration.mark({ class: "sr-live-highlight-editing" }),
            });
        }
    }
}

/**
 * 处理挖空语法
 */
function processCloze(
    text: string,
    offset: number,
    cursorFrom: number,
    cursorTo: number,
    decorations: DecorationItem[],
): void {
    CLOZE_REGEX.lastIndex = 0;
    let match;

    while ((match = CLOZE_REGEX.exec(text)) !== null) {
        const start = offset + match.index;
        const end = start + match[0].length;
        const id = match[1];
        const content = match[2];
        // const hint = match[3]; // 暂不使用

        const prefixLen = 2 + 1 + id.length + 2; // {{ + c + id + ::
        const contentStart = start + prefixLen;
        const contentEnd = contentStart + content.length;

        const isCursorInside = isCursorInRange(cursorFrom, cursorTo, start, end);

        if (!isCursorInside) {
            // 渲染模式
            decorations.push({
                from: start,
                to: contentStart,
                decoration: Decoration.replace({}),
            });
            decorations.push({
                from: contentStart,
                to: contentEnd,
                decoration: Decoration.mark({ class: "sr-live-cloze" }),
            });
            decorations.push({
                from: contentEnd,
                to: end,
                decoration: Decoration.replace({}),
            });
        } else {
            // 编辑模式
            decorations.push({
                from: start,
                to: end,
                decoration: Decoration.mark({ class: "sr-live-cloze-editing" }),
            });
        }
    }
}

// ==========================================
// ViewPlugin 导出
// ==========================================

export const livePreviewPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged || update.selectionSet) {
                this.decorations = buildDecorations(update.view);
            }
        }
    },
    {
        decorations: (v) => v.decorations,
    },
);

// ==========================================
// 编辑器主题/样式
// ==========================================

export const livePreviewTheme = EditorView.baseTheme({
    // 渲染模式样式
    ".sr-live-bold": {
        fontWeight: "bold",
    },
    ".sr-live-italic": {
        fontStyle: "italic",
    },
    ".sr-live-highlight": {
        backgroundColor: "rgba(255, 208, 0, 0.4)",
        borderRadius: "2px",
        padding: "0 2px",
    },
    ".sr-live-cloze": {
        backgroundColor: "rgba(59, 130, 246, 0.2)",
        borderRadius: "2px",
        padding: "0 2px",
        color: "#3b82f6",
    },

    // 编辑模式样式 (光标在范围内)
    ".sr-live-bold-editing": {
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        borderRadius: "2px",
    },
    ".sr-live-italic-editing": {
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        borderRadius: "2px",
    },
    ".sr-live-highlight-editing": {
        backgroundColor: "rgba(255, 208, 0, 0.2)",
        borderRadius: "2px",
    },
    ".sr-live-cloze-editing": {
        backgroundColor: "rgba(59, 130, 246, 0.15)",
        borderRadius: "2px",
    },
});
