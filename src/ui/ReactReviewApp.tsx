/** @jsxImportSource react */

import { createRoot, Root } from "react-dom/client";
import { App, Component, WorkspaceLeaf } from "obsidian";
import type SRPlugin from "src/main";
import { FlashcardReviewMode, IFlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import { ReviewSession, type ReviewSessionView } from "./containers/ReviewSession";
import {
    REVIEW_EDIT_MODE_TOGGLE_EVENT,
    type ReviewEditModeToggleDetail,
} from "./reviewEditModeEvents";

export class ReactReviewApp {
    private plugin: SRPlugin;
    private sequencer: IFlashcardReviewSequencer;
    private reviewMode: FlashcardReviewMode;
    private hostLeaf: WorkspaceLeaf;
    private containerEl: HTMLElement;
    private root: Root | null = null;
    private onCloseCallback?: () => void;
    private markdownOwner: Component;
    private initialView: ReviewSessionView;
    private initialTargetDeckPath?: string;

    constructor(
        _app: App,
        plugin: SRPlugin,
        sequencer: IFlashcardReviewSequencer,
        reviewMode: FlashcardReviewMode,
        hostLeaf: WorkspaceLeaf,
        containerEl: HTMLElement,
        markdownOwner: Component,
        onClose?: () => void,
        initialView: ReviewSessionView = "deck-list",
        initialTargetDeckPath?: string,
    ) {
        this.plugin = plugin;
        this.sequencer = sequencer;
        this.reviewMode = reviewMode;
        this.hostLeaf = hostLeaf;
        this.containerEl = containerEl;
        this.markdownOwner = markdownOwner;
        this.onCloseCallback = onClose;
        this.initialView = initialView;
        this.initialTargetDeckPath = initialTargetDeckPath;
    }

    mount(): void {
        this.containerEl.empty();
        this.containerEl.addClass("sr-react-app-root");
        this.containerEl.addClass("syro-react-review-app-root");

        this.root = createRoot(this.containerEl);

        this.root.render(
            <ReviewSession
                plugin={this.plugin}
                sequencer={this.sequencer}
                reviewMode={this.reviewMode}
                hostLeaf={this.hostLeaf}
                markdownOwner={this.markdownOwner}
                onClose={this.onCloseCallback}
                initialView={this.initialView}
                initialTargetDeckPath={this.initialTargetDeckPath}
                editModeRequestTarget={this.containerEl}
            />,
        );
    }

    unmount(): void {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
        this.containerEl.empty();
    }

    remountSession(
        sequencer: IFlashcardReviewSequencer,
        reviewMode: FlashcardReviewMode,
        initialView: ReviewSessionView,
        initialTargetDeckPath?: string,
    ): void {
        this.sequencer = sequencer;
        this.reviewMode = reviewMode;
        this.initialView = initialView;
        this.initialTargetDeckPath = initialTargetDeckPath;
        this.unmount();
        this.mount();
    }

    refresh(): void {
        if (this.root) {
            this.root.render(
                <ReviewSession
                    plugin={this.plugin}
                    sequencer={this.sequencer}
                    reviewMode={this.reviewMode}
                    hostLeaf={this.hostLeaf}
                    markdownOwner={this.markdownOwner}
                    onClose={this.onCloseCallback}
                    initialView={this.initialView}
                    initialTargetDeckPath={this.initialTargetDeckPath}
                    editModeRequestTarget={this.containerEl}
                />,
            );
        }
    }

    requestToggleReviewEditMode(): boolean {
        const detail: ReviewEditModeToggleDetail = { handled: false };
        this.containerEl.dispatchEvent(
            new CustomEvent<ReviewEditModeToggleDetail>(REVIEW_EDIT_MODE_TOGGLE_EVENT, {
                detail,
            }),
        );
        return detail.handled;
    }
}
