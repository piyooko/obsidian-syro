import deepcopy from "deepcopy";
import { Notice, Setting } from "obsidian";
import { t } from "src/lang/helpers";
import { WeightedMultiplierSettings } from "src/settings";
import { RepetitionItem, ReviewResult } from "src/dataStore/repetitionItem";
import { DateUtils } from "src/util/utils_recall";
import { SrsAlgorithm } from "./algorithms";

export interface WMSData {
    currentInterval: number;
}

const WMS_OPTIONS = ["Again", "Hard", "Good", "Easy"];

export class WeightedMultiplierAlgorithm extends SrsAlgorithm<WeightedMultiplierSettings> {
    settings: WeightedMultiplierSettings;

    defaultSettings(): WeightedMultiplierSettings {
        return {
            baseEase: 250,
            impMin: 1.0,
            impMax: 2.5,
            againInterval: 1.0,
            hardFactor: 0.7,
            goodFactor: 1.3,
            easyFactor: 2.0,
        };
    }

    defaultData(): WMSData {
        return {
            currentInterval: 1,
        };
    }

    srsOptions(): string[] {
        return [...WMS_OPTIONS];
    }

    calcAllOptsIntervals(item: RepetitionItem): number[] {
        const originalData = item.data as WMSData;
        const currentInterval =
            originalData && typeof originalData.currentInterval === "number"
                ? originalData.currentInterval
                : 1;

        return this.srsOptions().map((option) => {
            const itemCopy = deepcopy(item);
            if (!itemCopy.data) {
                itemCopy.data = this.defaultData();
            }
            (itemCopy.data as WMSData).currentInterval = currentInterval;

            const result = this.onSelection(itemCopy, option, false);
            return Math.round((result.nextReview / DateUtils.DAYS_TO_MILLIS) * 100) / 100;
        });
    }

    onSelection(item: RepetitionItem, optionStr: string, repeat: boolean): ReviewResult {
        const data = (item.data as WMSData) ?? this.defaultData();
        item.data = data;

        const response = WMS_OPTIONS.indexOf(optionStr);
        const priority = item.priority ?? 5;

        let correct = true;
        if (repeat) {
            return {
                correct: response !== 0,
                nextReview: -1,
            };
        }

        const currentInterval =
            typeof data.currentInterval === "number"
                ? data.currentInterval
                : item.interval > 0
                  ? item.interval
                  : 1;

        let nextInterval = currentInterval;
        if (response === 0) {
            nextInterval = this.settings.againInterval;
            correct = false;
        } else if (response === 1) {
            nextInterval = currentInterval * this.settings.hardFactor;
        } else if (response === 2 || response === 3) {
            const gradeMultiplier =
                response === 2 ? this.settings.goodFactor : this.settings.easyFactor;
            const slope = (this.settings.impMax - this.settings.impMin) / 9;
            const importanceFactor = this.settings.impMin + (priority - 1) * slope;
            nextInterval = currentInterval * gradeMultiplier * importanceFactor;
        }

        nextInterval = Math.max(1, Math.round(nextInterval));
        data.currentInterval = nextInterval;

        return {
            correct,
            nextReview: nextInterval * DateUtils.DAYS_TO_MILLIS,
        };
    }

    displaySettings(
        containerEl: HTMLElement,
        update: (settings: WeightedMultiplierSettings, refresh?: boolean) => void,
    ): void {
        const introEl = containerEl.createDiv();
        introEl.createEl("p").createEl("strong", {
            text: t("WMS_ALGORITHM"),
        });
        introEl.createEl("p", {
            text: t("WMS_ALGORITHM_DESC"),
        });
        introEl.createEl("p").createEl("strong", {
            text: t("WMS_CORE_FEATURES"),
        });
        const behaviorListEl = introEl.createEl("ul");
        [t("WMS_FEATURE_LOGIC"), t("WMS_FEATURE_INHERITANCE"), t("WMS_FEATURE_MAPPING")].forEach(
            (text) => {
                behaviorListEl.createEl("li", { text });
            },
        );

        new Setting(containerEl)
            .setName(t("WMS_IMP_MIN"))
            .setDesc(t("WMS_IMP_MIN_DESC"))
            .addText((text) =>
                text
                    .setPlaceholder("1.0")
                    .setValue(this.settings.impMin.toString())
                    .onChange((newValue) => {
                        const value = Number(newValue);
                        if (isNaN(value) || value < 0.1 || value > 5.0) {
                            new Notice(t("WMS_IMP_MIN_ERROR"));
                            return;
                        }
                        this.settings.impMin = value;
                        update(this.settings);
                    }),
            );

        new Setting(containerEl)
            .setName(t("WMS_IMP_MAX"))
            .setDesc(t("WMS_IMP_MAX_DESC"))
            .addText((text) =>
                text
                    .setPlaceholder("2.5")
                    .setValue(this.settings.impMax.toString())
                    .onChange((newValue) => {
                        const value = Number(newValue);
                        if (isNaN(value) || value < 0.1 || value > 10.0) {
                            new Notice(t("WMS_IMP_MAX_ERROR"));
                            return;
                        }
                        if (value < this.settings.impMin) {
                            new Notice(t("WMS_IMP_ORDER_ERROR"));
                            return;
                        }
                        this.settings.impMax = value;
                        update(this.settings);
                    }),
            );

        const formulaEl = containerEl.createDiv();
        formulaEl.setCssProps({
            marginTop: "1em",
            padding: "0.5em",
            background: "var(--background-secondary)",
            borderRadius: "4px",
        });
        formulaEl.createEl("strong", { text: t("WMS_FORMULA_TITLE") });
        formulaEl.createEl("br");
        formulaEl.appendText(t("WMS_FORMULA_AGAIN"));
        formulaEl.createEl("br");
        formulaEl.appendText(t("WMS_FORMULA_HARD"));
        formulaEl.createEl("br");
        formulaEl.appendText(t("WMS_FORMULA_GOOD"));
        formulaEl.createEl("br");
        formulaEl.appendText(t("WMS_FORMULA_EASY"));
        formulaEl.createEl("br");
        formulaEl.createEl("br");
        formulaEl.appendText(
            `${t("WMS_FORMULA_MATH_PREFIX")} impMin + (priority - 1) x (impMax - impMin) / 9`,
        );
    }
}
