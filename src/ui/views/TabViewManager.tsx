import { PaneType, TFile, ViewCreator, WorkspaceLeaf } from "obsidian";

import { SR_TAB_VIEW } from "src/constants";
import SRPlugin from "src/main";
import { FlashcardReviewMode } from "src/FlashcardReviewSequencer";
import { Deck } from "src/Deck";
import { TabView } from "./TabView";

// 定义 Tab 视图类型结构
export type TabViewType = { type: string; viewCreator: ViewCreator };

/**
 * TabViewManager 类
 *
 * 管理插件中的标签页视图 (Tab Views)。
 * 负责注册视图类型、打开新视图、关闭所有视图等操作。
 *
 * 作用：它是 SRPlugin 和 TabView 之间的桥梁。
 */
export default class TabViewManager {
    private plugin: SRPlugin;

    // 状态缓存：用于在打开视图时传递参数
    // 因为 Obsidian 的 registerView 回调不直接支持传参，
    // 所以需要在 openTabView 调用前先把参数存到这里，
    // 然后在 viewCreator 回调里读取。
    private shouldOpenSingeNoteTabView: boolean;
    private chosenReviewModeForTabbedView: FlashcardReviewMode;
    private chosenSingleNoteForTabbedView: TFile;

    // 视图类型注册表
    private tabViewTypes: TabViewType[] = [
        {
            type: SR_TAB_VIEW, // 视图 ID
            viewCreator: (leaf) =>
                new TabView(leaf, this.plugin, async () => {
                    // --- 数据加载回调 ---
                    // 这个回调会在 TabView.onOpen 时被执行。
                    // 利用闭包特性，这里可以访问到 TabViewManager 的私有状态 (chosen...)

                    // 情况 A: 单个笔记复习模式
                    if (this.shouldOpenSingeNoteTabView) {
                        const singleNoteDeckData =
                            await this.plugin.getPreparedDecksForSingleNoteReview(
                                this.chosenSingleNoteForTabbedView,
                                this.chosenReviewModeForTabbedView,
                            );

                        return this.plugin.getPreparedReviewSequencer(
                            singleNoteDeckData.deckTree,
                            singleNoteDeckData.remainingDeckTree,
                            singleNoteDeckData.mode,
                        );
                    }

                    // 情况 B: 全局/牌组复习模式
                    const fullDeckTree: Deck = this.plugin.deckTree;
                    const remainingDeckTree: Deck =
                        this.chosenReviewModeForTabbedView === FlashcardReviewMode.Cram
                            ? this.plugin.deckTree // Cram 模式使用所有卡片
                            : this.plugin.remainingDeckTree; // 正常模式只用剩余卡片

                    return this.plugin.getPreparedReviewSequencer(
                        fullDeckTree,
                        remainingDeckTree,
                        this.chosenReviewModeForTabbedView,
                    );
                }),
        },
    ];

    constructor(plugin: SRPlugin) {
        this.plugin = plugin;
        this.shouldOpenSingeNoteTabView = false;

        // 初始化时注册所有视图
        this.registerAllTabViews();
    }

    /**
     * 打开 SR 标签页视图
     *
     * @param reviewMode 复习模式
     * @param singleNote (可选) 指定复习的单个笔记
     */
    public async openSRTabView(reviewMode: FlashcardReviewMode, singleNote?: TFile): Promise<void> {
        // 1. 设置状态 (参数传递)
        this.chosenReviewModeForTabbedView = reviewMode;
        this.shouldOpenSingeNoteTabView = singleNote !== undefined;
        if (singleNote) this.chosenSingleNoteForTabbedView = singleNote;

        // 2. 调用核心打开方法
        await this.openTabView(SR_TAB_VIEW, true);
    }

    /**
     * 关闭所有已打开的 Tab Views
     */
    public closeAllTabViews() {
        this.forEachTabViewType((viewType) => {
            // Obsidian API: 移除指定类型的叶子
            this.plugin.app.workspace.detachLeavesOfType(viewType.type);
        });
    }

    /** 遍历辅助函数 */
    public forEachTabViewType(callback: (type: TabViewType) => void) {
        this.tabViewTypes.forEach((type) => callback(type));
    }

    /** 注册所有视图类型到 Obsidian */
    public registerAllTabViews() {
        this.forEachTabViewType((viewType) =>
            this.plugin.registerView(viewType.type, viewType.viewCreator),
        );
    }

    /**
     * 核心打开逻辑
     *
     * @param type 视图类型 ID
     * @param newLeaf 是否在新建叶子中打开 (或者 boolean)
     */
    public async openTabView(type: string, newLeaf?: PaneType | boolean) {
        const { workspace } = this.plugin.app;

        let leaf: WorkspaceLeaf | null = null;
        // 检查是否已经有打开的同类型视图
        const leaves = workspace.getLeavesOfType(type);

        if (leaves.length > 0) {
            // 如果有，复用第一个
            leaf = leaves[0];
        } else {
            // 如果没有，创建新的叶子
            leaf = workspace.getLeaf(newLeaf);
            if (leaf !== null) {
                // 设置视图状态，这将触发生命周期 (onOpen)
                await leaf.setViewState({ type: type, active: true });
            }
        }

        // 确保该叶子被显示出来 (防止在折叠的侧边栏里)
        if (leaf !== null) {
            workspace.revealLeaf(leaf);
        }
    }
}
