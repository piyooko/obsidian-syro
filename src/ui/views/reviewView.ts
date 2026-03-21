import { Notice } from "obsidian";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";
import { IReviewNote } from "src/reviewNote/review-note";
import { SRSettings } from "src/settings";

export class ReviewView {
    private static _instance: ReviewView;

    private plugin: SRPlugin;

    static create(plugin: SRPlugin, settings: SRSettings) {
        return new ReviewView(plugin, settings);
    }

    static getInstance() {
        if (!ReviewView._instance) {
            throw Error("there is not ReviewView instance.");
        }
        return ReviewView._instance;
    }

    constructor(plugin: SRPlugin, settings: SRSettings) {
        this.plugin = plugin;
        ReviewView._instance = this;
    }

    recallReviewNote(_settings: SRSettings) {
        void this.plugin.refreshNoteReview({ trigger: "manual" }).then(() => {
            void this.plugin.reviewNextNoteModal();
        });
    }

    static nextReviewNotice(minNextView: number, laterSize: number) {
        if (minNextView > 0 && laterSize > 0) {
            const now = Date.now();
            const interval = Math.round((minNextView - now) / 1000 / 60);

            if (interval < 60) {
                new Notice(t("NEXT_REVIEW_MINUTES", { interval: interval }));
            } else if (interval < 60 * 5) {
                new Notice(t("NEXT_REVIEW_HOURS", { interval: Math.round(interval / 60) }));
            }
        }
    }
}
