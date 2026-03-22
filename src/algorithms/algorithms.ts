/**
 * 杩欎釜鏂囦欢涓昏鏄共浠€涔堢殑锛?
 * [绠楁硶灞俔 闂撮殧閲嶅绠楁硶 (SRS) 鐨勬娊璞″熀绫绘帴鍙ｃ€?
 * 瀹氫箟浜嗘墍鏈夊叿浣撶畻娉曪紙濡?Anki, FSRS, SM2锛夊繀椤诲疄鐜扮殑鏂规硶锛屼緥濡?`onSelection` (澶勭悊璇勫垎), `calcAllOptsIntervals` (璁＄畻棰勮), `displaySettings` (鏄剧ず璁剧疆)銆?
 *
 * 瀹冨湪椤圭洰涓睘浜庯細绠楁硶灞?(Algorithms) / 鎺ュ彛 (Interface)
 *
 * 瀹冧細鐢ㄥ埌鍝簺鏂囦欢锛?
 * 1. src/dataStore/repetitionItem.ts
 *
 * 鍝簺鏂囦欢浼氱敤鍒板畠锛?
 * 1. src/algorithms/*.ts (鍏蜂綋瀹炵幇)
 * 2. src/algorithms/algorithms_switch.ts
 */
/**
 * [绠楁硶灞傦細璐熻矗璁＄畻涓嬩竴娆″涔犵殑鏃堕棿銆侀棿闅斿拰闅惧害] [鏍稿績] 绠楁硶鐨勬娊璞″熀绫伙紙Interface锛夛紝瀹氫箟鎵€鏈夌畻娉曞繀椤诲疄鐜扮殑鏂规硶銆?
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

    updateSettings(settings: unknown): void {
        const normalizedSettings = typeof settings === "object" && settings !== null ? settings : {};
        this.settings = MiscUtils.assignOnly(this.defaultSettings(), normalizedSettings);
        // this.plugin = plugin;
        SrsAlgorithm.instance = this;
    }

    abstract defaultSettings(): object;
    abstract defaultData(): object;
    abstract onSelection(item: RepetitionItem, option: string, repeat: boolean): ReviewResult;
    abstract calcAllOptsIntervals(item: RepetitionItem): number[];
    abstract srsOptions(): string[];
    abstract importer(fromAlgo: algorithmNames, items: RepetitionItem[]): void;
    abstract displaySettings(
        containerEl: HTMLElement,
        update: (settings: unknown, refresh?: boolean) => void,
    ): void;
}
