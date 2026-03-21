/**
 * 笔记复习数据适配器
 *
 * 将 plugin.reviewDecks 转换为 React 组件所需的数据结构
 */

import { TFile, CachedMetadata } from "obsidian";
import type SRPlugin from "src/main";
import { ReviewDeck, SchedNote } from "src/ReviewDeck";
import { NoteReviewSection, NoteReviewItem, NoteReviewSidebarState } from "../types/noteReview";
import { globalDateProvider } from "src/util/DateProvider";
import { t } from "src/lang/helpers";

/**
 * 颜色配置
 */
const COLORS = {
    new: "var(--text-accent)", // 主题强调色 (紫色)
    overdue: "#ff5555", // 红色 - 过期
    today: "#ff9f1c", // 橙色 - 今天
    soon: "#ffc107", // 黄色 - 近期
    future: "#4caf50", // 绿色 - 未来
    later: "#2196f3", // 蓝色 - 更远
};

/**
 * 从文件缓存中提取 frontmatter 标签
 */
function extractTags(fileCache: CachedMetadata | null): string[] {
    if (!fileCache?.frontmatter?.tags) return [];
    const tags = fileCache.frontmatter.tags;
    // 处理字符串或数组格式
    if (Array.isArray(tags)) {
        return tags.map((t) => String(t).replace(/^#/, ""));
    }
    if (typeof tags === "string") {
        return tags
            .split(",")
            .map((t) => t.trim().replace(/^#/, ""))
            .filter(Boolean);
    }
    return [];
}

/**
 * 将 SchedNote 转换为 NoteReviewItem
 */
function schedNoteToItem(sNote: SchedNote, index: number, plugin: SRPlugin): NoteReviewItem {
    const fileCache = plugin.app.metadataCache.getFileCache(sNote.note);
    return {
        id: `note-${sNote.note.path}-${index}`,
        title: sNote.note.basename,
        priority: sNote.item?.priority ?? 5,
        path: sNote.note.path,
        noteFile: sNote.note,
        dueUnix: sNote.dueUnix,
        isNew: false,
        tags: extractTags(fileCache),
    };
}

/**
 * 将新笔记转换为 NoteReviewItem
 */
function newNoteToItem(sNote: SchedNote, index: number, plugin: SRPlugin): NoteReviewItem {
    const fileCache = plugin.app.metadataCache.getFileCache(sNote.note);
    return {
        id: `new-${sNote.note.path}-${index}`,
        title: sNote.note.basename,
        priority: sNote.item?.priority ?? 5,
        path: sNote.note.path,
        noteFile: sNote.note,
        isNew: true,
        tags: extractTags(fileCache),
    };
}

/**
 * 获取天数对应的分组信息
 */
function getDaysGroupInfo(nDays: number): { title: string; color: string; sortOrder: number } {
    if (nDays < 0) {
        // 过期
        return {
            title: t("ADAPTER_DAYS_OVERDUE", { days: Math.abs(nDays) }),
            color: COLORS.overdue,
            sortOrder: nDays, // 负数，最早的最前
        };
    } else if (nDays === 0) {
        // 今天
        return {
            title: t("ADAPTER_TODAY"),
            color: COLORS.today,
            sortOrder: 0,
        };
    } else if (nDays === 1) {
        // 明天
        return {
            title: t("ADAPTER_TOMORROW"),
            color: COLORS.soon,
            sortOrder: 1,
        };
    } else if (nDays <= 7) {
        // 一周内
        return {
            title: t("ADAPTER_DAYS_FUTURE", { days: nDays }),
            color: COLORS.future,
            sortOrder: nDays,
        };
    } else if (nDays <= 30) {
        // 一个月内
        return {
            title: t("ADAPTER_DAYS_FUTURE", { days: nDays }),
            color: COLORS.later,
            sortOrder: nDays,
        };
    } else {
        // 更远
        return {
            title: t("ADAPTER_DAYS_FUTURE", { days: nDays }),
            color: COLORS.later,
            sortOrder: nDays,
        };
    }
}

/**
 * 将单个 ReviewDeck 转换为分组列表
 */
export function reviewDeckToSections(deck: ReviewDeck, plugin: SRPlugin): NoteReviewSection[] {
    const sections: NoteReviewSection[] = [];
    const settings = plugin.data.settings;
    // 计算"今天"的时间戳
    const now = globalDateProvider.endofToday.valueOf();

    const maxDaysToRender = settings.maxNDaysNotesReviewQueue;

    // 1. 处理新笔记
    if (deck.newNotes.length > 0) {
        const newItems = deck.newNotes.map((note, index) => newNoteToItem(note, index, plugin));
        sections.push({
            id: "new",
            title: t("NEW"),
            count: newItems.length,
            color: COLORS.new,
            items: newItems,
        });
    }

    // 2. 处理已调度笔记 - 按天数分组
    if (deck.scheduledNotes.length > 0) {
        const dayGroups: Map<number, NoteReviewItem[]> = new Map();

        for (let i = 0; i < deck.scheduledNotes.length; i++) {
            const sNote = deck.scheduledNotes[i];
            const nDays = Math.ceil((sNote.dueUnix - now) / (24 * 3600 * 1000));

            // 超过最大显示天数，跳过
            if (nDays > maxDaysToRender) continue;

            if (!dayGroups.has(nDays)) {
                dayGroups.set(nDays, []);
            }
            dayGroups.get(nDays)!.push(schedNoteToItem(sNote, i, plugin));
        }

        // 按天数排序并创建分组
        const sortedDays = Array.from(dayGroups.keys()).sort((a, b) => a - b);

        for (const nDays of sortedDays) {
            const items = dayGroups.get(nDays)!;
            const groupInfo = getDaysGroupInfo(nDays);

            sections.push({
                id: `day-${nDays}`,
                title: groupInfo.title,
                count: items.length,
                color: groupInfo.color,
                items: items,
            });
        }
    }

    return sections;
}

/**
 * 将所有 ReviewDecks 转换为完整的侧边栏状态
 *
 * @param plugin 插件实例
 * @param deckName 可选，指定只获取某个牌组的数据
 */
export function reviewDecksToSidebarState(
    plugin: SRPlugin,
    deckName?: string,
): NoteReviewSidebarState {
    const allSections: NoteReviewSection[] = [];
    let totalCount = 0;

    // 遍历所有牌组
    for (const key in plugin.reviewDecks) {
        // 如果指定了牌组名，只处理该牌组
        if (deckName && key !== deckName) continue;

        const deck = plugin.reviewDecks[key];
        const sections = reviewDeckToSections(deck, plugin);

        // 合并分组（同一天的合并）
        for (const section of sections) {
            const existing = allSections.find((s) => s.id === section.id);
            if (existing) {
                existing.items.push(...section.items);
                existing.count += section.count;
            } else {
                allSections.push({ ...section });
            }
        }

        totalCount += deck.newNotes.length + deck.scheduledNotes.length;
    }

    // 排序: 过期(负数) → 今天(0) → new → 未来(正数)
    allSections.sort((a, b) => {
        // 获取排序权重
        const getWeight = (id: string): number => {
            if (id === "new") return 0.5; // new 在今天之后、未来之前
            const day = parseInt(id.replace("day-", ""));
            if (isNaN(day)) return 1000;
            return day;
        };
        return getWeight(a.id) - getWeight(b.id);
    });

    return {
        sections: allSections,
        totalCount,
        currentDeckName: deckName,
    };
}
