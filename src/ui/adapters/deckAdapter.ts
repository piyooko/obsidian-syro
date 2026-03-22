/**
 * Deck 适配器
 *
 * 将插件核心的 Deck 类转换为 UI 组件所需的 DeckState
 *
 * [V3 调度器] 采用自底向上（Bottom-Up）算法：
 * 子节点先按自身限额计算可用数量，再向上汇报；
 * 父节点汇总后用自身限额截断。
 * 这样 UI 上每个节点展示的都是"它自己独立能掏出多少卡"。
 */
import { Deck, CardListType, DeckTreeFilter } from "src/Deck";
import { DeckState } from "../types/deckTypes";
import type SRPlugin from "src/main";

/**
 * 将 Deck 对象递归转换为 DeckState
 *
 * [V3 显示逻辑]: UI 上显示的并非卡片的死累加，而是"如果我现在点击这个牌组，我能学多少张"。
 * 因此，针对列表中的每一个牌组，我们都把它当制复习起点的 Root，跑一遍自顶向下的漏斗算法。
 */
export function deckToUIState(deck: Deck, plugin?: SRPlugin, depth: number = 0): DeckState {
    const fullPath = deck.getTopicPath().path.join("/") || deck.deckName;
    const collapseState = plugin?.data?.settings?.deckCollapseState ?? {};
    const isCollapsed = collapseState[fullPath] ?? false;

    let displayNew = 0;
    let displayDue = 0;
    let displayLearning = 0;

    if (plugin) {
        // [核心] 将自己当做起点，模拟生成一次学习队列，拿到的卡片数就是 UI 应展示的数字
        const simulatedDeck = DeckTreeFilter.filterByDailyLimits(deck, plugin);
        const learnAheadMillis = Math.max(0, plugin.data.settings.learnAheadMinutes) * 60 * 1000;

        displayNew = simulatedDeck.getCardCount(CardListType.NewCard, true);
        displayDue = simulatedDeck.getCardCount(CardListType.DueCard, true);
        displayLearning = simulatedDeck.getAvailableLearningCardCount(true, learnAheadMillis);
    } else {
        // fallback
        displayNew = deck.getCardCount(CardListType.NewCard, true);
        displayDue = deck.getCardCount(CardListType.DueCard, true);
        displayLearning = deck.getAvailableLearningCardCount(true, 0);
    }

    // 递归转换子牌组。
    // 由于每个节点都会触发上面的逻辑，所以子牌组也会计算出自己作为起点的独立配额。
    // 这就会完美呈现 "20, 20, 20" 的 Anki 经典排布，而不会被错误地累加成 60。
    const subdecks = deck.subdecks.map((subdeck) => deckToUIState(subdeck, plugin, depth + 1));

    return {
        deckName: deck.deckName,
        fullPath: fullPath,
        newCount: displayNew,
        learningCount: displayLearning,
        dueCount: displayDue,
        subdecks,
        isCollapsed,
        depth,
    };
}

/**
 * 将 Deck 数组转换为 DeckState 数组
 */
/**
 * 根据完整路径查找 Deck 对象
 *
 * @param rootDeck 根牌组
 * @param fullPath 完整路径 (如 "编程/JavaScript/React")
 * @returns 对应的 Deck 对象，或 null
 */
export function findDeckByPath(rootDeck: Deck, fullPath: string): Deck | null {
    if (!fullPath) {
        return rootDeck;
    }

    const parts = fullPath.split("/");
    let current = rootDeck;

    for (const part of parts) {
        const found = current.subdecks.find((d) => d.deckName === part);
        if (!found) {
            return null;
        }
        current = found;
    }

    return current;
}

/**
 * 保存折叠状态
 */
export async function saveCollapseState(
    plugin: SRPlugin,
    fullPath: string,
    isCollapsed: boolean,
): Promise<void> {
    if (!plugin.data.settings.deckCollapseState) {
        plugin.data.settings.deckCollapseState = {};
    }
    plugin.data.settings.deckCollapseState[fullPath] = isCollapsed;
    await plugin.savePluginData();
}
