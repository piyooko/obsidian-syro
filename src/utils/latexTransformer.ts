/**
 * LaTeX Cloze 转换工具
 * 将 {{c1::内容}} 转换为 MathJax 可渲染的格式
 */

/**
 * 转换模式
 */
export type LatexTransformMode = "mask" | "highlight";

/**
 * 将带有 Cloze 语法的 LaTeX 转换为可渲染格式
 * @param source 源码
 * @param mode 'mask' = 遮罩模式（Popover预览）, 'highlight' = 高亮模式（文档显示）
 * @param activeId 当前选中的 Cloze ID（仅用于 mask 模式）
 */
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
        const markerMatch = slice.match(/^««SR_([HS]):([^»]+)»»/);

        if (match) {
            const id = match[1];
            const startContent = i + match[0].length;
            let braceDepth = 0;
            let j = startContent;

            // 使用括号计数找到正确的结束符 }}
            while (j < source.length) {
                if (braceDepth === 0 && source.startsWith("}}", j)) break;
                if (source[j] === "{") braceDepth++;
                else if (source[j] === "}" && braceDepth > 0) braceDepth--;
                j++;
            }

            const content = source.substring(startContent, j);
            // 递归处理嵌套
            const processedContent = transformLatex(content, mode, activeId);

            if (mode === "mask") {
                if (activeId === null || id === activeId) {
                    result += `{\\color{#3b82f6}[\\ldots]}`;
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

            i = j + 2; // 跳过 }}
        } else if (markerMatch) {
            // 处理新格式 Markers
            const type = markerMatch[1];
            const encoded = markerMatch[2];
            try {
                const content = decodeURIComponent(encoded);
                const processedContent = content.replace(/\[\.\.\.\]/g, "[\\ldots]");

                if (type === "H") {
                    // Hidden 标记始终显示为蓝色遮罩
                    result += `{\\color{#3b82f6}${processedContent}}`;
                } else {
                    // Shown 标记始终显示为蓝色高亮
                    result += `{\\color{#60a5fa}${processedContent}}`;
                }
            } catch {
                result += markerMatch[0];
            }
            i += markerMatch[0].length;
        } else {
            result += source[i];
            i++;
        }
    }

    return result;
}

/**
 * 提取所有 Cloze ID
 */
export function extractClozeIds(source: string): string[] {
    const regex = /\{\{c(\d+)::/g;
    const ids = new Set<string>();
    let match;
    while ((match = regex.exec(source)) !== null) {
        ids.add(match[1]);
    }
    return Array.from(ids).sort((a, b) => parseInt(a) - parseInt(b));
}

/**
 * 根据光标位置获取当前所在的 Cloze ID
 */
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

    // 按位置倒序检查
    for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i];
        if (m.start > relativeCursorPos) continue;

        // 找对应的 }}
        let depth = 0;
        for (let j = m.contentStart; j < source.length; j++) {
            if (source.startsWith("}}", j) && depth === 0) {
                if (relativeCursorPos >= m.start && relativeCursorPos <= j + 2) {
                    return m.id;
                }
                break;
            }
            if (source[j] === "{") depth++;
            else if (source[j] === "}" && depth > 0) depth--;
        }
    }

    return null;
}

/**
 * 检查文本是否包含 Cloze 语法
 */
export function hasClozeSyntax(text: string): boolean {
    return /\{\{c\d+::/.test(text);
}
