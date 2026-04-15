import { Modal, ButtonComponent, Component, MarkdownRenderer } from "obsidian";
import { t } from "src/lang/helpers";
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
    private readonly markdownOwner: Component;
    private settled = false;
    message: string;
    callback: ConfirmCallback;
    modal: Modal;

    constructor(plugin: SRPlugin, message: string, callback: ConfirmCallback) {
        this.plugin = plugin;
        this.message = message;
        // 创建一个空的 Modal 实例
        this.modal = new Modal(plugin.app);
        this.markdownOwner = new Component();
        this.markdownOwner.load();
        this.callback = callback;
    }

    /**
     * 打开确认框
     */
    open() {
        this.settled = false;
        const { contentEl } = this.modal;
        contentEl.empty();
        this.modal.onClose = () => {
            contentEl.empty();
            this.markdownOwner.unload();
            if (!this.settled) {
                this.settled = true;
                this.callback(false);
            }
        };

        // 使用 MarkdownRenderer 渲染消息内容，这样可以在确认框里显示加粗、链接等格式
        void MarkdownRenderer.render(
            this.plugin.app,
            this.message,
            contentEl,
            "",
            this.markdownOwner,
        );

        // 创建按钮容器
        const buttonDiv = contentEl.createDiv("srs-flex-row sr-confirm-modal-actions");

        // --- Cancel 按钮 ---
        new ButtonComponent(buttonDiv).setButtonText(t("CANCEL")).onClick(() => {
            this.emitResult(false);
            this.close();
        });

        // --- Confirm 按钮 ---
        new ButtonComponent(buttonDiv)
            .setButtonText(t("CONFIRM"))
            .onClick(() => {
                this.emitResult(true);
                this.close();
            })
            .setCta(); // 设置为 Call To Action 样式 (通常是高亮色)

        // 显示模态框
        this.modal.open();
    }

    openAndWait(): Promise<boolean> {
        return new Promise((resolve) => {
            const previousCallback = this.callback;
            this.callback = (confirmed) => {
                previousCallback(confirmed);
                resolve(confirmed);
            };
            this.open();
        });
    }

    /**
     * 关闭确认框
     */
    close() {
        this.modal.close();
    }

    private emitResult(confirmed: boolean): void {
        if (this.settled) {
            return;
        }

        this.settled = true;
        this.callback(confirmed);
    }
}
