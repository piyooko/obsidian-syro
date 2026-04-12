import { PaneType, ViewCreator, WorkspaceLeaf } from "obsidian";

import { Deck } from "src/Deck";
import { FlashcardReviewMode } from "src/FlashcardReviewSequencer";
import { SR_TAB_VIEW } from "src/constants";
import type SRPlugin from "src/main";
import { activateDeckReviewSession } from "src/ui/reviewDeckSession";
import { TabView, type ReviewSessionLoadResult } from "./TabView";

export type TabViewType = { type: string; viewCreator: ViewCreator };
export interface SRTabViewTarget {
    targetDeckPath?: string;
}

export default class TabViewManager {
    private plugin: SRPlugin;
    private chosenReviewModeForTabbedView = FlashcardReviewMode.Review;
    private pendingReviewTarget: SRTabViewTarget = {};
    private preparedPendingSession: ReviewSessionLoadResult | null = null;

    private tabViewTypes: TabViewType[] = [
        {
            type: SR_TAB_VIEW,
            viewCreator: (leaf) => new TabView(leaf, this.plugin, () => this.loadPendingSession()),
        },
    ];

    constructor(plugin: SRPlugin) {
        this.plugin = plugin;
        this.registerAllTabViews();
    }

    private logRuntimeDebug(...args: unknown[]): void {
        if (this.plugin.data.settings.showRuntimeDebugMessages) {
            console.debug(...args);
        }
    }

    public async openSRTabView(
        reviewMode: FlashcardReviewMode,
        target: SRTabViewTarget = {},
    ): Promise<void> {
        this.chosenReviewModeForTabbedView = reviewMode;
        this.pendingReviewTarget = target;
        this.preparedPendingSession = null;
        this.logRuntimeDebug("[SR-TabViewManager] openSRTabView", {
            mode: FlashcardReviewMode[reviewMode],
            targetDeckPath: target.targetDeckPath ?? null,
        });

        await this.openTabView(SR_TAB_VIEW, true);
    }

    public closeAllTabViews() {
        this.forEachTabViewType((viewType) => {
            this.plugin.app.workspace.detachLeavesOfType(viewType.type);
        });
    }

    public forEachTabViewType(callback: (type: TabViewType) => void) {
        this.tabViewTypes.forEach((type) => callback(type));
    }

    public registerAllTabViews() {
        this.forEachTabViewType((viewType) =>
            this.plugin.registerView(viewType.type, viewType.viewCreator),
        );
    }

    public async openTabView(type: string, newLeaf?: PaneType | boolean) {
        const { workspace } = this.plugin.app;
        let pendingSession: ReviewSessionLoadResult | null = null;
        if (type === SR_TAB_VIEW) {
            pendingSession = this.preparePendingSession();
        }
        const existingLeaf = workspace.getLeavesOfType(type)[0] ?? null;

        if (existingLeaf) {
            await this.reloadExistingLeaf(existingLeaf, pendingSession);
            workspace.revealLeaf(existingLeaf);
            return existingLeaf;
        }

        if (pendingSession) {
            this.preparedPendingSession = pendingSession;
        }
        const leaf = workspace.getLeaf(newLeaf);
        if (leaf !== null) {
            await leaf.setViewState({ type, active: true });
            workspace.revealLeaf(leaf);
        }

        return leaf;
    }

    private loadPendingSession(): Promise<ReviewSessionLoadResult> {
        if (this.preparedPendingSession) {
            const preparedSession = this.preparedPendingSession;
            this.preparedPendingSession = null;
            this.logRuntimeDebug("[SR-TabViewManager] loadPendingSession: consume prepared", {
                mode: FlashcardReviewMode[preparedSession.mode],
                initialView: preparedSession.initialView ?? "deck-list",
                initialTargetDeckPath: preparedSession.initialTargetDeckPath ?? null,
            });
            return Promise.resolve(preparedSession);
        }

        this.logRuntimeDebug(
            "[SR-TabViewManager] loadPendingSession: rebuild from current context",
            {
                mode: FlashcardReviewMode[this.chosenReviewModeForTabbedView],
                targetDeckPath: this.pendingReviewTarget.targetDeckPath ?? null,
            },
        );
        return Promise.resolve(this.preparePendingSession());
    }

    private preparePendingSession(): ReviewSessionLoadResult {
        const fullDeckTree: Deck = this.plugin.deckTree;
        const sourceDeckTree: Deck =
            this.chosenReviewModeForTabbedView === FlashcardReviewMode.Cram
                ? this.plugin.deckTree
                : this.plugin.remainingDeckTree;
        const globalRemainingDeckTree =
            this.chosenReviewModeForTabbedView === FlashcardReviewMode.Cram
                ? undefined
                : this.plugin.remainingDeckTree;
        const preparedSession = this.plugin.getPreparedReviewSequencer(
            fullDeckTree,
            sourceDeckTree,
            this.chosenReviewModeForTabbedView,
        );
        const initialTargetDeckPath = this.pendingReviewTarget.targetDeckPath?.trim() || undefined;

        let pendingSession: ReviewSessionLoadResult = {
            ...preparedSession,
            initialView: "deck-list" as const,
            initialTargetDeckPath,
        };

        if (initialTargetDeckPath) {
            const activatedSession = activateDeckReviewSession({
                plugin: this.plugin,
                sequencer: preparedSession.reviewSequencer,
                fullPath: initialTargetDeckPath,
                sourceDeckTree,
                fullDeckTree,
                globalRemainingDeckTree,
                applyDailyLimits: this.chosenReviewModeForTabbedView !== FlashcardReviewMode.Cram,
            });

            if (activatedSession) {
                pendingSession = {
                    ...preparedSession,
                    initialView: "review",
                };
            }
        }

        this.logRuntimeDebug("[SR-TabViewManager] preparePendingSession", {
            mode: FlashcardReviewMode[pendingSession.mode],
            initialView: pendingSession.initialView,
            initialTargetDeckPath: pendingSession.initialTargetDeckPath ?? null,
        });
        return pendingSession;
    }

    private async reloadExistingLeaf(
        leaf: WorkspaceLeaf,
        pendingSession?: ReviewSessionLoadResult | null,
    ): Promise<void> {
        const reloadableView = leaf.view as
            | { reloadSession?: (nextSession?: ReviewSessionLoadResult) => Promise<void> }
            | null
            | undefined;
        if (reloadableView && typeof reloadableView.reloadSession === "function") {
            await reloadableView.reloadSession(pendingSession ?? undefined);
            return;
        }

        await leaf.setViewState({ type: SR_TAB_VIEW, active: true });
    }
}
