import { ItemView, WorkspaceLeaf } from "obsidian";

import { SR_TAB_VIEW } from "src/constants";
import SRPlugin from "src/main";
import { SRSettings } from "src/settings";
import { FlashcardReviewMode, IFlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import { ReactReviewApp } from "src/ui/ReactReviewApp";

/**
 * TabView 类 (标签页视图)
 *
 * 用于在 Obsidian 的主工作区（Workspace）标签页中显示复习界面，而不是在模态框弹窗中显示。
 * 它可以提供更大的操作空间，适合长时间专注于复习。
 *
 * 重构后使用统一的 ReactReviewApp 作为内部视图，
 * 实现了 DeckTree 和 CardReview 之间的平滑过渡动画。
 */
export class TabView extends ItemView {
    // 异步加载数据的回调
    loadReviewSequencerData: () => Promise<{
        reviewSequencer: IFlashcardReviewSequencer;
        mode: FlashcardReviewMode;
    }>;

    private plugin: SRPlugin;
    private reviewMode: FlashcardReviewMode;
    private viewContainerEl: HTMLElement; // 主容器
    private viewContentEl: HTMLElement; // 内容容器
    private reviewSequencer: IFlashcardReviewSequencer;
    private settings: SRSettings;

    // 统一的 React 应用
    private reactApp: ReactReviewApp | null = null;

    /** 错误计数器，用来忽略第一次"不可避免"的加载错误 */
    private openErrorCount: number = 0;

    constructor(
        leaf: WorkspaceLeaf,
        plugin: SRPlugin,
        loadReviewSequencerData: () => Promise<{
            reviewSequencer: IFlashcardReviewSequencer;
            mode: FlashcardReviewMode;
        }>,
    ) {
        super(leaf);
        this.plugin = plugin;
        this.settings = plugin.data.settings;
        this.loadReviewSequencerData = loadReviewSequencerData;

        // 初始化容器结构
        const viewContent = this.containerEl.getElementsByClassName("view-content");
        if (viewContent.length > 0) {
            this.viewContainerEl = viewContent[0] as HTMLElement;
            this.viewContainerEl.addClass("sr-tab-view");

            // 创建内容区域
            this.viewContentEl = this.viewContainerEl.createDiv("sr-tab-view-content");

            // 应用用户设置的尺寸 -> 强制全屏
            // 之前的逻辑会导致 TabView 内容被限制在 80% 高度 / 40% 宽度，造成布局错乱
            this.viewContentEl.style.height = "100%";
            this.viewContentEl.style.maxHeight = "100%";
            this.viewContentEl.style.width = "100%";
            this.viewContentEl.style.maxWidth = "100%";
            this.viewContentEl.style.overflow = "hidden";

            this.viewContainerEl.appendChild(this.viewContentEl);
        }
    }

    /** 返回视图类型标识符 */
    getViewType() {
        return SR_TAB_VIEW;
    }

    /** 返回标签页图标 */
    getIcon() {
        return "SpacedRepIcon";
    }

    /** 返回标签页标题 */
    getDisplayText() {
        return "Syro";
    }

    /**
     * 当视图打开时触发
     * 负责加载数据，并初始化 React 应用
     */
    async onOpen() {
        try {
            // 通过回调加载复习数据
            const loadedData = await this.loadReviewSequencerData();

            this.reviewSequencer = loadedData.reviewSequencer;
            this.reviewMode = loadedData.mode;

            // 初始化并挂载 React 应用
            if (!this.reactApp) {
                this.reactApp = new ReactReviewApp(
                    this.app,
                    this.plugin,
                    this.reviewSequencer,
                    this.viewContentEl,
                );
                this.reactApp.mount();
            }
        } catch (e) {
            /*
             * 这里的 try-catch 是为了处理一个特定的边缘情况：
             * 如果上次关闭 Obsidian 时 TabView 是打开的，下次打开 Obsidian 时，
             * 这个 Tab 会被 Obsidian 自动恢复加载。
             * 但此时 SR 插件可能还没完全加载完毕（数据未就绪），导致报错。
             * 我们允许这种错误发生一次并忽略它。
             */
            if (this.openErrorCount > 0) {
                console.error(e);
            }
            this.openErrorCount++;
        }
    }

    /**
     * 当视图关闭时触发
     * 清理资源
     */
    async onClose() {
        if (this.reactApp) {
            this.reactApp.unmount();
            this.reactApp = null;
        }

        // 保存数据
        this.plugin.savePluginData();
    }
}
