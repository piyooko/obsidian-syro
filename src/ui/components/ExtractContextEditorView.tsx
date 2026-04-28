/** @jsxImportSource react */

import { useEffect, useRef } from "react";
import type { FC } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, dropCursor, EditorView, keymap } from "@codemirror/view";
import {
    createExtractContextDecorationExtensions,
    extractContextRangesField,
    setExtractContextRangesEffect,
    type ExtractContextRanges,
    type ExtractContextUpdate,
} from "src/editor/extract-context-decoration";
import { createIrExtractDecorationExtensions } from "src/editor/ir-extract-decoration";
import { livePreviewPlugin, livePreviewTheme } from "src/editor/live-preview-decoration";
import type SRPlugin from "src/main";
export { hasCurrentExtractWrapper } from "src/util/irExtractContext";

interface ExtractContextEditorViewProps {
    value: string;
    ranges: ExtractContextRanges;
    editable: boolean;
    onChange: (update: ExtractContextUpdate) => void;
    onExit: () => void;
    plugin: SRPlugin;
}

function getCurrentRanges(view: EditorView): ExtractContextRanges {
    const ranges = view.state.field(extractContextRangesField);
    if (!ranges) {
        throw new Error("[SR-Extract] Missing extract context ranges.");
    }
    return ranges;
}

export const ExtractContextEditorView: FC<ExtractContextEditorViewProps> = ({
    value,
    ranges,
    editable,
    onChange,
    onExit,
    plugin,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const editableCompartmentRef = useRef(new Compartment());
    const onChangeRef = useRef(onChange);
    const onExitRef = useRef(onExit);

    useEffect(() => {
        onChangeRef.current = onChange;
        onExitRef.current = onExit;
    }, [onChange, onExit]);

    useEffect(() => {
        if (!containerRef.current) return;
        void plugin;

        const state = EditorState.create({
            doc: value,
            extensions: [
                editableCompartmentRef.current.of(EditorView.editable.of(editable)),
                EditorView.lineWrapping,
                drawSelection(),
                dropCursor(),
                EditorView.domEventHandlers({
                    keydown: (event) => {
                        if (event.altKey && event.key.toLowerCase() === "e") {
                            event.preventDefault();
                            event.stopPropagation();
                            onExitRef.current();
                            return true;
                        }
                        return false;
                    },
                }),
                keymap.of([
                    {
                        key: "Mod-Enter",
                        run: () => {
                            onExitRef.current();
                            return true;
                        },
                    },
                ]),
                livePreviewPlugin,
                livePreviewTheme,
                ...createExtractContextDecorationExtensions(),
                ...createIrExtractDecorationExtensions({
                    isLivePreviewHost: (view: EditorView) =>
                        !!view.dom.closest(".sr-extract-context-editor"),
                    getExcludedStarts: () => {
                        const currentRanges = viewRef.current?.state.field(extractContextRangesField);
                        return currentRanges
                            ? new Set([currentRanges.currentOuterFrom])
                            : new Set<number>();
                    },
                }),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        onChangeRef.current({
                            markdown: update.state.doc.toString(),
                            ranges: getCurrentRanges(update.view),
                        });
                    }
                }),
                EditorView.theme({
                    "&": {
                        height: "100%",
                        fontSize: "15px",
                        backgroundColor: "transparent",
                    },
                    ".cm-content": {
                        padding:
                            "var(--sr-review-editor-content-padding-y, var(--syro-desktop-review-content-padding-y, 24px)) var(--sr-review-editor-content-padding-x, var(--syro-desktop-review-content-padding-x, 40px))",
                        fontFamily: "var(--font-text)",
                        caretColor: "var(--text-accent)",
                    },
                    ".cm-line": {
                        lineHeight: "1.6",
                    },
                    "&.cm-focused": {
                        outline: "none",
                    },
                    "&.cm-focused .cm-cursor": {
                        borderLeftColor: "var(--text-accent)",
                        borderLeftWidth: "2px",
                    },
                    ".cm-selectionBackground": {
                        backgroundColor: "var(--text-selection) !important",
                    },
                }),
            ],
        });

        const view = new EditorView({
            state,
            parent: containerRef.current,
        });
        view.dispatch({ effects: setExtractContextRangesEffect.of(ranges) });
        viewRef.current = view;

        if (editable) {
            window.setTimeout(() => view.focus(), 50);
        }

        return () => {
            view.destroy();
            viewRef.current = null;
        };
    }, []);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;

        const currentValue = view.state.doc.toString();
        if (value !== currentValue) {
            view.dispatch({
                changes: { from: 0, to: currentValue.length, insert: value },
            });
        }
        view.dispatch({
            effects: setExtractContextRangesEffect.of(ranges),
        });
    }, [ranges, value]);

    useEffect(() => {
        viewRef.current?.dispatch({
            effects: editableCompartmentRef.current.reconfigure(EditorView.editable.of(editable)),
        });
    }, [editable]);

    return (
        <div
            className={`sr-extract-context-editor ${editable ? "" : "sr-extract-context-readonly"}`}
        >
            <div className="sr-cm-container" ref={containerRef} />
        </div>
    );
};
