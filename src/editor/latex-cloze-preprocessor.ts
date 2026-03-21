/**
 * 这个文件是干什么的：
 *   专门处理编辑器里 LaTeX 数学公式中的"填空"效果。
 *   当用户在公式中写了填空语法（比如 {{c1::x^2}}）时，
 *   这个文件会找到对应的公式，把它替换成带高亮填空效果的自定义渲染结果。
 *
 * 它在项目中属于：界面层（编辑器插件）
 *
 * 它会用到哪些文件：
 *   - src/utils/latexTransformer.ts（把填空语法转换成 LaTeX 高亮命令）
 *   - obsidian 的 renderMath / finishRenderMath（渲染数学公式）
 *
 * 哪些文件会用到它：
 *   - src/editor/index.ts 或插件主入口（注册这个编辑器扩展）
 *
 * 匹配原理：
 *   使用 CodeMirror 的 posAtDOM 方法，通过 DOM 元素反查文档位置，
 *   实现 DOM → 文档位置 的精确匹配，不依赖屏幕像素坐标。
 */
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { transformLatex, hasClozeSyntax } from "../utils/latexTransformer";
import { finishRenderMath, renderMath } from "obsidian";

interface MathBlock {
    from: number;
    to: number;
    text: string;
    isBlock: boolean;
}

/**
 * 查找所有包含 cloze 的 math 块
 */
function findMathBlocks(doc: string): MathBlock[] {
    const blocks: MathBlock[] = [];

    // 块级公式 $$...$$
    const blockRegex = /\$\$([\s\S]*?)\$\$/g;
    let match;
    while ((match = blockRegex.exec(doc)) !== null) {
        if (hasClozeSyntax(match[0])) {
            blocks.push({
                from: match.index,
                to: match.index + match[0].length,
                text: match[0],
                isBlock: true,
            });
        }
    }

    // 行内公式 $...$
    const inlineRegex = /(?<!\$)\$(?!\$)([^\$\n]+)\$(?!\$)/g;
    while ((match = inlineRegex.exec(doc)) !== null) {
        const from = match.index;
        const to = match.index + match[0].length;
        const overlaps = blocks.some(
            (b) => (from >= b.from && from < b.to) || (to > b.from && to <= b.to),
        );
        if (!overlaps && hasClozeSyntax(match[0])) {
            blocks.push({ from, to, text: match[0], isBlock: false });
        }
    }

    blocks.sort((a, b) => a.from - b.from);
    return blocks;
}

/**
 * 创建自定义渲染的 math 容器
 */
function createCustomMathContainer(latex: string, isBlock: boolean): HTMLElement {
    const innerLatex = latex.replace(/^\$\$?|\$\$?$/g, "").trim();
    const transformedLatex = transformLatex(innerLatex, "highlight", null);
    const finalLatex = isBlock ? `\\displaystyle ${transformedLatex}` : transformedLatex;

    const container = renderMath(finalLatex, false);
    finishRenderMath();

    container.classList.add("sr-cloze-math-custom");
    container.setAttribute("data-sr-cloze", "true");

    if (isBlock) {
        container.style.display = "block";
        container.style.textAlign = "center";
        container.style.width = "100%";
        container.style.margin = "1em 0";
    }

    return container;
}

/**
 * ViewPlugin - 使用 posAtDOM 进行精确的 DOM→Position 匹配，替换含填空的数学公式
 */
class LatexClozeDOMPlugin {
    view: EditorView;
    blocks: MathBlock[] = [];
    rafId: number | null = null;
    timeoutId: number | null = null;

    constructor(view: EditorView) {
        this.view = view;
        this.updateBlocks();
        this.scheduleProcess();
    }

    updateBlocks() {
        const docText = this.view.state.doc.toString();
        this.blocks = findMathBlocks(docText);
    }

    scheduleProcess() {
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
        }
        // 延迟 150ms 确保 Obsidian 已完成 MathJax 渲染并挂载 DOM
        this.timeoutId = window.setTimeout(() => {
            this.rafId = requestAnimationFrame(() => {
                this.processDOM();
            });
        }, 150);
    }

    processDOM() {
        // 1. 获取选区，避免处理光标正在编辑的公式
        const selection = this.view.state.selection.main;

        // 2. 查找 Obsidian 生成的所有数学公式容器
        //    Obsidian 用 span.math 包裹 mjx-container
        const mathElements = Array.from(
            this.view.dom.querySelectorAll(".cm-content .math"),
        ) as HTMLElement[];

        for (const mathSpan of mathElements) {
            // 如果里面的 mjx-container 已经被我们处理过，直接跳过
            const existingMjx = mathSpan.querySelector("mjx-container");
            if (!existingMjx || existingMjx.hasAttribute("data-sr-processed")) continue;

            // 3. 核心：通过 DOM 元素反查它在文档中的位置
            //    posAtDOM 返回该节点之前的字符位置
            let domPos: number;
            try {
                domPos = this.view.posAtDOM(mathSpan);
            } catch {
                // 如果 DOM 节点不在编辑器可见范围内，posAtDOM 可能抛异常
                continue;
            }

            // 4. 在我们解析的 blocks 中查找匹配该位置的 block
            //    允许少量字符误差，因为有时候隐藏字符或 widget 会导致微小偏移
            const matchedBlock = this.blocks.find(
                (b) => Math.abs(b.from - domPos) <= 2 || (domPos >= b.from && domPos <= b.to),
            );

            if (!matchedBlock) continue;

            // 5. 检查是否正在编辑（光标与该块重叠）
            const isEditing =
                selection.to >= matchedBlock.from && selection.from <= matchedBlock.to;
            if (isEditing) continue;

            // 6. 执行替换
            //    替换 mjx-container，保留外层的 span.math，维持 CodeMirror 结构稳定
            const customContainer = createCustomMathContainer(
                matchedBlock.text,
                matchedBlock.isBlock,
            );
            customContainer.setAttribute("data-sr-processed", "true");
            existingMjx.replaceWith(customContainer);
        }
    }

    update(update: ViewUpdate) {
        if (update.docChanged) {
            this.updateBlocks();
        }
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
            this.scheduleProcess();
        }
    }

    destroy() {
        if (this.rafId !== null) cancelAnimationFrame(this.rafId);
        if (this.timeoutId !== null) clearTimeout(this.timeoutId);
    }
}

export const latexClozePreprocessorPlugin: Extension = ViewPlugin.fromClass(LatexClozeDOMPlugin);
