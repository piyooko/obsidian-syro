import { App, Modal, ButtonComponent, MarkdownRenderer } from "obsidian";
import SRPlugin from "src/main";

// 确认回调函数类型定义
// confirmed: true 表示点击了 Confirm，false 表示点击了 Cancel
type ConfirmCallback = (confirmed: boolean) => void;

/**
 * ConfirmModal 类
 *
 * 一个通用的确认对话框。
 * 显示一段消息（支持 Markdown 渲染），并提供 "Confirm" 和 "Cancel" 两个按钮。
 */
export default class ConfirmModal {
    private plugin: SRPlugin;
    message: string;
    callback: ConfirmCallback;
    modal: Modal;

    constructor(plugin: SRPlugin, message: string, callback: ConfirmCallback) {
        this.plugin = plugin;
        this.message = message;
        // 创建一个空的 Modal 实例
        this.modal = new Modal(plugin.app);
        this.callback = callback;
    }

    /**
     * 打开确认框
     */
    open() {
        const { contentEl } = this.modal;

        // 使用 MarkdownRenderer 渲染消息内容，这样可以在确认框里显示加粗、链接等格式
        MarkdownRenderer.render(this.plugin.app, this.message, contentEl, "", this.plugin);

        // 创建按钮容器
        const buttonDiv = contentEl.createDiv("srs-flex-row");
        // buttonDiv.setAttribute("justify-content", "space-evenly");

        // --- Confirm 按钮 ---
        new ButtonComponent(buttonDiv)
            .setButtonText("Confirm")
            .onClick(() => {
                this.callback(true); // 回调 true
                this.close();
            })
            .setCta(); // 设置为 Call To Action 样式 (通常是高亮色)

        // --- Cancel 按钮 ---
        new ButtonComponent(buttonDiv).setButtonText("Cancel").onClick(() => {
            this.callback(false); // 回调 false
            this.close();
        });

        // 显示模态框
        this.modal.open();
    }

    /**
     * 关闭确认框
     */
    close() {
        this.modal.close();
    }
}
