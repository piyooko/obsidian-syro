/**
 * 这个文件主要是干什么的：
 * 定义了用于 Recall 模式或特定视图的牌组结构 (ReviewDeck)。
 * 与 `Deck.ts` 不同，它更侧重于按笔记 (Note) 维度或者特定算法优先级 (PageRank) 来组织复习队列。
 *
 * 它在项目中属于：模型层 (Model Layer)
 *
 * 它会用到哪些文件：
 * 1. src/dataStore/repetitionItem.ts (复习项数据)
 * 2. src/util/utils_recall.ts (日期工具)
 *
 * 哪些文件会用到它：
 * 1. src/ui/review-queue-list-view.ts (复习队列 UI 显示)
 * 2. src/algorithms/priorities/*.ts (优先级排序相关)
 */
import { TFile } from "obsidian";

import { t } from "src/lang/helpers";
import { RepetitionItem } from "./dataStore/repetitionItem";
import { globalDateProvider } from "./util/DateProvider";
import { DateUtils } from "./util/utils_recall";

export interface SchedNote {
    note: TFile;
    item?: RepetitionItem;
    dueUnix?: number;
    interval?: number;
    ease?: number;
}

export type Decks = { [deckKey: string]: ReviewDeck };

export class ReviewDeck {
    public deckName: string;
    public newNotes: SchedNote[] = [];
    public scheduledNotes: SchedNote[] = [];
    public activeFolders: Set<string>;
    private _dueNotesCount = 0;

    constructor(name: string) {
        this.deckName = name;
        this.activeFolders = new Set([this.deckName, t("TODAY")]);
    }

    public sortNotes(pageranks: Record<string, number>): void {
        // ✅ 先按日期分类，同一天内按重要性排序
        this.scheduledNotes.sort((a, b) => {
            // 优先级1：按到期日期排序（天数分类）
            const dateA = a.dueUnix ?? DateUtils.getTimestampInMs(new Date(2100, 1, 1));
            const dateB = b.dueUnix ?? DateUtils.getTimestampInMs(new Date(2100, 1, 1));

            // ✅ 关键修复：将时间戳转换为天数，忽略时分秒
            const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
            const dayA = Math.floor(dateA / MILLIS_PER_DAY);
            const dayB = Math.floor(dateB / MILLIS_PER_DAY);

            if (dayA !== dayB) {
                return dayA - dayB; // 早到期的排前面
            }

            // 优先级2：同一天内，按重要性排序（数字小的排前面）
            const priorityA = a.item?.priority ?? 5; // 默认优先级5
            const priorityB = b.item?.priority ?? 5;

            return priorityA - priorityB; // 1排在前，10排在后
        });

        this.newNotes.sort((a, b) => {
            // 新笔记：先按重要性，次要按pagerank
            const priorityA = a.item?.priority ?? 5;
            const priorityB = b.item?.priority ?? 5;

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // 次要：按pagerank排序
            return (pageranks[b.note.path] ?? 0) - (pageranks[a.note.path] ?? 0);
        });
    }

    get dueNotesCount(): number {
        return this.scheduledNotes.filter(isDue).length;
    }
}

function isDue(snote: SchedNote): boolean {
    if (Object.prototype.hasOwnProperty.call(snote, "item")) {
        return snote.item.isDue;
    } else {
        return snote.dueUnix <= globalDateProvider.endofToday.valueOf();
    }
}
