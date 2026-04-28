import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
    applyHybridEditorCommand,
    handleHybridEditorHotkey,
    resolveObsidianHotkeys,
} from "src/editor/obsidianHotkeyBridge";

function createView(doc: string, from = 0, to = doc.length): EditorView {
    const host = document.createElement("div");
    document.body.appendChild(host);
    return new EditorView({
        parent: host,
        state: EditorState.create({
            doc,
            selection: EditorSelection.create([EditorSelection.range(from, to)]),
        }),
    });
}

describe("obsidianHotkeyBridge", () => {
    test("uses custom hotkeys before command defaults", () => {
        const app = {
            commands: {
                commands: {
                    "editor:toggle-bold": {
                        hotkeys: [{ modifiers: ["Mod"], key: "B" }],
                    },
                },
            },
            hotkeyManager: {
                customKeys: {
                    "editor:toggle-bold": [{ modifiers: ["Alt"], key: "X" }],
                },
            },
        };

        expect(resolveObsidianHotkeys(app, ["editor:toggle-bold"], [])).toEqual([
            { modifiers: ["Alt"], key: "X" },
            { modifiers: ["Mod"], key: "B" },
        ]);
    });

    test("handles a custom bold hotkey against the hybrid editor document", () => {
        const view = createView("bold");
        const app = {
            commands: { commands: {} },
            hotkeyManager: {
                customKeys: {
                    "editor:toggle-bold": [{ modifiers: ["Alt"], key: "X" }],
                },
            },
        };

        const event = new KeyboardEvent("keydown", {
            altKey: true,
            bubbles: true,
            key: "x",
        });

        expect(handleHybridEditorHotkey(event, view, app)).toBe(true);
        expect(view.state.doc.toString()).toBe("**bold**");

        view.destroy();
    });

    test("inserts Syro cloze wrappers using the current line cloze level", () => {
        const view = createView("{{c2::old}} target", "{{c2::old}} ".length);

        expect(applyHybridEditorCommand(view, "syro:srs-cloze-new-level")).toBe(true);
        expect(view.state.doc.toString()).toBe("{{c2::old}} {{c3::target}}");

        view.destroy();
    });

    test("inserts nested IR wrappers from the extract hotkey", () => {
        const view = createView("make extract");

        expect(applyHybridEditorCommand(view, "syro:create-extract-from-selection")).toBe(true);
        expect(view.state.doc.toString()).toBe("{{ir::make extract}}");

        view.destroy();
    });
});
