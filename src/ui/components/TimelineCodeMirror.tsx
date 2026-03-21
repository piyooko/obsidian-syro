/** @jsxImportSource react */

import React, { useEffect, useRef } from "react";
import type { FC } from "react";
import { EditorState } from "@codemirror/state";
import {
    drawSelection,
    dropCursor,
    EditorView,
    keymap,
    placeholder as placeholderExtension,
} from "@codemirror/view";
import { App } from "obsidian";

import { createTimelineLivePreviewExtensions } from "src/ui/timeline/timelineLivePreview";

type TimelineFormatAction =
    | "bold"
    | "italic"
    | "strikethrough"
    | "highlight"
    | "inline-code"
    | "math";

const TIMELINE_FORMAT_WRAPPERS: Record<TimelineFormatAction, [string, string]> = {
    bold: ["**", "**"],
    italic: ["*", "*"],
    strikethrough: ["~~", "~~"],
    highlight: ["==", "=="],
    "inline-code": ["`", "`"],
    math: ["$", "$"],
};

function applyTimelineFormat(view: EditorView, action: TimelineFormatAction): void {
    const [prefix, suffix] = TIMELINE_FORMAT_WRAPPERS[action];
    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to);
    const replacement = prefix + selectedText + suffix;
    const anchor = selection.from + prefix.length;

    view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: replacement },
        selection: {
            anchor,
            head: anchor + selectedText.length,
        },
    });
    view.focus();
}

interface TimelineCodeMirrorProps {
    app: App;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    enableDurationPrefixSyntax: boolean;
    className?: string;
    maxHeight?: number;
    minHeight?: number;
    autoFocus?: boolean;
    onSubmit?: () => void;
    onCancel?: () => void;
    onBlur?: () => void;
}

export const TimelineCodeMirror: FC<TimelineCodeMirrorProps> = ({
    app,
    value,
    onChange,
    placeholder,
    enableDurationPrefixSyntax,
    className,
    maxHeight = 200,
    minHeight = 36,
    autoFocus = false,
    onSubmit,
    onCancel,
    onBlur,
}) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onSubmitRef = useRef(onSubmit);
    const onCancelRef = useRef(onCancel);
    const onBlurRef = useRef(onBlur);

    useEffect(() => {
        onChangeRef.current = onChange;
        onSubmitRef.current = onSubmit;
        onCancelRef.current = onCancel;
        onBlurRef.current = onBlur;
    }, [onBlur, onCancel, onChange, onSubmit]);

    useEffect(() => {
        const container = containerRef.current;
        const host = hostRef.current;
        if (!container || !host) return;

        const state = EditorState.create({
            doc: value,
            extensions: [
                EditorView.editable.of(true),
                EditorView.lineWrapping,
                drawSelection(),
                dropCursor(),
                placeholderExtension(placeholder ?? ""),
                keymap.of([
                    {
                        key: "Escape",
                        run: () => {
                            if (!onCancelRef.current) return false;
                            onCancelRef.current();
                            return true;
                        },
                    },
                ]),
                ...createTimelineLivePreviewExtensions({
                    app,
                    enableDurationPrefixSyntax,
                }),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        onChangeRef.current(update.state.doc.toString());
                    }
                }),
                EditorView.domEventHandlers({
                    blur: () => {
                        onBlurRef.current?.();
                        return false;
                    },
                }),
                EditorView.theme({
                    "&": {
                        fontSize: "13px",
                        backgroundColor: "transparent",
                    },
                    "&.cm-focused": {
                        outline: "none",
                    },
                    ".cm-scroller": {
                        overflow: "auto",
                        maxHeight: `${maxHeight}px`,
                    },
                    ".cm-content": {
                        minHeight: `${minHeight}px`,
                        padding: "8px",
                        lineHeight: "1.625",
                        fontFamily: "var(--font-interface)",
                        caretColor: "var(--text-accent)",
                    },
                    ".cm-line": {
                        padding: "0",
                    },
                    ".cm-placeholder": {
                        color: "var(--text-faint)",
                    },
                    ".cm-cursor": {
                        borderLeftColor: "var(--text-accent)",
                    },
                    ".cm-selectionBackground": {
                        backgroundColor: "var(--text-selection) !important",
                    },
                }),
            ],
        });

        const view = new EditorView({
            state,
            parent: container,
        });

        viewRef.current = view;

        const handleFormat = (evt: Event) => {
            const action = (evt as CustomEvent<{ action: TimelineFormatAction }>).detail?.action;
            if (!action || !viewRef.current) return;
            applyTimelineFormat(viewRef.current, action);
        };

        const handleSubmit = () => {
            onSubmitRef.current?.();
        };

        host.addEventListener("sr-timeline-format", handleFormat as EventListener);
        host.addEventListener("sr-ctrl-enter", handleSubmit);

        if (autoFocus) {
            setTimeout(() => {
                view.focus();
                const end = view.state.doc.length;
                view.dispatch({ selection: { anchor: end, head: end } });
            }, 50);
        }

        return () => {
            host.removeEventListener("sr-timeline-format", handleFormat as EventListener);
            host.removeEventListener("sr-ctrl-enter", handleSubmit);
            view.destroy();
            viewRef.current = null;
        };
    }, [app, autoFocus, enableDurationPrefixSyntax, maxHeight, minHeight, placeholder]);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;

        const currentValue = view.state.doc.toString();
        if (value === currentValue) return;

        view.dispatch({
            changes: {
                from: 0,
                to: currentValue.length,
                insert: value,
            },
        });
    }, [value]);

    return (
        <div ref={hostRef} className={`sr-timeline-editor-host ${className ?? ""}`.trim()}>
            <div ref={containerRef} />
        </div>
    );
};
