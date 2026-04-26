import type { MarkdownPostProcessorContext } from "obsidian";
import { parseIrExtracts, type IrExtractMatch } from "src/util/irExtractParser";
import { getIrExtractLayerInset } from "./ir-extract-decoration";

interface TextSlice {
    node: Text;
    start: number;
    end: number;
}

interface MarkerPair {
    start: HTMLElement;
    end: HTMLElement;
    depth: number;
    maxDepth: number;
}

interface ReadingBlock {
    left: number;
    top: number;
    width: number;
    height: number;
    depth: number;
    maxDepth: number;
}

function shouldSkipTextNode(node: Text): boolean {
    const parent = node.parentElement;
    return !parent || !!parent.closest("code, pre, .sr-ir-reading-marker, .sr-ir-reading-overlay");
}

function collectTextSlices(root: HTMLElement): { slices: TextSlice[]; text: string } {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const slices: TextSlice[] = [];
    let text = "";
    let node = walker.nextNode() as Text | null;

    while (node) {
        if (!shouldSkipTextNode(node)) {
            const value = node.textContent ?? "";
            slices.push({ node, start: text.length, end: text.length + value.length });
            text += value;
        }
        node = walker.nextNode() as Text | null;
    }

    return { slices, text };
}

function insertMarkerAtOffset(
    root: HTMLElement,
    offset: number,
    kind: "start" | "end",
): HTMLElement | null {
    const { slices, text } = collectTextSlices(root);
    const marker = document.createElement("span");
    marker.className = "sr-ir-reading-marker";
    marker.dataset.srIrMarker = kind;

    if (slices.length === 0) {
        return null;
    }

    if (offset >= text.length) {
        const last = slices[slices.length - 1].node;
        last.parentNode?.insertBefore(marker, last.nextSibling);
        return marker;
    }

    for (const slice of slices) {
        if (offset < slice.start || offset > slice.end) {
            continue;
        }

        const localOffset = offset - slice.start;
        const parent = slice.node.parentNode;
        if (!parent) {
            return null;
        }

        if (localOffset <= 0) {
            parent.insertBefore(marker, slice.node);
        } else if (localOffset >= slice.node.data.length) {
            parent.insertBefore(marker, slice.node.nextSibling);
        } else {
            const tail = slice.node.splitText(localOffset);
            parent.insertBefore(marker, tail);
        }
        return marker;
    }

    return null;
}

function deleteTextRange(root: HTMLElement, from: number, to: number): void {
    if (to <= from) return;

    const { slices } = collectTextSlices(root);
    for (const slice of slices) {
        const overlapFrom = Math.max(from, slice.start);
        const overlapTo = Math.min(to, slice.end);
        if (overlapTo <= overlapFrom) continue;

        const localFrom = overlapFrom - slice.start;
        const localTo = overlapTo - slice.start;
        slice.node.data = slice.node.data.slice(0, localFrom) + slice.node.data.slice(localTo);
    }
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

function createMarkerPairs(root: HTMLElement, matches: IrExtractMatch[]): MarkerPair[] {
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

    const markerSpecs = matches.flatMap((match, index) => [
        { offset: match.innerEnd, kind: "end" as const, index },
        { offset: match.innerStart, kind: "start" as const, index },
    ]);
    markerSpecs.sort((left, right) => right.offset - left.offset);

    const markers = new Map<string, HTMLElement>();
    for (const spec of markerSpecs) {
        const marker = insertMarkerAtOffset(root, spec.offset, spec.kind);
        if (marker) {
            markers.set(`${spec.index}:${spec.kind}`, marker);
        }
    }

    return matches
        .map((match, index): MarkerPair | null => {
            const start = markers.get(`${index}:start`);
            const end = markers.get(`${index}:end`);
            if (!start || !end) return null;
            const rootStart = rootStarts.get(match) ?? match.start;
            return {
                start,
                end,
                depth: depths.get(match) ?? 1,
                maxDepth: maxDepthByRoot.get(rootStart) ?? 1,
            };
        })
        .filter((pair): pair is MarkerPair => !!pair);
}

function removeWrapperTokens(root: HTMLElement, matches: IrExtractMatch[]): void {
    const tokenRanges = matches.flatMap((match) => [
        { from: match.innerEnd, to: match.end },
        { from: match.start, to: match.innerStart },
    ]);
    tokenRanges
        .sort((left, right) => right.from - left.from)
        .forEach((range) => deleteTextRange(root, range.from, range.to));
}

function measureReadingBlocks(root: HTMLElement, pairs: MarkerPair[]): ReadingBlock[] {
    const rootRect = root.getBoundingClientRect();
    const blocks: ReadingBlock[] = [];

    for (const pair of pairs) {
        const range = document.createRange();
        range.setStartAfter(pair.start);
        range.setEndBefore(pair.end);
        const rects = Array.from(range.getClientRects()).filter(
            (rect) => rect.width > 0 && rect.height > 0,
        );
        range.detach();
        if (rects.length === 0) continue;

        const minLeft = Math.min(...rects.map((rect) => rect.left));
        const maxRight = Math.max(...rects.map((rect) => rect.right));
        const minTop = Math.min(...rects.map((rect) => rect.top));
        const maxBottom = Math.max(...rects.map((rect) => rect.bottom));
        const inset = getIrExtractLayerInset(pair.depth, pair.maxDepth);

        blocks.push({
            left: minLeft - rootRect.left - inset,
            top: minTop - rootRect.top - 4,
            width: maxRight - minLeft + inset * 2,
            height: maxBottom - minTop + 8,
            depth: pair.depth,
            maxDepth: pair.maxDepth,
        });
    }

    return blocks;
}

function renderReadingOverlay(root: HTMLElement, blocks: ReadingBlock[]): void {
    const existing = root.querySelector(":scope > .sr-ir-reading-overlay");
    existing?.remove();
    if (blocks.length === 0) return;

    const overlay = document.createElement("span");
    overlay.className = "sr-ir-reading-overlay";
    const fragment = document.createDocumentFragment();

    for (const block of blocks) {
        const progress = block.maxDepth <= 1 ? 0 : (block.depth - 1) / (block.maxDepth - 1);
        const element = document.createElement("span");
        element.className = "sr-ir-reading-block";
        element.style.left = `${block.left}px`;
        element.style.top = `${block.top}px`;
        element.style.width = `${block.width}px`;
        element.style.height = `${block.height}px`;
        element.style.setProperty("--sr-ir-border-alpha", String(0.07 + progress * 0.08));
        element.style.setProperty("--sr-ir-bg-alpha", String(0.006 + progress * 0.014));
        fragment.appendChild(element);
    }

    overlay.appendChild(fragment);
    root.prepend(overlay);
}

export function renderIrExtractsInReadingMode(root: HTMLElement): number {
    const { text } = collectTextSlices(root);
    const matches = parseIrExtracts(text);
    if (matches.length === 0) {
        return 0;
    }

    const markerPairs = createMarkerPairs(root, matches);
    removeWrapperTokens(root, matches);
    root.classList.add("sr-ir-reading-root");

    const scheduleFrame =
        typeof requestAnimationFrame === "function"
            ? requestAnimationFrame
            : (callback: FrameRequestCallback) => {
                  callback(Date.now());
                  return 0;
              };

    scheduleFrame(() => {
        renderReadingOverlay(root, measureReadingBlocks(root, markerPairs));
    });

    return matches.length;
}

export const irExtractPostProcessor = (
    el: HTMLElement,
    _ctx: MarkdownPostProcessorContext,
): void => {
    renderIrExtractsInReadingMode(el);
};
