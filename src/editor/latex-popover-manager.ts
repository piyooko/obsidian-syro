/**
 * LaTeX Popover 缁狅紕鎮婇崳?
 * CodeMirror ViewPlugin閿涘苯婀紓鏍帆閺佹澘顒熼崗顒€绱￠弮鑸垫▔缁€娲暕鐟欏牆鑴婄粣?
 * 閺€顖涘瘮濠婃艾濮╃捄鐔兼閸滃本瀚嬮崝銊ュ閼?
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
 * 娴犲孩鏋冮張顑胯厬閺屻儲澹橀崗澶嬬垼閹碘偓閸︺劎娈戦弫鏉款劅閸忣剙绱?
 */
function findMathAtCursor(text: string, cursorPos: number, offset: number): MathMatch | null {
    // 閸ф楠囬崗顒€绱?$$...$$
    const blockRegex = /\$\$([^$]+)\$\$/g;
    let match;
    while ((match = blockRegex.exec(text)) !== null) {
        const from = offset + match.index;
        const to = offset + match.index + match[0].length;
        if (cursorPos >= from && cursorPos <= to) {
            return { from, to, contentFrom: from + 2, latex: match[1], isBlock: true };
        }
    }

    // 鐞涘苯鍞撮崗顒€绱?$...$
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

    // 閹锋牕濮╅惄绋垮彠閻樿埖鈧?
    isDragged: boolean = false;
    draggedPosition: { left: number; top: number } | null = null; // 鐠侀缍囩仦蹇撶缂佹繂顕担宥囩枂
    lastFormulaCoords: { left: number; top: number } | null = null;

    // 濠婃艾濮╅惄鎴濇儔閸?
    scrollHandler: (() => void) | null = null;

    constructor(public view: EditorView) {
        this.component = new Component();
        this.component.load();

        // 鐠佸墽鐤嗗姘З閻╂垵鎯?
        this.scrollHandler = this.handleScroll.bind(this);
        view.scrollDOM.addEventListener("scroll", this.scrollHandler);
    }

    handleScroll() {
        // 婵″倹鐏夊鑼额潶閹锋牕濮╅敍灞肩瑝鐠虹喖娈㈠姘З
        if (this.isDragged || !this.container || !this.currentMathRange) return;

        // 闁插秵鏌婄拋锛勭暬閸忣剙绱℃担宥囩枂楠炶埖娲块弬?popover
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
                // 韫囩晫鏆愰柨娆掝嚖
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

        // 閼惧嘲褰囬崣顖濐潒閸栧搫鐓欓崘鍛畱閺傚洦婀版潻娑滎攽閹兼粎鍌?
        const visibleRanges = update.view.visibleRanges;
        let mathNode: MathMatch | null = null;

        for (const { from, to } of visibleRanges) {
            const text = doc.sliceString(from, to);
            mathNode = findMathAtCursor(text, selection.head, from);
            if (mathNode) break;
        }

        // 濡偓閺屻儲妲搁崥锕€瀵橀崥?Cloze 鐠囶厽纭?
        if (mathNode && hasClozeSyntax(mathNode.latex)) {
            // 瀵ゆ儼绻滅拫鍐暏 showPopover閿涘矂浼╅崗宥呮躬 update 娑擃叀鐨熼悽?coordsAtPos
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

        // 鐠侊紕鐣婚崸鎰垼
        let coords;
        try {
            coords = view.coordsAtPos(node.from);
        } catch (e) {
            return;
        }
        if (!coords) return;

        this.lastFormulaCoords = { left: coords.left, top: coords.top };

        // 閸掓稑缂撶€圭懓娅?
        if (!this.container) {
            this.container = document.createElement("div");
            this.container.className = "sr-latex-popover-anchor";
            document.body.appendChild(this.container);
            this.root = createRoot(this.container);

            // 闁插秶鐤嗛幏鏍уЗ閻樿埖鈧?
            this.isDragged = false;
            this.draggedPosition = null;

            // 濞ｈ濮為幏鏍уЗ閸旂喕鍏?
            this.setupDragHandlers();
        }

        // 婵″倹鐏夊鑼额潶閹锋牕濮╅敍灞煎▏閻劏顔囨担蹇曟畱鐏炲繐绠风紒婵嗩嚠娴ｅ秶鐤?
        if (this.isDragged && this.draggedPosition) {
            this.container.setCssProps({
                position: "fixed",
                left: `${this.draggedPosition.left}px`,
                top: `${this.draggedPosition.top}px`,
                transform: "none",
            });
        } else {
            // 姒涙顓荤€规矮缍呴崚鏉垮彆瀵繋绗傞弬?
            this.container.setCssProps({
                position: "fixed",
                left: `${coords.left}px`,
                top: `${coords.top}px`,
                transform: "translateY(-100%) translateY(-12px)",
            });
        }

        this.container.setCssProps({
            "z-index": "1000",
            "max-width": "600px",
            width: "max-content",
        });

        // 濞撳弶鐓?React
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
        let hasMoved = false; // 閸栧搫鍨庨幏鏍уЗ閸滃瞼鍋ｉ崙?
        const DRAG_THRESHOLD = 5; // 缁夎濮╃搾鍛扮箖 5px 閹靛秶鐣婚幏鏍уЗ

        const onMouseDown = (e: MouseEvent) => {
            // 閺佺繝閲?popover 闁棄褰叉禒銉ョ磻婵瀚嬮崝?
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

            // 閸欘亝婀佺粔璇插З鐡掑懓绻冮梼鍫濃偓鍏煎缁犳瀚嬮崝?
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

        const onMouseUp = (e: MouseEvent) => {
            isDragging = false;
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);

            // 婵″倹鐏夊▽鈩冩箒缁夎濮╅敍宀冃曢崣鎴犲仯閸戣绨ㄦ禒璁圭礄閺勫墽銇氶懗宀勬桨閿?
            if (!hasMoved) {
                // 濞叉儳褰傞懛顏勭暰娑斿绨ㄦ禒鍫曗偓姘辩叀 React 缂佸嫪娆?
                const clickEvent = new CustomEvent("sr-popover-click");
                this.container?.dispatchEvent(clickEvent);
            }
        };

        this.container.addEventListener("mousedown", onMouseDown);

        // 濞ｈ濮為幏鏍уЗ閹绘劗銇氶弽宄扮础
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
        // 缁夊娅庡姘З閻╂垵鎯?
        if (this.scrollHandler) {
            this.view.scrollDOM.removeEventListener("scroll", this.scrollHandler);
        }
        this.destroyPopover();
        this.component.unload();
    }
}

export const latexPopoverExtension = ViewPlugin.fromClass(LatexPopoverPlugin);
