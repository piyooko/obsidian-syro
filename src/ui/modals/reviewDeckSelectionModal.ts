import { App, FuzzySuggestModal } from "obsidian";

/**
 * ReviewDeckSelectionModal 类
 *
 * 一个模糊搜索建议模态框 (FuzzySuggestModal)，用于选择要复习的牌组。
 * 继承自 Obsidian 的 FuzzySuggestModal，自带搜索过滤功能。
 */
export class ReviewDeckSelectionModal extends FuzzySuggestModal<string> {
    public deckKeys: string[] = [];
    public submitCallback: (deckKey: string) => void;

    /**
     * @param app
     * @param deckKeys 所有可选牌组的名称列表
     */
    constructor(app: App, deckKeys: string[]) {
        super(app);
        this.deckKeys = deckKeys;
    }

    /** 返回所有可供搜索的选项 */
    getItems(): string[] {
        return this.deckKeys;
    }

    /** 定义每个选项在界面上显示的文本 */
    getItemText(item: string): string {
        return item; // 这里直接显示牌组名
    }

    /**
     * 当用户选中某个选项后触发
     * @param deckKey 选中的牌组名
     */
    onChooseItem(deckKey: string, _: MouseEvent | KeyboardEvent): void {
        this.close();
        this.submitCallback(deckKey); // 执行回调
    }
}
