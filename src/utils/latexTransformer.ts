/**
 * LaTeX cloze 转换工具。
 * 把普通 cloze 语法和 Reviewer 预处理标记转换成 MathJax 可渲染的 LaTeX。
 */

export type LatexTransformMode = "mask" | "highlight";

const SR_MARKER_REGEX = /^(?:««|芦芦)SR_([HSC]):([\s\S]*?)(?:»»|禄禄)/;

function decodeUnifiedPayload(
    payload: string,
): { placeholderText: string; answerText: string } | null {
    const separatorIndex = payload.indexOf(":");
    if (separatorIndex === -1) {
        return null;
    }

    try {
        return {
            placeholderText: decodeURIComponent(payload.slice(0, separatorIndex)),
            answerText: decodeURIComponent(payload.slice(separatorIndex + 1)),
        };
    } catch {
        return null;
    }
}

export function transformLatex(
    source: string,
    mode: LatexTransformMode,
    activeId?: string | null,
): string {
    let result = "";
    let i = 0;

    while (i < source.length) {
        const slice = source.slice(i);
        const match = slice.match(/^\{\{c(\d+)::/);
        const markerMatch = slice.match(SR_MARKER_REGEX);

        if (match) {
            const id = match[1];
            const startContent = i + match[0].length;
            let braceDepth = 0;
            let j = startContent;

            while (j < source.length) {
                if (braceDepth === 0 && source.startsWith("}}", j)) break;
                if (source[j] === "{") braceDepth++;
                else if (source[j] === "}" && braceDepth > 0) braceDepth--;
                j++;
            }

            const content = source.substring(startContent, j);
            const processedContent = transformLatex(content, mode, activeId);

            if (mode === "mask") {
                if (activeId === null || id === activeId) {
                    result += "{\\color{#3b82f6}[\\ldots]}";
                } else {
                    result += processedContent;
                }
            } else {
                if (activeId === null || id === activeId) {
                    result += `{\\color{#60a5fa}${processedContent}}`;
                } else {
                    result += processedContent;
                }
            }

            i = j + 2;
            continue;
        }

        if (markerMatch) {
            const type = markerMatch[1];
            const payload = markerMatch[2];

            if (type === "C") {
                const unifiedPayload = decodeUnifiedPayload(payload);
                if (!unifiedPayload) {
                    result += markerMatch[0];
                    i += markerMatch[0].length;
                    continue;
                }

                const visibleText =
                    mode === "mask"
                        ? unifiedPayload.placeholderText.replace(/\[\.\.\.\]/g, "[\\ldots]")
                        : unifiedPayload.answerText;
                const color = mode === "mask" ? "#3b82f6" : "#60a5fa";
                result += `{\\color{${color}}${visibleText}}`;
                i += markerMatch[0].length;
                continue;
            }

            try {
                const content = decodeURIComponent(payload);
                const processedContent = content.replace(/\[\.\.\.\]/g, "[\\ldots]");

                if (type === "H") {
                    result += `{\\color{#3b82f6}${processedContent}}`;
                } else {
                    result += `{\\color{#60a5fa}${processedContent}}`;
                }
            } catch {
                result += markerMatch[0];
            }

            i += markerMatch[0].length;
            continue;
        }

        result += source[i];
        i++;
    }

    return result;
}

export function extractClozeIds(source: string): string[] {
    const regex = /\{\{c(\d+)::/g;
    const ids = new Set<string>();
    let match;
    while ((match = regex.exec(source)) !== null) {
        ids.add(match[1]);
    }
    return Array.from(ids).sort((a, b) => parseInt(a) - parseInt(b));
}

export function getActiveClozeId(source: string, relativeCursorPos: number): string | null {
    const regex = /\{\{c(\d+)::/g;
    const matches: { id: string; start: number; contentStart: number }[] = [];
    let match;

    while ((match = regex.exec(source)) !== null) {
        matches.push({
            id: match[1],
            start: match.index,
            contentStart: match.index + match[0].length,
        });
    }

    for (let i = matches.length - 1; i >= 0; i--) {
        const clozeMatch = matches[i];
        if (clozeMatch.start > relativeCursorPos) continue;

        let depth = 0;
        for (let j = clozeMatch.contentStart; j < source.length; j++) {
            if (source.startsWith("}}", j) && depth === 0) {
                if (relativeCursorPos >= clozeMatch.start && relativeCursorPos <= j + 2) {
                    return clozeMatch.id;
                }
                break;
            }
            if (source[j] === "{") depth++;
            else if (source[j] === "}" && depth > 0) depth--;
        }
    }

    return null;
}

export function hasClozeSyntax(text: string): boolean {
    return /\{\{c\d+::/.test(text);
}
