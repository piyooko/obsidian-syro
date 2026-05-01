import type { App, Component } from "obsidian";
import { MarkdownRenderer } from "obsidian";
import {
    finalizeIrExtractsInRenderedMarkdown,
    SR_IR_POSTPROCESS_SKIP_ATTR,
} from "src/editor/ir-extract-postprocessor";
import { transformLatex } from "src/utils/latexTransformer";
import { createSanitizedHtmlFragment } from "src/util/safeHtml";
import {
    decodeUnifiedMarkerPayload,
    normalizeSrMarkers,
    postProcessMarkers,
    preTokenizeSrMarkers,
    toFallbackText,
    tryDecodeSrMarkerText,
    type MarkdownRenderer as SyroMarkdownRenderer,
} from "src/ui/components/linearCardMarkers";

export interface RenderSyroMarkdownOptions {
    app?: App;
    markdown: string;
    target: HTMLElement;
    owner?: Component;
    renderMarkdown?: SyroMarkdownRenderer;
    renderIrExtracts?: boolean;
    showAnswer?: boolean;
    sourcePath?: string;
}

export function containsMathExpression(content: string): boolean {
    return /\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)[^$\n]+?(?<!\\)\$(?!\$)/.test(content);
}

export function requiresFlipAwareMathRender(content: string): boolean {
    const normalized = normalizeSrMarkers(content.replace(/<!--SR_CODE_CLOZE:\d+:\d+-->\n?/g, ""));
    return normalized.includes("««SR_C:") && containsMathExpression(normalized);
}

export function preprocessMathCloze(
    content: string,
    latexMode: "highlight" | "mask" = "highlight",
): string {
    content = normalizeSrMarkers(content);

    const hasMath = content.includes("$");
    const hasMarker = content.includes("««SR_");
    const hasAnkiCloze = content.includes("{{c");
    if (!hasMath || (!hasMarker && !hasAnkiCloze)) return content;

    let result = content;

    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_fullMatch: string, inner: string) => {
        return `$$${transformLatex(inner, latexMode, null)}$$`;
    });

    result = result.replace(
        /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g,
        (_fullMatch: string, inner: string) => `$${transformLatex(inner, latexMode, null)}$`,
    );

    return result;
}

const CODE_LINE_HTML_OPTIONS = {
    allowedTags: ["span"],
    allowedAttributes: {
        span: ["class"],
    },
} as const;

function setCodeLineContent(target: HTMLElement, html: string) {
    if (!html) {
        target.textContent = " ";
        return;
    }

    const fragment = createSanitizedHtmlFragment(html, CODE_LINE_HTML_OPTIONS);
    if (!fragment.hasChildNodes()) {
        target.textContent = html;
        return;
    }

    target.replaceChildren(fragment);
}

export function postProcessCodeBlock(
    container: HTMLElement,
    _clozeLine: number,
    startLine: number,
) {
    const preElements = container.querySelectorAll("pre");

    if (preElements.length === 0) {
        return;
    }

    preElements.forEach((pre) => {
        const codeEl = pre.querySelector("code");
        let codeContent = codeEl ? codeEl.innerHTML : pre.innerHTML;

        codeContent = codeContent
            .replace(/&laquo;/g, "«")
            .replace(/&raquo;/g, "»")
            .replace(/&#171;/g, "«")
            .replace(/&#187;/g, "»");

        const clozeLineIndices: Set<number> = new Set();

        const rawLines = codeContent.split("\n");
        rawLines.forEach((line, idx) => {
            const cleanLine = line.replace(/<[^>]+>/g, "");
            if (cleanLine.includes("««SR_CLOZE:") || cleanLine.includes("««SR_C:")) {
                clozeLineIndices.add(idx);
            }
        });

        codeContent = codeContent.replace(/««[\s\S]*?»»/g, (match) => {
            const cleanMatch = match.replace(/<[^>]+>/g, "");
            if (cleanMatch.startsWith("««SR_CLOZE:")) {
                const encoded = cleanMatch.substring(11, cleanMatch.length - 2);
                const decoded = tryDecodeSrMarkerText(encoded);
                if (decoded === null) {
                    return match;
                }

                return `<span class="sr-cloze-wrapper"><span class="sr-cloze-placeholder">[...]</span><span class="sr-cloze-answer">${decoded}</span></span>`;
            }
            if (cleanMatch.startsWith("««SR_C:")) {
                const decoded = decodeUnifiedMarkerPayload(
                    cleanMatch.substring(6, cleanMatch.length - 2),
                );
                if (!decoded) {
                    return match;
                }

                return `<span class="sr-cloze-wrapper"><span class="sr-cloze-placeholder">${decoded.placeholderText}</span><span class="sr-cloze-answer">${decoded.answerText}</span></span>`;
            }
            return match;
        });

        codeContent = codeContent.replace(
            /««SR_CLOZE_FRONT»»/g,
            '<span class="sr-cloze-placeholder">[...]</span>',
        );
        codeContent = codeContent.replace(
            /««SR_CLOZE_BACK:([^»]+)»»/g,
            (match: string, encoded: string) => {
                try {
                    const decoded = decodeURIComponent(encoded);
                    return `<span class="sr-cloze-answer">${decoded}</span>`;
                } catch {
                    return match;
                }
            },
        );

        const lines = codeContent.split("\n");

        const wrapper = document.createElement("div");
        wrapper.className = "sr-code-block-card";

        let currentRealLine = startLine;
        let maxLineNumberDigits = 1;
        let firstClozeDiv: HTMLElement | null = null;

        lines.forEach((lineContent, index) => {
            const trimmedLine = lineContent.trim();
            if (trimmedLine.startsWith("```") || trimmedLine.startsWith("~~~")) {
                return;
            }

            if (trimmedLine.startsWith("// ...")) {
                const lineDiv = document.createElement("div");
                lineDiv.className = "sr-code-context-line sr-code-ellipsis";
                const lineNumSpan = document.createElement("span");
                lineNumSpan.className = "sr-code-line-number";

                const lineContentSpan = document.createElement("span");
                lineContentSpan.className = "sr-code-line-content sr-code-line-content-ellipsis";
                setCodeLineContent(lineContentSpan, lineContent);

                lineDiv.appendChild(lineNumSpan);
                lineDiv.appendChild(lineContentSpan);
                wrapper.appendChild(lineDiv);
                return;
            }

            const isCloze = clozeLineIndices.has(index);

            const lineDiv = document.createElement("div");
            lineDiv.className = isCloze ? "sr-code-cloze-line" : "sr-code-context-line";
            lineDiv.dataset.line = String(currentRealLine);

            const lineNumSpan = document.createElement("span");
            lineNumSpan.className = "sr-code-line-number";
            lineNumSpan.textContent = String(currentRealLine);
            maxLineNumberDigits = Math.max(maxLineNumberDigits, lineNumSpan.textContent.length);

            const lineContentSpan = document.createElement("span");
            lineContentSpan.className = "sr-code-line-content";
            setCodeLineContent(lineContentSpan, lineContent);

            lineDiv.appendChild(lineNumSpan);
            lineDiv.appendChild(lineContentSpan);
            wrapper.appendChild(lineDiv);

            if (isCloze && !firstClozeDiv) {
                firstClozeDiv = lineDiv;
            }

            currentRealLine++;
        });

        wrapper.style.setProperty("--sr-code-line-number-digits", String(maxLineNumberDigits));

        pre.parentNode?.replaceChild(wrapper, pre);

        if (firstClozeDiv) {
            window.setTimeout(() => {
                if (typeof firstClozeDiv?.scrollIntoView === "function") {
                    firstClozeDiv.scrollIntoView({
                        block: "center",
                        behavior: "auto",
                    });
                }
            }, 10);
        }
    });
}

async function defaultRenderMarkdown({
    app,
    markdown,
    owner,
    sourcePath,
    target,
}: {
    app?: App;
    markdown: string;
    owner?: Component;
    sourcePath?: string;
    target: HTMLElement;
}): Promise<void> {
    if (!app || !owner) {
        target.textContent = markdown;
        return;
    }

    await MarkdownRenderer.render(app, markdown, target, sourcePath ?? "", owner);
}

export async function renderSyroMarkdownToElement({
    app,
    markdown,
    owner,
    renderMarkdown,
    renderIrExtracts = true,
    showAnswer = false,
    sourcePath,
    target,
}: RenderSyroMarkdownOptions): Promise<void> {
    const clozeMatch = markdown.match(/<!--SR_CODE_CLOZE:(\d+):(\d+)-->/);
    let clozeLine = clozeMatch ? parseInt(clozeMatch[1]) : null;
    let startLine = clozeMatch ? parseInt(clozeMatch[2]) : 1;

    let cleanContent = markdown.replace(/<!--SR_CODE_CLOZE:\d+:\d+-->\n?/, "");
    cleanContent = normalizeSrMarkers(cleanContent);

    const hasCodeBlock = cleanContent.includes("```") || cleanContent.includes("~~~");
    const hasPlaceholder = cleanContent.includes("««SR_CLOZE:") || cleanContent.includes("««SR_");

    if (!clozeMatch && hasCodeBlock && hasPlaceholder) {
        const lines = cleanContent.split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes("««SR_CLOZE:") || lines[i].includes("««SR_")) {
                clozeLine = i + 1;
                break;
            }
        }
        startLine = 1;
    }

    cleanContent = preprocessMathCloze(
        cleanContent,
        requiresFlipAwareMathRender(markdown) ? (showAnswer ? "highlight" : "mask") : "highlight",
    );

    const fallbackText = toFallbackText(cleanContent, { showAnswer });
    const tokenizedContent = preTokenizeSrMarkers(cleanContent);

    if (!renderMarkdown && (!app || !owner)) {
        target.replaceChildren(document.createTextNode(fallbackText));
        if (renderIrExtracts) {
            finalizeIrExtractsInRenderedMarkdown(target);
        }
        return;
    }

    const renderer =
        renderMarkdown ??
        ((content: string, el: HTMLElement) =>
            defaultRenderMarkdown({
                app,
                markdown: content,
                owner,
                sourcePath,
                target: el,
            }));

    const buffer = document.createElement("div");
    buffer.setAttribute(SR_IR_POSTPROCESS_SKIP_ATTR, "true");

    try {
        await renderer(tokenizedContent.content, buffer);
        await postProcessMarkers(buffer, renderer, tokenizedContent.tokens);

        if (clozeLine !== null || (hasCodeBlock && hasPlaceholder)) {
            postProcessCodeBlock(buffer, clozeLine || 1, startLine);
        }

        const renderedNodes = Array.from(buffer.childNodes);
        if (renderedNodes.length > 0 || buffer.textContent?.trim()) {
            target.replaceChildren(...renderedNodes);
            if (renderIrExtracts) {
                finalizeIrExtractsInRenderedMarkdown(target);
            }
            return;
        }

        target.replaceChildren(document.createTextNode(fallbackText));
        if (renderIrExtracts) {
            finalizeIrExtractsInRenderedMarkdown(target);
        }
    } catch (error) {
        console.error("[SyroMarkdown] Failed to render markdown", error);
        target.replaceChildren(document.createTextNode(fallbackText));
        if (renderIrExtracts) {
            finalizeIrExtractsInRenderedMarkdown(target);
        }
    }
}
