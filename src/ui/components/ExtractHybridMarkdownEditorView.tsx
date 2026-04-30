/** @jsxImportSource react */

import { useEffect, useLayoutEffect, useRef } from "react";
import type { FC } from "react";
import {
    Compartment,
    EditorSelection,
    EditorState,
    RangeSetBuilder,
    StateEffect,
    StateField,
} from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    dropCursor,
    EditorView,
    keymap,
    WidgetType,
} from "@codemirror/view";
import { setIcon, type Component } from "obsidian";
import {
    findHybridMarkdownBlocks,
    type HybridMarkdownBlock,
} from "src/editor/hybridMarkdownBlocks";
import { collectHybridInlineDecorations } from "src/editor/hybridMarkdownInline";
import {
    eventMatchesOfficialEditorCommandHotkey,
    handleHybridEditorHotkey,
    logHybridEditorHotkeyResolution,
} from "src/editor/obsidianHotkeyBridge";
import {
    insertMarkdownTableColumn,
    insertMarkdownTableRow,
    moveMarkdownTableColumn,
    moveMarkdownTableRow,
    parseMarkdownTableBlock,
    updateMarkdownTableCell,
} from "src/editor/hybridMarkdownTable";
import {
    createExtractContextDecorationExtensions,
    extractContextRangesField,
    setExtractContextRangesEffect,
    type ExtractContextRanges,
    type ExtractContextUpdate,
} from "src/editor/extract-context-decoration";
import { createIrExtractDecorationExtensions } from "src/editor/ir-extract-decoration";
import { renderSyroMarkdownToElement } from "src/ui/markdown/renderSyroMarkdown";
import type SRPlugin from "src/main";

type ExtractHybridMode = "review" | "edit";

interface ExtractHybridMarkdownEditorViewProps {
    value: string;
    ranges: ExtractContextRanges;
    mode: ExtractHybridMode;
    onChange: (update: ExtractContextUpdate) => void;
    onEnterEdit?: () => void;
    onExit: () => void;
    onReviewKeyDown?: (event: KeyboardEvent) => boolean;
    plugin: SRPlugin;
    renderMarkdown?: (text: string, el: HTMLElement) => Promise<void> | void;
    sourcePath?: string;
    onReady?: () => void;
    onDebugEvent?: (event: ExtractRenderDebugEvent) => void;
}

interface ExtractRenderDebugEvent {
    stage: string;
    detail?: Record<string, string | number | boolean | null>;
    error?: string;
}

interface RenderDeps {
    getRenderMarkdown: () => ((text: string, el: HTMLElement) => Promise<void> | void) | undefined;
    plugin: SRPlugin;
    sourcePath?: string;
    tableDrafts: Map<string, TableDraft>;
    registerRenderPromise?: (promise: Promise<void>) => void;
    emitDebug?: (event: ExtractRenderDebugEvent) => void;
}

interface TableDraftCell {
    col: number;
    row: number;
    value: string;
}

interface TableDraft {
    blockFrom: number;
    blockTo: number;
    cells: Map<string, TableDraftCell>;
    originalMarkdown: string;
}

const setHybridModeEffect = StateEffect.define<ExtractHybridMode>();

const hybridModeField = StateField.define<ExtractHybridMode>({
    create: () => "review",
    update(value, transaction) {
        let next = value;
        for (const effect of transaction.effects) {
            if (effect.is(setHybridModeEffect)) {
                next = effect.value;
            }
        }
        return next;
    },
});

interface ScrollAnchor {
    pos?: number;
    top?: number;
    ratio?: number;
    scrollTop: number;
}

function captureScrollAnchor(view: EditorView): ScrollAnchor {
    const scroll = view.scrollDOM;
    const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    const ratio = maxScrollTop > 0 ? scroll.scrollTop / maxScrollTop : 0;

    try {
        const testRange = document.createRange();
        if (typeof testRange.getClientRects !== "function") {
            return { ratio, scrollTop: scroll.scrollTop };
        }

        const rect = scroll.getBoundingClientRect();
        const pos = view.posAtCoords({
            x: rect.left + Math.min(40, Math.max(1, rect.width / 2)),
            y: rect.top + rect.height / 2,
        });
        const coords = pos === null ? null : view.coordsAtPos(pos);

        if (pos !== null && coords) {
            return {
                pos,
                top: coords.top,
                ratio,
                scrollTop: scroll.scrollTop,
            };
        }
    } catch {
        // jsdom and some hidden Obsidian panes do not expose layout coordinates.
    }

    return { ratio, scrollTop: scroll.scrollTop };
}

function restoreScrollAnchor(view: EditorView, anchor: ScrollAnchor): void {
    const scroll = view.scrollDOM;
    const restore = () => {
        const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);

        if (anchor.pos !== undefined && anchor.top !== undefined) {
            try {
                const nextCoords = view.coordsAtPos(Math.min(anchor.pos, view.state.doc.length));
                if (nextCoords) {
                    const delta = nextCoords.top - anchor.top;
                    scroll.scrollTop = Math.max(
                        0,
                        Math.min(maxScrollTop, scroll.scrollTop + delta),
                    );
                    return;
                }
            } catch {
                // Fall back to the ratio path below.
            }
        }

        if (anchor.ratio !== undefined) {
            scroll.scrollTop = Math.max(0, Math.min(maxScrollTop, maxScrollTop * anchor.ratio));
            return;
        }

        scroll.scrollTop = Math.max(0, Math.min(maxScrollTop, anchor.scrollTop));
    };

    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(restore);
    });
}

function hasVisibleManualIrWrapper(markdown: string, ranges: ExtractContextRanges): boolean {
    return (
        markdown.slice(ranges.currentOpenTokenFrom, ranges.currentOpenTokenTo) === "{{ir::" &&
        markdown.slice(ranges.currentCloseTokenFrom, ranges.currentCloseTokenTo) === "}}"
    );
}

function stripCurrentOuterWrapperForBlock(
    block: HybridMarkdownBlock,
    ranges: ExtractContextRanges | null,
    fullMarkdown: string,
): string {
    if (!ranges || !hasVisibleManualIrWrapper(fullMarkdown, ranges)) {
        return block.markdown;
    }

    const openFrom = ranges.currentOpenTokenFrom - block.from;
    const openTo = ranges.currentOpenTokenTo - block.from;
    const closeFrom = ranges.currentCloseTokenFrom - block.from;
    const closeTo = ranges.currentCloseTokenTo - block.from;
    const removals: Array<{ from: number; to: number }> = [];

    if (openTo > 0 && openFrom < block.markdown.length) {
        removals.push({
            from: Math.max(0, openFrom),
            to: Math.min(block.markdown.length, openTo),
        });
    }

    if (closeTo > 0 && closeFrom < block.markdown.length) {
        removals.push({
            from: Math.max(0, closeFrom),
            to: Math.min(block.markdown.length, closeTo),
        });
    }

    if (removals.length === 0) {
        return block.markdown;
    }

    return removals
        .filter((range) => range.from < range.to)
        .sort((a, b) => b.from - a.from)
        .reduce(
            (nextMarkdown, range) =>
                nextMarkdown.slice(0, range.from) + nextMarkdown.slice(range.to),
            block.markdown,
        );
}

function getBlockContextClass(
    block: HybridMarkdownBlock,
    ranges: ExtractContextRanges | null,
): string {
    const className = getBlockContextClassName(block, ranges);
    return className ? ` ${className}` : "";
}

function getBlockContextClassName(
    block: HybridMarkdownBlock,
    ranges: ExtractContextRanges | null,
): string {
    if (!ranges) {
        return "";
    }

    if (block.to <= ranges.currentOuterFrom || block.from >= ranges.currentOuterTo) {
        return "sr-extract-context-muted";
    }

    return "sr-extract-context-current";
}

function getLineBlockClass(
    block: HybridMarkdownBlock,
    ranges: ExtractContextRanges | null,
): string {
    const classes = [getBlockContextClassName(block, ranges)].filter(Boolean);

    if (block.kind === "heading") {
        classes.push("HyperMD-header", `HyperMD-header-${block.depth ?? 1}`);
    } else if (block.kind === "list") {
        classes.push("HyperMD-list-line", `HyperMD-list-line-${block.depth ?? 1}`);
    } else if (block.kind === "blockquote") {
        classes.push("HyperMD-quote");
    }

    return classes.join(" ");
}

function getTableDraftKey(block: HybridMarkdownBlock): string {
    return `${block.from}:${block.to}`;
}

function getTableCellDraftKey(row: number, col: number): string {
    return `${row}:${col}`;
}

function recordTableCellDraft(
    block: HybridMarkdownBlock,
    drafts: Map<string, TableDraft>,
    row: number,
    col: number,
    value: string,
): void {
    const draftKey = getTableDraftKey(block);
    const draft = drafts.get(draftKey) ?? {
        blockFrom: block.from,
        blockTo: block.to,
        cells: new Map<string, TableDraftCell>(),
        originalMarkdown: block.markdown,
    };

    draft.cells.set(getTableCellDraftKey(row, col), { col, row, value });
    drafts.set(draftKey, draft);
}

function flushTableDrafts(view: EditorView, drafts: Map<string, TableDraft>): boolean {
    const changes: Array<{ from: number; insert: string; to: number }> = [];

    for (const draft of drafts.values()) {
        if (draft.cells.size === 0) {
            continue;
        }

        if (view.state.doc.sliceString(draft.blockFrom, draft.blockTo) !== draft.originalMarkdown) {
            continue;
        }

        let nextMarkdown = draft.originalMarkdown;
        for (const cell of draft.cells.values()) {
            nextMarkdown = updateMarkdownTableCell(nextMarkdown, cell.row, cell.col, cell.value);
        }

        if (nextMarkdown !== draft.originalMarkdown) {
            changes.push({
                from: draft.blockFrom,
                insert: nextMarkdown,
                to: draft.blockTo,
            });
        }
    }

    drafts.clear();

    if (changes.length === 0) {
        return false;
    }

    view.dispatch({
        changes: changes.sort((a, b) => a.from - b.from),
        scrollIntoView: false,
    });
    return true;
}

function getMarkdownTableColumnCount(markdown: string): number {
    const model = parseMarkdownTableBlock(markdown);
    if (!model) {
        return 0;
    }
    return Math.max(
        model.header.length,
        model.delimiter.length,
        ...model.rows.map((row) => row.length),
    );
}

function findCurrentTableBlock(
    view: EditorView,
    block: HybridMarkdownBlock,
): HybridMarkdownBlock | null {
    const docText = view.state.doc.toString();
    const blocks = findHybridMarkdownBlocks(docText).filter((item) => item.kind === "table");
    const exact = blocks.find((item) => item.from === block.from && item.to === block.to);
    if (exact) {
        return exact;
    }
    const anchored = blocks.find((item) => block.from >= item.from && block.from <= item.to);
    return anchored ?? blocks.find((item) => item.markdown === block.markdown) ?? null;
}

function applyTableTransform(
    view: EditorView,
    block: HybridMarkdownBlock,
    drafts: Map<string, TableDraft>,
    transform: (markdown: string) => string,
): void {
    flushTableDrafts(view, drafts);

    const currentBlock = findCurrentTableBlock(view, block);
    if (!currentBlock) {
        return;
    }

    const nextMarkdown = transform(currentBlock.markdown);
    if (nextMarkdown === currentBlock.markdown) {
        return;
    }

    view.dispatch({
        changes: {
            from: currentBlock.from,
            insert: nextMarkdown,
            to: currentBlock.to,
        },
        scrollIntoView: false,
    });
}

function trySetIcon(element: HTMLElement, icon: string): void {
    try {
        setIcon(element, icon);
    } catch {
        element.textContent = "";
    }
}

function ensureTableWrapper(table: HTMLTableElement): HTMLElement {
    if (table.parentElement?.classList.contains("table-wrapper")) {
        return table.parentElement;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "table-wrapper";
    table.parentElement?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
    return wrapper;
}

function wrapTableCellContents(cell: HTMLElement): void {
    if (cell.querySelector(":scope > .table-cell-wrapper")) {
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "table-cell-wrapper";
    while (cell.firstChild) {
        wrapper.appendChild(cell.firstChild);
    }
    cell.appendChild(wrapper);
}

function addTableColHandle(
    cell: HTMLElement,
    colIndex: number,
    block: HybridMarkdownBlock,
    view: EditorView,
    drafts: Map<string, TableDraft>,
): void {
    if (cell.querySelector(":scope > .table-col-drag-handle")) {
        return;
    }

    const handle = document.createElement("span");
    handle.className = "table-col-drag-handle";
    handle.draggable = true;
    handle.setAttribute("contenteditable", "false");
    handle.setAttribute("aria-hidden", "true");
    trySetIcon(handle, "grip-horizontal");
    handle.addEventListener("mousedown", (event) => event.stopPropagation());
    handle.addEventListener("dragstart", (event) => {
        event.stopPropagation();
        event.dataTransfer?.setData("text/plain", `col:${colIndex}`);
    });
    handle.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
    handle.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const payload = event.dataTransfer?.getData("text/plain") ?? "";
        const match = payload.match(/^col:(\d+)$/);
        if (!match) {
            return;
        }
        applyTableTransform(view, block, drafts, (markdown) =>
            moveMarkdownTableColumn(markdown, Number(match[1]), colIndex),
        );
    });
    cell.appendChild(handle);
}

function addTableRowHandle(
    cell: HTMLElement,
    rowIndex: number,
    block: HybridMarkdownBlock,
    view: EditorView,
    drafts: Map<string, TableDraft>,
): void {
    if (cell.querySelector(":scope > .table-row-drag-handle")) {
        return;
    }

    const handle = document.createElement("span");
    handle.className = "table-row-drag-handle";
    handle.draggable = rowIndex > 0;
    handle.setAttribute("contenteditable", "false");
    handle.setAttribute("aria-hidden", "true");
    trySetIcon(handle, "grip-vertical");
    handle.addEventListener("mousedown", (event) => event.stopPropagation());
    handle.addEventListener("dragstart", (event) => {
        event.stopPropagation();
        if (rowIndex <= 0) {
            event.preventDefault();
            return;
        }
        event.dataTransfer?.setData("text/plain", `row:${rowIndex}`);
    });
    handle.addEventListener("dragover", (event) => {
        if (rowIndex <= 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
    });
    handle.addEventListener("drop", (event) => {
        if (rowIndex <= 0) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const payload = event.dataTransfer?.getData("text/plain") ?? "";
        const match = payload.match(/^row:(\d+)$/);
        if (!match) {
            return;
        }
        applyTableTransform(view, block, drafts, (markdown) =>
            moveMarkdownTableRow(markdown, Number(match[1]), rowIndex),
        );
    });
    cell.insertBefore(handle, cell.firstChild);
}

function addTableActionButton(
    wrapper: HTMLElement,
    className: "table-col-btn" | "table-row-btn",
    onClick: () => void,
): void {
    if (wrapper.querySelector(`:scope > .${className}`)) {
        return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("contenteditable", "false");
    trySetIcon(button, "plus");
    button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
    });
    wrapper.appendChild(button);
}

function stringifyDebugError(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    if (typeof error === "string") {
        return error;
    }
    if (typeof error === "number") {
        return error.toString();
    }
    if (typeof error === "boolean") {
        return error ? "true" : "false";
    }
    if (error === null) {
        return "null";
    }
    try {
        const json = JSON.stringify(error);
        if (typeof json === "string") {
            return json;
        }
    } catch {
        return "Non-serializable error";
    }
    return "Unknown error";
}

function logHybridEditorDomKeydownDebug(
    plugin: SRPlugin,
    stage: string,
    event: KeyboardEvent,
    view: EditorView | null,
): void {
    if (!plugin.data.settings.showRuntimeDebugMessages) {
        return;
    }

    const selection = view?.state.selection.main;
    console.debug("[SR-HotkeyBridge]", {
        stage,
        detail: {
            altKey: event.altKey,
            code: event.code,
            ctrlKey: event.ctrlKey,
            defaultPrevented: event.defaultPrevented,
            docLength: view?.state.doc.length ?? null,
            isComposing: event.isComposing,
            key: event.key,
            metaKey: event.metaKey,
            repeat: event.repeat,
            selectionFrom: selection?.from ?? null,
            selectionTo: selection?.to ?? null,
            shiftKey: event.shiftKey,
            targetClassName:
                event.target instanceof HTMLElement ? event.target.className : null,
            targetTagName:
                event.target instanceof HTMLElement ? event.target.tagName.toLowerCase() : null,
        },
    });
}

function stopKeyboardEventPropagation(event: KeyboardEvent): void {
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
    }
}

class RenderedMarkdownBlockWidget extends WidgetType {
    constructor(
        private readonly block: HybridMarkdownBlock,
        private readonly markdown: string,
        private readonly className: string,
        private readonly deps: RenderDeps,
        private readonly mode: ExtractHybridMode,
    ) {
        super();
    }

    eq(other: RenderedMarkdownBlockWidget): boolean {
        return (
            other.block.from === this.block.from &&
            other.block.to === this.block.to &&
            other.markdown === this.markdown &&
            other.className === this.className &&
            other.mode === this.mode
        );
    }

    toDOM(view: EditorView): HTMLElement {
        const container = document.createElement("div");
        const tableClass = this.block.kind === "table" ? " cm-embed-block cm-table-widget" : "";
        container.className = `sr-hybrid-rendered-block markdown-preview-view markdown-rendered${tableClass}${this.className}`;
        container.dataset.srHybridBlockKind = this.block.kind;

        if (this.mode === "edit") {
            container.addEventListener("mousedown", (event) => {
                if (this.block.kind === "table") {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                view.dispatch({
                    selection: EditorSelection.cursor(
                        Math.min(this.block.from, view.state.doc.length),
                    ),
                    scrollIntoView: false,
                });
                view.contentDOM.focus({ preventScroll: true });
            });
        }

        this.deps.emitDebug?.({
            stage: "markdown-block-render-start",
            detail: {
                kind: this.block.kind,
                from: this.block.from,
                to: this.block.to,
                markdownLength: this.markdown.length,
            },
        });

        const renderResult: unknown = renderSyroMarkdownToElement({
            app: this.deps.plugin.app,
            markdown: this.markdown,
            owner: this.deps.plugin as unknown as Component,
            renderMarkdown: this.deps.getRenderMarkdown(),
            sourcePath: this.deps.sourcePath,
            target: container,
        });
        const renderPromise: Promise<void> = Promise.resolve(renderResult)
            .then((): void => {
                if (this.block.kind === "table") {
                    normalizeRenderedTableForLivePreview(
                        container,
                        this.mode,
                        this.block,
                        view,
                        this.deps.tableDrafts,
                    );
                }
                this.wireTableEditing(container, view);
                this.deps.emitDebug?.({
                    stage: "markdown-block-render-done",
                    detail: {
                        kind: this.block.kind,
                        from: this.block.from,
                        to: this.block.to,
                        childCount: container.childElementCount,
                    },
                });
            })
            .catch((error: unknown) => {
                this.deps.emitDebug?.({
                    stage: "markdown-block-render-error",
                    detail: {
                        kind: this.block.kind,
                        from: this.block.from,
                        to: this.block.to,
                    },
                    error: stringifyDebugError(error),
                });
                throw error;
            });
        const trackedRenderPromise: Promise<void> = renderPromise.catch((): void => undefined);
        this.deps.registerRenderPromise?.(trackedRenderPromise);
        void trackedRenderPromise;

        return container;
    }

    private wireTableEditing(container: HTMLElement, view: EditorView): void {
        if (this.mode !== "edit" || this.block.kind !== "table") {
            return;
        }

        const model = parseMarkdownTableBlock(this.block.markdown);
        if (!model) {
            return;
        }

        const table = container.querySelector("table");
        if (!table) {
            return;
        }

        const rows = Array.from(table.querySelectorAll("tr"));
        const editableCells: HTMLElement[] = [];

        const recordCell = (cell: HTMLElement, rowIndex: number, colIndex: number) => {
            recordTableCellDraft(
                this.block,
                this.deps.tableDrafts,
                rowIndex,
                colIndex,
                cell.textContent ?? "",
            );
        };

        const commitCell = (cell: HTMLElement, rowIndex: number, colIndex: number) => {
            recordCell(cell, rowIndex, colIndex);
            flushTableDrafts(view, this.deps.tableDrafts);
        };

        rows.forEach((row, rowIndex) => {
            const cells = Array.from(row.querySelectorAll<HTMLElement>("th,td"));
            cells.forEach((cell, colIndex) => {
                editableCells.push(cell);
                cell.setAttribute("contenteditable", "plaintext-only");
                if (cell.contentEditable !== "plaintext-only") {
                    cell.contentEditable = "true";
                }
                cell.classList.add("sr-hybrid-table-cell-editable");
                cell.addEventListener("mousedown", (event) => {
                    event.stopPropagation();
                });
                cell.addEventListener("input", () => {
                    recordCell(cell, rowIndex, colIndex);
                });
                cell.addEventListener("keydown", (event) => {
                    if (event.key !== "Enter" && event.key !== "Tab") {
                        return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    commitCell(cell, rowIndex, colIndex);

                    if (event.key === "Tab") {
                        const currentIndex = editableCells.indexOf(cell);
                        const direction = event.shiftKey ? -1 : 1;
                        const nextCell = editableCells[currentIndex + direction];
                        window.requestAnimationFrame(() => nextCell?.focus());
                    }
                });
            });
        });
    }
}

function normalizeRenderedTableForLivePreview(
    container: HTMLElement,
    mode: ExtractHybridMode,
    block: HybridMarkdownBlock,
    view: EditorView,
    drafts: Map<string, TableDraft>,
): void {
    const table = container.querySelector<HTMLTableElement>("table");
    if (!table) {
        return;
    }

    table.classList.add("table-editor");
    const wrapper = ensureTableWrapper(table);
    const rows = Array.from(table.querySelectorAll("tr"));

    rows.forEach((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll<HTMLElement>("th,td"));
        cells.forEach((cell, colIndex) => {
            wrapTableCellContents(cell);
            if (mode !== "edit") {
                return;
            }
            if (rowIndex === 0) {
                addTableColHandle(cell, colIndex, block, view, drafts);
            }
            if (colIndex === 0) {
                addTableRowHandle(cell, rowIndex, block, view, drafts);
            }
        });
    });

    if (mode !== "edit") {
        return;
    }

    addTableActionButton(wrapper, "table-row-btn", () => {
        applyTableTransform(view, block, drafts, (markdown) => {
            const model = parseMarkdownTableBlock(markdown);
            const lastRow = model ? model.rows.length : 0;
            return insertMarkdownTableRow(markdown, lastRow, "after");
        });
    });
    addTableActionButton(wrapper, "table-col-btn", () => {
        applyTableTransform(view, block, drafts, (markdown) => {
            const lastCol = Math.max(0, getMarkdownTableColumnCount(markdown) - 1);
            return insertMarkdownTableColumn(markdown, lastCol, "after");
        });
    });
}

function shouldRebuildHybridDecorations(
    transactionEffects: readonly StateEffect<unknown>[],
): boolean {
    return transactionEffects.some(
        (effect) => effect.is(setHybridModeEffect) || effect.is(setExtractContextRangesEffect),
    );
}

function buildHybridDecorations(state: EditorState, deps: RenderDeps): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const docText = state.doc.toString();
    const ranges = state.field(extractContextRangesField);
    const mode = state.field(hybridModeField);
    const blocks = findHybridMarkdownBlocks(docText);

    for (const block of blocks) {
        if (block.kind === "blank" || block.from >= block.to) {
            continue;
        }

        if (block.renderMode === "line") {
            const className = getLineBlockClass(block, ranges);
            if (!className) {
                continue;
            }

            let cursor = block.from;
            while (cursor < block.to) {
                const line = state.doc.lineAt(cursor);
                builder.add(line.from, line.from, Decoration.line({ class: className }));
                if (line.to >= block.to || line.to + 1 > state.doc.length) {
                    break;
                }
                cursor = line.to + 1;
            }
            continue;
        }

        const renderedMarkdown = stripCurrentOuterWrapperForBlock(block, ranges, docText);
        builder.add(
            block.from,
            block.to,
            Decoration.replace({
                block: true,
                widget: new RenderedMarkdownBlockWidget(
                    block,
                    renderedMarkdown,
                    getBlockContextClass(block, ranges),
                    deps,
                    mode,
                ),
            }),
        );
    }

    return builder.finish();
}

function buildHybridInlineDecorations(state: EditorState): DecorationSet {
    const docText = state.doc.toString();
    const mode = state.field(hybridModeField);
    return collectHybridInlineDecorations(
        docText,
        state.selection,
        findHybridMarkdownBlocks(docText),
        { revealFormatting: mode === "edit" },
    );
}

function createHybridMarkdownDecorationsField(deps: RenderDeps): Extension {
    return StateField.define<DecorationSet>({
        create(state) {
            return buildHybridDecorations(state, deps);
        },
        update(value, transaction) {
            if (
                transaction.docChanged ||
                transaction.selection ||
                shouldRebuildHybridDecorations(transaction.effects)
            ) {
                return buildHybridDecorations(transaction.state, deps);
            }

            return value.map(transaction.changes);
        },
        provide: (field) => EditorView.decorations.from(field),
    });
}

function createHybridInlineDecorationsField(): Extension {
    return StateField.define<DecorationSet>({
        create(state) {
            return buildHybridInlineDecorations(state);
        },
        update(value, transaction) {
            if (
                transaction.docChanged ||
                transaction.selection ||
                shouldRebuildHybridDecorations(transaction.effects)
            ) {
                return buildHybridInlineDecorations(transaction.state);
            }

            return value.map(transaction.changes);
        },
        provide: (field) => EditorView.decorations.from(field),
    });
}

export const ExtractHybridMarkdownEditorView: FC<ExtractHybridMarkdownEditorViewProps> = ({
    mode,
    onChange,
    onEnterEdit,
    onExit,
    onReviewKeyDown,
    plugin,
    ranges,
    renderMarkdown,
    sourcePath,
    onReady,
    onDebugEvent,
    value,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const editableCompartmentRef = useRef(new Compartment());
    const lastModeRef = useRef(mode);
    const onChangeRef = useRef(onChange);
    const onEnterEditRef = useRef(onEnterEdit);
    const onExitRef = useRef(onExit);
    const onReviewKeyDownRef = useRef(onReviewKeyDown);
    const onReadyRef = useRef(onReady);
    const onDebugEventRef = useRef(onDebugEvent);
    const renderMarkdownRef = useRef(renderMarkdown);
    const renderPromisesRef = useRef<Promise<void>[]>([]);
    const readyGenerationRef = useRef(0);
    const tableDraftsRef = useRef(new Map<string, TableDraft>());
    const lastHotkeyLogModeRef = useRef<ExtractHybridMode | null>(null);

    useEffect(() => {
        onChangeRef.current = onChange;
        onEnterEditRef.current = onEnterEdit;
        onExitRef.current = onExit;
        onReviewKeyDownRef.current = onReviewKeyDown;
        onReadyRef.current = onReady;
        onDebugEventRef.current = onDebugEvent;
        renderMarkdownRef.current = renderMarkdown;
    }, [onChange, onEnterEdit, onExit, onReviewKeyDown, onReady, onDebugEvent, renderMarkdown]);

    useEffect(() => {
        if (mode === "edit" && lastHotkeyLogModeRef.current !== "edit") {
            logHybridEditorHotkeyResolution(plugin.app);
        }
        lastHotkeyLogModeRef.current = mode;
    }, [mode, plugin.app]);

    useEffect(() => {
        const currentView = viewRef.current;
        if (!currentView) {
            return;
        }

        const ownerDocument = currentView.dom.ownerDocument;
        const ownerWindow = ownerDocument.defaultView;
        const handleCapturedKeydown = (event: KeyboardEvent) => {
            const activeView = viewRef.current;
            if (!activeView) {
                return;
            }

            const target = event.target;
            if (!(target instanceof Node) || !activeView.dom.contains(target)) {
                return;
            }

            if (activeView.state.field(hybridModeField) !== "edit") {
                if (onReviewKeyDownRef.current?.(event)) {
                    stopKeyboardEventPropagation(event);
                    logHybridEditorDomKeydownDebug(
                        plugin,
                        "capture-keydown-review-shortcut-handled",
                        event,
                        activeView,
                    );
                    return;
                }

                if (eventMatchesOfficialEditorCommandHotkey(event, plugin.app)) {
                    event.preventDefault();
                    stopKeyboardEventPropagation(event);
                    logHybridEditorDomKeydownDebug(
                        plugin,
                        "capture-keydown-review-editor-hotkey-blocked",
                        event,
                        activeView,
                    );
                }
                return;
            }

            if (handleHybridEditorHotkey(event, activeView, plugin.app)) {
                stopKeyboardEventPropagation(event);
                logHybridEditorDomKeydownDebug(
                    plugin,
                    "capture-keydown-text-command-handled",
                    event,
                    activeView,
                );
                return;
            }
        };

        ownerWindow?.addEventListener("keydown", handleCapturedKeydown, true);
        ownerDocument.addEventListener("keydown", handleCapturedKeydown, true);
        return () => {
            ownerWindow?.removeEventListener("keydown", handleCapturedKeydown, true);
            ownerDocument.removeEventListener("keydown", handleCapturedKeydown, true);
        };
    }, [plugin, plugin.app]);

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const readyGeneration = readyGenerationRef.current + 1;
        readyGenerationRef.current = readyGeneration;
        renderPromisesRef.current = [];
        onDebugEventRef.current?.({
            stage: "editor-mount-start",
            detail: {
                markdownLength: value.length,
                mode,
                hasRenderMarkdown: renderMarkdownRef.current ? true : false,
            },
        });

        const deps: RenderDeps = {
            getRenderMarkdown: () => renderMarkdownRef.current,
            plugin,
            sourcePath,
            tableDrafts: tableDraftsRef.current,
            registerRenderPromise: (promise) => {
                renderPromisesRef.current.push(promise);
            },
            emitDebug: (event) => {
                onDebugEventRef.current?.(event);
            },
        };

        const state = EditorState.create({
            doc: value,
            extensions: [
                hybridModeField,
                editableCompartmentRef.current.of(EditorView.editable.of(mode === "edit")),
                EditorView.lineWrapping,
                dropCursor(),
                EditorView.domEventHandlers({
                    keydown: (event) => {
                        const currentView = viewRef.current;
                        if (!currentView) {
                            logHybridEditorDomKeydownDebug(plugin, "dom-keydown-ignored", event, currentView);
                            return false;
                        }

                        if (currentView.state.field(hybridModeField) !== "edit") {
                            if (onReviewKeyDownRef.current?.(event)) {
                                event.stopPropagation();
                                logHybridEditorDomKeydownDebug(
                                    plugin,
                                    "dom-keydown-review-shortcut-handled",
                                    event,
                                    currentView,
                                );
                                return true;
                            }

                            if (eventMatchesOfficialEditorCommandHotkey(event, plugin.app)) {
                                event.preventDefault();
                                event.stopPropagation();
                                logHybridEditorDomKeydownDebug(
                                    plugin,
                                    "dom-keydown-review-editor-hotkey-blocked",
                                    event,
                                    currentView,
                                );
                                return true;
                            }

                            logHybridEditorDomKeydownDebug(
                                plugin,
                                "dom-keydown-review-pass-through",
                                event,
                                currentView,
                            );
                            event.stopPropagation();
                            return false;
                        }

                        if (handleHybridEditorHotkey(event, currentView, plugin.app)) {
                            logHybridEditorDomKeydownDebug(
                                plugin,
                                "dom-keydown-text-command-handled",
                                event,
                                currentView,
                            );
                            return true;
                        }

                        logHybridEditorDomKeydownDebug(
                            plugin,
                            "dom-keydown-pass-through",
                            event,
                            currentView,
                        );
                        event.stopPropagation();
                        return false;
                    },
                }),
                keymap.of([
                    {
                        key: "Mod-Enter",
                        run: () => {
                            const currentView = viewRef.current;
                            if (currentView) {
                                flushTableDrafts(currentView, tableDraftsRef.current);
                            }
                            onExitRef.current();
                            return true;
                        },
                    },
                ]),
                ...createExtractContextDecorationExtensions(),
                ...createIrExtractDecorationExtensions({
                    canRevealSource: (view: EditorView) =>
                        view.state.field(hybridModeField) === "edit",
                    isLivePreviewHost: () => true,
                    getExcludedStarts: (view: EditorView) => {
                        const currentRanges = view.state.field(extractContextRangesField);
                        return currentRanges
                            ? new Set([currentRanges.currentOuterFrom])
                            : new Set<number>();
                    },
                }),
                createHybridMarkdownDecorationsField(deps),
                createHybridInlineDecorationsField(),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        onChangeRef.current({
                            markdown: update.state.doc.toString(),
                            ranges: update.state.field(extractContextRangesField),
                        });
                    }
                }),
                EditorView.theme({
                    "&": {
                        height: "100%",
                        backgroundColor: "transparent",
                    },
                    ".cm-scroller": {
                        height: "100%",
                        overflow: "auto",
                        backgroundColor: "transparent",
                    },
                    ".cm-content": {
                        minHeight: "100%",
                    },
                    "&.cm-focused": {
                        outline: "none",
                    },
                    ".cm-cursor": {
                        borderLeftColor: "var(--caret-color, var(--text-accent))",
                    },
                    ".cm-selectionBackground": {
                        backgroundColor: "var(--text-selection) !important",
                    },
                }),
            ],
        });

        const view = new EditorView({ state });
        viewRef.current = view;
        view.dispatch({
            effects: [setExtractContextRangesEffect.of(ranges), setHybridModeEffect.of(mode)],
        });
        container.replaceChildren();
        container.appendChild(view.dom);
        lastModeRef.current = mode;
        onDebugEventRef.current?.({
            stage: "editor-mounted",
            detail: {
                registeredMarkdownBlocks: renderPromisesRef.current.length,
                docLength: view.state.doc.length,
            },
        });

        void Promise.resolve().then(async () => {
            const initialRenders = renderPromisesRef.current.slice();
            onDebugEventRef.current?.({
                stage: "initial-render-wait",
                detail: {
                    registeredMarkdownBlocks: initialRenders.length,
                },
            });
            if (initialRenders.length > 0) {
                await Promise.allSettled(initialRenders);
            }
            if (viewRef.current === view && readyGenerationRef.current === readyGeneration) {
                onDebugEventRef.current?.({
                    stage: "ready",
                    detail: {
                        registeredMarkdownBlocks: initialRenders.length,
                    },
                });
                onReadyRef.current?.();
            } else {
                onDebugEventRef.current?.({
                    stage: "ready-skipped-stale-view",
                    detail: {
                        registeredMarkdownBlocks: initialRenders.length,
                    },
                });
            }
        });

        return () => {
            readyGenerationRef.current += 1;
            view.destroy();
            viewRef.current = null;
        };
    }, []);

    useLayoutEffect(() => {
        const view = viewRef.current;
        if (!view) {
            return;
        }

        const modeChanged = lastModeRef.current !== mode;
        const exitingEditMode = modeChanged && lastModeRef.current === "edit" && mode !== "edit";
        let flushedBeforeExit = false;
        if (exitingEditMode) {
            flushedBeforeExit = flushTableDrafts(view, tableDraftsRef.current);
        }

        let currentValue = view.state.doc.toString();
        const externalValueChanged = value !== currentValue;
        if (!exitingEditMode && externalValueChanged && lastModeRef.current === "edit") {
            flushTableDrafts(view, tableDraftsRef.current);
            currentValue = view.state.doc.toString();
        }

        const valueChanged = value !== currentValue && !exitingEditMode && !flushedBeforeExit;
        const anchor = modeChanged || valueChanged ? captureScrollAnchor(view) : null;
        const effects = [
            setExtractContextRangesEffect.of(ranges),
            setHybridModeEffect.of(mode),
            editableCompartmentRef.current.reconfigure(EditorView.editable.of(mode === "edit")),
        ];

        if (valueChanged) {
            view.dispatch({
                changes: { from: 0, to: currentValue.length, insert: value },
                effects,
            });
        } else {
            view.dispatch({ effects });
        }

        lastModeRef.current = mode;

        if (anchor) {
            restoreScrollAnchor(view, anchor);
        }

        if (modeChanged && mode === "edit") {
            window.requestAnimationFrame(() => view.contentDOM.focus({ preventScroll: true }));
        }
    }, [mode, ranges, value]);

    return (
        <div
            className="sr-hybrid-markdown-source markdown-source-view cm-s-obsidian mod-cm6 is-live-preview"
            data-sr-hybrid-mode={mode}
        >
            <div className="sr-cm-container" ref={containerRef} />
        </div>
    );
};
