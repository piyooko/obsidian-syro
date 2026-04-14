import { Platform, type WorkspaceLeaf } from "obsidian";

export const REVIEW_MOBILE_NAVBAR_COVER_CLASS = "syro-review-mobile-navbar-covered";
export const REVIEW_MOBILE_NAVBAR_OWNER_ATTR = "data-syro-review-mobile-navbar-owner";
export const REVIEW_MOBILE_HEADER_COVER_CLASS = "syro-review-mobile-header-covered";
export const REVIEW_MOBILE_HEADER_COVER_OWNER_ATTR =
    "data-syro-review-mobile-header-cover-owner";

type LeafWithContainerEl = WorkspaceLeaf & {
    containerEl?: HTMLElement | null;
};

export function detectBlockingMobileNavbar(): boolean {
    if (!Platform.isMobile || typeof document === "undefined") {
        return false;
    }

    if (document.body.classList.contains("is-floating-nav")) {
        return true;
    }

    return Boolean(document.querySelector(".mobile-navbar.mod-raised, .mobile-navbar-actions"));
}

export function getMobileNavbars(): HTMLElement[] {
    if (typeof document === "undefined") {
        return [];
    }

    return Array.from(document.querySelectorAll<HTMLElement>(".mobile-navbar"));
}

function getLeafContainer(leaf: WorkspaceLeaf | null | undefined): HTMLElement | null {
    const containerEl = (leaf as LeafWithContainerEl | null | undefined)?.containerEl;
    return containerEl instanceof HTMLElement ? containerEl : null;
}

export function getReviewMobileHeaderCoverTargets(
    leaf: WorkspaceLeaf | null | undefined,
): HTMLElement[] {
    const leafContainer = getLeafContainer(leaf);
    const viewHeader = leafContainer?.querySelector<HTMLElement>(".view-header");
    if (!viewHeader) {
        return [];
    }

    return Array.from(viewHeader.children).filter(
        (child): child is HTMLElement =>
            child instanceof HTMLElement &&
            (child.classList.contains("view-header-left") ||
                child.classList.contains("view-header-title-container") ||
                child.classList.contains("view-actions")),
    );
}

export function applyReviewMobileNavbarCover(hostLeafId: string): void {
    if (typeof document === "undefined") {
        return;
    }

    document.body.classList.add(REVIEW_MOBILE_NAVBAR_COVER_CLASS);
    document.body.setAttribute(REVIEW_MOBILE_NAVBAR_OWNER_ATTR, hostLeafId);

    for (const navbar of getMobileNavbars()) {
        navbar.classList.add(REVIEW_MOBILE_NAVBAR_COVER_CLASS);
    }
}

export function clearReviewMobileNavbarCover(hostLeafId: string): void {
    if (typeof document === "undefined") {
        return;
    }

    const currentOwner = document.body.getAttribute(REVIEW_MOBILE_NAVBAR_OWNER_ATTR);
    if (currentOwner && currentOwner !== hostLeafId) {
        return;
    }

    document.body.classList.remove(REVIEW_MOBILE_NAVBAR_COVER_CLASS);
    document.body.removeAttribute(REVIEW_MOBILE_NAVBAR_OWNER_ATTR);

    for (const navbar of getMobileNavbars()) {
        navbar.classList.remove(REVIEW_MOBILE_NAVBAR_COVER_CLASS);
    }
}

export function applyReviewMobileHeaderCover(
    hostLeafId: string,
    hostLeaf: WorkspaceLeaf,
): void {
    for (const target of getReviewMobileHeaderCoverTargets(hostLeaf)) {
        target.classList.add(REVIEW_MOBILE_HEADER_COVER_CLASS);
        target.setAttribute(REVIEW_MOBILE_HEADER_COVER_OWNER_ATTR, hostLeafId);
    }
}

export function clearReviewMobileHeaderCover(
    hostLeafId: string,
    hostLeaf: WorkspaceLeaf,
): void {
    for (const target of getReviewMobileHeaderCoverTargets(hostLeaf)) {
        const currentOwner = target.getAttribute(REVIEW_MOBILE_HEADER_COVER_OWNER_ATTR);
        if (currentOwner && currentOwner !== hostLeafId) {
            continue;
        }

        target.classList.remove(REVIEW_MOBILE_HEADER_COVER_CLASS);
        target.removeAttribute(REVIEW_MOBILE_HEADER_COVER_OWNER_ATTR);
    }
}
