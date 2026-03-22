/** @jsxImportSource react */
/**
 * ReactReviewApp - 缁熶竴鐨?React 澶嶄範搴旂敤鍏ュ彛
 *
 * 鏇夸唬鍘熸湁鐨?ReactDeckUI 鍜?ReactCardUI
 * 鍙礋璐ｆ寕杞?鍗歌浇 React Root
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
     * 鎸傝浇 React 搴旂敤
     */
    mount(): void {
        // 娓呯┖骞跺噯澶囧鍣?
        this.containerEl.empty();
        this.containerEl.addClass("sr-react-app-root");
        this.containerEl.addClass("syro-react-review-app-root");

        // 鍒涘缓 React Root
        this.root = createRoot(this.containerEl);

        // 娓叉煋涓荤粍浠?
        this.root.render(
            <ReviewSession
                plugin={this.plugin}
                sequencer={this.sequencer}
                onClose={this.onCloseCallback}
            />,
        );
    }

    /**
     * 鍗歌浇 React 搴旂敤
     */
    unmount(): void {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        this.containerEl.empty();
    }

    /**
     * 鍒锋柊娓叉煋 (濡傛灉闇€瑕佸搷搴斿閮ㄦ暟鎹彉鍖?
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
