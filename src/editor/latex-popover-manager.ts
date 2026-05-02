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

function findMathAtCursor(text: string, cursorPos: number, offset: number): MathMatch | null {
    const blockRegex = /\$\$([^$]+)\$\$/g;
    let match;
    while ((match = blockRegex.exec(text)) !== null) {
        const from = offset + match.index;
        const to = offset + match.index + match[0].length;
        if (cursorPos >= from && cursorPos <= to) {
            return { from, to, contentFrom: from + 2, latex: match[1], isBlock: true };
        }
    }

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

    isDragged: boolean = false;
    draggedPosition: { left: number; top: number } | null = null;
    lastFormulaCoords: { left: number; top: number } | null = null;

    scrollHandler: (() => void) | null = null;

    constructor(public view: EditorView) {
        this.component = new Component();
        this.component.load();

        this.scrollHandler = () => this.handleScroll();
        view.scrollDOM.addEventListener("scroll", this.scrollHandler);
    }

    handleScroll() {
        if (this.isDragged || !this.container || !this.currentMathRange) return;

        requestAnimationFrame(() => {
            if (!this.currentMathRange || !this.container) return;

            try {
                const coords = this.view.coordsAtPos(this.currentMathRange.from);
                if (coords) {
                    this.lastFormulaCoords = { left: coords.left, top: coords.top };
                    this.container.style.left = `${coords.left}px`;
                    this.container.style.top = `${coords.top}px`;
                }
            } catch {
                // Ignore transient coordinate lookup errors while the editor rerenders.
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

        const visibleRanges = update.view.visibleRanges;
        let mathNode: MathMatch | null = null;

        for (const { from, to } of visibleRanges) {
            const text = doc.sliceString(from, to);
            mathNode = findMathAtCursor(text, selection.head, from);
            if (mathNode) break;
        }

        if (mathNode && hasClozeSyntax(mathNode.latex)) {
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

        let coords;
        try {
            coords = view.coordsAtPos(node.from);
        } catch {
            return;
        }
        if (!coords) return;

        this.lastFormulaCoords = { left: coords.left, top: coords.top };

        if (!this.container) {
            this.container = createDiv();
            this.container.className = "sr-latex-popover-anchor";
            document.body.appendChild(this.container);
            this.root = createRoot(this.container);

            this.isDragged = false;
            this.draggedPosition = null;

            this.setupDragHandlers();
        }

        if (this.isDragged && this.draggedPosition) {
            this.container.setCssProps({
                position: "fixed",
                left: `${this.draggedPosition.left}px`,
                top: `${this.draggedPosition.top}px`,
                transform: "none",
            });
        } else {
            this.container.setCssProps({
                position: "fixed",
                left: `${coords.left}px`,
                top: `${coords.top}px`,
                transform: "translateY(-100%) translateY(-12px)",
            });
        }

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
        let hasMoved = false;
        const DRAG_THRESHOLD = 5;

        const onMouseDown = (e: MouseEvent) => {
            isDragging = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;

            const rect = this.container.getBoundingClientRect();
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

            if (
                !hasMoved &&
                (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD)
            ) {
                hasMoved = true;
            }

            if (hasMoved) {
                this.container.setCssProps({
                    left: `${startLeft + deltaX}px`,
                    top: `${startTop + deltaY}px`,
                    transform: "none",
                });

                this.isDragged = true;
                this.draggedPosition = {
                    left: startLeft + deltaX,
                    top: startTop + deltaY,
                };
            }
        };

        const onMouseUp = (_e: MouseEvent) => {
            isDragging = false;
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);

            if (!hasMoved) {
                const clickEvent = new CustomEvent("sr-popover-click");
                this.container?.dispatchEvent(clickEvent);
            }
        };

        this.container.addEventListener("mousedown", onMouseDown);

        this.container.setCssProps({
            cursor: "grab",
        });
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
        if (this.scrollHandler) {
            this.view.scrollDOM.removeEventListener("scroll", this.scrollHandler);
        }
        this.destroyPopover();
        this.component.unload();
    }
}

export const latexPopoverExtension = ViewPlugin.fromClass(LatexPopoverPlugin);
