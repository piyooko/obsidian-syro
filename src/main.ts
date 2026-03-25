/**
 * 杩欎釜鏂囦欢涓昏鏄共浠€涔堢殑锛?
 * 瀹冩槸鏁翠釜鎻掍欢鐨勨€滃ぇ绠″鈥濆拰绗竴鍏ュ彛銆?
 * 褰撴彃浠惰鎵撳紑鏃讹紝瀹冩槸鏈€鍏堝紑濮嬪伐浣滅殑锛岃礋璐ｆ妸鍏朵粬鎵€鏈夌殑鍔熻兘妯″潡锛堟瘮濡備繚瀛樻暟鎹€佺畻娉曘€佹樉绀哄悇涓晫闈€佹彁渚涘揩鎹锋寚浠わ級鍏ㄩ儴缁勮璧锋潵骞惰瀹冧滑寮€濮嬩笂鐝€?
 * 姣忓ぉ鍏虫帀鎻掍欢鏃讹紝瀹冧篃璐熻矗璁╁ぇ瀹剁粺涓€涓嬬彮浼戞伅銆?
 * 瀹冭繕鍋峰伔鍔犱簡涓姛鑳斤細闅忔椂鏍稿褰撳墠鐢ㄦ埛鐨勮韩浠斤紝濡傛灉鏄厤璐圭敤鎴风敤鍒伴珮绾у揩鎹烽敭锛堟瘮濡傜壒娈婄殑濉┖棰樺埗浣滈敭锛夛紝瀹冨氨浼氭嫤涓嬫潵涓嶈鐢ㄣ€?
 *
 * 瀹冨湪椤圭洰涓睘浜庯細閫昏緫灞?
 *
 * 瀹冧細鐢ㄥ埌鍝簺鏂囦欢锛?
 * 杩欎釜澶х瀹跺嚑涔庝細鐢ㄥ埌椤圭洰閲岀殑鎵€鏈夋牳蹇冩枃浠讹紝姣斿锛?
 * 1. src/settings.ts 鈥?鑾峰彇鐢ㄦ埛鐨勫亸濂借缃?
 * 2. src/dataStore/data.ts 鈥?鑾峰彇淇濆瓨鐨勫涔犳暟鎹?
 * 3. src/ui/views/* 鈥?璐熻矗璋冨嚭鍚勭鏄剧ず鐣岄潰
 * 4. src/services/LicenseManager.ts 鈥?鐢ㄦ潵楠岃瘉鐢ㄦ埛鐨勬縺娲荤爜瀵逛笉瀵癸紝鏄笉鏄珮绾т細鍛?
 *
 * 鍝簺鏂囦欢浼氱敤鍒板畠锛?
 * 涓昏鐢辩瑪璁拌蒋浠舵湰韬潵鍛煎彨瀹冦€?
 * 鍚屾椂锛屽叾浠栧緢澶氶渶瑕佽窡澶х瀹惰淇℃伅鐨勫湴鏂逛篃浼氭壘瀹冦€?
 */
import {
    App,
    getAllTags,
    Notice,
    Plugin,
    TAbstractFile,
    TFile,
    Vault,
    setTooltip,
    WorkspaceLeaf,
} from "obsidian";
import graph from "pagerank.js";

import {
    DEFAULT_SETTINGS,
    DEFAULT_SYNC_PROGRESS_DISPLAY_MODE,
    SettingsUtil,
    SRSettings,
    SyncProgressDisplayMode,
    upgradeSettings,
} from "src/settings";
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
import { convertToStringOrEmpty } from "./util/utils";
import { setDebugParser } from "src/parser";

// Legacy migration note retained from the pre-Syro codebase.
import { DataStore } from "./dataStore/data";
import { DataLocation } from "./dataStore/dataLocation";
import { NoteReviewStore, NoteReviewSource } from "./dataStore/noteReviewStore";
import Commands from "./commands";
import { SrsAlgorithm } from "src/algorithms/algorithms";

import { reviewResponseModal } from "src/ui/modals/reviewresponse-modal";
import { debug, isIgnoredPath, isVersionNewerThanOther } from "./util/utils_recall";
import { ReleaseNotes } from "src/ui/modals/ReleaseNotes";
import { DEFAULT_DECKNAME } from "./constants";

import { algorithms } from "src/algorithms/algorithms_switch";
import { addFileMenuEvt, registerTrackFileEvents } from "./Events/trackFileEvents";
import { SyncEvents } from "./Events/SyncEvents";
import { ItemTrans, itemToShedNote } from "./dataStore/itemTrans";
import { LinkRank } from "src/algorithms/priorities/linkPageranks";
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
import {
    getArrayProp,
    getNumberProp,
    getStringProp,
    isRecord,
    parseJsonUnknown,
} from "./util/typeGuards";
import { SyncProgressTip } from "src/ui/components/SyncProgressTip";
import { Tags } from "./tags";
import {
    deserializeNote,
    NOTE_CACHE_VERSION,
    PersistedNoteCacheFile,
    PersistedNoteCacheItem,
    serializeNote,
    SerializedNote,
    validateCachedNoteBindings,
} from "src/cache/noteCacheStore";
import { ReviewCommitStore } from "src/dataStore/reviewCommitStore";
import { ReviewPersistenceCoordinator } from "src/services/reviewPersistenceCoordinator";
import { autoCommitReviewResponseToTimeline } from "src/ui/timeline/reviewResponseTimeline";
import {
    mergeQueuedSyncRequest,
    normalizeSyncRequest,
    type NormalizedSyncRequest,
    type SyncMode,
    type SyncRequestOptions,
    type SyncRequestResult,
    type SyncTrigger,
} from "src/syncRequest";
import {
    FIRST_RUN_TUTORIAL_NOTE_CONTENT,
    FIRST_RUN_TUTORIAL_NOTE_PATH,
} from "src/firstRunTutorial";

// 姣忔棩鐗岀粍缁熻鏁版嵁缁撴瀯锛堟寔涔呭寲瀛樺偍锛?
// 姣忔棩鐗岀粍缁熻鏁版嵁缁撴瀯锛堟寔涔呭寲瀛樺偍锛?
interface DailyDeckStats {
    date: string; // 璁板綍鏃ユ湡锛屼緥濡?"2023-12-01"
    // 鐗岀粍鍚?-> 璁℃暟
    counts: Record<string, { new: number; review: number }>;
}

// 杩愯鏃跺涔犻槦鍒楅」锛堜笉鍐嶉渶瑕佹寔涔呭寲鍒?plugin.data锛岀姸鎬佸瓨鍦?RepetitionItem.learningStep锛?
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
    // 鎸佷箙鍖栧瓨鍌ㄦ瘡鏃ョ粺璁?
    dailyDeckStats: DailyDeckStats;
    // 娉ㄦ剰锛歭earningQueue 涓嶅啀瀛樺偍鍦ㄨ繖閲岋紝鐘舵€佸凡绉昏嚦 RepetitionItem.learningStep
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
    public data: PluginData;
    // 鍙岀畻娉曟灦鏋?
    cardAlgorithm: SrsAlgorithm; // 鍗＄墖澶嶄範绠楁硶
    noteAlgorithm: SrsAlgorithm; // 绗旇澶嶄範绠楁硶

    /**
     * 鏍规嵁椤圭洰绫诲瀷鑾峰彇瀵瑰簲鐨勭畻娉曞疄渚?
     */
    getAlgorithmForItem(itemType: RPITEMTYPE): SrsAlgorithm {
        return itemType === RPITEMTYPE.CARD ? this.cardAlgorithm : this.noteAlgorithm;
    }

    // eTextScheduleStore: TextScheduleStore;  // 宸茬粡鍦ㄤ笅闈㈢殑浠ｇ爜涓畾涔?
    public tabViewManager: TabViewManager;
    public syncLock = false;
    private readonly activeLeafChangeHandler = (leaf: WorkspaceLeaf | null): void => {
        this.handleFocusChange(leaf);
    };

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
    private lastSuccessfulCardCaptureSignature = "";
    private pendingCardCapturePromptSignature = "";
    private pendingSyncRequest: NormalizedSyncRequest | null = null;
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
    public reviewPersistenceCoordinator: ReviewPersistenceCoordinator;

    /** 浜嬩欢鎬荤嚎锛氬悓姝ュ畬鎴愬悗骞挎挱娑堟伅锛岄€氱煡宸叉墦寮€鐨?UI 缁勪欢灞€閮ㄥ埛鏂版暟瀛?*/
    public syncEvents: SyncEvents = new SyncEvents();

    public clock_start: number;

    // 瀛︿範闃熷垪锛氬瓨鍌ㄥ湪鎻掍欢绾у埆锛屽叧闂涔犵晫闈㈠悗浠嶇劧淇濈暀
    // 鏍煎紡: { card: Card, dueTime: number, deckName: string }[]
    public learningQueue: Array<{ card: Card; dueTime: number; deckName: string }> = [];

    private hasPerformedInitialGC = false;
    private pendingPluginDataSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingPluginDataSaveRequested = false;
    private pendingPluginDataSavePromise: Promise<boolean> | null = null;
    private pluginDataSaveFailureNotified = false;

    private static _instance: SRPlugin;
    static getInstance() {
        return SRPlugin._instance;
    }

    private runAsync(task: Promise<unknown>, label: string): void {
        void task.catch((error: unknown) => {
            console.error(`[SR] ${label} failed`, error);
        });
    }

    private clearPendingPluginDataSaveTimer(): void {
        if (this.pendingPluginDataSaveTimer !== null) {
            clearTimeout(this.pendingPluginDataSaveTimer);
            this.pendingPluginDataSaveTimer = null;
        }
    }

    public requestPluginDataSave(delayMs = 350): void {
        this.pendingPluginDataSaveRequested = true;
        this.clearPendingPluginDataSaveTimer();
        this.pendingPluginDataSaveTimer = setTimeout(() => {
            this.pendingPluginDataSaveTimer = null;
            this.runAsync(this.flushPendingPluginDataSave(), "flush queued plugin data");
        }, delayMs);
    }

    public async flushPendingPluginDataSave(timeoutMs = 1500): Promise<boolean> {
        this.clearPendingPluginDataSaveTimer();
        if (!this.pendingPluginDataSaveRequested && this.pendingPluginDataSavePromise === null) {
            return true;
        }

        if (this.pendingPluginDataSavePromise === null) {
            this.pendingPluginDataSavePromise = (async () => {
                this.pendingPluginDataSaveRequested = false;
                try {
                    await this.savePluginData();
                    this.pluginDataSaveFailureNotified = false;
                    return true;
                } catch (error) {
                    console.error("[SR] flush queued plugin data failed", error);
                    this.pendingPluginDataSaveRequested = true;
                    if (!this.pluginDataSaveFailureNotified) {
                        this.pluginDataSaveFailureNotified = true;
                        new Notice(t("DATA_UNABLE_TO_SAVE"));
                    }
                    this.requestPluginDataSave(1000);
                    return false;
                } finally {
                    this.pendingPluginDataSavePromise = null;
                    if (
                        this.pendingPluginDataSaveRequested &&
                        this.pendingPluginDataSaveTimer === null
                    ) {
                        this.requestPluginDataSave(0);
                    }
                }
            })();
        }

        const result = await Promise.race([
            this.pendingPluginDataSavePromise,
            new Promise<boolean>((resolve) => {
                setTimeout(() => resolve(false), timeoutMs);
            }),
        ]);

        return result && !this.pendingPluginDataSaveRequested;
    }

    public async flushReviewPersistence(timeoutMs = 1500): Promise<boolean> {
        const results = await Promise.race([
            Promise.all([
                this.store?.drainReviewOverlayFlush(timeoutMs) ?? Promise.resolve(true),
                this.flushPendingPluginDataSave(timeoutMs),
                this.reviewPersistenceCoordinator?.drain(timeoutMs) ?? Promise.resolve(true),
            ]).then((values) => values.every(Boolean)),
            new Promise<boolean>((resolve) => {
                setTimeout(() => resolve(false), timeoutMs);
            }),
        ]);

        if (!results) {
            new Notice("Syro: review changes are still pending save and will keep retrying.");
        }

        return results;
    }

    private getReviewQueueView(): ReactNoteReviewView | null {
        const leaf = this.getActiveLeaf(REVIEW_QUEUE_VIEW_TYPE);
        if (leaf == null) {
            return null;
        }

        return leaf.view instanceof ReactNoteReviewView ? leaf.view : null;
    }

    redrawReviewQueueView(): void {
        this.getReviewQueueView()?.redraw();
    }

    onload(): void {
        this.runAsync(this.performOnload(), "plugin load");
    }

    private async performOnload(): Promise<void> {
        // Closes all still open tab views when the plugin is loaded, because it causes bugs / empty windows otherwise
        this.tabViewManager = new TabViewManager(this);
        this.app.workspace.onLayoutReady(() => {
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

        // 娉ㄥ唽 Anki Cloze 缂栬緫鍣ㄨ楗版墿灞曪紙Linear 椋庢牸棰勮锛?
        initializeClozeDecoration(this.app);
        this.registerEditorExtension(clozeDecorationPlugin);

        // 娉ㄥ唽 LaTeX Cloze 缂栬緫鍣ㄦ墿灞?
        initializeLatexPopover(this.app, {
            isEnabled: () => this.data.settings.enableLatexPopover === true,
        });
        this.registerEditorExtension(latexPopoverExtension);

        // 娉ㄥ唽 LaTeX Cloze 棰勫鐞嗗櫒 (浣跨敤 atomic ranges)
        this.registerEditorExtension(latexClozePreprocessorPlugin);

        // 娉ㄥ唽鏍囧噯 Cloze Markdown 鍚庡鐞嗗櫒 (闃呰妯″紡)
        this.registerMarkdownPostProcessor(clozePostProcessor);

        const PLUGIN_VERSION = this.manifest.version;
        const obsidianJustInstalled = this.data.settings.previousRelease === "0.0.0";
        if (isVersionNewerThanOther(PLUGIN_VERSION, this.data.settings.previousRelease)) {
            new ReleaseNotes(this.app, this, obsidianJustInstalled ? null : PLUGIN_VERSION).open();
        }

        upgradeSettings(this.data.settings);

        // 纭繚algorithmSettings涓湁瀵瑰簲绠楁硶鐨勯厤缃?
        if (!this.data.settings.algorithmSettings[this.data.settings.cardAlgorithm]) {
            this.data.settings.algorithmSettings[this.data.settings.cardAlgorithm] =
                algorithms[this.data.settings.cardAlgorithm]?.defaultSettings() || {};
        }
        if (!this.data.settings.algorithmSettings[this.data.settings.noteAlgorithm]) {
            this.data.settings.algorithmSettings[this.data.settings.noteAlgorithm] =
                algorithms[this.data.settings.noteAlgorithm]?.defaultSettings() || {};
        }

        // 鍒濆鍖栧崱鐗囧涔犵畻娉?
        this.cardAlgorithm = algorithms[this.data.settings.cardAlgorithm];
        if (this.cardAlgorithm) {
            this.cardAlgorithm.updateSettings(
                this.data.settings.algorithmSettings[this.data.settings.cardAlgorithm],
            );
        }

        // 鍒濆鍖栫瑪璁板涔犵畻娉?
        this.noteAlgorithm = algorithms[this.data.settings.noteAlgorithm];
        if (this.noteAlgorithm) {
            this.noteAlgorithm.updateSettings(
                this.data.settings.algorithmSettings[this.data.settings.noteAlgorithm],
            );
        }

        // 淇濈暀algorithm瀛楁鐢ㄤ簬鍏煎鎬э紙鎸囧悜noteAlgorithm锛?
        this.algorithm = this.noteAlgorithm;

        // Update settings for both algorithms in the plugin data
        const settings = this.data.settings;
        if (this.cardAlgorithm && this.cardAlgorithm.settings) {
            settings.algorithmSettings[settings.cardAlgorithm] = this.cardAlgorithm.settings;
        }
        if (this.noteAlgorithm && this.noteAlgorithm.settings) {
            settings.algorithmSettings[settings.noteAlgorithm] = this.noteAlgorithm.settings;
        }

        if (obsidianJustInstalled) {
            await this.initializeFirstRunTutorialNote();
        }

        this.runAsync(this.savePluginData(), "save plugin data");

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
                this.runAsync(this.saveReviewResponse(openFile, resp), "save review response");
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
            this.runAsync(this.reviewNextNote(this.lastSelectedReviewDeck), "review next note");
        };

        registerTrackFileEvents(this);

        this.registerInterval(
            window.setInterval(
                () => {
                    this.runAsync(this.requestSync({ trigger: "background" }), "background sync");
                },
                30 * 60 * 1000,
            ),
        );

        // Initialize Note Status Bar Item
        this.statusBarNote = this.addStatusBarItem();
        this.statusBarNote.classList.add("mod-clickable");
        setTooltip(this.statusBarNote, t("OPEN_NOTE_FOR_REVIEW"), { placement: "top" });
        this.statusBarNote.addEventListener("click", () => {
            this.runAsync(
                this.refreshNoteReview({ trigger: "review-entry" }).then(() => {
                    this.reviewNextNoteModal();
                }),
                "open note review",
            );
        });

        // Initialize Flashcard Status Bar Item
        this.statusBarFlashcard = this.addStatusBarItem();
        this.statusBarFlashcard.classList.add("mod-clickable");
        setTooltip(this.statusBarFlashcard, t("REVIEW_CARDS"), { placement: "top" });
        this.statusBarFlashcard.addEventListener("click", () => {
            if (this.syncLock) {
                return;
            }

            this.runAsync(
                this.requestSync({ trigger: "review-entry" }).then(() => {
                    return this.tabViewManager.openSRTabView(FlashcardReviewMode.Review);
                }),
                "open flashcard review",
            );
        });

        // 鍒濆鍖栫姸鎬佹爮鍛煎惛鐏姩鎬佹牱寮?
        this.updateStatusBarVisibility();
        this.updateStatusBarStyles();
        this.updateStatusBar();

        this.addRibbonIcon("SpacedRepIcon", t("REVIEW_CARDS"), () => {
            if (this.syncLock) {
                return;
            }

            this.runAsync(
                this.requestSync({ trigger: "review-entry" }).then(() => {
                    return this.tabViewManager.openSRTabView(FlashcardReviewMode.Review);
                }),
                "open ribbon flashcard review",
            );
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

                        // 鑾峰彇绗旇鐨?RepetitionItem 浠ヨ绠楀悇閫夐」鐨勫涔犻棿闅斿ぉ鏁?
                        let intervals: number[] | null = null;
                        try {
                            const noteItem = this.noteReviewStore.getItem(fileish.path);
                            if (noteItem) {
                                intervals = this.noteAlgorithm.calcAllOptsIntervals(noteItem);
                            }
                        } catch {
                            // 濡傛灉鑾峰彇澶辫触锛堜緥濡傜瑪璁版湭琚拷韪級锛屽垯涓嶆樉绀洪棿闅?
                        }

                        // === 淇敼锛氫粠 i=0 寮€濮嬶紝浠ュ寘鍚?閲嶆潵"閫夐」 ===
                        for (let i = 0; i < options.length; i++) {
                            menu.addItem((item) => {
                                // 鐢熸垚甯﹂棿闅旂殑鏍囬锛氶毦搴? X澶╁悗
                                let title: string;
                                // 鑾峰彇鏍囧噯鍖栫殑閫夐」鍚嶇О锛堣嫳鏂囷級浠ヤ究鏄犲皠鍒扮炕璇?Key
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
                                    // 娌℃湁闂撮殧淇℃伅鏃讹紙濡傛湭杩借釜鐨勭瑪璁帮級锛屽彧鏄剧ず闅惧害鍚嶇О
                                    title = localizedOption;
                                }
                                item.setTitle(title)
                                    .setIcon("SpacedRepIcon")
                                    .onClick(() => {
                                        this.runAsync(
                                            this.saveReviewResponse(fileish, i),
                                            "save file menu review response",
                                        );
                                    });
                            });
                        }

                        // 娣诲姞鍒嗛殧绗?
                        menu.addSeparator();

                        // 娣诲姞"璁剧疆閲嶈鎬?鑿滃崟椤?
                        menu.addItem((item) => {
                            // 鑾峰彇褰撳墠绗旇鐨?RepetitionItem
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
                                        (newPriority: number) => {
                                            if (!noteItem) {
                                                return;
                                            }

                                            this.runAsync(
                                                (async () => {
                                                    // 鏇存柊閲嶈鎬?
                                                    noteItem.priority = newPriority;
                                                    await this.noteReviewStore.save();
                                                    // 鍒锋柊渚ц竟鏍?
                                                    this.updateAndSortDueNotes();
                                                    this.syncEvents.emit("note-review-updated");
                                                    new Notice(`${t("PRIORITY")}: ${newPriority}`);
                                                })(),
                                                "save note priority",
                                            );
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
            callback: () => {
                this.runAsync(
                    this.refreshNoteReview({ trigger: "review-entry" }).then(() => {
                        this.reviewNextNoteModal();
                    }),
                    "open note review command",
                );
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
                        this.runAsync(
                            this.saveReviewResponse(openFile, i),
                            "save note review response",
                        );
                    }
                },
            });
        });

        this.addCommand({
            id: "srs-review-flashcards",
            name: t("REVIEW_ALL_CARDS"),
            callback: () => {
                if (this.syncLock) {
                    return;
                }

                this.runAsync(
                    this.requestSync({ trigger: "review-entry" }).then(() => {
                        return this.tabViewManager.openSRTabView(FlashcardReviewMode.Review);
                    }),
                    "review all flashcards",
                );
            },
        });

        this.addCommand({
            id: "srs-cram-flashcards",
            name: t("CRAM_ALL_CARDS"),
            callback: () => {
                this.runAsync(
                    this.requestSync({
                        reviewMode: FlashcardReviewMode.Cram,
                        trigger: "review-entry",
                    }).then(() => {
                        return this.tabViewManager.openSRTabView(FlashcardReviewMode.Cram);
                    }),
                    "cram all flashcards",
                );
            },
        });

        this.addCommand({
            id: "srs-review-flashcards-in-note",
            name: t("REVIEW_CARDS_IN_NOTE"),
            callback: () => {
                const openFile: TFile | null = this.app.workspace.getActiveFile();
                if (!openFile || openFile.extension !== "md") {
                    return;
                }

                this.runAsync(
                    this.tabViewManager.openSRTabView(FlashcardReviewMode.Review, openFile),
                    "review flashcards in note",
                );
            },
        });

        this.addCommand({
            id: "srs-cram-flashcards-in-note",
            name: t("CRAM_CARDS_IN_NOTE"),
            callback: () => {
                const openFile: TFile | null = this.app.workspace.getActiveFile();
                if (!openFile || openFile.extension !== "md") {
                    return;
                }

                this.runAsync(
                    this.tabViewManager.openSRTabView(FlashcardReviewMode.Cram, openFile),
                    "cram flashcards in note",
                );
            },
        });

        this.addCommand({
            id: "srs-open-review-queue-view",
            name: t("OPEN_REVIEW_QUEUE_VIEW"),
            callback: () => {
                this.runAsync(this.openReviewQueueView(), "open review queue view");
            },
        });

        // ============ Anki 椋庢牸鎸栫┖蹇嵎閿懡浠?============

        // 鍚岀骇鎸栫┖ (Ctrl+Alt+Shift+C) - 浣跨敤褰撳墠琛屾渶澶?ID
        this.addCommand({
            id: "srs-cloze-same-level",
            name: t("CMD_CREATE_CLOZE_SAME_LEVEL"),
            icon: "flashcards",
            editorCallback: async (editor) => {
                // 銆愪粯璐瑰姛鑳介檺鍒躲€?
                const licMgr = LicenseManager.getInstance(this);
                if (!(await licMgr.checkFeatureAccess("Anki 鎸栫┖"))) return;
                this.insertAnkiCloze(editor, "same");
            },
        });

        // 鏂扮骇鎸栫┖ (Alt+Shift+C) - 浣跨敤 maxId + 1
        this.addCommand({
            id: "srs-cloze-new-level",
            name: t("CMD_CREATE_CLOZE_NEW_LEVEL"),
            icon: "flashcards",
            editorCallback: async (editor) => {
                // 銆愪粯璐瑰姛鑳介檺鍒躲€?
                const licMgr = LicenseManager.getInstance(this);
                if (!(await licMgr.checkFeatureAccess("Anki 鎸栫┖"))) return;
                this.insertAnkiCloze(editor, "new");
            },
        });

        this.settingTab = new SRSettingTab(this.app, this);
        this.addSettingTab(this.settingTab);
        this.app.workspace.trigger("parse-style-settings");

        this.app.workspace.onLayoutReady(() => {
            this.runAsync(this.initReviewQueueView(), "init review queue view");
            void this.refreshNoteReview({ trigger: "startup" });
            setTimeout(() => {
                if (this.syncLock) {
                    return;
                }

                this.runAsync(this.requestSync({ trigger: "startup" }), "startup sync");
            }, 2000);
            // ====== License 闃茬牬瑙ｆ娴嬬偣 A锛氬惎鍔ㄦ椂闈欓粯楠岃瘉 ======
            try {
                const licMgr = LicenseManager.getInstance(this);
                if (this.data.settings.licenseState?.token) {
                    this.runAsync(
                        licMgr.backgroundCheck(this.data.settings).then((isValid) => {
                            if (!isValid && this.data.settings.isPro) {
                                // 鏈嶅姟鍣ㄦ槑纭嫆缁濓紝鎮勬倓闄嶇骇锛屼笉寮圭獥
                                this.data.settings.isPro = false;
                                this.runAsync(this.savePluginData(), "save license downgrade");
                            }
                        }),
                        "license background check",
                    );
                } else {
                    // 娌℃湁 token 涔熻鍒濆鍖栧崟渚嬶紝纭繚鍚庣画鑳界敤
                    LicenseManager.getInstance(this);
                }
            } catch (e) {
                // License 妫€娴嬩笉搴斿奖鍝嶆彃浠舵甯稿惎鍔?
                console.warn("[SR] License backgroundCheck error:", e);
            }
        });

        this.registerSRFocusListener();
    }

    onunload(): void {
        this.runAsync(this.flushReviewPersistence(1000), "flush review persistence on unload");
        this.app.workspace.getLeavesOfType(REVIEW_QUEUE_VIEW_TYPE).forEach((leaf) => leaf.detach());
        this.tabViewManager.closeAllTabViews();
        this.reviewFloatBar.close();
    }

    /**
     * 鎻掑叆 Anki 椋庢牸鎸栫┖
     * @param editor 缂栬緫鍣ㄥ疄渚?
     * @param type "same" - 鍚岀骇鎸栫┖(浣跨敤褰撳墠鏈€澶D), "new" - 鏂扮骇鎸栫┖(maxId+1)
     */
    insertAnkiCloze(editor: import("obsidian").Editor, type: "same" | "new"): void {
        const selection = editor.getSelection();
        if (!selection) {
            new Notice(t("NOTICE_TEXT_SELECTION_REQUIRED"));
            return;
        }

        // 鑾峰彇褰撳墠琛?娈佃惤鐨勬枃鏈潵鍒ゆ柇涓婁笅鏂?ID
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);

        const currentMax = this.getMaxClozeIdFromText(lineText);

        // 璁＄畻瑕佷娇鐢ㄧ殑 ID
        let nextId: number;
        if (type === "same") {
            // 鍚岀骇锛氫娇鐢ㄥ綋鍓嶆渶澶?ID锛屽鏋滄病鏈夊垯涓?1
            nextId = currentMax === 0 ? 1 : currentMax;
        } else {
            // 鏂扮骇锛氫娇鐢?maxId + 1
            nextId = currentMax + 1;
        }

        const replacement = `{{c${nextId}::${selection}}}`;
        editor.replaceSelection(replacement);

        new Notice(t("NOTICE_CLOZE_CREATED", { nextId: nextId.toString() }));
    }

    /**
     * 浠庢枃鏈腑鎻愬彇鏈€澶х殑 Cloze ID
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

    // ========== 姣忔棩缁熻杈呭姪鏂规硶 ==========

    /**
     * 鑾峰彇褰撳墠鐨?閫昏緫鏃ユ湡"
     * 濡傛灉璁剧疆浜嗗噷鏅?4 鐐瑰埛鏂帮紝閭ｄ箞鍑屾櫒 3 鐐逛粛鐒跺睘浜?鏄ㄥぉ"
     */
    public getRolloverDate(): string {
        return window
            .moment()
            .subtract(this.data.settings.rolloverHour, "hours")
            .format("YYYY-MM-DD");
    }

    /**
     * 鍔犺浇/閲嶇疆姣忔棩缁熻
     * 濡傛灉瀛樺偍鐨勬棩鏈熶笉鏄粖澶╋紝璇存槑璺ㄥぉ浜嗭紝閲嶇疆鏁版嵁
     */
    public loadDailyDeckStats(): void {
        const today = this.getRolloverDate();

        // 鍒濆鍖?dailyDeckStats 濡傛灉涓嶅瓨鍦?
        if (!this.data.dailyDeckStats) {
            this.data.dailyDeckStats = { date: "", counts: {} };
        }

        if (this.data.dailyDeckStats.date !== today) {
            this.data.dailyDeckStats = {
                date: today,
                counts: {},
            };
            this.requestPluginDataSave(0);
            if (this.data.settings.showSchedulingDebugMessages) {
                console.debug(`[SR] New day detected (${today}). Daily limits reset.`);
            }
        }
    }

    /**
     * 鑾峰彇鎸囧畾鐗岀粍鐨勪粖鏃ヨ鏁?
     */
    public getDailyCounts(deckName: string): { new: number; review: number } {
        this.loadDailyDeckStats();
        const stats = this.data.dailyDeckStats.counts[deckName];
        return stats || { new: 0, review: 0 };
    }

    /**
     * 澧炲姞璁℃暟锛堟敮鎸佸眰绾э紝娌胯矾寰勫悜涓婃洿鏂版墍鏈夌鍏堢墝缁勶級
     */
    public incrementDailyCounts(deckName: string, isNew: boolean): void {
        this.loadDailyDeckStats();

        // 鑾峰彇鐗岀粍璺緞 lineage (渚嬪 A/B -> [A, A/B])
        const parts = deckName.split("/");
        let currentPath = "";
        const lineage: string[] = [];
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            lineage.push(currentPath);
        }

        // 鏇存柊鏁存潯璺緞涓婄殑璁℃暟
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

        this.requestPluginDataSave();
    }

    /**
     * 鍑忓皯璁℃暟锛堢敤浜庢挙閿€鎿嶄綔锛?
     * 鏀寔灞傜骇锛屾部璺緞鍚戜笂鏇存柊鎵€鏈夌鍏堢墝缁?
     */
    public decrementDailyCounts(deckName: string, isNew: boolean): void {
        this.loadDailyDeckStats();

        // 鑾峰彇鐗岀粍璺緞 lineage (渚嬪 A/B -> [A, A/B])
        const parts = deckName.split("/");
        let currentPath = "";
        const lineage: string[] = [];
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            lineage.push(currentPath);
        }

        // 鏇存柊鏁存潯璺緞涓婄殑璁℃暟
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

        this.requestPluginDataSave();
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

    public getCardCaptureSignature(settings: SRSettings = this.data.settings): string {
        const signature = {
            singleLineCardSeparator: settings.singleLineCardSeparator,
            singleLineReversedCardSeparator: settings.singleLineReversedCardSeparator,
            multilineCardSeparator: settings.multilineCardSeparator,
            multilineReversedCardSeparator: settings.multilineReversedCardSeparator,
            multilineCardEndMarker: settings.multilineCardEndMarker,
            clozePatterns: settings.clozePatterns,
            convertHighlightsToClozes: settings.convertHighlightsToClozes,
            convertBoldTextToClozes: settings.convertBoldTextToClozes,
            convertCurlyBracketsToClozes: settings.convertCurlyBracketsToClozes,
            convertAnkiClozesToClozes: settings.convertAnkiClozesToClozes,
            parseClozesInCodeBlocks: settings.parseClozesInCodeBlocks,
            multiClozeCard: settings.multiClozeCard,
        };
        return JSON.stringify(signature);
    }

    public markCardCaptureSettingsChange(
        previousSettings: SRSettings,
        nextSettings: SRSettings,
    ): void {
        const previousSignature = this.getCardCaptureSignature(previousSettings);
        const nextSignature = this.getCardCaptureSignature(nextSettings);
        if (previousSignature === nextSignature) {
            return;
        }

        this.pendingCardCapturePromptSignature = nextSignature;
    }

    public consumePendingCardCaptureRebuildPrompt(
        settings: SRSettings = this.data.settings,
    ): boolean {
        const currentSignature = this.getCardCaptureSignature(settings);
        if (!this.pendingCardCapturePromptSignature) {
            return false;
        }

        if (this.pendingCardCapturePromptSignature !== currentSignature) {
            return false;
        }

        if (this.lastSuccessfulCardCaptureSignature === currentSignature) {
            this.pendingCardCapturePromptSignature = "";
            return false;
        }

        this.pendingCardCapturePromptSignature = "";
        return true;
    }

    private queueSyncRequest(request: NormalizedSyncRequest): NormalizedSyncRequest {
        const previousRequest = this.pendingSyncRequest;
        const nextRequest = mergeQueuedSyncRequest(previousRequest, request);
        this.pendingSyncRequest = nextRequest;

        this.logRuntimeDebug(
            "[SR-SyncQueue] queued sync request",
            previousRequest,
            "=>",
            nextRequest,
        );

        return nextRequest;
    }

    private takePendingSyncRequest(): NormalizedSyncRequest | null {
        const request = this.pendingSyncRequest;
        this.pendingSyncRequest = null;
        return request;
    }

    private replayQueuedSyncRequest(): void {
        const request = this.takePendingSyncRequest();
        if (!request) {
            return;
        }

        this.logRuntimeDebug("[SR-SyncQueue] replaying queued sync request", request);
        this.runAsync(
            this.requestSync({ ...request, force: true }),
            `replay queued ${request.mode} sync`,
        );
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

            const parsed = parseJsonUnknown(raw);
            if (!isRecord(parsed)) {
                return null;
            }

            const version = getNumberProp(parsed, "version");
            const signature = getStringProp(parsed, "signature");
            const items = getArrayProp(parsed, "items");
            if (version !== NOTE_CACHE_VERSION || !signature || !items) {
                return null;
            }
            return parsed as unknown as PersistedNoteCacheFile;
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
        const mismatch = validateCachedNoteBindings(note, this.store);
        if (mismatch) {
            this.logRuntimeDebug(
                `[SR-Cache] Rejecting cached note: path=${mismatch.notePath} reason=${mismatch.reason} cardId=${
                    mismatch.cardId ?? "n/a"
                } actualFilePath=${mismatch.actualFilePath ?? "n/a"}`,
            );
            return false;
        }

        for (const question of note.questionList) {
            for (const card of question.cards) {
                if (typeof card.Id !== "number" || card.Id < 0) {
                    return false;
                }

                const item = this.store.getItembyID(card.Id);
                if (!item) {
                    return false;
                }

                card.repetitionItem = item;
                card.scheduleInfo = NoteCardScheduleParser.createInfo_algo(item.getSched());
            }
        }
        await note.clearTransientFileText(this.data.settings);
        return true;
    }

    // @logExecutionTime()
    public shouldShowSyncProgressTip(syncMode: SyncMode): boolean {
        const displayMode: SyncProgressDisplayMode =
            this.data.settings.syncProgressDisplayMode ?? DEFAULT_SYNC_PROGRESS_DISPLAY_MODE;

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
            console.debug(...args);
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

    private async initializeFirstRunTutorialNote(): Promise<void> {
        let tutorialFile = this.app.vault.getAbstractFileByPath(FIRST_RUN_TUTORIAL_NOTE_PATH);

        if (!tutorialFile) {
            tutorialFile = await this.app.vault.create(
                FIRST_RUN_TUTORIAL_NOTE_PATH,
                FIRST_RUN_TUTORIAL_NOTE_CONTENT,
            );
        }

        if (!(tutorialFile instanceof TFile)) {
            console.warn(
                "[SR] First-run tutorial path is not a markdown file:",
                FIRST_RUN_TUTORIAL_NOTE_PATH,
            );
            return;
        }

        this.noteReviewStore.ensureTracked(
            tutorialFile.path,
            DEFAULT_DECKNAME,
            "manual",
            this.noteAlgorithm,
        );

        await this.noteReviewStore.save();
        this.reviewDecks = this.noteReviewStore.buildReviewDecks(this.app.vault);
        this.updateAndSortDueNotes();
        this.syncEvents.emit("note-review-updated");
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
    }: SyncRequestOptions = {}): Promise<SyncRequestResult> {
        const request = normalizeSyncRequest({ reviewMode, mode, trigger, force });

        if (
            !request.force &&
            this.shouldSkipDisabledAutomaticIncrementalSync(request.mode, request.trigger)
        ) {
            if (this.data.settings.showSchedulingDebugMessages) {
                console.debug(
                    `[SR-SyncGate] Skipping ${request.trigger} incremental sync by setting.`,
                );
            }
            return { ...request, status: "skipped", reason: "auto-sync-disabled" };
        }

        if (
            !request.force &&
            this.shouldSkipAutomaticSync(request.reviewMode, request.mode, request.trigger)
        ) {
            if (this.data.settings.showSchedulingDebugMessages) {
                console.debug(
                    `[SR-SyncGate] Skipping ${request.trigger} sync within ${AUTO_SYNC_COOLDOWN_MS}ms cooldown.`,
                );
            }
            return { ...request, status: "skipped", reason: "cooldown" };
        }

        if (this.syncLock) {
            const queuedRequest = this.queueSyncRequest(request);
            return { ...queuedRequest, status: "queued", reason: "busy" };
        }

        await this.sync(request.reviewMode, request.mode, {
            trigger: request.trigger,
            force: request.force,
        });
        return { ...request, status: "executed" };
    }

    // @logExecutionTime()
    async sync(
        reviewMode = FlashcardReviewMode.Review,
        mode: SyncMode = "incremental",
        requestOptions: Omit<SyncRequestOptions, "reviewMode" | "mode"> = {},
    ): Promise<void> {
        const request = normalizeSyncRequest({
            reviewMode,
            mode,
            trigger: requestOptions.trigger,
            force: requestOptions.force,
        });
        if (this.syncLock) {
            this.queueSyncRequest(request);
            return;
        }

        this.syncLock = true;
        this.syncEvents.emit("sync-start");

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

        // Show the sync progress tip while the cache is being rebuilt.
        const progressTip = this.shouldShowSyncProgressTip(syncMode)
            ? new SyncProgressTip(t("SYNC_PROGRESS_START"), t("SYNC_PROGRESS_DONE"))
            : null;
        progressTip?.show();
        let releaseSaveSuppression: (() => void) | null = null;
        try {
            // Clean transient dirty items before rebuilding the sync state.
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
            progressTip?.update(
                0,
                totalNotes,
                t("SYNC_PROGRESS_PARSE_NOTES", { current: 0, total: totalNotes }),
            );
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
                            t("SYNC_PROGRESS_PARSE_NOTES", {
                                current: syncedCount,
                                total: totalNotes,
                            }),
                        );
                    }),
                );
            }
            if (settings.showSchedulingDebugMessages) {
                console.debug(
                    "[SR-Debug] sync: fullDeckTree total card count:",
                    fullDeckTree.getCardCount(CardListType.All, true),
                );
            }
            progressTip?.update(totalNotes, totalNotes, t("SYNC_PROGRESS_BUILD_TREE"));
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
                console.debug(
                    "[SR-Debug] sync: deckTree after filtering EditLater cards:",
                    this.deckTree.getCardCount(CardListType.All, true),
                );
            }

            // sort the deck names
            this.deckTree.sortSubdecksList();

            // 浠?RepetitionItem.learningStep 鏀堕泦瀛︿範涓殑鍗＄墖锛堟柊鏂规锛氬崟涓€鏁版嵁婧愶級
            // 蹇呴』鍦?filterForRemainingCards 涔嬪墠杩愯锛屼互纭繚澶勪簬瀛︿範鐘舵€佷絾閿欎綅鍦?new/due 鍒楄〃鐨勫崱鐗?
            // 鑳借绉诲姩鍒?learningFlashcards 鐗╃悊鍒楄〃涓紝浠庤€屽彈 copyWithCardFilter 鐨勪繚鎶や笉琚繃婊ゆ帀銆?
            this.collectLearningCardsFromStore(this.deckTree);

            this.remainingDeckTree = DeckTreeFilter.filterForRemainingCards(
                this.questionPostponementList,
                this.deckTree,
                reviewMode,
            );
            if (settings.showSchedulingDebugMessages) {
                console.debug(
                    "[SR-Debug] sync: remainingDeckTree after filtering future cards:",
                    this.remainingDeckTree.getCardCount(CardListType.All, true),
                    "New:",
                    this.remainingDeckTree.getCardCount(CardListType.NewCard, true),
                    "Due:",
                    this.remainingDeckTree.getCardCount(CardListType.DueCard, true),
                );
            }

            // [V3 璋冨害鍣╙ 涓嶅啀鍦?sync 鍏ㄥ眬闃舵搴旂敤姣忔棩涓婇檺銆?
            // remainingDeckTree 淇濇寔婊¤锛屾瘡鏃ラ檺棰濆皢鍦ㄧ敤鎴风偣鍑荤墝缁勬椂鍔ㄦ€侀殧绂诲簲鐢ㄣ€?
            // if (reviewMode !== FlashcardReviewMode.Cram) {
            //     this.remainingDeckTree = DeckTreeFilter.filterByDailyLimits(
            //         this.remainingDeckTree,
            //         this,
            //     );
            // }

            // 濡傛灉闇€瑕侊紝鍙互鍦ㄨ繖閲屽啀娆″井璋冩垨鎺掑簭锛屼絾姝ゆ椂 learningQueue 宸茬粡鐢变箣鍓嶅 deckTree 鐨勮皟鐢ㄥ～鍏?
            // this.collectLearningCardsFromStore(this.remainingDeckTree);
            const calc: DeckTreeStatsCalculator = new DeckTreeStatsCalculator();
            this.cardStats = calc.calculate(this.deckTree);
            setDueDates(this.cardStats.delayedDays.dict, this.cardStats.delayedDays.dict);

            // --- 濉厖鍏ㄥ眬缁熻缂撳瓨 ---
            const statsService = DeckStatsService.getInstance();
            statsService.setSyncEvents(this.syncEvents);
            statsService.clearCache();

            // 閬嶅巻鎵€鏈夊崱鐗囷紝鎸夊眰绾ф敹闆?items 浠ヤ緵缁熻缂撳瓨浣跨敤
            const deckItemsMap = new Map<string, RepetitionItem[]>();

            // 鎴戜滑閬嶅巻鏁翠釜 fullDeckTree 鏉ユ敹闆嗘墍鏈夌殑 items
            const addItemsToMap = (deck: Deck) => {
                const deckPathName =
                    deck.deckName === "root" ? "root" : deck.getTopicPath().path.join("/");

                const itemsInDeck: RepetitionItem[] = [];
                // 鏀堕泦鎵€鏈夊崱鐗囩殑 item 瀹炰緥
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

            const learnAheadMillis = Math.max(0, this.data.settings.learnAheadMinutes) * 60 * 1000;
            for (const [dName, dItems] of deckItemsMap.entries()) {
                statsService.calculateDeckStats(dName, dItems, learnAheadMillis);
            }
            if (this.data.settings.showSchedulingDebugMessages) {
                console.debug(
                    "[SR-Debug] DeckStatsService cache populated. Total decks:",
                    deckItemsMap.size,
                );
                this.showSyncInfo();
            }

            if (this.data.settings.showSchedulingDebugMessages) {
                console.debug(
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

            // Broadcast the sync completion event so open UI surfaces can refresh.
            this.logRuntimeDebug(
                "[SR-DynSync] plugin.sync() completed, about to emit sync-complete. remainingDeckTree subdecks:",
                this.remainingDeckTree?.subdecks?.length,
            );
            this.lastSuccessfulSyncStartedAt = syncStartedAt;
            this.lastSyncCompletedAt = Date.now();
            this.lastSyncReviewMode = reviewMode;
            this.lastSuccessfulCardCaptureSignature = this.getCardCaptureSignature(settings);
            if (
                this.pendingCardCapturePromptSignature === this.lastSuccessfulCardCaptureSignature
            ) {
                this.pendingCardCapturePromptSignature = "";
            }
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
            this.replayQueuedSyncRequest();
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

        this.getReviewQueueView()?.redraw();
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
            await note.writeNoteFile(this.data.settings);
        }
        // Full sync suppresses per-note saves; outside sync this persists per-note changes.
        await this.store.save(); // 鏍稿績锛氬悓姝ュ畬绗旇鍙婂叾鍗＄墖 ID 鍚庡嵆鍒昏惤鐩?
        await note.clearTransientFileText(this.data.settings);
        return note;
    }

    private getObsidianRtlSetting(): TextDirection {
        // Get the direction with Obsidian's own setting
        const vaultWithConfig = this.app.vault as Vault & {
            getConfig?: (key: string) => unknown;
        };
        const v = vaultWithConfig.getConfig?.("rightToLeft");
        return convertToStringOrEmpty(v) == "true" ? TextDirection.Rtl : TextDirection.Ltr;
    }

    async saveReviewResponse(note: TFile, response: ReviewResponse): Promise<void> {
        const settings = this.data.settings;
        const debugScheduling = settings.showSchedulingDebugMessages;
        if (debugScheduling) {
            console.debug("[SR Debug] ===== saveReviewResponse called =====");
            console.debug("[SR Debug] note.path:", note.path);
            console.debug("[SR Debug] response:", response);
            console.debug("[SR Debug] noteAlgorithm:", settings.noteAlgorithm);
        }

        if (isIgnoredPath(settings.noteFoldersToIgnore, note.path)) {
            new Notice(t("NOTE_IN_IGNORED_FOLDER"));
            return;
        }
        const tracking = this.resolveNoteReviewTracking(note);
        if (!tracking) {
            // tagCheck宸茬粡鏄剧ずNotice锛岃繖閲屼笉闇€瑕侀澶栨彁绀?
            if (debugScheduling) {
                console.debug("[SR Debug] tagCheck failed");
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
        if (item.isNew && String(settings.noteAlgorithm) !== "Fsrs") {
            if (debugScheduling) {
                console.debug("[SR Debug] Calculating ease for new note (non-FSRS)");
            }
            try {
                ease = this.linkRank.getContribution(note, this.easeByPath).ease;
                if (debugScheduling) {
                    console.debug("[SR Debug] Calculated ease:", ease);
                }
            } catch (error) {
                console.error("[SR Debug] Error calculating ease:", error);
                throw error;
            }
        }

        if (debugScheduling) {
            console.debug("[SR Debug] Applying note review response...");
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
            console.debug("[SR Debug] saveReviewResponse completed successfully");
        }

        // 鉁?鍒锋柊UI
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
            this.runAsync(
                this.reviewNextNote(this.lastSelectedReviewDeck),
                "open next review note",
            );
        }
    }

    reviewNextNoteModal(): void {
        const reviewDeckNames: string[] = Object.keys(this.reviewDecks);
        if (reviewDeckNames.length === 0) {
            this.reviewFloatBar.close();
            new Notice(t("ALL_CAUGHT_UP"));
            return;
        }
        if (reviewDeckNames.length === 1) {
            this.runAsync(this.reviewNextNote(reviewDeckNames[0]), "review single note deck");
        } else if (this.data.settings.reviewingNoteDirectly) {
            const rdname =
                this.lastSelectedReviewDeck ??
                IReviewNote.getDeckNameForReviewDirectly(this.reviewDecks) ??
                reviewDeckNames[0];
            this.runAsync(this.reviewNextNote(rdname), "review direct note deck");
        } else {
            const deckSelectionModal = new ReviewDeckSelectionModal(this.app, reviewDeckNames);
            deckSelectionModal.submitCallback = (deckKey: string) => {
                this.runAsync(this.reviewNextNote(deckKey), "review selected note deck");
            };
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
                console.debug("[SR Debug] Calling sortNotes for deck:", deckKey);
            }
            reviewDeck.sortNotes(this.linkRank.pageranks);
            if (this.data.settings.showSchedulingDebugMessages) {
                console.debug("[SR Debug] sortNotes completed for deck:", deckKey);
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
                    const appWithCommands = this.app as App & {
                        commands?: {
                            executeCommandById: (commandId: string) => void;
                        };
                    };
                    appWithCommands.commands?.executeCommandById(id);
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
                this.runAsync(this.reviewNextNote(rdname), "review direct note");
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
        this.getReviewQueueView()?.redraw();
        new Notice(t("ALL_CAUGHT_UP"));
    }

    createSrTFile(note: TFile): SrTFile {
        return new SrTFile(this.app.vault, this.app.metadataCache, note);
    }

    async loadPluginData(): Promise<void> {
        const loadedData = (await this.loadData()) as Partial<PluginData> | null;
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
        this.reviewPersistenceCoordinator = new ReviewPersistenceCoordinator({
            shouldLogDebug: () => this.data.settings.showRuntimeDebugMessages,
            logDebug: (...args: unknown[]) => console.debug(...args),
        });
        this.easeByPath = new NoteEaseList(this.data.settings);
        this.linkRank = new LinkRank(this.data.settings, this.app.metadataCache);
        this.reviewDecks = this.noteReviewStore.buildReviewDecks(this.app.vault);
        this.updateAndSortDueNotes();
        setDebugParser(this.data.settings.showParserDebugMessages);
    }

    async savePluginData(): Promise<void> {
        // 娉ㄦ剰锛歭earningQueue 涓嶅啀闇€瑕佸湪杩欓噷搴忓垪鍖?
        // 瀛︿範鐘舵€佸凡缁忓瓨鍌ㄥ湪 RepetitionItem.learningStep 涓紝鐢?store.save() 绠＄悊
        await this.saveData(this.data);
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

        this.registerView(REVIEW_QUEUE_VIEW_TYPE, (leaf) => new ReactNoteReviewView(leaf, this));

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

        // --- 鏍稿績淇敼锛氶娆℃墦寮€渚ц竟鏍忔椂瑙﹀彂 GC ---
        if (!this.hasPerformedInitialGC) {
            // 浣跨敤 setTimeout 閬垮厤闃诲鐣岄潰娓叉煋锛岀粰鐣岄潰涓€鐐瑰垵濮嬪寲鏃堕棿
            setTimeout(() => {
                if (this.data.settings.showSchedulingDebugMessages) {
                    console.debug(
                        "[SR-Init] 棣栨婵€娲诲涔犺鍥撅紝瑙﹀彂鍚庡彴鍏ㄥ眬鍨冨溇鍥炴敹 (GC)...",
                    );
                }
                this.runAsync(
                    this.store.performGlobalGarbageCollection().then(() => {
                        this.hasPerformedInitialGC = true;
                        // GC 鍚庡彲鑳?ID 鏄犲皠鍙樹簡锛屽埛鏂颁竴涓嬭鍥?
                        this.getReviewQueueView()?.redraw();
                    }),
                    "review queue garbage collection",
                );
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
        console.debug(`SR: ${t("EASES")}`, this.easeByPath);
        console.debug(`SR: ${t("DECKS")}`, this.deckTree);
        console.debug(`SR: NOTE ${t("DECKS")}`, this.reviewDecks);
        console.debug("SR: cardStats ", this.cardStats);
        console.debug("SR: noteStats ", this.noteStats);
        console.debug("SR: this.dueDatesNotes", this.dueDatesNotes);
    }

    public updateStatusBarVisibility() {
        const visible = this.data.settings.showStatusBar !== false;
        const display = visible ? "" : "none";
        if (this.statusBarNote) this.statusBarNote.setCssProps({ display });
        if (this.statusBarFlashcard) this.statusBarFlashcard.setCssProps({ display });
    }

    updateStatusBar() {
        this.updateStatusBarVisibility();
        if (this.data.settings.showStatusBar === false) return;
        if (!this.statusBarNote || !this.statusBarFlashcard) return;
        if (!this.noteStats) return;
        // 鑾峰彇鍒版湡鏁板€?
        const dueNotesCount = this.noteStats.onDueCount;
        const dueFlashcardsCount = this.remainingDeckTree
            ? this.remainingDeckTree.getDistinctCardCount(CardListType.All, true)
            : 0;

        // --- 鏇存柊绗旇鐘舵€佹爮 ---
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

        // --- 鏇存柊鍗＄墖鐘舵€佹爮 ---
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
     * 鏍规嵁璁剧疆鏇存柊鐘舵€佹爮鐨勫姩鎬?CSS 鏍峰紡锛堝懠鍚哥伅 / 闂儊锛?
     * 姣忔璁剧疆鍙樻洿鏃惰皟鐢紝瀹炴椂鐢熸晥鏃犻渶閲嶅惎
     */
    updateStatusBarStyles() {
        const s = this.data.settings;
        document.body.setCssProps({
            "--syro-note-status-color": s.noteStatusBarColor,
            "--syro-card-status-color": s.flashcardStatusBarColor,
            "--syro-note-status-animation":
                s.showStatusBarDueNotification && s.noteStatusBarAnimation === "Breathing"
                    ? "syro-breathe"
                    : "none",
            "--syro-card-status-animation":
                s.showStatusBarDueNotification && s.flashcardStatusBarAnimation === "Breathing"
                    ? "syro-breathe"
                    : "none",
            "--syro-note-status-period": `${s.noteStatusBarPeriod}s`,
            "--syro-card-status-period": `${s.flashcardStatusBarPeriod}s`,
        });
    }

    public registerSRFocusListener() {
        this.registerEvent(
            this.app.workspace.on("active-leaf-change", this.activeLeafChangeHandler),
        );
    }

    public removeSRFocusListener() {
        this.setSRViewInFocus(false);
        this.app.workspace.off("active-leaf-change", this.activeLeafChangeHandler);
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
     * 灏嗚繍琛屾椂瀛︿範闃熷垪鍚屾鍒?Deck 鏍戠殑 learningFlashcards 涓?
     * 鐢ㄤ簬鍦?DeckUI.show() 鏃剁‘淇濆涔犺鏁版纭樉绀?
     */
    public syncLearningQueueToDecks(): void {
        if (!this.learningQueue || this.learningQueue.length === 0) return;
        if (!this.remainingDeckTree) return;

        for (const item of this.learningQueue) {
            const card = item.card;
            if (!card) continue;

            // 鎵惧埌鍗＄墖鎵€灞炵殑 deck
            const topicPath = card.question?.topicPathList?.list[0];
            if (!topicPath) continue;

            const deck = this.remainingDeckTree.getDeck(topicPath);
            if (!deck) continue;

            // 纭繚鍗＄墖鍦?learningFlashcards 涓?
            if (!deck.learningFlashcards.includes(card)) {
                deck.learningFlashcards.push(card);
            }
        }
    }

    /**
     * 浠?DataStore 鐨?RepetitionItem 鏀堕泦瀛︿範涓殑鍗＄墖
     * 閬嶅巻涓€娆?Deck 鏍戯紝妫€鏌ユ瘡寮犲崱鐗囩殑 isInLearningPhase
     * 濡傛灉鏄涔犱腑涓斿埌鏈燂紝灏嗗崱鐗囩Щ鍔ㄥ埌 learningFlashcards 骞跺姞鍏ュ叏灞€闃熷垪
     *
     * 澶嶆潅搴︼細O(N)锛孨 涓烘€诲崱鐗囨暟
     */
    private collectLearningCardsFromStore(deckTree: Deck): void {
        this.learningQueue = [];
        let movedCount = 0;

        const traverse = (deck: Deck) => {
            const deckPath = deck.getTopicPath()?.path?.join("/") || deck.deckName;

            // 1. 澶勭悊鏂板崱鍒楄〃涓殑閿欎綅鍗＄墖
            for (let i = deck.newFlashcards.length - 1; i >= 0; i--) {
                const card = deck.newFlashcards[i];
                if (card.repetitionItem?.isInLearningPhase) {
                    deck.newFlashcards.splice(i, 1);
                    deck.learningFlashcards.push(card);
                    movedCount++;
                    if (this.data.settings.showSchedulingDebugMessages) {
                        console.debug(
                            `[SR-Debug] Corrected learning card placement: ID=${card.Id} moved from New to Learning (deck: ${deckPath})`,
                        );
                    }
                }
            }

            // 2. 澶勭悊鍒版湡鍗″垪琛ㄤ腑鐨勯敊浣嶅崱鐗?
            for (let i = deck.dueFlashcards.length - 1; i >= 0; i--) {
                const card = deck.dueFlashcards[i];
                if (card.repetitionItem?.isInLearningPhase) {
                    deck.dueFlashcards.splice(i, 1);
                    deck.learningFlashcards.push(card);
                    movedCount++;
                    if (this.data.settings.showSchedulingDebugMessages) {
                        console.debug(
                            `[SR-Debug] Corrected learning card placement: ID=${card.Id} moved from Due to Learning (deck: ${deckPath})`,
                        );
                    }
                }
            }

            // 3. 灏嗗綋鍓嶇墝缁勪腑鎵€鏈夌殑瀛︿範鍗″姞鍏ュ叏灞€瀛︿範闃熷垪
            for (const card of deck.learningFlashcards) {
                this.learningQueue.push({
                    card,
                    dueTime: card.repetitionItem?.nextReview ?? 0,
                    deckName: deckPath,
                });
            }

            // 閫掑綊澶勭悊瀛愮墝缁?
            for (const subdeck of deck.subdecks) {
                traverse(subdeck);
            }
        };

        traverse(deckTree);

        if (this.data.settings.showSchedulingDebugMessages) {
            if (movedCount > 0) {
                console.debug(
                    `[SR-Debug] collectLearningCardsFromStore: moved ${movedCount} misplaced learning cards.`,
                );
            }
            console.debug(
                `[SR-Debug] 褰撳墠鍏ㄥ眬瀛︿範闃熷垪闀垮害: ${this.learningQueue.length}`,
            );
        }

        // 鎸?dueTime 鎺掑簭瀛︿範闃熷垪
        this.learningQueue.sort((a, b) => a.dueTime - b.dueTime);
    }
}
