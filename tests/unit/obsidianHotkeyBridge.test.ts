import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { moment, Notice } from "obsidian";
import {
    applyHybridEditorCommand,
    eventMatchesReviewEditModeHotkey,
    getReviewEditModeHotkeyLabel,
    handleHybridEditorHotkey,
    logHybridEditorHotkeyResolution,
    resolveHybridEditorHotkeyRegistry,
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
    test("uses custom hotkeys instead of command defaults and respects empty overrides", () => {
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
        ]);

        expect(
            resolveObsidianHotkeys(
                {
                    commands: {
                        commands: {
                            "editor:toggle-bold": {
                                hotkeys: [{ modifiers: ["Mod"], key: "B" }],
                            },
                        },
                    },
                    hotkeyManager: {
                        customKeys: {
                            "editor:toggle-bold": [],
                        },
                    },
                },
                ["editor:toggle-bold"],
                [{ modifiers: ["Mod"], key: "B" }],
            ),
        ).toEqual([]);
    });

    test("uses the review edit mode command hotkey, with custom keys overriding defaults", () => {
        const app = {
            commands: {
                commands: {
                    "syro:srs-toggle-review-edit-mode": {
                        hotkeys: [{ modifiers: ["Alt"], key: "E" }],
                    },
                },
            },
            hotkeyManager: {
                customKeys: {
                    "syro:srs-toggle-review-edit-mode": [{ modifiers: ["Alt"], key: "X" }],
                },
            },
        };

        expect(
            eventMatchesReviewEditModeHotkey(
                new KeyboardEvent("keydown", { altKey: true, key: "x" }),
                app,
            ),
        ).toBe(true);
        expect(
            eventMatchesReviewEditModeHotkey(
                new KeyboardEvent("keydown", { altKey: true, key: "e" }),
                app,
            ),
        ).toBe(false);
    });

    test("formats the review edit mode shortcut label from the active command hotkey", () => {
        expect(getReviewEditModeHotkeyLabel(undefined)).toBe("Alt+E");
        expect(
            getReviewEditModeHotkeyLabel({
                commands: {
                    commands: {
                        "syro:srs-toggle-review-edit-mode": {
                            hotkeys: [{ modifiers: ["Alt"], key: "E" }],
                        },
                    },
                },
                hotkeyManager: {
                    customKeys: {
                        "syro:srs-toggle-review-edit-mode": [
                            { modifiers: ["Alt", "Shift"], key: "X" },
                        ],
                    },
                },
            }),
        ).toBe("Alt+Shift+X");
        expect(
            getReviewEditModeHotkeyLabel({
                hotkeyManager: {
                    customKeys: {
                        "syro:srs-toggle-review-edit-mode": [],
                    },
                },
            }),
        ).toBeNull();
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
        const logger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn() };

        expect(handleHybridEditorHotkey(event, view, app, logger)).toBe(true);
        expect(view.state.doc.toString()).toBe("**bold**");
        expect(logger.debug).toHaveBeenCalledWith(
            "[SR-HotkeyBridge] local-matched",
            expect.objectContaining({
                commandId: "editor:toggle-bold",
                key: "x",
            }),
        );

        view.destroy();
    });

    test.each([
        ["editor:toggle-strikethrough", "text", 0, 4, "~~text~~"],
        ["editor:toggle-inline-code", "code", 0, 4, "`code`"],
        ["editor:insert-math-expression", "x + y", 0, 5, "$x + y$"],
        ["editor:toggle-task-list", "task", 0, 4, "- [ ] task"],
        ["editor:toggle-blockquote", "quote", 0, 5, "> quote"],
        ["editor:insert-codeblock", "code", 0, 4, "```\ncode\n```"],
        ["editor:toggle-comment", "hidden", 0, 6, "%%hidden%%"],
        ["editor:indent-list", "item", 0, 4, "    item"],
        ["editor:unindent-list", "    item", 4, 8, "item"],
    ])(
        "applies official editor command %s inside the hybrid editor",
        (commandId, doc, from, to, expected) => {
            const view = createView(doc, from, to);

            expect(applyHybridEditorCommand(view, commandId)).toBe(true);
            expect(view.state.doc.toString()).toBe(expected);

            view.destroy();
        },
    );

    test("resolves Syro editor command hotkeys and executes them in the hybrid editor", () => {
        const prefix = "{{c2::old}} ";
        const view = createView(`${prefix}target`, prefix.length);
        const app = {
            hotkeyManager: {
                customKeys: {
                    "syro:srs-cloze-same-level": [{ modifiers: ["Alt"], key: "S" }],
                },
            },
        };

        expect(
            handleHybridEditorHotkey(
                new KeyboardEvent("keydown", {
                    altKey: true,
                    bubbles: true,
                    cancelable: true,
                    key: "s",
                }),
                view,
                app,
                { debug: jest.fn(), error: jest.fn(), warn: jest.fn() },
            ),
        ).toBe(true);
        expect(view.state.doc.toString()).toBe("{{c2::old}} {{c2::target}}");

        view.destroy();
    });

    test("logs invalid hotkey entries and unsupported editor commands during resolution", () => {
        const logger = {
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        };
        const app = {
            commands: {
                commands: {
                    "editor:toggle-bold": {
                        hotkeys: [{ modifiers: "Alt", key: "B" }],
                    },
                    "editor:unsupported-command": {
                        hotkeys: [{ modifiers: ["Alt"], key: "U" }],
                    },
                },
            },
        };

        const registry = resolveHybridEditorHotkeyRegistry(app, logger);
        logHybridEditorHotkeyResolution(app, logger);

        expect(registry.invalidHotkeys).toEqual([
            expect.objectContaining({ commandId: "editor:toggle-bold" }),
        ]);
        expect(registry.unsupported.map((command) => command.commandId)).toContain(
            "editor:unsupported-command",
        );
        expect(logger.warn).toHaveBeenCalledWith(
            "[SR-HotkeyBridge] invalid-hotkey",
            expect.objectContaining({ commandId: "editor:toggle-bold" }),
        );
        expect(logger.debug).toHaveBeenCalledWith(
            "[SR-HotkeyBridge] resolve-summary",
            expect.objectContaining({
                unsupportedCommands: expect.arrayContaining(["editor:unsupported-command"]),
            }),
        );
    });

    test("rejects modifier-only hotkey keys during resolution", () => {
        const logger = {
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        };
        const app = {
            hotkeyManager: {
                customKeys: {
                    "editor:toggle-bold": [{ modifiers: [] as string[], key: "Alt" }],
                },
            },
        };

        const registry = resolveHybridEditorHotkeyRegistry(app, logger);
        const bold = registry.supported.find((command) => command.commandId === "editor:toggle-bold");

        expect(bold?.hotkeys).toEqual([]);
        expect(registry.invalidHotkeys).toEqual([
            expect.objectContaining({
                commandId: "editor:toggle-bold",
                reason: "modifier-only-key",
            }),
        ]);
        expect(logger.warn).toHaveBeenCalledWith(
            "[SR-HotkeyBridge] invalid-hotkey",
            expect.objectContaining({
                commandId: "editor:toggle-bold",
                reason: "modifier-only-key",
            }),
        );
    });

    test("logs and consumes matched hotkeys when command execution fails", () => {
        moment.locale("zh-cn");
        const text = "{{ir::这是一句}}话";
        const from = text.indexOf("这");
        const view = createView(text, from, text.length);
        const logger = {
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        };
        const app = {
            hotkeyManager: {
                customKeys: {
                    "syro:create-extract-from-selection": [{ modifiers: ["Alt"], key: "E" }],
                },
            },
        };
        const event = new KeyboardEvent("keydown", {
            altKey: true,
            bubbles: true,
            cancelable: true,
            key: "e",
        });
        (Notice as jest.Mock).mockClear();

        expect(handleHybridEditorHotkey(event, view, app, logger)).toBe(true);
        expect(view.state.doc.toString()).toBe(text);
        expect(event.defaultPrevented).toBe(true);
        expect(logger.error).toHaveBeenCalledWith(
            "[SR-HotkeyBridge] command-failed",
            expect.objectContaining({
                commandId: "syro:create-extract-from-selection",
                key: "e",
                reason: "command-returned-false",
            }),
        );

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

    test("blocks extract hotkey selections that include existing IR boundary syntax", () => {
        moment.locale("zh-cn");
        const text = "{{ir::这是一句}}话";
        const from = text.indexOf("这");
        const to = text.length;
        const view = createView(text, from, to);
        (Notice as jest.Mock).mockClear();

        expect(applyHybridEditorCommand(view, "syro:create-extract-from-selection")).toBe(false);
        expect(view.state.doc.toString()).toBe(text);
        expect(Notice).toHaveBeenCalledWith("已阻止错误格式创建");

        view.destroy();
    });

    test("allows extract hotkey selections that include complete existing IR wrappers", () => {
        const text = "{{ir::这是一句}}话";
        const to = text.indexOf("话");
        const view = createView(text, 0, to);
        (Notice as jest.Mock).mockClear();

        expect(applyHybridEditorCommand(view, "syro:create-extract-from-selection")).toBe(true);
        expect(view.state.doc.toString()).toBe("{{ir::{{ir::这是一句}}}}话");
        expect(Notice).not.toHaveBeenCalled();

        view.destroy();
    });
});
