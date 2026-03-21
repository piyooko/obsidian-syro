import { Modal, App, Platform } from "obsidian";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import h from "vhtml";
// 引入 Chart.js 相关组件。Chart.js 是一个非常流行的 JS 图表库。
import {
    Chart,
    BarElement,
    BarController,
    Legend,
    Title,
    Tooltip,
    SubTitle,
    ChartTypeRegistry,
    CategoryScale,
    LinearScale,
    PieController,
    ArcElement,
} from "chart.js";

import type SRPlugin from "src/main";
import { getKeysPreserveType, getTypedObjectEntries } from "src/util/utils";
import { textInterval } from "src/scheduling";
import { t } from "src/lang/helpers";
import { ReviewedCounts } from "src/dataStore/data";
import { State } from "ts-fsrs";
import { algorithmNames } from "src/algorithms/algorithms";
import { Stats } from "src/stats";
import { CardListType } from "src/Deck";
import { RPITEMTYPE } from "src/dataStore/repetitionItem";

// 注册 Chart.js 组件。
// Chart.js 采用按需注册机制，以减小体积（Tree Shaking）。
Chart.register(
    BarElement,
    BarController,
    Legend,
    Title,
    Tooltip,
    SubTitle,
    CategoryScale,
    LinearScale,
    PieController,
    ArcElement,
);

/**
 * StatsModal 类
 *
 * 这是一个显示插件统计信息的模态框。
 * 它包含多个图表，如今日复习、预测、间隔分布等。
 */
export class StatsModal extends Modal {
    private plugin: SRPlugin;

    constructor(app: App, plugin: SRPlugin) {
        super(app);

        this.plugin = plugin;

        // 设置标题
        this.titleEl.setText(`${t("STATS_TITLE")} `);
        this.titleEl.addClass("sr-centered");

        // 在标题栏添加两个下拉选择框：
        // 1. 类型选择（卡片 Flashcards / 笔记 Notes）
        // 2. 时间范围选择（月 / 季度 / 年 / 全部）
        // 这里使用了 JSX 语法 (h 函数)
        this.titleEl.innerHTML += (
            <div>
                <select id="sr-chart-type">
                    <option value={RPITEMTYPE.CARD} selected>
                        {t("FLASHCARDS")}
                    </option>
                    <option value={RPITEMTYPE.NOTE}>{t("NOTES")}</option>
                </select>
                <select id="sr-chart-period">
                    <option value="month" selected>
                        {t("MONTH")}
                    </option>
                    <option value="quarter">{t("QUARTER")}</option>
                    <option value="year">{t("YEAR")}</option>
                    <option value="lifetime">{t("LIFETIME")}</option>
                </select>
            </div>
        );

        // 设置模态框大小充满了
        this.modalEl.style.height = "100%";
        this.modalEl.style.width = "100%";

        if (Platform.isMobile) {
            this.contentEl.style.display = "block";
        }
    }

    /**
     * 打开时的逻辑
     * 这里负责创建 Canvas 元素并初始化图表
     */
    onOpen(): void {
        const { contentEl } = this;
        contentEl.style.textAlign = "center";

        // 创建图表容器 Canvas 元素
        // 依次是：今日统计、未来预测、间隔分布、Ease分布、卡片类型饼图
        contentEl.innerHTML += (
            <div>
                <canvas id="todayReviewedChart"></canvas>
                <span id="todayReviewedChartSummary"></span>
                <br />
                <br />
                <canvas id="forecastChart"></canvas>
                <span id="forecastChartSummary"></span>
                <br />
                <br />
                <canvas id="intervalsChart"></canvas>
                <span id="intervalsChartSummary"></span>
                <br />
                <br />
                <canvas id="easesChart"></canvas>
                <span id="easesChartSummary"></span>
                <br />
                <br />
                <canvas id="cardTypesChart"></canvas>
                <br />
                <span id="cardTypesChartSummary"></span>
            </div>
        );

        // 绑定类型选择下拉框的事件
        const chartTypeEl = document.getElementById("sr-chart-type") as HTMLSelectElement;
        chartTypeEl.addEventListener("change", () => {
            const chartType = chartTypeEl.value;
            // 根据选择切换显示 Note 统计还是 Card 统计
            if (chartType === RPITEMTYPE.NOTE) {
                this.createCharts(
                    this.plugin.store.getReviewedCounts(),
                    this.plugin.noteStats,
                    this.plugin.noteStats.getTotalCount(CardListType.All),
                );
                return;
            } else {
                this.createCharts(
                    this.plugin.store.getReviewedCardCounts(),
                    this.plugin.cardStats,
                    this.plugin.deckTree.getCardCount(CardListType.All, true),
                );
                return;
            }
        });

        // 初始首次渲染
        this.createCharts(
            this.plugin.store.getReviewedCardCounts(),
            this.plugin.cardStats,
            this.plugin.deckTree.getCardCount(CardListType.All, true),
        );
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    /**
     * 核心方法：生成所有图表
     *
     * @param rc 复习计数数据 (ReviewedCounts)
     * @param cardStats 卡片统计数据对象
     * @param totalCardsCount 总卡片数
     */
    private createCharts(rc: ReviewedCounts, cardStats: Stats, totalCardsCount: number) {
        // --- 1. 今日复习情况柱状图 ---
        const now = window.moment(Date.now());
        const todayDate: string = now.format("YYYY-MM-DD");
        // 如果今天还没数据，初始化为空
        if (!(todayDate in rc)) {
            rc[todayDate] = { due: 0, new: 0 };
        }
        const rdueCnt = rc[todayDate].due,
            rnewCnt = rc[todayDate].new;

        const totalreviewedCount = rdueCnt + rnewCnt;

        // 调用封装好的 createStatsChart 函数绘制
        createStatsChart(
            "bar", // 类型：柱状图
            "todayReviewedChart", // Canvas ID
            t("REVIEWED_TODAY"), // 标题
            t("REVIEWED_TODAY_DESC"), // 副标题
            [`${t("NEW_LEARNED")} - ${rnewCnt}`, `${t("DUE_REVIEWED")} - ${rdueCnt}`], // 标签
            [rnewCnt, rdueCnt], // 数据
            t("REVIEWED_TODAY_SUMMARY", { totalreviewedCount }), // 摘要文本
            t("COUNT"), // Y轴标题
            "", // X轴标题
            t("NUMBER_OF_CARDS"), // Series 标题
        );

        // --- 2. 未来复习预测图 (Forecast) ---
        let maxN: number = cardStats.delayedDays.getMaxValue();
        // 补全前面的空缺日期
        for (let dueOffset = 0; dueOffset <= maxN; dueOffset++) {
            cardStats.delayedDays.clearCountIfMissing(dueOffset);
        }

        const dueDatesFlashcardsCopy: Record<string, number> = {};
        const todayStr = t("TODAY");
        dueDatesFlashcardsCopy[todayStr] = 0;

        // 转换数据格式：相对天数 -> 绝对日期字符串
        for (const [dueOffset, dueCount] of getTypedObjectEntries(cardStats.delayedDays.dict)) {
            if (dueOffset <= 0) {
                // 过期或今天的
                dueDatesFlashcardsCopy[todayStr] += dueCount;
            } else {
                const due = now.clone().add(dueOffset, "days");
                const dateStr = due.format("YYYY-MM-DD");
                dueDatesFlashcardsCopy[dateStr] = dueCount;
            }
        }

        const scheduledCount: number = cardStats.youngCount + cardStats.matureCount;
        maxN = Math.max(maxN, 1);

        createStatsChart(
            "bar",
            "forecastChart",
            t("FORECAST"),
            t("FORECAST_DESC"),
            Object.keys(dueDatesFlashcardsCopy), // 日期作为 X 轴
            Object.values(dueDatesFlashcardsCopy), // 数量作为 Y 轴
            t("REVIEWS_PER_DAY", { avg: (scheduledCount / maxN).toFixed(1) }),
            t("SCHEDULED"),
            t("DATE"),
            t("NUMBER_OF_CARDS"),
        );

        // --- 3. 间隔分布图 (Intervals) ---
        maxN = cardStats.intervals.getMaxValue();
        for (let interval = 0; interval <= maxN; interval++) {
            cardStats.intervals.clearCountIfMissing(interval);
        }

        const average_interval: string = textInterval(
                Math.round(
                    (cardStats.intervals.getTotalOfValueMultiplyCount() / scheduledCount) * 10,
                ) / 10 || 0,
                false,
            ),
            longest_interval: string = textInterval(cardStats.intervals.getMaxValue(), false);

        createStatsChart(
            "bar",
            "intervalsChart",
            t("INTERVALS"),
            t("INTERVALS_DESC"),
            Object.keys(cardStats.intervals.dict),
            Object.values(cardStats.intervals.dict),
            t("INTERVALS_SUMMARY", { avg: average_interval, longest: longest_interval }),
            t("COUNT"),
            t("DAYS"),
            t("NUMBER_OF_CARDS"),
        );

        // --- 4. 难度/Ease 分布图 (Eases) ---
        const eases: number[] = getKeysPreserveType(cardStats.eases.dict);
        // 填充缺失的 ease 值，保证 X 轴连续
        for (let ease = Math.min(...eases); ease <= Math.max(...eases); ease++) {
            cardStats.eases.clearCountIfMissing(ease);
        }
        const average_ease: number =
            Math.round(cardStats.eases.getTotalOfValueMultiplyCount() / scheduledCount) || 0;

        const esaeStr: string[] = [];
        getKeysPreserveType(cardStats.eases.dict).forEach((value: number) => {
            if (this.plugin.data.settings.algorithm === algorithmNames.Fsrs) {
                esaeStr.push(`${State[value]} `); // FSRS 算法显示状态名
            } else {
                esaeStr.push(`${value} `); // 默认算法显示数字
            }
        });

        createStatsChart(
            "bar",
            "easesChart",
            t("EASES"),
            "",
            esaeStr,
            Object.values(cardStats.eases.dict),
            t("EASES_SUMMARY", { avgEase: average_ease }),
            t("COUNT"),
            t("EASES"),
            t("NUMBER_OF_CARDS"),
        );

        // --- 5. 卡片类型饼图 (Card Types: New/Young/Mature) ---
        createStatsChart(
            "pie", // 饼图
            "cardTypesChart",
            t("CARD_TYPES"),
            t("CARD_TYPES_DESC"),
            [
                `${t("CARD_TYPE_NEW")} - ${Math.round(
                    (cardStats.newCount / totalCardsCount) * 100,
                )}%`,
                `${t("CARD_TYPE_YOUNG")} - ${Math.round(
                    (cardStats.youngCount / totalCardsCount) * 100,
                )}%`,
                `${t("CARD_TYPE_MATURE")} - ${Math.round(
                    (cardStats.matureCount / totalCardsCount) * 100,
                )}%`,
            ],
            [cardStats.newCount, cardStats.youngCount, cardStats.matureCount],
            t("CARD_TYPES_SUMMARY", { totalCardsCount }),
        );
    }
}

/**
 * 封装的图表创建函数
 *
 * 简化 Chart.js 的调用配置，统一风格。
 */
function createStatsChart(
    type: keyof ChartTypeRegistry, // 图表类型 ('bar', 'pie' 等)
    canvasId: string, // 对应的 DOM ID
    title: string, // 标题
    subtitle: string, // 副标题
    labels: string[], // X 轴标签数组
    data: number[], // Y 轴数据数组
    summary: string, // 底部摘要文本
    seriesTitle = "",
    xAxisTitle = "",
    yAxisTitle = "",
) {
    // 获取当前主题的文本颜色
    const style = getComputedStyle(document.body);
    const textColor = style.getPropertyValue("--text-normal");

    let scales = {},
        backgroundColor = ["#2196f3"]; // 默认柱子颜色 (蓝色)

    // 非饼图需要配置坐标轴
    if (type !== "pie") {
        scales = {
            x: {
                title: {
                    display: true,
                    text: xAxisTitle,
                    color: textColor,
                },
            },
            y: {
                title: {
                    display: true,
                    text: yAxisTitle,
                    color: textColor,
                },
            },
        };
    } else {
        // 饼图使用多色
        backgroundColor = ["#2196f3", "#4caf50", "green"]; // 对应 New, Young, Mature
    }

    // 某些图表（Forecast, Intervals）支持时间筛选（月/季度/年）
    const shouldFilter = canvasId === "forecastChart" || canvasId === "intervalsChart";

    // 销毁旧图表实例（如果存在），防止重绘时重叠或报错
    const statsE1 = document.getElementById(canvasId) as HTMLCanvasElement;
    const existingChart = Chart.getChart(statsE1);
    if (existingChart) {
        existingChart.unbindEvents();
        existingChart.destroy();
    }

    // 创建新图表
    const statsChart = new Chart(document.getElementById(canvasId) as HTMLCanvasElement, {
        type,
        data: {
            // 如果需要过滤，初始只显示前 31 天 (月视图)
            labels: shouldFilter ? labels.slice(0, 31) : labels,
            datasets: [
                {
                    label: seriesTitle,
                    backgroundColor,
                    data: shouldFilter ? data.slice(0, 31) : data,
                },
            ],
        },
        options: {
            scales,
            plugins: {
                title: {
                    display: true,
                    text: title,
                    font: {
                        size: 22,
                    },
                    color: textColor,
                },
                subtitle: {
                    display: true,
                    text: subtitle,
                    font: {
                        size: 16,
                        style: "italic",
                    },
                    color: textColor,
                },
                legend: {
                    display: false, // 默认隐藏图例
                },
            },
            aspectRatio: 2, // 宽高比
        },
    });

    // 为支持过滤的图表绑定 Period Select 变更事件
    if (shouldFilter) {
        const chartPeriodEl = document.getElementById("sr-chart-period") as HTMLSelectElement;

        // 每次变更选择，调用回调更新图表数据
        chartPeriodEl.addEventListener("change", () => {
            if (statsChart.canvas != null) {
                chartPeriodCallBack(chartPeriodEl);
            }
        });
        // 初始化调用一次
        chartPeriodCallBack(chartPeriodEl);
    }

    document.getElementById(`${canvasId}Summary`).innerText = summary;

    /**
     * 内部函数：处理时间范围筛选逻辑
     */
    function chartPeriodCallBack(chartPeriodEl: HTMLSelectElement) {
        let filteredLabels, filteredData;
        const chartPeriod = chartPeriodEl.value;
        if (chartPeriod === "month") {
            filteredLabels = labels.slice(0, 31);
            filteredData = data.slice(0, 31);
        } else if (chartPeriod === "quarter") {
            filteredLabels = labels.slice(0, 91);
            filteredData = data.slice(0, 91);
        } else if (chartPeriod === "year") {
            filteredLabels = labels.slice(0, 366);
            filteredData = data.slice(0, 366);
        } else {
            filteredLabels = labels;
            filteredData = data;
        }

        // 更新 Chart.js 数据源并触发更新
        statsChart.data.labels = filteredLabels;
        statsChart.data.datasets[0] = {
            label: seriesTitle,
            backgroundColor,
            data: filteredData,
        };
        statsChart.update();
    }

    document.getElementById(`${canvasId}Summary`).innerText = summary;
}
