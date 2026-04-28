import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { Platform } from "obsidian";
import { wrapSelectionAsExtract } from "src/util/irExtractParser";

export interface ObsidianHotkeySpec {
    key: string;
    modifiers: string[];
}

export type HybridEditorCommandId =
    | "editor:insert-link"
    | "editor:toggle-bold"
    | "editor:toggle-bullet-list"
    | "editor:toggle-highlight"
    | "editor:toggle-italics"
    | "editor:toggle-numbered-list"
    | "editor:toggle-strikethrough"
    | "syro:create-extract-from-selection"
    | "syro:srs-cloze-new-level"
    | "syro:srs-cloze-same-level";

interface ObsidianCommandsLike {
    commands?: {
        commands?: Record<string, { hotkeys?: ObsidianHotkeySpec[] }>;
    };
    hotkeyManager?: {
        customKeys?: Record<string, ObsidianHotkeySpec[]>;
    };
}

interface HybridHotkeyAction {
    commandIds: HybridEditorCommandId[];
    fallback: ObsidianHotkeySpec[];
    run: HybridEditorCommandId;
}

const HYBRID_HOTKEY_ACTIONS: HybridHotkeyAction[] = [
    {
        commandIds: ["editor:toggle-bold"],
        fallback: [{ modifiers: ["Mod"], key: "B" }],
        run: "editor:toggle-bold",
    },
    {
        commandIds: ["editor:toggle-italics"],
        fallback: [{ modifiers: ["Mod"], key: "I" }],
        run: "editor:toggle-italics",
    },
    {
        commandIds: ["editor:toggle-highlight"],
        fallback: [{ modifiers: ["Mod", "Shift"], key: "H" }],
        run: "editor:toggle-highlight",
    },
    {
        commandIds: ["editor:insert-link"],
        fallback: [{ modifiers: ["Mod"], key: "K" }],
        run: "editor:insert-link",
    },
    {
        commandIds: ["editor:toggle-bullet-list"],
        fallback: [],
        run: "editor:toggle-bullet-list",
    },
    {
        commandIds: ["editor:toggle-numbered-list"],
        fallback: [],
        run: "editor:toggle-numbered-list",
    },
    {
        commandIds: ["syro:srs-cloze-new-level"],
        fallback: [{ modifiers: ["Alt", "Shift"], key: "C" }],
        run: "syro:srs-cloze-new-level",
    },
    {
        commandIds: ["syro:srs-cloze-same-level"],
        fallback: [{ modifiers: ["Alt", "Mod", "Shift"], key: "C" }],
        run: "syro:srs-cloze-same-level",
    },
    {
        commandIds: ["syro:create-extract-from-selection"],
        fallback: [{ modifiers: ["Alt", "Shift"], key: "E" }],
        run: "syro:create-extract-from-selection",
    },
];

const FORMAT_WRAPPERS: Partial<Record<HybridEditorCommandId, [string, string]>> = {
    "editor:toggle-bold": ["**", "**"],
    "editor:toggle-highlight": ["==", "=="],
    "editor:toggle-italics": ["*", "*"],
    "editor:toggle-strikethrough": ["~~", "~~"],
};

function normalizeKey(key: string): string {
    return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
}

function normalizeModifiers(modifiers: readonly string[]): string[] {
    return [...modifiers].map((modifier) => (modifier === "Ctrl" ? "Mod" : modifier)).sort();
}

function hotkeySignature(hotkey: ObsidianHotkeySpec): string {
    return `${normalizeModifiers(hotkey.modifiers).join("+")}::${normalizeKey(hotkey.key)}`;
}

export function resolveObsidianHotkeys(
    app: unknown,
    commandIds: readonly string[],
    fallback: readonly ObsidianHotkeySpec[],
): ObsidianHotkeySpec[] {
    const appWithCommands = app as ObsidianCommandsLike;
    const collected: ObsidianHotkeySpec[] = [];
    const seen = new Set<string>();

    const pushHotkey = (hotkey: ObsidianHotkeySpec | null | undefined) => {
        if (!hotkey || !hotkey.key || !Array.isArray(hotkey.modifiers)) {
            return;
        }
        const signature = hotkeySignature(hotkey);
        if (seen.has(signature)) {
            return;
        }
        seen.add(signature);
        collected.push({ key: hotkey.key, modifiers: [...hotkey.modifiers] });
    };

    for (const commandId of commandIds) {
        appWithCommands.hotkeyManager?.customKeys?.[commandId]?.forEach(pushHotkey);
        appWithCommands.commands?.commands?.[commandId]?.hotkeys?.forEach(pushHotkey);
    }

    if (collected.length === 0) {
        fallback.forEach(pushHotkey);
    }

    return collected;
}

function isMacPlatform(): boolean {
    return Platform.isMacOS === true;
}

export function eventMatchesObsidianHotkey(
    event: KeyboardEvent,
    hotkey: ObsidianHotkeySpec,
): boolean {
    const modifiers = new Set(normalizeModifiers(hotkey.modifiers));
    const wantsMod = modifiers.has("Mod");
    const modPressed = isMacPlatform() ? event.metaKey : event.ctrlKey;

    return (
        normalizeKey(event.key) === normalizeKey(hotkey.key) &&
        event.altKey === modifiers.has("Alt") &&
        event.shiftKey === modifiers.has("Shift") &&
        event.metaKey === (modifiers.has("Meta") || (wantsMod && isMacPlatform())) &&
        event.ctrlKey === (modifiers.has("Ctrl") || (wantsMod && !isMacPlatform())) &&
        (!wantsMod || modPressed)
    );
}

function replaceSelectionWithWrapper(view: EditorView, prefix: string, suffix: string): void {
    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to);
    const replacement = `${prefix}${selectedText}${suffix}`;
    const anchor = selection.from + prefix.length;

    view.dispatch({
        changes: { from: selection.from, insert: replacement, to: selection.to },
        selection: EditorSelection.range(anchor, anchor + selectedText.length),
    });
    view.focus();
}

function insertMarkdownLink(view: EditorView): void {
    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to);
    const label = selectedText || "link";
    const replacement = `[${label}]()`;
    const targetPos = selection.from + label.length + 3;

    view.dispatch({
        changes: { from: selection.from, insert: replacement, to: selection.to },
        selection: EditorSelection.cursor(targetPos),
    });
    view.focus();
}

function getMaxClozeIdFromText(text: string): number {
    let max = 0;
    for (const match of text.matchAll(/\{\{c(\d+)::/g)) {
        max = Math.max(max, Number(match[1]));
    }
    return max;
}

function insertCloze(view: EditorView, type: "new" | "same"): void {
    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to);
    const line = view.state.doc.lineAt(selection.from);
    const maxId = getMaxClozeIdFromText(line.text);
    const id = type === "same" ? maxId || 1 : maxId + 1;
    const replacement = `{{c${id}::${selectedText}}}`;
    const anchor = selection.from + `{{c${id}::`.length;

    view.dispatch({
        changes: { from: selection.from, insert: replacement, to: selection.to },
        selection: EditorSelection.range(anchor, anchor + selectedText.length),
    });
    view.focus();
}

function insertExtractWrapper(view: EditorView): void {
    const selection = view.state.selection.main;
    const text = view.state.doc.toString();
    const wrapped = wrapSelectionAsExtract(text, selection.from, selection.to);
    const replacement = wrapped.text.slice(wrapped.from, wrapped.to);

    view.dispatch({
        changes: { from: wrapped.replaceFrom, insert: replacement, to: wrapped.replaceTo },
        selection: EditorSelection.range(wrapped.innerFrom, wrapped.innerTo),
    });
    view.focus();
}

function toggleList(view: EditorView, ordered: boolean): void {
    const selection = view.state.selection.main;
    const fromLine = view.state.doc.lineAt(selection.from);
    const toLine = view.state.doc.lineAt(selection.to);
    const changes: Array<{ from: number; insert: string; to: number }> = [];

    for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber++) {
        const line = view.state.doc.line(lineNumber);
        const existing = line.text.match(/^(\s*)((?:[-+*]|\d+[.)])\s+)/);
        if (existing) {
            changes.push({
                from: line.from + existing[1].length,
                insert: "",
                to: line.from + existing[1].length + existing[2].length,
            });
            continue;
        }

        const marker = ordered ? `${lineNumber - fromLine.number + 1}. ` : "- ";
        changes.push({ from: line.from, insert: marker, to: line.from });
    }

    view.dispatch({ changes });
    view.focus();
}

export function applyHybridEditorCommand(
    view: EditorView,
    commandId: HybridEditorCommandId,
): boolean {
    const wrapper = FORMAT_WRAPPERS[commandId];
    if (wrapper) {
        replaceSelectionWithWrapper(view, wrapper[0], wrapper[1]);
        return true;
    }

    if (commandId === "editor:insert-link") {
        insertMarkdownLink(view);
        return true;
    }

    if (commandId === "editor:toggle-bullet-list") {
        toggleList(view, false);
        return true;
    }

    if (commandId === "editor:toggle-numbered-list") {
        toggleList(view, true);
        return true;
    }

    if (commandId === "syro:srs-cloze-new-level") {
        insertCloze(view, "new");
        return true;
    }

    if (commandId === "syro:srs-cloze-same-level") {
        insertCloze(view, "same");
        return true;
    }

    if (commandId === "syro:create-extract-from-selection") {
        insertExtractWrapper(view);
        return true;
    }

    return false;
}

export function handleHybridEditorHotkey(
    event: KeyboardEvent,
    view: EditorView,
    app: unknown,
): boolean {
    for (const action of HYBRID_HOTKEY_ACTIONS) {
        const hotkeys = resolveObsidianHotkeys(app, action.commandIds, action.fallback);
        if (!hotkeys.some((hotkey) => eventMatchesObsidianHotkey(event, hotkey))) {
            continue;
        }

        event.preventDefault();
        event.stopPropagation();
        return applyHybridEditorCommand(view, action.run);
    }

    return false;
}
