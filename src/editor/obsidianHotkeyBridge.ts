import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { Notice, Platform } from "obsidian";
import { t } from "src/lang/helpers";
import {
    selectionContainsIrExtractBoundarySyntax,
    wrapSelectionAsExtract,
} from "src/util/irExtractParser";

export interface ObsidianHotkeySpec {
    key: string;
    modifiers: string[];
}

export type HybridEditorCommandId = string;

export type HybridEditorHotkeyAction =
    | "blockquote"
    | "bold"
    | "bullet-list"
    | "codeblock"
    | "comment"
    | "highlight"
    | "indent"
    | "inline-code"
    | "italic"
    | "link"
    | "math"
    | "numbered-list"
    | "strikethrough"
    | "syro-cloze-new"
    | "syro-cloze-same"
    | "syro-extract"
    | "task-list"
    | "unindent"
    | "unsupported";

export interface HybridHotkeyLogger {
    debug?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
}

type HotkeySource = "custom" | "default" | "fallback" | "none";

export interface InvalidHybridHotkey {
    commandId: string;
    hotkey: unknown;
    reason: string;
    source: HotkeySource;
}

export interface ResolvedHybridEditorCommand {
    action: HybridEditorHotkeyAction;
    commandId: string;
    commandIds: string[];
    hotkeys: ObsidianHotkeySpec[];
    source: HotkeySource;
    supported: boolean;
}

export interface HybridEditorHotkeyRegistry {
    invalidHotkeys: InvalidHybridHotkey[];
    noHotkeyCommands: string[];
    officialEditorCommands: string[];
    supported: ResolvedHybridEditorCommand[];
    syroCommands: string[];
    unsupported: ResolvedHybridEditorCommand[];
}

export const REVIEW_EDIT_MODE_COMMAND_ID = "syro:srs-toggle-review-edit-mode";

interface ObsidianCommandsLike {
    commands?: {
        commands?: Record<string, { hotkeys?: unknown }>;
    };
    hotkeyManager?: {
        customKeys?: Record<string, unknown>;
    };
}

interface HybridHotkeyActionDefinition {
    action: Exclude<HybridEditorHotkeyAction, "unsupported">;
    commandIds: string[];
    fallback: ObsidianHotkeySpec[];
    run: string;
}

const HYBRID_HOTKEY_ACTIONS: HybridHotkeyActionDefinition[] = [
    {
        action: "bold",
        commandIds: ["editor:toggle-bold"],
        fallback: [{ modifiers: ["Mod"], key: "B" }],
        run: "editor:toggle-bold",
    },
    {
        action: "italic",
        commandIds: ["editor:toggle-italics", "editor:toggle-italic"],
        fallback: [{ modifiers: ["Mod"], key: "I" }],
        run: "editor:toggle-italics",
    },
    {
        action: "strikethrough",
        commandIds: ["editor:toggle-strikethrough"],
        fallback: [{ modifiers: ["Mod", "Shift"], key: "S" }],
        run: "editor:toggle-strikethrough",
    },
    {
        action: "highlight",
        commandIds: ["editor:toggle-highlight"],
        fallback: [{ modifiers: ["Mod", "Shift"], key: "H" }],
        run: "editor:toggle-highlight",
    },
    {
        action: "inline-code",
        commandIds: ["editor:toggle-inline-code", "editor:toggle-code"],
        fallback: [{ modifiers: ["Mod"], key: "E" }],
        run: "editor:toggle-inline-code",
    },
    {
        action: "math",
        commandIds: ["editor:insert-math-expression", "editor:insert-math"],
        fallback: [{ modifiers: ["Mod", "Shift"], key: "M" }],
        run: "editor:insert-math-expression",
    },
    {
        action: "link",
        commandIds: ["editor:insert-link"],
        fallback: [{ modifiers: ["Mod"], key: "K" }],
        run: "editor:insert-link",
    },
    {
        action: "bullet-list",
        commandIds: ["editor:toggle-bullet-list", "editor:toggle-unordered-list"],
        fallback: [],
        run: "editor:toggle-bullet-list",
    },
    {
        action: "numbered-list",
        commandIds: ["editor:toggle-numbered-list", "editor:toggle-ordered-list"],
        fallback: [],
        run: "editor:toggle-numbered-list",
    },
    {
        action: "task-list",
        commandIds: [
            "editor:toggle-task-list",
            "editor:toggle-checklist",
            "editor:toggle-checkbox-list",
        ],
        fallback: [],
        run: "editor:toggle-task-list",
    },
    {
        action: "blockquote",
        commandIds: ["editor:toggle-blockquote", "editor:toggle-quote"],
        fallback: [],
        run: "editor:toggle-blockquote",
    },
    {
        action: "codeblock",
        commandIds: [
            "editor:insert-codeblock",
            "editor:insert-code-block",
            "editor:toggle-codeblock",
            "editor:toggle-code-block",
        ],
        fallback: [],
        run: "editor:insert-codeblock",
    },
    {
        action: "comment",
        commandIds: ["editor:toggle-comment"],
        fallback: [],
        run: "editor:toggle-comment",
    },
    {
        action: "indent",
        commandIds: ["editor:indent-list", "editor:indent-more", "editor:indent"],
        fallback: [],
        run: "editor:indent-list",
    },
    {
        action: "unindent",
        commandIds: [
            "editor:unindent-list",
            "editor:indent-less",
            "editor:unindent",
            "editor:outdent",
        ],
        fallback: [],
        run: "editor:unindent-list",
    },
    {
        action: "syro-cloze-new",
        commandIds: ["syro:srs-cloze-new-level"],
        fallback: [{ modifiers: ["Alt", "Shift"], key: "C" }],
        run: "syro:srs-cloze-new-level",
    },
    {
        action: "syro-cloze-same",
        commandIds: ["syro:srs-cloze-same-level"],
        fallback: [{ modifiers: ["Alt", "Mod", "Shift"], key: "C" }],
        run: "syro:srs-cloze-same-level",
    },
    {
        action: "syro-extract",
        commandIds: ["syro:create-extract-from-selection"],
        fallback: [{ modifiers: ["Alt", "Shift"], key: "E" }],
        run: "syro:create-extract-from-selection",
    },
];

const SUPPORTED_HYBRID_COMMAND_IDS = new Set(
    HYBRID_HOTKEY_ACTIONS.flatMap((action) => action.commandIds),
);

const REVIEW_EDIT_MODE_FALLBACK_HOTKEYS: ObsidianHotkeySpec[] = [{ modifiers: ["Alt"], key: "E" }];

const FORMAT_WRAPPERS: Record<string, [string, string]> = {
    "editor:insert-math-expression": ["$", "$"],
    "editor:toggle-bold": ["**", "**"],
    "editor:toggle-comment": ["%%", "%%"],
    "editor:toggle-highlight": ["==", "=="],
    "editor:toggle-inline-code": ["`", "`"],
    "editor:toggle-italics": ["*", "*"],
    "editor:toggle-strikethrough": ["~~", "~~"],
};

function normalizeKey(key: string): string {
    return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
}

function isModifierOnlyKey(key: string): boolean {
    return ["alt", "control", "ctrl", "meta", "mod", "shift"].includes(normalizeKey(key));
}

function normalizeModifiers(modifiers: readonly string[]): string[] {
    return [...modifiers].map((modifier) => (modifier === "Ctrl" ? "Mod" : modifier)).sort();
}

function hotkeySignature(hotkey: ObsidianHotkeySpec): string {
    return `${normalizeModifiers(hotkey.modifiers).join("+")}::${normalizeKey(hotkey.key)}`;
}

function hasOwnKey(record: Record<string, unknown> | undefined, key: string): boolean {
    if (!record) {
        return false;
    }
    return Object.prototype.hasOwnProperty.call(record, key) === true;
}

function recordInvalidHotkey(
    invalidHotkeys: InvalidHybridHotkey[],
    logger: HybridHotkeyLogger | undefined,
    commandId: string,
    source: HotkeySource,
    hotkey: unknown,
    reason: string,
): void {
    const entry = { commandId, hotkey, reason, source };
    invalidHotkeys.push(entry);
    logger?.warn?.("[SR-HotkeyBridge] invalid-hotkey", entry);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseHotkeySpec(
    hotkey: unknown,
    commandId: string,
    source: HotkeySource,
    invalidHotkeys: InvalidHybridHotkey[],
    logger?: HybridHotkeyLogger,
): ObsidianHotkeySpec | null {
    if (!hotkey || typeof hotkey !== "object") {
        recordInvalidHotkey(invalidHotkeys, logger, commandId, source, hotkey, "hotkey-not-object");
        return null;
    }

    const candidate = hotkey as { key?: unknown; modifiers?: unknown };
    if (typeof candidate.key !== "string" || candidate.key.length === 0) {
        recordInvalidHotkey(invalidHotkeys, logger, commandId, source, hotkey, "invalid-key");
        return null;
    }

    if (!isStringArray(candidate.modifiers)) {
        recordInvalidHotkey(invalidHotkeys, logger, commandId, source, hotkey, "invalid-modifiers");
        return null;
    }

    if (isModifierOnlyKey(candidate.key)) {
        recordInvalidHotkey(invalidHotkeys, logger, commandId, source, hotkey, "modifier-only-key");
        return null;
    }

    return {
        key: candidate.key,
        modifiers: [...candidate.modifiers],
    };
}

function readHotkeyArray(
    rawHotkeys: unknown,
    commandId: string,
    source: HotkeySource,
    invalidHotkeys: InvalidHybridHotkey[],
    logger?: HybridHotkeyLogger,
): ObsidianHotkeySpec[] {
    if (rawHotkeys === undefined || rawHotkeys === null) {
        return [];
    }
    if (!Array.isArray(rawHotkeys)) {
        recordInvalidHotkey(
            invalidHotkeys,
            logger,
            commandId,
            source,
            rawHotkeys,
            "hotkeys-not-array",
        );
        return [];
    }

    return rawHotkeys
        .map((hotkey) => parseHotkeySpec(hotkey, commandId, source, invalidHotkeys, logger))
        .filter((hotkey): hotkey is ObsidianHotkeySpec => hotkey !== null);
}

function pushUniqueHotkey(
    target: ObsidianHotkeySpec[],
    seen: Set<string>,
    hotkey: ObsidianHotkeySpec | null | undefined,
): void {
    if (!hotkey || !hotkey.key || !Array.isArray(hotkey.modifiers)) {
        return;
    }
    const signature = hotkeySignature(hotkey);
    if (seen.has(signature)) {
        return;
    }
    seen.add(signature);
    target.push({ key: hotkey.key, modifiers: [...hotkey.modifiers] });
}

function collectHotkeysWithCustomOverride(
    app: unknown,
    commandIds: readonly string[],
    fallback: readonly ObsidianHotkeySpec[],
    invalidHotkeys: InvalidHybridHotkey[],
    logger?: HybridHotkeyLogger,
): { hotkeys: ObsidianHotkeySpec[]; source: HotkeySource } {
    const appWithCommands = (app ?? {}) as ObsidianCommandsLike;
    const customKeys = appWithCommands.hotkeyManager?.customKeys;
    const customHotkeys: ObsidianHotkeySpec[] = [];
    const customSeen = new Set<string>();
    let hasCustomOverride = false;

    for (const commandId of commandIds) {
        if (!hasOwnKey(customKeys, commandId)) {
            continue;
        }
        hasCustomOverride = true;
        for (const hotkey of readHotkeyArray(
            customKeys?.[commandId],
            commandId,
            "custom",
            invalidHotkeys,
            logger,
        )) {
            pushUniqueHotkey(customHotkeys, customSeen, hotkey);
        }
    }

    if (hasCustomOverride) {
        return { hotkeys: customHotkeys, source: "custom" };
    }

    const defaultHotkeys: ObsidianHotkeySpec[] = [];
    const defaultSeen = new Set<string>();
    for (const commandId of commandIds) {
        for (const hotkey of readHotkeyArray(
            appWithCommands.commands?.commands?.[commandId]?.hotkeys,
            commandId,
            "default",
            invalidHotkeys,
            logger,
        )) {
            pushUniqueHotkey(defaultHotkeys, defaultSeen, hotkey);
        }
    }

    if (defaultHotkeys.length > 0) {
        return { hotkeys: defaultHotkeys, source: "default" };
    }

    const fallbackHotkeys: ObsidianHotkeySpec[] = [];
    const fallbackSeen = new Set<string>();
    fallback.forEach((hotkey) => pushUniqueHotkey(fallbackHotkeys, fallbackSeen, hotkey));
    return {
        hotkeys: fallbackHotkeys,
        source: fallbackHotkeys.length > 0 ? "fallback" : "none",
    };
}

export function resolveObsidianHotkeys(
    app: unknown,
    commandIds: readonly string[],
    fallback: readonly ObsidianHotkeySpec[],
): ObsidianHotkeySpec[] {
    const invalidHotkeys: InvalidHybridHotkey[] = [];
    return collectHotkeysWithCustomOverride(app, commandIds, fallback, invalidHotkeys).hotkeys;
}

export function resolveHybridEditorHotkeyRegistry(
    app: unknown,
    logger?: HybridHotkeyLogger,
): HybridEditorHotkeyRegistry {
    const appWithCommands = (app ?? {}) as ObsidianCommandsLike;
    const commandMap = appWithCommands.commands?.commands ?? {};
    const officialEditorCommands = Object.keys(commandMap)
        .filter((commandId) => commandId.startsWith("editor:"))
        .sort();
    const invalidHotkeys: InvalidHybridHotkey[] = [];

    const supported = HYBRID_HOTKEY_ACTIONS.map((action) => {
        const resolved = collectHotkeysWithCustomOverride(
            app,
            action.commandIds,
            action.fallback,
            invalidHotkeys,
            logger,
        );
        return {
            action: action.action,
            commandId: action.run,
            commandIds: [...action.commandIds],
            hotkeys: resolved.hotkeys,
            source: resolved.source,
            supported: true,
        };
    });

    const unsupported = officialEditorCommands
        .filter((commandId) => !SUPPORTED_HYBRID_COMMAND_IDS.has(commandId))
        .map((commandId) => {
            const resolved = collectHotkeysWithCustomOverride(
                app,
                [commandId],
                [],
                invalidHotkeys,
                logger,
            );
            return {
                action: "unsupported" as const,
                commandId,
                commandIds: [commandId],
                hotkeys: resolved.hotkeys,
                source: resolved.source,
                supported: false,
            };
        });

    const noHotkeyCommands = [...supported, ...unsupported]
        .filter((command) => command.hotkeys.length === 0)
        .map((command) => command.commandId);
    const syroCommands = HYBRID_HOTKEY_ACTIONS.flatMap((action) => action.commandIds)
        .filter((commandId) => commandId.startsWith("syro:"))
        .sort();

    return {
        invalidHotkeys,
        noHotkeyCommands,
        officialEditorCommands,
        supported,
        syroCommands,
        unsupported,
    };
}

function formatHotkeyForLog(hotkey: ObsidianHotkeySpec): string {
    return [...normalizeModifiers(hotkey.modifiers), normalizeKey(hotkey.key)].join("+");
}

export function logHybridEditorHotkeyResolution(
    app: unknown,
    logger: HybridHotkeyLogger = console,
): HybridEditorHotkeyRegistry {
    const registry = resolveHybridEditorHotkeyRegistry(app, logger);
    logger.debug?.("[SR-HotkeyBridge] resolve-summary", {
        officialEditorCommands: registry.officialEditorCommands,
        syroCommands: registry.syroCommands,
        supportedCommands: registry.supported.map((command) => command.commandId),
        validHotkeys: registry.supported
            .filter((command) => command.hotkeys.length > 0)
            .map((command) => ({
                action: command.action,
                commandId: command.commandId,
                hotkeys: command.hotkeys.map(formatHotkeyForLog),
                source: command.source,
            })),
        noHotkeyCommands: registry.noHotkeyCommands,
        unsupportedCommands: registry.unsupported.map((command) => command.commandId),
        invalidHotkeyCount: registry.invalidHotkeys.length,
    });
    return registry;
}

function resolveObsidianCommandHotkeysWithCustomOverride(
    app: unknown,
    commandIds: readonly string[],
    fallback: readonly ObsidianHotkeySpec[],
): ObsidianHotkeySpec[] {
    const invalidHotkeys: InvalidHybridHotkey[] = [];
    return collectHotkeysWithCustomOverride(app, commandIds, fallback, invalidHotkeys).hotkeys;
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

export function eventMatchesReviewEditModeHotkey(event: KeyboardEvent, app: unknown): boolean {
    const hotkeys = resolveObsidianCommandHotkeysWithCustomOverride(
        app,
        [REVIEW_EDIT_MODE_COMMAND_ID],
        REVIEW_EDIT_MODE_FALLBACK_HOTKEYS,
    );
    return hotkeys.some((hotkey) => eventMatchesObsidianHotkey(event, hotkey));
}

export function eventMatchesOfficialEditorCommandHotkey(
    event: KeyboardEvent,
    app: unknown,
): boolean {
    const registry = resolveHybridEditorHotkeyRegistry(app);
    return [...registry.supported, ...registry.unsupported]
        .filter(
            (command) =>
                command.commandId.startsWith("editor:") ||
                command.commandIds.some((commandId) => commandId.startsWith("editor:")),
        )
        .some((command) =>
            command.hotkeys.some((hotkey) => eventMatchesObsidianHotkey(event, hotkey)),
        );
}

function formatHotkeyModifier(modifier: string): string {
    if (modifier === "Mod") {
        return isMacPlatform() ? "Cmd" : "Ctrl";
    }
    if (modifier === "Meta") {
        return "Cmd";
    }
    return modifier;
}

function formatHotkeyKey(key: string): string {
    return key.length === 1 ? key.toUpperCase() : key;
}

export function getReviewEditModeHotkeyLabel(app: unknown): string | null {
    const [hotkey] = resolveObsidianCommandHotkeysWithCustomOverride(
        app,
        [REVIEW_EDIT_MODE_COMMAND_ID],
        REVIEW_EDIT_MODE_FALLBACK_HOTKEYS,
    );
    if (!hotkey) {
        return null;
    }
    return [
        ...normalizeModifiers(hotkey.modifiers).map(formatHotkeyModifier),
        formatHotkeyKey(hotkey.key),
    ].join("+");
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

function insertCodeBlock(view: EditorView): void {
    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to);
    const prefix = "```\n";
    const suffix = "\n```";
    const replacement = `${prefix}${selectedText}${suffix}`;

    view.dispatch({
        changes: { from: selection.from, insert: replacement, to: selection.to },
        selection: EditorSelection.range(
            selection.from + prefix.length,
            selection.from + prefix.length + selectedText.length,
        ),
    });
    view.focus();
}

function getSelectedLineNumbers(view: EditorView): number[] {
    const selection = view.state.selection.main;
    const toPosition =
        selection.to > selection.from ? Math.max(selection.from, selection.to - 1) : selection.to;
    const fromLine = view.state.doc.lineAt(selection.from);
    const toLine = view.state.doc.lineAt(toPosition);
    const lineNumbers: number[] = [];

    for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber++) {
        lineNumbers.push(lineNumber);
    }

    return lineNumbers;
}

function dispatchLineChanges(
    view: EditorView,
    changes: Array<{ from: number; insert: string; to: number }>,
): void {
    if (changes.length > 0) {
        view.dispatch({ changes: changes.sort((a, b) => a.from - b.from) });
    }
    view.focus();
}

function toggleList(view: EditorView, ordered: boolean): void {
    const changes: Array<{ from: number; insert: string; to: number }> = [];

    getSelectedLineNumbers(view).forEach((lineNumber, index) => {
        const line = view.state.doc.line(lineNumber);
        const existing = line.text.match(/^(\s*)((?:[-+*]|\d+[.)])\s+)/);
        if (existing) {
            changes.push({
                from: line.from + existing[1].length,
                insert: "",
                to: line.from + existing[1].length + existing[2].length,
            });
            return;
        }

        const indent = line.text.match(/^\s*/)?.[0] ?? "";
        const marker = ordered ? `${index + 1}. ` : "- ";
        changes.push({
            from: line.from + indent.length,
            insert: marker,
            to: line.from + indent.length,
        });
    });

    dispatchLineChanges(view, changes);
}

function toggleTaskList(view: EditorView): void {
    const changes: Array<{ from: number; insert: string; to: number }> = [];

    for (const lineNumber of getSelectedLineNumbers(view)) {
        const line = view.state.doc.line(lineNumber);
        const existingTask = line.text.match(/^(\s*)((?:[-+*]|\d+[.)])\s+\[[ xX]\]\s+)/);
        if (existingTask) {
            changes.push({
                from: line.from + existingTask[1].length,
                insert: "",
                to: line.from + existingTask[1].length + existingTask[2].length,
            });
            continue;
        }

        const existingList = line.text.match(/^(\s*)((?:[-+*]|\d+[.)])\s+)/);
        if (existingList) {
            changes.push({
                from: line.from + existingList[1].length,
                insert: "- [ ] ",
                to: line.from + existingList[1].length + existingList[2].length,
            });
            continue;
        }

        const indent = line.text.match(/^\s*/)?.[0] ?? "";
        changes.push({
            from: line.from + indent.length,
            insert: "- [ ] ",
            to: line.from + indent.length,
        });
    }

    dispatchLineChanges(view, changes);
}

function toggleIndentedLinePrefix(view: EditorView, prefix: string): void {
    const changes: Array<{ from: number; insert: string; to: number }> = [];

    for (const lineNumber of getSelectedLineNumbers(view)) {
        const line = view.state.doc.line(lineNumber);
        const indent = line.text.match(/^\s*/)?.[0] ?? "";
        const contentStart = line.from + indent.length;
        const content = line.text.slice(indent.length);
        if (content.startsWith(prefix)) {
            changes.push({ from: contentStart, insert: "", to: contentStart + prefix.length });
        } else {
            changes.push({ from: contentStart, insert: prefix, to: contentStart });
        }
    }

    dispatchLineChanges(view, changes);
}

function indentLines(view: EditorView): void {
    const changes = getSelectedLineNumbers(view).map((lineNumber) => {
        const line = view.state.doc.line(lineNumber);
        return { from: line.from, insert: "    ", to: line.from };
    });
    dispatchLineChanges(view, changes);
}

function unindentLines(view: EditorView): void {
    const changes: Array<{ from: number; insert: string; to: number }> = [];

    for (const lineNumber of getSelectedLineNumbers(view)) {
        const line = view.state.doc.line(lineNumber);
        const indent = line.text.match(/^(\t| {1,4})/)?.[0];
        if (!indent) {
            continue;
        }
        changes.push({ from: line.from, insert: "", to: line.from + indent.length });
    }

    dispatchLineChanges(view, changes);
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

function insertExtractWrapper(view: EditorView): boolean {
    const selection = view.state.selection.main;
    const text = view.state.doc.toString();
    if (selectionContainsIrExtractBoundarySyntax(text, selection.from, selection.to)) {
        new Notice(t("EXTRACT_INVALID_FORMAT_BLOCKED"));
        view.focus();
        return false;
    }
    const wrapped = wrapSelectionAsExtract(text, selection.from, selection.to);
    const replacement = wrapped.text.slice(wrapped.from, wrapped.to);

    view.dispatch({
        changes: { from: wrapped.replaceFrom, insert: replacement, to: wrapped.replaceTo },
        selection: EditorSelection.range(wrapped.innerFrom, wrapped.innerTo),
    });
    view.focus();
    return true;
}

function getSupportedAction(commandId: string): HybridEditorHotkeyAction | null {
    return (
        HYBRID_HOTKEY_ACTIONS.find((action) => action.commandIds.includes(commandId))?.action ??
        null
    );
}

export function applyHybridEditorCommand(
    view: EditorView,
    commandId: HybridEditorCommandId,
): boolean {
    const action = getSupportedAction(commandId);
    const wrapper = FORMAT_WRAPPERS[commandId];
    if (wrapper) {
        replaceSelectionWithWrapper(view, wrapper[0], wrapper[1]);
        return true;
    }

    if (action === "link") {
        insertMarkdownLink(view);
        return true;
    }

    if (action === "bullet-list") {
        toggleList(view, false);
        return true;
    }

    if (action === "numbered-list") {
        toggleList(view, true);
        return true;
    }

    if (action === "task-list") {
        toggleTaskList(view);
        return true;
    }

    if (action === "blockquote") {
        toggleIndentedLinePrefix(view, "> ");
        return true;
    }

    if (action === "codeblock") {
        insertCodeBlock(view);
        return true;
    }

    if (action === "comment") {
        replaceSelectionWithWrapper(view, "%%", "%%");
        return true;
    }

    if (action === "indent") {
        indentLines(view);
        return true;
    }

    if (action === "unindent") {
        unindentLines(view);
        return true;
    }

    if (action === "syro-cloze-new") {
        insertCloze(view, "new");
        return true;
    }

    if (action === "syro-cloze-same") {
        insertCloze(view, "same");
        return true;
    }

    if (action === "syro-extract") {
        return insertExtractWrapper(view);
    }

    return false;
}

function commandFailureDetail(
    event: KeyboardEvent,
    view: EditorView,
    command: ResolvedHybridEditorCommand,
    reason: string,
    error?: unknown,
): Record<string, unknown> {
    const selection = view.state.selection.main;
    const detail: Record<string, unknown> = {
        action: command.action,
        commandId: command.commandId,
        docLength: view.state.doc.length,
        key: event.key,
        reason,
        selection: { from: selection.from, to: selection.to },
    };

    if (error instanceof Error) {
        detail.error = `${error.name}: ${error.message}`;
    } else if (error !== undefined) {
        detail.error = error;
    }

    return detail;
}

export function runResolvedHybridEditorHotkeyCommand(
    event: KeyboardEvent,
    view: EditorView,
    command: ResolvedHybridEditorCommand,
    logger: HybridHotkeyLogger = console,
): boolean {
    event.preventDefault();
    event.stopPropagation();
    logger.debug?.("[SR-HotkeyBridge] local-matched", {
        action: command.action,
        commandId: command.commandId,
        hotkey: command.hotkeys.map(formatHotkeyForLog),
        key: event.key,
    });

    try {
        const handled = applyHybridEditorCommand(view, command.commandId);
        if (!handled) {
            logger.error?.(
                "[SR-HotkeyBridge] command-failed",
                commandFailureDetail(event, view, command, "command-returned-false"),
            );
        }
    } catch (error) {
        logger.error?.(
            "[SR-HotkeyBridge] command-failed",
            commandFailureDetail(event, view, command, "command-threw", error),
        );
    }

    return true;
}

export function handleHybridEditorHotkey(
    event: KeyboardEvent,
    view: EditorView,
    app: unknown,
    logger: HybridHotkeyLogger = console,
): boolean {
    const registry = resolveHybridEditorHotkeyRegistry(app);

    for (const command of registry.supported) {
        const matchedHotkey = command.hotkeys.find((hotkey) =>
            eventMatchesObsidianHotkey(event, hotkey),
        );
        if (!matchedHotkey) {
            continue;
        }

        return runResolvedHybridEditorHotkeyCommand(
            event,
            view,
            {
                ...command,
                hotkeys: [matchedHotkey],
            },
            logger,
        );
    }

    return false;
}
