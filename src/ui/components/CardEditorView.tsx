/** @jsxImportSource react */
/**
 * 这个文件主要是干什么的：
 * 这是一个可以在卡片里直接改字的小写字板。
 * 它可以让用户输入文字，而且支持用快捷键快速把字加粗、变斜体，或者做成填空题（也就是把某几个字盖住）。
 * 为了支持高级版的功能，如果免费用户想用特殊的填空题快捷键，它就会弹出警告不让用。
 *
 * 它在项目中属于：界面层
 *
 * 它会用到哪些文件：
 * 1. src/editor/live-preview-decoration — 帮忙把文字排版变得更好看的地方
 * 2. src/main.ts — 插件的大管家，用来看看当前用户是不是高级会员
 *
 * 哪些文件会用到它：
 * 任何需要直接修该卡片文字的界面都会把这个小写字板搬过去用。
 */

import React, { useRef, useEffect, useCallback } from "react";
import type { FC } from "react";
import { EditorView, keymap, drawSelection, dropCursor } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { Keymap, Notice } from "obsidian";
import type SRPlugin from "src/main";
import { livePreviewPlugin, livePreviewTheme } from "src/editor/live-preview-decoration";

// ==========================================
// Props 定义
// ==========================================

interface CardEditorViewProps {
    value: string;
    onChange: (value: string) => void;
    onExit: () => void;
    plugin: SRPlugin;
}

// ==========================================
// 辅助函数
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
        new Notice("请先选中要挖空的文本");
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

    new Notice(`已创建挖空 c${nextId}`);
};

// ==========================================
// CardEditorView 组件
// ==========================================

export const CardEditorView: FC<CardEditorViewProps> = ({ value, onChange, onExit, plugin }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onExitRef = useRef(onExit);

    // 更新 refs
    useEffect(() => {
        onChangeRef.current = onChange;
        onExitRef.current = onExit;
    }, [onChange, onExit]);

    // 初始化 CodeMirror
    useEffect(() => {
        if (!containerRef.current) return;

        console.log("[CardEditor] Initializing...");

        // 创建自定义快捷键
        const customKeymap = keymap.of([
            // ESC 退出
            {
                key: "Escape",
                run: () => {
                    onExitRef.current();
                    return true;
                },
            },
            // Ctrl+Enter 保存退出
            {
                key: "Mod-Enter",
                run: () => {
                    onExitRef.current();
                    return true;
                },
            },
            // Ctrl+B 加粗
            {
                key: "Mod-b",
                run: (view) => {
                    wrapSelection(view, "**", "**");
                    return true;
                },
            },
            // Ctrl+I 斜体
            {
                key: "Mod-i",
                run: (view) => {
                    wrapSelection(view, "*", "*");
                    return true;
                },
            },
            // Ctrl+K 链接
            {
                key: "Mod-k",
                run: (view) => {
                    wrapSelection(view, "[", "]()");
                    return true;
                },
            },
            // Ctrl+Shift+C 挖空（同级）
            {
                key: "Ctrl-Alt-Shift-c",
                run: (view) => {
                    if (!plugin.data.settings.isPro) {
                        new Notice("🔒 「Anki 挖空」仅限 Supporter 使用");
                        return true;
                    }
                    insertCloze(view, "same");
                    return true;
                },
            },
            // Alt+Shift+C 挖空（新级）
            {
                key: "Alt-Shift-c",
                run: (view) => {
                    if (!plugin.data.settings.isPro) {
                        new Notice("🔒 「Anki 挖空」仅限 Supporter 使用");
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
                // 基础编辑功能
                EditorView.editable.of(true),
                EditorView.lineWrapping,
                drawSelection(),
                dropCursor(),

                // 自定义快捷键（放在最前面优先处理）
                customKeymap,

                // Live Preview 装饰
                livePreviewPlugin,
                livePreviewTheme,

                // 文档变更监听
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        onChangeRef.current(update.state.doc.toString());
                    }
                }),

                // 编辑器样式
                EditorView.theme({
                    "&": {
                        height: "100%",
                        fontSize: "15px",
                        backgroundColor: "var(--background-primary)",
                    },
                    ".cm-content": {
                        padding: "24px 32px",
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

        console.log("[CardEditor] Created, focusing...");

        // 延迟聚焦
        setTimeout(() => {
            viewRef.current?.focus();
        }, 50);

        return () => {
            viewRef.current?.destroy();
            viewRef.current = null;
        };
    }, []);

    // 同步外部 value 变化（仅当外部值与当前不同时）
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
                <span>编辑模式</span>
                <span className="sr-key-hints">
                    <span>Ctrl+B 加粗</span>
                    <span className="sr-divider">•</span>
                    <span>Ctrl+I 斜体</span>
                    <span className="sr-divider">•</span>
                    <span>Alt+Shift+C 挖空</span>
                    <span className="sr-divider">•</span>
                    <span>Esc 退出</span>
                </span>
            </div>
        </div>
    );
};
