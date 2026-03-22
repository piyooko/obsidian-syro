import { Modal, App, Platform } from "obsidian";
 
import h from "vhtml";
// 寮曞叆 Chart.js 鐩稿叧缁勪欢銆侰hart.js 鏄竴涓潪甯告祦琛岀殑 JS 鍥捐〃搴撱€?
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

// 娉ㄥ唽 Chart.js 缁勪欢銆?
// Chart.js 閲囩敤鎸夐渶娉ㄥ唽鏈哄埗锛屼互鍑忓皬浣撶Н锛圱ree Shaking锛夈€?
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
 * StatsModal 绫?
 *
 * 杩欐槸涓€涓樉绀烘彃浠剁粺璁′俊鎭殑妯℃€佹銆?
 * 瀹冨寘鍚涓浘琛紝濡備粖鏃ュ涔犮€侀娴嬨€侀棿闅斿垎甯冪瓑銆?
 */
export class StatsModal extends Modal {
    private plugin: SRPlugin;

    constructor(app: App, plugin: SRPlugin) {
        super(app);

        this.plugin = plugin;

        // 璁剧疆鏍囬
        this.titleEl.setText(`${t("STATS_TITLE")} `);
        this.titleEl.addClass("sr-centered");

        // 鍦ㄦ爣棰樻爮娣诲姞涓や釜涓嬫媺閫夋嫨妗嗭細
        // 1. 绫诲瀷閫夋嫨锛堝崱鐗?Flashcards / 绗旇 Notes锛?
        // 2. 鏃堕棿鑼冨洿閫夋嫨锛堟湀 / 瀛ｅ害 / 骞?/ 鍏ㄩ儴锛?
        // 杩欓噷浣跨敤浜?JSX 璇硶 (h 鍑芥暟)
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

        // 璁剧疆妯℃€佹澶у皬鍏呮弧浜?
        this.modalEl.addClass("syro-stats-modal");

        if (Platform.isMobile) {
            this.contentEl.addClass("syro-stats-content-mobile");
        }
    }

    /**
     * 鎵撳紑鏃剁殑閫昏緫
     * 杩欓噷璐熻矗鍒涘缓 Canvas 鍏冪礌骞跺垵濮嬪寲鍥捐〃
     */
    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass("syro-stats-content");

        // 鍒涘缓鍥捐〃瀹瑰櫒 Canvas 鍏冪礌
        // 渚濇鏄細浠婃棩缁熻銆佹湭鏉ラ娴嬨€侀棿闅斿垎甯冦€丒ase鍒嗗竷銆佸崱鐗囩被鍨嬮ゼ鍥?
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

        // 缁戝畾绫诲瀷閫夋嫨涓嬫媺妗嗙殑浜嬩欢
        const chartTypeEl = document.getElementById("sr-chart-type") as HTMLSelectElement;
        chartTypeEl.addEventListener("change", () => {
            const chartType = chartTypeEl.value;
            // 鏍规嵁閫夋嫨鍒囨崲鏄剧ず Note 缁熻杩樻槸 Card 缁熻
            if (String(chartType) === String(RPITEMTYPE.NOTE)) {
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

        // 鍒濆棣栨娓叉煋
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
     * 鏍稿績鏂规硶锛氱敓鎴愭墍鏈夊浘琛?
     *
     * @param rc 澶嶄範璁℃暟鏁版嵁 (ReviewedCounts)
     * @param cardStats 鍗＄墖缁熻鏁版嵁瀵硅薄
     * @param totalCardsCount 鎬诲崱鐗囨暟
     */
    private createCharts(rc: ReviewedCounts, cardStats: Stats, totalCardsCount: number) {
        // --- 1. 浠婃棩澶嶄範鎯呭喌鏌辩姸鍥?---
        const now = window.moment(Date.now());
        const todayDate: string = now.format("YYYY-MM-DD");
        // 濡傛灉浠婂ぉ杩樻病鏁版嵁锛屽垵濮嬪寲涓虹┖
        if (!(todayDate in rc)) {
            rc[todayDate] = { due: 0, new: 0 };
        }
        const rdueCnt = rc[todayDate].due,
            rnewCnt = rc[todayDate].new;

        const totalreviewedCount = rdueCnt + rnewCnt;

        // 璋冪敤灏佽濂界殑 createStatsChart 鍑芥暟缁樺埗
        createStatsChart(
            "bar", // 绫诲瀷锛氭煴鐘跺浘
            "todayReviewedChart", // Canvas ID
            t("REVIEWED_TODAY"), // 鏍囬
            t("REVIEWED_TODAY_DESC"), // 鍓爣棰?
            [`${t("NEW_LEARNED")} - ${rnewCnt}`, `${t("DUE_REVIEWED")} - ${rdueCnt}`], // 鏍囩
            [rnewCnt, rdueCnt], // 鏁版嵁
            t("REVIEWED_TODAY_SUMMARY", { totalreviewedCount }), // 鎽樿鏂囨湰
            t("COUNT"), // Y杞存爣棰?
            "", // X杞存爣棰?
            t("NUMBER_OF_CARDS"), // Series 鏍囬
        );

        // --- 2. 鏈潵澶嶄範棰勬祴鍥?(Forecast) ---
        let maxN: number = cardStats.delayedDays.getMaxValue();
        // 琛ュ叏鍓嶉潰鐨勭┖缂烘棩鏈?
        for (let dueOffset = 0; dueOffset <= maxN; dueOffset++) {
            cardStats.delayedDays.clearCountIfMissing(dueOffset);
        }

        const dueDatesFlashcardsCopy: Record<string, number> = {};
        const todayStr = t("TODAY");
        dueDatesFlashcardsCopy[todayStr] = 0;

        // 杞崲鏁版嵁鏍煎紡锛氱浉瀵瑰ぉ鏁?-> 缁濆鏃ユ湡瀛楃涓?
        for (const [dueOffset, dueCount] of getTypedObjectEntries(cardStats.delayedDays.dict)) {
            if (dueOffset <= 0) {
                // 杩囨湡鎴栦粖澶╃殑
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
            Object.keys(dueDatesFlashcardsCopy), // 鏃ユ湡浣滀负 X 杞?
            Object.values(dueDatesFlashcardsCopy), // 鏁伴噺浣滀负 Y 杞?
            t("REVIEWS_PER_DAY", { avg: (scheduledCount / maxN).toFixed(1) }),
            t("SCHEDULED"),
            t("DATE"),
            t("NUMBER_OF_CARDS"),
        );

        // --- 3. 闂撮殧鍒嗗竷鍥?(Intervals) ---
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

        // --- 4. 闅惧害/Ease 鍒嗗竷鍥?(Eases) ---
        const eases: number[] = getKeysPreserveType(cardStats.eases.dict);
        // 濉厖缂哄け鐨?ease 鍊硷紝淇濊瘉 X 杞磋繛缁?
        for (let ease = Math.min(...eases); ease <= Math.max(...eases); ease++) {
            cardStats.eases.clearCountIfMissing(ease);
        }
        const average_ease: number =
            Math.round(cardStats.eases.getTotalOfValueMultiplyCount() / scheduledCount) || 0;

        const esaeStr: string[] = [];
        const currentAlgorithm = String(this.plugin.data.settings.algorithm);
        getKeysPreserveType(cardStats.eases.dict).forEach((value: number) => {
            if (currentAlgorithm === String(algorithmNames.Fsrs)) {
                esaeStr.push(`${State[value]} `); // FSRS 绠楁硶鏄剧ず鐘舵€佸悕
            } else {
                esaeStr.push(`${value} `); // 榛樿绠楁硶鏄剧ず鏁板瓧
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

        // --- 5. 鍗＄墖绫诲瀷楗煎浘 (Card Types: New/Young/Mature) ---
        createStatsChart(
            "pie", // 楗煎浘
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
 * 灏佽鐨勫浘琛ㄥ垱寤哄嚱鏁?
 *
 * 绠€鍖?Chart.js 鐨勮皟鐢ㄩ厤缃紝缁熶竴椋庢牸銆?
 */
function createStatsChart(
    type: keyof ChartTypeRegistry, // 鍥捐〃绫诲瀷 ('bar', 'pie' 绛?
    canvasId: string, // 瀵瑰簲鐨?DOM ID
    title: string, // 鏍囬
    subtitle: string, // 鍓爣棰?
    labels: string[], // X 杞存爣绛炬暟缁?
    data: number[], // Y 杞存暟鎹暟缁?
    summary: string, // 搴曢儴鎽樿鏂囨湰
    seriesTitle = "",
    xAxisTitle = "",
    yAxisTitle = "",
) {
    // 鑾峰彇褰撳墠涓婚鐨勬枃鏈鑹?
    const style = getComputedStyle(document.body);
    const textColor = style.getPropertyValue("--text-normal");

    let scales = {},
        backgroundColor = ["#2196f3"]; // 榛樿鏌卞瓙棰滆壊 (钃濊壊)

    // 闈為ゼ鍥鹃渶瑕侀厤缃潗鏍囪酱
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
        // 楗煎浘浣跨敤澶氳壊
        backgroundColor = ["#2196f3", "#4caf50", "green"]; // 瀵瑰簲 New, Young, Mature
    }

    // 鏌愪簺鍥捐〃锛團orecast, Intervals锛夋敮鎸佹椂闂寸瓫閫夛紙鏈?瀛ｅ害/骞达級
    const shouldFilter = canvasId === "forecastChart" || canvasId === "intervalsChart";

    // 閿€姣佹棫鍥捐〃瀹炰緥锛堝鏋滃瓨鍦級锛岄槻姝㈤噸缁樻椂閲嶅彔鎴栨姤閿?
    const statsE1 = document.getElementById(canvasId) as HTMLCanvasElement;
    const existingChart = Chart.getChart(statsE1);
    if (existingChart) {
        existingChart.unbindEvents();
        existingChart.destroy();
    }

    // 鍒涘缓鏂板浘琛?
    const statsChart = new Chart(document.getElementById(canvasId) as HTMLCanvasElement, {
        type,
        data: {
            // 濡傛灉闇€瑕佽繃婊わ紝鍒濆鍙樉绀哄墠 31 澶?(鏈堣鍥?
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
                    display: false, // 榛樿闅愯棌鍥句緥
                },
            },
            aspectRatio: 2, // 瀹介珮姣?
        },
    });

    // 涓烘敮鎸佽繃婊ょ殑鍥捐〃缁戝畾 Period Select 鍙樻洿浜嬩欢
    if (shouldFilter) {
        const chartPeriodEl = document.getElementById("sr-chart-period") as HTMLSelectElement;

        // 姣忔鍙樻洿閫夋嫨锛岃皟鐢ㄥ洖璋冩洿鏂板浘琛ㄦ暟鎹?
        chartPeriodEl.addEventListener("change", () => {
            if (statsChart.canvas != null) {
                chartPeriodCallBack(chartPeriodEl);
            }
        });
        // 鍒濆鍖栬皟鐢ㄤ竴娆?
        chartPeriodCallBack(chartPeriodEl);
    }

    document.getElementById(`${canvasId}Summary`).innerText = summary;

    /**
     * 鍐呴儴鍑芥暟锛氬鐞嗘椂闂磋寖鍥寸瓫閫夐€昏緫
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

        // 鏇存柊 Chart.js 鏁版嵁婧愬苟瑙﹀彂鏇存柊
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
