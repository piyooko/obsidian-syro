import { Setting, Notice } from "obsidian";
import { DateUtils, MiscUtils } from "src/util/utils_recall";
import { SrsAlgorithm } from "./algorithms";
import { DataStore } from "../dataStore/data";

import * as tsfsrs from "ts-fsrs";
import { t } from "src/lang/helpers";
import deepcopy from "deepcopy";
import { ReviewLog } from "ts-fsrs";
import { FsrsReviewEvent, RepetitionItem, ReviewResult } from "src/dataStore/repetitionItem";
import { Iadapter } from "src/dataStore/adapter";
import { createDefaultFsrsSettings, FsrsSettings, normalizeFsrsSettings } from "src/settings";

// https://github.com/mgmeyers/obsidian-kanban/blob/main/src/Settings.ts
let applyDebounceTimer = 0;
function applySettingsUpdate(callback: () => void): void {
    clearTimeout(applyDebounceTimer);
    applyDebounceTimer = window.setTimeout(callback, 512);
}

export type FsrsData = tsfsrs.Card;

export class RevLog {
    card_id = "";
    item_type = "";

    review_time = 0;
    review_rating = 0;
    review_state = 0;
    review_duration = 0;

    stability = 0;
    difficulty = 0;

    elapsed_days = 0;
    scheduled_days = 0;

    tag = "";

    constructor(
        item: RepetitionItem = null,
        reviewLog: ReviewLog = null,
        duration: number = 0,
        stability: number = 0,
        difficulty: number = 0,
    ) {
        if (item) {
            this.card_id = item.uuid;
            this.item_type = item.itemType;

            this.tag = item.deckName.includes(",") ? `"${item.deckName}"` : item.deckName;
        }

        if (reviewLog) {
            this.review_time = reviewLog.review.getTime();
            this.review_rating = reviewLog.rating;
            this.review_state = reviewLog.state;

            this.stability =
                stability !== 0
                    ? Number(stability.toFixed(4))
                    : Number(reviewLog.stability.toFixed(4));
            this.difficulty =
                difficulty !== 0
                    ? Number(difficulty.toFixed(4))
                    : Number(reviewLog.difficulty.toFixed(4));

            const reviewLogData = reviewLog as unknown as Record<string, number>;
            const elapsedDays = Number(reviewLogData["elapsed_days"].toFixed(4));
            this.elapsed_days = elapsedDays;
            this.scheduled_days = Number(reviewLog.scheduled_days.toFixed(4));
        }
        this.review_duration = duration;
        return;
    }

    static getKeyNames() {
        return Object.keys(new RevLog());
    }
}

const FsrsOptions: string[] = ["Again", "Hard", "Good", "Easy"]; // Manual =0

/**
 * This is an implementation of the Free Spaced Repetition Scheduling Algorithm as described in
 * https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler
 * https://github.com/open-spaced-repetition/fsrs.js
 */
export class FsrsAlgorithm extends SrsAlgorithm<FsrsSettings> {
    settings: FsrsSettings;

    fsrs = new tsfsrs.FSRS(tsfsrs.generatorParameters(this.settings));
    card = tsfsrs.createEmptyCard();

    filename = "ob_revlog.csv";
    logfilepath: string = null;
    REVLOG_sep = ",";
    REVLOG_TITLE = RevLog.getKeyNames().join(this.REVLOG_sep) + "\n";
    review_duration = 0;

    private isWritingHeader = false;

    constructor() {
        super();
        //Set algorithm parameters
        this.updateFsrsParams();
    }

    defaultSettings(): FsrsSettings {
        return createDefaultFsrsSettings();
    }
    updateSettings(settings: unknown) {
        this.settings = normalizeFsrsSettings(settings, this.defaultSettings());
        this.updateFsrsParams();
        this.getLogfilepath();
    }

    updateFsrsParams() {
        this.fsrs = new tsfsrs.FSRS(tsfsrs.generatorParameters(this.settings));
    }

    getLogfilepath() {
        const store = DataStore.getInstance() as DataStore & {
            getAuxiliaryPath?: (fileName: string) => string;
            dataPath?: string;
        };

        if (typeof store.getAuxiliaryPath === "function") {
            this.logfilepath = store.getAuxiliaryPath(this.filename);
            return;
        }

        const dataPath = store?.dataPath ?? this.filename;
        const sepIdx = Math.max(dataPath.lastIndexOf("/"), dataPath.lastIndexOf("\\"));
        const parentDir = sepIdx >= 0 ? dataPath.substring(0, sepIdx + 1) : "";
        this.logfilepath = `${parentDir}${this.filename}`;
    }

    defaultData(): FsrsData {
        return tsfsrs.createEmptyCard();
    }

    private mapStateToAnkiReviewType(state: tsfsrs.State): number {
        switch (state) {
            case tsfsrs.State.Review:
                return 1;
            case tsfsrs.State.Relearning:
                return 2;
            default:
                return 0;
        }
    }

    private toAnkiReviewInterval(card: FsrsData): number {
        if (card.state === tsfsrs.State.Review && card.scheduled_days > 0) {
            return Math.max(1, Math.round(card.scheduled_days));
        }

        if (card.due instanceof Date && card.last_review instanceof Date) {
            const seconds = Math.max(
                1,
                Math.round((card.due.valueOf() - card.last_review.valueOf()) / 1000),
            );
            return -seconds;
        }

        return 0;
    }

    private toAnkiReviewFactor(card: FsrsData): number {
        if (card.state !== tsfsrs.State.Review || card.difficulty <= 0) {
            return 0;
        }

        return Math.round((card.difficulty + 0.1) * 1000);
    }

    private buildReviewEvent(
        previousData: FsrsData,
        nextData: FsrsData,
        reviewLog: ReviewLog,
        reviewDuration: number,
    ): FsrsReviewEvent {
        return {
            reviewId: reviewLog.review.getTime(),
            rating: reviewLog.rating,
            reviewType: this.mapStateToAnkiReviewType(reviewLog.state),
            reviewState: reviewLog.state,
            newInterval: this.toAnkiReviewInterval(nextData),
            previousInterval: this.toAnkiReviewInterval(previousData),
            newFactor: this.toAnkiReviewFactor(nextData),
            reviewDuration: Math.max(0, Math.round(reviewDuration)),
        };
    }

    srsOptions(): string[] {
        return FsrsOptions;
    }

    calcAllOptsIntervals(item: RepetitionItem) {
        let card: FsrsData;
        if (!item || !item.data || (item.data as FsrsData).state === undefined) {
            console.debug("[FSRS] Creating empty card for invalid item");
            card = tsfsrs.createEmptyCard();
        } else {
            const data = item.data as FsrsData;
            card = deepcopy(data);
        }

        const now = new Date();
        const scheduling_cards = this.fsrs.repeat(card, now);
        const intvls: number[] = [];
        tsfsrs.Grades.forEach((grade, _ind) => {
            const due = scheduling_cards[grade].card.due.valueOf();
            const lastrv = scheduling_cards[grade].card.last_review.valueOf();
            const nextInterval = due - lastrv;
            intvls.push(nextInterval / DateUtils.DAYS_TO_MILLIS);
            // console.debug("due:" + due + ", last: " + lastrv + ", intvl: " + nextInterval);
        });
        this.review_duration = new Date().getTime();
        return intvls;
    }
    onSelection(
        item: RepetitionItem,
        optionStr: string,
        repeat: boolean,
        log: boolean = true,
    ): ReviewResult {
        let data: FsrsData;
        if (!item || !item.data || (item.data as FsrsData).state === undefined) {
            console.debug("[FSRS onSelection] Creating empty card for invalid item");
            data = tsfsrs.createEmptyCard();
            if (item) {
                item.data = data;
            }
        } else {
            data = item.data as FsrsData;
        }

        const response = (FsrsOptions.indexOf(optionStr) + 1) as tsfsrs.Grade;

        let correct = true;
        if (Number(response) === 1) {
            // Again
            correct = false;
        }
        if (repeat) {
            return {
                correct,
                nextReview: -1,
                reviewEvent: null,
            };
        }

        const now = new Date();
        const previousData = deepcopy(data);
        const scheduling_cards = this.fsrs.repeat(data, now);
        // console.debug(scheduling_cards);

        //Update the card after rating:
        data = item.data = deepcopy(scheduling_cards[response].card);
        data.stability = MiscUtils.fixed(data.stability, 5);
        data.difficulty = MiscUtils.fixed(data.difficulty, 5);
        const cardData = data as unknown as Record<string, number>;
        const elapsedDays = MiscUtils.fixed(cardData["elapsed_days"], 3);
        cardData["elapsed_days"] = elapsedDays;

        // Get the review log after rating :
        const review_log = scheduling_cards[response].log;
        const reviewDuration =
            this.review_duration > 0 ? Math.max(0, now.getTime() - this.review_duration) : 0;

        if (log) {
            void this.appendRevlog(item, review_log, data.stability, data.difficulty);
        }

        const nextInterval = data.due.valueOf() - data.last_review.valueOf();

        return {
            correct,
            nextReview: nextInterval,
            reviewEvent: this.buildReviewEvent(previousData, data, review_log, reviewDuration),
        };
    }

    async appendRevlog(
        item: RepetitionItem,
        reviewLog: ReviewLog,
        stability: number = 0,
        difficulty: number = 0,
    ) {
        if (this.settings.revlog_tags.length > 0) {
            if (item.deckName.includes("/")) {
                if (
                    !this.settings.revlog_tags.some(
                        (tag: string) =>
                            item.deckName === tag || item.deckName.startsWith(tag + "/"),
                    )
                ) {
                    return;
                }
            } else if (!this.settings.revlog_tags.includes(item.deckName)) {
                return;
            }
        }

        const adapter = Iadapter.instance.adapter;
        const duration = this.review_duration > 0 ? new Date().getTime() - this.review_duration : 0;
        this.review_duration = 0;
        const rlog = new RevLog(item, reviewLog, duration, stability, difficulty);

        let data = Object.values(rlog).join(this.REVLOG_sep);
        data += "\n";

        if (!(await adapter.exists(this.logfilepath))) {
            if (!this.isWritingHeader) {
                this.isWritingHeader = true;
                data = this.REVLOG_TITLE + data;
                await adapter.append(this.logfilepath, data);
                this.isWritingHeader = false;
                return data;
            }
        }

        await adapter.append(this.logfilepath, data);
        return data;
    }

    async reWriteRevlog(data: string, withTitle = false) {
        const adapter = Iadapter.instance.adapter;

        if (withTitle) {
            data = this.REVLOG_TITLE + data;
        }
        await adapter.write(this.logfilepath, data);
    }

    async readRevlog() {
        const adapter = Iadapter.instance.adapter;
        let data = "";
        if (await adapter.exists(this.logfilepath)) {
            data = await adapter.read(this.logfilepath);
        }
        return data;
    }

    displaySettings(
        containerEl: HTMLElement,
        update: (settings: FsrsSettings, refresh?: boolean) => void,
    ) {
        containerEl.empty();

        containerEl.createDiv({ text: t("FSRS_ALGORITHM_DESC") });

        new Setting(containerEl)
            .setName(t("REVLOG_TAGS"))
            .setDesc(t("REVLOG_TAGS_DESC"))
            .addTextArea((text) =>
                text.setValue(this.settings.revlog_tags.join(" ")).onChange((value) => {
                    applySettingsUpdate(() => {
                        const tags = value.split(/[\n\s]+/);
                        if (tags.at(-1) === "") {
                            tags.pop();
                        }
                        this.settings.revlog_tags = tags;
                        update(this.settings);
                    });
                }),
            );

        new Setting(containerEl)
            .setName(t("REQUEST_RETENTION"))
            .setDesc(t("REQUEST_RETENTION_DESC"))
            .addSlider((slider) =>
                slider
                    .setLimits(50, 100, 1)
                    .setValue(this.settings.request_retention * 100)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        this.settings.request_retention = value / 100;
                        update(this.settings);
                        this.updateFsrsParams();
                    }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(() => {
                        applySettingsUpdate(() => {
                            this.settings.request_retention =
                                this.defaultSettings().request_retention;
                            update(this.settings);
                            this.updateFsrsParams();
                            this.displaySettings(containerEl, update);
                        });
                    });
            });

        new Setting(containerEl)
            .setName(t("MAX_INTERVAL"))
            .setDesc(t("MAX_INTERVAL_DESC"))
            .addText((text) =>
                text.setValue(this.settings.maximum_interval.toString()).onChange((value) => {
                    applySettingsUpdate(() => {
                        const numValue: number = Number.parseInt(value);
                        if (!isNaN(numValue)) {
                            if (numValue < 1) {
                                new Notice(t("MAX_INTERVAL_MIN_WARNING"));
                                text.setValue(this.settings.maximum_interval.toString());
                                return;
                            }

                            this.settings.maximum_interval = numValue;
                            text.setValue(this.settings.maximum_interval.toString());
                            update(this.settings);
                            this.updateFsrsParams();
                        } else {
                            new Notice(t("VALID_NUMBER_WARNING"));
                        }
                    });
                }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(() => {
                        applySettingsUpdate(() => {
                            this.settings.maximum_interval =
                                this.defaultSettings().maximum_interval;
                            update(this.settings, true);
                            this.updateFsrsParams();
                        });
                    });
            });

        new Setting(containerEl)
            .setName("W")
            // .setDesc("")
            .addText((text) =>
                text.setValue(this.settings.w.join(", ")).onChange((value) => {
                    applySettingsUpdate(() => {
                        try {
                            const numValue: number[] = value.split(/[ ,]+/).map((v) => {
                                return Number.parseFloat(v);
                            });
                            if (numValue.length === this.settings.w.length) {
                                this.settings.w = numValue;
                                update(this.settings);
                                this.updateFsrsParams();
                                return;
                            }
                        } catch (error) {
                            console.debug(error);
                        }
                        new Notice(t("VALID_NUMBER_WARNING"));
                        text.setValue(this.settings.w.toString());
                    });
                }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(() => {
                        applySettingsUpdate(() => {
                            this.settings.w = this.defaultSettings().w;
                            update(this.settings, true);
                            this.updateFsrsParams();
                        });
                    });
            });

        const wDescription = containerEl.querySelector(".setting-item-description");
        if (wDescription instanceof HTMLElement) {
            wDescription.setText(t("FSRS_W_PARAM_DESC"));
        }

        new Setting(containerEl)
            .setName(t("FUZZING"))
            .setDesc(t("FUZZING_DESC"))
            .addToggle((toggle) =>
                toggle.setValue(this.settings.enable_fuzz).onChange((value) => {
                    applySettingsUpdate(() => {
                        this.settings.enable_fuzz = value ?? this.defaultSettings().enable_fuzz;
                        update(this.settings, true);
                        this.updateFsrsParams();
                    });
                }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(() => {
                        applySettingsUpdate(() => {
                            this.settings.enable_fuzz = this.defaultSettings().enable_fuzz;
                            update(this.settings, true);
                            this.updateFsrsParams();
                        });
                    });
            });

        new Setting(containerEl)
            .setName(t("SWITCH_SHORT_TERM"))
            .setDesc(t("SWITCH_SHORT_TERM_DESC"))
            .addToggle((toggle) =>
                toggle.setValue(this.settings.enable_short_term).onChange((value) => {
                    applySettingsUpdate(() => {
                        this.settings.enable_short_term =
                            value ?? this.defaultSettings().enable_short_term;
                        update(this.settings, true);
                        this.updateFsrsParams();
                    });
                }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(() => {
                        applySettingsUpdate(() => {
                            this.settings.enable_short_term =
                                this.defaultSettings().enable_short_term;
                            update(this.settings, true);
                            this.updateFsrsParams();
                        });
                    });
            });

        return;
    }
}
