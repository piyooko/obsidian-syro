/**
 * LaTeX Popover 管理器
 * CodeMirror ViewPlugin，在编辑数学公式时显示预览弹窗
 * 支持滚动跟随和拖动功能
 */
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { App, Component } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import React from "react";
import { LatexPopover } from "../ui/components/LatexPopover";
import { hasClozeSyntax } from "../utils/latexTransformer";

let appInstance: App | null = null;
let isLatexPopoverEnabled: () => boolean = () => false;

export function initializeLatexPopover(app: App, options?: { isEnabled?: () => boolean }) {
    appInstance = app;
    isLatexPopoverEnabled = options?.isEnabled ?? (() => false);
}

interface MathMatch {
    from: number;
    to: number;
    contentFrom: number;
    latex: string;
    isBlock: boolean;
}

/**
 * 从文本中查找光标所在的数学公式
 */
function findMathAtCursor(text: string, cursorPos: number, offset: number): MathMatch | null {
    // 块级公式 $$...$$
    const blockRegex = /\$\$([^$]+)\$\$/g;
    let match;
    while ((match = blockRegex.exec(text)) !== null) {
        const from = offset + match.index;
        const to = offset + match.index + match[0].length;
        if (cursorPos >= from && cursorPos <= to) {
            return { from, to, contentFrom: from + 2, latex: match[1], isBlock: true };
        }
    }

    // 行内公式 $...$
    const inlineRegex = /\$([^$]+)\$/g;
    while ((match = inlineRegex.exec(text)) !== null) {
        const from = offset + match.index;
        const to = offset + match.index + match[0].length;
        if (cursorPos >= from && cursorPos <= to) {
            return { from, to, contentFrom: from + 1, latex: match[1], isBlock: false };
        }
    }

    return null;
}

class LatexPopoverPlugin {
    container: HTMLElement | null = null;
    root: Root | null = null;
    component: Component;
    currentMathRange: { from: number; to: number } | null = null;
    pendingUpdate: MathMatch | null = null;

    // 拖动相关状态
    isDragged: boolean = false;
    draggedPosition: { left: number; top: number } | null = null; // 记住屏幕绝对位置
    lastFormulaCoords: { left: number; top: number } | null = null;

    // 滚动监听器
    scrollHandler: (() => void) | null = null;

    constructor(public view: EditorView) {
        this.component = new Component();
        this.component.load();

        // 设置滚动监听
        this.scrollHandler = this.handleScroll.bind(this);
        view.scrollDOM.addEventListener("scroll", this.scrollHandler);
    }

    handleScroll() {
        // 如果已被拖动，不跟随滚动
        if (this.isDragged || !this.container || !this.currentMathRange) return;

        // 重新计算公式位置并更新 popover
        requestAnimationFrame(() => {
            if (!this.currentMathRange || !this.container) return;

            try {
                const coords = this.view.coordsAtPos(this.currentMathRange.from);
                if (coords) {
                    this.lastFormulaCoords = { left: coords.left, top: coords.top };
                    this.container.style.left = `${coords.left}px`;
                    this.container.style.top = `${coords.top}px`;
                }
            } catch (e) {
                // 忽略错误
            }
        });
    }

    update(update: ViewUpdate) {
        if (!isLatexPopoverEnabled()) {
            this.pendingUpdate = null;
            this.destroyPopover();
            return;
        }

        if (!update.selectionSet && !update.docChanged) return;

        const state = update.state;
        const selection = state.selection.main;
        const doc = state.doc;

        // 获取可视区域内的文本进行搜索
        const visibleRanges = update.view.visibleRanges;
        let mathNode: MathMatch | null = null;

        for (const { from, to } of visibleRanges) {
            const text = doc.sliceString(from, to);
            mathNode = findMathAtCursor(text, selection.head, from);
            if (mathNode) break;
        }

        // 检查是否包含 Cloze 语法
        if (mathNode && hasClozeSyntax(mathNode.latex)) {
            // 延迟调用 showPopover，避免在 update 中调用 coordsAtPos
            this.pendingUpdate = mathNode;
            requestAnimationFrame(() => {
                if (this.pendingUpdate) {
                    const relativeCursor = Math.max(
                        0,
                        Math.min(
                            this.pendingUpdate.latex.length,
                            selection.head - this.pendingUpdate.contentFrom,
                        ),
                    );
                    this.showPopover(update.view, this.pendingUpdate, relativeCursor);
                    this.pendingUpdate = null;
                }
            });
        } else {
            this.pendingUpdate = null;
            this.destroyPopover();
        }
    }

    showPopover(view: EditorView, node: MathMatch, relativeCursor: number) {
        if (!appInstance || !isLatexPopoverEnabled()) return;

        // 计算坐标
        let coords;
        try {
            coords = view.coordsAtPos(node.from);
        } catch (e) {
            return;
        }
        if (!coords) return;

        this.lastFormulaCoords = { left: coords.left, top: coords.top };

        // 创建容器
        if (!this.container) {
            this.container = document.createElement("div");
            this.container.className = "sr-latex-popover-anchor";
            document.body.appendChild(this.container);
            this.root = createRoot(this.container);

            // 重置拖动状态
            this.isDragged = false;
            this.draggedPosition = null;

            // 添加拖动功能
            this.setupDragHandlers();
        }

        // 如果已被拖动，使用记住的屏幕绝对位置
        if (this.isDragged && this.draggedPosition) {
            this.container.style.position = "fixed";
            this.container.style.left = `${this.draggedPosition.left}px`;
            this.container.style.top = `${this.draggedPosition.top}px`;
            this.container.style.transform = "none"; // 拖动后不使用 transform
        } else {
            // 默认定位到公式上方
            this.container.style.position = "fixed";
            this.container.style.left = `${coords.left}px`;
            this.container.style.top = `${coords.top}px`;
            this.container.style.transform = "translateY(-100%) translateY(-12px)";
        }

        this.container.style.zIndex = "1000";
        this.container.style.maxWidth = "600px";
        this.container.style.width = "max-content";

        // 渲染 React
        this.root?.render(
            React.createElement(LatexPopover, {
                app: appInstance,
                source: node.latex,
                cursorPos: relativeCursor,
                component: this.component,
            }),
        );

        this.currentMathRange = { from: node.from, to: node.to };
    }

    setupDragHandlers() {
        if (!this.container) return;

        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        let isDragging = false;
        let hasMoved = false; // 区分拖动和点击
        const DRAG_THRESHOLD = 5; // 移动超过 5px 才算拖动

        const onMouseDown = (e: MouseEvent) => {
            // 整个 popover 都可以开始拖动
            isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;

            const rect = this.container!.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            e.preventDefault();
            e.stopPropagation();

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging || !this.container) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            // 只有移动超过阈值才算拖动
            if (
                !hasMoved &&
                (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD)
            ) {
                hasMoved = true;
            }

            if (hasMoved) {
                this.container.style.left = `${startLeft + deltaX}px`;
                this.container.style.top = `${startTop + deltaY}px`;
                this.container.style.transform = "none";

                this.isDragged = true;
                this.draggedPosition = {
                    left: startLeft + deltaX,
                    top: startTop + deltaY,
                };
            }
        };

        const onMouseUp = (e: MouseEvent) => {
            isDragging = false;
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);

            // 如果没有移动，触发点击事件（显示背面）
            if (!hasMoved) {
                // 派发自定义事件通知 React 组件
                const clickEvent = new CustomEvent("sr-popover-click");
                this.container?.dispatchEvent(clickEvent);
            }
        };

        this.container.addEventListener("mousedown", onMouseDown);

        // 添加拖动提示样式
        this.container.style.cursor = "grab";
    }

    destroyPopover() {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        this.currentMathRange = null;
        this.isDragged = false;
        this.draggedPosition = null;
        this.lastFormulaCoords = null;
    }

    destroy() {
        // 移除滚动监听
        if (this.scrollHandler) {
            this.view.scrollDOM.removeEventListener("scroll", this.scrollHandler);
        }
        this.destroyPopover();
        this.component.unload();
    }
}

export const latexPopoverExtension = ViewPlugin.fromClass(LatexPopoverPlugin);
