import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    type ViewUpdate,
    WidgetType,
} from "@codemirror/view";
import type { TFile } from "obsidian";
import type { ExtractItem, ExtractStore } from "src/dataStore/extractStore";
import { t } from "src/lang/helpers";
import { parseIrExtracts } from "src/util/irExtractParser";

interface IrExtractDecorationHost {
    app: {
        workspace: {
            getActiveFile(): TFile | null;
        };
    };
    extractStore: ExtractStore | null;
    updateExtractPriority(uuid: string, priority: number): Promise<ExtractItem | null>;
}

class IrExtractMetaWidget extends WidgetType {
    constructor(
        private readonly host: IrExtractDecorationHost,
        private readonly item: ExtractItem,
    ) {
        super();
    }

    eq(other: IrExtractMetaWidget): boolean {
        return (
            other.item.uuid === this.item.uuid &&
            other.item.memo === this.item.memo &&
            other.item.priority === this.item.priority
        );
    }

    toDOM(): HTMLElement {
        const wrapper = document.createElement("span");
        wrapper.className = "sr-ir-extract-meta";

        if (this.item.memo.trim()) {
            const memo = document.createElement("span");
            memo.className = "sr-ir-extract-memo";
            memo.textContent = this.item.memo.trim();
            memo.title = this.item.memo.trim();
            wrapper.appendChild(memo);
        }

        const priority = document.createElement("select");
        priority.className = "sr-ir-extract-priority";
        priority.setAttribute("aria-label", t("EXTRACT_PRIORITY_LABEL"));
        priority.title = t("EXTRACT_PRIORITY_LABEL");
        priority.value = String(this.item.priority);
        for (let value = 1; value <= 10; value++) {
            const option = document.createElement("option");
            option.value = String(value);
            option.textContent = String(value);
            priority.appendChild(option);
        }
        priority.addEventListener("mousedown", (event) => event.stopPropagation());
        priority.addEventListener("click", (event) => event.stopPropagation());
        priority.addEventListener("change", (event) => {
            event.stopPropagation();
            const nextPriority = Number(priority.value);
            void this.host.updateExtractPriority(this.item.uuid, nextPriority);
        });
        wrapper.appendChild(priority);

        return wrapper;
    }

    ignoreEvent(): boolean {
        return false;
    }
}

function findExtractItemForMatch(
    host: IrExtractDecorationHost | null,
    match: ReturnType<typeof parseIrExtracts>[number],
): ExtractItem | null {
    const file = host?.app.workspace.getActiveFile();
    if (!host?.extractStore || !file) {
        return null;
    }
    return (
        host.extractStore
            .getActiveByPath(file.path)
            .find(
                (item) =>
                    item.sourceAnchor.start === match.start &&
                    item.sourceAnchor.end === match.end &&
                    item.sourceAnchor.contentHash === match.anchor.contentHash,
            ) ??
        host.extractStore
            .getActiveByPath(file.path)
            .find((item) => item.rawMarkdown === match.rawMarkdown) ??
        null
    );
}

function buildIrExtractDecorations(
    view: EditorView,
    host: IrExtractDecorationHost | null,
): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const text = view.state.doc.toString();
    const matches = parseIrExtracts(text);
    const ranges: Array<{ from: number; to: number; decoration: Decoration }> = [];

    for (const match of matches) {
        if (match.end <= match.start) {
            continue;
        }
        ranges.push({
            from: match.start,
            to: match.end,
            decoration: Decoration.mark({
                class: "sr-ir-extract-mark",
                attributes: {
                    "data-sr-ir": "true",
                },
            }),
        });
        const item = findExtractItemForMatch(host, match);
        if (item && host) {
            ranges.push({
                from: match.end,
                to: match.end,
                decoration: Decoration.widget({
                    widget: new IrExtractMetaWidget(host, item),
                    side: 1,
                }),
            });
        }
    }

    ranges
        .sort((left, right) => left.from - right.from || left.to - right.to)
        .forEach((range) => builder.add(range.from, range.to, range.decoration));

    return builder.finish();
}

function createIrExtractDecorationPlugin(host: IrExtractDecorationHost | null): Extension {
    return ViewPlugin.fromClass(
        class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = buildIrExtractDecorations(view, host);
        }

        update(update: ViewUpdate): void {
            if (update.docChanged || update.viewportChanged || update.focusChanged) {
                this.decorations = buildIrExtractDecorations(update.view, host);
            }
        }
    },
        {
            decorations: (plugin) => plugin.decorations,
        },
    );
}

const irExtractDecorationTheme = EditorView.baseTheme({
    ".sr-ir-extract-mark": {
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "4px",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
        padding: "0 2px",
    },
    ".sr-ir-extract-mark:hover": {
        borderColor: "var(--interactive-accent)",
    },
    ".sr-ir-extract-meta": {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        marginLeft: "4px",
        verticalAlign: "baseline",
    },
    ".sr-ir-extract-memo": {
        maxWidth: "18em",
        overflow: "hidden",
        color: "var(--text-muted)",
        fontSize: "0.85em",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    ".sr-ir-extract-priority": {
        width: "3.6em",
        height: "1.7em",
        minHeight: "1.7em",
        padding: "0 2px",
        opacity: "0",
        transition: "opacity 120ms ease",
    },
    ".sr-ir-extract-mark:hover + .sr-ir-extract-meta .sr-ir-extract-priority, .sr-ir-extract-meta:hover .sr-ir-extract-priority":
        {
            opacity: "1",
        },
});

export function createIrExtractDecorationExtensions(
    host: IrExtractDecorationHost | null = null,
): Extension[] {
    return [createIrExtractDecorationPlugin(host), irExtractDecorationTheme];
}
