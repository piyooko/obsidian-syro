/**
 * 这个文件主要是干什么的：
 * [工具层] 上下文锚点工具。
 * 负责两个核心功能：
 * 1. 捕获：在用户提交复习记录时，截取光标周围的文本（Context Anchor）。
 * 2. 定位：当用户点击历史记录时，根据保存的文本快照，在当前（可能已被修改的）文档中找到最佳匹配位置。
 *
 * 它解决了什么问题：
 * 传统的"行号记录"在文档内容变更后会失效。此工具通过"模糊匹配"或"特征字符串匹配"，
 * 即使文档被修改，也能精准定位到当初复习的位置。
 *
 * 它在项目中属于：工具层
 *
 * 它会用到哪些文件：
 * (无强依赖，纯逻辑工具)
 *
 * 哪些文件会用到它：
 * 1. src/ui/views/ReactNoteReviewView.tsx (调用它来捕获和定位)
 */

export interface ContextAnchor {
    textSnippet: string;
    offset: number;
}

export interface MatchResult {
    line: number;
    ch: number;
    confidence: number; // 匹配置信度 (0-1)
}

export class ContextAnchorService {
    /**
     * 捕获当前光标位置的上下文
     * @param fullText 文档全文
     * @param line 光标所在行号
     * @param ch 光标所在列号
     * @param windowSize 截取的窗口大小（字符数），默认 100
     */
    static capture(
        fullText: string,
        line: number,
        ch: number,
        windowSize: number = 100,
    ): ContextAnchor | null {
        const lines = fullText.split("\n");
        if (line < 0 || line >= lines.length) return null;

        // 计算光标在全文中的绝对索引
        let absoluteIndex = 0;
        for (let i = 0; i < line; i++) {
            absoluteIndex += lines[i].length + 1; // +1 是换行符
        }
        absoluteIndex += ch;

        // 截取上下文
        const start = Math.max(0, absoluteIndex - Math.floor(windowSize / 2));
        const end = Math.min(fullText.length, absoluteIndex + Math.ceil(windowSize / 2));
        const snippet = fullText.substring(start, end);

        return {
            textSnippet: snippet,
            offset: absoluteIndex - start,
        };
    }

    /**
     * 在当前文本中寻找最佳匹配位置
     * @param currentText 当前文档全文
     * @param anchor 保存的锚点信息
     */
    /**
     * 在当前文本中寻找最佳匹配位置
     * @param currentText 当前文档全文
     * @param anchor 保存的锚点信息
     */
    static findBestMatch(currentText: string, anchor: ContextAnchor): MatchResult | null {
        if (!anchor || !anchor.textSnippet) {
            return null;
        }

        const { textSnippet, offset } = anchor;

        // 1. 尝试精确匹配 (Exact Match)
        const exactIndex = currentText.indexOf(textSnippet);
        if (exactIndex !== -1) {
            return this.indexToPos(currentText, exactIndex + offset, 1.0);
        }

        // 2. 尝试核心内容匹配 (Trimmed Match)
        // 有时候开头结尾的空白字符或者标点可能有变化
        const trimmedSnippet = textSnippet.trim();
        const trimmedIndex = currentText.indexOf(trimmedSnippet);
        if (trimmedIndex !== -1) {
            // 需要修正 offset：找到 trimmedSnippet 在原 snippet 中的位置
            const internalOffset = textSnippet.indexOf(trimmedSnippet);
            // new offset = original offset - internal offset (approximate)
            return this.indexToPos(currentText, trimmedIndex + (offset - internalOffset), 0.9);
        }

        // 3. 降级方案：行匹配 (Line Matching)
        // 尝试把 snippet 拆成行，找最长的一行或者中间行在文中的位置
        // 这里做一个简化的模糊搜索：如果 snippet 包含换行符，我们尝试找其中最长的一行
        const snippetLines = textSnippet.split("\n");
        let bestLineMatchIndex = -1;
        let maxLen = 0;

        for (const line of snippetLines) {
            const trimmed = line.trim();
            if (trimmed.length > 10 && trimmed.length > maxLen) {
                const idx = currentText.indexOf(trimmed);
                if (idx !== -1) {
                    bestLineMatchIndex = idx;
                    maxLen = trimmed.length;
                }
            }
        }

        if (bestLineMatchIndex !== -1) {
            return this.indexToPos(currentText, bestLineMatchIndex, 0.6);
        }

        return null;
    }

    /**
     * 辅助：将绝对索引转换为行号和列号
     */
    private static indexToPos(text: string, index: number, confidence: number): MatchResult {
        let line = 0;
        let ch = 0;

        // 简单的遍历查找
        for (let i = 0; i < text.length; i++) {
            if (i === index) {
                return { line, ch, confidence };
            }
            if (text[i] === "\n") {
                line++;
                ch = 0;
            } else {
                ch++;
            }
        }

        return { line, ch, confidence };
    }
}
