type HtmlAttributeAllowlist = Record<string, readonly string[]>;

export interface SanitizedHtmlOptions {
    allowedTags: readonly string[];
    allowedAttributes?: HtmlAttributeAllowlist;
}

const DEFAULT_ALLOWED_ATTRIBUTES: HtmlAttributeAllowlist = {
    a: ["href"],
};

function appendSanitizedNode(
    parent: Node,
    node: ChildNode,
    options: SanitizedHtmlOptions,
): void {
    if (node.nodeType === Node.TEXT_NODE) {
        parent.appendChild(document.createTextNode(node.textContent ?? ""));
        return;
    }

    if (!(node instanceof HTMLElement)) {
        return;
    }

    const tagName = node.tagName.toLowerCase();
    if (!options.allowedTags.includes(tagName)) {
        Array.from(node.childNodes).forEach((childNode) =>
            appendSanitizedNode(parent, childNode, options),
        );
        return;
    }

    const sanitizedEl = document.createElement(tagName);
    const allowedAttributes = options.allowedAttributes?.[tagName] ?? [];
    allowedAttributes.forEach((attrName) => {
        const attrValue = node.getAttribute(attrName);
        if (attrValue !== null) {
            sanitizedEl.setAttribute(attrName, attrValue);
        }
    });

    if (tagName === "a" && sanitizedEl.getAttribute("href")) {
        sanitizedEl.setAttribute("target", "_blank");
        sanitizedEl.setAttribute("rel", "noopener noreferrer");
    }

    Array.from(node.childNodes).forEach((childNode) =>
        appendSanitizedNode(sanitizedEl, childNode, options),
    );

    parent.appendChild(sanitizedEl);
}

export function createSanitizedHtmlFragment(
    html: string,
    options: SanitizedHtmlOptions,
): DocumentFragment {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const fragment = document.createDocumentFragment();

    Array.from(doc.body.childNodes).forEach((childNode) =>
        appendSanitizedNode(fragment, childNode, {
            ...options,
            allowedAttributes: options.allowedAttributes ?? DEFAULT_ALLOWED_ATTRIBUTES,
        }),
    );

    return fragment;
}

export function setSanitizedHtml(
    target: HTMLElement,
    html: string,
    options: SanitizedHtmlOptions,
): void {
    target.replaceChildren(createSanitizedHtmlFragment(html, options));
}
