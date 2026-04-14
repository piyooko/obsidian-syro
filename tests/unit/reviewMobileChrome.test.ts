jest.mock("obsidian");

import { Platform, WorkspaceLeaf } from "obsidian";
import {
    applyReviewMobileHeaderCover,
    clearReviewMobileHeaderCover,
    getReviewMobileHeaderCoverTargets,
    REVIEW_MOBILE_HEADER_COVER_CLASS,
    REVIEW_MOBILE_HEADER_COVER_OWNER_ATTR,
} from "src/ui/containers/reviewMobileChrome";

function createLeafWithHeader() {
    const leaf = new WorkspaceLeaf() as WorkspaceLeaf & { containerEl: HTMLElement };
    const containerEl = document.createElement("div");
    containerEl.innerHTML = `
        <div class="view-header">
            <div class="view-header-left">left</div>
            <div class="view-header-title-container">title</div>
            <div class="view-actions">actions</div>
        </div>
    `;
    leaf.containerEl = containerEl;
    document.body.appendChild(containerEl);
    return { leaf, containerEl };
}

describe("reviewMobileChrome", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        Platform.isMobile = true;
    });

    afterEach(() => {
        Platform.isMobile = false;
    });

    test("getReviewMobileHeaderCoverTargets limits matches to the current leaf header groups", () => {
        const outsideHeader = document.createElement("div");
        outsideHeader.innerHTML = `
            <div class="view-header">
                <div class="view-header-left">outside-left</div>
                <div class="view-actions">outside-actions</div>
            </div>
        `;
        document.body.appendChild(outsideHeader);

        const { leaf } = createLeafWithHeader();
        const targets = getReviewMobileHeaderCoverTargets(leaf);

        expect(targets).toHaveLength(2);
        expect(targets.every((target) => target.closest(".view-header") !== null)).toBe(true);
        expect(targets.map((target) => target.className)).toEqual(["view-header-left", "view-actions"]);
        expect(targets.some((target) => target.textContent === "outside-left")).toBe(false);
        expect(targets.some((target) => target.textContent === "outside-actions")).toBe(false);
    });

    test("applyReviewMobileHeaderCover and clearReviewMobileHeaderCover toggle the header groups", () => {
        const hostLeafId = "leaf-1";
        const { leaf } = createLeafWithHeader();
        const targets = getReviewMobileHeaderCoverTargets(leaf);

        applyReviewMobileHeaderCover(hostLeafId, leaf);

        for (const target of targets) {
            expect(target.classList.contains(REVIEW_MOBILE_HEADER_COVER_CLASS)).toBe(true);
            expect(target.getAttribute(REVIEW_MOBILE_HEADER_COVER_OWNER_ATTR)).toBe(hostLeafId);
        }

        clearReviewMobileHeaderCover(hostLeafId, leaf);

        for (const target of targets) {
            expect(target.classList.contains(REVIEW_MOBILE_HEADER_COVER_CLASS)).toBe(false);
            expect(target.hasAttribute(REVIEW_MOBILE_HEADER_COVER_OWNER_ATTR)).toBe(false);
        }
    });
});
