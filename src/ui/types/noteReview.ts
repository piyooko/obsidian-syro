/**
 * 笔记复习侧边栏相关类型定义
 *
 * 从 UIsandbox 移植并适配 Obsidian 环境
 */

import { TFile } from "obsidian";

/**
 * 侧边栏中的单个笔记项
 */
export interface NoteReviewItem {
    /** 唯一标识符 */
    id: string;
    /** 笔记标题 */
    title: string;
    /** 优先级 (1-10, 1最重要) */
    priority: number;
    /** 笔记路径 */
    path: string;
    /** Obsidian TFile 引用 */
    noteFile: TFile;
    /** 到期时间戳 (ms) */
    dueUnix?: number;
    /** 是否为新笔记 */
    isNew?: boolean;
    /** 标签列表 (支持层级如 "数学/微积分") */
    tags?: string[];
}

/**
 * 侧边栏中的分组
 * (例如: "New", "今天", "3天后" 等)
 */
export interface NoteReviewSection {
    /** 分组唯一标识符 */
    id: string;
    /** 分组标题 */
    title: string;
    /** 该分组下的笔记数量 */
    count: number;
    /** 分组标题颜色 (CSS 颜色值) */
    color: string;
    /** 分组下的笔记项列表 */
    items: NoteReviewItem[];
}

/**
 * 笔记复习侧边栏的完整数据状态
 */
export interface NoteReviewSidebarState {
    /** 所有分组 */
    sections: NoteReviewSection[];
    /** 总笔记数 */
    totalCount: number;
    /** 当前选中的牌组名 */
    currentDeckName?: string;
}
