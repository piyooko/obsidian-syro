import { findCodeContextSegments } from "src/util/codeAwareCloze";

export type MarkdownRenderer = (content: string, el: HTMLElement) => Promise<void> | void;

const SR_MARKER_OPEN = "\u00ab\u00ab";
const SR_MARKER_CLOSE = "\u00bb\u00bb";
const SR_MARKER_OPEN_SINGLE = "\u00ab";
const SR_MARKER_CLOSE_SINGLE = "\u00bb";
const LEGACY_MARKER_OPEN = "\u82a6\u82a6";
const LEGACY_MARKER_CLOSE = "\u7984\u7984";
const SR_MARKER_REGEX = /\u00ab\u00abSR_([HSC]):([^\u00bb]+)\u00bb\u00bb/g;
const SR_UNIFIED_REGEX = /\u00ab\u00abSR_C:([^\u00bb]+)\u00bb\u00bb/g;
const SR_CODE_CLOZE_REGEX = /\u00ab\u00abSR_CLOZE:([^\u00bb]+)\u00bb\u00bb/g;
const SR_HIDDEN_REGEX = /\u00ab\u00abSR_H:([^\u00bb]+)\u00bb\u00bb/g;
const SR_SHOWN_REGEX = /\u00ab\u00abSR_S:([^\u00bb]+)\u00bb\u00bb/g;
const SR_MARKDOWN_ENCODED_ATTRIBUTE = "data-sr-markdown-encoded";

type SrMarkerType = "H" | "S" | "C";

interface TextRange {
    start: number;
    end: number;
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function tryDecodeSrMarkerText(encoded: string): string | null {
    try {
        return decodeURIComponent(encoded);
    } catch {
        return null;
    }
}

export function decodeSrMarkerText(encoded: string, fallback: string): string {
    return tryDecodeSrMarkerText(encoded) ?? fallback;
}

export function decodeUnifiedMarkerPayload(
    payload: string,
): { placeholderText: string; answerText: string } | null {
    const separatorIndex = payload.indexOf(":");
    if (separatorIndex === -1) {
        return null;
    }

    const placeholderText = tryDecodeSrMarkerText(payload.slice(0, separatorIndex));
    const answerText = tryDecodeSrMarkerText(payload.slice(separatorIndex + 1));
    if (placeholderText === null || answerText === null) {
        return null;
    }

    return {
        placeholderText,
        answerText,
    };
}

function setMarkerMarkdown(target: HTMLElement, markdown: string) {
    target.dataset.srMarkdown = markdown;
}

function getMarkerMarkdown(target: HTMLElement): string {
    if (target.dataset.srMarkdown !== undefined) {
        return target.dataset.srMarkdown ?? "";
    }

    const encoded = target.dataset.srMarkdownEncoded;
    if (encoded !== undefined) {
        return decodeSrMarkerText(encoded, "");
    }

    return "";
}

function clearMarkerMarkdown(target: HTMLElement) {
    delete target.dataset.srMarkdown;
    delete target.dataset.srMarkdownEncoded;
}

function createUnifiedMarkerElement(
    placeholderText: string,
    answerText: string,
): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "sr-cloze-wrapper";

    const placeholder = document.createElement("span");
    placeholder.className = "sr-cloze-placeholder";
    placeholder.textContent = placeholderText;

    const answer = document.createElement("span");
    answer.className = "sr-cloze-answer";
    setMarkerMarkdown(answer, answerText);
    answer.textContent = answerText;

    wrapper.appendChild(placeholder);
    wrapper.appendChild(answer);

    return wrapper;
}

function createSingleMarkerElement(type: Exclude<SrMarkerType, "C">, content: string): HTMLElement {
    const span = document.createElement("span");

    if (type === "H") {
        span.className = "sr-cloze-hidden";
        span.textContent = content;
        return span;
    }

    span.className = "sr-cloze-shown sr-is-active";
    setMarkerMarkdown(span, content);
    span.textContent = content;
    return span;
}

function createMarkerElement(type: SrMarkerType, encoded: string): HTMLElement | null {
    if (type === "C") {
        const unifiedMarker = decodeUnifiedMarkerPayload(encoded);
        if (!unifiedMarker) {
            return null;
        }

        return createUnifiedMarkerElement(unifiedMarker.placeholderText, unifiedMarker.answerText);
    }

    const content = tryDecodeSrMarkerText(encoded);
    if (content === null) {
        return null;
    }

    return createSingleMarkerElement(type, content);
}

function buildUnifiedMarkerHtml(placeholderText: string, answerText: string): string {
    return `<span class="sr-cloze-wrapper"><span class="sr-cloze-placeholder">${escapeHtml(placeholderText)}</span><span class="sr-cloze-answer" ${SR_MARKDOWN_ENCODED_ATTRIBUTE}="${escapeHtml(encodeURIComponent(answerText))}">${escapeHtml(answerText)}</span></span>`;
}

function buildMarkerHtml(type: SrMarkerType, encoded: string): string | null {
    if (type === "C") {
        const unifiedMarker = decodeUnifiedMarkerPayload(encoded);
        if (!unifiedMarker) {
            return null;
        }

        return buildUnifiedMarkerHtml(unifiedMarker.placeholderText, unifiedMarker.answerText);
    }

    const content = tryDecodeSrMarkerText(encoded);
    if (content === null) {
        return null;
    }

    if (type === "H") {
        return `<span class="sr-cloze-hidden">${escapeHtml(content)}</span>`;
    }

    return `<span class="sr-cloze-shown sr-is-active" ${SR_MARKDOWN_ENCODED_ATTRIBUTE}="${escapeHtml(encodeURIComponent(content))}">${escapeHtml(content)}</span>`;
}

function mergeTextRanges(ranges: TextRange[]): TextRange[] {
    if (ranges.length === 0) {
        return [];
    }

    const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: TextRange[] = [{ ...sorted[0] }];

    for (let index = 1; index < sorted.length; index++) {
        const current = sorted[index];
        const previous = merged[merged.length - 1];

        if (current.start <= previous.end) {
            previous.end = Math.max(previous.end, current.end);
            continue;
        }

        merged.push({ ...current });
    }

    return merged;
}

function findMathSegments(text: string): TextRange[] {
    const segments: TextRange[] = [];
    const blockRegex = /\$\$[\s\S]*?\$\$/g;
    const inlineRegex = /(?<!\\|\$)\$(?!\$)[^$\n]+?(?<!\\)\$(?!\$)/g;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(text)) !== null) {
        segments.push({
            start: match.index,
            end: match.index + match[0].length,
        });
    }

    while ((match = inlineRegex.exec(text)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        const overlapsBlock = segments.some((segment) => start < segment.end && end > segment.start);
        if (overlapsBlock) {
            continue;
        }

        segments.push({ start, end });
    }

    return segments;
}

function tokenizeSrMarkersOutsideProtectedRanges(text: string): string {
    const tokenRegex = new RegExp(SR_MARKER_REGEX.source, "g");
    return text.replace(tokenRegex, (match: string, type: SrMarkerType, encoded: string) => {
        return buildMarkerHtml(type, encoded) ?? match;
    });
}

export function preTokenizeSrMarkers(content: string): string {
    const normalized = normalizeSrMarkers(content);
    if (!normalized.includes(`${SR_MARKER_OPEN}SR_`)) {
        return normalized;
    }

    const protectedRanges = mergeTextRanges([
        ...findCodeContextSegments(normalized).map((segment) => ({
            start: segment.start,
            end: segment.end,
        })),
        ...findMathSegments(normalized),
    ]);

    if (protectedRanges.length === 0) {
        return tokenizeSrMarkersOutsideProtectedRanges(normalized);
    }

    let result = "";
    let cursor = 0;

    for (const range of protectedRanges) {
        if (cursor < range.start) {
            result += tokenizeSrMarkersOutsideProtectedRanges(normalized.slice(cursor, range.start));
        }

        result += normalized.slice(range.start, range.end);
        cursor = range.end;
    }

    if (cursor < normalized.length) {
        result += tokenizeSrMarkersOutsideProtectedRanges(normalized.slice(cursor));
    }

    return result;
}

function unwrapRenderedInlineNodes(buffer: HTMLElement): Node[] {
    const nodes = Array.from(buffer.childNodes);
    const significantNodes = nodes.filter((node) => {
        if (node.nodeType !== Node.TEXT_NODE) {
            return true;
        }

        return (node.textContent ?? "").trim().length > 0;
    });

    if (
        significantNodes.length === 1 &&
        significantNodes[0] instanceof HTMLElement &&
        significantNodes[0].tagName === "P"
    ) {
        return Array.from(significantNodes[0].childNodes);
    }

    return significantNodes.length > 0 ? significantNodes : nodes;
}

async function renderMarkdownInsideMarkerNode(
    target: HTMLElement,
    markdown: string,
    renderMarkdown?: MarkdownRenderer,
): Promise<void> {
    target.textContent = markdown;

    if (!renderMarkdown || markdown.length === 0) {
        return;
    }

    const buffer = document.createElement("div");

    try {
        await renderMarkdown(markdown, buffer);
        await postProcessMarkers(buffer, renderMarkdown);

        const renderedNodes = unwrapRenderedInlineNodes(buffer);
        if (renderedNodes.length > 0) {
            target.replaceChildren(...renderedNodes);
            return;
        }

        if (buffer.textContent?.trim()) {
            target.textContent = buffer.textContent;
        }
    } catch (error) {
        console.error("[LinearCard] Failed to render nested cloze markdown", error);
        target.textContent = markdown;
    }
}

async function hydrateMarkerMarkdown(container: HTMLElement, renderMarkdown?: MarkdownRenderer) {
    const targets = Array.from(
        container.querySelectorAll<HTMLElement>("[data-sr-markdown], [data-sr-markdown-encoded]"),
    );

    for (const target of targets) {
        const markdown = getMarkerMarkdown(target);
        clearMarkerMarkdown(target);
        await renderMarkdownInsideMarkerNode(target, markdown, renderMarkdown);
    }
}

export function normalizeSrMarkers(text: string): string {
    return text
        .replace(/&laquo;/g, SR_MARKER_OPEN_SINGLE)
        .replace(/&raquo;/g, SR_MARKER_CLOSE_SINGLE)
        .replace(/&#171;/g, SR_MARKER_OPEN_SINGLE)
        .replace(/&#187;/g, SR_MARKER_CLOSE_SINGLE)
        .replace(new RegExp(escapeRegExp(LEGACY_MARKER_OPEN), "g"), SR_MARKER_OPEN)
        .replace(new RegExp(escapeRegExp(LEGACY_MARKER_CLOSE), "g"), SR_MARKER_CLOSE);
}

export function toFallbackText(
    content: string,
    options?: { showAnswer?: boolean },
): string {
    const showAnswer = options?.showAnswer ?? false;
    const normalized = normalizeSrMarkers(content.replace(/<!--SR_CODE_CLOZE:\d+:\d+-->\n?/g, ""));

    return normalized
        .replace(SR_UNIFIED_REGEX, (_match: string, payload: string) => {
            const marker = decodeUnifiedMarkerPayload(payload);
            if (!marker) {
                return "[...]";
            }

            return showAnswer ? marker.answerText : marker.placeholderText;
        })
        .replace(SR_CODE_CLOZE_REGEX, (_match: string, encoded: string) => {
            return `[${decodeSrMarkerText(encoded, "...")}]`;
        })
        .replace(SR_HIDDEN_REGEX, () => "[...]")
        .replace(SR_SHOWN_REGEX, (_match: string, encoded: string) =>
            decodeSrMarkerText(encoded, ""),
        )
        .replace(/{{c\d+::(.*?)(?:::.*)?}}/g, "[...]");
}

export async function postProcessMarkers(
    container: HTMLElement,
    renderMarkdown?: MarkdownRenderer,
): Promise<void> {
    const walk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let node: Text | null;
    const nodesToReplace: { node: Text; fragments: (Text | HTMLElement)[] }[] = [];

    while ((node = walk.nextNode() as Text | null)) {
        const text = normalizeSrMarkers(node.textContent || "");

        if (!text.includes(`${SR_MARKER_OPEN}SR_`)) {
            continue;
        }

        const fragments: (Text | HTMLElement)[] = [];
        let lastEnd = 0;
        let match: RegExpExecArray | null;

        while ((match = SR_MARKER_REGEX.exec(text)) !== null) {
            if (match.index > lastEnd) {
                fragments.push(document.createTextNode(text.substring(lastEnd, match.index)));
            }

            const type = match[1];
            const encoded = match[2];
            const marker = createMarkerElement(type as SrMarkerType, encoded);
            if (marker) {
                fragments.push(marker);
            } else {
                fragments.push(document.createTextNode(match[0]));
            }

            lastEnd = SR_MARKER_REGEX.lastIndex;
        }

        SR_MARKER_REGEX.lastIndex = 0;

        if (lastEnd < text.length) {
            fragments.push(document.createTextNode(text.substring(lastEnd)));
        }

        if (fragments.length > 0) {
            nodesToReplace.push({ node, fragments });
        }
    }

    nodesToReplace.forEach(({ node: textNode, fragments }) => {
        const parent = textNode.parentNode;
        if (!parent) {
            return;
        }

        fragments.forEach((fragment) => parent.insertBefore(fragment, textNode));
        parent.removeChild(textNode);
    });

    await hydrateMarkerMarkdown(container, renderMarkdown);
}
