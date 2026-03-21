/**
 * 这个文件主要是干什么的：
 * [算法层] 算法工厂与切换器。
 * 维护一个算法实例的注册表，并提供 `algorithmSwitchData` 方法，用于在用户切换算法时，将现有的复习数据（如 Interval, Ease）转换或迁移到新算法所需的格式。
 *
 * 它在项目中属于：算法层 (Algorithms) / 工厂 (Factory)
 *
 * 它会用到哪些文件：
 * 1. src/algorithms/*.ts (所有具体算法)
 * 2. src/dataStore/data.ts
 *
 * 哪些文件会用到它：
 * 1. src/main.ts (插件初始化时选择算法)
 * 2. src/settings.ts (设置界面调用切换)
 */
/**
 * [算法层：负责计算下一次复习的时间、间隔和难度] [桥接] 算法工厂，用于在运行时根据设置切换不同的算法实例（Anki/FSRS/SM2）。
 */
import { Notice } from "obsidian";
import { SrsAlgorithm, algorithmNames } from "src/algorithms/algorithms";
import { t } from "src/lang/helpers";
import SRPlugin from "src/main";
import { AnkiAlgorithm } from "./anki";
import { FsrsAlgorithm } from "./fsrs";
import { DefaultAlgorithm } from "./scheduling_default";
import { Sm2Algorithm } from "./supermemo";
import { WeightedMultiplierAlgorithm } from "./weightedMultiplier";

export const algorithms: Record<string, SrsAlgorithm | null> = {
    Default: new DefaultAlgorithm(),
    Anki: new AnkiAlgorithm(),
    Fsrs: new FsrsAlgorithm(),
    SM2: new Sm2Algorithm(),
    WeightedMultiplier: new WeightedMultiplierAlgorithm(),
};

/**
 * algorithmSwitchData
 * @param fromAlgo
 * @param toAlgo
 * @returns Promise<boolean> return true if switchData success.
 */
export async function algorithmSwitchData(
    plugin: SRPlugin,
    fromAlgo: algorithmNames,
    toAlgo: algorithmNames,
): Promise<boolean> {
    // const plugin = this.plugin;
    const store = plugin.store;
    const items = store.data.items;

    const old_path = store.dataPath;
    const bak_path = old_path + "." + fromAlgo + ".bak";

    await store.save(bak_path);
    await store.pruneData();
    await store.verifyItems();
    const fromTo = " from " + fromAlgo + " to: " + toAlgo;
    try {
        const algo = algorithms[toAlgo];
        algo.updateSettings(plugin.data.settings.algorithmSettings[toAlgo]);
        // algo.setDueDates(plugin.noteStats.delayedDays.dict, plugin.cardStats.delayedDays.dict);
        algo.importer(fromAlgo, items);
        if (toAlgo === algorithmNames.Fsrs) {
            store.data.items.find((item) => {
                if (Object.prototype.hasOwnProperty.call(item.data, "ease")) {
                    throw new Error("conv to fsrs failed");
                }
            });
        } else if (fromAlgo === algorithmNames.Fsrs) {
            store.data.items.find((item) => {
                if (Object.prototype.hasOwnProperty.call(item.data, "state")) {
                    throw new Error("conv to fsrs failed");
                }
            });
        }

        await store.save();
        const msg = fromTo + t("ALGORITHM_SWITCH_SUCCESS");
        new Notice(msg);
        console.debug(msg);
        return true;
    } catch (error) {
        await store.load(bak_path);
        new Notice(error + fromTo + t("ALGORITHM_SWITCH_FAILED"));
        console.log(error);
        return false;
    }
}
