import type { EditorSelection } from "@codemirror/state";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet } from "@codemirror/view";
import {
    findHybridMarkdownBlocks,
    type HybridMarkdownBlock,
} from "src/editor/hybridMarkdownBlocks";

export interface HybridInlineTokenForTest {
    className: string;
    from: number;
    hidden?: boolean;
    to: number;
}

interface SelectionRangeLike {
    from: number;
    to: number;
}

interface SelectionLike extends Partial<SelectionRangeLike> {
    main?: SelectionRangeLike;
    ranges?: readonly SelectionRangeLike[];
}

interface TokenBuildOptions {
    blocks?: HybridMarkdownBlock[];
}

function isEscaped(text: string, index: number): boolean {
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor--) {
        backslashes++;
    }
    return backslashes % 2 === 1;
}

function getSelectionRanges(selection: EditorSelection | SelectionLike): SelectionRangeLike[] {
    if (
        "from" in selection &&
        "to" in selection &&
        typeof selection.from === "number" &&
        typeof selection.to === "number"
    ) {
        return [
            {
                from: Math.min(selection.from, selection.to),
                to: Math.max(selection.from, selection.to),
            },
        ];
    }

    if ("ranges" in selection && selection.ranges && selection.ranges.length > 0) {
        return selection.ranges.map((range) => ({
            from: Math.min(range.from, range.to),
            to: Math.max(range.from, range.to),
        }));
    }

    const main = "main" in selection ? selection.main : undefined;
    if (main) {
        return [
            {
                from: Math.min(main.from, main.to),
                to: Math.max(main.from, main.to),
            },
        ];
    }

    return [{ from: 0, to: 0 }];
}

function isTokenActive(
    from: number,
    to: number,
    selection: EditorSelection | SelectionLike,
): boolean {
    return getSelectionRanges(selection).some((range) => {
        if (range.from !== range.to) {
            return range.from <= to && range.to >= from;
        }
        return range.from >= from - 1 && range.from <= to + 1;
    });
}

function intersectsRange(
    from: number,
    to: number,
    ranges: Array<Pick<HybridMarkdownBlock, "from" | "to">>,
): boolean {
    return ranges.some((range) => from < range.to && to > range.from);
}

function pushFormattingToken(
    tokens: HybridInlineTokenForTest[],
    className: string,
    from: number,
    to: number,
    selection: EditorSelection | SelectionLike,
    hiddenByDefault = true,
): void {
    if (from >= to) {
        return;
    }
    tokens.push({
        className,
        from,
        hidden: hiddenByDefault ? !isTokenActive(from, to, selection) : false,
        to,
    });
}

function pushMarkToken(
    tokens: HybridInlineTokenForTest[],
    className: string,
    from: number,
    to: number,
): void {
    if (from >= to) {
        return;
    }
    tokens.push({ className, from, to });
}

function collectLineFormattingTokens(
    markdown: string,
    selection: EditorSelection | SelectionLike,
    skipRanges: Array<Pick<HybridMarkdownBlock, "from" | "to">>,
    tokens: HybridInlineTokenForTest[],
): void {
    const linePattern = /.*(?:\r?\n|$)/g;
    let match: RegExpExecArray | null;

    while ((match = linePattern.exec(markdown)) !== null) {
        if (match[0].length === 0) {
            break;
        }

        const lineFrom = match.index;
        const rawLine = match[0];
        const line = rawLine.replace(/\r?\n$/, "");
        const lineTo = lineFrom + line.length;

        if (intersectsRange(lineFrom, lineTo, skipRanges)) {
            if (lineFrom + rawLine.length >= markdown.length) {
                break;
            }
            continue;
        }

        const heading = line.match(/^(\s{0,3})(#{1,6}\s+)/);
        if (heading) {
            pushFormattingToken(
                tokens,
                "cm-formatting cm-formatting-header",
                lineFrom + heading[1].length,
                lineFrom + heading[1].length + heading[2].length,
                selection,
            );
        }

        const list = line.match(/^(\s{0,6})((?:[-+*]|\d+[.)])\s+)/);
        if (list) {
            const ordered = /^\d/.test(list[2]);
            const depth = Math.max(1, Math.floor(list[1].replace(/\t/g, "    ").length / 2) + 1);
            pushFormattingToken(
                tokens,
                `cm-formatting cm-formatting-list ${
                    ordered ? "cm-formatting-list-ol" : "cm-formatting-list-ul"
                } cm-list-${depth}`,
                lineFrom + list[1].length,
                lineFrom + list[1].length + list[2].length,
                selection,
                false,
            );
        }

        const quote = line.match(/^(\s{0,3})(>\s?)/);
        if (quote) {
            pushFormattingToken(
                tokens,
                "cm-formatting cm-formatting-quote",
                lineFrom + quote[1].length,
                lineFrom + quote[1].length + quote[2].length,
                selection,
                false,
            );
        }

        if (lineFrom + rawLine.length >= markdown.length) {
            break;
        }
    }
}

function collectStrongTokens(
    markdown: string,
    selection: EditorSelection | SelectionLike,
    skipRanges: Array<Pick<HybridMarkdownBlock, "from" | "to">>,
    tokens: HybridInlineTokenForTest[],
): void {
    const strongPattern = /\*\*([^*\n]+?)\*\*/g;
    let match: RegExpExecArray | null;

    while ((match = strongPattern.exec(markdown)) !== null) {
        const from = match.index;
        const to = from + match[0].length;
        if (isEscaped(markdown, from) || intersectsRange(from, to, skipRanges)) {
            continue;
        }

        const innerFrom = from + 2;
        const innerTo = to - 2;
        pushFormattingToken(
            tokens,
            "cm-formatting cm-formatting-strong",
            from,
            innerFrom,
            selection,
        );
        pushMarkToken(tokens, "cm-strong", innerFrom, innerTo);
        pushFormattingToken(
            tokens,
            "cm-formatting cm-formatting-strong",
            innerTo,
            to,
            selection,
        );
    }
}

function collectInlineCodeTokens(
    markdown: string,
    selection: EditorSelection | SelectionLike,
    skipRanges: Array<Pick<HybridMarkdownBlock, "from" | "to">>,
    tokens: HybridInlineTokenForTest[],
): void {
    const codePattern = /`([^`\n]+?)`/g;
    let match: RegExpExecArray | null;

    while ((match = codePattern.exec(markdown)) !== null) {
        const from = match.index;
        const to = from + match[0].length;
        if (isEscaped(markdown, from) || intersectsRange(from, to, skipRanges)) {
            continue;
        }

        pushFormattingToken(tokens, "cm-formatting cm-formatting-code", from, from + 1, selection);
        pushMarkToken(tokens, "cm-inline-code", from + 1, to - 1);
        pushFormattingToken(tokens, "cm-formatting cm-formatting-code", to - 1, to, selection);
    }
}

function collectMarkdownLinkTokens(
    markdown: string,
    selection: EditorSelection | SelectionLike,
    skipRanges: Array<Pick<HybridMarkdownBlock, "from" | "to">>,
    tokens: HybridInlineTokenForTest[],
): void {
    const linkPattern = /\[([^\]\n]+?)\]\(([^)\n]+?)\)/g;
    let match: RegExpExecArray | null;

    while ((match = linkPattern.exec(markdown)) !== null) {
        const from = match.index;
        const to = from + match[0].length;
        if (isEscaped(markdown, from) || intersectsRange(from, to, skipRanges)) {
            continue;
        }

        const textFrom = from + 1;
        const textTo = textFrom + match[1].length;
        pushFormattingToken(tokens, "cm-formatting cm-formatting-link", from, textFrom, selection);
        pushMarkToken(tokens, "cm-link", textFrom, textTo);
        pushFormattingToken(tokens, "cm-formatting cm-formatting-link", textTo, to, selection);
    }
}

function collectWikiLinkTokens(
    markdown: string,
    selection: EditorSelection | SelectionLike,
    skipRanges: Array<Pick<HybridMarkdownBlock, "from" | "to">>,
    tokens: HybridInlineTokenForTest[],
): void {
    const wikiPattern = /\[\[([^\]\n|]+?)(?:\|([^\]\n]+?))?\]\]/g;
    let match: RegExpExecArray | null;

    while ((match = wikiPattern.exec(markdown)) !== null) {
        const from = match.index;
        const to = from + match[0].length;
        if (isEscaped(markdown, from) || intersectsRange(from, to, skipRanges)) {
            continue;
        }

        const hasAlias = typeof match[2] === "string";
        const displayText = hasAlias ? match[2] : match[1];
        const displayFrom = hasAlias
            ? from + 2 + match[1].length + 1
            : from + 2;
        const displayTo = displayFrom + displayText.length;

        pushFormattingToken(tokens, "cm-formatting cm-formatting-link", from, displayFrom, selection);
        pushMarkToken(tokens, "cm-link", displayFrom, displayTo);
        pushFormattingToken(tokens, "cm-formatting cm-formatting-link", displayTo, to, selection);
    }
}

export function collectHybridInlineTokensForTest(
    markdown: string,
    selection: EditorSelection | SelectionLike,
    options: TokenBuildOptions = {},
): HybridInlineTokenForTest[] {
    const blocks = options.blocks ?? findHybridMarkdownBlocks(markdown);
    const skipRanges = blocks.filter((block) => block.renderMode === "widget");
    const tokens: HybridInlineTokenForTest[] = [];

    collectLineFormattingTokens(markdown, selection, skipRanges, tokens);
    collectStrongTokens(markdown, selection, skipRanges, tokens);
    collectInlineCodeTokens(markdown, selection, skipRanges, tokens);
    collectMarkdownLinkTokens(markdown, selection, skipRanges, tokens);
    collectWikiLinkTokens(markdown, selection, skipRanges, tokens);

    return tokens.sort((a, b) => a.from - b.from || a.to - b.to || a.className.localeCompare(b.className));
}

export function collectHybridInlineDecorations(
    markdown: string,
    selection: EditorSelection,
    blocks?: HybridMarkdownBlock[],
): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const tokens = collectHybridInlineTokensForTest(markdown, selection, { blocks });

    for (const token of tokens) {
        if (token.hidden) {
            builder.add(token.from, token.to, Decoration.replace({ inclusive: false }));
            continue;
        }

        builder.add(token.from, token.to, Decoration.mark({ class: token.className }));
    }

    return builder.finish();
}
