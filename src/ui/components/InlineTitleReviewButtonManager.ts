import { MarkdownView, Menu, TFile, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import { t } from "src/lang/helpers";
import type SRPlugin from "src/main";
import { FlashcardReviewMode } from "src/scheduling";

type MountedInlineTitleButton = {
    inlineTitleEl: HTMLElement;
    wrapperEl: HTMLDivElement;
    groupEl: HTMLDivElement;
    mainButtonEl: HTMLButtonElement;
    menuButtonEl: HTMLButtonElement;
    countEl: HTMLSpanElement;
    file: TFile;
    requestToken: number;
};

const ROW_CLASS = "syro-inline-title-row";
const GROUP_CLASS = "syro-inline-title-progress";
const COUNT_CLASS = "syro-inline-title-progress-count";
const MAIN_BUTTON_CLASS = "syro-inline-title-progress-main";
const MENU_BUTTON_CLASS = "syro-inline-title-progress-menu";

export class InlineTitleReviewButtonManager {
    private readonly plugin: SRPlugin;
    private readonly mounts = new Map<HTMLElement, MountedInlineTitleButton>();
    private refreshQueued = false;
    private refreshRunning = false;
    private refreshPending = false;
    private refreshTimerId: number | null = null;
    private destroyed = false;
    private unsubscribeDeckStats: (() => void) | null = null;
    private unsubscribeSyncComplete: (() => void) | null = null;
    private unsubscribeExtractsUpdated: (() => void) | null = null;

    constructor(plugin: SRPlugin) {
        this.plugin = plugin;
    }

    public register(): void {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("active-leaf-change", () => this.refresh()),
        );
        this.plugin.registerEvent(this.plugin.app.workspace.on("file-open", () => this.refresh()));
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("layout-change", () => this.refresh()),
        );
        this.plugin.registerEvent(this.plugin.app.vault.on("rename", () => this.refresh()));
        this.plugin.registerEvent(this.plugin.app.vault.on("delete", () => this.refresh()));
        this.plugin.registerEvent(
            this.plugin.app.vault.on("modify", (file) => {
                if (file instanceof TFile && file.extension === "md") {
                    this.refresh();
                }
            }),
        );

        this.unsubscribeDeckStats = this.plugin.syncEvents.on("deck-stats-updated", () =>
            this.refresh(),
        );
        this.unsubscribeSyncComplete = this.plugin.syncEvents.on("sync-complete", () =>
            this.refresh(),
        );
        this.unsubscribeExtractsUpdated = this.plugin.syncEvents.on("extracts-updated", () =>
            this.refresh(),
        );
        this.plugin.register(() => {
            this.unsubscribeDeckStats?.();
            this.unsubscribeDeckStats = null;
            this.unsubscribeSyncComplete?.();
            this.unsubscribeSyncComplete = null;
            this.unsubscribeExtractsUpdated?.();
            this.unsubscribeExtractsUpdated = null;
            this.destroy();
        });

        this.refresh();
    }

    public refresh(): void {
        if (this.destroyed || this.refreshQueued) {
            return;
        }

        this.refreshQueued = true;
        this.refreshTimerId = window.setTimeout(() => {
            this.refreshTimerId = null;
            this.refreshQueued = false;
            this.runRefresh();
        }, 0);
    }

    public destroy(): void {
        if (this.destroyed) {
            return;
        }

        this.destroyed = true;
        if (this.refreshTimerId !== null) {
            window.clearTimeout(this.refreshTimerId);
            this.refreshTimerId = null;
        }
        for (const containerEl of Array.from(this.mounts.keys())) {
            this.teardownMount(containerEl);
        }
    }

    private runRefresh(): void {
        if (this.destroyed) {
            return;
        }

        if (this.refreshRunning) {
            this.refreshPending = true;
            return;
        }

        this.refreshRunning = true;

        try {
            do {
                this.refreshPending = false;
                this.refreshVisibleLeaves();
            } while (this.refreshPending && !this.destroyed);
        } finally {
            this.refreshRunning = false;
        }
    }

    private refreshVisibleLeaves(): void {
        const nextContainers = new Set<HTMLElement>();
        const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");

        for (const leaf of leaves) {
            if (!(leaf instanceof WorkspaceLeaf) || !(leaf.view instanceof MarkdownView)) {
                continue;
            }

            const containerEl = this.getLeafContainerEl(leaf);
            if (!(containerEl instanceof HTMLElement)) {
                continue;
            }

            nextContainers.add(containerEl);

            const file = leaf.view.file;
            const inlineTitleEl = this.findInlineTitleEl(containerEl);
            const isEligible =
                file instanceof TFile &&
                file.extension === "md" &&
                this.isLeafVisible(leaf) &&
                inlineTitleEl instanceof HTMLElement;

            if (!isEligible || !inlineTitleEl) {
                this.teardownMount(containerEl);
                continue;
            }

            const mount = this.ensureMount(containerEl, inlineTitleEl, file);
            this.updateMountStats(mount);
        }

        for (const containerEl of Array.from(this.mounts.keys())) {
            if (!nextContainers.has(containerEl) || !containerEl.isConnected) {
                this.teardownMount(containerEl);
            }
        }
    }

    private getLeafContainerEl(leaf: WorkspaceLeaf): HTMLElement | null {
        const viewWithContainer = leaf.view as MarkdownView & {
            containerEl?: HTMLElement;
        };
        return viewWithContainer.containerEl ?? null;
    }

    private isLeafVisible(leaf: WorkspaceLeaf): boolean {
        const containerEl = this.getLeafContainerEl(leaf);
        if (!(containerEl instanceof HTMLElement)) {
            return false;
        }

        return (
            containerEl.offsetWidth > 0 ||
            containerEl.offsetHeight > 0 ||
            containerEl.getClientRects().length > 0
        );
    }

    private findInlineTitleEl(containerEl: HTMLElement): HTMLElement | null {
        const sourceRootEl = this.getSourceRootEl(containerEl);
        if (!(sourceRootEl instanceof HTMLElement)) {
            return null;
        }

        const inlineTitleEl = sourceRootEl.querySelector(".inline-title");
        return inlineTitleEl instanceof HTMLElement ? inlineTitleEl : null;
    }

    private getSourceRootEl(containerEl: HTMLElement): HTMLElement | null {
        if (containerEl.matches(".markdown-source-view")) {
            return this.isSourceRootVisible(containerEl) ? containerEl : null;
        }

        if (containerEl.getAttribute("data-mode") === "source") {
            return containerEl;
        }

        const sourceRootEl = containerEl.querySelector(".markdown-source-view");
        if (!(sourceRootEl instanceof HTMLElement)) {
            return null;
        }

        return this.isSourceRootVisible(sourceRootEl) ? sourceRootEl : null;
    }

    private isSourceRootVisible(sourceRootEl: HTMLElement): boolean {
        return window.getComputedStyle(sourceRootEl).display !== "none";
    }

    private ensureMount(
        containerEl: HTMLElement,
        inlineTitleEl: HTMLElement,
        file: TFile,
    ): MountedInlineTitleButton {
        const existing = this.mounts.get(containerEl);
        if (existing && existing.inlineTitleEl !== inlineTitleEl) {
            this.teardownMount(containerEl);
        }

        const current = this.mounts.get(containerEl);
        if (current) {
            current.file = file;
            return current;
        }

        const parentEl = inlineTitleEl.parentElement;
        if (!(parentEl instanceof HTMLElement)) {
            throw new Error("Inline title parent is missing.");
        }

        const wrapperEl = document.createElement("div");
        wrapperEl.className = ROW_CLASS;
        parentEl.insertBefore(wrapperEl, inlineTitleEl);
        wrapperEl.appendChild(inlineTitleEl);

        const groupEl = document.createElement("div");
        groupEl.className = GROUP_CLASS;

        const mainButtonEl = document.createElement("button");
        mainButtonEl.type = "button";
        mainButtonEl.className = MAIN_BUTTON_CLASS;

        const mainIconEl = document.createElement("span");
        mainIconEl.className = "syro-inline-title-progress-icon";
        setIcon(mainIconEl, "SpacedRepIcon");

        const countEl = document.createElement("span");
        countEl.className = COUNT_CLASS;
        countEl.textContent = "0/0";

        mainButtonEl.append(mainIconEl, countEl);

        const menuButtonEl = document.createElement("button");
        menuButtonEl.type = "button";
        menuButtonEl.className = MENU_BUTTON_CLASS;

        const menuIconEl = document.createElement("span");
        menuIconEl.className = "syro-inline-title-progress-icon";
        setIcon(menuIconEl, "chevron-down");
        menuButtonEl.appendChild(menuIconEl);

        groupEl.append(mainButtonEl, menuButtonEl);
        wrapperEl.appendChild(groupEl);

        const mount: MountedInlineTitleButton = {
            inlineTitleEl,
            wrapperEl,
            groupEl,
            mainButtonEl,
            menuButtonEl,
            countEl,
            file,
            requestToken: 0,
        };

        mainButtonEl.addEventListener("click", () => {
            if (mainButtonEl.disabled) {
                return;
            }

            void this.plugin
                .openFlashcardsInNoteReview(FlashcardReviewMode.Review, mount.file)
                .catch((error: unknown) => {
                    console.error("[SR] open inline-title flashcard review failed", error);
                });
        });

        menuButtonEl.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openMenu(mount, event);
        });

        groupEl.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            this.openMenu(mount, event);
        });

        this.mounts.set(containerEl, mount);
        return mount;
    }

    private updateMountStats(mount: MountedInlineTitleButton): void {
        const token = mount.requestToken + 1;
        mount.requestToken = token;

        const { reviewableCount, totalCount } = this.plugin.getReadonlyNoteCardStats(mount.file);
        if (this.destroyed || token !== mount.requestToken) {
            return;
        }

        mount.countEl.textContent = `${reviewableCount}/${totalCount}`;
        mount.mainButtonEl.disabled = totalCount === 0;

        const mainLabel =
            totalCount === 0
                ? t("INLINE_TITLE_CARD_NO_CARDS")
                : t("INLINE_TITLE_CARD_PROGRESS_TOOLTIP", {
                      reviewableCount: reviewableCount.toString(),
                      totalCount: totalCount.toString(),
                  });
        const menuLabel = t("INLINE_TITLE_CARD_MENU_TOOLTIP");

        mount.mainButtonEl.setAttribute("aria-label", mainLabel);
        mount.menuButtonEl.setAttribute("aria-label", menuLabel);
        setTooltip(mount.mainButtonEl, mainLabel, { placement: "top" });
        setTooltip(mount.menuButtonEl, menuLabel, { placement: "top" });
    }

    private openMenu(mount: MountedInlineTitleButton, event: MouseEvent): void {
        const menu = this.plugin.buildInlineTitleCardMenu(mount.file);
        const menuWithMouseEvent = menu as Menu & {
            showAtMouseEvent?: (mouseEvent: MouseEvent) => void;
        };

        if (typeof menuWithMouseEvent.showAtMouseEvent === "function") {
            menuWithMouseEvent.showAtMouseEvent(event);
            return;
        }

        const rect = mount.menuButtonEl.getBoundingClientRect();
        menu.showAtPosition({
            x: rect.left,
            y: rect.bottom,
        });
    }

    private teardownMount(containerEl: HTMLElement): void {
        const mount = this.mounts.get(containerEl);
        if (!mount) {
            return;
        }

        this.mounts.delete(containerEl);
        mount.requestToken += 1;

        const { wrapperEl, inlineTitleEl } = mount;
        if (wrapperEl.parentElement && inlineTitleEl.isConnected) {
            wrapperEl.parentElement.insertBefore(inlineTitleEl, wrapperEl);
        }

        wrapperEl.remove();
    }
}
