/**
 * [编辑器层：增强 Obsidian 编辑体验] [UI] Markdown 后处理，用于在阅读模式下渲染填空。
 */
import { MarkdownPostProcessorContext } from "obsidian";

export const clozePostProcessor = (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    const clozes = el.querySelectorAll("code");
    // Only process text nodes, skip code blocks?
    // Actually, we should iterate text nodes.

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const nodesToReplace: { node: Text; replacements: (string | HTMLElement)[] }[] = [];

    let node: Text;
    while ((node = walker.nextNode() as Text)) {
        const text = node.textContent;
        if (!text) continue;

        // Regex for {{c1::content::hint}} or {{c1::content}}
        const regex = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g;
        let match;
        let lastIndex = 0;
        const replacements: (string | HTMLElement)[] = [];
        let hasMatch = false;

        while ((match = regex.exec(text)) !== null) {
            hasMatch = true;
            // Text before match
            if (match.index > lastIndex) {
                replacements.push(text.slice(lastIndex, match.index));
            }

            const id = match[1];
            const content = match[2];
            const hint = match[3];

            // Create span for cloze
            const span = document.createElement("span");
            span.className = "sr-cloze-highlight";
            span.textContent = content;
            if (hint) {
                span.title = hint;
            }
            // Optional: Add data attributes or click handler if we want interactivity
            // For now, just render visually as highlighted text (Reading Mode behavior)

            replacements.push(span);

            lastIndex = match.index + match[0].length;
        }

        if (hasMatch) {
            if (lastIndex < text.length) {
                replacements.push(text.slice(lastIndex));
            }
            nodesToReplace.push({ node, replacements });
        }
    }

    // Apply replacements
    for (const { node, replacements } of nodesToReplace) {
        const parent = node.parentNode;
        if (parent) {
            for (const replacement of replacements) {
                if (typeof replacement === "string") {
                    parent.insertBefore(document.createTextNode(replacement), node);
                } else {
                    parent.insertBefore(replacement, node);
                }
            }
            parent.removeChild(node);
        }
    }
};
