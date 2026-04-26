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
const MAX_VERTICAL_INSET = 8;

interface DecorationItem {
    from: number;
    to: number;
    decoration: Decoration;
    allowEmpty?: boolean;
}

export interface RenderExtract {
    match: IrExtractMatch;
    depth: number;
    maxDepth: number;
    showSource: boolean;
}

export interface MeasuredExtractBlock {
    start: number;
    parentStart?: number;
    left: number;
    top: number;
    width: number;
    height: number;
    depth: number;
    maxDepth: number;
}

interface PendingMeasuredExtractBlock {
    start: number;
    parentStart?: number;
    left: number;
    rawTop: number;
    rawBottom: number;
    width: number;
    verticalInset: number;
    depth: number;
    maxDepth: number;
}

export interface IrExtractVerticalInsetBlock {
    rawTop: number;
    rawBottom: number;
    depth: number;
    verticalInset: number;
}

export interface IrExtractWrappedHeading {
    level: number;
    lineFrom: number;
    markerFrom: number;
    markerTo: number;
    textFrom: number;
    textTo: number;
}

export type IrExtractWrappedBlockKind =
    | "heading"
    | "unordered-list"
    | "ordered-list"
    | "task-list"
    | "quote";

export interface IrExtractWrappedBlockPrefix {
    kind: IrExtractWrappedBlockKind;
    level?: number;
    lineFrom: number;
    markerFrom: number;
    markerTo: number;
    textFrom: number;
    textTo: number;
}

export interface IrExtractLineRange {
    from: number;
    to: number;
    line: number;
}

const ATX_HEADING_INNER_PREFIX = /^(#{1,6})[ \t]+/;
const WRAPPED_BLOCK_PREFIX =
    /^(#{1,6}[ \t]+|[-+*][ \t]+\[[ xX]\][ \t]+|[-+*][ \t]+|\d{1,9}[.)][ \t]+|>[ \t]*)/;
const NESTED_BLOCK_GAP = 1;

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

export function findIrExtractSourceMatches(
    text: string,
    matches: IrExtractMatch[],
    selectionFrom: number,
    selectionTo: number,
): IrExtractMatch[] {
    return matches
        .filter((match) => {
            if (selectionTouchesRange(selectionFrom, selectionTo, match.start, match.end)) {
                return true;
            }
            return getIrExtractLineRanges(text, match).some((line) =>
                selectionTouchesRange(selectionFrom, selectionTo, line.from, line.to),
            );
        })
        .sort((left, right) => left.start - right.start || right.end - left.end);
}

function distanceToRange(offset: number, rangeFrom: number, rangeTo: number): number {
    if (offset >= rangeFrom && offset <= rangeTo) {
        return 0;
    }
    return Math.min(Math.abs(offset - rangeFrom), Math.abs(offset - rangeTo));
}

export function findActiveIrExtractSourceMatch(
    text: string,
    matches: IrExtractMatch[],
    selectionFrom: number,
    selectionTo: number,
): IrExtractMatch | null {
    const candidates = findIrExtractSourceMatches(text, matches, selectionFrom, selectionTo);
    if (candidates.length === 0) {
        return null;
    }

    const byStart = new Map(matches.map((match) => [match.start, match]));
    const referenceOffset = selectionFrom === selectionTo
        ? selectionFrom
        : Math.floor((selectionFrom + selectionTo) / 2);

    return candidates.sort((left, right) => {
        const leftDirect = selectionTouchesRange(selectionFrom, selectionTo, left.start, left.end)
            ? 1
            : 0;
        const rightDirect = selectionTouchesRange(selectionFrom, selectionTo, right.start, right.end)
            ? 1
            : 0;
        if (leftDirect !== rightDirect) {
            return rightDirect - leftDirect;
        }

        const leftDepth = getDepthForMatch(left, byStart);
        const rightDepth = getDepthForMatch(right, byStart);
        if (leftDepth !== rightDepth) {
            return rightDepth - leftDepth;
        }

        const leftDistance = distanceToRange(referenceOffset, left.start, left.end);
        const rightDistance = distanceToRange(referenceOffset, right.start, right.end);
        if (leftDistance !== rightDistance) {
            return leftDistance - rightDistance;
        }

        return left.end - left.start - (right.end - right.start);
    })[0];
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

export function getIrExtractWrappedHeading(
    text: string,
    match: Pick<IrExtractMatch, "start" | "innerStart" | "innerEnd">,
): IrExtractWrappedHeading | null {
    const block = getIrExtractWrappedBlockPrefix(text, match);
    if (!block || block.kind !== "heading" || block.level === undefined) {
        return null;
    }
    return {
        level: block.level,
        lineFrom: block.lineFrom,
        markerFrom: block.markerFrom,
        markerTo: block.markerTo,
        textFrom: block.textFrom,
        textTo: block.textTo,
    };
}

export function getIrExtractWrappedBlockPrefix(
    text: string,
    match: Pick<IrExtractMatch, "start" | "innerStart" | "innerEnd">,
): IrExtractWrappedBlockPrefix | null {
    const line = getLineAtOffset(text, match.innerStart);
    const beforeExtract = text.slice(line.from, match.start);
    if (!/^[ \t]*$/.test(beforeExtract)) {
        return null;
    }

    const lineInner = text.slice(match.innerStart, Math.min(line.to, match.innerEnd));
    const prefixMatch = lineInner.match(WRAPPED_BLOCK_PREFIX);
    if (!prefixMatch) {
        return null;
    }

    const markerFrom = match.innerStart;
    const markerTo = markerFrom + prefixMatch[0].length;
    const kind = getWrappedBlockKind(prefixMatch[0]);
    return {
        kind,
        level: kind === "heading" ? lineInner.match(ATX_HEADING_INNER_PREFIX)?.[1].length : undefined,
        lineFrom: line.from,
        markerFrom,
        markerTo,
        textFrom: markerTo,
        textTo: Math.min(line.to, match.innerEnd),
    };
}

function getWrappedBlockKind(prefix: string): IrExtractWrappedBlockKind {
    if (/^#{1,6}[ \t]+/.test(prefix)) {
        return "heading";
    }
    if (/^[-+*][ \t]+\[[ xX]\][ \t]+/.test(prefix)) {
        return "task-list";
    }
    if (/^[-+*][ \t]+/.test(prefix)) {
        return "unordered-list";
    }
    if (/^\d{1,9}[.)][ \t]+/.test(prefix)) {
        return "ordered-list";
    }
    return "quote";
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
    sourceStarts: Set<number>,
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
            showSource: sourceStarts.has(match.start),
        };
    });
}

export function getIrExtractRenderRange(renderExtract: RenderExtract): { from: number; to: number } {
    return renderExtract.showSource
        ? { from: renderExtract.match.start, to: renderExtract.match.end }
        : { from: renderExtract.match.innerStart, to: renderExtract.match.innerEnd };
}

export function getIrExtractVerticalInsetForMetrics(
    lineHeight: number,
    rowHeights: number[],
): number {
    const tallestRow = Math.max(...rowHeights, 0);
    const cssBreathingInset = Math.max(0, (lineHeight - tallestRow) / 2);
    return Number(Math.min(MAX_VERTICAL_INSET, cssBreathingInset).toFixed(2));
}

export function getIrExtractLayerVerticalInset(
    baseInset: number,
    depth: number,
    maxDepth: number,
): number {
    const safeBaseInset = Math.max(0, baseInset);
    const safeDepth = Math.max(1, depth);
    const safeMaxDepth = Math.max(safeDepth, maxDepth, 1);
    if (safeMaxDepth <= 1) {
        return Number(safeBaseInset.toFixed(2));
    }
    const step = safeBaseInset / safeMaxDepth;
    return Number(Math.max(0, safeBaseInset - step * (safeDepth - 1)).toFixed(2));
}

export function clampIrExtractVerticalInsetsForAdjacentBlocks(
    blocks: IrExtractVerticalInsetBlock[],
): number[] {
    const nextInsets = blocks.map((block) => Math.max(0, block.verticalInset));

    for (let leftIndex = 0; leftIndex < blocks.length; leftIndex++) {
        for (let rightIndex = leftIndex + 1; rightIndex < blocks.length; rightIndex++) {
            const left = blocks[leftIndex];
            const right = blocks[rightIndex];
            if (left.depth !== right.depth) {
                continue;
            }

            let gap: number | null = null;
            if (left.rawBottom <= right.rawTop) {
                gap = right.rawTop - left.rawBottom;
            } else if (right.rawBottom <= left.rawTop) {
                gap = left.rawTop - right.rawBottom;
            }

            if (gap === null) {
                continue;
            }

            const maxInset = Math.max(0, gap / 2);
            nextInsets[leftIndex] = Math.min(nextInsets[leftIndex], maxInset);
            nextInsets[rightIndex] = Math.min(nextInsets[rightIndex], maxInset);
        }
    }

    return nextInsets.map((inset) => Number(inset.toFixed(2)));
}

export function containNestedIrExtractBlocks<T extends MeasuredExtractBlock>(blocks: T[]): T[] {
    const nextBlocks = blocks.map((block) => ({ ...block }));
    const byStart = new Map(nextBlocks.map((block) => [block.start, block]));
    const childrenFirst = [...nextBlocks].sort((left, right) => right.depth - left.depth);

    for (const child of childrenFirst) {
        if (child.parentStart === undefined) {
            continue;
        }
        const parent = byStart.get(child.parentStart);
        if (!parent) {
            continue;
        }

        const parentRight = parent.left + parent.width;
        const parentBottom = parent.top + parent.height;
        const childRight = child.left + child.width;
        const childBottom = child.top + child.height;
        const nextLeft = Math.min(parent.left, child.left - NESTED_BLOCK_GAP);
        const nextTop = Math.min(parent.top, child.top - NESTED_BLOCK_GAP);
        const nextRight = Math.max(parentRight, childRight + NESTED_BLOCK_GAP);
        const nextBottom = Math.max(parentBottom, childBottom + NESTED_BLOCK_GAP);

        parent.left = Number(nextLeft.toFixed(2));
        parent.top = Number(nextTop.toFixed(2));
        parent.width = Number((nextRight - nextLeft).toFixed(2));
        parent.height = Number((nextBottom - nextTop).toFixed(2));
    }

    return nextBlocks;
}

export function alignNestedIrExtractBlocksHorizontally<T extends MeasuredExtractBlock>(
    blocks: T[],
): T[] {
    const nextBlocks = blocks.map((block) => ({ ...block }));
    const byStart = new Map(nextBlocks.map((block) => [block.start, block]));
    const parentsFirst = [...nextBlocks].sort((left, right) => left.depth - right.depth);

    for (const child of parentsFirst) {
        if (child.parentStart === undefined) {
            continue;
        }
        const parent = byStart.get(child.parentStart);
        if (!parent) {
            continue;
        }

        const maxDepth = Math.max(parent.maxDepth, child.maxDepth, parent.depth, child.depth);
        const parentInset = getIrExtractLayerInset(parent.depth, maxDepth);
        const childInset = getIrExtractLayerInset(child.depth, maxDepth);
        const stairGap = Math.max(0, parentInset - childInset);
        const nextLeft = parent.left + stairGap;
        const nextRight = parent.left + parent.width - stairGap;
        const nextWidth = nextRight - nextLeft;
        if (nextWidth <= 1) {
            continue;
        }

        child.left = Number(nextLeft.toFixed(2));
        child.width = Number(nextWidth.toFixed(2));
    }

    return nextBlocks;
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
    const sourceStarts = new Set(
        findIrExtractSourceMatches(text, matches, selection.from, selection.to).map(
            (match) => match.start,
        ),
    );
    const activeSourceMatch = findActiveIrExtractSourceMatch(
        text,
        matches,
        selection.from,
        selection.to,
    );
    const renderExtracts = createRenderExtracts(matches, sourceStarts);
    const decorations: DecorationItem[] = [];

    for (const match of matches) {
        if (sourceStarts.has(match.start)) {
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

        for (const item of createWrappedBlockPrefixDecorations(text, match)) {
            decorations.push(item);
        }
    }

    if (activeSourceMatch && sourceStarts.has(activeSourceMatch.start)) {
        decorations.push({
            from: activeSourceMatch.start,
            to: activeSourceMatch.innerStart,
            decoration: Decoration.mark({ class: "sr-ir-extract-active-token" }),
        });
        decorations.push({
            from: activeSourceMatch.innerEnd,
            to: activeSourceMatch.end,
            decoration: Decoration.mark({ class: "sr-ir-extract-active-token" }),
        });
    }

    decorations
        .filter((item) => item.to > item.from || item.allowEmpty)
        .sort((left, right) => left.from - right.from || left.to - right.to)
        .forEach((item) => builder.add(item.from, item.to, item.decoration));

    return { decorations: builder.finish(), renderExtracts };
}

function createWrappedBlockPrefixDecorations(
    text: string,
    match: Pick<IrExtractMatch, "start" | "innerStart" | "innerEnd">,
): DecorationItem[] {
    const block = getIrExtractWrappedBlockPrefix(text, match);
    if (!block) {
        return [];
    }

    const lineClass = getWrappedBlockLineClass(block);
    const markerClass = getWrappedBlockMarkerClass(block);
    const textClass = getWrappedBlockTextClass(block);
    const decorations: DecorationItem[] = [
        {
            from: block.lineFrom,
            to: block.lineFrom,
            decoration: Decoration.line({ class: lineClass }),
            allowEmpty: true,
        },
    ];

    if (block.kind === "heading") {
        decorations.push({
            from: block.markerFrom,
            to: block.markerTo,
            decoration: Decoration.replace({}),
        });
    } else {
        decorations.push({
            from: block.markerFrom,
            to: block.markerTo,
            decoration: Decoration.mark({ class: markerClass }),
        });
    }

    decorations.push({
        from: block.textFrom,
        to: block.textTo,
        decoration: Decoration.mark({ class: textClass }),
    });

    return decorations;
}

function getWrappedBlockLineClass(block: IrExtractWrappedBlockPrefix): string {
    if (block.kind === "heading") {
        return `HyperMD-header HyperMD-header-${block.level ?? 1} sr-ir-extract-heading-line`;
    }
    if (block.kind === "quote") {
        return "HyperMD-quote sr-ir-extract-blockquote-line";
    }
    return "HyperMD-list-line HyperMD-list-line-1 sr-ir-extract-list-line";
}

function getWrappedBlockMarkerClass(block: IrExtractWrappedBlockPrefix): string {
    if (block.kind === "ordered-list") {
        return "cm-formatting cm-formatting-list cm-formatting-list-ol cm-list-1";
    }
    if (block.kind === "quote") {
        return "cm-formatting cm-formatting-quote cm-quote";
    }
    return "cm-formatting cm-formatting-list cm-formatting-list-ul cm-list-1";
}

function getWrappedBlockTextClass(block: IrExtractWrappedBlockPrefix): string {
    if (block.kind === "heading") {
        return `cm-header cm-header-${block.level ?? 1}`;
    }
    if (block.kind === "quote") {
        return "cm-quote";
    }
    return "cm-list-1";
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

function parseCssPixelValue(value: string): number | null {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getEditorLineHeight(view: EditorView): number {
    if (Number.isFinite(view.defaultLineHeight) && view.defaultLineHeight > 0) {
        return view.defaultLineHeight;
    }

    const computed = getComputedStyle(view.contentDOM);
    const lineHeight = parseCssPixelValue(computed.lineHeight);
    if (lineHeight !== null) {
        return lineHeight;
    }

    const fontSize = parseCssPixelValue(computed.fontSize);
    return fontSize === null ? 0 : fontSize * 1.5;
}

function rectsOverlapVertically(left: DOMRect, right: DOMRect): boolean {
    return left.top < right.bottom && left.bottom > right.top;
}

function mergeRectsByVisualLine(rects: DOMRect[]): DOMRect[] {
    const sorted = [...rects].sort((left, right) => left.top - right.top || left.left - right.left);
    const rows: DOMRect[] = [];
    for (const rect of sorted) {
        const row = rows.find((candidate) => rectsOverlapVertically(candidate, rect));
        if (!row) {
            rows.push(
                new DOMRect(rect.left, rect.top, rect.width, Math.max(1, rect.height)),
            );
            continue;
        }

        const left = Math.min(row.left, rect.left);
        const right = Math.max(row.right, rect.right);
        const top = Math.min(row.top, rect.top);
        const bottom = Math.max(row.bottom, rect.bottom);
        row.x = left;
        row.y = top;
        row.width = Math.max(1, right - left);
        row.height = Math.max(1, bottom - top);
    }
    return rows;
}

function getVisualLineClientRectsForRange(
    view: EditorView,
    text: string,
    from: number,
    to: number,
): DOMRect[] {
    const targetRows = mergeRectsByVisualLine(getRangeClientRects(view, from, to));
    if (targetRows.length === 0) {
        return [];
    }

    const lineRows = mergeRectsByVisualLine(
        getIrExtractLineRanges(text, { innerStart: from, innerEnd: to }).flatMap((line) =>
            getRangeClientRects(view, line.from, line.to),
        ),
    );
    const touchedRows = lineRows.filter((lineRow) =>
        targetRows.some((targetRow) => rectsOverlapVertically(lineRow, targetRow)),
    );
    return touchedRows.length > 0 ? touchedRows : targetRows;
}

function measureExtractBlocks(
    view: EditorView,
    renderExtracts: RenderExtract[],
): MeasuredExtractBlock[] {
    const text = view.state.doc.toString();
    const scrollRect = view.scrollDOM.getBoundingClientRect();
    const scrollLeft = view.scrollDOM.scrollLeft;
    const scrollTop = view.scrollDOM.scrollTop;
    const lineHeight = getEditorLineHeight(view);
    const pendingBlocks: PendingMeasuredExtractBlock[] = [];

    for (const renderExtract of renderExtracts) {
        const range = getIrExtractRenderRange(renderExtract);
        const rects = getVisualLineClientRectsForRange(view, text, range.from, range.to);
        if (rects.length === 0) continue;

        const minLeft = Math.min(...rects.map((rect) => rect.left));
        const maxRight = Math.max(...rects.map((rect) => rect.right));
        const minTop = Math.min(...rects.map((rect) => rect.top));
        const maxBottom = Math.max(...rects.map((rect) => rect.bottom));
        const inset = getIrExtractLayerInset(renderExtract.depth, renderExtract.maxDepth);
        const baseVerticalInset = getIrExtractVerticalInsetForMetrics(
            lineHeight,
            rects.map((rect) => rect.height),
        );
        const verticalInset = getIrExtractLayerVerticalInset(
            baseVerticalInset,
            renderExtract.depth,
            renderExtract.maxDepth,
        );

        pendingBlocks.push({
            start: renderExtract.match.start,
            parentStart: renderExtract.match.parentStart,
            left: minLeft - scrollRect.left + scrollLeft - inset,
            rawTop: minTop - scrollRect.top + scrollTop,
            rawBottom: maxBottom - scrollRect.top + scrollTop,
            width: maxRight - minLeft + inset * 2,
            verticalInset,
            depth: renderExtract.depth,
            maxDepth: renderExtract.maxDepth,
        });
    }

    const verticalInsets = clampIrExtractVerticalInsetsForAdjacentBlocks(
        pendingBlocks.map((block) => ({
            rawTop: block.rawTop,
            rawBottom: block.rawBottom,
            depth: block.depth,
            verticalInset: block.verticalInset,
        })),
    );

    const measuredBlocks = pendingBlocks.map((block, index) => {
        const verticalInset = verticalInsets[index] ?? 0;
        return {
            start: block.start,
            parentStart: block.parentStart,
            left: block.left,
            top: block.rawTop - verticalInset,
            width: block.width,
            height: block.rawBottom - block.rawTop + verticalInset * 2,
            depth: block.depth,
            maxDepth: block.maxDepth,
        };
    });

    return containNestedIrExtractBlocks(alignNestedIrExtractBlocksHorizontally(measuredBlocks));
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
        element.style.setProperty("--sr-ir-border-alpha", String(0.07 + progress * 0.08));
        element.style.setProperty("--sr-ir-bg-alpha", String(0.006 + progress * 0.014));
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
        border: "1px solid rgba(var(--mono-rgb-100), var(--sr-ir-border-alpha, 0.1))",
        borderRadius: "4px",
        backgroundColor: "rgba(var(--mono-rgb-100), var(--sr-ir-bg-alpha, 0.008))",
    },
    ".sr-ir-extract-active-token": {
        color: "var(--interactive-accent)",
        fontWeight: "600",
    },
});

export function createIrExtractDecorationExtensions(_host: unknown = null): Extension[] {
    return [createIrExtractDecorationPlugin(), irExtractDecorationTheme];
}
