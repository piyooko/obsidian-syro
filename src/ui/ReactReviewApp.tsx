/** @jsxImportSource react */
/**
 * ReactReviewApp - 统一的 React 复习应用入口
 *
 * 替代原有的 ReactDeckUI 和 ReactCardUI
 * 只负责挂载/卸载 React Root
 */

import { createRoot, Root } from "react-dom/client";
import { App } from "obsidian";
import type SRPlugin from "src/main";
import { IFlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import { ReviewSession } from "./containers/ReviewSession";

export class ReactReviewApp {
    private app: App;
    private plugin: SRPlugin;
    private sequencer: IFlashcardReviewSequencer;
    private containerEl: HTMLElement;
    private root: Root | null = null;
    private onCloseCallback?: () => void;

    constructor(
        app: App,
        plugin: SRPlugin,
        sequencer: IFlashcardReviewSequencer,
        containerEl: HTMLElement,
        onClose?: () => void,
    ) {
        this.app = app;
        this.plugin = plugin;
        this.sequencer = sequencer;
        this.containerEl = containerEl;
        this.onCloseCallback = onClose;
    }

    /**
     * 挂载 React 应用
     */
    mount(): void {
        // 清空并准备容器
        this.containerEl.empty();
        this.containerEl.addClass("sr-react-app-root");
        this.containerEl.style.height = "100%";
        this.containerEl.style.overflow = "hidden";

        // 创建 React Root
        this.root = createRoot(this.containerEl);

        // 渲染主组件
        this.root.render(
            <ReviewSession
                plugin={this.plugin}
                sequencer={this.sequencer}
                onClose={this.onCloseCallback}
            />,
        );
    }

    /**
     * 卸载 React 应用
     */
    unmount(): void {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        this.containerEl.empty();
    }

    /**
     * 刷新渲染 (如果需要响应外部数据变化)
     */
    refresh(): void {
        if (this.root) {
            this.root.render(
                <ReviewSession
                    plugin={this.plugin}
                    sequencer={this.sequencer}
                    onClose={this.onCloseCallback}
                />,
            );
        }
    }
}
