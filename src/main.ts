import {
    App,
    getAllTags,
    Menu,
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
    FsrsSettings,
    NoteReviewIgnoreReason,
    SettingsUtil,
    SRSettings,
    SyncProgressDisplayMode,
    upgradeSettings,
    WeightedMultiplierSettings,
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
import { NoteCardScheduleParser } from "./CardSchedule";
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
import {
    DataStore,
    type TrackedCardSnapshot,
    type TrackedCardsFileSnapshot,
} from "./dataStore/data";
import {
    createDeckOptionsStoreSnapshot,
    DeckOptionsStore,
} from "./dataStore/deckOptionsStore";
import { DataLocation } from "./dataStore/dataLocation";
import {
    NoteReviewStore,
    NoteReviewSource,
    type NoteReviewEntrySnapshot,
} from "./dataStore/noteReviewStore";
import { replaySyroSessionRecords } from "./dataStore/syroSessionReplay";
import { SyroMergeStateStore } from "./dataStore/syroMergeState";
import {
    applyDailyState,
    applyDeviceState,
    applyLicenseState,
    applySharedSettings,
    applyTrackingRules,
    createDefaultDailyState,
    createDefaultSharedSettingsState,
    createDefaultTrackingRulesState,
    createSyro012DataShell,
    diffDailyState,
    diffSharedSettings,
    diffTrackingRules,
    extractDailyState,
    extractDeviceState,
    extractLicenseState,
    extractSharedSettings,
    extractTrackingRules,
    hasSyro012MigrationMarker,
    parseDailyState,
    parseDeviceState,
    parseLegacyPluginData,
    parseLicenseState,
    parseSharedSettingsState,
    parseTrackingRulesState,
    SyroJsonStateStore,
    type DailyDeckStats,
    type LegacyPluginData,
    type PersistedDailyState,
    type PersistedDeviceState,
    type PersistedLicenseState,
    type PersistedSharedSettingsState,
    type PersistedTrackingRulesState,
    type PersistedTrackingRulesTombstone,
} from "./dataStore/syroPluginDataStore";
import {
    SyroPersistenceLayout,
    SyroWorkspace,
    type SyroWorkspaceInitializeResult,
} from "./dataStore/syroWorkspace";
import { SyroSessionManager, type SyroSessionSealReason } from "./dataStore/syroSessionManager";
import Commands from "./commands";
import { SrsAlgorithm } from "src/algorithms/algorithms";
import { FsrsAlgorithm } from "src/algorithms/fsrs";
import { WeightedMultiplierAlgorithm } from "src/algorithms/weightedMultiplier";

import { reviewResponseModal } from "src/ui/modals/reviewresponse-modal";
import { debug, isVersionNewerThanOther } from "./util/utils_recall";
import { DEFAULT_DECKNAME, SR_TAB_VIEW } from "./constants";

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
import { installStyleSettingsHierarchyResetSupport } from "src/styleSettingsHierarchyReset";
import {
    SyroRecoveryModal,
    type SyroRecoveryModalContext,
} from "src/ui/modals/SyroRecoveryModal";
import {
    cloneFolderTrackingRule,
    DEFAULT_FOLDER_TRACKING_RULE,
    type FolderTrackingRule,
    isPathInsideFolder,
    normalizeFolderTrackingTags,
    normalizeFrontmatterTags,
    renamePathPrefix,
    resolveFolderTrackingRule,
    toFrontmatterTagValue,
} from "src/folderTracking";
import {
    deserializeNote,
    NOTE_CACHE_VERSION,
    PersistedNoteCacheFile,
    PersistedNoteCacheItem,
    serializeNote,
    SerializedNote,
    validateCachedNoteBindings,
} from "src/cache/noteCacheStore";
import { ReviewCommitStore, type ReviewCommitLog } from "src/dataStore/reviewCommitStore";
import { ReviewPersistenceCoordinator } from "src/services/reviewPersistenceCoordinator";
import { autoCommitReviewResponseToTimeline } from "src/ui/timeline/reviewResponseTimeline";
import {
    InlineTitleCardStats,
    cloneTrackedFileForInlineTitleStats,
    countInlineTitleStatsFromNote,
    countInlineTitleStatsFromTrackedFile,
} from "src/inlineTitleCardStats";
import {
    mergeQueuedSyncRequest,
    normalizeSyncRequest,
    type NormalizedSyncRequest,
    type SyncMode,
    type SyncRequestOptions,
    type SyncRequestResult,
    type SyncTrigger,
} from "src/syncRequest";
import { getFirstRunTutorial } from "src/firstRunTutorial";
import { InlineTitleReviewButtonManager } from "src/ui/components/InlineTitleReviewButtonManager";

function readFolderTrackingFrontmatterTags(frontmatter: unknown): string[] {
    if (!isRecord(frontmatter)) {
        return [];
    }

    return normalizeFrontmatterTags(frontmatter["tags"]);
}

function writeFolderTrackingFrontmatterTags(frontmatter: unknown, tags: string[]): void {
    if (!isRecord(frontmatter)) {
        return;
    }

    frontmatter["tags"] = tags.map(toFrontmatterTagValue);
}

function clearFolderTrackingFrontmatterTags(frontmatter: unknown): void {
    if (!isRecord(frontmatter)) {
        return;
    }

    delete frontmatter["tags"];
}

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
    dailyDeckStats: DailyDeckStats;
    folderTrackingRules: Record<string, FolderTrackingRule>;
}

const AUTO_SYNC_COOLDOWN_MS = 15_000;
const SYRO_MERGE_STATE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const STYLE_SETTINGS_BRIDGE_RETRY_DELAYS_MS = [0, 400, 1400, 3200] as const;

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
    private inlineTitleReviewButtonManager: InlineTitleReviewButtonManager | null = null;
    public data: PluginData;
    cardAlgorithm: SrsAlgorithm;
    noteAlgorithm: SrsAlgorithm;

    getAlgorithmForItem(itemType: RPITEMTYPE): SrsAlgorithm {
        return itemType === RPITEMTYPE.CARD ? this.cardAlgorithm : this.noteAlgorithm;
    }

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
    private pendingReviewSessionReloadAfterFullSync = false;
    private pendingSyncRequest: NormalizedSyncRequest | null = null;
    private lastSemanticChangeAt = 0;
    private noteReviewRefreshLock = false;
    private noteReviewRefreshPending = false;

    // Derived from earlier pre-Syro command handling.
    public store: DataStore;
    public commands: Commands;
    public reviewFloatBar: reviewResponseModal;
    public settingTab: SRSettingTab;
    public reviewCommitStore: ReviewCommitStore;
    public reviewPersistenceCoordinator: ReviewPersistenceCoordinator;

    public syncEvents: SyncEvents = new SyncEvents();
    private timelineReviewCardPath: string | null = null;

    public clock_start: number;

    public learningQueue: Array<{ card: Card; dueTime: number; deckName: string }> = [];

    private hasPerformedInitialGC = false;
    private pendingPluginDataSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingPluginDataSaveRequested = false;
    private pendingPluginDataSavePromise: Promise<boolean> | null = null;
    private pluginDataSaveFailureNotified = false;
    private syroReadOnlyReason: string | null = null;
    private syroWorkspace: SyroWorkspace | null = null;
    private syroLayout: SyroPersistenceLayout | null = null;
    private deckOptionsStore: DeckOptionsStore | null = null;
    private sharedSettingsStore: SyroJsonStateStore<PersistedSharedSettingsState> | null = null;
    private trackingRulesStore: SyroJsonStateStore<PersistedTrackingRulesState> | null = null;
    private dailyStateStore: SyroJsonStateStore<PersistedDailyState> | null = null;
    private deviceStateStore: SyroJsonStateStore<PersistedDeviceState> | null = null;
    private licenseStateStore: SyroJsonStateStore<PersistedLicenseState> | null = null;
    private persistedSharedSettingsState: PersistedSharedSettingsState | null = null;
    private persistedTrackingRulesState: PersistedTrackingRulesState | null = null;
    private persistedDailyState: PersistedDailyState | null = null;
    private persistedDeviceState: PersistedDeviceState | null = null;
    private persistedLicenseState: PersistedLicenseState | null = null;
    private trackingRulesTombstones: Record<string, PersistedTrackingRulesTombstone> = {};
    private dataShell: LegacyPluginData | null = null;
    private syroMergeState: SyroMergeStateStore | null = null;
    private syroSessionManager: SyroSessionManager | null = null;
    private pendingSyroRecoveryContext: SyroRecoveryModalContext | null = null;

    private static _instance: SRPlugin;
    static getInstance() {
        return SRPlugin._instance;
    }

    private runAsync(task: Promise<unknown>, label: string): void {
        void task.catch((error: unknown) => {
            console.error(`[SR] ${label} failed`, error);
        });
    }

    private scheduleStyleSettingsHierarchyResetBridge(): void {
        STYLE_SETTINGS_BRIDGE_RETRY_DELAYS_MS.forEach((delayMs) => {
            this.registerInterval(
                window.setTimeout(() => {
                    installStyleSettingsHierarchyResetSupport(this.app);
                }, delayMs),
            );
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
            new Notice(t("DATA_REVIEW_SAVE_PENDING"));
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

        initializeClozeDecoration(this.app);
        this.registerEditorExtension(clozeDecorationPlugin);

        initializeLatexPopover(this.app, {
            isEnabled: () => this.data.settings.enableLatexPopover === true,
        });
        this.registerEditorExtension(latexPopoverExtension);

        this.registerEditorExtension(latexClozePreprocessorPlugin);

        this.registerMarkdownPostProcessor(clozePostProcessor);

        const PLUGIN_VERSION = this.manifest.version;
        const obsidianJustInstalled = this.data.settings.previousRelease === "0.0.0";
        if (isVersionNewerThanOther(PLUGIN_VERSION, this.data.settings.previousRelease)) {
            this.data.settings.previousRelease = PLUGIN_VERSION;
        }

        upgradeSettings(this.data.settings);

        const settings = this.data.settings;
        this.cardAlgorithm = new FsrsAlgorithm();
        this.cardAlgorithm.updateSettings(settings.fsrsSettings);
        settings.fsrsSettings = this.cardAlgorithm.settings as FsrsSettings;

        this.noteAlgorithm = new WeightedMultiplierAlgorithm();
        this.noteAlgorithm.updateSettings(settings.weightedMultiplierSettings);
        settings.weightedMultiplierSettings = this.noteAlgorithm
            .settings as WeightedMultiplierSettings;

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
                        const responseTexts = this.data.settings.noteResponseTexts;
                        const showtext = [
                            responseTexts.again,
                            responseTexts.hard,
                            responseTexts.good,
                            responseTexts.easy,
                        ];

                        let intervals: number[] | null = null;
                        try {
                            const noteItem = this.noteReviewStore.getItem(fileish.path);
                            if (noteItem) {
                                intervals = this.noteAlgorithm.calcAllOptsIntervals(noteItem);
                            }
                        } catch {
                            // Ignore interval preview failures and keep menu actions available.
                        }

                        for (let i = 0; i < options.length; i++) {
                            menu.addItem((item) => {
                                let title: string;
                                const optionName = options[i];
                                let localizedOption: string;

                                if (optionName === "Reset" || optionName === "Again")
                                    localizedOption = t("UI_RESET");
                                else if (optionName === "Hard") localizedOption = t("UI_HARD");
                                else if (optionName === "Good") localizedOption = t("UI_GOOD");
                                else if (optionName === "Easy") localizedOption = t("UI_EASY");
                                else localizedOption = showtext[i];

                                if (intervals && intervals[i] !== undefined) {
                                    const intervalText = textInterval(intervals[i], false);
                                    title = t("REVIEW_DIFFICULTY_FILE_MENU", {
                                        difficulty: localizedOption,
                                        interval: intervalText,
                                    });
                                } else {
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

                        menu.addSeparator();

                        menu.addItem((item) => {
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
                                                    noteItem.priority = newPriority;
                                                    await this.noteReviewStore.save();
                                                    this.updateAndSortDueNotes();
                                                    this.syncEvents.emit("note-review-updated");
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
            id: "srs-review-flashcards-in-note",
            name: t("REVIEW_CARDS_IN_NOTE"),
            callback: () => {
                const openFile: TFile | null = this.app.workspace.getActiveFile();
                if (!openFile || openFile.extension !== "md") {
                    return;
                }

                this.runAsync(
                    this.openFlashcardsInNoteReview(FlashcardReviewMode.Review, openFile),
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
                    this.openFlashcardsInNoteReview(FlashcardReviewMode.Cram, openFile),
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

        this.addCommand({
            id: "open-sync-recovery",
            name: t("CMD_OPEN_SYRO_RECOVERY"),
            callback: () => {
                this.runAsync(this.openPendingSyroRecovery(), "open syro recovery");
            },
        });

        this.addCommand({
            id: "srs-cloze-same-level",
            name: t("CMD_CREATE_CLOZE_SAME_LEVEL"),
            icon: "flashcards",
            editorCallback: async (editor) => {
                const licMgr = LicenseManager.getInstance(this);
                if (!(await licMgr.checkFeatureAccess("Anki 鎸栫┖"))) return;
                this.insertAnkiCloze(editor, "same");
            },
        });

        this.addCommand({
            id: "srs-cloze-new-level",
            name: t("CMD_CREATE_CLOZE_NEW_LEVEL"),
            icon: "flashcards",
            editorCallback: async (editor) => {
                const licMgr = LicenseManager.getInstance(this);
                if (!(await licMgr.checkFeatureAccess("Anki 鎸栫┖"))) return;
                this.insertAnkiCloze(editor, "new");
            },
        });

        this.settingTab = new SRSettingTab(this.app, this);
        this.addSettingTab(this.settingTab);
        this.scheduleStyleSettingsHierarchyResetBridge();
        this.app.workspace.trigger("parse-style-settings");
        this.inlineTitleReviewButtonManager = new InlineTitleReviewButtonManager(this);
        this.inlineTitleReviewButtonManager.register();

        this.app.workspace.onLayoutReady(() => {
            this.runAsync(this.initReviewQueueView(), "init review queue view");
            void this.refreshNoteReview({ trigger: "startup" });
            setTimeout(() => {
                if (this.syncLock) {
                    return;
                }

                this.runAsync(this.requestSync({ trigger: "startup" }), "startup sync");
            }, 2000);
            try {
                const licMgr = LicenseManager.getInstance(this);
                if (this.data.settings.licenseState?.token) {
                    this.runAsync(
                        licMgr.backgroundCheck(this.data.settings).then((isValid) => {
                            if (!isValid && this.data.settings.isPro) {
                                this.data.settings.isPro = false;
                                this.runAsync(this.savePluginData(), "save license downgrade");
                            }
                        }),
                        "license background check",
                    );
                } else {
                    LicenseManager.getInstance(this);
                }
            } catch (e) {
                console.warn("[SR] License backgroundCheck error:", e);
            }
        });

        this.registerSRFocusListener();
    }

    onunload(): void {
        this.runAsync(
            Promise.all([
                this.flushReviewPersistence(1000),
                this.syroSessionManager?.flushActiveSession("unload") ?? Promise.resolve(null),
            ]),
            "flush review persistence on unload",
        );
        this.app.workspace.getLeavesOfType(REVIEW_QUEUE_VIEW_TYPE).forEach((leaf) => leaf.detach());
        this.tabViewManager.closeAllTabViews();
        this.reviewFloatBar.close();
        this.inlineTitleReviewButtonManager?.destroy();
        this.inlineTitleReviewButtonManager = null;
    }

    insertAnkiCloze(editor: import("obsidian").Editor, type: "same" | "new"): void {
        const selection = editor.getSelection();
        if (!selection) {
            new Notice(t("NOTICE_TEXT_SELECTION_REQUIRED"));
            return;
        }

        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line);

        const currentMax = this.getMaxClozeIdFromText(lineText);

        let nextId: number;
        if (type === "same") {
            nextId = currentMax === 0 ? 1 : currentMax;
        } else {
            nextId = currentMax + 1;
        }

        const replacement = `{{c${nextId}::${selection}}}`;
        editor.replaceSelection(replacement);
    }

    private getMaxClozeIdFromText(text: string): number {
        const matches = text.matchAll(/\{\{c(\d+)::/g);
        let max = 0;
        for (const m of matches) {
            const id = parseInt(m[1]);
            if (id > max) max = id;
        }
        return max;
    }

    public getRolloverDate(): string {
        return window
            .moment()
            .subtract(this.data.settings.rolloverHour, "hours")
            .format("YYYY-MM-DD");
    }

    public loadDailyDeckStats(): void {
        const today = this.getRolloverDate();

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

    public getDailyCounts(deckName: string): { new: number; review: number } {
        this.loadDailyDeckStats();
        const stats = this.data.dailyDeckStats.counts[deckName];
        return stats || { new: 0, review: 0 };
    }

    public incrementDailyCounts(deckName: string, isNew: boolean): void {
        this.loadDailyDeckStats();

        const parts = deckName.split("/");
        let currentPath = "";
        const lineage: string[] = [];
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            lineage.push(currentPath);
        }

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

    public decrementDailyCounts(deckName: string, isNew: boolean): void {
        this.loadDailyDeckStats();

        const parts = deckName.split("/");
        let currentPath = "";
        const lineage: string[] = [];
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            lineage.push(currentPath);
        }

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

    public requestReviewSessionReloadAfterNextFullSync(): void {
        this.pendingReviewSessionReloadAfterFullSync = true;
    }

    public clearPendingReviewSessionReloadAfterNextFullSync(): void {
        this.pendingReviewSessionReloadAfterFullSync = false;
    }

    private async reloadOpenReviewSessions(): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType(SR_TAB_VIEW);
        await Promise.all(
            leaves.map(async (leaf) => {
                const reloadableView = leaf.view as { reloadSession?: () => Promise<void> };
                if (typeof reloadableView.reloadSession !== "function") {
                    return;
                }

                try {
                    await reloadableView.reloadSession();
                } catch (error) {
                    console.error("[SR] Failed to reload review session after full sync", error);
                }
            }),
        );
    }

    private async consumePendingReviewSessionReloadAfterSync(syncMode: SyncMode): Promise<void> {
        if (syncMode !== "full" || !this.pendingReviewSessionReloadAfterFullSync) {
            return;
        }

        this.pendingReviewSessionReloadAfterFullSync = false;
        await this.reloadOpenReviewSessions();
    }

    private getNoteCacheStorePath(): string {
        if (this.syroLayout?.noteCachePath) {
            return this.syroLayout.noteCachePath;
        }

        if (this.store) {
            return this.store.getAuxiliaryPath("note_cache.json");
        }

        return "note_cache.json";
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
            return (
                SettingsUtil.getNoteReviewIgnoreReason(this.data.settings, noteFile.path, tags) ===
                null
            );
        });
        return notes;
    }

    public getNoteReviewIgnoreReason(note: TFile): NoteReviewIgnoreReason | null {
        const fileCachedData = this.app.metadataCache.getFileCache(note) || {};
        const tags = getAllTags(fileCachedData) || [];
        return SettingsUtil.getNoteReviewIgnoreReason(this.data.settings, note.path, tags);
    }

    public getTimelineReviewCardPath(): string | null {
        return this.timelineReviewCardPath;
    }

    public setTimelineReviewCardPath(path: string | null): void {
        const normalizedPath =
            typeof path === "string" && path.trim().length > 0 ? path.trim() : null;
        if (this.timelineReviewCardPath === normalizedPath) {
            return;
        }

        this.timelineReviewCardPath = normalizedPath;
        this.syncEvents.emit("timeline-review-card-updated");
    }

    private async markSyroMergeState(
        entities: Array<{
            targetUuid: string;
            updatedAt: string;
            deleted: boolean;
            domain:
                | "cards"
                | "notes"
                | "timeline"
                | "deck-options"
                | "settings"
                | "tracking-rules"
                | "daily-state";
            entityType: string;
            pathHint?: string;
        }>,
    ): Promise<void> {
        if (!this.syroMergeState || this.syroReadOnlyReason || entities.length === 0) {
            return;
        }

        for (const entity of entities) {
            this.syroMergeState.markEntity(entity);
        }
        this.syroMergeState.pruneExpired(SYRO_MERGE_STATE_RETENTION_MS);
        await this.syroMergeState.save();
    }

    private clearSyroReadOnly(): void {
        this.syroReadOnlyReason = null;
        this.applySyroReadOnlyState();
    }

    private applySyroReadOnlyState(): void {
        this.store?.setReadOnly(this.syroReadOnlyReason);
        this.noteReviewStore?.setReadOnly(this.syroReadOnlyReason);
        this.reviewCommitStore?.setReadOnly(this.syroReadOnlyReason);
        this.deckOptionsStore?.setReadOnly(this.syroReadOnlyReason);
        this.syroSessionManager?.setReadOnly(this.syroReadOnlyReason);
    }

    private enableSyroReadOnly(reason: string): void {
        if (this.syroReadOnlyReason === reason) {
            return;
        }

        this.syroReadOnlyReason = reason;
        this.applySyroReadOnlyState();

        if (typeof process === "undefined" || process.env?.NODE_ENV !== "test") {
            new Notice(t("NOTICE_SYRO_READ_ONLY"));
        }
    }

    private async awaitWorkspaceLayoutReady(): Promise<void> {
        await new Promise<void>((resolve) => {
            this.app.workspace.onLayoutReady(() => resolve());
        });
    }

    private buildPendingSyroRecoveryContext(
        startup: SyroWorkspaceInitializeResult,
    ): SyroRecoveryModalContext | null {
        if (
            startup.startupDecision !== "baseline-required" &&
            startup.startupDecision !== "rebuild-required"
        ) {
            return null;
        }

        return {
            mode: startup.startupDecision,
            defaultDeviceName: startup.defaultDeviceName,
            candidates: startup.candidates,
            recommendedSourceDeviceId: startup.recommendedSourceDeviceId,
        };
    }

    private async resolveSyroWorkspaceInitialization(
        startup: SyroWorkspaceInitializeResult,
    ): Promise<SyroWorkspaceInitializeResult> {
        const recoveryContext = this.buildPendingSyroRecoveryContext(startup);
        this.pendingSyroRecoveryContext = recoveryContext;
        if (!recoveryContext) {
            return startup;
        }

        await this.awaitWorkspaceLayoutReady();
        const modalResult = await new SyroRecoveryModal(this.app, recoveryContext).openAndWait();
        if (!modalResult) {
            return {
                ...startup,
                startupDecision: "read-only",
                readOnlyReason: "[SR-Syro] Startup recovery was cancelled by the user.",
            };
        }

        if (!this.syroWorkspace) {
            return {
                ...startup,
                startupDecision: "read-only",
                readOnlyReason: "[SR-Syro] Workspace recovery is unavailable.",
            };
        }

        try {
            const layout =
                recoveryContext.mode === "baseline-required"
                    ? await this.syroWorkspace.completeBaselineJoin({
                          deviceName: modalResult.deviceName,
                          sourceDeviceId: modalResult.sourceDeviceId,
                      })
                    : await this.syroWorkspace.rebuildFromBaseline({
                          deviceName: modalResult.deviceName,
                          sourceDeviceId: modalResult.sourceDeviceId,
                      });
            this.pendingSyroRecoveryContext = null;
            return {
                ...startup,
                startupDecision: "ready",
                layout,
                readOnlyReason: null,
            };
        } catch (error) {
            return {
                ...startup,
                startupDecision: "read-only",
                readOnlyReason: `[SR-Syro] Failed to complete startup recovery: ${String(error)}`,
            };
        }
    }

    private async pruneSyroMergeState(): Promise<void> {
        if (!this.syroMergeState || this.syroReadOnlyReason) {
            return;
        }

        if (this.syroMergeState.pruneExpired(SYRO_MERGE_STATE_RETENTION_MS) > 0) {
            await this.syroMergeState.save();
        }
    }

    private async openPendingSyroRecovery(): Promise<void> {
        if (!this.pendingSyroRecoveryContext || !this.syroWorkspace) {
            new Notice(t("NOTICE_SYRO_RECOVERY_NOT_NEEDED"));
            return;
        }

        await this.awaitWorkspaceLayoutReady();
        const modalResult = await new SyroRecoveryModal(
            this.app,
            this.pendingSyroRecoveryContext,
        ).openAndWait();
        if (!modalResult) {
            new Notice(t("NOTICE_SYRO_RECOVERY_CANCELLED"));
            return;
        }

        try {
            if (this.pendingSyroRecoveryContext.mode === "baseline-required") {
                await this.syroWorkspace.completeBaselineJoin({
                    deviceName: modalResult.deviceName,
                    sourceDeviceId: modalResult.sourceDeviceId,
                });
            } else {
                await this.syroWorkspace.rebuildFromBaseline({
                    deviceName: modalResult.deviceName,
                    sourceDeviceId: modalResult.sourceDeviceId,
                });
            }
        } catch (error) {
            this.enableSyroReadOnly(`[SR-Syro] Failed to complete recovery: ${String(error)}`);
            return;
        }

        this.pendingSyroRecoveryContext = null;
        this.clearSyroReadOnly();
        await this.loadPluginData();
        await this.refreshNoteReview({ trigger: "startup" });
        this.syncEvents.emit("note-review-updated");
        this.syncEvents.emit("sync-complete");
    }

    private async importPendingSyroSessions(): Promise<void> {
        if (this.syroReadOnlyReason) {
            return;
        }

        if (
            !this.syroSessionManager ||
            !this.syroMergeState ||
            !this.deckOptionsStore ||
            !this.sharedSettingsStore ||
            !this.trackingRulesStore ||
            !this.dailyStateStore ||
            !this.store ||
            !this.noteReviewStore ||
            !this.reviewCommitStore
        ) {
            return;
        }

        await this.syroSessionManager.importPendingSessions(async (_sessionId, records) => {
            await replaySyroSessionRecords(records, {
                settings: this.data.settings,
                data: this.data,
                store: this.store,
                noteReviewStore: this.noteReviewStore,
                reviewCommitStore: this.reviewCommitStore,
                deckOptionsStore: this.deckOptionsStore,
                sharedSettingsStore: this.sharedSettingsStore,
                trackingRulesStore: this.trackingRulesStore,
                dailyStateStore: this.dailyStateStore,
                trackingRulesTombstones: this.trackingRulesTombstones,
                mergeState: this.syroMergeState,
            });
        });
        this.persistedSharedSettingsState = extractSharedSettings(this.data.settings);
        this.persistedTrackingRulesState = extractTrackingRules(
            this.data.folderTrackingRules,
            this.trackingRulesTombstones,
        );
        this.persistedDailyState = extractDailyState({
            buryDate: this.data.buryDate,
            buryList: this.data.buryList,
            dailyDeckStats: this.data.dailyDeckStats,
        });
        await this.pruneSyroMergeState();
    }

    private async appendSyroNoteSnapshot(
        opType: string,
        snapshot: NoteReviewEntrySnapshot,
        extraPayload?: Record<string, unknown>,
    ): Promise<boolean> {
        if (this.syroReadOnlyReason) {
            return false;
        }

        const targetUuid = snapshot.item.uuid || `note:${snapshot.path}`;
        const updatedAt = new Date().toISOString();
        const appended =
            (await this.syroSessionManager?.appendRecord({
                domain: "notes",
                entityType: "note-review",
                opType,
                targetUuid,
                payload: {
                    path: snapshot.path,
                    source: snapshot.source,
                    deckName: snapshot.deckName,
                    item: snapshot.item,
                    ...extraPayload,
                },
                pathHint: snapshot.path,
                updatedAt,
            })) ?? false;
        if (appended) {
            await this.markSyroMergeState([
                {
                    targetUuid,
                    updatedAt,
                    deleted: opType === "remove",
                    domain: "notes",
                    entityType: "note-review",
                    pathHint: snapshot.path,
                },
            ]);
        }
        return appended;
    }

    private async appendSyroTimelineEntry(
        opType: "add" | "edit" | "delete",
        notePath: string,
        commit: ReviewCommitLog,
    ): Promise<boolean> {
        if (this.syroReadOnlyReason) {
            return false;
        }

        const targetUuid = `timeline-entry:${commit.id}`;
        const updatedAt = new Date().toISOString();
        const appended =
            (await this.syroSessionManager?.appendRecord({
                domain: "timeline",
                entityType: "timeline-entry",
                opType,
                targetUuid,
                payload: {
                    notePath,
                    commit,
                },
                pathHint: notePath,
                updatedAt,
            })) ?? false;
        if (appended) {
            await this.markSyroMergeState([
                {
                    targetUuid,
                    updatedAt,
                    deleted: opType === "delete",
                    domain: "timeline",
                    entityType: "timeline-entry",
                    pathHint: notePath,
                },
            ]);
        }
        return appended;
    }

    private async appendSyroCardSnapshot(
        opType: string,
        snapshot: TrackedCardSnapshot,
        extraPayload?: Record<string, unknown>,
    ): Promise<boolean> {
        if (this.syroReadOnlyReason) {
            return false;
        }

        const targetUuid =
            snapshot.item.uuid || `card:${snapshot.path}:${snapshot.trackedItem?.reviewId ?? snapshot.item.ID}`;
        const updatedAt = new Date().toISOString();
        const appended =
            (await this.syroSessionManager?.appendRecord({
                domain: "cards",
                entityType: "card-item",
                opType,
                targetUuid,
                payload: {
                    path: snapshot.path,
                    trackedFileUuid: snapshot.trackedFileUuid,
                    trackedFileTags: snapshot.trackedFileTags,
                    trackedItem: snapshot.trackedItem,
                    item: snapshot.item,
                    ...extraPayload,
                },
                pathHint: snapshot.path,
                updatedAt,
            })) ?? false;
        if (appended) {
            await this.markSyroMergeState([
                {
                    targetUuid,
                    updatedAt,
                    deleted: opType === "remove",
                    domain: "cards",
                    entityType: "card-item",
                    pathHint: snapshot.path,
                },
            ]);
        }
        return appended;
    }

    private async appendSyroTrackedFileSnapshot(
        opType: "rename-file" | "delete-file",
        snapshot: TrackedCardsFileSnapshot,
        extraPayload?: Record<string, unknown>,
    ): Promise<boolean> {
        if (this.syroReadOnlyReason) {
            return false;
        }

        const targetUuid = snapshot.uuid || `tracked-file:${snapshot.path}`;
        const updatedAt = new Date().toISOString();
        const appended =
            (await this.syroSessionManager?.appendRecord({
                domain: "cards",
                entityType: "tracked-file",
                opType,
                targetUuid,
                payload: {
                    uuid: snapshot.uuid,
                    path: snapshot.path,
                    tags: snapshot.tags,
                    items: snapshot.items,
                    trackedItems: snapshot.trackedItems,
                    relatedItems: snapshot.relatedItems,
                    ...extraPayload,
                },
                pathHint: snapshot.path,
                updatedAt,
            })) ?? false;
        if (appended) {
            const mergeEntities = [
                {
                    targetUuid,
                    updatedAt,
                    deleted: opType === "delete-file",
                    domain: "cards" as const,
                    entityType: "tracked-file",
                    pathHint: snapshot.path,
                },
                ...snapshot.relatedItems.map((item) => ({
                    targetUuid: item.uuid || `card:${snapshot.path}:${item.ID}`,
                    updatedAt,
                    deleted: opType === "delete-file",
                    domain: "cards" as const,
                    entityType: "card-item",
                    pathHint: snapshot.path,
                })),
            ];
            await this.markSyroMergeState(mergeEntities);
        }
        return appended;
    }

    public async appendSyroNoteUpsert(
        snapshot: NoteReviewEntrySnapshot | null,
        opType = "upsert",
    ): Promise<boolean> {
        if (!snapshot) {
            return false;
        }

        return this.appendSyroNoteSnapshot(opType, snapshot);
    }

    public async appendSyroNoteRemove(
        snapshot: NoteReviewEntrySnapshot | null,
        opType = "remove",
    ): Promise<boolean> {
        if (!snapshot) {
            return false;
        }

        return this.appendSyroNoteSnapshot(opType, snapshot);
    }

    public async appendSyroNoteRename(
        oldPath: string,
        snapshot: NoteReviewEntrySnapshot | null,
        opType = "rename",
    ): Promise<boolean> {
        if (!snapshot) {
            return false;
        }

        return this.appendSyroNoteSnapshot(opType, snapshot, {
            oldPath,
            newPath: snapshot.path,
        });
    }

    public async appendSyroCardUpsert(
        snapshot: TrackedCardSnapshot | null,
        opType = "upsert",
    ): Promise<boolean> {
        if (!snapshot) {
            return false;
        }

        return this.appendSyroCardSnapshot(opType, snapshot);
    }

    public async appendSyroCardRemove(
        snapshot: TrackedCardSnapshot | null,
        opType = "remove",
    ): Promise<boolean> {
        if (!snapshot) {
            return false;
        }

        return this.appendSyroCardSnapshot(opType, snapshot);
    }

    public async appendSyroCardsRenameFile(
        oldPath: string,
        snapshot: TrackedCardsFileSnapshot | null,
    ): Promise<boolean> {
        if (!snapshot) {
            return false;
        }

        return this.appendSyroTrackedFileSnapshot("rename-file", snapshot, {
            oldPath,
            newPath: snapshot.path,
        });
    }

    public async appendSyroCardsDeleteFile(
        snapshot: TrackedCardsFileSnapshot | null,
    ): Promise<boolean> {
        if (!snapshot) {
            return false;
        }

        return this.appendSyroTrackedFileSnapshot("delete-file", snapshot);
    }

    public async appendSyroTimelineAdd(
        notePath: string,
        commit: ReviewCommitLog | null,
    ): Promise<boolean> {
        if (!commit) {
            return false;
        }

        return this.appendSyroTimelineEntry("add", notePath, commit);
    }

    public async appendSyroTimelineEdit(
        notePath: string,
        commit: ReviewCommitLog | null,
    ): Promise<boolean> {
        if (!commit) {
            return false;
        }

        return this.appendSyroTimelineEntry("edit", notePath, commit);
    }

    public async appendSyroTimelineDelete(
        notePath: string,
        commit: ReviewCommitLog | null,
    ): Promise<boolean> {
        if (!commit) {
            return false;
        }

        return this.appendSyroTimelineEntry("delete", notePath, commit);
    }

    public async appendSyroTimelineRenameFile(
        oldPath: string,
        newPath: string,
        commits: ReviewCommitLog[],
    ): Promise<boolean> {
        if (this.syroReadOnlyReason) {
            return false;
        }

        const updatedAt = new Date().toISOString();
        const appended =
            (await this.syroSessionManager?.appendRecord({
                domain: "timeline",
                entityType: "timeline-file",
                opType: "rename-file",
                targetUuid: `timeline-file:${oldPath}`,
                payload: {
                    oldPath,
                    newPath,
                    commits,
                },
                pathHint: newPath,
                updatedAt,
            })) ?? false;
        if (appended) {
            await this.markSyroMergeState([
                {
                    targetUuid: `timeline-file:${oldPath}`,
                    updatedAt,
                    deleted: false,
                    domain: "timeline",
                    entityType: "timeline-file",
                    pathHint: newPath,
                },
                ...commits.map((commit) => ({
                    targetUuid: `timeline-entry:${commit.id}`,
                    updatedAt,
                    deleted: false,
                    domain: "timeline" as const,
                    entityType: "timeline-entry",
                    pathHint: newPath,
                })),
            ]);
        }
        return appended;
    }

    public async appendSyroTimelineDeleteFile(
        notePath: string,
        commits: ReviewCommitLog[],
    ): Promise<boolean> {
        if (this.syroReadOnlyReason) {
            return false;
        }

        const updatedAt = new Date().toISOString();
        const appended =
            (await this.syroSessionManager?.appendRecord({
                domain: "timeline",
                entityType: "timeline-file",
                opType: "delete-file",
                targetUuid: `timeline-file:${notePath}`,
                payload: {
                    notePath,
                    commits,
                },
                pathHint: notePath,
                updatedAt,
            })) ?? false;
        if (appended) {
            await this.markSyroMergeState([
                {
                    targetUuid: `timeline-file:${notePath}`,
                    updatedAt,
                    deleted: true,
                    domain: "timeline",
                    entityType: "timeline-file",
                    pathHint: notePath,
                },
                ...commits.map((commit) => ({
                    targetUuid: `timeline-entry:${commit.id}`,
                    updatedAt,
                    deleted: true,
                    domain: "timeline" as const,
                    entityType: "timeline-entry",
                    pathHint: notePath,
                })),
            ]);
        }
        return appended;
    }

    public showNoteReviewIgnoreNotice(reason: NoteReviewIgnoreReason): void {
        new Notice(
            t(reason === "ignored-folder" ? "NOTE_IN_IGNORED_FOLDER" : "NOTE_IN_IGNORED_TAGS"),
        );
    }

    private getMarkdownFilesInFolder(folderPath: string): TFile[] {
        return this.app.vault
            .getMarkdownFiles()
            .filter((file) => isPathInsideFolder(folderPath, file.path));
    }

    public getFolderTrackingRule(folderPath: string): FolderTrackingRule | null {
        const rule = this.data.folderTrackingRules?.[folderPath];
        return rule ? cloneFolderTrackingRule(rule) : null;
    }

    public getResolvedFolderTrackingRule(notePath: string) {
        return resolveFolderTrackingRule(this.data.folderTrackingRules ?? {}, notePath);
    }

    public async saveFolderTrackingRuleConfig(
        folderPath: string,
        updates: Pick<FolderTrackingRule, "track" | "autoTag" | "tags">,
    ): Promise<void> {
        const previousRule = this.getFolderTrackingRule(folderPath) ?? {
            ...cloneFolderTrackingRule(DEFAULT_FOLDER_TRACKING_RULE),
            track: true,
        };
        const nextRule = cloneFolderTrackingRule({
            ...previousRule,
            ...updates,
            tags: normalizeFolderTrackingTags(updates.tags ?? []),
        });

        await this.syncFolderTrackingRuleFiles(folderPath, previousRule, nextRule);
        this.data.folderTrackingRules[folderPath] = nextRule;
        this.requestPluginDataSave(0);
        await this.refreshNoteReview({ trigger: "manual" });
    }

    public async resetFolderTrackingRuleConfig(folderPath: string): Promise<void> {
        const existingRule = this.getFolderTrackingRule(folderPath);
        if (!existingRule) {
            return;
        }

        await this.syncFolderTrackingRuleFiles(
            folderPath,
            existingRule,
            cloneFolderTrackingRule(DEFAULT_FOLDER_TRACKING_RULE),
        );
        delete this.data.folderTrackingRules[folderPath];
        this.requestPluginDataSave(0);
        await this.refreshNoteReview({ trigger: "manual" });
    }

    public async ensureFolderTrackingForFile(file: TFile): Promise<boolean> {
        if (file.extension !== "md") {
            return false;
        }

        const resolvedRule = this.getResolvedFolderTrackingRule(file.path);
        if (!resolvedRule) {
            return false;
        }

        let changed = false;
        const nextRule = cloneFolderTrackingRule(resolvedRule.rule);
        const previousOwnedTags = nextRule.ownedTagsByPath[file.path] ?? [];
        const desiredTags = nextRule.autoTag ? nextRule.tags : [];
        const retainedOwnedTags = normalizeFolderTrackingTags(
            previousOwnedTags.filter((tag) => desiredTags.includes(tag)),
        );
        const removedTags = normalizeFolderTrackingTags(
            previousOwnedTags.filter((tag) => !desiredTags.includes(tag)),
        );

        if (removedTags.length > 0) {
            const removed = await this.removeFolderTrackingTagsFromFile(file, removedTags);
            if (removed.length > 0) {
                changed = true;
            }
        }

        let addedTags: string[] = [];
        if (nextRule.autoTag && nextRule.tags.length > 0) {
            addedTags = await this.addFolderTrackingTagsToFile(file, nextRule.tags);
            if (addedTags.length > 0) {
                changed = true;
            }
        }

        const finalOwnedTags = normalizeFolderTrackingTags([...retainedOwnedTags, ...addedTags]);
        if (finalOwnedTags.length > 0) {
            nextRule.ownedTagsByPath[file.path] = finalOwnedTags;
        } else {
            delete nextRule.ownedTagsByPath[file.path];
        }

        if (!nextRule.track && nextRule.excludedPaths.length > 0) {
            nextRule.excludedPaths = [];
            changed = true;
        }

        if (JSON.stringify(nextRule) !== JSON.stringify(resolvedRule.rule)) {
            this.data.folderTrackingRules[resolvedRule.folderPath] = nextRule;
            changed = true;
        }

        if (changed) {
            this.requestPluginDataSave(0);
        }

        return changed;
    }

    private async syncFolderTrackingRuleFiles(
        folderPath: string,
        previousRule: FolderTrackingRule | null,
        nextRule: FolderTrackingRule,
    ): Promise<void> {
        const files = this.getMarkdownFilesInFolder(folderPath);
        const previousOwnedTagsByPath = previousRule?.ownedTagsByPath ?? {};
        const nextOwnedTagsByPath: Record<string, string[]> = {};
        const desiredTags = nextRule.autoTag ? normalizeFolderTrackingTags(nextRule.tags) : [];

        for (const file of files) {
            const previousOwnedTags = previousOwnedTagsByPath[file.path] ?? [];
            const retainedOwnedTags = normalizeFolderTrackingTags(
                previousOwnedTags.filter((tag) => desiredTags.includes(tag)),
            );
            const removedTags = normalizeFolderTrackingTags(
                previousOwnedTags.filter((tag) => !desiredTags.includes(tag)),
            );

            if (removedTags.length > 0) {
                await this.removeFolderTrackingTagsFromFile(file, removedTags);
            }

            let addedTags: string[] = [];
            if (nextRule.autoTag && desiredTags.length > 0) {
                addedTags = await this.addFolderTrackingTagsToFile(file, desiredTags);
            }

            const finalOwnedTags = normalizeFolderTrackingTags([
                ...retainedOwnedTags,
                ...addedTags,
            ]);
            if (finalOwnedTags.length > 0) {
                nextOwnedTagsByPath[file.path] = finalOwnedTags;
            }
        }

        nextRule.ownedTagsByPath = nextOwnedTagsByPath;
        if (!nextRule.track) {
            nextRule.excludedPaths = [];
        }
    }

    private async addFolderTrackingTagsToFile(
        file: TFile,
        desiredTags: string[],
    ): Promise<string[]> {
        const normalizedDesiredTags = normalizeFolderTrackingTags(desiredTags);
        if (normalizedDesiredTags.length === 0) {
            return [];
        }

        let addedTags: string[] = [];
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            const currentTags = readFolderTrackingFrontmatterTags(frontmatter);
            addedTags = normalizedDesiredTags.filter((tag) => !currentTags.includes(tag));
            if (addedTags.length === 0) {
                return;
            }

            writeFolderTrackingFrontmatterTags(frontmatter, [...currentTags, ...addedTags]);
        });

        return addedTags;
    }

    private async removeFolderTrackingTagsFromFile(
        file: TFile,
        tagsToRemove: string[],
    ): Promise<string[]> {
        const normalizedTagsToRemove = normalizeFolderTrackingTags(tagsToRemove);
        if (normalizedTagsToRemove.length === 0) {
            return [];
        }

        let removedTags: string[] = [];
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            const currentTags = readFolderTrackingFrontmatterTags(frontmatter);
            removedTags = currentTags.filter((tag) => normalizedTagsToRemove.includes(tag));
            if (removedTags.length === 0) {
                return;
            }

            const nextTags = currentTags.filter((tag) => !normalizedTagsToRemove.includes(tag));
            if (nextTags.length > 0) {
                writeFolderTrackingFrontmatterTags(frontmatter, nextTags);
            } else {
                clearFolderTrackingFrontmatterTags(frontmatter);
            }
        });

        return removedTags;
    }

    public excludeNoteFromFolderTracking(notePath: string): boolean {
        const resolvedRule = this.getResolvedFolderTrackingRule(notePath);
        if (!resolvedRule || !resolvedRule.rule.track) {
            return false;
        }

        if (resolvedRule.rule.excludedPaths.includes(notePath)) {
            return false;
        }

        resolvedRule.rule.excludedPaths = [...resolvedRule.rule.excludedPaths, notePath];
        this.data.folderTrackingRules[resolvedRule.folderPath] = resolvedRule.rule;
        this.requestPluginDataSave(0);
        return true;
    }

    public clearFolderTrackingExclusion(notePath: string): boolean {
        let changed = false;

        for (const [folderPath, rule] of Object.entries(this.data.folderTrackingRules ?? {})) {
            if (!rule.excludedPaths.includes(notePath)) {
                continue;
            }

            const nextRule = cloneFolderTrackingRule(rule);
            nextRule.excludedPaths = nextRule.excludedPaths.filter((path) => path !== notePath);
            this.data.folderTrackingRules[folderPath] = nextRule;
            changed = true;
        }

        if (changed) {
            this.requestPluginDataSave(0);
        }

        return changed;
    }

    public renameFolderTrackingPaths(oldPath: string, newPath: string): boolean {
        let changed = false;
        const nextRules: Record<string, FolderTrackingRule> = {};

        for (const [folderPath, rule] of Object.entries(this.data.folderTrackingRules ?? {})) {
            const nextFolderPath = renamePathPrefix(folderPath, oldPath, newPath);
            const nextRule = cloneFolderTrackingRule(rule);
            const nextOwnedTagsByPath: Record<string, string[]> = {};

            for (const [path, tags] of Object.entries(nextRule.ownedTagsByPath)) {
                const nextPath = renamePathPrefix(path, oldPath, newPath);
                if (!isPathInsideFolder(nextFolderPath, nextPath)) {
                    changed = true;
                    continue;
                }

                nextOwnedTagsByPath[nextPath] = tags;
                if (nextPath !== path) {
                    changed = true;
                }
            }

            nextRule.ownedTagsByPath = nextOwnedTagsByPath;
            nextRule.excludedPaths = nextRule.excludedPaths
                .map((path) => renamePathPrefix(path, oldPath, newPath))
                .filter((path) => {
                    const shouldKeep = isPathInsideFolder(nextFolderPath, path);
                    if (!shouldKeep) {
                        changed = true;
                    }
                    return shouldKeep;
                });

            if (nextFolderPath !== folderPath) {
                changed = true;
            }

            nextRules[nextFolderPath] = nextRule;
        }

        if (changed) {
            this.data.folderTrackingRules = nextRules;
            this.requestPluginDataSave(0);
        }

        return changed;
    }

    public removeFolderTrackingPaths(deletedPath: string): boolean {
        let changed = false;
        const nextRules: Record<string, FolderTrackingRule> = {};

        for (const [folderPath, rule] of Object.entries(this.data.folderTrackingRules ?? {})) {
            if (isPathInsideFolder(deletedPath, folderPath)) {
                changed = true;
                continue;
            }

            const nextRule = cloneFolderTrackingRule(rule);
            const nextOwnedTagsByPath = Object.fromEntries(
                Object.entries(nextRule.ownedTagsByPath).filter(([path]) => {
                    const shouldKeep = !isPathInsideFolder(deletedPath, path);
                    if (!shouldKeep) {
                        changed = true;
                    }
                    return shouldKeep;
                }),
            );
            const nextExcludedPaths = nextRule.excludedPaths.filter((path) => {
                const shouldKeep = !isPathInsideFolder(deletedPath, path);
                if (!shouldKeep) {
                    changed = true;
                }
                return shouldKeep;
            });

            nextRule.ownedTagsByPath = nextOwnedTagsByPath;
            nextRule.excludedPaths = nextExcludedPaths;
            nextRules[folderPath] = nextRule;
        }

        if (changed) {
            this.data.folderTrackingRules = nextRules;
            this.requestPluginDataSave(0);
        }

        return changed;
    }

    private resolveNoteReviewTracking(
        note: TFile,
    ): { deckName: string; source: NoteReviewSource } | null {
        const existing = this.noteReviewStore.getEntry(note.path);
        if (existing?.source === "manual") {
            return { deckName: existing.deckName ?? DEFAULT_DECKNAME, source: "manual" };
        }

        const resolvedRule = this.getResolvedFolderTrackingRule(note.path);
        if (
            resolvedRule &&
            resolvedRule.rule.track &&
            !resolvedRule.rule.excludedPaths.includes(note.path)
        ) {
            return {
                deckName:
                    existing?.source === "folder"
                        ? (existing.deckName ?? DEFAULT_DECKNAME)
                        : DEFAULT_DECKNAME,
                source: "folder",
            };
        }

        return null;
    }

    public async trackNoteFromMenu(file: TFile): Promise<void> {
        this.clearFolderTrackingExclusion(file.path);

        this.noteReviewStore.ensureTracked(
            file.path,
            DEFAULT_DECKNAME,
            "manual",
            this.noteAlgorithm,
        );
        await this.noteReviewStore.save();
        await this.appendSyroNoteUpsert(this.noteReviewStore.getEntrySnapshot(file.path), "track");
        await this.refreshNoteReview({ trigger: "manual" });
    }

    public async untrackNoteFromMenu(file: TFile): Promise<void> {
        const resolvedRule = this.getResolvedFolderTrackingRule(file.path);
        if (resolvedRule?.rule.track === true) {
            this.excludeNoteFromFolderTracking(file.path);
        }

        const removedSnapshot = this.noteReviewStore.removeWithSnapshot(file.path);
        await this.noteReviewStore.save();
        await this.appendSyroNoteRemove(removedSnapshot, "remove");

        if (this.reviewFloatBar.isDisplay() && this.data.settings.autoNextNote) {
            await this.reviewNextNote(this.lastSelectedReviewDeck);
        }

        await this.refreshNoteReview({ trigger: "manual" });
    }

    private async initializeFirstRunTutorialNote(): Promise<void> {
        const tutorial = getFirstRunTutorial();
        let tutorialFile = this.app.vault.getAbstractFileByPath(tutorial.path);

        if (!tutorialFile) {
            tutorialFile = await this.app.vault.create(tutorial.path, tutorial.content);
        }

        if (!(tutorialFile instanceof TFile)) {
            console.warn("[SR] First-run tutorial path is not a markdown file:", tutorial.path);
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

        if (
            !this.syroReadOnlyReason &&
            (request.trigger === "manual" ||
                request.trigger === "background" ||
                request.trigger === "startup")
        ) {
            let sealReason: SyroSessionSealReason = "manual";
            if (request.trigger === "background") {
                sealReason = "background";
            } else if (request.trigger === "startup") {
                sealReason = "startup";
            }
            await this.syroSessionManager?.flushActiveSession(sealReason);
        }

        await this.importPendingSyroSessions?.();

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
                return (
                    SettingsUtil.getNoteReviewIgnoreReason(
                        this.data.settings,
                        noteFile.path,
                        tags,
                    ) === null
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

            // if (reviewMode !== FlashcardReviewMode.Cram) {
            //     this.remainingDeckTree = DeckTreeFilter.filterByDailyLimits(
            //         this.remainingDeckTree,
            //         this,
            //     );
            // }

            // this.collectLearningCardsFromStore(this.remainingDeckTree);
            const calc: DeckTreeStatsCalculator = new DeckTreeStatsCalculator();
            this.cardStats = calc.calculate(this.deckTree);
            setDueDates(this.cardStats.delayedDays.dict, this.cardStats.delayedDays.dict);

            const statsService = DeckStatsService.getInstance();
            statsService.setSyncEvents(this.syncEvents);
            statsService.clearCache();

            const deckItemsMap = new Map<string, RepetitionItem[]>();

            const addItemsToMap = (deck: Deck) => {
                const deckPathName =
                    deck.deckName === "root" ? "root" : deck.getTopicPath().path.join("/");

                const itemsInDeck: RepetitionItem[] = [];
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
            this.updateStatusBar();

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
            await this.consumePendingReviewSessionReloadAfterSync(syncMode);
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
        await this.store.save();
        await note.clearTransientFileText(this.data.settings);
        return note;
    }

    public async getReadonlyNoteCardStats(file: TFile): Promise<InlineTitleCardStats> {
        if (!(file instanceof TFile) || file.extension !== "md") {
            return {
                reviewableCount: 0,
                totalCount: 0,
            };
        }

        const now = Date.now();
        const learnAheadMillis = Math.max(0, this.data.settings.learnAheadMinutes ?? 0) * 60 * 1000;
        const cacheEntry = this.noteCache.get(file.path);
        const mtime = file.stat?.mtime ?? 0;

        if (cacheEntry && cacheEntry.mtime === mtime) {
            return countInlineTitleStatsFromNote(cacheEntry.note, now, learnAheadMillis);
        }

        try {
            const fileText = await this.app.vault.read(file);
            const trackedFile = cloneTrackedFileForInlineTitleStats(
                file.path,
                this.store.getTrackedFile(file.path),
            );
            trackedFile.syncNoteCardsIndex(fileText, this.data.settings);

            return countInlineTitleStatsFromTrackedFile(
                trackedFile,
                (id) => this.store.getItembyID(id),
                now,
                learnAheadMillis,
            );
        } catch (error) {
            console.warn(
                `[SR] Failed to calculate inline-title card stats for ${file.path}:`,
                error,
            );
            return {
                reviewableCount: 0,
                totalCount: 0,
            };
        }
    }

    public buildInlineTitleCardMenu(file: TFile): Menu {
        const menu = new Menu();
        this.app.workspace.trigger("file-menu", menu, file, "syro-inline-title", null);
        return menu;
    }

    public refreshInlineTitleReviewButtons(): void {
        this.inlineTitleReviewButtonManager?.refresh();
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
            console.debug("[SR Debug] noteAlgorithm: WeightedMultiplier");
        }

        const ignoreReason = this.getNoteReviewIgnoreReason(note);
        if (ignoreReason) {
            this.showNoteReviewIgnoreNotice(ignoreReason);
            return;
        }
        const tracking = this.resolveNoteReviewTracking(note);
        if (!tracking) {
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
        if (item.isNew) {
            if (debugScheduling) {
                console.debug("[SR Debug] Calculating ease for new note (WMS)");
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
        await this.appendSyroNoteUpsert(this.noteReviewStore.getEntrySnapshot(note.path), "review");
        try {
            const timelineCommit = await autoCommitReviewResponseToTimeline({
                app: this.app,
                commitStore: this.reviewCommitStore,
                enabled: settings.timelineAutoCommitReviewSelection,
                notePath: note.path,
                response,
                intervalDays: timelineIntervalDays,
            });
            await this.appendSyroTimelineAdd(note.path, timelineCommit);
        } catch (error) {
            console.error("[Timeline] Failed to auto-log review response:", error);
        }
        this.postponeResponse(note, itemToShedNote(item, note));
        this.syncEvents.emit("note-review-updated");

        if (debugScheduling) {
            console.debug("[SR Debug] saveReviewResponse completed successfully");
        }
    }

    // return false if is ignored
    tagCheck(note: TFile) {
        const fileCachedData = this.app.metadataCache.getFileCache(note) || {};

        const tags = getAllTags(fileCachedData) || [];
        const ignoreReason = SettingsUtil.getNoteReviewIgnoreReason(
            this.data.settings,
            note.path,
            tags,
        );
        if (ignoreReason) {
            this.showNoteReviewIgnoreNotice(ignoreReason);
            return false;
        }

        if (!SettingsUtil.isAnyTagANoteReviewTag(this.data.settings, tags)) {
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

    private initializeRuntimePluginData(legacyData: LegacyPluginData): void {
        const baseSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as SRSettings;
        const legacySettings = legacyData.settings
            ? (JSON.parse(JSON.stringify(legacyData.settings)) as Partial<SRSettings>)
            : {};
        upgradeSettings(legacySettings as SRSettings);

        this.data = {
            settings: Object.assign(baseSettings, legacySettings),
            buryDate: legacyData.buryDate ?? "",
            buryList: [...(legacyData.buryList ?? [])],
            historyDeck: legacyData.historyDeck ?? null,
            dailyDeckStats: legacyData.dailyDeckStats ?? {
                date: "",
                counts: {},
            },
            folderTrackingRules: Object.fromEntries(
                Object.entries(legacyData.folderTrackingRules ?? {}).map(([folderPath, rule]) => [
                    folderPath,
                    cloneFolderTrackingRule(rule),
                ]),
            ),
        };
        upgradeSettings(this.data.settings);
    }

    private initializeSplitStateStores(): void {
        if (!this.syroLayout) {
            return;
        }

        this.sharedSettingsStore = new SyroJsonStateStore(
            this.syroLayout.settingsPath,
            parseSharedSettingsState,
        );
        this.trackingRulesStore = new SyroJsonStateStore(
            this.syroLayout.trackingRulesPath,
            parseTrackingRulesState,
        );
        this.dailyStateStore = new SyroJsonStateStore(
            this.syroLayout.dailyStatePath,
            parseDailyState,
        );
        this.deviceStateStore = new SyroJsonStateStore(
            this.syroLayout.deviceStatePath,
            parseDeviceState,
        );
        this.licenseStateStore = new SyroJsonStateStore(
            this.syroLayout.licenseStatePath,
            parseLicenseState,
        );
    }

    private async saveDataShell(completedAt?: string): Promise<void> {
        let existingCompletedAt: string | null = null;
        const migrations = this.dataShell?.migrations;
        const syro012Migration =
            isRecord(migrations) && isRecord(migrations["syro012"]) ? migrations["syro012"] : null;
        if (syro012Migration) {
            existingCompletedAt = getStringProp(syro012Migration, "completedAt") ?? null;
        }
        const shell = createSyro012DataShell(
            completedAt ?? existingCompletedAt ?? new Date().toISOString(),
        );
        this.dataShell = shell;
        await this.saveData(shell);
    }

    private async validateMigratedSplitState(): Promise<string | null> {
        const sharedState = await this.sharedSettingsStore?.load();
        if (!sharedState) {
            return this.sharedSettingsStore?.lastLoadError ?? "[SR-Syro] Invalid settings.json schema.";
        }

        const trackingRulesState = await this.trackingRulesStore?.load();
        if (!trackingRulesState) {
            return (
                this.trackingRulesStore?.lastLoadError ??
                "[SR-Syro] Invalid tracking-rules.json schema."
            );
        }

        const dailyState = await this.dailyStateStore?.load();
        if (!dailyState) {
            return this.dailyStateStore?.lastLoadError ?? "[SR-Syro] Invalid daily-state.json schema.";
        }

        return null;
    }

    private async migrateLegacyPluginDataIfNeeded(rawData: unknown): Promise<string | null> {
        if (
            hasSyro012MigrationMarker(rawData) ||
            !this.sharedSettingsStore ||
            !this.trackingRulesStore ||
            !this.dailyStateStore ||
            !this.deviceStateStore ||
            !this.licenseStateStore
        ) {
            this.dataShell = parseLegacyPluginData(rawData);
            return null;
        }

        const sharedSettingsState = extractSharedSettings(this.data.settings);
        const trackingRulesState = extractTrackingRules(this.data.folderTrackingRules, {});
        const dailyState = extractDailyState({
            buryDate: this.data.buryDate,
            buryList: this.data.buryList,
            dailyDeckStats: this.data.dailyDeckStats,
        });
        const deviceState = extractDeviceState({
            settings: this.data.settings,
            historyDeck: this.data.historyDeck,
        });
        const licenseState = extractLicenseState(this.data.settings);

        await this.sharedSettingsStore.save(sharedSettingsState);
        await this.trackingRulesStore.save(trackingRulesState);
        await this.dailyStateStore.save(dailyState);
        await this.deviceStateStore.save(deviceState);
        await this.licenseStateStore.save(licenseState);

        const validationError = await this.validateMigratedSplitState();
        if (validationError) {
            return validationError;
        }

        await this.saveDataShell(new Date().toISOString());
        return null;
    }

    private async loadSplitPluginState(): Promise<string | null> {
        if (
            !this.sharedSettingsStore ||
            !this.trackingRulesStore ||
            !this.dailyStateStore ||
            !this.deviceStateStore ||
            !this.licenseStateStore
        ) {
            return null;
        }

        const sharedSettingsState = await this.sharedSettingsStore.load();
        if (sharedSettingsState) {
            applySharedSettings(this.data.settings, sharedSettingsState);
            this.persistedSharedSettingsState = sharedSettingsState;
        } else if (this.sharedSettingsStore.lastLoadError) {
            return this.sharedSettingsStore.lastLoadError;
        } else {
            const nextState = extractSharedSettings(this.data.settings);
            this.persistedSharedSettingsState = nextState;
            if (!this.syroReadOnlyReason) {
                await this.sharedSettingsStore.save(nextState);
            }
        }

        const trackingRulesState = await this.trackingRulesStore.load();
        if (trackingRulesState) {
            applyTrackingRules(this.data.folderTrackingRules, trackingRulesState);
            this.persistedTrackingRulesState = trackingRulesState;
            this.trackingRulesTombstones = { ...trackingRulesState.tombstones };
        } else if (this.trackingRulesStore.lastLoadError) {
            return this.trackingRulesStore.lastLoadError;
        } else {
            const nextState = extractTrackingRules(this.data.folderTrackingRules, {});
            this.persistedTrackingRulesState = nextState;
            this.trackingRulesTombstones = {};
            if (!this.syroReadOnlyReason) {
                await this.trackingRulesStore.save(nextState);
            }
        }

        const dailyState = await this.dailyStateStore.load();
        if (dailyState) {
            applyDailyState(this.data, dailyState);
            this.persistedDailyState = dailyState;
        } else if (this.dailyStateStore.lastLoadError) {
            return this.dailyStateStore.lastLoadError;
        } else {
            const nextState = extractDailyState({
                buryDate: this.data.buryDate,
                buryList: this.data.buryList,
                dailyDeckStats: this.data.dailyDeckStats,
            });
            this.persistedDailyState = nextState;
            if (!this.syroReadOnlyReason) {
                await this.dailyStateStore.save(nextState);
            }
        }

        const deviceState = await this.deviceStateStore.load();
        if (deviceState) {
            applyDeviceState(
                {
                    settings: this.data.settings,
                    historyDeck: this.data.historyDeck,
                },
                deviceState,
            );
            this.persistedDeviceState = deviceState;
        } else {
            const nextState = extractDeviceState({
                settings: this.data.settings,
                historyDeck: this.data.historyDeck,
            });
            this.persistedDeviceState = deviceState ?? nextState;
            if (!this.syroReadOnlyReason) {
                await this.deviceStateStore.save(nextState);
            }
        }

        const licenseState = await this.licenseStateStore.load();
        if (licenseState) {
            applyLicenseState(this.data.settings, licenseState);
            this.persistedLicenseState = licenseState;
        } else {
            const nextState = extractLicenseState(this.data.settings);
            this.persistedLicenseState = licenseState ?? nextState;
            if (!this.syroReadOnlyReason) {
                await this.licenseStateStore.save(nextState);
            }
        }

        upgradeSettings(this.data.settings);
        return null;
    }

    async loadPluginData(): Promise<void> {
        const loadedDataRaw = (await this.loadData()) as unknown;
        const legacyData = parseLegacyPluginData(loadedDataRaw);
        this.dataShell = legacyData;
        this.initializeRuntimePluginData(legacyData);
        this.clearSyroReadOnly();
        this.syroWorkspace = new SyroWorkspace(this.app, this.manifest.dir, this.data.settings);
        const startup = await this.resolveSyroWorkspaceInitialization(
            await this.syroWorkspace.initialize(),
        );
        this.syroLayout = startup.layout;
        this.initializeSplitStateStores();
        this.syroMergeState = new SyroMergeStateStore(this.syroLayout.mergeStatePath);
        await this.syroMergeState.load();
        if (startup.readOnlyReason) {
            this.syroReadOnlyReason = startup.readOnlyReason;
        }

        const migrationError =
            this.syroReadOnlyReason === null
                ? await this.migrateLegacyPluginDataIfNeeded(loadedDataRaw)
                : null;
        if (migrationError) {
            this.enableSyroReadOnly(migrationError);
        }

        const splitStateLoadError = await this.loadSplitPluginState();
        if (splitStateLoadError) {
            this.enableSyroReadOnly(splitStateLoadError);
        }

        this.deckOptionsStore = new DeckOptionsStore({
            deckOptionsPath: this.syroLayout.deckOptionsPath,
        });
        this.syroSessionManager = new SyroSessionManager(this.app, this.syroLayout);
        this.applySyroReadOnlyState();
        await this.syroSessionManager.initialize();
        this.applySyroReadOnlyState();
        await this.deckOptionsStore.loadIntoSettings(this.data.settings);
        this.store = new DataStore(this.data.settings, {
            cardsPath: this.syroLayout.cardsPath,
            cardsOverlayPath: this.syroLayout.cardsOverlayPath,
            auxiliaryDataDir: this.syroLayout.deviceRoot,
        });
        this.applySyroReadOnlyState();
        await this.store.load();
        this.noteReviewStore = new NoteReviewStore(this.data.settings, {
            notesPath: this.syroLayout.notesPath,
        });
        this.applySyroReadOnlyState();
        await this.noteReviewStore.load();
        await this.noteReviewStore.migrateFromLegacyStore(this.store);
        this.reviewCommitStore = new ReviewCommitStore(this.data.settings, {
            timelinePath: this.syroLayout.timelinePath,
        });
        this.applySyroReadOnlyState();
        await this.reviewCommitStore.load();
        const syroLoadError =
            this.syroReadOnlyReason ??
            this.deckOptionsStore.lastLoadError ??
            this.store.lastLoadError ??
            this.noteReviewStore.lastLoadError ??
            this.reviewCommitStore.lastLoadError;
        if (syroLoadError) {
            this.enableSyroReadOnly(syroLoadError);
        }
        await this.importPendingSyroSessions();
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
        if (
            !this.deckOptionsStore ||
            !this.sharedSettingsStore ||
            !this.trackingRulesStore ||
            !this.dailyStateStore ||
            !this.deviceStateStore ||
            !this.licenseStateStore
        ) {
            await this.saveDataShell();
            return;
        }

        const sharedSettingsState = extractSharedSettings(this.data.settings);
        const previousSharedSettingsState =
            this.persistedSharedSettingsState ?? createDefaultSharedSettingsState();
        const deviceState = extractDeviceState({
            settings: this.data.settings,
            historyDeck: this.data.historyDeck,
        });
        const licenseState = extractLicenseState(this.data.settings);
        const previousTrackingRulesState =
            this.persistedTrackingRulesState ?? createDefaultTrackingRulesState();
        const trackingRulesState = extractTrackingRules(
            this.data.folderTrackingRules,
            this.trackingRulesTombstones,
        );
        const previousDailyState = this.persistedDailyState ?? createDefaultDailyState();
        const dailyState = extractDailyState({
            buryDate: this.data.buryDate,
            buryList: this.data.buryList,
            dailyDeckStats: this.data.dailyDeckStats,
        });

        if (this.syroReadOnlyReason) {
            await this.deviceStateStore.save(deviceState);
            await this.licenseStateStore.save(licenseState);
            this.persistedDeviceState = deviceState;
            this.persistedLicenseState = licenseState;
            await this.saveDataShell();
            return;
        }

        const updatedAt = new Date().toISOString();
        const sharedSettingsDiff = diffSharedSettings(previousSharedSettingsState, sharedSettingsState);
        if (Object.keys(sharedSettingsDiff.changed).length > 0) {
            const appended =
                (await this.syroSessionManager?.appendRecord({
                    domain: "settings",
                    entityType: "shared-settings",
                    opType: "patch",
                    targetUuid: `settings:batch:${updatedAt}`,
                    payload: sharedSettingsDiff,
                    pathHint: this.syroLayout?.settingsPath,
                    updatedAt,
                })) ?? false;
            if (appended) {
                await this.markSyroMergeState(
                    Object.keys(sharedSettingsDiff.changed).map((field) => ({
                        targetUuid: `settings:${field}`,
                        updatedAt,
                        deleted: false,
                        domain: "settings",
                        entityType: "shared-setting",
                        pathHint: this.syroLayout?.settingsPath,
                    })),
                );
            }
        }

        for (const upsert of Object.keys(trackingRulesState.rules)) {
            delete trackingRulesState.tombstones[upsert];
        }
        const trackingRulesDiff = diffTrackingRules(previousTrackingRulesState, trackingRulesState);
        for (const removal of trackingRulesDiff.removals) {
            trackingRulesState.tombstones[removal.folderPath] = {
                updatedAt,
            };
        }

        for (const upsert of trackingRulesDiff.upserts) {
            const appended =
                (await this.syroSessionManager?.appendRecord({
                    domain: "tracking-rules",
                    entityType: "folder-tracking-rule",
                    opType: "upsert-rule",
                    targetUuid: `tracking-rule:${upsert.folderPath}`,
                    payload: {
                        folderPath: upsert.folderPath,
                        rule: upsert.rule,
                    },
                    pathHint: this.syroLayout?.trackingRulesPath,
                    updatedAt,
                })) ?? false;
            if (appended) {
                await this.markSyroMergeState([
                    {
                        targetUuid: `tracking-rule:${upsert.folderPath}`,
                        updatedAt,
                        deleted: false,
                        domain: "tracking-rules",
                        entityType: "folder-tracking-rule",
                        pathHint: this.syroLayout?.trackingRulesPath,
                    },
                ]);
            }
        }
        for (const removal of trackingRulesDiff.removals) {
            const appended =
                (await this.syroSessionManager?.appendRecord({
                    domain: "tracking-rules",
                    entityType: "folder-tracking-rule",
                    opType: "remove-rule",
                    targetUuid: `tracking-rule:${removal.folderPath}`,
                    payload: {
                        folderPath: removal.folderPath,
                    },
                    pathHint: this.syroLayout?.trackingRulesPath,
                    updatedAt,
                })) ?? false;
            if (appended) {
                await this.markSyroMergeState([
                    {
                        targetUuid: `tracking-rule:${removal.folderPath}`,
                        updatedAt,
                        deleted: true,
                        domain: "tracking-rules",
                        entityType: "folder-tracking-rule",
                        pathHint: this.syroLayout?.trackingRulesPath,
                    },
                ]);
            }
        }

        const dailyStateOperations = diffDailyState(previousDailyState, dailyState);
        for (const [index, operation] of dailyStateOperations.entries()) {
            const targetUuid = `daily-op:${updatedAt}:${index}:${operation.opType}`;
            const appended =
                (await this.syroSessionManager?.appendRecord({
                    domain: "daily-state",
                    entityType: "daily-state-op",
                    opType: operation.opType,
                    targetUuid,
                    payload: operation,
                    pathHint: this.syroLayout?.dailyStatePath,
                    updatedAt,
                })) ?? false;
            if (appended) {
                await this.markSyroMergeState([
                    {
                        targetUuid,
                        updatedAt,
                        deleted: false,
                        domain: "daily-state",
                        entityType: "daily-state-op",
                        pathHint: this.syroLayout?.dailyStatePath,
                    },
                ]);
            }
        }

        const deckOptionsSnapshot = createDeckOptionsStoreSnapshot(this.data.settings);
        const deckOptionsChanged = await this.deckOptionsStore.hasSerializedStateChanged(
            deckOptionsSnapshot.serialized,
        );
        if (deckOptionsChanged) {
            const appended =
                (await this.syroSessionManager?.appendDeckOptionsChange(
                    deckOptionsSnapshot.state,
                    updatedAt,
                )) ?? false;
            if (appended) {
                await this.markSyroMergeState([
                    {
                        targetUuid: "deck-options:global",
                        updatedAt,
                        deleted: false,
                        domain: "deck-options",
                        entityType: "deck-options",
                        pathHint: this.syroLayout?.deckOptionsPath,
                    },
                ]);
            }
        }

        await this.sharedSettingsStore.save(sharedSettingsState);
        await this.trackingRulesStore.save(trackingRulesState);
        await this.dailyStateStore.save(dailyState);
        await this.deviceStateStore.save(deviceState);
        await this.licenseStateStore.save(licenseState);
        await this.deckOptionsStore.saveSerialized(deckOptionsSnapshot.serialized);
        this.persistedSharedSettingsState = sharedSettingsState;
        this.persistedTrackingRulesState = trackingRulesState;
        this.persistedDailyState = dailyState;
        this.persistedDeviceState = deviceState;
        this.persistedLicenseState = licenseState;
        this.trackingRulesTombstones = { ...trackingRulesState.tombstones };
        await this.saveDataShell();
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

        if (!this.hasPerformedInitialGC) {
            setTimeout(() => {
                if (this.data.settings.showSchedulingDebugMessages) {
                    console.debug(
                        "[SR-Init] First review queue activation; triggering background global garbage collection (GC)...",
                    );
                }
                this.runAsync(
                    this.store.performGlobalGarbageCollection().then(() => {
                        this.hasPerformedInitialGC = true;
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

    private getStatusBarReviewableCardCount(): number {
        if (!this.remainingDeckTree?.subdecks?.length) {
            return 0;
        }

        const learnAheadMillis = Math.max(0, this.data.settings.learnAheadMinutes ?? 0) * 60 * 1000;
        let totalReviewableCards = 0;

        for (const deck of this.remainingDeckTree.subdecks) {
            const simulatedDeck = DeckTreeFilter.filterByDailyLimits(deck, this);
            totalReviewableCards +=
                simulatedDeck.getDistinctCardCount(CardListType.NewCard, true) +
                simulatedDeck.getDistinctCardCount(CardListType.DueCard, true) +
                simulatedDeck.getAvailableLearningCardCount(true, learnAheadMillis);
        }

        return totalReviewableCards;
    }

    updateStatusBar() {
        this.updateStatusBarVisibility();
        if (this.data.settings.showStatusBar === false) return;
        if (!this.statusBarNote || !this.statusBarFlashcard) return;
        const dueNotesCount = this.noteStats?.onDueCount ?? 0;
        const dueFlashcardsCount = this.getStatusBarReviewableCardCount();

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

    public async openFlashcardsInNoteReview(
        reviewMode: FlashcardReviewMode,
        file: TFile,
    ): Promise<void> {
        this.logRuntimeDebug("[SR-InNoteReview] openFlashcardsInNoteReview:start", {
            mode: FlashcardReviewMode[reviewMode],
            filePath: file.path,
        });
        await this.requestSync({
            reviewMode,
            trigger: "review-entry",
        });

        const targetDeckTopicPath = TopicPath.getFolderPathFromFilename(
            this.createSrTFile(file),
            this.data.settings,
        );
        const targetDeckPath = targetDeckTopicPath.path.join("/");
        if (!targetDeckPath) {
            new Notice(t("REVIEW_NO_CARDS"));
            return;
        }

        this.logRuntimeDebug("[SR-InNoteReview] openFlashcardsInNoteReview:resolved", {
            mode: FlashcardReviewMode[reviewMode],
            filePath: file.path,
            targetDeckPath,
        });

        await this.tabViewManager.openSRTabView(reviewMode, {
            targetDeckPath,
        });
    }

    private assertPreparedSingleNoteReviewCardsBound(deckTree: Deck, notePath: string): void {
        const cards = deckTree.getFlattenedCardArray(CardListType.All, true);
        for (const card of cards) {
            if (typeof card.Id !== "number" || card.Id < 0) {
                const error = new Error(
                    `Single-note review card is missing a tracked review id: ${notePath}`,
                );
                console.error("[SR] Failed to prepare note-local review card binding", error, card);
                new Notice(t("NOTICE_PREPARE_NOTE_LOCAL_REVIEW_CARDS_FAILED"));
                throw error;
            }

            if (!this.store.getItembyID(card.Id)) {
                const error = new Error(
                    `Single-note review card is missing a store item binding: ${notePath}#${card.Id}`,
                );
                console.error(
                    "[SR] Failed to prepare note-local review store binding",
                    error,
                    card,
                );
                new Notice(t("NOTICE_PREPARE_NOTE_LOCAL_REVIEW_CARDS_FAILED"));
                throw error;
            }
        }
    }

    public async getPreparedDecksForSingleNoteReview(
        file: TFile,
        mode: FlashcardReviewMode,
    ): Promise<{
        deckTree: Deck;
        remainingDeckTree: Deck;
        mode: FlashcardReviewMode;
        globalRemainingDeckTree: Deck;
        sessionCounterDeckPath: string;
    }> {
        const note: Note = await this.loadNote(file);

        const deckTree = new Deck("root", null);
        note.appendCardsToDeck(deckTree);
        this.assertPreparedSingleNoteReviewCardsBound(deckTree, file.path);
        const remainingDeckTree = DeckTreeFilter.filterForRemainingCards(
            this.questionPostponementList,
            deckTree,
            mode,
        );

        return {
            deckTree,
            remainingDeckTree,
            mode,
            globalRemainingDeckTree: this.remainingDeckTree,
            sessionCounterDeckPath: "root",
        };
    }

    public getPreparedReviewSequencer(
        fullDeckTree: Deck,
        remainingDeckTree: Deck,
        reviewMode: FlashcardReviewMode,
        globalRemainingDeckTree?: Deck,
        sessionCounterDeckPath?: string | null,
    ): { reviewSequencer: IFlashcardReviewSequencer; mode: FlashcardReviewMode } {
        const deckIterator: IDeckTreeIterator = SRPlugin.createDeckTreeIterator(
            this.data.settings,
            remainingDeckTree,
        );

        const reviewSequencer: IFlashcardReviewSequencer = new FlashcardReviewSequencer(
            reviewMode,
            deckIterator,
            this.data.settings,
            this.questionPostponementList,
        );

        reviewSequencer.setDeckTree(
            fullDeckTree,
            remainingDeckTree,
            globalRemainingDeckTree,
            sessionCounterDeckPath,
        );
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

    public syncLearningQueueToDecks(): void {
        if (!this.learningQueue || this.learningQueue.length === 0) return;
        if (!this.remainingDeckTree) return;

        for (const item of this.learningQueue) {
            const card = item.card;
            if (!card) continue;

            const topicPath = card.question?.topicPathList?.list[0];
            if (!topicPath) continue;

            const deck = this.remainingDeckTree.getDeck(topicPath);
            if (!deck) continue;

            if (!deck.learningFlashcards.includes(card)) {
                deck.learningFlashcards.push(card);
            }
        }
    }

    private collectLearningCardsFromStore(deckTree: Deck): void {
        this.learningQueue = [];
        let movedCount = 0;

        const traverse = (deck: Deck) => {
            const deckPath = deck.getTopicPath()?.path?.join("/") || deck.deckName;

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

            for (const card of deck.learningFlashcards) {
                this.learningQueue.push({
                    card,
                    dueTime: card.repetitionItem?.nextReview ?? 0,
                    deckName: deckPath,
                });
            }

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

        this.learningQueue.sort((a, b) => a.dueTime - b.dueTime);
    }
}
