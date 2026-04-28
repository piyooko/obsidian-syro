/** @jsxImportSource react */

import { useRef, useEffect } from "react";
import type { FC } from "react";
import { EditorView, keymap, drawSelection, dropCursor } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { Notice } from "obsidian";
import { t } from "src/lang/helpers";
import type SRPlugin from "src/main";
import { livePreviewPlugin, livePreviewTheme } from "src/editor/live-preview-decoration";

// ==========================================
// ==========================================

interface CardEditorViewProps {
    value: string;
    onChange: (value: string) => void;
    onExit: () => void;
    plugin: SRPlugin;
}

// ==========================================
// ==========================================

const wrapSelection = (view: EditorView, prefix: string, suffix: string): void => {
    const { state } = view;
    const selection = state.selection.main;
    const selectedText = state.sliceDoc(selection.from, selection.to);
    const replacement = prefix + selectedText + suffix;

    view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: replacement },
        selection: {
            anchor: selection.from + prefix.length,
            head: selection.from + prefix.length + selectedText.length,
        },
    });
};

const insertCloze = (view: EditorView, type: "same" | "new"): void => {
    const { state } = view;
    const selection = state.selection.main;
    const selectedText = state.sliceDoc(selection.from, selection.to);

    if (!selectedText) {
        new Notice(t("NOTICE_TEXT_SELECTION_REQUIRED"));
        return;
    }

    const docText = state.doc.toString();
    const matches = docText.matchAll(/\{\{c(\d+)::/g);
    let max = 0;
    for (const m of matches) {
        const id = parseInt(m[1]);
        if (id > max) max = id;
    }

    const nextId = type === "same" ? (max === 0 ? 1 : max) : max + 1;
    const replacement = `{{c${nextId}::${selectedText}}}`;

    view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: replacement },
        selection: { anchor: selection.from + replacement.length },
    });
};

// ==========================================
// ==========================================

export const CardEditorView: FC<CardEditorViewProps> = ({ value, onChange, onExit, plugin }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onExitRef = useRef(onExit);

    useEffect(() => {
        onChangeRef.current = onChange;
        onExitRef.current = onExit;
    }, [onChange, onExit]);

    useEffect(() => {
        if (!containerRef.current) return;

        console.debug("[CardEditor] Initializing...");

        const customKeymap = keymap.of([
            {
                key: "Mod-Enter",
                run: () => {
                    onExitRef.current();
                    return true;
                },
            },
            {
                key: "Mod-b",
                run: (view) => {
                    wrapSelection(view, "**", "**");
                    return true;
                },
            },
            {
                key: "Mod-i",
                run: (view) => {
                    wrapSelection(view, "*", "*");
                    return true;
                },
            },
            {
                key: "Mod-k",
                run: (view) => {
                    wrapSelection(view, "[", "]()");
                    return true;
                },
            },
            {
                key: "Ctrl-Alt-Shift-c",
                run: (view) => {
                    if (!plugin.data.settings.isPro) {
                        new Notice(t("NOTICE_ANKI_CLOZE_SUPPORTER_ONLY"));
                        return true;
                    }
                    insertCloze(view, "same");
                    return true;
                },
            },
            {
                key: "Alt-Shift-c",
                run: (view) => {
                    if (!plugin.data.settings.isPro) {
                        new Notice(t("NOTICE_ANKI_CLOZE_SUPPORTER_ONLY"));
                        return true;
                    }
                    insertCloze(view, "new");
                    return true;
                },
            },
        ]);

        const state = EditorState.create({
            doc: value,
            extensions: [
                EditorView.editable.of(true),
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

                customKeymap,

                livePreviewPlugin,
                livePreviewTheme,

                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        onChangeRef.current(update.state.doc.toString());
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
                    "&.cm-focused .cm-cursor": {
                        borderLeftColor: "var(--text-accent)",
                        borderLeftWidth: "2px",
                    },
                    ".cm-selectionBackground": {
                        backgroundColor: "var(--text-selection) !important",
                    },
                    "&.cm-focused": {
                        outline: "none",
                    },
                }),
            ],
        });

        viewRef.current = new EditorView({
            state,
            parent: containerRef.current,
        });

        console.debug("[CardEditor] Created, focusing...");

        // Delay focus slightly so CodeMirror is attached before calling focus().
        setTimeout(() => {
            viewRef.current?.focus();
        }, 50);

        return () => {
            viewRef.current?.destroy();
            viewRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (viewRef.current) {
            const currentValue = viewRef.current.state.doc.toString();
            if (value !== currentValue) {
                viewRef.current.dispatch({
                    changes: { from: 0, to: currentValue.length, insert: value },
                });
            }
        }
    }, [value]);

    return (
        <div className="sr-card-editor-view">
            <div className="sr-cm-container" ref={containerRef} />
            <div className="sr-editor-hint">
                <span>{t("UI_EDITOR_MODE_LABEL")}</span>
                <span className="sr-key-hints">
                    <span>{t("UI_BOLD_KEY_HINT")}</span>
                    <span className="sr-divider">|</span>
                    <span>{t("UI_ITALIC_KEY_HINT")}</span>
                    <span className="sr-divider">|</span>
                    <span>{t("UI_CLOZE_KEY_HINT")}</span>
                    <span className="sr-divider">|</span>
                    <span>{t("UI_EXIT_KEY_HINT")}</span>
                </span>
            </div>
        </div>
    );
};
