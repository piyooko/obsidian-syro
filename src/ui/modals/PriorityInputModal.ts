import { App, Modal, Notice, Setting } from "obsidian";
import { t } from "src/lang/helpers";

/**
 * PriorityInputModal - 重要性选择器模态框
 *
 * 功能：
 * - 提供1-10的重要性选择（滚轮数字选择器）
 * - 显示说明文本
 * - 确认/取消按钮
 */
export class PriorityInputModal extends Modal {
    private priority: number;
    private onSubmit: (priority: number) => void;

    constructor(app: App, currentPriority: number, onSubmit: (priority: number) => void) {
        super(app);
        this.priority = currentPriority;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 标题
        contentEl.createEl("h2", { text: t("SET_PRIORITY") });

        // 说明文本
        contentEl.createEl("p", {
            text: t("PRIORITY_DESC"),
            cls: "priority-modal-desc",
        });

        // 重要性设置
        new Setting(contentEl)
            .setName(t("PRIORITY_LABEL"))
            .setDesc(`${t("PRIORITY_DESC")}`)
            .addSlider((slider) =>
                slider
                    .setLimits(1, 10, 1)
                    .setValue(this.priority)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        this.priority = value;
                    }),
            );

        // 显示当前选择的数值
        const valueDisplay = contentEl.createEl("div", {
            text: `${t("PRIORITY")}: ${this.priority}`,
            cls: "priority-value-display",
        });
        valueDisplay.style.textAlign = "center";
        valueDisplay.style.fontSize = "1.2em";
        valueDisplay.style.fontWeight = "bold";
        valueDisplay.style.marginTop = "1em";
        valueDisplay.style.marginBottom = "1em";

        // 更新显示值的函数
        const updateDisplay = () => {
            valueDisplay.setText(`${t("PRIORITY")}: ${this.priority}`);
        };

        // 监听slider变化
        const slider = contentEl.querySelector('input[type="range"]') as HTMLInputElement;
        if (slider) {
            slider.addEventListener("input", () => {
                this.priority = parseInt(slider.value);
                updateDisplay();
            });
        }

        // 按钮容器
        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
        buttonContainer.style.display = "flex";
        buttonContainer.style.justifyContent = "flex-end";
        buttonContainer.style.gap = "10px";
        buttonContainer.style.marginTop = "1.5em";

        // 取消按钮
        const cancelButton = buttonContainer.createEl("button", { text: t("CANCEL") });
        cancelButton.addEventListener("click", () => {
            this.close();
        });

        // 确认按钮
        const submitButton = buttonContainer.createEl("button", {
            text: t("SAVE"),
            cls: "mod-cta",
        });
        submitButton.addEventListener("click", () => {
            if (this.priority < 1 || this.priority > 10) {
                new Notice("重要性必须在1-10之间");
                return;
            }
            this.onSubmit(this.priority);
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
