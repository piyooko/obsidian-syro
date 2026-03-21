import { App, MarkdownView } from "obsidian";

import { ContextAnchorService } from "src/util/ContextAnchor";

export interface TimelineCapturedContext {
    contextAnchor?: {
        textSnippet: string;
        offset: number;
    };
    scrollPercentage?: number;
}

export function captureTimelineContext(app: App, path: string): TimelineCapturedContext {
    let contextAnchor = undefined;
    let scrollPercentage = undefined;

    let activeView: MarkdownView | null = app.workspace.getActiveViewOfType(MarkdownView);
    const leaves = app.workspace.getLeavesOfType("markdown");
    let targetLeaf = null;

    if (activeView?.file?.path === path) {
        targetLeaf = activeView.leaf;
    }

    if (!targetLeaf) {
        const matchingLeaves = leaves.filter((leaf) => {
            const view = leaf.view as MarkdownView;
            return view.file?.path === path;
        });

        let visibleLeaf = null;
        for (const leaf of matchingLeaves) {
            const view = leaf.view as MarkdownView;
            if (view.containerEl.offsetWidth > 0 || view.containerEl.offsetHeight > 0) {
                visibleLeaf = leaf;
                break;
            }
        }

        if (visibleLeaf) {
            targetLeaf = visibleLeaf;
        } else if (matchingLeaves.length > 0) {
            targetLeaf = matchingLeaves[0];
        }
    }

    if (targetLeaf) {
        activeView = targetLeaf.view as MarkdownView;
    } else {
        activeView = null;
    }

    if (activeView?.file?.path === path) {
        const editor = activeView.editor;
        const cursor = editor.getCursor();
        const targetLine = cursor.line;
        const targetCh = cursor.ch;
        const text = editor.getValue();

        const anchor = ContextAnchorService.capture(text, targetLine, targetCh);
        if (anchor) {
            contextAnchor = anchor;
        }

        const totalChars = text.length;
        if (totalChars > 0) {
            const cursorOffset = editor.posToOffset({ line: targetLine, ch: targetCh });
            scrollPercentage = cursorOffset / totalChars;
        }
    }

    return { contextAnchor, scrollPercentage };
}
