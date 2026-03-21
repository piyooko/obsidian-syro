/**
 * 这个文件主要是干什么的：
 * [算法层] 加权乘数算法 (Weighted Multiplier)。
 * 这是一个自定义算法，允许用户通过设置重要性权重来影响复习间隔。支持“延迟继承”特性，适合渐进阅读场景。
 *
 * 它在项目中属于：算法层 (Algorithms) / 实现 (Implementation)
 *
 * 它会用到哪些文件：
 * 1. src/algorithms/algorithms.ts
 *
 * 哪些文件会用到它：
 * 1. src/algorithms/algorithms_switch.ts
 */
/**
 * [算法层：负责计算下一次复习的时间、间隔和难度] [核心] 另一种加权乘数算法实现。
 */
import { Setting, Notice } from "obsidian";
import { DateUtils, MiscUtils } from "src/util/utils_recall";
import { SrsAlgorithm, algorithmNames } from "./algorithms";
import deepcopy from "deepcopy";
import { RepetitionItem, ReviewResult } from "src/dataStore/repetitionItem";
import { t } from "src/lang/helpers";

/**
 * WMSData - 加权乘数算法的数据结构
 * 存储每个复习项的算法特定数据
 */
export interface WMSData {
    currentInterval: number; // 当前间隔（天数），用于间隔继承
}

/**
 * WMSSettings - 加权乘数算法的设置接口
 * 配置重要性映射范围
 */
export interface WMSSettings {
    baseEase: number; // ✅ 用于LinkRank的ease计算
    impMin: number; // 最重要（重要性1）对应的乘数
    impMax: number; // 最不重要（重要性10）对应的乘数
}

const WMSOptions: string[] = ["Again", "Hard", "Good", "Easy"];

/**
 * WeightedMultiplierAlgorithm - 加权乘数调度算法
 *
 * 核心特性：
 * 1. 重要性线性变换：将1-10的重要性映射为乘数因子
 * 2. 逻辑分离：Hard/Again不应用重要性乘数，确保逻辑一致性
 * 3. 间隔继承：手动推迟时更新当前间隔，算法基于新间隔计算
 *
 * 公式：
 * - Again: I_next = 1
 * - Hard: I_next = Round(I_current × 0.7)
 * - Good/Easy: I_next = Round(I_current × M_grade × F_importance)
 */
export class WeightedMultiplierAlgorithm extends SrsAlgorithm {
    settings: WMSSettings;

    /**
     * 返回默认设置
     */
    defaultSettings(): WMSSettings {
        return {
            baseEase: 250, // ✅ 添加baseEase用于LinkRank计算
            impMin: 1.0, // 重要性1（最重要）对应乘数1.0
            impMax: 2.5,
        };
    }

    /**
     * 返回默认数据结构
     */
    defaultData(): WMSData {
        return {
            currentInterval: 1, // 初始间隔1天
        };
    }

    /**
     * 返回复习选项
     */
    srsOptions(): string[] {
        return WMSOptions;
    }

    /**
     * 计算所有选项的间隔预览
     * @param item 复习项
     * @returns 四个选项对应的间隔天数数组
     */
    calcAllOptsIntervals(item: RepetitionItem): number[] {
        const intvls: number[] = [];

        // 获取原始数据的currentInterval（用于预览计算）
        const originalData = item.data as WMSData;
        const currentInterval =
            originalData && typeof originalData.currentInterval === "number"
                ? originalData.currentInterval
                : 1.0; // 默认1天

        this.srsOptions().forEach((opt) => {
            const itemCopy: RepetitionItem = deepcopy(item);
            // 确保deepcopy后的data有正确的currentInterval
            if (!itemCopy.data) {
                itemCopy.data = this.defaultData();
            }
            (itemCopy.data as WMSData).currentInterval = currentInterval;

            const result = this.onSelection(itemCopy, opt, false);
            const intvl = Math.round((result.nextReview / DateUtils.DAYS_TO_MILLIS) * 100) / 100;
            intvls.push(intvl);
        });
        return intvls;
    }

    /**
     * 核心方法：根据用户评分计算下次复习间隔
     * @param item 复习项
     * @param optionStr 用户选择的选项 ("Again", "Hard", "Good", "Easy")
     * @param repeat 是否为重复复习
     * @returns ReviewResult 包含是否正确和下次复习时间
     */
    onSelection(item: RepetitionItem, optionStr: string, repeat: boolean): ReviewResult {
        const data: WMSData = item.data as WMSData;
        const response = WMSOptions.indexOf(optionStr);
        const priority = item.priority ?? 5; // 默认重要性为5

        let correct = true;
        let nextInterval = 0; // 下次间隔（天数）

        // repeat 模式直接返回
        if (repeat) {
            if (response === 0) {
                correct = false;
            }
            return {
                correct,
                nextReview: -1,
            };
        }

        // 获取当前间隔（防守性编程：确保有默认值）
        // 如果data.currentInterval不存在，尝试继承item.interval，否则默认1天
        const currentInterval =
            data && typeof data.currentInterval === "number"
                ? data.currentInterval
                : item.interval > 0
                  ? item.interval
                  : 1.0;

        // 1. Again (重来)：强制重置为1天
        if (response === 0) {
            nextInterval = 1;
            correct = false;
        }
        // 2. Hard (较难)：逻辑分离，不应用重要性乘数
        //    固定缩减至70%，确保"难"永远意味着缩短间隔
        else if (response === 1) {
            nextInterval = currentInterval * 0.7;
        }
        // 3. Good (记得) 或 Easy (简单)：应用重要性乘数
        else if (response === 2 || response === 3) {
            // 评分乘数
            const gradeMultiplier = response === 2 ? 1.3 : 2.0;

            // 计算重要性因子 F_importance
            // 公式: F_imp = impMin + (priority - 1) × (impMax - impMin) / 9
            const slope = (this.settings.impMax - this.settings.impMin) / 9.0;
            const importanceFactor = this.settings.impMin + (priority - 1) * slope;

            // 应用公式: I_next = I_current × M_grade × F_importance
            nextInterval = currentInterval * gradeMultiplier * importanceFactor;
        }

        // 边界处理：至少1天，四舍五入
        nextInterval = Math.max(1, Math.round(nextInterval));

        // 更新数据
        data.currentInterval = nextInterval;

        return {
            correct,
            nextReview: nextInterval * DateUtils.DAYS_TO_MILLIS,
        };
    }

    /**
     * 数据导入器：从其他算法迁移数据
     * @param fromAlgo 源算法名称
     * @param items 需要迁移的复习项列表
     */
    importer(fromAlgo: algorithmNames, items: RepetitionItem[]): void {
        items.forEach((item) => {
            if (item != null && item.data != null) {
                const oldInterval = item.interval || 1; // 尝试获取旧间隔
                const newData = this.defaultData();
                newData.currentInterval = Math.max(1, oldInterval);
                item.data = newData;
            }
        });
    }

    /**
     * 显示设置界面
     * @param containerEl 容器HTML元素
     * @param update 更新回调函数
     */
    displaySettings(
        containerEl: HTMLElement,
        update: (settings: WMSSettings, refresh?: boolean) => void,
    ): void {
        containerEl.createDiv().innerHTML = `<p><strong>加权乘数算法 (Weighted Multiplier Scheduler)</strong></p>
            <p>专为渐进阅读设计的调度算法，通过重要性权重和间隔继承机制提供灵活的复习节奏。</p>
            <p><strong>核心特性：</strong></p>
            <ul>
                <li><strong>逻辑分离</strong>：Hard/Again 不应用重要性乘数，确保"较难"永远缩短间隔</li>
                <li><strong>间隔继承</strong>：手动推迟时更新当前间隔，算法基于新间隔计算</li>
                <li><strong>重要性映射</strong>：1=最重要(复习频繁), 10=最不重要(快速推远)</li>
            </ul>`;

        new Setting(containerEl)
            .setName("最小乘数 (重要性1)")
            .setDesc("重要性为1（最重要）时对应的乘数因子")
            .addText((text) =>
                text
                    .setPlaceholder("1.0")
                    .setValue(this.settings.impMin.toString())
                    .onChange((newValue) => {
                        const value = Number(newValue);
                        if (isNaN(value) || value < 0.1 || value > 5.0) {
                            new Notice("请输入0.1到5.0之间的数值");
                            return;
                        }
                        this.settings.impMin = value;
                        update(this.settings);
                    }),
            );

        new Setting(containerEl)
            .setName("最大乘数 (重要性10)")
            .setDesc("重要性为10（最不重要）时对应的乘数因子")
            .addText((text) =>
                text
                    .setPlaceholder("2.0")
                    .setValue(this.settings.impMax.toString())
                    .onChange((newValue) => {
                        const value = Number(newValue);
                        if (isNaN(value) || value < 0.1 || value > 10.0) {
                            new Notice("请输入0.1到10.0之间的数值");
                            return;
                        }
                        if (value < this.settings.impMin) {
                            new Notice("最大乘数必须大于等于最小乘数");
                            return;
                        }
                        this.settings.impMax = value;
                        update(this.settings);
                    }),
            );

        // 添加公式说明
        containerEl.createDiv().innerHTML = `<p style="margin-top: 1em; padding: 0.5em; background: var(--background-secondary); border-radius: 4px;">
                <strong>公式说明：</strong><br/>
                • Again: I_next = 1 天<br/>
                • Hard: I_next = Round(I_current × 0.7)<br/>
                • Good: I_next = Round(I_current × 1.3 × F_importance)<br/>
                • Easy: I_next = Round(I_current × 2.0 × F_importance)<br/>
                <br/>
                其中 F_importance = impMin + (priority - 1) × (impMax - impMin) / 9
            </p>`;
    }
}
