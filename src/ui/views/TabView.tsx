import { ItemView, WorkspaceLeaf } from "obsidian";

import { SR_TAB_VIEW } from "src/constants";
import { FlashcardReviewMode, IFlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import type SRPlugin from "src/main";
import { ReactReviewApp } from "src/ui/ReactReviewApp";
import type { ReviewSessionView } from "src/ui/containers/ReviewSession";

export interface ReviewSessionLoadResult {
    reviewSequencer: IFlashcardReviewSequencer;
    mode: FlashcardReviewMode;
    initialView?: ReviewSessionView;
    initialTargetDeckPath?: string;
}

/**
 * TabView wraps the React-based flashcard review surface inside an Obsidian tab.
 * The session loader can be called again when an existing tab needs to switch
 * between global review and a targeted deck review.
 */
export class TabView extends ItemView {
    loadReviewSequencerData: () => Promise<ReviewSessionLoadResult>;

    private plugin: SRPlugin;
    private viewContainerEl: HTMLElement;
    private viewContentEl: HTMLElement;
    private reviewSequencer: IFlashcardReviewSequencer | null = null;
    private reactApp: ReactReviewApp | null = null;
    private openErrorCount = 0;

    constructor(
        leaf: WorkspaceLeaf,
        plugin: SRPlugin,
        loadReviewSequencerData: () => Promise<ReviewSessionLoadResult>,
    ) {
        super(leaf);
        this.plugin = plugin;
        this.loadReviewSequencerData = loadReviewSequencerData;

        const viewContent = this.containerEl.getElementsByClassName("view-content");
        if (viewContent.length > 0) {
            this.viewContainerEl = viewContent[0] as HTMLElement;
            this.viewContainerEl.addClass("sr-tab-view");
            this.viewContentEl = this.viewContainerEl.createDiv("sr-tab-view-content");
            this.viewContentEl.addClass("syro-tab-view-content");
            this.viewContainerEl.appendChild(this.viewContentEl);
        }
    }

    getViewType() {
        return SR_TAB_VIEW;
    }

    getIcon() {
        return "SpacedRepIcon";
    }

    getDisplayText() {
        return "Syro";
    }

    async onOpen() {
        await this.loadSession();
    }

    public async reloadSession(nextSession?: ReviewSessionLoadResult): Promise<void> {
        await this.loadSession(nextSession);
    }

    private async loadSession(nextSession?: ReviewSessionLoadResult): Promise<void> {
        try {
            const loadedData = nextSession ?? (await this.loadReviewSequencerData());
            this.reviewSequencer = loadedData.reviewSequencer;
            const initialView = loadedData.initialView ?? "deck-list";
            const initialTargetDeckPath = loadedData.initialTargetDeckPath;
            if (this.plugin.data.settings.showRuntimeDebugMessages) {
                console.debug("[SR-TabView] loadSession", {
                    mode: FlashcardReviewMode[loadedData.mode],
                    initialView,
                    initialTargetDeckPath,
                    providedSession: Boolean(nextSession),
                });
            }

            if (!this.reactApp) {
                this.reactApp = new ReactReviewApp(
                    this.app,
                    this.plugin,
                    this.reviewSequencer,
                    loadedData.mode,
                    this.leaf,
                    this.viewContentEl,
                    this,
                    undefined,
                    initialView,
                    initialTargetDeckPath,
                );
                this.reactApp.mount();
                return;
            }

            // Remount so the next session does not inherit stale deck-list or card state.
            this.reactApp.remountSession(
                this.reviewSequencer,
                loadedData.mode,
                initialView,
                initialTargetDeckPath,
            );
        } catch (e) {
            if (this.openErrorCount > 0) {
                console.error(e);
            }
            this.openErrorCount++;
        }
    }

    onClose(): Promise<void> {
        if (this.reactApp) {
            this.reactApp.unmount();
            this.reactApp = null;
        }

        return this.plugin.savePluginData();
    }
}
