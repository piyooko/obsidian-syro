/**
 * 这个文件主要是干什么的：
 * [算法层] SM-2 (SuperMemo 2) 算法的严格实现。
 * 提供了最经典的 SM-2 调度逻辑，主要作为一种替代选择。
 *
 * 它在项目中属于：算法层 (Algorithms) / 实现 (Implementation)
 *
 * 它会用到哪些文件：
 * 1. src/algorithms/algorithms.ts
 *
 * 哪些文件会用到它：
 * 1. src/algorithms/algorithms_switch.ts
 */
/**
 * [算法层：负责计算下一次复习的时间、间隔和难度] [核心] SM-2 算法实现。
 */
import { DateUtils, MiscUtils } from "src/util/utils_recall";
import { SrsAlgorithm, algorithmNames } from "./algorithms";
import deepcopy from "deepcopy";
import { AnkiAlgorithm, AnkiSettings } from "./anki";
import { RepetitionItem, ReviewResult } from "src/dataStore/repetitionItem";
import { t } from "src/lang/helpers";

interface Sm2Data {
    ease: number;
    lastInterval: number;
    iteration: number;
}

const Sm2Options: string[] = ["Blackout", "Incorrect", "Incorrect (Easy)", "Hard", "Good", "Easy"];

/**
 * Implementation of the SM2 algorithm as described at
 * https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 */
export class Sm2Algorithm extends SrsAlgorithm {
    settings: AnkiSettings;
    defaultSettings(): AnkiSettings {
        return new AnkiAlgorithm().defaultSettings();
    }

    defaultData(): Sm2Data {
        return {
            ease: 2.5,
            lastInterval: 0,
            iteration: 1,
        };
    }

    srsOptions(): string[] {
        return Sm2Options;
    }

    calcAllOptsIntervals(item: RepetitionItem): number[] {
        const intvls: number[] = [];
        this.srsOptions().forEach((opt, _ind) => {
            const itemCopy = deepcopy(item);
            const result = this.onSelection(itemCopy, opt, false);
            const intvl = Math.round((result.nextReview / DateUtils.DAYS_TO_MILLIS) * 100) / 100;
            intvls.push(intvl);
        });
        return intvls;
    }

    onSelection(item: RepetitionItem, optionStr: string, repeat: boolean): ReviewResult {
        const data = item.data as Sm2Data;
        console.log("item.data:", item.data);
        const interval = function (n: number): number {
            if (n === 1) {
                return 1;
            } else if (n === 2) {
                return 6;
            } else {
                return Math.round(data.lastInterval * data.ease);
            }
        };

        const q = Sm2Options.indexOf(optionStr);

        if (repeat) {
            if (q < 3) {
                return { correct: false, nextReview: -1 };
            } else {
                return { correct: true, nextReview: -1 };
            }
        }

        if (q < 3) {
            data.iteration = 1;
            const nextReview = interval(data.iteration);
            data.lastInterval = nextReview;
            return {
                correct: false,
                nextReview: nextReview * DateUtils.DAYS_TO_MILLIS,
            };
        } else {
            const nextReview = interval(data.iteration);
            data.iteration += 1;
            data.ease = data.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
            if (data.ease < 1.3) {
                data.ease = 1.3;
            }

            data.ease = MiscUtils.fixed(data.ease, 3);
            data.lastInterval = nextReview;
            // console.log("item.data:", item.data);
            // console.log("smdata:", data);
            return {
                correct: true,
                nextReview: nextReview * DateUtils.DAYS_TO_MILLIS,
            };
        }
    }

    importer(fromAlgo: algorithmNames, items: RepetitionItem[]): void {
        const anki = new AnkiAlgorithm();
        anki.updateSettings(this.settings);
        anki.importer(fromAlgo, items);
    }

    displaySettings(
        containerEl: HTMLElement,
        update: (settings: AnkiSettings, refresh?: boolean) => void,
    ): void {
        containerEl.createDiv().innerHTML = t("SM2_ALGORITHM_DESC");

        const anki = new AnkiAlgorithm();
        anki.updateSettings(this.settings);
        anki.displaySettings(containerEl, (settings, refresh?: boolean) => {
            update((this.settings = settings), refresh);
        });
    }
}
