import { App, ButtonComponent, Modal, Setting, TextComponent } from "obsidian";

/**
 * GetInputModal 类
 *
 * 一个简单的输入对话框，专门用于获取用户输入的"天数"。
 * 例如：推迟复习多少天？
 *
 * 支持手动输入，也支持鼠标滚轮滚动来调整天数。
 */
export class GetInputModal extends Modal {
    private promptText: string = "";
    private days: number = 1; // 默认值为1天
    private textComponent: TextComponent; // 保存输入组件引用

    // 回调函数：当用户点击提交时调用，参数是输入的天数
    public submitCallback: (days: number) => void;

    constructor(app: App, promptText: string) {
        super(app);
        this.promptText = promptText;
    }

    onOpen(): void {
        const { contentEl } = this;

        // 使用 Obsidian 的 Setting API 来创建输入框
        // 这样做的好处是样式与 Obsidian 设置界面一致
        new Setting(contentEl.createDiv())
            .setDesc(this.promptText) // 设置描述文本
            .addText((text) => {
                this.textComponent = text;
                text.setValue(String(this.days)) // 初始值为1
                    .onChange((value) => {
                        // 当输入变化时解析数字
                        const day = Number(value);
                        // 数据校验：必须是正数
                        if (day > 0) {
                            this.days = day;
                        }
                    });

                // 添加鼠标滚轮事件监听
                text.inputEl.addEventListener("wheel", (e: WheelEvent) => {
                    e.preventDefault(); // 阻止默认滚动行为

                    // 根据滚动方向增加或减少天数
                    // deltaY > 0 表示向下滚动（增加）
                    // deltaY < 0 表示向上滚动（减少）
                    if (e.deltaY > 0) {
                        this.days += 1;
                    } else if (e.deltaY < 0) {
                        this.days = Math.max(1, this.days - 1); // 最小值为1
                    }

                    // 更新输入框显示
                    text.setValue(String(this.days));
                });
            });

        // 按钮容器
        const buttonDiv = contentEl.createDiv("srs-flex-row");

        // --- Do it 按钮 ---
        new ButtonComponent(buttonDiv)
            .setButtonText("Do it")
            .onClick(() => {
                if (this.days > 0) {
                    this.submitCallback(this.days); // 提交
                    this.close();
                }
            })
            .setCta(); // 高亮样式

        // --- Cancel 按钮 ---
        new ButtonComponent(buttonDiv).setButtonText("Cancel").onClick(() => {
            this.close();
        });
    }
}
