import { RangeSetBuilder, StateEffect, type Extension } from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    type ViewUpdate,
} from "@codemirror/view";
import { setExtractContextRangesEffect } from "src/editor/extract-context-decoration";
import { parseIrExtracts, type IrExtractMatch } from "src/util/irExtractParser";

const OUTER_INSET = 18;
const INNER_INSET = 6;
const MAX_VERTICAL_INSET = 8;
const INNERMOST_CONTAINER_OUTSET = 6;
const INFO_ICON_STACK_STEP = 24;
const INFO_ICON_BASE_RIGHT = 24;
const INFO_ICON_SIZE = 20;
const INFO_ICON_TOP = -10;
const INFO_ICON_VISUAL_ROW_TOLERANCE = 12;
const NOTE_TOOLTIP_VIEWPORT_PADDING = 12;
const NOTE_TOOLTIP_GAP = 10;
const NOTE_TOOLTIP_FALLBACK_HEIGHT = 120;
const NOTE_TOOLTIP_FALLBACK_WIDTH = 240;
const NOTE_TOOLTIP_ARROW_SIZE = 8;
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

export interface IrExtractDecorationOptions {
    canRevealSource?: (view: EditorView) => boolean;
    isLivePreviewHost?: (view: EditorView) => boolean;
    getExcludedStarts?: (view: EditorView) => ReadonlySet<number>;
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
    topInset: number;
    bottomInset: number;
    depth: number;
    maxDepth: number;
}

interface IrExtractMeasureReadResult {
    overlayBlocks: MeasuredExtractBlock[];
    pointSourceStarts: number[];
    cursorBlockStart: number | null;
    selectionFrom: number;
    selectionTo: number;
}

export interface IrExtractInfoTooltipHandlers {
    onPinTooltip: (blockStart: number) => void;
    onTooltipHoverStart: (blockStart: number) => void;
    onTooltipHoverEnd: (blockStart: number) => void;
}

export interface IrExtractNoteTooltipOptions {
    onSubmit?: () => void;
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
const irExtractPointSourceStartsEffect = StateEffect.define<number[]>();

function isLivePreview(view: EditorView, options: IrExtractDecorationOptions = {}): boolean {
    return !!view.dom.closest(".is-live-preview") || options.isLivePreviewHost?.(view) === true;
}

function canRevealIrExtractSource(
    view: EditorView,
    options: IrExtractDecorationOptions = {},
): boolean {
    return options.canRevealSource?.(view) ?? true;
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
        return containing.sort(
            (left, right) => left.end - left.start - (right.end - right.start),
        )[0];
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

function findIrExtractDirectSourceMatches(
    matches: IrExtractMatch[],
    selectionFrom: number,
    selectionTo: number,
): IrExtractMatch[] {
    return matches
        .filter((match) =>
            selectionTouchesRange(selectionFrom, selectionTo, match.start, match.end),
        )
        .sort((left, right) => left.start - right.start || right.end - left.end);
}

export function findIrExtractSourceMatchesAtPoint(
    matches: IrExtractMatch[],
    blocks: Pick<MeasuredExtractBlock, "start" | "left" | "top" | "width" | "height">[],
    x: number,
    y: number,
): IrExtractMatch[] {
    const byStart = new Map(matches.map((match) => [match.start, match]));
    return blocks
        .filter(
            (block) =>
                x >= block.left &&
                x <= block.left + block.width &&
                y >= block.top &&
                y <= block.top + block.height,
        )
        .map((block) => byStart.get(block.start))
        .filter((match): match is IrExtractMatch => match !== undefined)
        .sort((left, right) => left.start - right.start || right.end - left.end);
}

function distanceToRange(offset: number, rangeFrom: number, rangeTo: number): number {
    if (offset >= rangeFrom && offset <= rangeTo) {
        return 0;
    }
    return Math.min(Math.abs(offset - rangeFrom), Math.abs(offset - rangeTo));
}

export function findActiveIrExtractSourceMatch(
    _text: string,
    matches: IrExtractMatch[],
    selectionFrom: number,
    selectionTo: number,
): IrExtractMatch | null {
    const candidates = findIrExtractDirectSourceMatches(matches, selectionFrom, selectionTo);
    return pickActiveIrExtractSourceMatch(matches, candidates, selectionFrom, selectionTo);
}

function pickActiveIrExtractSourceMatch(
    matches: IrExtractMatch[],
    candidates: IrExtractMatch[],
    selectionFrom: number,
    selectionTo: number,
): IrExtractMatch | null {
    if (candidates.length === 0) {
        return null;
    }

    const byStart = new Map(matches.map((match) => [match.start, match]));
    const referenceOffset =
        selectionFrom === selectionTo
            ? selectionFrom
            : Math.floor((selectionFrom + selectionTo) / 2);

    return candidates.sort((left, right) => {
        const leftDirect = selectionTouchesRange(selectionFrom, selectionTo, left.start, left.end)
            ? 1
            : 0;
        const rightDirect = selectionTouchesRange(
            selectionFrom,
            selectionTo,
            right.start,
            right.end,
        )
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
        level:
            kind === "heading" ? lineInner.match(ATX_HEADING_INNER_PREFIX)?.[1].length : undefined,
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
    excludedStarts: ReadonlySet<number> = new Set(),
): RenderExtract[] {
    const visibleMatches = matches.filter((match) => !excludedStarts.has(match.start));
    const byStart = new Map(visibleMatches.map((match) => [match.start, match]));
    const depths = new Map<IrExtractMatch, number>();
    const rootStarts = new Map<IrExtractMatch, number>();
    const maxDepthByRoot = new Map<number, number>();

    for (const match of visibleMatches) {
        const depth = getDepthForMatch(match, byStart);
        const rootStart = getRootStartForMatch(match, byStart);
        depths.set(match, depth);
        rootStarts.set(match, rootStart);
        maxDepthByRoot.set(rootStart, Math.max(maxDepthByRoot.get(rootStart) ?? 1, depth));
    }

    return visibleMatches.map((match) => {
        const rootStart = rootStarts.get(match) ?? match.start;
        return {
            match,
            depth: depths.get(match) ?? 1,
            maxDepth: maxDepthByRoot.get(rootStart) ?? 1,
            showSource: sourceStarts.has(match.start),
        };
    });
}

export function buildIrExtractRenderExtractsForTest(
    _text: string,
    matches: IrExtractMatch[],
    options: {
        excludedStarts?: ReadonlySet<number>;
        revealSource?: boolean;
        sourceStarts?: ReadonlySet<number>;
    } = {},
): Array<{ start: number; parentStart?: number; showSource: boolean }> {
    const sourceStarts = options.revealSource === false ? new Set<number>() : options.sourceStarts;
    return createRenderExtracts(matches, new Set(sourceStarts), options.excludedStarts).map(
        (renderExtract) => ({
            start: renderExtract.match.start,
            parentStart: renderExtract.match.parentStart,
            showSource: renderExtract.showSource,
        }),
    );
}

export function getIrExtractRenderRange(renderExtract: RenderExtract): {
    from: number;
    to: number;
} {
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

export function getIrExtractHorizontalFrameForMetrics(
    containerLeft: number,
    containerRight: number,
    scrollRectLeft: number,
    scrollLeft: number,
): { left: number; width: number } {
    return {
        left: containerLeft - scrollRectLeft + scrollLeft,
        width: Math.max(1, containerRight - containerLeft),
    };
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
    for (const block of nextBlocks) {
        const maxDepth = Math.max(block.maxDepth, block.depth, 1);
        const innerInset = getIrExtractLayerInset(maxDepth, maxDepth);
        const currentInset = getIrExtractLayerInset(block.depth, maxDepth);
        const expansion = Math.max(0, currentInset - innerInset + INNERMOST_CONTAINER_OUTSET);

        block.left = Number((block.left - expansion).toFixed(2));
        block.width = Number((block.width + expansion * 2).toFixed(2));
    }

    return nextBlocks;
}

function uniqueIrExtractMatchesByStart(matches: IrExtractMatch[]): IrExtractMatch[] {
    const seen = new Set<number>();
    const uniqueMatches: IrExtractMatch[] = [];
    for (const match of matches) {
        if (seen.has(match.start)) {
            continue;
        }
        seen.add(match.start);
        uniqueMatches.push(match);
    }
    return uniqueMatches;
}

function getSelectionPointInScrollCoordinates(
    view: EditorView,
    selection: { from: number; to: number; head?: number },
): { x: number; y: number } | null {
    if (!canMeasureDomRanges()) {
        return null;
    }

    const position = selection.from === selection.to ? selection.from : (selection.head ?? selection.to);
    const coords = view.coordsAtPos(position);
    if (!coords) {
        return null;
    }

    const scrollRect = view.scrollDOM.getBoundingClientRect();
    return {
        x: (coords.left + coords.right) / 2 - scrollRect.left + view.scrollDOM.scrollLeft,
        y: (coords.top + coords.bottom) / 2 - scrollRect.top + view.scrollDOM.scrollTop,
    };
}

export function findIrExtractSourceStartsAtSelectionPoint(
    matches: IrExtractMatch[],
    _selection: { from: number; to: number },
    blocks: Pick<MeasuredExtractBlock, "start" | "left" | "top" | "width" | "height">[],
    point: { x: number; y: number } | null,
): number[] {
    if (!point) {
        return [];
    }
    return findIrExtractSourceMatchesAtPoint(matches, blocks, point.x, point.y).map(
        (match) => match.start,
    );
}

function areNumberSetsEqual(left: Set<number>, right: Set<number>): boolean {
    if (left.size !== right.size) {
        return false;
    }
    for (const value of left) {
        if (!right.has(value)) {
            return false;
        }
    }
    return true;
}

function getIrExtractDepthProgress(depth: number, maxDepth: number): number {
    if (maxDepth <= 1) return 0;
    return Math.max(0, Math.min(1, (depth - 1) / (maxDepth - 1)));
}

function buildIrExtractDecorations(
    view: EditorView,
    pointSourceStarts: Set<number> = new Set(),
    options: IrExtractDecorationOptions = {},
): {
    decorations: DecorationSet;
    renderExtracts: RenderExtract[];
} {
    const builder = new RangeSetBuilder<Decoration>();
    if (!isLivePreview(view, options)) {
        return { decorations: builder.finish(), renderExtracts: [] };
    }

    const text = view.state.doc.toString();
    const excludedStarts = options.getExcludedStarts?.(view) ?? new Set<number>();
    const matches = parseIrExtracts(text);
    const visibleMatches = matches.filter((match) => !excludedStarts.has(match.start));
    const selection = view.state.selection.main;
    const sourceRevealEnabled = canRevealIrExtractSource(view, options);
    const lineSourceMatches = sourceRevealEnabled
        ? findIrExtractSourceMatches(text, visibleMatches, selection.from, selection.to)
        : [];
    const activeDirectSourceMatches = sourceRevealEnabled
        ? findIrExtractDirectSourceMatches(visibleMatches, selection.from, selection.to)
        : [];
    const pointSourceMatches = sourceRevealEnabled
        ? visibleMatches.filter((match) => pointSourceStarts.has(match.start))
        : [];
    const sourceMatches = uniqueIrExtractMatchesByStart(
        lineSourceMatches.sort((left, right) => left.start - right.start || right.end - left.end),
    );
    const activeSourceMatches = uniqueIrExtractMatchesByStart(
        [...activeDirectSourceMatches, ...pointSourceMatches].sort(
            (left, right) => left.start - right.start || right.end - left.end,
        ),
    );
    const sourceStarts = new Set(sourceMatches.map((match) => match.start));
    const activeSourceMatch = sourceRevealEnabled
        ? pickActiveIrExtractSourceMatch(
              visibleMatches,
              activeSourceMatches,
              selection.from,
              selection.to,
          )
        : null;
    const renderExtracts = createRenderExtracts(matches, sourceStarts, excludedStarts);
    const decorations: DecorationItem[] = [];

    for (const match of visibleMatches) {
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

function canMeasureDomRanges(): boolean {
    try {
        const range = document.createRange();
        const supported = typeof range.getClientRects === "function";
        range.detach();
        return supported;
    } catch {
        return false;
    }
}

function getRangeClientRects(view: EditorView, from: number, to: number): DOMRect[] {
    if (!canMeasureDomRanges()) {
        return [];
    }

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
            rows.push(new DOMRect(rect.left, rect.top, rect.width, Math.max(1, rect.height)));
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
    const contentRect = view.contentDOM.getBoundingClientRect();
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
        const frameLeft = contentRect.width > 0 ? contentRect.left : minLeft;
        const frameRight = contentRect.width > 0 ? contentRect.right : maxRight;
        const minTop = Math.min(...rects.map((rect) => rect.top));
        const maxBottom = Math.max(...rects.map((rect) => rect.bottom));
        const horizontalFrame = getIrExtractHorizontalFrameForMetrics(
            frameLeft,
            frameRight,
            scrollRect.left,
            scrollLeft,
        );
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
            left: horizontalFrame.left,
            rawTop: minTop - scrollRect.top + scrollTop,
            rawBottom: maxBottom - scrollRect.top + scrollTop,
            width: horizontalFrame.width,
            topInset: verticalInset,
            bottomInset: verticalInset,
            depth: renderExtract.depth,
            maxDepth: renderExtract.maxDepth,
        });
    }

    const measuredBlocks = pendingBlocks.map((block) => ({
        start: block.start,
        parentStart: block.parentStart,
        left: block.left,
        top: block.rawTop - block.topInset,
        width: block.width,
        height: block.rawBottom - block.rawTop + block.topInset + block.bottomInset,
        depth: block.depth,
        maxDepth: block.maxDepth,
    }));

    return containNestedIrExtractBlocks(alignNestedIrExtractBlocksHorizontally(measuredBlocks));
}

function getDepthProgress(depth: number, maxDepth: number): number {
    return getIrExtractDepthProgress(depth, maxDepth);
}

function resizeIrExtractTextarea(textarea: HTMLTextAreaElement): void {
    textarea.setCssProps({ "--sr-ir-note-textarea-height": "auto" });
    textarea.setCssProps({ "--sr-ir-note-textarea-height": `${textarea.scrollHeight}px` });
}

function createInfoIconSvg(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "10");

    const verticalPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    verticalPath.setAttribute("d", "M12 16v-4");

    const dotPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    dotPath.setAttribute("d", "M12 8h.01");

    svg.append(circle, verticalPath, dotPath);
    return svg;
}

export function createIrExtractBlockElement(
    blockStart: number,
    handlers: IrExtractInfoTooltipHandlers,
): HTMLElement {
    const element = document.createElement("div");
    element.className = "sr-ir-extract-block";
    element.dataset.srIrExtractStart = String(blockStart);

    const action = document.createElement("div");
    action.className = "sr-ir-info-action";
    action.setAttribute("role", "button");
    action.setAttribute("tabindex", "0");
    action.appendChild(createInfoIconSvg());

    const pinTooltip = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        handlers.onPinTooltip(blockStart);
    };
    const showTooltip = () => {
        handlers.onTooltipHoverStart(blockStart);
    };
    const hideTooltip = () => {
        handlers.onTooltipHoverEnd(blockStart);
    };
    const stopOverlayEvent = (event: Event) => {
        event.stopPropagation();
    };

    action.addEventListener("mouseenter", showTooltip);
    action.addEventListener("mouseleave", hideTooltip);
    action.addEventListener("pointerdown", pinTooltip);
    action.addEventListener("mousedown", stopOverlayEvent);
    action.addEventListener("click", stopOverlayEvent);
    action.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        pinTooltip(event);
    });

    element.appendChild(action);
    return element;
}

export function createIrExtractNoteTooltipElement(
    options: IrExtractNoteTooltipOptions = {},
): HTMLElement {
    const tooltip = document.createElement("div");
    tooltip.className = "sr-note-path-tooltip sr-ir-note-tooltip is-below";
    tooltip.setAttribute("role", "tooltip");

    const textarea = document.createElement("textarea");
    textarea.className = "sr-ir-note-tooltip-input";
    textarea.rows = 1;
    textarea.placeholder = "输入备注...";
    textarea.title = "";

    const stopOverlayEvent = (event: Event) => {
        event.stopPropagation();
    };

    tooltip.addEventListener("pointerdown", stopOverlayEvent);
    tooltip.addEventListener("mousedown", stopOverlayEvent);
    tooltip.addEventListener("click", stopOverlayEvent);
    tooltip.addEventListener("keydown", stopOverlayEvent);

    textarea.addEventListener("input", () => resizeIrExtractTextarea(textarea));
    textarea.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        options.onSubmit?.();
    });

    tooltip.appendChild(textarea);
    return tooltip;
}

function renderOverlayBlocks(
    overlay: HTMLElement,
    blocks: MeasuredExtractBlock[],
    blockDomCache: Map<number, HTMLElement>,
    handlers: IrExtractInfoTooltipHandlers,
): void {
    const nextKeys = new Set<number>();

    for (const block of blocks) {
        const progress = getDepthProgress(block.depth, block.maxDepth);
        nextKeys.add(block.start);

        let element = blockDomCache.get(block.start);
        if (!element) {
            element = createIrExtractBlockElement(block.start, handlers);
            blockDomCache.set(block.start, element);
            overlay.appendChild(element);
        } else if (element.parentElement !== overlay) {
            overlay.appendChild(element);
        }

        element.style.left = `${block.left}px`;
        element.style.top = `${block.top}px`;
        element.style.width = `${block.width}px`;
        element.style.height = `${block.height}px`;
        element.style.setProperty("--sr-ir-border-alpha", String(0.07 + progress * 0.08));
        element.style.setProperty("--sr-ir-bg-alpha", String(0.006 + progress * 0.014));
    }

    for (const [key, element] of blockDomCache) {
        if (nextKeys.has(key)) {
            continue;
        }
        element.remove();
        blockDomCache.delete(key);
    }
}

function getMousePointInScrollCoordinates(
    scrollDOM: HTMLElement,
    event: MouseEvent,
): { x: number; y: number } {
    const scrollRect = scrollDOM.getBoundingClientRect();
    return {
        x: event.clientX - scrollRect.left + scrollDOM.scrollLeft,
        y: event.clientY - scrollRect.top + scrollDOM.scrollTop,
    };
}

function findHoveredIrExtractBlockStart(
    blocks: Map<number, MeasuredExtractBlock>,
    x: number,
    y: number,
): number | null {
    const sortedBlocks = [...blocks.values()].sort(
        (left, right) => right.depth - left.depth || right.start - left.start,
    );

    for (const block of sortedBlocks) {
        if (
            x >= block.left &&
            x <= block.left + block.width &&
            y >= block.top &&
            y <= block.top + block.height
        ) {
            return block.start;
        }
    }

    return null;
}

export function getIrExtractInfoVisibleStarts(
    blocks: ReadonlyMap<number, MeasuredExtractBlock>,
    hoveredBlockStart: number | null,
    cursorBlockStart: number | null,
    openBlockStart: number | null,
): Set<number> {
    const starts = new Set<number>();
    const addAncestorChain = (start: number | null): void => {
        let currentStart = start;
        while (currentStart !== null) {
            const block = blocks.get(currentStart);
            if (!block || starts.has(currentStart)) {
                break;
            }
            starts.add(currentStart);
            currentStart = block.parentStart ?? null;
        }
    };

    addAncestorChain(hoveredBlockStart);
    addAncestorChain(cursorBlockStart);
    addAncestorChain(openBlockStart);
    return starts;
}

export function isIrExtractNoteTooltipVisible(
    blockStart: number,
    hoveredTooltipStart: number | null,
    pinnedTooltipStart: number | null,
): boolean {
    return blockStart === hoveredTooltipStart || blockStart === pinnedTooltipStart;
}

export function getIrExtractInfoState(
    blockStart: number,
    visibleStarts: ReadonlySet<number>,
    notedStarts: ReadonlySet<number>,
): { visible: boolean; hasNote: boolean } {
    const hasNote = notedStarts.has(blockStart);
    return {
        visible: hasNote || visibleStarts.has(blockStart),
        hasNote,
    };
}

export function findIrExtractInfoActionStartAtClientPoint(
    blockDomCache: ReadonlyMap<number, HTMLElement>,
    clientX: number,
    clientY: number,
): number | null {
    for (const [blockStart, element] of blockDomCache) {
        const action = element.querySelector<HTMLElement>(".sr-ir-info-action");
        if (!action?.classList.contains("is-visible") && !action?.classList.contains("is-editing")) {
            continue;
        }
        const rect = action.getBoundingClientRect();
        if (
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom
        ) {
            return blockStart;
        }
    }
    return null;
}

export function syncIrExtractInfoCursorAtClientPoint(
    scrollDOM: HTMLElement,
    blockDomCache: ReadonlyMap<number, HTMLElement>,
    clientX: number,
    clientY: number,
): boolean {
    const isOverInfo =
        findIrExtractInfoActionStartAtClientPoint(blockDomCache, clientX, clientY) !== null;
    scrollDOM.classList.toggle("sr-ir-info-cursor-pointer", isOverInfo);
    scrollDOM.setCssProps({ cursor: isOverInfo ? "pointer" : "" });
    return isOverInfo;
}

export interface IrExtractNoteTooltipPlacementMetrics {
    actionTop: number;
    actionBottom: number;
    tooltipHeight: number;
    viewportHeight: number;
    viewportPadding: number;
    gap: number;
}

export function getIrExtractNoteTooltipPlacement(
    metrics: IrExtractNoteTooltipPlacementMetrics,
): "above" | "below" {
    const aboveTop = metrics.actionTop - metrics.tooltipHeight - metrics.gap;
    if (aboveTop >= metrics.viewportPadding) {
        return "above";
    }

    return "below";
}

export interface IrExtractNoteTooltipPositionMetrics {
    actionLeft: number;
    actionTop: number;
    actionRight: number;
    actionBottom: number;
    tooltipWidth: number;
    tooltipHeight: number;
    viewportWidth: number;
    viewportHeight: number;
    viewportPadding: number;
    gap: number;
}

export interface IrExtractNoteTooltipPosition {
    placement: "above" | "below";
    top: number;
    left: number;
    maxWidth: number;
    arrowLeft: number;
}

export function getIrExtractNoteTooltipPosition(
    metrics: IrExtractNoteTooltipPositionMetrics,
): IrExtractNoteTooltipPosition {
    const maxWidth = Math.max(
        1,
        Math.min(metrics.tooltipWidth, metrics.viewportWidth - metrics.viewportPadding * 2),
    );
    const tooltipWidth = Math.min(metrics.tooltipWidth, maxWidth);
    const actionCenterX = (metrics.actionLeft + metrics.actionRight) / 2;
    const preferredLeft = actionCenterX - tooltipWidth / 2;
    const left = Math.min(
        Math.max(preferredLeft, metrics.viewportPadding),
        metrics.viewportWidth - metrics.viewportPadding - tooltipWidth,
    );
    const placement = getIrExtractNoteTooltipPlacement(metrics);
    const aboveTop = metrics.actionTop - metrics.tooltipHeight - metrics.gap;
    const belowTop = metrics.actionBottom + metrics.gap;
    const top =
        placement === "above"
            ? Math.max(metrics.viewportPadding, aboveTop)
            : Math.min(
                  metrics.viewportHeight - metrics.viewportPadding - metrics.tooltipHeight,
                  belowTop,
              );
    const arrowLeft = actionCenterX - left - NOTE_TOOLTIP_ARROW_SIZE / 2;

    return {
        placement,
        top,
        left,
        maxWidth,
        arrowLeft,
    };
}

export function shouldCloseIrExtractPinnedTooltip(
    target: EventTarget | null,
    overlay: HTMLElement,
    tooltip?: HTMLElement,
): boolean {
    return (
        !(target instanceof Node) ||
        (!overlay.contains(target) && !tooltip?.contains(target))
    );
}

export function shouldHighlightIrExtractBlock(
    blockStart: number,
    hoveredBlockStart: number | null,
    pinnedTooltipStart: number | null,
): boolean {
    return blockStart === hoveredBlockStart && blockStart !== pinnedTooltipStart;
}

function isIrExtractOpenOnlyLine(text: string, match: IrExtractMatch): boolean {
    const line = getLineAtOffset(text, match.start);
    return text.slice(line.from, line.to).trim() === "{{ir::";
}

function shouldStackIrExtractInfoActions(
    text: string,
    left: IrExtractMatch,
    right: IrExtractMatch,
): boolean {
    const leftLine = left.anchor.startLine;
    const rightLine = right.anchor.startLine;
    if (leftLine === rightLine) {
        return true;
    }

    const earlier = leftLine < rightLine ? left : right;
    const later = earlier === left ? right : left;
    return later.anchor.startLine === earlier.anchor.startLine + 1 && isIrExtractOpenOnlyLine(text, earlier);
}

function areIrExtractInfoBlocksOnSameVisualRow(
    left: Pick<MeasuredExtractBlock, "top">,
    right: Pick<MeasuredExtractBlock, "top">,
): boolean {
    return Math.abs(left.top - right.top) <= INFO_ICON_VISUAL_ROW_TOLERANCE;
}

export function getIrExtractInfoOffsetIndexes(
    text: string,
    matchesByStart: ReadonlyMap<number, IrExtractMatch>,
    blocks: ReadonlyMap<number, Pick<MeasuredExtractBlock, "left" | "top" | "width">>,
): Map<number, { rightOffset: number; topOffset: number }> {
    const starts = [...blocks.keys()].filter((start) => matchesByStart.has(start));
    const offsets = new Map(starts.map((start) => [start, { rightOffset: 0, topOffset: 0 }]));
    const visited = new Set<number>();

    const getConnectedStarts = (rootStart: number): number[] => {
        const group = new Set([rootStart]);
        let changed = true;
        while (changed) {
            changed = false;
            for (const start of starts) {
                if (group.has(start)) {
                    continue;
                }
                const match = matchesByStart.get(start);
                const parentStart = match?.parentStart;
                if (parentStart === undefined || !group.has(parentStart)) {
                    continue;
                }
                const parent = matchesByStart.get(parentStart);
                const block = blocks.get(start);
                const parentBlock = blocks.get(parentStart);
                if (
                    !match ||
                    !parent ||
                    !block ||
                    !parentBlock ||
                    !areIrExtractInfoBlocksOnSameVisualRow(block, parentBlock) ||
                    !shouldStackIrExtractInfoActions(text, match, parent)
                ) {
                    continue;
                }
                group.add(start);
                changed = true;
            }

            for (const start of starts) {
                const match = matchesByStart.get(start);
                const parentStart = match?.parentStart;
                if (!match || parentStart === undefined || !group.has(start)) {
                    continue;
                }
                const parent = matchesByStart.get(parentStart);
                const block = blocks.get(start);
                const parentBlock = blocks.get(parentStart);
                if (
                    !parent ||
                    !block ||
                    !parentBlock ||
                    !areIrExtractInfoBlocksOnSameVisualRow(block, parentBlock) ||
                    !shouldStackIrExtractInfoActions(text, match, parent)
                ) {
                    continue;
                }
                if (!group.has(parentStart)) {
                    group.add(parentStart);
                    changed = true;
                }
            }
        }
        return [...group];
    };

    const getDepth = (start: number): number => {
        let depth = 1;
        let parentStart = matchesByStart.get(start)?.parentStart;
        while (parentStart !== undefined) {
            depth++;
            parentStart = matchesByStart.get(parentStart)?.parentStart;
        }
        return depth;
    };

    for (const start of starts) {
        if (visited.has(start)) {
            continue;
        }
        const group = getConnectedStarts(start);
        for (const groupStart of group) {
            visited.add(groupStart);
        }
        if (group.length < 2) {
            continue;
        }

        const orderedGroup = group.sort((left, right) => getDepth(right) - getDepth(left) || right - left);
        const tops = orderedGroup.flatMap((groupStart) => {
            const block = blocks.get(groupStart);
            return block ? [block.top + INFO_ICON_TOP] : [];
        });
        if (tops.length === 0) {
            continue;
        }
        const top = Math.min(...tops);
        for (const groupStart of orderedGroup) {
            const block = blocks.get(groupStart);
            const offset = offsets.get(groupStart);
            if (!block || !offset) {
                continue;
            }
            offset.topOffset = top - (block.top + INFO_ICON_TOP);
        }

        let previousActualLeft: number | null = null;
        for (const groupStart of orderedGroup) {
            const block = blocks.get(groupStart);
            const defaultLeft = block
                ? block.left + block.width - INFO_ICON_BASE_RIGHT - INFO_ICON_SIZE
                : null;
            if (defaultLeft === null) {
                previousActualLeft = null;
                continue;
            }
            if (previousActualLeft === null) {
                previousActualLeft = defaultLeft;
                continue;
            }
            const offset = Math.max(0, defaultLeft - previousActualLeft + INFO_ICON_STACK_STEP);
            const currentOffset = offsets.get(groupStart);
            if (currentOffset) {
                currentOffset.rightOffset = offset;
            }
            previousActualLeft = defaultLeft - offset;
        }
    }

    return offsets;
}

function createIrExtractDecorationPlugin(options: IrExtractDecorationOptions = {}): Extension {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;
            private renderExtracts: RenderExtract[];
            private pointSourceStarts = new Set<number>();
            private sourceRevealEnabled: boolean;
            private readonly overlay: HTMLElement;
            private readonly noteTooltip: HTMLElement;
            private readonly scrollDOM: HTMLElement;
            private readonly blockDomCache = new Map<number, HTMLElement>();
            private readonly blockMeasurements = new Map<number, MeasuredExtractBlock>();
            private matchesByStart = new Map<number, IrExtractMatch>();
            private sourceText = "";
            private pinnedTooltipStart: number | null = null;
            private hoveredBlockStart: number | null = null;
            private hoveredTooltipStart: number | null = null;
            private cursorBlockStart: number | null = null;
            private visibleTooltipAction: HTMLElement | null = null;
            private tooltipDraftStart: number | null = null;
            private readonly noteDraftsByStart = new Map<number, string>();
            private readonly handleScrollMouseMove = (event: MouseEvent): void => {
                const point = getMousePointInScrollCoordinates(this.scrollDOM, event);
                const hoveredStart = findHoveredIrExtractBlockStart(
                    this.blockMeasurements,
                    point.x,
                    point.y,
                );
                const hoveredInfoStart = findIrExtractInfoActionStartAtClientPoint(
                    this.blockDomCache,
                    event.clientX,
                    event.clientY,
                );
                syncIrExtractInfoCursorAtClientPoint(
                    this.scrollDOM,
                    this.blockDomCache,
                    event.clientX,
                    event.clientY,
                );

                if (
                    this.hoveredBlockStart === hoveredStart &&
                    this.hoveredTooltipStart === hoveredInfoStart
                ) {
                    return;
                }

                this.hoveredBlockStart = hoveredStart;
                this.hoveredTooltipStart = hoveredInfoStart;
                this.updateInteractiveBlockStates();
            };
            private readonly handleScrollMouseLeave = (): void => {
                if (this.hoveredBlockStart === null && this.hoveredTooltipStart === null) {
                    return;
                }
                this.hoveredBlockStart = null;
                this.hoveredTooltipStart = null;
                this.scrollDOM.classList.remove("sr-ir-info-cursor-pointer");
                this.scrollDOM.setCssProps({ cursor: "" });
                this.updateInteractiveBlockStates();
            };
            private readonly handleScrollPointerDown = (event: PointerEvent): void => {
                const infoStart = findIrExtractInfoActionStartAtClientPoint(
                    this.blockDomCache,
                    event.clientX,
                    event.clientY,
                );
                if (infoStart === null) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                this.pinTooltip(infoStart);
            };
            private readonly handleDocumentMouseDown = (event: MouseEvent): void => {
                if (
                    !shouldCloseIrExtractPinnedTooltip(
                        event.target,
                        this.overlay,
                        this.noteTooltip,
                    )
                ) {
                    return;
                }
                this.closePinnedTooltip();
            };
            private readonly handleTooltipInput = (): void => {
                this.saveVisibleTooltipDraft();
                this.updateInteractiveBlockStates();
                this.repositionVisibleNoteTooltip();
            };
            private readonly handleViewportTooltipReposition = (): void => {
                this.repositionVisibleNoteTooltip();
            };

            constructor(view: EditorView) {
                this.sourceRevealEnabled = canRevealIrExtractSource(view, options);
                const state = buildIrExtractDecorations(view, this.pointSourceStarts, options);
                this.decorations = state.decorations;
                this.renderExtracts = state.renderExtracts;
                this.sourceText = view.state.doc.toString();
                this.matchesByStart = new Map(
                    this.renderExtracts.map((renderExtract) => [
                        renderExtract.match.start,
                        renderExtract.match,
                    ]),
                );
                this.overlay = document.createElement("div");
                this.overlay.className = "sr-ir-extract-overlay";
                this.noteTooltip = createIrExtractNoteTooltipElement({
                    onSubmit: () => this.closePinnedTooltip(),
                });
                document.body.appendChild(this.noteTooltip);
                this.scrollDOM = view.scrollDOM;
                view.scrollDOM.appendChild(this.overlay);
                this.scrollDOM.addEventListener("mousemove", this.handleScrollMouseMove);
                this.scrollDOM.addEventListener("mouseleave", this.handleScrollMouseLeave);
                this.scrollDOM.addEventListener("pointerdown", this.handleScrollPointerDown, true);
                this.noteTooltip.addEventListener("input", this.handleTooltipInput);
                document.addEventListener("mousedown", this.handleDocumentMouseDown, true);
                window.addEventListener("resize", this.handleViewportTooltipReposition);
                window.addEventListener("scroll", this.handleViewportTooltipReposition, true);
                this.scheduleMeasure(view);
            }

            update(update: ViewUpdate): void {
                let receivedPointSourceStarts = false;
                let receivedExtractContextRanges = false;
                for (const transaction of update.transactions) {
                    for (const effect of transaction.effects) {
                        if (effect.is(irExtractPointSourceStartsEffect)) {
                            this.pointSourceStarts = new Set(effect.value);
                            receivedPointSourceStarts = true;
                        }
                        if (effect.is(setExtractContextRangesEffect)) {
                            receivedExtractContextRanges = true;
                        }
                    }
                }

                const nextSourceRevealEnabled = canRevealIrExtractSource(update.view, options);
                const sourceRevealChanged = this.sourceRevealEnabled !== nextSourceRevealEnabled;
                const shouldRebuild =
                    update.docChanged ||
                    update.viewportChanged ||
                    update.selectionSet ||
                    update.focusChanged ||
                    receivedPointSourceStarts ||
                    receivedExtractContextRanges ||
                    sourceRevealChanged;

                if (shouldRebuild) {
                    if (
                        !receivedPointSourceStarts &&
                        (update.docChanged ||
                            update.viewportChanged ||
                            receivedExtractContextRanges ||
                            sourceRevealChanged)
                    ) {
                        this.pointSourceStarts = new Set();
                    }
                    this.sourceRevealEnabled = nextSourceRevealEnabled;
                    const state = buildIrExtractDecorations(
                        update.view,
                        this.pointSourceStarts,
                        options,
                    );
                    this.decorations = state.decorations;
                    this.renderExtracts = state.renderExtracts;
                    this.sourceText = update.view.state.doc.toString();
                    this.matchesByStart = new Map(
                        this.renderExtracts.map((renderExtract) => [
                            renderExtract.match.start,
                            renderExtract.match,
                        ]),
                    );
                    this.scheduleMeasure(update.view);
                    return;
                }

                if (update.geometryChanged) {
                    this.scheduleMeasure(update.view);
                }
            }

            destroy(): void {
                this.scrollDOM.removeEventListener("mousemove", this.handleScrollMouseMove);
                this.scrollDOM.removeEventListener("mouseleave", this.handleScrollMouseLeave);
                this.scrollDOM.removeEventListener(
                    "pointerdown",
                    this.handleScrollPointerDown,
                    true,
                );
                document.removeEventListener("mousedown", this.handleDocumentMouseDown, true);
                window.removeEventListener("resize", this.handleViewportTooltipReposition);
                window.removeEventListener("scroll", this.handleViewportTooltipReposition, true);
                this.noteTooltip.removeEventListener("input", this.handleTooltipInput);
                this.clearOverlayBlocks();
                this.overlay.remove();
                this.noteTooltip.remove();
            }

            private renderBlocks(blocks: MeasuredExtractBlock[]): void {
                renderOverlayBlocks(this.overlay, blocks, this.blockDomCache, {
                    onPinTooltip: (blockStart) => this.pinTooltip(blockStart),
                    onTooltipHoverStart: (blockStart) => this.showTooltipFromIcon(blockStart),
                    onTooltipHoverEnd: (blockStart) => this.hideTooltipFromIcon(blockStart),
                });

                this.blockMeasurements.clear();
                for (const block of blocks) {
                    this.blockMeasurements.set(block.start, block);
                }

                if (
                    this.pinnedTooltipStart !== null &&
                    !this.blockMeasurements.has(this.pinnedTooltipStart)
                ) {
                    this.pinnedTooltipStart = null;
                }
                if (
                    this.hoveredBlockStart !== null &&
                    !this.blockMeasurements.has(this.hoveredBlockStart)
                ) {
                    this.hoveredBlockStart = null;
                }
                if (
                    this.cursorBlockStart !== null &&
                    !this.blockMeasurements.has(this.cursorBlockStart)
                ) {
                    this.cursorBlockStart = null;
                }
                if (
                    this.hoveredTooltipStart !== null &&
                    !this.blockMeasurements.has(this.hoveredTooltipStart)
                ) {
                    this.hoveredTooltipStart = null;
                }

                this.updateInteractiveBlockStates();
            }

            private clearOverlayBlocks(): void {
                this.pinnedTooltipStart = null;
                this.hoveredBlockStart = null;
                this.hoveredTooltipStart = null;
                this.cursorBlockStart = null;
                this.visibleTooltipAction = null;
                this.blockMeasurements.clear();
                this.blockDomCache.clear();
                this.overlay.replaceChildren();
                this.noteTooltip.classList.remove("is-visible", "is-above", "is-below");
            }

            private pinTooltip(blockStart: number): void {
                this.pinnedTooltipStart =
                    this.pinnedTooltipStart === blockStart ? null : blockStart;
                this.updateInteractiveBlockStates();

                const textarea = this.noteTooltip.querySelector<HTMLTextAreaElement>("textarea");
                if (!textarea || this.pinnedTooltipStart !== blockStart) {
                    return;
                }

                const focusTextarea = () => {
                    this.tooltipDraftStart = blockStart;
                    textarea.value = this.noteDraftsByStart.get(blockStart) ?? "";
                    resizeIrExtractTextarea(textarea);
                    textarea.focus();
                };

                if (typeof window.requestAnimationFrame === "function") {
                    window.requestAnimationFrame(focusTextarea);
                } else {
                    focusTextarea();
                }
            }

            private showTooltipFromIcon(blockStart: number): void {
                this.hoveredTooltipStart = blockStart;
                this.updateInteractiveBlockStates();
            }

            private hideTooltipFromIcon(blockStart: number): void {
                if (this.hoveredTooltipStart !== blockStart) {
                    return;
                }
                this.hoveredTooltipStart = null;
                this.updateInteractiveBlockStates();
            }

            private closePinnedTooltip(): void {
                if (this.pinnedTooltipStart === null) {
                    return;
                }
                this.saveVisibleTooltipDraft();
                this.pinnedTooltipStart = null;
                this.tooltipDraftStart = null;
                this.updateInteractiveBlockStates();
            }

            private updateInteractiveBlockStates(): void {
                const infoVisibleStarts = getIrExtractInfoVisibleStarts(
                    this.blockMeasurements,
                    this.hoveredBlockStart,
                    this.cursorBlockStart,
                    this.pinnedTooltipStart,
                );
                const notedStarts = new Set(
                    [...this.noteDraftsByStart]
                        .filter(([, value]) => value.trim().length > 0)
                        .map(([start]) => start),
                );
                const infoOffsetIndexes = getIrExtractInfoOffsetIndexes(
                    this.sourceText,
                    this.matchesByStart,
                    this.blockMeasurements,
                );
                let visibleTooltipAction: HTMLElement | null = null;
                let visibleTooltip = false;
                for (const [blockStart, element] of this.blockDomCache) {
                    const isEditing = blockStart === this.pinnedTooltipStart;
                    const isHovered = shouldHighlightIrExtractBlock(
                        blockStart,
                        this.hoveredBlockStart,
                        this.pinnedTooltipStart,
                    );
                    const isTooltipVisible = isIrExtractNoteTooltipVisible(
                        blockStart,
                        this.hoveredTooltipStart,
                        this.pinnedTooltipStart,
                    );
                    const infoState = getIrExtractInfoState(
                        blockStart,
                        infoVisibleStarts,
                        notedStarts,
                    );
                    const infoVisible = infoState.visible;
                    element.classList.toggle("is-editing", isEditing);
                    element.classList.toggle("is-hovered", isHovered);
                    const infoAction = element.querySelector<HTMLElement>(".sr-ir-info-action");
                    infoAction?.classList.toggle("is-editing", isEditing);
                    infoAction?.classList.toggle("has-note", infoState.hasNote);
                    infoAction?.classList.toggle("is-visible", infoVisible);
                    infoAction?.setAttribute(
                        "aria-expanded",
                        isTooltipVisible ? "true" : "false",
                    );
                    if (isTooltipVisible && infoAction) {
                        visibleTooltipAction = infoAction;
                        visibleTooltip = true;
                    }
                    const rightOffset = infoOffsetIndexes.get(blockStart)?.rightOffset ?? 0;
                    const topOffset = infoOffsetIndexes.get(blockStart)?.topOffset ?? 0;
                    infoAction?.style.setProperty("--sr-ir-info-offset", `${rightOffset}px`);
                    infoAction?.style.setProperty(
                        "right",
                        `${INFO_ICON_BASE_RIGHT + rightOffset}px`,
                    );
                    infoAction?.style.setProperty("top", `${INFO_ICON_TOP + topOffset}px`);
                }
                this.updateNoteTooltipPosition(visibleTooltipAction, visibleTooltip);
            }

            private updateNoteTooltipPosition(
                infoAction: HTMLElement | null,
                visible: boolean,
            ): void {
                this.noteTooltip.classList.toggle("is-visible", visible);
                if (!visible || !infoAction) {
                    this.visibleTooltipAction = null;
                    return;
                }

                this.visibleTooltipAction = infoAction;
                const actionRect = infoAction.getBoundingClientRect();
                const tooltipRect = this.noteTooltip.getBoundingClientRect();
                const tooltipHeight = tooltipRect.height || NOTE_TOOLTIP_FALLBACK_HEIGHT;
                const tooltipWidth = tooltipRect.width || NOTE_TOOLTIP_FALLBACK_WIDTH;
                const position = getIrExtractNoteTooltipPosition({
                    actionLeft: actionRect.left,
                    actionTop: actionRect.top,
                    actionRight: actionRect.right,
                    actionBottom: actionRect.bottom,
                    tooltipWidth,
                    tooltipHeight,
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight,
                    viewportPadding: NOTE_TOOLTIP_VIEWPORT_PADDING,
                    gap: NOTE_TOOLTIP_GAP,
                });

                this.noteTooltip.classList.toggle("is-above", position.placement === "above");
                this.noteTooltip.classList.toggle("is-below", position.placement === "below");
                this.noteTooltip.setCssProps({
                    top: `${position.top}px`,
                    left: `${position.left}px`,
                    maxWidth: `${position.maxWidth}px`,
                    "--sr-note-path-tooltip-arrow-left": `${position.arrowLeft}px`,
                });
            }

            private repositionVisibleNoteTooltip(): void {
                if (!this.noteTooltip.classList.contains("is-visible")) {
                    return;
                }
                this.updateNoteTooltipPosition(this.visibleTooltipAction, true);
            }

            private saveVisibleTooltipDraft(): void {
                const textarea = this.noteTooltip.querySelector<HTMLTextAreaElement>("textarea");
                if (!textarea || this.tooltipDraftStart === null) {
                    return;
                }
                this.noteDraftsByStart.set(this.tooltipDraftStart, textarea.value);
            }

            private scheduleMeasure(view: EditorView): void {
                if (!isLivePreview(view, options) || this.renderExtracts.length === 0) {
                    this.clearOverlayBlocks();
                    return;
                }

                view.requestMeasure({
                    read: (): IrExtractMeasureReadResult => {
                        const overlayBlocks = measureExtractBlocks(view, this.renderExtracts);
                        const selection = view.state.selection.main;
                        const matches = parseIrExtracts(view.state.doc.toString());
                        const sourceRevealEnabled = canRevealIrExtractSource(view, options);
                        const point = sourceRevealEnabled
                            ? getSelectionPointInScrollCoordinates(view, selection)
                            : null;
                        const cursorBlockStart = point
                            ? findHoveredIrExtractBlockStart(
                                  new Map(overlayBlocks.map((block) => [block.start, block])),
                                  point.x,
                                  point.y,
                              )
                            : null;
                        return {
                            overlayBlocks,
                            pointSourceStarts: sourceRevealEnabled
                                ? findIrExtractSourceStartsAtSelectionPoint(
                                      matches,
                                      selection,
                                      overlayBlocks,
                                      point,
                                  )
                                : [],
                            cursorBlockStart,
                            selectionFrom: selection.from,
                            selectionTo: selection.to,
                        };
                    },
                    write: (result) => {
                        this.overlay.style.width = `${view.scrollDOM.scrollWidth}px`;
                        this.overlay.style.height = `${view.scrollDOM.scrollHeight}px`;
                        this.cursorBlockStart = result.cursorBlockStart;
                        this.renderBlocks(result.overlayBlocks);

                        const nextPointSourceStarts = new Set(result.pointSourceStarts);
                        if (!areNumberSetsEqual(this.pointSourceStarts, nextPointSourceStarts)) {
                            const nextStarts = [...nextPointSourceStarts];
                            window.requestAnimationFrame(() => {
                                const selection = view.state.selection.main;
                                if (
                                    !view.dom.isConnected ||
                                    selection.from !== result.selectionFrom ||
                                    selection.to !== result.selectionTo
                                ) {
                                    return;
                                }
                                view.dispatch({
                                    effects: irExtractPointSourceStartsEffect.of(nextStarts),
                                });
                            });
                        }
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
        zIndex: "3",
    },
    ".sr-ir-extract-block": {
        position: "absolute",
        boxSizing: "border-box",
        border: "1px solid rgba(var(--mono-rgb-100), var(--sr-ir-border-alpha, 0.1))",
        borderRadius: "4px",
        backgroundColor: "rgba(var(--mono-rgb-100), var(--sr-ir-bg-alpha, 0.008))",
        pointerEvents: "none",
        transition: "border-color 0.15s ease, background-color 0.15s ease",
    },
    ".sr-ir-extract-block.is-hovered, .sr-ir-extract-block.is-editing": {
        borderColor: "rgba(var(--mono-rgb-100), 0.2)",
        backgroundColor: "rgba(var(--mono-rgb-100), 0.012)",
    },
    ".cm-scroller.sr-ir-info-cursor-pointer, .cm-scroller.sr-ir-info-cursor-pointer *": {
        cursor: "pointer !important",
    },
    ".sr-ir-info-action": {
        position: "absolute",
        top: "-10px",
        right: "calc(24px + var(--sr-ir-info-offset, 0px))",
        width: "20px",
        height: "20px",
        padding: "0",
        border: "none",
        borderRadius: "50%",
        backgroundColor: "var(--background-primary)",
        color: "var(--text-faint)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        opacity: "0",
        pointerEvents: "auto",
        zIndex: "10",
        transition: "opacity 0.15s ease, color 0.15s ease",
    },
    ".sr-ir-info-action svg": {
        width: "14px",
        height: "14px",
    },
    ".sr-ir-extract-block.is-hovered .sr-ir-info-action, .sr-ir-info-action.is-visible, .sr-ir-info-action.is-editing": {
        opacity: "1",
    },
    ".sr-ir-info-action:hover": {
        color: "var(--text-normal)",
    },
    ".sr-ir-info-action.has-note": {
        color: "var(--interactive-accent)",
        opacity: "1",
    },
    ".sr-ir-info-action.is-editing": {
        color: "var(--interactive-accent)",
    },
    ".sr-ir-note-tooltip": {
        opacity: "0",
        visibility: "hidden",
        pointerEvents: "none",
    },
    ".sr-ir-note-tooltip.is-visible": {
        opacity: "1",
        visibility: "visible",
        pointerEvents: "auto",
    },
    ".sr-ir-extract-active-token": {
        color: "var(--interactive-accent)",
        fontWeight: "600",
    },
});

export function createIrExtractDecorationExtensions(_host: unknown = null): Extension[] {
    const options = _host && typeof _host === "object" ? (_host as IrExtractDecorationOptions) : {};
    return [createIrExtractDecorationPlugin(options), irExtractDecorationTheme];
}
