/**
 * 这个文件主要是干什么的：
 * 负责计算牌组树的统计信息。
 * 它遍历整个牌组树，统计 New, Due, Learning 卡片的数量，以及间隔(Interval)和易读度(Ease)的分布。
 * 主要用于生成统计图表或状态栏显示。
 *
 * 它在项目中属于：逻辑层 (Logic Layer)
 *
 * 它会用到哪些文件：
 * 1. src/Deck.ts (被统计的对象)
 * 2. src/DeckTreeIterator.ts (用于遍历牌组)
 * 3. src/Stats.ts (统计结果数据结构)
 *
 * 哪些文件会用到它：
 * 1. src/main.ts (插件主入口，用于状态栏或命令统计)
 * 2. src/stats.ts (可能存在循环引用，用于数据聚合)
 */
import { Deck } from "./Deck";
import {
    CardOrder,
    DeckOrder,
    DeckTreeIterator,
    IDeckTreeIterator,
    IIteratorOrder,
} from "./DeckTreeIterator";
import { Card } from "./Card";
import { Stats } from "./stats";
import { CardScheduleInfo } from "./CardSchedule";
import { TopicPath } from "./TopicPath";

export class DeckTreeStatsCalculator {
    private deckTree: Deck;

    calculate(deckTree: Deck): Stats {
        // Order doesn't matter as long as we iterate over everything
        const iteratorOrder: IIteratorOrder = {
            deckOrder: DeckOrder.PrevDeckComplete_Sequential,
            cardOrder: CardOrder.DueFirstSequential,
        };
        // Iteration is a destructive operation on the supplied tree, so we first take a copy
        const iterator: IDeckTreeIterator = new DeckTreeIterator(iteratorOrder, deckTree.clone());
        const result = new Stats();
        iterator.setIteratorTopicPath(TopicPath.emptyPath);
        while (iterator.nextCard()) {
            const card: Card = iterator.currentCard;
            if (card.hasSchedule) {
                const schedule: CardScheduleInfo = card.scheduleInfo;
                result.update(schedule.delayBeforeReviewDaysInt, schedule.interval, schedule.ease);
            } else {
                result.incrementNew();
            }
        }
        return result;
    }
}
