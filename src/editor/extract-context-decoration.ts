import {
    RangeSetBuilder,
    StateEffect,
    StateField,
    type Extension,
    type Transaction,
} from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    type ViewUpdate,
} from "@codemirror/view";

export interface ExtractContextRanges {
    currentOuterFrom: number;
    currentOuterTo: number;
    currentInnerFrom: number;
    currentInnerTo: number;
    currentOpenTokenFrom: number;
    currentOpenTokenTo: number;
    currentCloseTokenFrom: number;
    currentCloseTokenTo: number;
}

export interface ExtractContextUpdate {
    markdown: string;
    ranges: ExtractContextRanges;
}

export const setExtractContextRangesEffect = StateEffect.define<ExtractContextRanges>();
const LEFT_ASSOC = -1;
const RIGHT_ASSOC = 1;

function clampPosition(position: number, docLength: number): number {
    if (!Number.isFinite(position)) {
        return 0;
    }
    return Math.max(0, Math.min(docLength, Math.round(position)));
}

function normalizePair(from: number, to: number, docLength: number): { from: number; to: number } {
    const normalizedFrom = clampPosition(from, docLength);
    const normalizedTo = Math.max(normalizedFrom, clampPosition(to, docLength));
    return { from: normalizedFrom, to: normalizedTo };
}

function normalizeExtractContextRangesForDoc(
    ranges: ExtractContextRanges,
    docLength: number,
): ExtractContextRanges {
    const outer = normalizePair(ranges.currentOuterFrom, ranges.currentOuterTo, docLength);
    const inner = normalizePair(ranges.currentInnerFrom, ranges.currentInnerTo, docLength);
    const openToken = normalizePair(
        ranges.currentOpenTokenFrom,
        ranges.currentOpenTokenTo,
        docLength,
    );
    const closeToken = normalizePair(
        ranges.currentCloseTokenFrom,
        ranges.currentCloseTokenTo,
        docLength,
    );

    return {
        currentOuterFrom: outer.from,
        currentOuterTo: outer.to,
        currentInnerFrom: inner.from,
        currentInnerTo: inner.to,
        currentOpenTokenFrom: openToken.from,
        currentOpenTokenTo: openToken.to,
        currentCloseTokenFrom: closeToken.from,
        currentCloseTokenTo: closeToken.to,
    };
}

function mapExtractContextRanges(
    ranges: ExtractContextRanges,
    transaction: Transaction,
): ExtractContextRanges {
    const startDocLength = transaction.startState.doc.length;
    const safeRanges = normalizeExtractContextRangesForDoc(ranges, startDocLength);
    return normalizeExtractContextRangesForDoc(
        {
            currentOuterFrom: transaction.changes.mapPos(
                safeRanges.currentOuterFrom,
                RIGHT_ASSOC,
            ),
            currentOuterTo: transaction.changes.mapPos(safeRanges.currentOuterTo, LEFT_ASSOC),
            currentInnerFrom: transaction.changes.mapPos(
                safeRanges.currentInnerFrom,
                LEFT_ASSOC,
            ),
            currentInnerTo: transaction.changes.mapPos(safeRanges.currentInnerTo, RIGHT_ASSOC),
            currentOpenTokenFrom: transaction.changes.mapPos(
                safeRanges.currentOpenTokenFrom,
                RIGHT_ASSOC,
            ),
            currentOpenTokenTo: transaction.changes.mapPos(
                safeRanges.currentOpenTokenTo,
                LEFT_ASSOC,
            ),
            currentCloseTokenFrom: transaction.changes.mapPos(
                safeRanges.currentCloseTokenFrom,
                RIGHT_ASSOC,
            ),
            currentCloseTokenTo: transaction.changes.mapPos(
                safeRanges.currentCloseTokenTo,
                LEFT_ASSOC,
            ),
        },
        transaction.newDoc.length,
    );
}

export const extractContextRangesField = StateField.define<ExtractContextRanges | null>({
    create: () => null,
    update(value, transaction) {
        for (const effect of transaction.effects) {
            if (effect.is(setExtractContextRangesEffect)) {
                return normalizeExtractContextRangesForDoc(effect.value, transaction.newDoc.length);
            }
        }

        return value ? mapExtractContextRanges(value, transaction) : value;
    },
});

function selectionTouchesToken(view: EditorView, from: number, to: number): boolean {
    if (to <= from) {
        return false;
    }
    const selection = view.state.selection.main;
    if (selection.empty) {
        return selection.from >= from && selection.from <= to;
    }
    return selection.from <= to && selection.to >= from;
}

function shouldRevealToken(view: EditorView, from: number, to: number): boolean {
    return view.state.facet(EditorView.editable) && selectionTouchesToken(view, from, to);
}

function buildExtractContextDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const ranges = view.state.field(extractContextRangesField);
    if (!ranges) {
        return builder.finish();
    }

    const docLength = view.state.doc.length;
    const decorations: Array<{ from: number; to: number; decoration: Decoration }> = [];
    const muted = Decoration.mark({ class: "sr-extract-context-muted" });
    const boundary = Decoration.mark({ class: "sr-extract-context-boundary" });

    if (ranges.currentOuterFrom > 0) {
        decorations.push({ from: 0, to: ranges.currentOuterFrom, decoration: muted });
    }
    if (ranges.currentOuterTo < docLength) {
        decorations.push({ from: ranges.currentOuterTo, to: docLength, decoration: muted });
    }
    if (ranges.currentOpenTokenTo > ranges.currentOpenTokenFrom) {
        const revealOpenToken = shouldRevealToken(
            view,
            ranges.currentOpenTokenFrom,
            ranges.currentOpenTokenTo,
        );
        decorations.push({
            from: ranges.currentOpenTokenFrom,
            to: ranges.currentOpenTokenTo,
            decoration: revealOpenToken
                ? boundary
                : Decoration.replace({ inclusive: false }),
        });
    }
    if (ranges.currentCloseTokenTo > ranges.currentCloseTokenFrom) {
        const revealCloseToken = shouldRevealToken(
            view,
            ranges.currentCloseTokenFrom,
            ranges.currentCloseTokenTo,
        );
        decorations.push({
            from: ranges.currentCloseTokenFrom,
            to: ranges.currentCloseTokenTo,
            decoration: revealCloseToken
                ? boundary
                : Decoration.replace({ inclusive: false }),
        });
    }

    decorations
        .filter((item) => item.from >= 0 && item.to <= docLength && item.to > item.from)
        .sort((left, right) => left.from - right.from || left.to - right.to)
        .forEach((item) => builder.add(item.from, item.to, item.decoration));

    return builder.finish();
}

function createExtractContextDecorationPlugin(): Extension {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = buildExtractContextDecorations(view);
            }

            update(update: ViewUpdate): void {
                if (update.docChanged || update.viewportChanged || update.transactions.length > 0) {
                    this.decorations = buildExtractContextDecorations(update.view);
                }
            }
        },
        {
            decorations: (plugin) => plugin.decorations,
        },
    );
}

export const extractContextTheme = EditorView.baseTheme({
    ".sr-extract-context-muted": {
        opacity: "0.5",
    },
    ".sr-extract-context-boundary": {
        color: "var(--text-accent)",
        backgroundColor: "var(--background-modifier-hover)",
        borderRadius: "3px",
        boxShadow: "0 0 0 1px var(--background-modifier-border)",
        fontFamily: "var(--font-monospace)",
        fontWeight: "600",
    },
    ".sr-extract-context-editor .cm-content": {
        fontFamily: "var(--font-text)",
    },
});

export function createExtractContextDecorationExtensions(): Extension[] {
    return [extractContextRangesField, createExtractContextDecorationPlugin(), extractContextTheme];
}
