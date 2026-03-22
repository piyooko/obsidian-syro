/**
 * 杩欎釜鏂囦欢涓昏鏄共浠€涔堢殑锛?
 * [绠楁硶灞俔 鎻掍欢涓昏/鏃╂湡鐨勯粯璁よ皟搴︾畻娉曞疄鐜般€?
 * 閫昏緫绫讳技浜?SM-2/Anki锛屼絾鍙兘鍖呭惈浜嗕竴浜涙彃浠剁壒瀹氱殑璋冩暣锛堝 `lapsesIntervalChange` 绛夊弬鏁帮級銆?
 *
 * 瀹冨湪椤圭洰涓睘浜庯細绠楁硶灞?(Algorithms) / 瀹炵幇 (Implementation)
 *
 * 瀹冧細鐢ㄥ埌鍝簺鏂囦欢锛?
 * 1. src/algorithms/algorithms.ts
 * 2. src/algorithms/balance/balance.ts (璐熻浇鍧囪　)
 *
 * 鍝簺鏂囦欢浼氱敤鍒板畠锛?
 * 1. src/algorithms/algorithms_switch.ts
 */
/**
 * [绠楁硶灞傦細璐熻矗璁＄畻涓嬩竴娆″涔犵殑鏃堕棿銆侀棿闅斿拰闅惧害] [閬楃暀/鏍稿績] 鎻掍欢鏈€鏃╂湡鐨勯粯璁よ皟搴﹂€昏緫锛屽彲鑳戒笌 anki.ts 鏈夐噸鍙犮€?
 */
import { Notice, Setting } from "obsidian";

import { t } from "src/lang/helpers";

import { DateUtils } from "src/util/utils_recall";
import { SrsAlgorithm, algorithmNames } from "./algorithms";
import deepcopy from "deepcopy";
import { AnkiData } from "./anki";
import { FsrsData } from "./fsrs";
import { balance } from "./balance/balance";
import { RepetitionItem, ReviewResult } from "src/dataStore/repetitionItem";

// https://github.com/mgmeyers/obsidian-kanban/blob/main/src/Settings.ts
let applyDebounceTimer = 0;
function applySettingsUpdate(callback: () => void): void {
    clearTimeout(applyDebounceTimer);
    applyDebounceTimer = window.setTimeout(callback, 512);
}

export enum ReviewResponse {
    Reset,
    Hard,
    Good,
    Easy,
}

interface DefaultAlgoSettings {
    baseEase: number;
    lapsesIntervalChange: number;
    easyBonus: number;
    maximumInterval: number;
    maxLinkFactor: number;
}

interface Sm2Data {
    ease: number;
    lastInterval: number;
    iteration: number;
}

const Sm2Options: string[] = ["Reset", "Hard", "Good", "Easy"];

export function schedule(
    response: ReviewResponse,
    interval: number,
    ease: number,
    delayBeforeReview: number,
    settingsObj: DefaultAlgoSettings,
    dueDates?: Record<number, number>,
): Record<string, number> {
    delayBeforeReview = Math.max(0, Math.floor(delayBeforeReview / (24 * 3600 * 1000)));

    if (response === ReviewResponse.Easy) {
        ease += 20;
        interval = ((interval + delayBeforeReview) * ease) / 100;
        interval *= settingsObj.easyBonus;
    } else if (response === ReviewResponse.Good) {
        interval = ((interval + delayBeforeReview / 2) * ease) / 100;
    } else if (response === ReviewResponse.Hard) {
        ease = Math.max(130, ease - 20);
        interval = Math.max(
            1,
            (interval + delayBeforeReview / 4) * settingsObj.lapsesIntervalChange,
        );
    }

    // replaces random fuzz with load balancing over the fuzz interval

    // interval = balance(interval, dueDates, settingsObj.maximumInterval);

    return { interval: Math.round(interval * 10) / 10, ease };
}

export class DefaultAlgorithm extends SrsAlgorithm {
    settings: DefaultAlgoSettings;
    defaultSettings(): DefaultAlgoSettings {
        return {
            // algorithm
            baseEase: 250,
            lapsesIntervalChange: 0.5,
            easyBonus: 1.3,
            maximumInterval: 36525,
            maxLinkFactor: 1.0,
        };
    }

    defaultData(): Sm2Data {
        return {
            ease: this.settings.baseEase,
            lastInterval: 1, // the anki is 0.
            iteration: 1,
        };
    }

    srsOptions(): string[] {
        return Sm2Options;
    }

    calcAllOptsIntervals(item: RepetitionItem): number[] {
        const data: Sm2Data = item.data as Sm2Data;
        const due = item.nextReview;
        const now: number = Date.now();
        const delayBeforeReview = due === 0 ? 0 : now - due; //just in case.
        // console.debug("item.data:", item.data);
        // const dueDatesNotesorCards = this.getDueDates(item.itemType);

        const intvls: number[] = [];
        this.srsOptions().forEach((opt, ind) => {
            const dataCopy = deepcopy(data);
            // const dueDates = deepcopy(dueDatesNotesorCards);

            const schedObj: Record<string, number> = schedule(
                ind,
                dataCopy.lastInterval,
                dataCopy.ease,
                delayBeforeReview,
                this.settings,
                // dueDates,
            );
            const nextInterval = schedObj.interval;
            intvls.push(nextInterval);
        });
        return intvls;
    }

    onSelection(item: RepetitionItem, optionStr: string, repeat: boolean): ReviewResult {
        const data = item.data as Sm2Data;
        // console.debug("item.data:", item.data);

        const response = Sm2Options.indexOf(optionStr) as ReviewResponse;

        let correct = true;
        if (repeat) {
            if (response === ReviewResponse.Reset) {
                correct = false;
            } else {
                correct = true;
            }
            return { correct: correct, nextReview: -1 };
        }

        const due = item.nextReview;
        const now: number = Date.now();
        const delayBeforeReview = due === 0 ? 0 : now - due; //just in case.
        const schedObj: Record<string, number> = schedule(
            response,
            data.lastInterval,
            data.ease,
            delayBeforeReview,
            this.settings,
            // this.getDueDates(item.itemType),
        );

        const nextReview = schedObj.interval;
        data.ease = Math.round(schedObj.ease);
        if (response === ReviewResponse.Reset) {
            data.iteration = 1;
            data.lastInterval = nextReview;
            return {
                correct: false,
                nextReview: nextReview * DateUtils.DAYS_TO_MILLIS,
            };
        } else {
            data.iteration += 1;
            data.lastInterval = nextReview;
            return {
                correct: true,
                nextReview: nextReview * DateUtils.DAYS_TO_MILLIS,
            };
        }
    }

    importer(fromAlgo: algorithmNames, items: RepetitionItem[]): void {
        if (fromAlgo === algorithmNames.Anki || fromAlgo === algorithmNames.SM2) {
            this.importer_Anki(items);
        } else if (fromAlgo === algorithmNames.Fsrs) {
            this.importer_Fsrs(items);
        } else {
            throw Error(fromAlgo + "can't import to Default");
        }
    }

    private importer_Anki(items: RepetitionItem[]) {
        items.forEach((item) => {
            if (item != null && item.data != null) {
                const data: AnkiData = item.data as AnkiData;
                data.ease *= 100;
                if (data.lastInterval === 0) {
                    data.lastInterval = 1;
                } else {
                    data.lastInterval *= 1;
                }
            }
        });
    }

    private importer_Fsrs(items: RepetitionItem[]) {
        items.forEach((item) => {
            if (item != null && item.data != null) {
                const data = item.data as FsrsData;
                const lastitval = data.scheduled_days;
                const iter = data.reps;
                const newdata = this.defaultData() as AnkiData;
                newdata.lastInterval =
                    lastitval > newdata.lastInterval ? lastitval : newdata.lastInterval;
                newdata.iteration = iter;
                item.data = deepcopy(newdata);
            }
        });
    }

    displaySettings(
        containerEl: HTMLElement,
        update: (settings: DefaultAlgoSettings, refresh?: boolean) => void,
    ): void {
        containerEl.createDiv().setText(t("DEFAULT_ALGORITHM_DESC"));

        const DEFAULTSETTINGS = this.defaultSettings();

        new Setting(containerEl)
            .setName(t("BASE_EASE"))
            .setDesc(t("BASE_EASE_DESC"))
            .addText((text) =>
                text.setValue(this.settings.baseEase.toString()).onChange((value) => {
                    applySettingsUpdate(() => {
                        const numValue: number = Number.parseInt(value);
                        if (!isNaN(numValue)) {
                            if (numValue < 130) {
                                new Notice(t("BASE_EASE_MIN_WARNING"));
                                text.setValue(this.settings.baseEase.toString());
                                return;
                            }

                            this.settings.baseEase = numValue;
                            update(this.settings);
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
                            this.settings.baseEase = DEFAULTSETTINGS.baseEase;
                            update(this.settings, true);
                        });
                    });
            });

        new Setting(containerEl)
            .setName(t("LAPSE_INTERVAL_CHANGE"))
            .setDesc(t("LAPSE_INTERVAL_CHANGE_DESC"))
            .addSlider((slider) =>
                slider
                    .setLimits(1, 99, 1)
                    .setValue(this.settings.lapsesIntervalChange * 100)
                    .setDynamicTooltip()
                    .onChange((value: number) => {
                        this.settings.lapsesIntervalChange = value / 100;
                        update(this.settings);
                    }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(() => {
                        applySettingsUpdate(() => {
                            this.settings.lapsesIntervalChange =
                                DEFAULTSETTINGS.lapsesIntervalChange;
                            update(this.settings, true);
                        });
                    });
            });

        new Setting(containerEl)
            .setName(t("EASY_BONUS"))
            .setDesc(t("EASY_BONUS_DESC"))
            .addText((text) =>
                text.setValue((this.settings.easyBonus * 100).toString()).onChange((value) => {
                    applySettingsUpdate(() => {
                        const numValue: number = Number.parseInt(value) / 100;
                        if (!isNaN(numValue)) {
                            if (numValue < 1.0) {
                                new Notice(t("EASY_BONUS_MIN_WARNING"));
                                text.setValue((this.settings.easyBonus * 100).toString());
                                return;
                            }

                            this.settings.easyBonus = numValue;
                            update(this.settings);
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
                            this.settings.easyBonus = DEFAULTSETTINGS.easyBonus;
                            update(this.settings, true);
                        });
                    });
            });

        new Setting(containerEl)
            .setName(t("MAX_INTERVAL"))
            .setDesc(t("MAX_INTERVAL_DESC"))
            .addText((text) =>
                text.setValue(this.settings.maximumInterval.toString()).onChange((value) => {
                    applySettingsUpdate(() => {
                        const numValue: number = Number.parseInt(value);
                        if (!isNaN(numValue)) {
                            if (numValue < 1) {
                                new Notice(t("MAX_INTERVAL_MIN_WARNING"));
                                text.setValue(this.settings.maximumInterval.toString());
                                return;
                            }

                            this.settings.maximumInterval = numValue;
                            update(this.settings);
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
                            this.settings.maximumInterval = DEFAULTSETTINGS.maximumInterval;
                            update(this.settings, true);
                        });
                    });
            });

        new Setting(containerEl)
            .setName(t("MAX_LINK_CONTRIB"))
            .setDesc(t("MAX_LINK_CONTRIB_DESC"))
            .addSlider((slider) =>
                slider
                    .setLimits(0, 100, 1)
                    .setValue(this.settings.maxLinkFactor * 100)
                    .setDynamicTooltip()
                    .onChange((value: number) => {
                        this.settings.maxLinkFactor = value / 100;
                        update(this.settings);
                    }),
            )
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip(t("RESET_DEFAULT"))
                    .onClick(() => {
                        applySettingsUpdate(() => {
                            this.settings.maxLinkFactor = DEFAULTSETTINGS.maxLinkFactor;
                            update(this.settings, true);
                        });
                    });
            });
        return;
    }
}


