import SRPlugin from "src/main";
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

    constructor(plugin: SRPlugin, _settings: SRSettings) {
        this.plugin = plugin;
        ReviewView._instance = this;
    }

    recallReviewNote(_settings: SRSettings) {
        void this.plugin.refreshNoteReview({ trigger: "manual" }).then(() => {
            void this.plugin.reviewNextNoteModal();
        });
    }

    static nextReviewNotice(minNextView: number, laterSize: number) {
        void minNextView;
        void laterSize;
    }
}
