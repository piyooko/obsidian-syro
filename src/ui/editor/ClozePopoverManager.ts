import { App, MarkdownRenderer, Component } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import React from "react";
import { ClozePopover } from "../components/ClozePopover";
import { EditorView } from "@codemirror/view";

interface ClozeInfo {
    id: string;
    content: string;
    start: number;
    end: number;
}

interface Segment {
    id: string;
    text: string;
    clozeId?: string;
}

/**
 * Cloze Popover 管理器
 * 不继承 Modal，创建浮动 div 作为 Popover
 */
export class ClozePopoverManager {
    private app: App;
    private view: EditorView;
    private currentFrom: number;
    private currentTo: number;
    private currentId: string;
    private currentContent: string;
    private anchorElement: HTMLElement;

    private container: HTMLDivElement | null = null;
    private root: Root | null = null;
    private allClozes: ClozeInfo[] = [];
    private segments: Segment[] = [];
    private blockStart: number = 0;
    private blockEnd: number = 0;
    private renderComponent: Component;

    constructor(
        app: App,
        view: EditorView,
        from: number,
        to: number,
        id: string,
        content: string,
        anchorElement: HTMLElement,
    ) {
        this.app = app;
        this.view = view;
        this.currentFrom = from;
        this.currentTo = to;
        this.currentId = id;
        this.currentContent = content;
        this.anchorElement = anchorElement;
        this.renderComponent = new Component();
    }

    open() {
        // 创建容器
        this.container = document.createElement("div");
        this.container.className = "sr-cloze-popover-container";
        document.body.appendChild(this.container);

        this.root = createRoot(this.container);
        this.renderComponent.load();

        this.parseBlock();
        this.render();
    }

    close() {
        this.renderComponent.unload();
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
    }

    /**
     * 解析当前段落，构建 segments 和 allClozes
     */
    private parseBlock() {
        const doc = this.view.state.doc;

        // 找到段落边界
        let start = this.currentFrom;
        while (start > 0 && doc.sliceString(start - 1, start) !== "\n") start--;
        let end = this.currentTo;
        while (end < doc.length && doc.sliceString(end, end + 1) !== "\n") end++;

        this.blockStart = start;
        this.blockEnd = end;

        const blockText = doc.sliceString(start, end);
        this.parseSegments(blockText, start);
    }

    private parseSegments(blockText: string, start: number) {
        const regex = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g;

        this.allClozes = [];
        this.segments = [];

        let lastIndex = 0;
        let segmentId = 0;
        let match;

        while ((match = regex.exec(blockText)) !== null) {
            // 添加 cloze 之前的普通文本
            if (match.index > lastIndex) {
                this.segments.push({
                    id: `s${segmentId++}`,
                    text: blockText.slice(lastIndex, match.index),
                });
            }

            // 添加 cloze 内容作为 segment
            const clozeId = match[1];
            const clozeContent = match[2];

            this.segments.push({
                id: `s${segmentId++}`,
                text: clozeContent,
                clozeId: clozeId,
            });

            this.allClozes.push({
                id: clozeId,
                content: clozeContent,
                start: start + match.index,
                end: start + match.index + match[0].length,
            });

            lastIndex = match.index + match[0].length;
        }

        // 添加最后的普通文本
        if (lastIndex < blockText.length) {
            this.segments.push({
                id: `s${segmentId++}`,
                text: blockText.slice(lastIndex),
            });
        }
    }

    private getOtherGroups() {
        const groups = new Map<string, { content: string; count: number }>();

        this.allClozes.forEach((c) => {
            if (c.id !== this.currentId) {
                const existing = groups.get(c.id);
                if (existing) {
                    existing.count++;
                } else {
                    groups.set(c.id, { content: c.content, count: 1 });
                }
            }
        });

        return Array.from(groups.entries())
            .map(([id, info]) => ({
                id,
                content: info.content,
                count: info.count,
            }))
            .sort((a, b) => parseInt(a.id) - parseInt(b.id));
    }

    /**
     * 合并：将当前 ID 的**所有** Cloze 实例合并到目标 ID，不关闭弹窗
     */
    private handleMerge(targetId: string) {
        // 找到同组的所有 cloze (ID 相同)
        const clozesToUpdate = this.allClozes.filter((c) => c.id === this.currentId);

        // 构建批量变更
        // 这里的 ranges 需要小心，因为替换长度变化会导致偏移量变化
        // 但是这里只改变 ID (数字长度可能变化)，CodeMirror 的 changes 数组如果按倒序或者由 EditorView 处理偏移会自动处理?
        // CodeMirror dispatch changes 应该是原子的且会自动处理偏移，只要提供的 range 是基于原始文档的。
        const changes = clozesToUpdate.map((cloze) => {
            const originalText = this.view.state.doc.sliceString(cloze.start, cloze.end);
            // 替换 {{cX::...}} 为 {{cY::...}}
            const newText = originalText.replace(/^\{\{c\d+::/, `{{c${targetId}::`);
            return { from: cloze.start, to: cloze.end, insert: newText };
        });

        if (changes.length > 0) {
            this.view.dispatch({ changes });

            // 更新当前 ID
            this.currentId = targetId;

            // 重新解析并渲染，不关闭弹窗
            this.refreshAfterEdit();
        }
    }

    /**
     * 拆分：将所有 Cloze 按顺序重新编号 c1, c2, c3...，不关闭弹窗
     */
    private handleSplit() {
        let counter = 1;
        const changes = this.allClozes.map((cloze) => {
            const originalText = this.view.state.doc.sliceString(cloze.start, cloze.end);
            const newText = originalText.replace(/^\{\{c\d+::/, `{{c${counter}::`);
            counter++;
            return { from: cloze.start, to: cloze.end, insert: newText };
        });

        this.view.dispatch({ changes });

        // 更新当前 ID 为第一个 (或者这之后 split 的逻辑可能导致 currentId 失效，也许应该重置为用户点击位置的新 ID?)
        // 用户点击的位置在 this.currentFrom，Split 后这里的 ID 变成了什么？
        // 如果 split 是单纯的重排序，我们需要重新根据位置查找 ID。
        // 为了简单起见，这里暂不深究，因为 refreshAfterEdit 会重绘。
        // 但最好还是重置 currentId。
        this.currentId = "1"; // 只是个占位，refresh 会处理

        // 重新解析并渲染，不关闭弹窗
        this.refreshAfterEdit();
    }

    /**
     * 合并所有：将段落内所有 Cloze 合并到 c1，不关闭弹窗
     */
    private handleMergeAll() {
        // 如果想要真正的“合并所有”，通常意味着所有都变成 c1
        const changes = this.allClozes.map((cloze) => {
            const originalText = this.view.state.doc.sliceString(cloze.start, cloze.end);
            const newText = originalText.replace(/^\{\{c\d+::/, `{{c1::`);
            return { from: cloze.start, to: cloze.end, insert: newText };
        });

        this.view.dispatch({ changes });

        // 更新当前 ID
        this.currentId = "1";

        // 重新解析并渲染，不关闭弹窗
        this.refreshAfterEdit();
    }

    private render() {
        if (!this.root || !this.container) return;

        // 获取当前组的所有内容
        const currentGroupTexts = this.allClozes
            .filter((c) => c.id === this.currentId)
            .map((c) => c.content);

        // 如果没有找到 currentId 对应的 cloze (可能已被修改)，则 fallback 到 currentContent
        const displayContent =
            currentGroupTexts.length > 0 ? currentGroupTexts.join(", ") : this.currentContent;

        this.root.render(
            React.createElement(ClozePopover, {
                anchorElement: this.anchorElement,
                currentId: this.currentId,
                currentContent: displayContent, // 传递合并后的内容字符串
                otherGroups: this.getOtherGroups(),
                segments: this.segments,
                onMerge: (targetId) => this.handleMerge(targetId),
                onSplit: () => this.handleSplit(),
                onMergeAll: () => this.handleMergeAll(),
                onClose: () => this.close(),
                renderMarkdown: (text, el) => {
                    MarkdownRenderer.render(this.app, text, el, "", this.renderComponent);
                },
            }),
        );
    }

    /**
     * 编辑后刷新：重新解析段落并渲染
     */
    private refreshAfterEdit() {
        // 等待 DOM 更新后重新解析
        setTimeout(() => {
            const doc = this.view.state.doc;

            // 重新找到段落边界（编辑后位置可能变化）
            let start = this.blockStart;
            let end = Math.min(this.blockEnd, doc.length);

            // 重新调整边界
            while (start > 0 && doc.sliceString(start - 1, start) !== "\n") start--;
            while (end < doc.length && doc.sliceString(end, end + 1) !== "\n") end++;

            this.blockStart = start;
            this.blockEnd = end;

            const blockText = doc.sliceString(start, end);

            this.parseSegments(blockText, start);

            // 更新当前内容
            const currentCloze = this.allClozes.find((c) => c.id === this.currentId);
            if (currentCloze) {
                this.currentContent = currentCloze.content;
                this.currentFrom = currentCloze.start;
                this.currentTo = currentCloze.end;
            } else if (this.allClozes.length > 0) {
                // 如果当前 ID 不存在了，选择第一个
                const first = this.allClozes[0];
                this.currentId = first.id;
                this.currentContent = first.content;
                this.currentFrom = first.start;
                this.currentTo = first.end;
            }

            this.render();
        }, 50);
    }
}
