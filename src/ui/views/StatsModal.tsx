import { Modal, App, Platform } from "obsidian";

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
import { Stats } from "src/stats";
import { CardListType } from "src/Deck";
import { RPITEMTYPE } from "src/dataStore/repetitionItem";

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

export class StatsModal extends Modal {
    private plugin: SRPlugin;

    constructor(app: App, plugin: SRPlugin) {
        super(app);

        this.plugin = plugin;

        this.titleEl.setText(`${t("STATS_TITLE")} `);
        this.titleEl.addClass("sr-centered");

        const controlsEl = this.titleEl.createDiv();
        const chartTypeSelect = controlsEl.createEl("select", {
            attr: { id: "sr-chart-type" },
        });
        this.createOption(chartTypeSelect, RPITEMTYPE.CARD, t("FLASHCARDS"), true);
        this.createOption(chartTypeSelect, RPITEMTYPE.NOTE, t("NOTES"));

        const chartPeriodSelect = controlsEl.createEl("select", {
            attr: { id: "sr-chart-period" },
        });
        this.createOption(chartPeriodSelect, "month", t("MONTH"), true);
        this.createOption(chartPeriodSelect, "quarter", t("QUARTER"));
        this.createOption(chartPeriodSelect, "year", t("YEAR"));
        this.createOption(chartPeriodSelect, "lifetime", t("LIFETIME"));

        this.modalEl.addClass("syro-stats-modal");

        if (Platform.isMobile) {
            this.contentEl.addClass("syro-stats-content-mobile");
        }
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass("syro-stats-content");

        const chartsEl = contentEl.createDiv();
        this.createChartSlot(chartsEl, "todayReviewedChart", "todayReviewedChartSummary", true);
        this.createChartSlot(chartsEl, "forecastChart", "forecastChartSummary", true);
        this.createChartSlot(chartsEl, "intervalsChart", "intervalsChartSummary", true);
        this.createChartSlot(chartsEl, "easesChart", "easesChartSummary", true);
        this.createChartSlot(chartsEl, "cardTypesChart", "cardTypesChartSummary", false);

        const chartTypeEl = document.getElementById("sr-chart-type") as HTMLSelectElement;
        chartTypeEl.addEventListener("change", () => {
            const chartType = chartTypeEl.value;
            if (String(chartType) === String(RPITEMTYPE.NOTE)) {
                this.createCharts(
                    this.plugin.store.getReviewedCounts(),
                    this.plugin.noteStats,
                    this.plugin.noteStats.getTotalCount(CardListType.All),
                    RPITEMTYPE.NOTE,
                );
                return;
            } else {
                this.createCharts(
                    this.plugin.store.getReviewedCardCounts(),
                    this.plugin.cardStats,
                    this.plugin.deckTree.getCardCount(CardListType.All, true),
                    RPITEMTYPE.CARD,
                );
                return;
            }
        });

        this.createCharts(
            this.plugin.store.getReviewedCardCounts(),
            this.plugin.cardStats,
            this.plugin.deckTree.getCardCount(CardListType.All, true),
            RPITEMTYPE.CARD,
        );
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    private createOption(
        selectEl: HTMLSelectElement,
        value: string | number,
        label: string,
        selected = false,
    ) {
        const optionEl = selectEl.createEl("option", {
            text: label,
        });
        optionEl.value = String(value);
        optionEl.selected = selected;
    }

    private createChartSlot(
        containerEl: HTMLElement,
        canvasId: string,
        summaryId: string,
        includeDoubleBreak: boolean,
    ) {
        containerEl.createEl("canvas", {
            attr: { id: canvasId },
        });
        containerEl.createSpan({
            attr: { id: summaryId },
        });

        if (includeDoubleBreak) {
            containerEl.createEl("br");
            containerEl.createEl("br");
        } else {
            containerEl.createEl("br");
        }
    }

    private createCharts(
        rc: ReviewedCounts,
        cardStats: Stats,
        totalCardsCount: number,
        itemType: RPITEMTYPE,
    ) {
        const now = window.moment(Date.now());
        const todayDate: string = now.format("YYYY-MM-DD");
        if (!(todayDate in rc)) {
            rc[todayDate] = { due: 0, new: 0 };
        }
        const rdueCnt = rc[todayDate].due,
            rnewCnt = rc[todayDate].new;

        const totalreviewedCount = rdueCnt + rnewCnt;

        createStatsChart(
            "bar",
            "todayReviewedChart", // Canvas ID
            t("REVIEWED_TODAY"),
            t("REVIEWED_TODAY_DESC"),
            [`${t("NEW_LEARNED")} - ${rnewCnt}`, `${t("DUE_REVIEWED")} - ${rdueCnt}`],
            [rnewCnt, rdueCnt],
            t("REVIEWED_TODAY_SUMMARY", { totalreviewedCount }),
            t("COUNT"),
            "",
            t("NUMBER_OF_CARDS"),
        );

        let maxN: number = cardStats.delayedDays.getMaxValue();
        for (let dueOffset = 0; dueOffset <= maxN; dueOffset++) {
            cardStats.delayedDays.clearCountIfMissing(dueOffset);
        }

        const dueDatesFlashcardsCopy: Record<string, number> = {};
        const todayStr = t("TODAY");
        dueDatesFlashcardsCopy[todayStr] = 0;

        for (const [dueOffset, dueCount] of getTypedObjectEntries(cardStats.delayedDays.dict)) {
            if (dueOffset <= 0) {
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
            Object.keys(dueDatesFlashcardsCopy),
            Object.values(dueDatesFlashcardsCopy),
            t("REVIEWS_PER_DAY", { avg: (scheduledCount / maxN).toFixed(1) }),
            t("SCHEDULED"),
            t("DATE"),
            t("NUMBER_OF_CARDS"),
        );

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

        const eases: number[] = getKeysPreserveType(cardStats.eases.dict);
        for (let ease = Math.min(...eases); ease <= Math.max(...eases); ease++) {
            cardStats.eases.clearCountIfMissing(ease);
        }
        const average_ease: number =
            Math.round(cardStats.eases.getTotalOfValueMultiplyCount() / scheduledCount) || 0;

        const esaeStr: string[] = [];
        getKeysPreserveType(cardStats.eases.dict).forEach((value: number) => {
            if (itemType === RPITEMTYPE.CARD) {
                esaeStr.push(`${State[value]} `);
            } else {
                esaeStr.push(`${value} `);
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

        createStatsChart(
            "pie",
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

function createStatsChart(
    type: keyof ChartTypeRegistry,
    canvasId: string,
    title: string,
    subtitle: string,
    labels: string[],
    data: number[],
    summary: string,
    seriesTitle = "",
    xAxisTitle = "",
    yAxisTitle = "",
) {
    const style = getComputedStyle(document.body);
    const textColor = style.getPropertyValue("--text-normal");

    let scales = {},
        backgroundColor = ["#2196f3"];

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
        backgroundColor = ["#2196f3", "#4caf50", "green"];
    }

    const shouldFilter = canvasId === "forecastChart" || canvasId === "intervalsChart";

    const statsE1 = document.getElementById(canvasId) as HTMLCanvasElement;
    const existingChart = Chart.getChart(statsE1);
    if (existingChart) {
        existingChart.unbindEvents();
        existingChart.destroy();
    }

    const statsChart = new Chart(document.getElementById(canvasId) as HTMLCanvasElement, {
        type,
        data: {
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
                    display: false,
                },
            },
            aspectRatio: 2,
        },
    });

    if (shouldFilter) {
        const chartPeriodEl = document.getElementById("sr-chart-period") as HTMLSelectElement;

        chartPeriodEl.addEventListener("change", () => {
            if (statsChart.canvas != null) {
                chartPeriodCallBack(chartPeriodEl);
            }
        });
        chartPeriodCallBack(chartPeriodEl);
    }

    document.getElementById(`${canvasId}Summary`).innerText = summary;

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
