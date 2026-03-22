/**
 * 杩欎釜鏂囦欢涓昏鏄共浠€涔堢殑锛?
 * [绠楁硶灞俔 FSRS (Free Spaced Repetition Scheduler) 鐜颁唬绠楁硶瀹炵幇銆?
 * 鍩轰簬 `ts-fsrs` 搴擄紝鎻愪緵浜嗘洿鍏堣繘鐨勮皟搴﹂€昏緫銆傛敮鎸佽褰曡缁嗙殑 RevLog锛堝涔犳棩蹇楋級锛屽苟鑳芥牴鎹巻鍙茶褰曚紭鍖栧弬鏁般€?
 *
 * 瀹冨湪椤圭洰涓睘浜庯細绠楁硶灞?(Algorithms) / 瀹炵幇 (Implementation)
 *
 * 瀹冧細鐢ㄥ埌鍝簺鏂囦欢锛?
 * 1. ts-fsrs (绗笁鏂瑰簱)
 * 2. src/dataStore/adapter.ts (璇诲啓鏃ュ織 csv)
 *
 * 鍝簺鏂囦欢浼氱敤鍒板畠锛?
 * 1. src/algorithms/algorithms_switch.ts
 */
/**
 * [绠楁硶灞傦細璐熻矗璁＄畻涓嬩竴娆″涔犵殑鏃堕棿銆侀棿闅斿拰闅惧害] [鏍稿績] FSRS (Free Spaced Repetition Scheduler) 鐜颁唬绠楁硶瀹炵幇銆?
 */
import { Setting, Notice } from "obsidian";
import { DateUtils, MiscUtils } from "src/util/utils_recall";
import { SrsAlgorithm, algorithmNames } from "./algorithms";
import { DataStore } from "../dataStore/data";

import * as tsfsrs from "ts-fsrs";
import { t } from "src/lang/helpers";
import deepcopy from "deepcopy";
import { AnkiData } from "./anki";
import { Rating, ReviewLog } from "ts-fsrs";
import { FsrsReviewEvent, RepetitionItem, ReviewResult } from "src/dataStore/repetitionItem";
import { Iadapter } from "src/dataStore/adapter";

// https://github.com/mgmeyers/obsidian-kanban/blob/main/src/Settings.ts
let applyDebounceTimer = 0;
function applySettingsUpdate(callback: () => void): void {
    clearTimeout(applyDebounceTimer);
    applyDebounceTimer = window.setTimeout(callback, 512);
}

export type FsrsData = tsfsrs.Card;

export class RevLog {
    // --- 1. 韬唤璇嗗埆 (Identity) ---
    card_id = ""; // 馃憟 鏍稿績淇敼锛氭敼涓?string锛屽苟浣跨敤 uuid
    item_type = ""; // 馃憟 鏂板锛氬尯鍒嗘槸 card 杩樻槸 note锛屾柟渚夸互鍚庡仛鐙珛缁熻

    // --- 2. 鏍稿績澶嶄範鍔ㄤ綔 (Action) ---
    review_time = 0;
    review_rating = 0;
    review_state = 0;
    review_duration = 0;

    // --- 3. 璁板繂鐘舵€佸揩鐓?(Memory State) - FSRS 鎷熷悎涓庨珮绾у浘琛ㄥ繀澶?---
    stability = 0; // S锛氳蹇嗙ǔ瀹氭€?
    difficulty = 0; // D锛氳蹇嗛毦搴?

    // --- 4. 璋冨害鍙傛暟 (Scheduling) ---
    elapsed_days = 0; // 瀹為檯缁忚繃澶╂暟 (鐪熷疄閬楀繕鐜囪绠楀叧閿?
    scheduled_days = 0; // 瀹夋帓鐨勪笅娆″涔犲ぉ鏁?

    // --- 5. 鍏冩暟鎹?(Metadata) ---
    tag = "";

    constructor(
        item: RepetitionItem = null,
        reviewLog: ReviewLog = null,
        duration: number = 0,
        stability: number = 0,
        difficulty: number = 0,
    ) {
        if (item) {
            // 馃憟 鏍稿績淇敼锛氫笉鍐嶄娇鐢?item.ID锛岃€屾槸浣跨敤缁堣韩涓嶅彉鐨?item.uuid
            this.card_id = item.uuid;
            this.item_type = item.itemType; // 璁板綍绫诲瀷

            // 闃插尽鎬у鐞嗭細CSV 閬囧埌閫楀彿浼氶敊琛岋紝鎵€浠ョ粰鍖呭惈閫楀彿鐨?tag 鍔犱笂鍙屽紩鍙?
            this.tag = item.deckName.includes(",") ? `"${item.deckName}"` : item.deckName;
        }

        if (reviewLog) {
            this.review_time = reviewLog.review.getTime();
            this.review_rating = reviewLog.rating;
            this.review_state = reviewLog.state;

            // 馃憟 鏍稿績浼樺寲锛氳褰曞涔犫€滃悗鈥濈敓鎴愮殑绋冲畾鎬у弬鏁般€?
            // 瀵逛簬 FSRS Optimizer锛岃繖涓€琛屼粛鐒朵唬琛?state=0 鐨勮浆鍖栵紱
            // 瀵逛簬鐢ㄦ埛缁熻锛岃繖涓€琛岃褰曚簡杩欐澶嶄範浜х敓鐨勭粨鏋滐紙涓嶅啀鏄?0锛夈€?
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

    // 鑾峰彇 CSV 琛ㄥご
    static getKeyNames() {
        return Object.keys(new RevLog());
    }
}

interface FsrsSettings {
    revlog_tags: string[];
    request_retention: number;
    maximum_interval: number;
    w: readonly number[];
    enable_fuzz: boolean;
    enable_short_term: boolean;
}

const FsrsOptions: string[] = ["Again", "Hard", "Good", "Easy"]; // Manual =0

/**
 * This is an implementation of the Free Spaced Repetition Scheduling Algorithm as described in
 * https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler
 * https://github.com/open-spaced-repetition/fsrs.js
 */
export class FsrsAlgorithm extends SrsAlgorithm {
    settings: FsrsSettings;

    fsrs = new tsfsrs.FSRS(tsfsrs.generatorParameters(this.settings));
    card = tsfsrs.createEmptyCard();

    filename = "ob_revlog.csv";
    logfilepath: string = null;
    REVLOG_sep = ",";
    REVLOG_TITLE = RevLog.getKeyNames().join(this.REVLOG_sep) + "\n";
    review_duration = 0;

    // 馃憟 鏂板锛氶槻姝㈤珮棰戝啓鍏ュ鑷撮噸澶嶈〃澶寸殑绠€鏄撻攣
    private isWritingHeader = false;

    constructor() {
        super();
        //Set algorithm parameters
        this.updateFsrsParams();
    }

    defaultSettings(): FsrsSettings {
        return {
            revlog_tags: [],
            ...tsfsrs.generatorParameters(),
            // request_retention: 0.9,
            // maximum_interval: 36500,
            // w: [
            //     0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34,
            //     1.26, 0.29, 2.61,
            // ],
            enable_short_term: true,
            // enable_fuzz: false,
        };
    }
    updateSettings(settings: unknown) {
        this.settings = MiscUtils.assignOnly(this.defaultSettings(), settings);
        SrsAlgorithm.instance = this;
        if (this.settings.w.length !== this.defaultSettings().w.length) {
            const errmsg =
                "fsrs algothrim has been updated, please update w of algorithm setting. reset `w` to default will fix this error";
            console.error(errmsg);
            new Notice(errmsg, 0);
        }
        this.updateFsrsParams();
        this.getLogfilepath();
    }

    updateFsrsParams() {
        this.fsrs = new tsfsrs.FSRS(tsfsrs.generatorParameters(this.settings));
    }

    getLogfilepath() {
        const filepath = DataStore.getInstance().dataPath;
        const fder_index = filepath.lastIndexOf("/");
        this.logfilepath = filepath.substring(0, fder_index + 1) + this.filename;
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
        // 瀹夊叏妫€鏌ワ細濡傛灉 item 鎴?item.data 鏃犳晥锛屼娇鐢ㄧ┖鍗?
        let card: FsrsData;
        if (!item || !item.data || (item.data as FsrsData).state === undefined) {
            // 鏂板崱鐗囨垨鏁版嵁鎹熷潖锛屽垱寤虹┖鍗?
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
        // 瀹夊叏妫€鏌ワ細濡傛灉 item 鎴?item.data 鏃犳晥锛屽垱寤虹┖鍗?
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
            // 馃憟 浼犲叆璁＄畻鍚庣殑 stability 鍜?difficulty
            void this.appendRevlog(item, review_log, data.stability, data.difficulty);
        }

        const nextInterval = data.due.valueOf() - data.last_review.valueOf();

        return {
            correct,
            nextReview: nextInterval,
            reviewEvent: this.buildReviewEvent(previousData, data, review_log, reviewDuration),
        };
    }

    /**
     * 璁板綍閲嶅鏁版嵁 鏃ュ織锛?
     * @param now
     * @param cid 瀵瑰簲鏁版嵁椤笽D
     * @param rating
     */
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

        // 馃憟 鏍稿績淇锛氭洿涓ヨ皑鐨勮〃澶村啓鍏ラ€昏緫
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

    /**
     * 閲嶅啓 閲嶅鏁版嵁 鏃ュ織锛?
     * @param now
     * @param cid 瀵瑰簲鏁版嵁椤笽D锛?
     * @param rating
     */
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

    importer(fromAlgo: algorithmNames, items: RepetitionItem[]): void {
        const options = this.srsOptions();
        const initItvl = this.settings.w[4];
        items.forEach((item) => {
            if (item != null && item.data != null) {
                const reps = item.timesReviewed;
                let card = this.defaultData();
                if (reps > 0) {
                    const data = item.data as AnkiData;
                    const due = new Date(item.nextReview);
                    const interval = data.lastInterval;
                    const lastview = new Date(
                        item.nextReview - data.lastInterval * DateUtils.DAYS_TO_MILLIS,
                    );

                    let opt: string;
                    item.data = card;
                    if (interval > initItvl * 3) {
                        // card.state = State.Learning;
                        // in case the param is to big.
                        opt = options[Rating.Easy - 1];
                        this.onSelection(item, opt, false, false);
                    }
                    if (interval > initItvl) {
                        opt = options[Rating.Easy - 1];
                        this.onSelection(item, opt, false, false);
                    }
                    opt = options[Rating.Good - 1];
                    this.onSelection(item, opt, false, false);

                    card = item.data as FsrsData;
                    card.due = due;
                    card.scheduled_days = interval;
                    card.reps = reps;
                    card.last_review = lastview;
                } else {
                    item.data = card;
                }
                // item.data = deepcopy(card);
                if (
                    card.difficulty === 0 ||
                    card.difficulty == null ||
                    card.stability === 0 ||
                    card.stability == null
                ) {
                    if (reps > 0) {
                        const show = [item.ID, card, reps];
                        console.warn("data switch: d, s" + card.difficulty + ", " + card.stability);
                        console.warn(...show);
                    }
                }
            }
        });
        items.some((item) => {
            if (Object.prototype.hasOwnProperty.call(item.data, "ease")) {
                throw new Error("conv to fsrs failed");
            }
        });
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


