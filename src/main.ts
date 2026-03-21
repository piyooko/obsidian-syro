/**
 * 这个文件主要是干什么的：
 * 它是整个插件的“大管家”和第一入口。
 * 当插件被打开时，它是最先开始工作的，负责把其他所有的功能模块（比如保存数据、算法、显示各个界面、提供快捷指令）全部组装起来并让它们开始上班。
 * 每天关掉插件时，它也负责让大家统一下班休息。
 * 它还偷偷加了个功能：随时核对当前用户的身份，如果是免费用户用到高级快捷键（比如特殊的填空题制作键），它就会拦下来不让用。
 *
 * 它在项目中属于：逻辑层
 *
 * 它会用到哪些文件：
 * 这个大管家几乎会用到项目里的所有核心文件，比如：
 * 1. src/settings.ts — 获取用户的偏好设置
 * 2. src/dataStore/data.ts — 获取保存的复习数据
 * 3. src/ui/views/* — 负责调出各种显示界面
 * 4. src/services/LicenseManager.ts — 用来验证用户的激活码对不对，是不是高级会员
 *
 * 哪些文件会用到它：
 * 主要由笔记软件本身来呼叫它。
 * 同时，其他很多需要跟大管家要信息的地方也会找它。
 */
import {
    getAllTags,
    Notice,
    Plugin,
    TAbstractFile,
    TFile,
    setTooltip,
    WorkspaceLeaf,
} from "obsidian";
import * as graph from "pagerank.js";

import {
    DEFAULT_SETTINGS,
    SettingsUtil,
    SRSettings,
    SyncProgressDisplayMode,
    upgradeSettings,
} from "src/settings";
import { StatsModal } from "src/ui/views/StatsModal";
import {
    REACT_REVIEW_QUEUE_VIEW_TYPE as REVIEW_QUEUE_VIEW_TYPE,
    ReactNoteReviewView,
} from "src/ui/views/ReactNoteReviewView";
import { ReviewResponse, textInterval, FlashcardReviewMode } from "src/scheduling";
import { ReviewDeck, SchedNote } from "src/ReviewDeck";
import { t } from "src/lang/helpers";
import { appIcon } from "src/icons/appicon";
import { TopicPath } from "./TopicPath";
import { CardListType, Deck, DeckTreeFilter } from "./Deck";
import { Card } from "./Card";
import { Stats } from "./stats";
import { PriorityInputModal } from "./ui/modals/PriorityInputModal";
import {
    FlashcardReviewSequencer as FlashcardReviewSequencer,
    IFlashcardReviewSequencer as IFlashcardReviewSequencer,
} from "./FlashcardReviewSequencer";
import {
    CardOrder,
    DeckOrder,
    DeckTreeIterator,
    IDeckTreeIterator,
    IIteratorOrder,
} from "./DeckTreeIterator";
import { CardScheduleCalculator, NoteCardScheduleParser } from "./CardSchedule";
import { Note } from "./Note";
import { NoteFileLoader } from "./NoteFileLoader";
import { ISRFile, SrTFile as SrTFile } from "./SRFile";
import { DeckTreeStatsCalculator } from "./DeckTreeStatsCalculator";
import { NoteEaseList } from "./NoteEaseList";
import { QuestionPostponementList } from "./QuestionPostponementList";
import { TextDirection } from "./util/TextDirection";
import { convertToStringOrEmpty, isEqualOrSubPath } from "./util/utils";
import { setDebugParser } from "src/parser";

// Legacy migration note retained from the pre-Syro codebase.
import { DataStore } from "./dataStore/data";
import { DataLocation } from "./dataStore/dataLocation";
import { NoteReviewStore, NoteReviewSource } from "./dataStore/noteReviewStore";
import Commands from "./commands";
import { algorithmNames, SrsAlgorithm } from "src/algorithms/algorithms";

import { reviewResponseModal } from "src/ui/modals/reviewresponse-modal";
import { debug, isIgnoredPath, isVersionNewerThanOther } from "./util/utils_recall";
import { ReleaseNotes } from "src/ui/modals/ReleaseNotes";
import { DEFAULT_DECKNAME } from "./constants";

import { algorithms } from "src/algorithms/algorithms_switch";
import { addFileMenuEvt, registerTrackFileEvents } from "./Events/trackFileEvents";
import { SyncEvents } from "./Events/SyncEvents";
import { ItemTrans, itemToShedNote } from "./dataStore/itemTrans";
import { LinkRank } from "src/algorithms/priorities/linkPageranks";
import { Queue } from "./dataStore/queue";
import { ReviewDeckSelectionModal } from "./ui/modals/reviewDeckSelectionModal";
import { setDueDates } from "./algorithms/balance/balance";
import { RepetitionItem, RPITEMTYPE } from "./dataStore/repetitionItem";
import { IReviewNote } from "./reviewNote/review-note";
import { ReviewView } from "./ui/views/reviewView";
import * as MixQueSet from "./dataStore/mixQueSet";
import { Iadapter } from "./dataStore/adapter";
import TabViewManager from "src/ui/views/TabViewManager";
import { TabView } from "src/ui/views/TabView";
import { DeckStatsService } from "./dataStore/deckStatsService";
import { SRSettingTab } from "src/ui/settings/settings-react";
import { clozeDecorationPlugin, initializeClozeDecoration } from "./editor/cloze-decoration";
import { latexPopoverExtension, initializeLatexPopover } from "./editor/latex-popover-manager";
import { latexClozePreprocessorPlugin } from "./editor/latex-cloze-preprocessor";
import { clozePostProcessor } from "./editor/cloze-postprocessor";
import { LicenseManager } from "./services/LicenseManager";
import { SyncProgressTip } from "src/ui/components/SyncProgressTip";
import { Tags } from "./tags";
import {
    deserializeNote,
    NOTE_CACHE_VERSION,
    PersistedNoteCacheFile,
    PersistedNoteCacheItem,
    serializeNote,
    SerializedNote,
} from "src/cache/noteCacheStore";
import { ReviewCommitStore } from "src/dataStore/reviewCommitStore";
import { autoCommitReviewResponseToTimeline } from "src/ui/timeline/reviewResponseTimeline";

// 每日牌组统计数据结构（持久化存储）
// 每日牌组统计数据结构（持久化存储）
interface DailyDeckStats {
    date: string; // 记录日期，例如 "2023-12-01"
    // 牌组名 -> 计数
    counts: Record<string, { new: number; review: number }>;
}

// 运行时学习队列项（不再需要持久化到 plugin.data，状态存在 RepetitionItem.learningStep）
export interface LearningQueueItem {
    card: Card;
    dueTime: number;
    deckName: string;
}

interface PluginData {
    settings: SRSettings;
    buryDate: string;
    // hashes of card texts
    // should work as long as user doesn't modify card's text
    // which covers most of the cases
    buryList: string[];
    historyDeck: string | null;
    // 持久化存储每日统计
    dailyDeckStats: DailyDeckStats;
    // 注意：learningQueue 不再存储在这里，状态已移至 RepetitionItem.learningStep
}

type SyncMode = "incremental" | "full";
type SyncTrigger = "manual" | "startup" | "review-entry" | "background" | "file-event";

interface SyncRequestOptions {
    reviewMode?: FlashcardReviewMode;
    mode?: SyncMode;
    trigger?: SyncTrigger;
    force?: boolean;
}

const AUTO_SYNC_COOLDOWN_MS = 15_000;

const DEFAULT_DATA: PluginData = {
    settings: DEFAULT_SETTINGS,
    buryDate: "",
    buryList: [],
    historyDeck: null,
    dailyDeckStats: {
        date: "",
        counts: {},
    },
};

// export interface SchedNote {
//     note: TFile;
//     dueUnix: number;
// }

// export interface LinkStat {
//     sourcePath: string;
//     linkCount: number;
// }

export default class SRPlugin extends Plugin {
    private isSRInFocus: boolean = false;
    private statusBarNote: HTMLElement;
    private statusBarFlashcard: HTMLElement;
    public reviewQueueView: ReactNoteReviewView;
    public data: PluginData;
    // 双算法架构
    cardAlgorithm: SrsAlgorithm; // 卡片复习算法
    noteAlgorithm: SrsAlgorithm; // 笔记复习算法

    /**
     * 根据项目类型获取对应的算法实例
     */
    getAlgorithmForItem(itemType: RPITEMTYPE): SrsAlgorithm {
        return itemType === RPITEMTYPE.CARD ? this.cardAlgorithm : this.noteAlgorithm;
    }

    // eTextScheduleStore: TextScheduleStore;  // 已经在下面的代码中定义
    public tabViewManager: TabViewManager;
    public syncLock = false;

    public reviewDecks: { [deckKey: string]: ReviewDeck } = {};
    public lastSelectedReviewDeck: string;

    public easeByPath: NoteEaseList;
    public noteReviewStore: NoteReviewStore;
    private questionPostponementList: QuestionPostponementList;
    // public incomingLinks: Record<string, LinkStat[]> = {}; // del, has linkRank
    // public pageranks: Record<string, number> = {}; // del, has linkRank
    private linkRank: LinkRank;
    private dueNotesCount = 0; // del , has noteStats
    public dueDatesNotes: Record<number, number> = {}; // Record<# of days in future, due count>

    public deckTree: Deck = new Deck("root", null);
    public remainingDeckTree: Deck;
    public noteCache: Map<string, { mtime: number; note: Note }> = new Map();
    private noteCacheSignature: string = "";
    public cardStats: Stats;
    public noteStats: Stats;
    private lastSyncCompletedAt = 0;
    private lastSuccessfulSyncStartedAt = 0;
    private lastSyncReviewMode: FlashcardReviewMode | null = null;
    private lastSemanticChangeAt = 0;
    private noteReviewRefreshLock = false;
    private noteReviewRefreshPending = false;

    // Derived from earlier pre-Syro command handling.
    public store: DataStore;
    public commands: Commands;
    public algorithm: SrsAlgorithm;
    public reviewFloatBar: reviewResponseModal;
    public settingTab: SRSettingTab;
    public reviewCommitStore: ReviewCommitStore;

    /** 事件总线：同步完成后广播消息，通知已打开的 UI 组件局部刷新数字 */
    public syncEvents: SyncEvents = new SyncEvents();

    public clock_start: number;

    // 学习队列：存储在插件级别，关闭复习界面后仍然保留
    // 格式: { card: Card, dueTime: number, deckName: string }[]
    public learningQueue: Array<{ card: Card; dueTime: number; deckName: string }> = [];

    private hasPerformedInitialGC = false;

    private static _instance: SRPlugin;
    static getInstance() {
        return SRPlugin._instance;
    }

    async onload(): Promise<void> {
        // Closes all still open tab views when the plugin is loaded, because it causes bugs / empty windows otherwise
        this.tabViewManager = new TabViewManager(this);
        this.app.workspace.onLayoutReady(async () => {
            this.tabViewManager.closeAllTabViews();
        });

        SRPlugin._instance = this;
        DeckStatsService.getInstance().setSyncEvents(this.syncEvents);
        Iadapter.create(this.app);
        await this.loadPluginData();
        this.easeByPath = new NoteEaseList(this.data.settings);
        this.questionPostponementList = new QuestionPostponementList(
            this,
            this.data.settings,
            this.data.buryList,
        );

        appIcon();

        // 注册 Anki Cloze 编辑器装饰扩展（Linear 风格预览）
        initializeClozeDecoration(this.app);
        this.registerEditorExtension(clozeDecorationPlugin);

        // 注册 LaTeX Cloze 编辑器扩展
        initializeLatexPopover(this.app, {
            isEnabled: () => this.data.settings.enableLatexPopover === true,
        });
        this.registerEditorExtension(latexPopoverExtension);

        // 注册 LaTeX Cloze 预处理器 (使用 atomic ranges)
        this.registerEditorExtension(latexClozePreprocessorPlugin);

        // 注册标准 Cloze Markdown 后处理器 (阅读模式)
        this.registerMarkdownPostProcessor(clozePostProcessor);

        const PLUGIN_VERSION = this.manifest.version;
        const obsidianJustInstalled = this.data.settings.previousRelease === "0.0.0";
        if (isVersionNewerThanOther(PLUGIN_VERSION, this.data.settings.previousRelease)) {
            new ReleaseNotes(this.app, this, obsidianJustInstalled ? null : PLUGIN_VERSION).open();
        }

        upgradeSettings(this.data.settings);

        // 确保algorithmSettings中有对应算法的配置
        if (!this.data.settings.algorithmSettings[this.data.settings.cardAlgorithm]) {
            this.data.settings.algorithmSettings[this.data.settings.cardAlgorithm] =
                algorithms[this.data.settings.cardAlgorithm]?.defaultSettings() || {};
        }
        if (!this.data.settings.algorithmSettings[this.data.settings.noteAlgorithm]) {
            this.data.settings.algorithmSettings[this.data.settings.noteAlgorithm] =
                algorithms[this.data.settings.noteAlgorithm]?.defaultSettings() || {};
        }

        // 初始化卡片复习算法
        this.cardAlgorithm = algorithms[this.data.settings.cardAlgorithm];
        if (this.cardAlgorithm) {
            this.cardAlgorithm.updateSettings(
                this.data.settings.algorithmSettings[this.data.settings.cardAlgorithm],
            );
        }

        // 初始化笔记复习算法
        this.noteAlgorithm = algorithms[this.data.settings.noteAlgorithm];
        if (this.noteAlgorithm) {
            this.noteAlgorithm.updateSettings(
                this.data.settings.algorithmSettings[this.data.settings.noteAlgorithm],
            );
        }

        // 保留algorithm字段用于兼容性（指向noteAlgorithm）
        this.algorithm = this.noteAlgorithm;

        // Update settings for both algorithms in the plugin data
        const settings = this.data.settings;
        if (this.cardAlgorithm && this.cardAlgorithm.settings) {
            settings.algorithmSettings[settings.cardAlgorithm] = this.cardAlgorithm.settings;
        }
        if (this.noteAlgorithm && this.noteAlgorithm.settings) {
            settings.algorithmSettings[settings.noteAlgorithm] = this.noteAlgorithm.settings;
        }
        this.savePluginData();

        IReviewNote.create(settings);
        ReviewView.create(this, this.data.settings);
        MixQueSet.create(settings.mixDue, settings.mixNew, settings.mixCard, settings.mixNote);
        this.commands = new Commands(this);
        this.commands.addCommands();
        if (this.data.settings.showSchedulingDebugMessages) {
            this.commands.addDebugCommands();
        }

        this.reviewFloatBar = new reviewResponseModal(this, settings);
        this.reviewFloatBar.submitCallback = (resp) => {
            const openFile: TFile | null = this.app.workspace.getActiveFile();
            if (openFile && openFile.extension === "md") {
                this.saveReviewResponse(openFile, resp);
            }
        };
        this.reviewFloatBar.openNextNoteCB = () => {
            if (!this.lastSelectedReviewDeck) {
                const reviewDeckKeys: string[] = Object.values(this.reviewDecks)
                    .filter((deck) => {
                        return deck.dueNotesCount + deck.newNotes.length > 0;
                    })
                    .map((deck) => {
                        return deck.deckName;
                    });
                if (reviewDeckKeys.length > 0) this.lastSelectedReviewDeck = reviewDeckKeys[0];
                else {
                    new Notice(t("ALL_CAUGHT_UP"));
                    return;
                }
            }
            this.reviewNextNote(this.lastSelectedReviewDeck);
        };

        registerTrackFileEvents(this);

        this.registerInterval(
            window.setInterval(
                async () => {
                    await this.requestSync({ trigger: "background" });
                    // this.store.save();
                },
                30 * 60 * 1000,
            ),
        );

        // Initialize Note Status Bar Item
        this.statusBarNote = this.addStatusBarItem();
        this.statusBarNote.classList.add("mod-clickable");
        setTooltip(this.statusBarNote, t("OPEN_NOTE_FOR_REVIEW"), { placement: "top" });
        this.statusBarNote.addEventListener("click", async () => {
            await this.refreshNoteReview({ trigger: "review-entry" });
            this.reviewNextNoteModal();
        });

        // Initialize Flashcard Status Bar Item
        this.statusBarFlashcard = this.addStatusBarItem();
        this.statusBarFlashcard.classList.add("mod-clickable");
        setTooltip(this.statusBarFlashcard, t("REVIEW_CARDS"), { placement: "top" });
        this.statusBarFlashcard.addEventListener("click", async () => {
            if (!this.syncLock) {
                await this.requestSync({ trigger: "review-entry" });
                this.tabViewManager.openSRTabView(FlashcardReviewMode.Review);
            }
        });

        // 初始化状态栏呼吸灯动态样式
        this.updateStatusBarVisibility();
        this.updateStatusBarStyles();
        this.updateStatusBar();

        this.addRibbonIcon("SpacedRepIcon", t("REVIEW_CARDS"), async () => {
            if (!this.syncLock) {
                await this.requestSync({ trigger: "review-entry" });
                this.tabViewManager.openSRTabView(FlashcardReviewMode.Review);
            }
        });

        if (!this.data.settings.disableFileMenuReviewOptions) {
            this.registerEvent(
                this.app.workspace.on("file-menu", (menu, fileish: TAbstractFile) => {
                    if (
                        fileish instanceof TFile &&
                        fileish.extension === "md" &&
                        this.noteReviewStore.isTracked(fileish.path)
                    ) {
                        const options = this.noteAlgorithm.srsOptions();
                        const algo = this.data.settings.noteAlgorithm;
                        const showtext = this.data.settings.responseOptionBtnsText;

                        // 获取笔记的 RepetitionItem 以计算各选项的复习间隔天数
                        let intervals: number[] | null = null;
                        try {
                            const noteItem = this.noteReviewStore.getItem(fileish.path);
                            if (noteItem) {
                                intervals = this.noteAlgorithm.calcAllOptsIntervals(noteItem);
                            }
                        } catch (e) {
                            // 如果获取失败（例如笔记未被追踪），则不显示间隔
                        }

                        // === 修改：从 i=0 开始，以包含"重来"选项 ===
                        for (let i = 0; i < options.length; i++) {
                            menu.addItem((item) => {
                                // 生成带间隔的标题：难度: X天后
                                let title: string;
                                // 获取标准化的选项名称（英文）以便映射到翻译 Key
                                const optionName = options[i];
                                let localizedOption: string;

                                if (optionName === "Reset" || optionName === "Again")
                                    localizedOption = t("UI_RESET");
                                else if (optionName === "Hard") localizedOption = t("UI_HARD");
                                else if (optionName === "Good") localizedOption = t("UI_GOOD");
                                else if (optionName === "Easy") localizedOption = t("UI_EASY");
                                else localizedOption = showtext[algo][i]; // Fallback for other algos like SM2

                                if (intervals && intervals[i] !== undefined) {
                                    const intervalText = textInterval(intervals[i], false);
                                    title = t("REVIEW_DIFFICULTY_FILE_MENU", {
                                        difficulty: localizedOption,
                                        interval: intervalText,
                                    });
                                } else {
                                    // 没有间隔信息时（如未追踪的笔记），只显示难度名称
                                    title = localizedOption;
                                }
                                item.setTitle(title)
                                    .setIcon("SpacedRepIcon")
                                    .onClick(() => {
                                        this.saveReviewResponse(fileish, i);
                                    });
                            });
                        }

                        // 添加分隔符
                        menu.addSeparator();

                        // 添加"设置重要性"菜单项
                        menu.addItem((item) => {
                            // 获取当前笔记的 RepetitionItem
                            const noteItem = this.noteReviewStore.getItem(fileish.path);
                            const currentPriority = noteItem?.priority ?? 5;

                            item.setTitle(
                                t("SET_PRIORITY") + ` (${t("PRIORITY")}: ${currentPriority})`,
                            )
                                .setIcon("star")
                                .onClick(() => {
                                    const modal = new PriorityInputModal(
                                        this.app,
                                        currentPriority,
                                        async (newPriority: number) => {
                                            if (noteItem) {
                                                // 更新重要性
                                                noteItem.priority = newPriority;
                                                await this.noteReviewStore.save();
                                                // 刷新侧边栏
                                                this.updateAndSortDueNotes();
                                                this.syncEvents.emit("note-review-updated");
                                                new Notice(`${t("PRIORITY")}: ${newPriority}`);
                                            }
                                        },
                                    );
                                    modal.open();
                                });
                        });
                    }

                    addFileMenuEvt(this, menu, fileish);
                }),
            );
        }

        this.addCommand({
            id: "srs-note-review-open-note",
            name: t("OPEN_NOTE_FOR_REVIEW"),
            callback: async () => {
                await this.refreshNoteReview({ trigger: "review-entry" });
                this.reviewNextNoteModal();
            },
        });

        const options = this.noteAlgorithm.srsOptions();
        const algo = this.data.settings.noteAlgorithm;
        const showtext = this.data.settings.responseOptionBtnsText;
        options.map((option, i) => {
            this.addCommand({
                id: "srs-note-review-" + option.toLowerCase(),
                name: t("REVIEW_NOTE_DIFFICULTY_CMD", {
                    difficulty: showtext[algo][i],
                }),
                callback: () => {
                    const openFile: TFile | null = this.app.workspace.getActiveFile();
                    if (openFile && openFile.extension === "md") {
                        this.saveReviewResponse(openFile, i);
                    }
                },
            });
        });

        this.addCommand({
            id: "srs-review-flashcards",
            name: t("REVIEW_ALL_CARDS"),
            callback: async () => {
                if (this.syncLock) {
                    return;
                }

                await this.requestSync({ trigger: "review-entry" });
                this.tabViewManager.openSRTabView(FlashcardReviewMode.Review);
            },
        });

        this.addCommand({
            id: "srs-cram-flashcards",
            name: t("CRAM_ALL_CARDS"),
            callback: async () => {
                await this.requestSync({
                    reviewMode: FlashcardReviewMode.Cram,
                    trigger: "review-entry",
                });
                this.tabViewManager.openSRTabView(FlashcardReviewMode.Cram);
            },
        });

        this.addCommand({
            id: "srs-review-flashcards-in-note",
            name: t("REVIEW_CARDS_IN_NOTE"),
            callback: async () => {
                const openFile: TFile | null = this.app.workspace.getActiveFile();
                if (!openFile || openFile.extension !== "md") {
                    return;
                }

                this.tabViewManager.openSRTabView(FlashcardReviewMode.Review, openFile);
            },
        });

        this.addCommand({
            id: "srs-cram-flashcards-in-note",
            name: t("CRAM_CARDS_IN_NOTE"),
            callback: async () => {
                const openFile: TFile | null = this.app.workspace.getActiveFile();
                if (!openFile || openFile.extension !== "md") {
                    return;
                }

                this.tabViewManager.openSRTabView(FlashcardReviewMode.Cram, openFile);
            },
        });

        this.addCommand({
            id: "srs-open-review-queue-view",
            name: t("OPEN_REVIEW_QUEUE_VIEW"),
            callback: async () => {
                await this.openReviewQueueView();
            },
        });

        // ============ Anki 风格挖空快捷键命令 ============

        // 同级挖空 (Ctrl+Alt+Shift+C) - 使用当前行最大 ID
        this.addCommand({
            id: "srs-cloze-same-level",
            name: t("CMD_CREATE_CLOZE_SAME_LEVEL"),
            icon: "flashcards",
            hotkeys: [{ modifiers: ["Ctrl", "Alt", "Shift"], key: "c" }],
            editorCallback: async (editor) => {
                // 【付费功能限制】
                const licMgr = LicenseManager.getInstance(this);
                if (!(await licMgr.checkFeatureAccess("Anki 挖空"))) return;
                this.insertAnkiCloze(editor, "same");
            },
        });

        // 新级挖空 (Alt+Shift+C) - 使用 maxId + 1
        this.addCommand({
            id: "srs-cloze-new-level",
            name: t("CMD_CREATE_CLOZE_NEW_LEVEL"),
            icon: "flashcards",
            hotkeys: [{ modifiers: ["Alt", "Shift"], key: "c" }],
            editorCallback: async (editor) => {
                // 【付费功能限制】
                const licMgr = LicenseManager.getInstance(this);
                if (!(await licMgr.checkFeatureAccess("Anki 挖空"))) return;
                this.insertAnkiCloze(editor, "new");
            },
        });

        this.settingTab = new SRSettingTab(this.app, this);
        this.addSettingTab(this.settingTab);
        this.app.workspace.trigger("parse-style-settings");

        this.app.workspace.onLayoutReady(async () => {
            await this.initReviewQueueView();
            void this.refreshNoteReview({ trigger: "startup" });
            setTimeout(async () => {
                if (!this.syncLock) {
                    await this.requestSync({ trigger: "startup" });
                }
            }, 2000);
            // ====== License 防破解检测点 A：启动时静默验证 ======
            try {
                const licMgr = LicenseManager.getInstance(this);
                if (this.data.settings.licenseToken) {
                    licMgr.backgroundCheck(this.data.settings).then((isValid) => {
                        if (!isValid && this.data.settings.isPro) {
                            // 服务器明确拒绝，悄悄降级，不弹窗
                            this.data.settings.isPro = false;
                            this.savePluginData();
                        }
                    });
                } else {
                    // 没有 token 也要初始化单例，确保后续能用
                    LicenseManager.getInstance(this);
                }
            } catch (e) {
                // License 检测不应影响插件正常启动
                console.warn("[SR] License backgroundCheck error:", e);
            }
        });

        this.registerSRFocusListener();
    }

    onunload(): void {
        this.app.workspace.getLeavesOfType(REVIEW_QUEUE_VIEW_TYPE).forEach((leaf) => leaf.detach());
        this.tabViewManager.closeAllTabViews();
        this.reviewFloatBar.close();
    }

    /**
     * 插入 Anki 风格挖空
     * @param editor 编辑器实例
     * @param type "same" - 同级挖空(使用当前最大ID), "new" - 新级挖空(maxId+1)
     */
    insertAnkiCloze(editor: import("obsidian").Editor, type: "same" | "new"): void {
        const selection = editor.getSelection();
        if (!selection) {
            new Notice(t("NOTICE_TEXT_SELECTION_REQUIRED"));
            return;
        }

        // 获取当前行/段落的文本来判断上下文 ID
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);

        const currentMax = this.getMaxClozeIdFromText(lineText);

        // 计算要使用的 ID
        let nextId: number;
        if (type === "same") {
            // 同级：使用当前最大 ID，如果没有则为 1
            nextId = currentMax === 0 ? 1 : currentMax;
        } else {
            // 新级：使用 maxId + 1
            nextId = currentMax + 1;
        }

        const replacement = `{{c${nextId}::${selection}}}`;
        editor.replaceSelection(replacement);

        new Notice(t("NOTICE_CLOZE_CREATED", { nextId: nextId.toString() }));
    }

    /**
     * 从文本中提取最大的 Cloze ID
     */
    private getMaxClozeIdFromText(text: string): number {
        const matches = text.matchAll(/\{\{c(\d+)::/g);
        let max = 0;
        for (const m of matches) {
            const id = parseInt(m[1]);
            if (id > max) max = id;
        }
        return max;
    }

    // ========== 每日统计辅助方法 ==========

    /**
     * 获取当前的"逻辑日期"
     * 如果设置了凌晨 4 点刷新，那么凌晨 3 点仍然属于"昨天"
     */
    public getRolloverDate(): string {
        return window
            .moment()
            .subtract(this.data.settings.rolloverHour, "hours")
            .format("YYYY-MM-DD");
    }

    /**
     * 加载/重置每日统计
     * 如果存储的日期不是今天，说明跨天了，重置数据
     */
    public loadDailyDeckStats(): void {
        const today = this.getRolloverDate();

        // 初始化 dailyDeckStats 如果不存在
        if (!this.data.dailyDeckStats) {
            this.data.dailyDeckStats = { date: "", counts: {} };
        }

        if (this.data.dailyDeckStats.date !== today) {
            this.data.dailyDeckStats = {
                date: today,
                counts: {},
            };
            this.savePluginData();
            if (this.data.settings.showSchedulingDebugMessages) {
                console.log(`[SR] New day detected (${today}). Daily limits reset.`);
            }
        }
    }

    /**
     * 获取指定牌组的今日计数
     */
    public getDailyCounts(deckName: string): { new: number; review: number } {
        this.loadDailyDeckStats();
        const stats = this.data.dailyDeckStats.counts[deckName];
        return stats || { new: 0, review: 0 };
    }

    /**
     * 增加计数（支持层级，沿路径向上更新所有祖先牌组）
     */
    public async incrementDailyCounts(deckName: string, isNew: boolean): Promise<void> {
        this.loadDailyDeckStats();

        // 获取牌组路径 lineage (例如 A/B -> [A, A/B])
        const parts = deckName.split("/");
        let currentPath = "";
        const lineage: string[] = [];
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            lineage.push(currentPath);
        }

        // 更新整条路径上的计数
        for (const path of lineage) {
            if (!this.data.dailyDeckStats.counts[path]) {
                this.data.dailyDeckStats.counts[path] = { new: 0, review: 0 };
            }

            if (isNew) {
                this.data.dailyDeckStats.counts[path].new++;
            } else {
                this.data.dailyDeckStats.counts[path].review++;
            }
        }

        await this.savePluginData();
    }

    /**
     * 减少计数（用于撤销操作）
     * 支持层级，沿路径向上更新所有祖先牌组
     */
    public async decrementDailyCounts(deckName: string, isNew: boolean): Promise<void> {
        this.loadDailyDeckStats();

        // 获取牌组路径 lineage (例如 A/B -> [A, A/B])
        const parts = deckName.split("/");
        let currentPath = "";
        const lineage: string[] = [];
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            lineage.push(currentPath);
        }

        // 更新整条路径上的计数
        for (const path of lineage) {
            if (this.data.dailyDeckStats.counts[path]) {
                if (isNew) {
                    if (this.data.dailyDeckStats.counts[path].new > 0) {
                        this.data.dailyDeckStats.counts[path].new--;
                    }
                } else {
                    if (this.data.dailyDeckStats.counts[path].review > 0) {
                        this.data.dailyDeckStats.counts[path].review--;
                    }
                }
            }
        }

        await this.savePluginData();
    }

    private static createDeckTreeIterator(settings: SRSettings, baseDeck: Deck): IDeckTreeIterator {
        let cardOrder: CardOrder = CardOrder[settings.flashcardCardOrder as keyof typeof CardOrder];
        if (cardOrder === undefined) cardOrder = CardOrder.DueFirstSequential;
        let deckOrder: DeckOrder = DeckOrder[settings.flashcardDeckOrder as keyof typeof DeckOrder];
        if (deckOrder === undefined) deckOrder = DeckOrder.PrevDeckComplete_Sequential;

        const iteratorOrder: IIteratorOrder = {
            deckOrder,
            cardOrder,
        };
        return new DeckTreeIterator(iteratorOrder, baseDeck);
    }

    private getSyncSignature(settings: SRSettings): string {
        // Only include parse- and deck-derivation settings to avoid cache resets from UI changes.
        const signature = {
            flashcardTags: settings.flashcardTags,
            tagsToReview: settings.tagsToReview,
            trackedNoteToDecks: settings.trackedNoteToDecks,
            convertFoldersToDecks: settings.convertFoldersToDecks,
            dataLocation: settings.dataLocation,
            singleLineCardSeparator: settings.singleLineCardSeparator,
            singleLineReversedCardSeparator: settings.singleLineReversedCardSeparator,
            multilineCardSeparator: settings.multilineCardSeparator,
            multilineReversedCardSeparator: settings.multilineReversedCardSeparator,
            multilineCardEndMarker: settings.multilineCardEndMarker,
            clozePatterns: settings.clozePatterns,
            convertAnkiClozesToClozes: settings.convertAnkiClozesToClozes,
            parseClozesInCodeBlocks: settings.parseClozesInCodeBlocks,
            convertHighlightsToClozes: settings.convertHighlightsToClozes,
            convertBoldTextToClozes: settings.convertBoldTextToClozes,
            convertCurlyBracketsToClozes: settings.convertCurlyBracketsToClozes,
            multiClozeCard: settings.multiClozeCard,
            isPro: settings.isPro,
            codeContextLines: settings.codeContextLines,
        };
        return JSON.stringify(signature);
    }

    private getNoteCacheStorePath(): string {
        const dataPath = this.store?.dataPath;
        if (!dataPath) return "note_cache.json";

        const sepIdx = Math.max(dataPath.lastIndexOf("/"), dataPath.lastIndexOf("\\"));
        if (sepIdx < 0) return "note_cache.json";
        return `${dataPath.substring(0, sepIdx + 1)}note_cache.json`;
    }

    private async loadNoteCacheFromDisk(): Promise<PersistedNoteCacheFile | null> {
        try {
            const adapter = Iadapter.instance.adapter;
            const path = this.getNoteCacheStorePath();
            if (!(await adapter.exists(path))) {
                return null;
            }

            const raw = await adapter.read(path);
            if (!raw) return null;

            const parsed: PersistedNoteCacheFile = JSON.parse(raw);
            if (parsed.version !== NOTE_CACHE_VERSION || !Array.isArray(parsed.items)) {
                return null;
            }
            return parsed;
        } catch (error) {
            console.warn("[SR-Cache] Failed to load note_cache.json:", error);
            return null;
        }
    }

    private async saveNoteCacheToDisk(
        signature: string,
        cache: Map<string, { mtime: number; note: Note }>,
    ): Promise<void> {
        try {
            const adapter = Iadapter.instance.adapter;
            const path = this.getNoteCacheStorePath();
            const items: PersistedNoteCacheItem[] = [];
            for (const [notePath, entry] of cache.entries()) {
                items.push({
                    path: notePath,
                    mtime: entry.mtime,
                    data: serializeNote(entry.note),
                });
            }

            const payload: PersistedNoteCacheFile = {
                version: NOTE_CACHE_VERSION,
                signature,
                items,
            };
            await adapter.write(path, JSON.stringify(payload));
        } catch (error) {
            console.warn("[SR-Cache] Failed to save note_cache.json:", error);
        }
    }

    private deserializeCachedNote(noteFile: TFile, data: SerializedNote): Note | null {
        try {
            const srFile: ISRFile = this.createSrTFile(noteFile);
            return deserializeNote(data, srFile);
        } catch (error) {
            console.warn(
                `[SR-Cache] Failed to deserialize note cache for ${noteFile.path}:`,
                error,
            );
            return null;
        }
    }

    private async hydrateCachedNoteRuntime(note: Note): Promise<boolean> {
        for (const question of note.questionList) {
            for (const card of question.cards) {
                if (typeof card.Id === "number" && card.Id >= 0) {
                    const item = this.store.getItembyID(card.Id);
                    if (!item) {
                        return false;
                    }
                    card.repetitionItem = item;
                    card.scheduleInfo = NoteCardScheduleParser.createInfo_algo(item.getSched());
                } else {
                    // Cached notes without valid card IDs cannot participate in deck stats.
                    // Force a fresh parse so ItemTrans can rebind cards to tracked items.
                    return false;
                }
            }
        }
        await note.clearTransientFileText(this.data.settings);
        return true;
    }

    // @logExecutionTime()
    public shouldShowSyncProgressTip(syncMode: SyncMode): boolean {
        const displayMode: SyncProgressDisplayMode =
            this.data.settings.syncProgressDisplayMode ?? "always";

        if (displayMode === "never") {
            return false;
        }

        if (displayMode === "full-only") {
            return syncMode === "full";
        }

        return true;
    }

    private logRuntimeDebug(...args: unknown[]): void {
        if (this.data.settings.showRuntimeDebugMessages) {
            console.log(...args);
        }
    }

    public markSyncDirty(): void {
        this.lastSemanticChangeAt = Date.now();
    }

    private hasPendingSyncChanges(): boolean {
        return this.lastSemanticChangeAt > this.lastSuccessfulSyncStartedAt;
    }

    private shouldSkipDisabledAutomaticIncrementalSync(
        mode: SyncMode,
        trigger: SyncTrigger,
    ): boolean {
        if (mode === "full" || trigger === "manual" || trigger === "startup") {
            return false;
        }

        if (this.data.settings.autoIncrementalSync !== false) {
            return false;
        }

        // Preserve automatic rebuilds when parse-affecting settings changed.
        return this.noteCacheSignature === this.getSyncSignature(this.data.settings);
    }

    private shouldSkipAutomaticSync(
        reviewMode: FlashcardReviewMode,
        mode: SyncMode,
        trigger: SyncTrigger,
    ): boolean {
        if (mode === "full" || trigger === "manual") {
            return false;
        }
        if (!this.lastSyncCompletedAt || !this.noteCacheSignature) {
            return false;
        }
        if (this.lastSyncReviewMode !== null && this.lastSyncReviewMode !== reviewMode) {
            return false;
        }
        if (this.noteCacheSignature !== this.getSyncSignature(this.data.settings)) {
            return false;
        }
        if (this.hasPendingSyncChanges()) {
            return false;
        }
        return Date.now() - this.lastSyncCompletedAt < AUTO_SYNC_COOLDOWN_MS;
    }

    private getNoteReviewableMarkdownFiles(): TFile[] {
        let notes = this.app.vault.getMarkdownFiles();
        notes = notes.filter((noteFile) => {
            const fileCachedData = this.app.metadataCache.getFileCache(noteFile) || {};
            const tags = getAllTags(fileCachedData) || [];
            const isIgnoredTags = this.data.settings.tagsToIgnore.some((igntag) =>
                tags.some((notetag) => notetag.startsWith(igntag)),
            );
            return (
                !isIgnoredPath(this.data.settings.noteFoldersToIgnore, noteFile.path) &&
                !isIgnoredTags
            );
        });
        return notes;
    }

    private resolveNoteReviewTracking(
        note: TFile,
    ): { deckName: string; source: NoteReviewSource } | null {
        const tagDeckName = Tags.getNoteDeckName(note, this.data.settings);
        if (tagDeckName !== null) {
            return { deckName: tagDeckName, source: "tag" };
        }

        const existing = this.noteReviewStore.getEntry(note.path);
        if (!existing) {
            return null;
        }

        if (existing.source === "manual") {
            return { deckName: existing.deckName ?? DEFAULT_DECKNAME, source: "manual" };
        }

        if (this.data.settings.untrackWithReviewTag === false) {
            return {
                deckName: existing.deckName ?? DEFAULT_DECKNAME,
                source: existing.source,
            };
        }

        return null;
    }

    public async refreshNoteReview({
        trigger = "manual",
    }: { trigger?: SyncTrigger } = {}): Promise<void> {
        if (this.noteReviewRefreshLock) {
            this.noteReviewRefreshPending = true;
            return;
        }

        this.noteReviewRefreshLock = true;
        try {
            do {
                this.noteReviewRefreshPending = false;
                await this.refreshNoteReviewOnce(trigger);
            } while (this.noteReviewRefreshPending);
        } finally {
            this.noteReviewRefreshLock = false;
        }
    }

    private async refreshNoteReviewOnce(_trigger: SyncTrigger): Promise<void> {
        graph.reset();
        this.easeByPath = this.easeByPath ?? new NoteEaseList(this.data.settings);
        this.linkRank = new LinkRank(this.data.settings, this.app.metadataCache);

        const notes = this.getNoteReviewableMarkdownFiles();
        const visiblePaths = new Set(notes.map((note) => note.path));
        let changed = this.noteReviewStore.cleanupMissingFiles(this.app.vault);

        this.linkRank.readLinks(notes);

        for (const path of this.noteReviewStore.listPaths()) {
            if (!visiblePaths.has(path)) {
                changed = this.noteReviewStore.remove(path) || changed;
            }
        }

        for (const note of notes) {
            const tracking = this.resolveNoteReviewTracking(note);
            const existing = this.noteReviewStore.getEntry(note.path);
            const previousDeckName = existing?.deckName;
            const previousSource = existing?.source;

            if (!tracking) {
                if (existing) {
                    changed = this.noteReviewStore.remove(note.path) || changed;
                }
                continue;
            }

            const item = this.noteReviewStore.ensureTracked(
                note.path,
                tracking.deckName,
                tracking.source,
                this.noteAlgorithm,
            );

            if (
                !existing ||
                previousDeckName !== tracking.deckName ||
                previousSource !== tracking.source
            ) {
                changed = true;
            }

            const sched = item.getSched();
            if (sched != null) {
                const ease = parseFloat(String(sched[3]));
                if (!isNaN(ease)) {
                    this.easeByPath.setEaseForPath(note.path, ease);
                }
            }
        }

        this.reviewDecks = this.noteReviewStore.buildReviewDecks(this.app.vault);
        this.updateAndSortDueNotes();

        if (changed) {
            await this.noteReviewStore.save();
        }

        this.syncEvents.emit("note-review-updated");
    }

    async requestSync({
        reviewMode = FlashcardReviewMode.Review,
        mode = "incremental",
        trigger = "manual",
        force = false,
    }: SyncRequestOptions = {}): Promise<boolean> {
        if (!force && this.shouldSkipDisabledAutomaticIncrementalSync(mode, trigger)) {
            if (this.data.settings.showSchedulingDebugMessages) {
                console.log(`[SR-SyncGate] Skipping ${trigger} incremental sync by setting.`);
            }
            return false;
        }

        if (!force && this.shouldSkipAutomaticSync(reviewMode, mode, trigger)) {
            if (this.data.settings.showSchedulingDebugMessages) {
                console.log(
                    `[SR-SyncGate] Skipping ${trigger} sync within ${AUTO_SYNC_COOLDOWN_MS}ms cooldown.`,
                );
            }
            return false;
        }

        await this.sync(reviewMode, mode);
        return true;
    }

    // @logExecutionTime()
    async sync(
        reviewMode = FlashcardReviewMode.Review,
        mode: SyncMode = "incremental",
    ): Promise<void> {
        const syncStartedAt = Date.now();
        // this.clock_start = Date.now();
        const settings = this.data.settings;
        const currentSignature = this.getSyncSignature(settings);
        let syncMode: SyncMode = mode;
        const persistedCacheByPath = new Map<string, { mtime: number; data: SerializedNote }>();

        if (
            settings.enableNoteCachePersistence &&
            syncMode === "incremental" &&
            this.noteCache.size === 0
        ) {
            const persisted = await this.loadNoteCacheFromDisk();
            if (persisted) {
                this.noteCacheSignature = persisted.signature || "";
                if (persisted.signature === currentSignature) {
                    for (const item of persisted.items) {
                        if (item?.path) {
                            persistedCacheByPath.set(item.path, {
                                mtime: item.mtime ?? 0,
                                data: item.data,
                            });
                        }
                    }
                }
            }
        }

        if (!this.noteCacheSignature) {
            this.noteCacheSignature = currentSignature;
        }

        if (this.noteCacheSignature !== currentSignature) {
            this.noteCacheSignature = currentSignature;
            this.noteCache.clear();
            persistedCacheByPath.clear();
            syncMode = "full";
        }
        if (syncMode === "full") {
            this.noteCache.clear();
            persistedCacheByPath.clear();
        }

        if (this.syncLock) {
            return;
        }
        this.syncLock = true;
        this.syncEvents.emit("sync-start");

        // --- 显示同步进度提示 ---
        const progressTip = this.shouldShowSyncProgressTip(syncMode)
            ? new SyncProgressTip("正在同步...")
            : null;
        progressTip?.show();
        let releaseSaveSuppression: (() => void) | null = null;
        try {
            // --- 清洗脏数据 ---
            if (this.store) {
                this.store.cleanDirtyNewItems();
            }

            // reset flashcards stuff
            const fullDeckTree = new Deck("root", null);

            const now = window.moment(Date.now());
            const todayDate: string = now.format("YYYY-MM-DD");
            // clear bury list if we've changed dates
            if (todayDate !== this.data.buryDate) {
                this.data.buryDate = todayDate;
                this.questionPostponementList.clear();

                // The following isn't needed for plug-in functionality; but can aid during debugging
                await this.savePluginData();
            }

            let notes: TFile[] = this.app.vault.getMarkdownFiles();
            notes = notes.filter((noteFile) => {
                const fileCachedData = this.app.metadataCache.getFileCache(noteFile) || {};
                const tags = getAllTags(fileCachedData) || [];
                const isIgnoredTags = this.data.settings.tagsToIgnore.some((igntag) =>
                    tags.some((notetag) => notetag.startsWith(igntag)),
                );
                return (
                    !isIgnoredPath(this.data.settings.noteFoldersToIgnore, noteFile.path) &&
                    !isIgnoredTags
                );
            });
            this.linkRank.readLinks(notes);
            const totalNotes = notes.length;
            let syncedCount = 0;
            releaseSaveSuppression = this.store ? this.store.suspendSaves() : null;
            const useCache = syncMode === "incremental";
            const previousCache = this.noteCache;
            const nextCache = new Map<string, { mtime: number; note: Note }>();
            this.noteCache = nextCache;
            const BATCH_SIZE = 50;
            progressTip?.update(0, totalNotes, `正在解析笔记 (0/${totalNotes})...`);
            for (let i = 0; i < notes.length; i += BATCH_SIZE) {
                const batch = notes.slice(i, i + BATCH_SIZE);
                await Promise.all(
                    batch.map(async (noteFile) => {
                        const mtime = noteFile.stat?.mtime ?? 0;
                        const cached = useCache ? previousCache.get(noteFile.path) : null;
                        const persisted = useCache ? persistedCacheByPath.get(noteFile.path) : null;

                        let note: Note = null;
                        if (useCache && cached && cached.mtime === mtime) {
                            note = cached.note;
                        } else if (useCache && persisted && persisted.mtime === mtime) {
                            const restored = this.deserializeCachedNote(noteFile, persisted.data);
                            if (restored && (await this.hydrateCachedNoteRuntime(restored))) {
                                note = restored;
                            }
                        }
                        if (!note) {
                            note = await this.loadNote(noteFile);
                        }
                        nextCache.set(noteFile.path, { mtime, note });
                        if (note.questionList.length > 0) {
                            note.appendCardsToDeck(fullDeckTree);
                        }
                        syncedCount++;
                        progressTip?.update(
                            syncedCount,
                            totalNotes,
                            `正在解析笔记 (${syncedCount}/${totalNotes})...`,
                        );
                    }),
                );
            }
            if (settings.showSchedulingDebugMessages) {
                console.log(
                    "[SR-Debug] sync➡1: fullDeckTree 所有卡片数:",
                    fullDeckTree.getCardCount(CardListType.All, true),
                );
            }
            progressTip?.update(totalNotes, totalNotes, "正在构建牌组树...");
            if (releaseSaveSuppression) {
                releaseSaveSuppression();
                releaseSaveSuppression = null;
                await this.store.flushSaveIfNeeded();
            }
            if (this.store) {
                await this.store.save();
            }
            if (settings.enableNoteCachePersistence) {
                await this.saveNoteCacheToDisk(currentSignature, nextCache);
            }

            // Reviewable cards are all except those with the "edit later" tag
            this.deckTree = DeckTreeFilter.filterForReviewableCards(fullDeckTree);
            if (settings.showSchedulingDebugMessages) {
                console.log(
                    "[SR-Debug] sync➡2: deckTree (过滤 EditLater 后):",
                    this.deckTree.getCardCount(CardListType.All, true),
                );
            }

            // sort the deck names
            this.deckTree.sortSubdecksList();

            // 从 RepetitionItem.learningStep 收集学习中的卡片（新方案：单一数据源）
            // 必须在 filterForRemainingCards 之前运行，以确保处于学习状态但错位在 new/due 列表的卡片
            // 能被移动到 learningFlashcards 物理列表中，从而受 copyWithCardFilter 的保护不被过滤掉。
            this.collectLearningCardsFromStore(this.deckTree);

            this.remainingDeckTree = DeckTreeFilter.filterForRemainingCards(
                this.questionPostponementList,
                this.deckTree,
                reviewMode,
            );
            if (settings.showSchedulingDebugMessages) {
                console.log(
                    "[SR-Debug] sync➡3: remainingDeckTree (过滤未到期后):",
                    this.remainingDeckTree.getCardCount(CardListType.All, true),
                    "New:",
                    this.remainingDeckTree.getCardCount(CardListType.NewCard, true),
                    "Due:",
                    this.remainingDeckTree.getCardCount(CardListType.DueCard, true),
                );
            }

            // [V3 调度器] 不再在 sync 全局阶段应用每日上限。
            // remainingDeckTree 保持满血，每日限额将在用户点击牌组时动态隔离应用。
            // if (reviewMode !== FlashcardReviewMode.Cram) {
            //     this.remainingDeckTree = DeckTreeFilter.filterByDailyLimits(
            //         this.remainingDeckTree,
            //         this,
            //     );
            // }

            // 如果需要，可以在这里再次微调或排序，但此时 learningQueue 已经由之前对 deckTree 的调用填充
            // this.collectLearningCardsFromStore(this.remainingDeckTree);
            const calc: DeckTreeStatsCalculator = new DeckTreeStatsCalculator();
            this.cardStats = calc.calculate(this.deckTree);
            setDueDates(this.cardStats.delayedDays.dict, this.cardStats.delayedDays.dict);

            // --- 填充全局统计缓存 ---
            const statsService = DeckStatsService.getInstance();
            statsService.setSyncEvents(this.syncEvents);
            statsService.clearCache();

            // 遍历所有卡片，按层级收集 items 以供统计缓存使用
            const deckItemsMap = new Map<string, RepetitionItem[]>();

            // 我们遍历整个 fullDeckTree 来收集所有的 items
            const addItemsToMap = (deck: Deck) => {
                const deckPathName =
                    deck.deckName === "root" ? "root" : deck.getTopicPath().path.join("/");

                const itemsInDeck: RepetitionItem[] = [];
                // 收集所有卡片的 item 实例
                const allDeckCards = [
                    ...deck.newFlashcards,
                    ...deck.dueFlashcards,
                    ...deck.learningFlashcards,
                ];

                for (const card of allDeckCards) {
                    if (card.repetitionItem) {
                        itemsInDeck.push(card.repetitionItem);
                    }
                }

                if (itemsInDeck.length > 0) {
                    deckItemsMap.set(deckPathName, itemsInDeck);
                }

                for (const subdeck of deck.subdecks) {
                    addItemsToMap(subdeck);
                }
            };
            addItemsToMap(this.deckTree);

            for (const [dName, dItems] of deckItemsMap.entries()) {
                statsService.calculateDeckStats(dName, dItems);
            }
            if (this.data.settings.showSchedulingDebugMessages) {
                console.log(
                    "[SR-Debug] 全局 DeckStatsService Cache 填充完成，共计牌组数: ",
                    deckItemsMap.size,
                );
                this.showSyncInfo();
            }

            if (this.data.settings.showSchedulingDebugMessages) {
                console.log(
                    "SR: " +
                        t("SYNC_TIME_TAKEN", {
                            t: Date.now() - now.valueOf(),
                        }),
                );
            }

            const fbar = this.reviewFloatBar;
            fbar.cardtotalCB = () => {
                return this.remainingDeckTree.getCardCount(CardListType.All, true);
            };
            fbar.notetotalCB = () => {
                return this.noteStats.getTotalCount();
            };

            // 隐藏同步进度提示

            // 广播同步完成事件，通知已打开的 UI 组件局部刷新数字
            this.logRuntimeDebug(
                "[SR-DynSync] plugin.sync() 完成，准备 emit sync-complete, remainingDeckTree subdecks:",
                this.remainingDeckTree?.subdecks?.length,
            );
            this.lastSuccessfulSyncStartedAt = syncStartedAt;
            this.lastSyncCompletedAt = Date.now();
            this.lastSyncReviewMode = reviewMode;
            this.syncEvents.emit("sync-complete");
        } catch (error) {
            console.error("[SR-Sync] sync failed:", error);
            throw error;
        } finally {
            if (releaseSaveSuppression) {
                releaseSaveSuppression();
                await this.store.flushSaveIfNeeded();
            }
            this.syncLock = false;
            this.syncEvents.emit("sync-finished");
            progressTip?.hide(800);
        }
    }

    public updateAndSortDueNotes() {
        this.dueNotesCount = 0;
        this.dueDatesNotes = {};
        this.noteStats = new Stats();

        const now = window.moment(Date.now());
        Object.values(this.reviewDecks).forEach((reviewDeck: ReviewDeck) => {
            this.dueNotesCount += reviewDeck.dueNotesCount;
            this.noteStats.newCount += reviewDeck.newNotes.length;
            reviewDeck.scheduledNotes.forEach((scheduledNote: SchedNote) => {
                const nDays: number = Math.ceil(
                    (scheduledNote.dueUnix - now.valueOf()) / (24 * 3600 * 1000),
                );
                if (!Object.prototype.hasOwnProperty.call(this.dueDatesNotes, nDays)) {
                    this.dueDatesNotes[nDays] = 0;
                }
                this.dueDatesNotes[nDays]++;
                this.noteStats.update(nDays, scheduledNote.interval, scheduledNote.ease);
            });

            reviewDeck.sortNotes(this.linkRank.pageranks);
        });

        setDueDates(this.noteStats.delayedDays.dict, this.cardStats?.delayedDays?.dict ?? {});

        this.updateStatusBar();

        if (this.getActiveLeaf(REVIEW_QUEUE_VIEW_TYPE) && this.reviewQueueView?.redraw) {
            this.reviewQueueView.redraw();
        }
    }

    async loadNote(noteFile: TFile): Promise<Note> {
        const loader: NoteFileLoader = new NoteFileLoader(this.data.settings);
        const srFile: ISRFile = this.createSrTFile(noteFile);
        const folderTopicPath: TopicPath = TopicPath.getFolderPathFromFilename(
            srFile,
            this.data.settings,
        );

        const note: Note = await loader.load(
            this.createSrTFile(noteFile),
            this.getObsidianRtlSetting(),
            folderTopicPath,
        );
        await ItemTrans.updateCardsSchedbyItems(note, folderTopicPath);
        note.createMultiCloze(this.data.settings);
        if (note.hasChanged) {
            note.writeNoteFile(this.data.settings);
        }
        // Full sync suppresses per-note saves; outside sync this persists per-note changes.
        await this.store.save(); // 核心：同步完笔记及其卡片 ID 后即刻落盘
        await note.clearTransientFileText(this.data.settings);
        return note;
    }

    private getObsidianRtlSetting(): TextDirection {
        // Get the direction with Obsidian's own setting
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v: any = (this.app.vault as any).getConfig("rightToLeft");
        return convertToStringOrEmpty(v) == "true" ? TextDirection.Rtl : TextDirection.Ltr;
    }

    async saveReviewResponse(note: TFile, response: ReviewResponse): Promise<void> {
        const settings = this.data.settings;
        const debugScheduling = settings.showSchedulingDebugMessages;
        if (debugScheduling) {
            console.log("[SR Debug] ===== saveReviewResponse called =====");
            console.log("[SR Debug] note.path:", note.path);
            console.log("[SR Debug] response:", response);
            console.log("[SR Debug] noteAlgorithm:", settings.noteAlgorithm);
        }

        if (isIgnoredPath(settings.noteFoldersToIgnore, note.path)) {
            new Notice(t("NOTE_IN_IGNORED_FOLDER"));
            return;
        }
        const tracking = this.resolveNoteReviewTracking(note);
        if (!tracking) {
            // tagCheck已经显示Notice，这里不需要额外提示
            if (debugScheduling) {
                console.log("[SR Debug] tagCheck failed");
            }
            new Notice(t("PLEASE_TAG_NOTE"));
            return;
        }

        const item = this.noteReviewStore.ensureTracked(
            note.path,
            tracking.deckName,
            tracking.source,
            this.noteAlgorithm,
        );

        let ease: number;
        if (item.isNew && settings.noteAlgorithm !== algorithmNames.Fsrs) {
            if (debugScheduling) {
                console.log("[SR Debug] Calculating ease for new note (non-FSRS)");
            }
            try {
                ease = this.linkRank.getContribution(note, this.easeByPath).ease;
                if (debugScheduling) {
                    console.log("[SR Debug] Calculated ease:", ease);
                }
            } catch (error) {
                console.error("[SR Debug] Error calculating ease:", error);
                throw error;
            }
        }

        if (debugScheduling) {
            console.log("[SR Debug] Applying note review response...");
        }

        if (item.isNew && ease != null) {
            item.updateAlgorithmData("ease", ease);
        }

        let timelineIntervalDays: number | null = null;
        try {
            const timelineIntervals = this.noteAlgorithm.calcAllOptsIntervals(item);
            if (timelineIntervals && timelineIntervals[response] !== undefined) {
                timelineIntervalDays = timelineIntervals[response];
            }
        } catch (error) {
            if (debugScheduling) {
                console.warn("[Timeline] Failed to calculate note timeline interval:", error);
            }
        }

        const option = this.noteAlgorithm.srsOptions()[response];
        const reviewResult = this.noteAlgorithm.onSelection(item, option, false);
        item.reviewUpdate(reviewResult);
        IReviewNote.minNextView = IReviewNote.updateminNextView(
            IReviewNote.minNextView,
            item.nextReview,
        );

        if (settings.burySiblingCardsByNoteReview) {
            await this.savePluginData();
        }

        await this.noteReviewStore.save();
        try {
            await autoCommitReviewResponseToTimeline({
                app: this.app,
                commitStore: this.reviewCommitStore,
                enabled: settings.timelineAutoCommitReviewSelection,
                notePath: note.path,
                response,
                intervalDays: timelineIntervalDays,
            });
        } catch (error) {
            console.error("[Timeline] Failed to auto-log review response:", error);
        }
        this.postponeResponse(note, itemToShedNote(item, note));
        this.syncEvents.emit("note-review-updated");

        if (debugScheduling) {
            console.log("[SR Debug] saveReviewResponse completed successfully");
        }

        // ✅ 刷新UI
    }

    // return false if is ignored
    tagCheck(note: TFile) {
        const fileCachedData = this.app.metadataCache.getFileCache(note) || {};

        const tags = getAllTags(fileCachedData) || [];
        let shouldIgnore = true;
        if (SettingsUtil.isPathInNoteIgnoreFolder(this.data.settings, note.path)) {
            new Notice(t("NOTE_IN_IGNORED_FOLDER"));
            return false;
        }
        // if (
        //     this.data.settings.tagsToIgnore.some((igntag) =>
        //         tags.some((notetag) => notetag.startsWith(igntag)),
        //     )
        // ) {
        //     new Notice(t("NOTE_IN_IGNORED_TAGS"));
        //     return false;
        // }

        for (const tag of tags) {
            if (
                this.data.settings.tagsToReview.some(
                    (tagToReview) => tag === tagToReview || tag.startsWith(tagToReview + "/"),
                )
            ) {
                shouldIgnore = false;
                break;
            }
        }

        if (shouldIgnore) {
            new Notice(t("PLEASE_TAG_NOTE"));
            return false;
        }
        return true;
    }

    postponeResponse(note: TFile, sNote: SchedNote) {
        Object.values(this.reviewDecks).forEach((reviewDeck: ReviewDeck) => {
            let wasDueInDeck = false;
            reviewDeck.scheduledNotes.findIndex((newNote, ind) => {
                if (newNote.note.path === note.path) {
                    reviewDeck.scheduledNotes[ind] = sNote;
                    wasDueInDeck = true;
                    return true;
                }
            });

            // It was a new note, remove it from the new notes and schedule it.
            if (!wasDueInDeck) {
                const newidx = reviewDeck.newNotes.findIndex(
                    (newNote) => newNote.note.path === note.path,
                );
                if (newidx >= 0) {
                    reviewDeck.newNotes.splice(newidx, 1);
                    reviewDeck.scheduledNotes.push(sNote);
                }
            }
        });

        this.updateAndSortDueNotes();

        if (!this.data.settings.reviewResponseFloatBar) {
            new Notice(t("RESPONSE_RECEIVED"));
        }
        if (MixQueSet.isCard() && this.reviewFloatBar.openNextCardCB) {
            return;
        }

        if (this.data.settings.autoNextNote) {
            if (!this.lastSelectedReviewDeck) {
                const reviewDeckKeys: string[] = Object.keys(this.reviewDecks);
                if (reviewDeckKeys.length > 0) this.lastSelectedReviewDeck = reviewDeckKeys[0];
                else {
                    new Notice(t("ALL_CAUGHT_UP"));
                    return;
                }
            }
            this.reviewNextNote(this.lastSelectedReviewDeck);
        }
    }

    async reviewNextNoteModal(): Promise<void> {
        const reviewDeckNames: string[] = Object.keys(this.reviewDecks);
        if (reviewDeckNames.length === 0) {
            this.reviewFloatBar.close();
            new Notice(t("ALL_CAUGHT_UP"));
            return;
        }
        if (reviewDeckNames.length === 1) {
            this.reviewNextNote(reviewDeckNames[0]);
        } else if (this.data.settings.reviewingNoteDirectly) {
            const rdname =
                this.lastSelectedReviewDeck ??
                IReviewNote.getDeckNameForReviewDirectly(this.reviewDecks) ??
                reviewDeckNames[0];
            this.reviewNextNote(rdname);
        } else {
            const deckSelectionModal = new ReviewDeckSelectionModal(this.app, reviewDeckNames);
            deckSelectionModal.submitCallback = (deckKey: string) => this.reviewNextNote(deckKey);
            deckSelectionModal.open();
        }
    }

    async reviewNextNote(deckKey: string): Promise<void> {
        if (!Object.prototype.hasOwnProperty.call(this.reviewDecks, deckKey)) {
            new Notice(t("NO_DECK_EXISTS", { deckName: deckKey }));
            return;
        }
        for (const deckKey in this.reviewDecks) {
            const reviewDeck = this.reviewDecks[deckKey];
            if (this.data.settings.showSchedulingDebugMessages) {
                console.log("[SR Debug] Calling sortNotes for deck:", deckKey);
            }
            reviewDeck.sortNotes(this.linkRank.pageranks);
            if (this.data.settings.showSchedulingDebugMessages) {
                console.log("[SR Debug] sortNotes completed for deck:", deckKey);
            }
        }
        this.lastSelectedReviewDeck = deckKey;
        const deck = this.reviewDecks[deckKey];
        let show = false;
        let item;
        let index = -1;

        MixQueSet.calcNext(deck.dueNotesCount, deck.newNotes.length);

        const isPreviewUndueNote = (item: RepetitionItem) => {
            return item.nextReview > Date.now() && !item.isDue;
        };
        const fShowItemInfo = (item: RepetitionItem, msg: string) => {
            if (this.data.settings.dataLocation !== DataLocation.SaveOnNoteFile) {
                if (isPreviewUndueNote(item)) {
                    const calcDueCnt = deck.scheduledNotes.filter(
                        (snote) => snote.dueUnix < Date.now(),
                    ).length;
                    if (calcDueCnt !== deck.dueNotesCount) {
                        debug(
                            "check cnt",
                            0,
                            msg,
                            `${deck.deckName} due cnt error: calc ${calcDueCnt}, dnc: ${deck.dueNotesCount}`,
                        );
                        if (this.data.settings.showSchedulingDebugMessages) {
                            console.debug("schedNotes:", deck.scheduledNotes);
                        }
                    }
                    const id = `${this.manifest.id}:view-item-info`;
                    // eslint-disable-next-line
                    // @ts-ignore
                    this.app.commands.executeCommandById(id);
                }
            }
        };

        if (MixQueSet.isDue() && deck.dueNotesCount > 0) {
            index = IReviewNote.getNextNoteIndex(
                deck.dueNotesCount,
                this.data.settings.openRandomNote,
            );
            await this.app.workspace.getLeaf().openFile(deck.scheduledNotes[index].note);
            item = deck.scheduledNotes[index].item;
            fShowItemInfo(item, "scheduledNoes index: " + index);
            show = true;
        }
        if (!show && deck.newNotes.length > 0) {
            const index = IReviewNote.getNextNoteIndex(
                deck.newNotes.length,
                this.data.settings.openRandomNote,
            );
            await this.app.workspace.getLeaf().openFile(deck.newNotes[index].note);
            item = deck.newNotes[index].item;
            fShowItemInfo(item, "newNotes index:" + index);
            show = true;
            // return;
        }
        if (show) {
            this.reviewFloatBar.display(item);
            // fShowItemInfo(item);
            return;
        }

        if (
            this.data.settings.reviewingNoteDirectly &&
            this.noteStats.onDueCount + this.noteStats.newCount > 0
        ) {
            const rdname: string = IReviewNote.getDeckNameForReviewDirectly(this.reviewDecks);
            if (rdname != undefined) {
                this.reviewNextNote(rdname);
                return;
            }
        }

        const laterSize = Object.values(this.reviewDecks).reduce((total, reviewDeck) => {
            const futureCount = reviewDeck.scheduledNotes.filter(
                (snote) => (snote.dueUnix ?? 0) > Date.now(),
            ).length;
            return total + futureCount;
        }, 0);
        ReviewView.nextReviewNotice(IReviewNote.minNextView, laterSize);

        this.reviewFloatBar.close();
        this.reviewQueueView.redraw();
        new Notice(t("ALL_CAUGHT_UP"));
    }

    createSrTFile(note: TFile): SrTFile {
        return new SrTFile(this.app.vault, this.app.metadataCache, note);
    }

    async loadPluginData(): Promise<void> {
        const loadedData: PluginData = await this.loadData();
        if (loadedData?.settings) upgradeSettings(loadedData.settings);
        this.data = Object.assign({}, DEFAULT_DATA, loadedData);
        this.data.settings = Object.assign({}, DEFAULT_SETTINGS, this.data.settings);
        this.store = new DataStore(this.data.settings, this.manifest.dir);
        await this.store.load();
        this.noteReviewStore = new NoteReviewStore(this.data.settings, this.manifest.dir);
        await this.noteReviewStore.load();
        await this.noteReviewStore.migrateFromLegacyStore(this.store);
        this.reviewCommitStore = new ReviewCommitStore(this.data.settings, this.manifest.dir);
        await this.reviewCommitStore.load();
        this.easeByPath = new NoteEaseList(this.data.settings);
        this.linkRank = new LinkRank(this.data.settings, this.app.metadataCache);
        this.reviewDecks = this.noteReviewStore.buildReviewDecks(this.app.vault);
        this.updateAndSortDueNotes();
        setDebugParser(this.data.settings.showParserDebugMessages);
    }

    async savePluginData(): Promise<void> {
        // 注意：learningQueue 不再需要在这里序列化
        // 学习状态已经存储在 RepetitionItem.learningStep 中，由 store.save() 管理
        await this.saveData(this.data);

        // ====== License 防破解检测点 B：保存时随机校验 vaultId ======
        // 10% 的概率检查一下设备指纹是否匹配，防止用户复制别人的 data.json
        if (Math.random() < 0.1 && this.data.settings.isPro && this.data.settings.vaultId) {
            try {
                const licMgr = LicenseManager.getInstance();
                await licMgr.verifyVaultId(this.data.settings);
                // 如果 verifyVaultId 发现不匹配，它会直接代写 settings。再保存一次。
                if (!this.data.settings.isPro) {
                    await this.saveData(this.data);
                }
            } catch {
                // 校验失败不影响正常保存
            }
        }
    }

    private getActiveLeaf(type: string): WorkspaceLeaf | null {
        const leaves = this.app.workspace.getLeavesOfType(type);
        if (leaves.length == 0) {
            return null;
        }

        return leaves[0];
    }

    private async initReviewQueueView() {
        // Unregister existing view first to prevent duplicates
        this.app.workspace.detachLeavesOfType(REVIEW_QUEUE_VIEW_TYPE);

        this.registerView(
            REVIEW_QUEUE_VIEW_TYPE,
            (leaf) => (this.reviewQueueView = new ReactNoteReviewView(leaf, this)),
        );

        if (
            this.data.settings.enableNoteReviewPaneOnStartup &&
            this.getActiveLeaf(REVIEW_QUEUE_VIEW_TYPE) == null
        ) {
            await this.activateReviewQueueViewPanel();
        }
    }

    private async activateReviewQueueViewPanel() {
        await this.app.workspace.getRightLeaf(false).setViewState({
            type: REVIEW_QUEUE_VIEW_TYPE,
            active: true,
        });

        // --- 核心修改：首次打开侧边栏时触发 GC ---
        if (!this.hasPerformedInitialGC) {
            // 使用 setTimeout 避免阻塞界面渲染，给界面一点初始化时间
            setTimeout(async () => {
                if (this.data.settings.showSchedulingDebugMessages) {
                    console.log("[SR-Init] 首次激活复习视图，触发后台全局垃圾回收 (GC)...");
                }
                await this.store.performGlobalGarbageCollection();
                this.hasPerformedInitialGC = true;
                // GC 后可能 ID 映射变了，刷新一下视图
                if (this.reviewQueueView && this.reviewQueueView.redraw) {
                    this.reviewQueueView.redraw();
                }
            }, 1000);
        }
    }

    private async openReviewQueueView() {
        let reviewQueueLeaf = this.getActiveLeaf(REVIEW_QUEUE_VIEW_TYPE);
        if (reviewQueueLeaf == null) {
            await this.activateReviewQueueViewPanel();
            reviewQueueLeaf = this.getActiveLeaf(REVIEW_QUEUE_VIEW_TYPE);
        }

        if (reviewQueueLeaf !== null) {
            this.app.workspace.revealLeaf(reviewQueueLeaf);
            this.updateAndSortDueNotes();
        }
    }

    showSyncInfo() {
        if (!this.data.settings.showSchedulingDebugMessages) {
            return;
        }
        console.log(`SR: ${t("EASES")}`, this.easeByPath);
        console.log(`SR: ${t("DECKS")}`, this.deckTree);
        console.log(`SR: NOTE ${t("DECKS")}`, this.reviewDecks);
        console.log("SR: cardStats ", this.cardStats);
        console.log("SR: noteStats ", this.noteStats);
        console.log("SR: this.dueDatesNotes", this.dueDatesNotes);
    }

    public updateStatusBarVisibility() {
        const visible = this.data.settings.showStatusBar !== false;
        const display = visible ? "" : "none";
        if (this.statusBarNote) this.statusBarNote.style.display = display;
        if (this.statusBarFlashcard) this.statusBarFlashcard.style.display = display;
    }

    updateStatusBar() {
        this.updateStatusBarVisibility();
        if (this.data.settings.showStatusBar === false) return;
        if (!this.statusBarNote || !this.statusBarFlashcard) return;
        if (!this.noteStats) return;
        // 获取到期数值
        const dueNotesCount = this.noteStats.onDueCount;
        const dueFlashcardsCount = this.remainingDeckTree
            ? this.remainingDeckTree.getDistinctCardCount(CardListType.All, true)
            : 0;

        // --- 更新笔记状态栏 ---
        this.statusBarNote.empty();
        const noteSpan = this.statusBarNote.createSpan({
            cls: "syro-status-note",
            text:
                dueNotesCount === 1
                    ? t("STATUS_BAR_NOTE_DUE_SINGULAR", {
                          dueNotesCount: dueNotesCount.toString(),
                      })
                    : t("STATUS_BAR_NOTE_DUE", { dueNotesCount: dueNotesCount.toString() }),
        });
        if (dueNotesCount > 0) {
            noteSpan.classList.add("is-due");
        }
        setTooltip(
            this.statusBarNote,
            dueNotesCount === 1
                ? t("STATUS_BAR_NOTE_DUE_SINGULAR", { dueNotesCount: dueNotesCount.toString() })
                : t("STATUS_BAR_NOTE_DUE", { dueNotesCount: dueNotesCount.toString() }),
            { placement: "top" },
        );

        // --- 更新卡片状态栏 ---
        this.statusBarFlashcard.empty();
        const cardSpan = this.statusBarFlashcard.createSpan({
            cls: "syro-status-card",
            text:
                dueFlashcardsCount === 1
                    ? t("STATUS_BAR_FLASHCARD_DUE_SINGULAR", {
                          dueFlashcardsCount: dueFlashcardsCount.toString(),
                      })
                    : t("STATUS_BAR_FLASHCARD_DUE", {
                          dueFlashcardsCount: dueFlashcardsCount.toString(),
                      }),
        });
        if (dueFlashcardsCount > 0) {
            cardSpan.classList.add("is-due");
        }
        setTooltip(
            this.statusBarFlashcard,
            dueFlashcardsCount === 1
                ? t("STATUS_BAR_FLASHCARD_DUE_SINGULAR", {
                      dueFlashcardsCount: dueFlashcardsCount.toString(),
                  })
                : t("STATUS_BAR_FLASHCARD_DUE", {
                      dueFlashcardsCount: dueFlashcardsCount.toString(),
                  }),
            { placement: "top" },
        );
    }

    /**
     * 根据设置更新状态栏的动态 CSS 样式（呼吸灯 / 闪烁）
     * 每次设置变更时调用，实时生效无需重启
     */
    updateStatusBarStyles() {
        const styleId = "syro-status-bar-style";
        let styleEl = document.getElementById(styleId) as HTMLStyleElement;

        if (!styleEl) {
            styleEl = document.createElement("style");
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }

        const s = this.data.settings;

        // --- 若关闭总开关，或者没有任何动画设置，则清空样式并退出 ---
        if (!s.showStatusBarDueNotification) {
            styleEl.textContent = "";
            return;
        }

        // Keyframes definition - Removed glow/text-shadow
        const keyframes = `
            @keyframes syro-breathe {
                0% { opacity: 0.6; }
                50% { opacity: 1; }
                100% { opacity: 0.6; }
            }
        `;

        // Map animation names based on settings
        // ============ 状态栏呼吸灯动画类型 ============
        const noteAnim = s.noteStatusBarAnimation === "Breathing" ? "syro-breathe" : "none";
        const cardAnim = s.flashcardStatusBarAnimation === "Breathing" ? "syro-breathe" : "none";

        styleEl.textContent = `
            ${keyframes}

            .syro-status-note.is-due {
                color: ${s.noteStatusBarColor};
                animation: ${noteAnim} ${s.noteStatusBarPeriod}s infinite ease-in-out;
            }

            .syro-status-card.is-due {
                color: ${s.flashcardStatusBarColor};
                animation: ${cardAnim} ${s.flashcardStatusBarPeriod}s infinite ease-in-out;
            }

            .syro-sb-sep {
                opacity: 0.7;
            }
        `;
    }

    public registerSRFocusListener() {
        this.registerEvent(
            this.app.workspace.on("active-leaf-change", this.handleFocusChange.bind(this)),
        );
    }

    public removeSRFocusListener() {
        this.setSRViewInFocus(false);
        this.app.workspace.off("active-leaf-change", this.handleFocusChange.bind(this));
    }

    public async getPreparedDecksForSingleNoteReview(
        file: TFile,
        mode: FlashcardReviewMode,
    ): Promise<{ deckTree: Deck; remainingDeckTree: Deck; mode: FlashcardReviewMode }> {
        const note: Note = await this.loadNote(file);

        const deckTree = new Deck("root", null);
        note.appendCardsToDeck(deckTree);
        const remainingDeckTree = DeckTreeFilter.filterForRemainingCards(
            this.questionPostponementList,
            deckTree,
            mode,
        );

        return { deckTree, remainingDeckTree, mode };
    }

    public getPreparedReviewSequencer(
        fullDeckTree: Deck,
        remainingDeckTree: Deck,
        reviewMode: FlashcardReviewMode,
    ): { reviewSequencer: IFlashcardReviewSequencer; mode: FlashcardReviewMode } {
        const deckIterator: IDeckTreeIterator = SRPlugin.createDeckTreeIterator(
            this.data.settings,
            remainingDeckTree,
        );

        const cardScheduleCalculator = new CardScheduleCalculator(
            this.data.settings,
            this.easeByPath,
        );
        const reviewSequencer: IFlashcardReviewSequencer = new FlashcardReviewSequencer(
            reviewMode,
            deckIterator,
            this.data.settings,
            cardScheduleCalculator,
            this.questionPostponementList,
        );

        reviewSequencer.setDeckTree(fullDeckTree, remainingDeckTree);
        return { reviewSequencer, mode: reviewMode };
    }

    public handleFocusChange(leaf: WorkspaceLeaf | null) {
        this.setSRViewInFocus(leaf !== null && leaf.view instanceof TabView);
    }

    public setSRViewInFocus(value: boolean) {
        this.isSRInFocus = value;
    }

    public getSRInFocusState(): boolean {
        return this.isSRInFocus;
    }

    /**
     * 将运行时学习队列同步到 Deck 树的 learningFlashcards 中
     * 用于在 DeckUI.show() 时确保学习计数正确显示
     */
    public syncLearningQueueToDecks(): void {
        if (!this.learningQueue || this.learningQueue.length === 0) return;
        if (!this.remainingDeckTree) return;

        for (const item of this.learningQueue) {
            const card = item.card;
            if (!card) continue;

            // 找到卡片所属的 deck
            const topicPath = card.question?.topicPathList?.list[0];
            if (!topicPath) continue;

            const deck = this.remainingDeckTree.getDeck(topicPath);
            if (!deck) continue;

            // 确保卡片在 learningFlashcards 中
            if (!deck.learningFlashcards.includes(card)) {
                deck.learningFlashcards.push(card);
            }
        }
    }

    /**
     * 从 DataStore 的 RepetitionItem 收集学习中的卡片
     * 遍历一次 Deck 树，检查每张卡片的 isInLearningPhase
     * 如果是学习中且到期，将卡片移动到 learningFlashcards 并加入全局队列
     *
     * 复杂度：O(N)，N 为总卡片数
     */
    private collectLearningCardsFromStore(deckTree: Deck): void {
        this.learningQueue = [];
        let movedCount = 0;

        const traverse = (deck: Deck) => {
            const deckPath = deck.getTopicPath()?.path?.join("/") || deck.deckName;

            // 1. 处理新卡列表中的错位卡片
            for (let i = deck.newFlashcards.length - 1; i >= 0; i--) {
                const card = deck.newFlashcards[i];
                if (card.repetitionItem?.isInLearningPhase) {
                    deck.newFlashcards.splice(i, 1);
                    deck.learningFlashcards.push(card);
                    movedCount++;
                    if (this.data.settings.showSchedulingDebugMessages) {
                        console.log(
                            `[SR-Debug] 纠正学习卡片物理位置: ID=${card.Id} 从 New 移至 Learning (牌组: ${deckPath})`,
                        );
                    }
                }
            }

            // 2. 处理到期卡列表中的错位卡片
            for (let i = deck.dueFlashcards.length - 1; i >= 0; i--) {
                const card = deck.dueFlashcards[i];
                if (card.repetitionItem?.isInLearningPhase) {
                    deck.dueFlashcards.splice(i, 1);
                    deck.learningFlashcards.push(card);
                    movedCount++;
                    if (this.data.settings.showSchedulingDebugMessages) {
                        console.log(
                            `[SR-Debug] 纠正学习卡片物理位置: ID=${card.Id} 从 Due 移至 Learning (牌组: ${deckPath})`,
                        );
                    }
                }
            }

            // 3. 将当前牌组中所有的学习卡加入全局学习队列
            for (const card of deck.learningFlashcards) {
                this.learningQueue.push({
                    card,
                    dueTime: card.repetitionItem?.nextReview ?? 0,
                    deckName: deckPath,
                });
            }

            // 递归处理子牌组
            for (const subdeck of deck.subdecks) {
                traverse(subdeck);
            }
        };

        traverse(deckTree);

        if (this.data.settings.showSchedulingDebugMessages) {
            if (movedCount > 0) {
                console.log(
                    `[SR-Debug] collectLearningCardsFromStore: 共纠正了 ${movedCount} 张错位学习卡。`,
                );
            }
            console.log(`[SR-Debug] 当前全局学习队列长度: ${this.learningQueue.length}`);
        }

        // 按 dueTime 排序学习队列
        this.learningQueue.sort((a, b) => a.dueTime - b.dueTime);
    }
}
