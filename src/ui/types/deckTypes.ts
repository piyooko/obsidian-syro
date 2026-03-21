/**
 * DeckState 类型定义
 *
 * 用于 React DeckTree 组件的 UI 状态
 */

export interface DeckState {
    /** 牌组名称 (仅当前层名称) */
    deckName: string;

    /** 完整路径 (用于面包屑导航，例如 "编程/JavaScript/React") */
    fullPath?: string;

    /** 新卡片数量 (本层，不含子牌组) */
    newCount: number;

    /** 学习中卡片数量 */
    learningCount: number;

    /** 到期卡片数量 */
    dueCount: number;

    /** 子牌组 */
    subdecks: DeckState[];

    /** UI 状态：是否折叠 */
    isCollapsed: boolean;

    /** 层级深度 (用于递归渲染时的缩进计算) */
    depth?: number;
}
