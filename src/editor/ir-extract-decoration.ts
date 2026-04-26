import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    type ViewUpdate,
} from "@codemirror/view";
import { parseIrExtracts, type IrExtractMatch } from "src/util/irExtractParser";

const OUTER_INSET = 18;
const INNER_INSET = 6;
const VERTICAL_INSET = 4;

interface DecorationItem {
    from: number;
    to: number;
    decoration: Decoration;
}

export interface RenderExtract {
    match: IrExtractMatch;
    depth: number;
    maxDepth: number;
    showSource: boolean;
}

interface MeasuredExtractBlock {
    left: number;
    top: number;
    width: number;
    height: number;
    depth: number;
    maxDepth: number;
}

export interface IrExtractLineRange {
    from: number;
    to: number;
    line: number;
}

function isLivePreview(view: EditorView): boolean {
    return !!view.dom.closest(".is-live-preview");
}

function selectionTouchesRange(
    selectionFrom: number,
    selectionTo: number,
    rangeFrom: number,
    rangeTo: number,
): boolean {
    if (selectionFrom === selectionTo) {
        return selectionFrom >= rangeFrom && selectionFrom <= rangeTo;
    }
    return selectionFrom < rangeTo && selectionTo > rangeFrom;
}

export function findIrExtractEditingRoot(
    matches: IrExtractMatch[],
    selectionFrom: number,
    selectionTo: number,
): IrExtractMatch | null {
    const containing = matches.filter((match) => {
        if (selectionFrom === selectionTo) {
            return selectionTouchesRange(selectionFrom, selectionTo, match.start, match.end);
        }
        return match.start <= selectionFrom && match.end >= selectionTo;
    });
    if (containing.length > 0) {
        return containing.sort((left, right) => left.end - left.start - (right.end - right.start))[0];
    }

    return (
        matches
            .filter((match) =>
                selectionTouchesRange(selectionFrom, selectionTo, match.start, match.end),
            )
            .sort((left, right) => left.end - left.start - (right.end - right.start))[0] ?? null
    );
}

function isInsideMatch(match: IrExtractMatch, outer: IrExtractMatch): boolean {
    return match.start >= outer.start && match.end <= outer.end;
}

export function getIrExtractLayerInset(depth: number, maxDepth: number): number {
    const safeDepth = Math.max(1, depth);
    const safeMaxDepth = Math.max(safeDepth, maxDepth, 1);
    if (safeMaxDepth <= 3) {
        return [OUTER_INSET, 12, INNER_INSET][safeDepth - 1] ?? INNER_INSET;
    }
    const step = (OUTER_INSET - INNER_INSET) / (safeMaxDepth - 1);
    return Number((OUTER_INSET - step * (safeDepth - 1)).toFixed(2));
}

function getLineAtOffset(text: string, offset: number): IrExtractLineRange {
    const safeOffset = Math.max(0, Math.min(offset, text.length));
    const from = text.lastIndexOf("\n", Math.max(0, safeOffset - 1)) + 1;
    const nextNewline = text.indexOf("\n", safeOffset);
    const to = nextNewline === -1 ? text.length : nextNewline;
    let line = 1;
    for (let index = 0; index < from; index++) {
        if (text[index] === "\n") line++;
    }
    return { from, to, line };
}

export function getIrExtractLineRanges(
    text: string,
    match: Pick<IrExtractMatch, "innerStart" | "innerEnd">,
): IrExtractLineRange[] {
    const first = getLineAtOffset(text, match.innerStart);
    const last = getLineAtOffset(text, Math.max(match.innerStart, match.innerEnd - 1));
    const ranges: IrExtractLineRange[] = [];
    let cursor = first.from;

    while (cursor <= last.from) {
        const line = getLineAtOffset(text, cursor);
        ranges.push(line);
        if (line.to >= text.length) break;
        cursor = line.to + 1;
    }

    return ranges;
}

function getDepthForMatch(match: IrExtractMatch, byStart: Map<number, IrExtractMatch>): number {
    let depth = 1;
    let parentStart = match.parentStart;
    while (parentStart !== undefined) {
        const parent = byStart.get(parentStart);
        if (!parent) break;
        depth++;
        parentStart = parent.parentStart;
    }
    return depth;
}

function getRootStartForMatch(match: IrExtractMatch, byStart: Map<number, IrExtractMatch>): number {
    let current = match;
    while (current.parentStart !== undefined) {
        const parent = byStart.get(current.parentStart);
        if (!parent) break;
        current = parent;
    }
    return current.start;
}

function createRenderExtracts(
    matches: IrExtractMatch[],
    editingRoot: IrExtractMatch | null,
): RenderExtract[] {
    const byStart = new Map(matches.map((match) => [match.start, match]));
    const depths = new Map<IrExtractMatch, number>();
    const rootStarts = new Map<IrExtractMatch, number>();
    const maxDepthByRoot = new Map<number, number>();

    for (const match of matches) {
        const depth = getDepthForMatch(match, byStart);
        const rootStart = getRootStartForMatch(match, byStart);
        depths.set(match, depth);
        rootStarts.set(match, rootStart);
        maxDepthByRoot.set(rootStart, Math.max(maxDepthByRoot.get(rootStart) ?? 1, depth));
    }

    return matches.map((match) => {
        const rootStart = rootStarts.get(match) ?? match.start;
        return {
            match,
            depth: depths.get(match) ?? 1,
            maxDepth: maxDepthByRoot.get(rootStart) ?? 1,
            showSource: editingRoot ? isInsideMatch(match, editingRoot) : false,
        };
    });
}

export function getIrExtractRenderRange(renderExtract: RenderExtract): { from: number; to: number } {
    return renderExtract.showSource
        ? { from: renderExtract.match.start, to: renderExtract.match.end }
        : { from: renderExtract.match.innerStart, to: renderExtract.match.innerEnd };
}

function buildIrExtractDecorations(view: EditorView): {
    decorations: DecorationSet;
    renderExtracts: RenderExtract[];
} {
    const builder = new RangeSetBuilder<Decoration>();
    if (!isLivePreview(view)) {
        return { decorations: builder.finish(), renderExtracts: [] };
    }

    const text = view.state.doc.toString();
    const matches = parseIrExtracts(text);
    const selection = view.state.selection.main;
    const editingRoot = findIrExtractEditingRoot(matches, selection.from, selection.to);
    const renderExtracts = createRenderExtracts(matches, editingRoot);
    const editingBlocked = (match: IrExtractMatch) =>
        editingRoot ? isInsideMatch(match, editingRoot) : false;
    const decorations: DecorationItem[] = [];

    for (const match of matches) {
        if (editingBlocked(match)) {
            continue;
        }

        decorations.push({
            from: match.start,
            to: match.innerStart,
            decoration: Decoration.replace({}),
        });
        decorations.push({
            from: match.innerEnd,
            to: match.end,
            decoration: Decoration.replace({}),
        });
    }

    decorations
        .filter((item) => item.to > item.from)
        .sort((left, right) => left.from - right.from || left.to - right.to)
        .forEach((item) => builder.add(item.from, item.to, item.decoration));

    return { decorations: builder.finish(), renderExtracts };
}

function createDomRange(view: EditorView, from: number, to: number): Range | null {
    try {
        const start = view.domAtPos(from);
        const end = view.domAtPos(to);
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        return range;
    } catch {
        return null;
    }
}

function getRangeClientRects(view: EditorView, from: number, to: number): DOMRect[] {
    if (to > from) {
        const range = createDomRange(view, from, to);
        if (range) {
            const rects = Array.from(range.getClientRects()).filter(
                (rect) => rect.width > 0 && rect.height > 0,
            );
            range.detach();
            if (rects.length > 0) {
                return rects;
            }
        }
    }

    const coords = view.coordsAtPos(from);
    if (!coords) return [];
    return [
        new DOMRect(
            coords.left,
            coords.top,
            Math.max(1, coords.right - coords.left),
            coords.bottom - coords.top,
        ),
    ];
}

function measureExtractBlocks(
    view: EditorView,
    renderExtracts: RenderExtract[],
): MeasuredExtractBlock[] {
    const scrollRect = view.scrollDOM.getBoundingClientRect();
    const scrollLeft = view.scrollDOM.scrollLeft;
    const scrollTop = view.scrollDOM.scrollTop;
    const blocks: MeasuredExtractBlock[] = [];

    for (const renderExtract of renderExtracts) {
        const range = getIrExtractRenderRange(renderExtract);
        const rects = getRangeClientRects(view, range.from, range.to);
        if (rects.length === 0) continue;

        const minLeft = Math.min(...rects.map((rect) => rect.left));
        const maxRight = Math.max(...rects.map((rect) => rect.right));
        const minTop = Math.min(...rects.map((rect) => rect.top));
        const maxBottom = Math.max(...rects.map((rect) => rect.bottom));
        const inset = getIrExtractLayerInset(renderExtract.depth, renderExtract.maxDepth);

        blocks.push({
            left: minLeft - scrollRect.left + scrollLeft - inset,
            top: minTop - scrollRect.top + scrollTop - VERTICAL_INSET,
            width: maxRight - minLeft + inset * 2,
            height: maxBottom - minTop + VERTICAL_INSET * 2,
            depth: renderExtract.depth,
            maxDepth: renderExtract.maxDepth,
        });
    }

    return blocks;
}

function getDepthProgress(depth: number, maxDepth: number): number {
    if (maxDepth <= 1) return 0;
    return Math.max(0, Math.min(1, (depth - 1) / (maxDepth - 1)));
}

function renderOverlayBlocks(overlay: HTMLElement, blocks: MeasuredExtractBlock[]): void {
    const fragment = document.createDocumentFragment();
    for (const block of blocks) {
        const progress = getDepthProgress(block.depth, block.maxDepth);
        const element = document.createElement("div");
        element.className = "sr-ir-extract-block";
        element.style.left = `${block.left}px`;
        element.style.top = `${block.top}px`;
        element.style.width = `${block.width}px`;
        element.style.height = `${block.height}px`;
        element.style.setProperty("--sr-ir-border-alpha", String(0.12 + progress * 0.2));
        element.style.setProperty("--sr-ir-bg-alpha", String(0.02 + progress * 0.04));
        fragment.appendChild(element);
    }
    overlay.replaceChildren(fragment);
}

function createIrExtractDecorationPlugin(): Extension {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;
            private renderExtracts: RenderExtract[];
            private readonly overlay: HTMLElement;

            constructor(view: EditorView) {
                const state = buildIrExtractDecorations(view);
                this.decorations = state.decorations;
                this.renderExtracts = state.renderExtracts;
                this.overlay = document.createElement("div");
                this.overlay.className = "sr-ir-extract-overlay";
                view.scrollDOM.appendChild(this.overlay);
                this.scheduleMeasure(view);
            }

            update(update: ViewUpdate): void {
                if (
                    update.docChanged ||
                    update.viewportChanged ||
                    update.selectionSet ||
                    update.focusChanged
                ) {
                    const state = buildIrExtractDecorations(update.view);
                    this.decorations = state.decorations;
                    this.renderExtracts = state.renderExtracts;
                    this.scheduleMeasure(update.view);
                    return;
                }

                if (update.geometryChanged) {
                    this.scheduleMeasure(update.view);
                }
            }

            destroy(): void {
                this.overlay.remove();
            }

            private scheduleMeasure(view: EditorView): void {
                if (!isLivePreview(view) || this.renderExtracts.length === 0) {
                    this.overlay.replaceChildren();
                    return;
                }

                view.requestMeasure({
                    read: () => measureExtractBlocks(view, this.renderExtracts),
                    write: (blocks) => {
                        this.overlay.style.width = `${view.scrollDOM.scrollWidth}px`;
                        this.overlay.style.height = `${view.scrollDOM.scrollHeight}px`;
                        renderOverlayBlocks(this.overlay, blocks);
                    },
                });
            }
        },
        {
            decorations: (plugin) => plugin.decorations,
        },
    );
}

const irExtractDecorationTheme = EditorView.baseTheme({
    ".cm-scroller": {
        position: "relative",
    },
    ".cm-content": {
        position: "relative",
        zIndex: "2",
    },
    ".sr-ir-extract-overlay": {
        position: "absolute",
        top: "0",
        left: "0",
        pointerEvents: "none",
        overflow: "visible",
        zIndex: "1",
    },
    ".sr-ir-extract-block": {
        position: "absolute",
        boxSizing: "border-box",
        border: "1px solid rgba(var(--mono-rgb-100), var(--sr-ir-border-alpha, 0.16))",
        borderRadius: "4px",
        backgroundColor: "rgba(var(--mono-rgb-100), var(--sr-ir-bg-alpha, 0.02))",
    },
});

export function createIrExtractDecorationExtensions(_host: unknown = null): Extension[] {
    return [createIrExtractDecorationPlugin(), irExtractDecorationTheme];
}
