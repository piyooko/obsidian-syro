import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Notice } from "obsidian";
import {
    allowExtractContextBoundaryMutationAnnotation,
    createExtractContextDecorationExtensions,
    extractContextRangesField,
    setExtractContextRangesEffect,
    type ExtractContextRanges,
} from "src/editor/extract-context-decoration";
import { t } from "src/lang/helpers";
import { hasCurrentExtractWrapper } from "src/util/irExtractContext";

function createRanges(overrides: Partial<ExtractContextRanges> = {}): ExtractContextRanges {
    return {
        currentOuterFrom: 2,
        currentOuterTo: 8,
        currentInnerFrom: 4,
        currentInnerTo: 6,
        currentOpenTokenFrom: 2,
        currentOpenTokenTo: 4,
        currentCloseTokenFrom: 6,
        currentCloseTokenTo: 8,
        ...overrides,
    };
}

function createManualRanges(markdown: string, outerFrom: number, outerTo: number): ExtractContextRanges {
    const openToken = "{{ir::";
    void markdown;
    return {
        currentOuterFrom: outerFrom,
        currentOuterTo: outerTo,
        currentInnerFrom: outerFrom + openToken.length,
        currentInnerTo: outerTo - 2,
        currentOpenTokenFrom: outerFrom,
        currentOpenTokenTo: outerFrom + openToken.length,
        currentCloseTokenFrom: outerTo - 2,
        currentCloseTokenTo: outerTo,
    };
}

function createStateWithRanges(markdown: string, ranges: ExtractContextRanges): EditorState {
    return EditorState.create({
        doc: markdown,
        extensions: [extractContextRangesField],
    }).update({
        effects: setExtractContextRangesEffect.of(ranges),
    }).state;
}

describe("extractContextRangesField", () => {
    test("does not map stale out-of-bounds ranges before applying replacement ranges", () => {
        const shortDoc = "x".repeat(12);
        let state = EditorState.create({
            doc: shortDoc,
            extensions: [extractContextRangesField],
        });

        state = state.update({
            effects: setExtractContextRangesEffect.of(
                createRanges({
                    currentOuterFrom: 20,
                    currentOuterTo: 40,
                    currentInnerFrom: 26,
                    currentInnerTo: 34,
                    currentOpenTokenFrom: 20,
                    currentOpenTokenTo: 26,
                    currentCloseTokenFrom: 34,
                    currentCloseTokenTo: 40,
                }),
            ),
        }).state;

        expect(() => {
            state = state.update({
                effects: setExtractContextRangesEffect.of(createRanges()),
            }).state;
        }).not.toThrow();

        expect(state.field(extractContextRangesField)).toEqual(createRanges());
    });

    test("clamps mapped ranges to the current document length", () => {
        let state = EditorState.create({
            doc: "0123456789",
            extensions: [extractContextRangesField],
        });

        state = state.update({
            effects: setExtractContextRangesEffect.of(createRanges({ currentOuterTo: 99 })),
        }).state;

        const ranges = state.field(extractContextRangesField);

        expect(ranges?.currentOuterTo).toBe(10);
        expect(ranges?.currentCloseTokenTo).toBeLessThanOrEqual(10);
    });

    test("keeps the close token mapped after inserting inside the current extract", () => {
        const markdown = "before {{ir::target}} after";
        const ranges = createManualRanges(markdown, 7, 21);
        const state = createStateWithRanges(markdown, ranges).update({
            changes: { from: ranges.currentCloseTokenFrom, insert: "1" },
        }).state;
        const nextRanges = state.field(extractContextRangesField);

        expect(state.doc.toString()).toBe("before {{ir::target1}} after");
        expect(nextRanges).toEqual({
            ...ranges,
            currentOuterTo: ranges.currentOuterTo + 1,
            currentInnerTo: ranges.currentInnerTo + 1,
            currentCloseTokenFrom: ranges.currentCloseTokenFrom + 1,
            currentCloseTokenTo: ranges.currentCloseTokenTo + 1,
        });
        expect(nextRanges && hasCurrentExtractWrapper(state.doc.toString(), nextRanges)).toBe(true);
    });

    test("keeps the close token mapped when inserting outside after the current extract", () => {
        const markdown = "before {{ir::target}} after";
        const ranges = createManualRanges(markdown, 7, 21);
        const state = createStateWithRanges(markdown, ranges).update({
            changes: { from: ranges.currentCloseTokenTo, insert: "1" },
        }).state;
        const nextRanges = state.field(extractContextRangesField);

        expect(state.doc.toString()).toBe("before {{ir::target}}1 after");
        expect(nextRanges).toEqual(ranges);
        expect(nextRanges && hasCurrentExtractWrapper(state.doc.toString(), nextRanges)).toBe(true);
    });

    test("distinguishes outside and inside insertions around the open token", () => {
        const markdown = "before {{ir::target}} after";
        const ranges = createManualRanges(markdown, 7, 21);
        const outsideState = createStateWithRanges(markdown, ranges).update({
            changes: { from: ranges.currentOpenTokenFrom, insert: "1" },
        }).state;
        const outsideRanges = outsideState.field(extractContextRangesField);

        expect(outsideState.doc.toString()).toBe("before 1{{ir::target}} after");
        expect(outsideRanges).toEqual({
            currentOuterFrom: ranges.currentOuterFrom + 1,
            currentOuterTo: ranges.currentOuterTo + 1,
            currentInnerFrom: ranges.currentInnerFrom + 1,
            currentInnerTo: ranges.currentInnerTo + 1,
            currentOpenTokenFrom: ranges.currentOpenTokenFrom + 1,
            currentOpenTokenTo: ranges.currentOpenTokenTo + 1,
            currentCloseTokenFrom: ranges.currentCloseTokenFrom + 1,
            currentCloseTokenTo: ranges.currentCloseTokenTo + 1,
        });
        expect(
            outsideRanges && hasCurrentExtractWrapper(outsideState.doc.toString(), outsideRanges),
        ).toBe(true);

        const insideState = createStateWithRanges(markdown, ranges).update({
            changes: { from: ranges.currentOpenTokenTo, insert: "1" },
        }).state;
        const insideRanges = insideState.field(extractContextRangesField);

        expect(insideState.doc.toString()).toBe("before {{ir::1target}} after");
        expect(insideRanges).toEqual({
            ...ranges,
            currentOuterTo: ranges.currentOuterTo + 1,
            currentInnerTo: ranges.currentInnerTo + 1,
            currentCloseTokenFrom: ranges.currentCloseTokenFrom + 1,
            currentCloseTokenTo: ranges.currentCloseTokenTo + 1,
        });
        expect(insideRanges && hasCurrentExtractWrapper(insideState.doc.toString(), insideRanges)).toBe(
            true,
        );
    });
});

describe("extract context boundary reveal", () => {
    function renderEditor(
        selection: number,
        editable: boolean,
    ): { parent: HTMLElement; view: EditorView } {
        const markdown = "before {{ir::target}} after";
        const ranges = createManualRanges(markdown, 7, 21);
        const parent = document.createElement("div");
        document.body.appendChild(parent);
        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: markdown,
                selection: EditorSelection.cursor(selection),
                extensions: [
                    EditorView.editable.of(editable),
                    ...createExtractContextDecorationExtensions(),
                ],
            }),
        });
        view.dispatch({ effects: setExtractContextRangesEffect.of(ranges) });
        return { parent, view };
    }

    test("reveals and highlights the current boundary token when the editable cursor touches it", () => {
        const { parent, view } = renderEditor(19, true);

        try {
            const boundary = parent.querySelector(".sr-extract-context-boundary");
            expect(boundary).not.toBeNull();
            expect(boundary?.textContent).toBe("}}");
        } finally {
            view.destroy();
            parent.remove();
        }
    });

    test("keeps boundary tokens hidden away from the cursor and in readonly mode", () => {
        const away = renderEditor(0, true);
        const readonly = renderEditor(19, false);

        try {
            expect(away.parent.querySelector(".sr-extract-context-boundary")).toBeNull();
            expect(readonly.parent.querySelector(".sr-extract-context-boundary")).toBeNull();
        } finally {
            away.view.destroy();
            away.parent.remove();
            readonly.view.destroy();
            readonly.parent.remove();
        }
    });
});

describe("extract context boundary guard", () => {
    beforeEach(() => {
        (Notice as jest.Mock).mockClear();
    });

    function createGuardedEditor(
        editable = true,
    ): { parent: HTMLElement; ranges: ExtractContextRanges; view: EditorView } {
        const markdown = "before {{ir::target}} after";
        const ranges = createManualRanges(markdown, 7, 21);
        const parent = document.createElement("div");
        document.body.appendChild(parent);
        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: markdown,
                extensions: [
                    EditorView.editable.of(editable),
                    ...createExtractContextDecorationExtensions(),
                ],
            }),
        });
        view.dispatch({ effects: setExtractContextRangesEffect.of(ranges) });
        return { parent, ranges, view };
    }

    function destroyGuardedEditor(editor: { parent: HTMLElement; view: EditorView }): void {
        editor.view.destroy();
        editor.parent.remove();
    }

    test("preserves the current close boundary while replacing selected content", () => {
        const editor = createGuardedEditor();

        try {
            editor.view.dispatch({
                changes: {
                    from: editor.ranges.currentCloseTokenFrom - 1,
                    to: editor.ranges.currentCloseTokenTo,
                    insert: "1",
                },
                userEvent: "input.type",
            });

            expect(editor.view.state.doc.toString()).toBe("before {{ir::targe1}} after");
        } finally {
            destroyGuardedEditor(editor);
        }
    });

    test("blocks deleting the current open boundary", () => {
        const editor = createGuardedEditor();

        try {
            editor.view.dispatch({
                changes: {
                    from: editor.ranges.currentOpenTokenFrom,
                    to: editor.ranges.currentOpenTokenTo,
                    insert: "",
                },
                userEvent: "delete",
            });

            expect(editor.view.state.doc.toString()).toBe("before {{ir::target}} after");
        } finally {
            destroyGuardedEditor(editor);
        }
    });

    test("protects the current open boundary even when the delete transaction has no user event", () => {
        const editor = createGuardedEditor();

        try {
            editor.view.dispatch({
                changes: {
                    from: editor.ranges.currentOpenTokenFrom,
                    to: editor.ranges.currentOpenTokenTo,
                    insert: "",
                },
            });

            expect(editor.view.state.doc.toString()).toBe("before {{ir::target}} after");
        } finally {
            destroyGuardedEditor(editor);
        }
    });

    test("protects the current close boundary even when the delete transaction has no user event", () => {
        const editor = createGuardedEditor();

        try {
            editor.view.dispatch({
                changes: {
                    from: editor.ranges.currentCloseTokenFrom,
                    to: editor.ranges.currentCloseTokenTo,
                    insert: "",
                },
            });

            expect(editor.view.state.doc.toString()).toBe("before {{ir::target}} after");
        } finally {
            destroyGuardedEditor(editor);
        }
    });

    test("allows deleting a nested extract boundary inside the current extract", () => {
        const markdown = "before {{ir::这是{{ir::一}}段话}} after";
        const ranges = createManualRanges(markdown, 7, markdown.indexOf(" after"));
        const parent = document.createElement("div");
        document.body.appendChild(parent);
        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: markdown,
                extensions: [
                    EditorView.editable.of(true),
                    ...createExtractContextDecorationExtensions(),
                ],
            }),
        });
        view.dispatch({ effects: setExtractContextRangesEffect.of(ranges) });

        try {
            view.dispatch({
                changes: {
                    from: ranges.currentInnerFrom + "这是".length,
                    to: ranges.currentInnerFrom + "这是{{ir::一}}".length,
                    insert: "",
                },
                userEvent: "delete",
            });

            const nextRanges = view.state.field(extractContextRangesField);
            expect(view.state.doc.toString()).toBe("before {{ir::这是段话}} after");
            expect(hasCurrentExtractWrapper(view.state.doc.toString(), nextRanges)).toBe(true);
        } finally {
            view.destroy();
            parent.remove();
        }
    });

    test("blocks deleting the whole current extract because it would be empty", () => {
        const editor = createGuardedEditor();

        try {
            editor.view.dispatch({
                changes: {
                    from: editor.ranges.currentOpenTokenFrom,
                    to: editor.ranges.currentCloseTokenTo,
                    insert: "",
                },
                userEvent: "delete",
            });

            const nextRanges = editor.view.state.field(extractContextRangesField);
            expect(editor.view.state.doc.toString()).toBe("before {{ir::target}} after");
            expect(hasCurrentExtractWrapper(editor.view.state.doc.toString(), nextRanges)).toBe(
                true,
            );
            expect(Notice).toHaveBeenCalledWith(t("EXTRACT_EMPTY_BLOCKED"));
        } finally {
            destroyGuardedEditor(editor);
        }
    });

    test("blocks replacing the current extract content with whitespace only", () => {
        const editor = createGuardedEditor();

        try {
            editor.view.dispatch({
                changes: {
                    from: editor.ranges.currentInnerFrom,
                    to: editor.ranges.currentInnerTo,
                    insert: "\n  \n",
                },
                userEvent: "input",
            });

            expect(editor.view.state.doc.toString()).toBe("before {{ir::target}} after");
            expect(Notice).toHaveBeenCalledWith(t("EXTRACT_EMPTY_BLOCKED"));
        } finally {
            destroyGuardedEditor(editor);
        }
    });

    test("allows replacing the current extract content with punctuation", () => {
        const editor = createGuardedEditor();

        try {
            editor.view.dispatch({
                changes: {
                    from: editor.ranges.currentInnerFrom,
                    to: editor.ranges.currentInnerTo,
                    insert: "。",
                },
                userEvent: "input",
            });

            expect(editor.view.state.doc.toString()).toBe("before {{ir::。}} after");
            expect(Notice).not.toHaveBeenCalledWith(t("EXTRACT_EMPTY_BLOCKED"));
        } finally {
            destroyGuardedEditor(editor);
        }
    });

    test("preserves the current open boundary while deleting selected multiline content", () => {
        const markdown = "before {{ir::target\nnext}} after";
        const ranges = createManualRanges(markdown, 7, 26);
        const parent = document.createElement("div");
        document.body.appendChild(parent);
        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: markdown,
                extensions: [
                    EditorView.editable.of(true),
                    ...createExtractContextDecorationExtensions(),
                ],
            }),
        });
        view.dispatch({ effects: setExtractContextRangesEffect.of(ranges) });

        try {
            view.dispatch({
                changes: {
                    from: ranges.currentOpenTokenFrom,
                    to: ranges.currentInnerFrom + "target\n".length,
                    insert: "",
                },
                userEvent: "delete",
            });

            expect(view.state.doc.toString()).toBe("before {{ir::next}} after");
        } finally {
            view.destroy();
            parent.remove();
        }
    });

    test("allows deleting selected multiline content fully inside the current extract", () => {
        const markdown = "before {{ir::target\nnext}} after";
        const ranges = createManualRanges(markdown, 7, 26);
        const parent = document.createElement("div");
        document.body.appendChild(parent);
        const view = new EditorView({
            parent,
            state: EditorState.create({
                doc: markdown,
                extensions: [
                    EditorView.editable.of(true),
                    ...createExtractContextDecorationExtensions(),
                ],
            }),
        });
        view.dispatch({ effects: setExtractContextRangesEffect.of(ranges) });

        try {
            view.dispatch({
                changes: {
                    from: ranges.currentInnerFrom,
                    to: ranges.currentInnerFrom + "target\n".length,
                    insert: "",
                },
                userEvent: "delete",
            });

            expect(view.state.doc.toString()).toBe("before {{ir::next}} after");
        } finally {
            view.destroy();
            parent.remove();
        }
    });

    test("blocks Enter inside the current close boundary token", () => {
        const editor = createGuardedEditor();

        try {
            editor.view.dispatch({
                changes: {
                    from: editor.ranges.currentCloseTokenFrom + 1,
                    insert: "\n",
                },
                userEvent: "input",
            });

            expect(editor.view.state.doc.toString()).toBe("before {{ir::target}} after");
        } finally {
            destroyGuardedEditor(editor);
        }
    });

    test("blocks replacing only the current open boundary token with Enter", () => {
        const editor = createGuardedEditor();

        try {
            editor.view.dispatch({
                changes: {
                    from: editor.ranges.currentOpenTokenFrom,
                    to: editor.ranges.currentOpenTokenTo,
                    insert: "\n",
                },
                userEvent: "input",
            });

            expect(editor.view.state.doc.toString()).toBe("before {{ir::target}} after");
        } finally {
            destroyGuardedEditor(editor);
        }
    });

    test("blocks replacing only the current close boundary token with Enter", () => {
        const editor = createGuardedEditor();

        try {
            editor.view.dispatch({
                changes: {
                    from: editor.ranges.currentCloseTokenFrom,
                    to: editor.ranges.currentCloseTokenTo,
                    insert: "\n",
                },
                userEvent: "input",
            });

            expect(editor.view.state.doc.toString()).toBe("before {{ir::target}} after");
        } finally {
            destroyGuardedEditor(editor);
        }
    });

    test("allows insertions on the semantic edges of the current open boundary", () => {
        const outside = createGuardedEditor();
        const inside = createGuardedEditor();

        try {
            outside.view.dispatch({
                changes: {
                    from: outside.ranges.currentOpenTokenFrom,
                    insert: "1",
                },
                userEvent: "input.type",
            });
            inside.view.dispatch({
                changes: {
                    from: inside.ranges.currentOpenTokenTo,
                    insert: "1",
                },
                userEvent: "input.type",
            });

            expect(outside.view.state.doc.toString()).toBe("before 1{{ir::target}} after");
            expect(inside.view.state.doc.toString()).toBe("before {{ir::1target}} after");
        } finally {
            destroyGuardedEditor(outside);
            destroyGuardedEditor(inside);
        }
    });

    test("allows insertions on the semantic edges of the current close boundary", () => {
        const inside = createGuardedEditor();
        const outside = createGuardedEditor();

        try {
            inside.view.dispatch({
                changes: {
                    from: inside.ranges.currentCloseTokenFrom,
                    insert: "1",
                },
                userEvent: "input.type",
            });
            outside.view.dispatch({
                changes: {
                    from: outside.ranges.currentCloseTokenTo,
                    insert: "1",
                },
                userEvent: "input.type",
            });

            expect(inside.view.state.doc.toString()).toBe("before {{ir::target1}} after");
            expect(outside.view.state.doc.toString()).toBe("before {{ir::target}}1 after");
        } finally {
            destroyGuardedEditor(inside);
            destroyGuardedEditor(outside);
        }
    });

    test("allows annotated document synchronization even when it replaces boundary text", () => {
        const editor = createGuardedEditor();

        try {
            editor.view.dispatch({
                changes: {
                    from: editor.ranges.currentOpenTokenFrom,
                    to: editor.ranges.currentCloseTokenTo,
                    insert: "target",
                },
                annotations: allowExtractContextBoundaryMutationAnnotation.of(true),
            });

            expect(editor.view.state.doc.toString()).toBe("before target after");
        } finally {
            destroyGuardedEditor(editor);
        }
    });
});
