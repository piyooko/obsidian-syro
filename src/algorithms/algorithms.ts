/**
 * 这个文件主要是干什么的：
 * [算法层] 间隔重复算法 (SRS) 的抽象基类接口。
 * 定义了所有具体算法（如 Anki, FSRS, SM2）必须实现的方法，例如 `onSelection` (处理评分), `calcAllOptsIntervals` (计算预览), `displaySettings` (显示设置)。
 *
 * 它在项目中属于：算法层 (Algorithms) / 接口 (Interface)
 *
 * 它会用到哪些文件：
 * 1. src/dataStore/repetitionItem.ts
 *
 * 哪些文件会用到它：
 * 1. src/algorithms/*.ts (具体实现)
 * 2. src/algorithms/algorithms_switch.ts
 */
/**
 * [算法层：负责计算下一次复习的时间、间隔和难度] [核心] 算法的抽象基类（Interface），定义所有算法必须实现的方法。
 */
import { MiscUtils } from "src/util/utils_recall";
import { RPITEMTYPE, RepetitionItem, ReviewResult } from "src/dataStore/repetitionItem";

export enum algorithmNames {
    Default = "Default",
    Anki = "Anki",
    Fsrs = "Fsrs",
    SM2 = "SM2",
    WeightedMultiplier = "WeightedMultiplier",
}

export abstract class SrsAlgorithm {
    settings: unknown;
    // plugin: SRPlugin;
    public static instance: SrsAlgorithm;

    public static getInstance(): SrsAlgorithm {
        if (!SrsAlgorithm.instance) {
            // SrsAlgorithm.instance = new SrsAlgorithm();
            throw Error("there is not algorithm instance.");
        }
        return SrsAlgorithm.instance;
    }

    updateSettings(settings: any) {
        this.settings = MiscUtils.assignOnly(this.defaultSettings(), settings);
        // this.plugin = plugin;
        SrsAlgorithm.instance = this;
    }

    abstract defaultSettings(): any;
    abstract defaultData(): any;
    abstract onSelection(item: RepetitionItem, option: string, repeat: boolean): ReviewResult;
    abstract calcAllOptsIntervals(item: RepetitionItem): number[];
    abstract srsOptions(): string[];
    abstract importer(fromAlgo: algorithmNames, items: RepetitionItem[]): void;
    abstract displaySettings(
        containerEl: HTMLElement,
        update: (settings: any, refresh?: boolean) => void,
    ): void;
}
