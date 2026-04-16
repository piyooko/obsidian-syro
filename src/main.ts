import {
    App,
    DataAdapter,
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
    parseTrackedCardsStoreSnapshots,
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
    parseNoteReviewStoreSnapshots,
    type NoteReviewEntrySnapshot,
} from "./dataStore/noteReviewStore";
import { replaySyroSessionRecords } from "./dataStore/syroSessionReplay";
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
    extractDailyStateWithMetadata,
    extractDeviceState,
    extractLicenseState,
    extractSharedSettings,
    extractSharedSettingsWithMetadata,
    extractTrackingRules,
    hasSyro012MigrationMarker,
    normalizeDeviceReviewCount,
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
    createPendingOverlayCommitId,
    createPendingDailyStateSection,
    PendingOverlayStore,
    type PendingDailyStateSection,
} from "./dataStore/pendingOverlayStore";
import {
    compareIsoTime,
    SYRO_SYNC_RETENTION_WINDOW_MS,
    pruneTimestampMap,
} from "./dataStore/syroSyncMeta";
import {
    SyroPersistenceLayout,
    SyroWorkspace,
    type SyroInvalidDeviceEntry,
    type SyroValidDeviceEntry,
    type SyroWorkspaceInitializeResult,
} from "./dataStore/syroWorkspace";
import {
    SyroSessionManager,
    type SyroDeviceSessionSummary,
    type SyroSessionImportResult,
    type SyroSessionSealReason,
} from "./dataStore/syroSessionManager";
import {
    createEmptySyroSessionReplaySummary,
    hasSyroSessionReplayChanges,
} from "./dataStore/syroSessionImpact";
import {
    type SyroUuidAliasGroup,
} from "./dataStore/syroUuidAlias";
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
import { Queue } from "./dataStore/queue";
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
import ConfirmModal from "src/ui/modals/confirm";
import {
    SyroDeviceSelectionModal,
    type SyroDeviceSelectionModalContext,
} from "src/ui/modals/SyroDeviceSelectionModal";
import { SyroDeleteInvalidDeviceModal } from "src/ui/modals/SyroDeleteInvalidDeviceModal";
import { SyroDeleteValidDeviceModal } from "src/ui/modals/SyroDeleteValidDeviceModal";
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
import { ReviewStateCommitCoordinator } from "src/services/reviewStateCommitCoordinator";
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
import {
    type SyroDeviceCardState,
    type SyroDeviceCardStatus,
    type SyroDeviceManagementViewState,
    type SyroInvalidDeviceCardState,
} from "src/ui/types/syroDeviceManagement";
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

function normalizeSyroPath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/g, "");
}

function bumpCurrentDeviceReviewCount(target: object): void {
    const state = target as { currentDeviceReviewCount?: unknown };
    state.currentDeviceReviewCount = normalizeDeviceReviewCount(state.currentDeviceReviewCount) + 1;
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

export const PLUGIN_DATA_PERSIST_DOMAINS = [
    "shared-settings",
    "tracking-rules",
    "daily-state",
    "device-state",
    "license-state",
    "deck-options",
] as const;

export type PluginDataPersistDomain = (typeof PLUGIN_DATA_PERSIST_DOMAINS)[number];

interface PluginDataPersistRequest {
    delayMs?: number;
    domains?: PluginDataPersistDomain[];
}

interface PluginDataPersistOptions {
    domains?: PluginDataPersistDomain[];
}

const BUFFERED_IMPORT_PROTECTED_DOMAINS = [
    "shared-settings",
    "tracking-rules",
    "daily-state",
] as const;

type BufferedImportProtectedDomain = (typeof BUFFERED_IMPORT_PROTECTED_DOMAINS)[number];

type BufferedStateRevisionMap = Record<BufferedImportProtectedDomain, number>;

interface BufferedImportBaselineSnapshot {
    revisions: BufferedStateRevisionMap;
    sharedSettingsState: PersistedSharedSettingsState;
    trackingRulesState: PersistedTrackingRulesState;
    dailyState: PersistedDailyState;
}

const AUTO_SYNC_COOLDOWN_MS = 15_000;
const REMOTE_DELTA_POLL_INTERVAL_MS = 7_000;

const STYLE_SETTINGS_BRIDGE_RETRY_DELAYS_MS = [0, 400, 1400, 3200] as const;

type SyroDataReadyAction =
    | "note-review"
    | "flashcard-review"
    | "sync"
    | "review-queue"
    | "item-info";

function createBufferedStateRevisionMap(): BufferedStateRevisionMap {
    return {
        "shared-settings": 0,
        "tracking-rules": 0,
        "daily-state": 0,
    };
}

function isBufferedImportProtectedDomain(
    domain: PluginDataPersistDomain,
): domain is BufferedImportProtectedDomain {
    return BUFFERED_IMPORT_PROTECTED_DOMAINS.includes(
        domain as BufferedImportProtectedDomain,
    );
}

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
    public noteReviewStore: NoteReviewStore | null = null;
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
    private remoteDeltaSyncLock = false;
    private remoteDeltaSyncPending = false;
    private remoteDeltaFingerprint = "";
    private pendingFirstRunTutorialInitialization = false;
    private dataBackedRuntimeInitialized = false;
    private reviewQueueViewRegistered = false;

    // Derived from earlier pre-Syro command handling.
    public store: DataStore | null = null;
    public commands: Commands;
    public reviewFloatBar: reviewResponseModal;
    public settingTab: SRSettingTab;
    public reviewCommitStore: ReviewCommitStore | null = null;
    public reviewPersistenceCoordinator: ReviewPersistenceCoordinator | null = null;
    public reviewStateCommitCoordinator: ReviewStateCommitCoordinator | null = null;

    public syncEvents: SyncEvents = new SyncEvents();
    private timelineReviewCardPath: string | null = null;

    public clock_start: number;

    public learningQueue: Array<{ card: Card; dueTime: number; deckName: string }> = [];

    private hasPerformedInitialGC = false;
    private pendingPluginDataSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingCardsStoreSaveTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingPluginDataSaveRequested = false;
    private pendingCardsStoreSaveRequested = false;
    private pendingPluginDataSaveDomains = new Set<PluginDataPersistDomain>();
    private pendingPluginDataSavePromise: Promise<boolean> | null = null;
    private pendingCardsStoreSavePromise: Promise<boolean> | null = null;
    private pluginDataSaveFailureNotified = false;
    private cardsStoreSaveFailureNotified = false;
    private bufferedStateDirtyRevisions: BufferedStateRevisionMap = createBufferedStateRevisionMap();
    private bufferedStatePersistedRevisions: BufferedStateRevisionMap =
        createBufferedStateRevisionMap();
    private syroReadOnlyReason: string | null = null;
    private syroWorkspace: SyroWorkspace | null = null;
    private syroLayout: SyroPersistenceLayout | null = null;
    private pendingOverlayStore: PendingOverlayStore | null = null;
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
    private sharedSettingsUpdatedAtByField: Record<string, string> = {};
    private trackingRulesUpdatedAtByFolderPath: Record<string, string> = {};
    private trackingRulesTombstones: Record<string, PersistedTrackingRulesTombstone> = {};
    private dailyStateAppliedOpIds: Record<string, string> = {};
    private currentDeviceReviewCount = 0;
    private pendingDailyStateOverlayFormalization = false;
    private pendingDailyStateCommitId: string | null = null;
    private dataShell: LegacyPluginData | null = null;
    private syroSessionManager: SyroSessionManager | null = null;
    private pendingSyroRecoveryContext: SyroRecoveryModalContext | null = null;
    private pendingSyroDeviceSelectionContext: SyroDeviceSelectionModalContext | null = null;
    private pendingSyroRecoveryFlow: Promise<SyroPersistenceLayout | null> | null = null;

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

    private clearPendingCardsStoreSaveTimer(): void {
        if (this.pendingCardsStoreSaveTimer !== null) {
            clearTimeout(this.pendingCardsStoreSaveTimer);
            this.pendingCardsStoreSaveTimer = null;
        }
    }

    private buildDailyStateSnapshot(): PersistedDailyState {
        return extractDailyState({
            buryDate: this.data.buryDate,
            buryList: this.data.buryList,
            dailyDeckStats: this.data.dailyDeckStats,
            deviceReviewCount: this.currentDeviceReviewCount,
        });
    }

    private buildDailyStateSnapshotWithMetadata(
        appliedOpIds: Record<string, string> = this.dailyStateAppliedOpIds,
    ): PersistedDailyState {
        return extractDailyStateWithMetadata(
            {
                buryDate: this.data.buryDate,
                buryList: this.data.buryList,
                dailyDeckStats: this.data.dailyDeckStats,
                deviceReviewCount: this.currentDeviceReviewCount,
            },
            appliedOpIds,
        );
    }

    private buildPendingDailyStateSection(commitId?: string): PendingDailyStateSection {
        return createPendingDailyStateSection({
            commitId: commitId ?? this.pendingDailyStateCommitId ?? undefined,
            buryDate: this.data.buryDate,
            buryList: this.data.buryList,
            dailyDeckStats: this.data.dailyDeckStats,
            deviceReviewCount: this.currentDeviceReviewCount,
        });
    }

    private buildDailyStateSnapshotFromPendingSection(
        section: PendingDailyStateSection,
        appliedOpIds: Record<string, string> = this.dailyStateAppliedOpIds,
    ): PersistedDailyState {
        return extractDailyStateWithMetadata(
            {
                buryDate: section.buryDate,
                buryList: section.buryList,
                dailyDeckStats: section.dailyDeckStats,
                deviceReviewCount: normalizeDeviceReviewCount(section.deviceReviewCount),
            },
            appliedOpIds,
        );
    }

    private stagePendingDailyStateSection(options: {
        requestFlush?: boolean;
        preserveCommitId?: boolean;
    } = {}): void {
        if (!this.pendingOverlayStore) {
            return;
        }

        const nextCommitId =
            options.preserveCommitId && this.pendingDailyStateCommitId
                ? this.pendingDailyStateCommitId
                : createPendingOverlayCommitId("daily-state");
        this.pendingDailyStateCommitId = nextCommitId;
        this.pendingOverlayStore.stageDailyStateSection(
            this.buildPendingDailyStateSection(nextCommitId),
        );
        if (options.requestFlush ?? true) {
            this.pendingOverlayStore.requestFlush();
        }
    }

    private async applyPendingDailyStateSection(reason: string): Promise<boolean> {
        if (!this.pendingOverlayStore) {
            return false;
        }

        const section = await this.pendingOverlayStore.getDailyStateSection();
        if (!section) {
            return false;
        }

        const nextDailyDeckStats: DailyDeckStats = {
            date: section.dailyDeckStats.date,
            counts: Object.fromEntries(
                Object.entries(section.dailyDeckStats.counts).map(([deckPath, count]) => [
                    deckPath,
                    {
                        new: count.new,
                        review: count.review,
                    },
                ]),
            ),
        };
        this.data.buryDate = section.buryDate;
        this.data.buryList = [...section.buryList];
        this.data.dailyDeckStats = nextDailyDeckStats;
        this.currentDeviceReviewCount = normalizeDeviceReviewCount(section.deviceReviewCount);
        this.pendingDailyStateCommitId = section.commitId;
        this.pendingDailyStateOverlayFormalization = true;
        this.markBufferedPluginStateDirty(["daily-state"]);
        this.logRuntimeDebug("[SR-PendingOverlay] section-applied", {
            section: "dailyState",
            reason,
            path: this.syroLayout?.pendingOverlayPath,
        });
        return true;
    }

    private normalizeRequestedPluginDataDomains(
        domains?: readonly PluginDataPersistDomain[] | null,
    ): PluginDataPersistDomain[] {
        if (!domains || domains.length === 0) {
            return [...PLUGIN_DATA_PERSIST_DOMAINS];
        }

        return Array.from(new Set(domains));
    }

    private ensureBufferedStateRevisionTracking(): void {
        if (!this.bufferedStateDirtyRevisions) {
            this.bufferedStateDirtyRevisions = createBufferedStateRevisionMap();
        }
        if (!this.bufferedStatePersistedRevisions) {
            this.bufferedStatePersistedRevisions = createBufferedStateRevisionMap();
        }
    }

    private normalizeBufferedImportProtectedDomains(
        domains?: readonly PluginDataPersistDomain[] | null,
    ): BufferedImportProtectedDomain[] {
        return this.normalizeRequestedPluginDataDomains(domains).filter(
            isBufferedImportProtectedDomain,
        );
    }

    private getBufferedStateDirtyRevisionSnapshot(): BufferedStateRevisionMap {
        this.ensureBufferedStateRevisionTracking();
        return {
            ...this.bufferedStateDirtyRevisions,
        };
    }

    private getPendingBufferedPluginStateDomains(): BufferedImportProtectedDomain[] {
        this.ensureBufferedStateRevisionTracking();
        return BUFFERED_IMPORT_PROTECTED_DOMAINS.filter(
            (domain) =>
                this.bufferedStateDirtyRevisions[domain] !==
                this.bufferedStatePersistedRevisions[domain],
        );
    }

    private markBufferedPluginStateDirty(
        domains?: readonly PluginDataPersistDomain[] | null,
    ): BufferedImportProtectedDomain[] {
        this.ensureBufferedStateRevisionTracking();
        const touched = this.normalizeBufferedImportProtectedDomains(domains);
        for (const domain of touched) {
            this.bufferedStateDirtyRevisions[domain] += 1;
        }
        return touched;
    }

    private ensureBufferedPluginStateMarkedDirtyForSave(
        domains?: readonly PluginDataPersistDomain[] | null,
    ): void {
        this.ensureBufferedStateRevisionTracking();
        for (const domain of this.normalizeBufferedImportProtectedDomains(domains)) {
            if (
                this.bufferedStateDirtyRevisions[domain] !==
                this.bufferedStatePersistedRevisions[domain]
            ) {
                continue;
            }
            this.bufferedStateDirtyRevisions[domain] += 1;
        }
    }

    private markBufferedPluginStatePersisted(
        domains: readonly BufferedImportProtectedDomain[],
        revisions: BufferedStateRevisionMap,
    ): void {
        this.ensureBufferedStateRevisionTracking();
        for (const domain of domains) {
            this.bufferedStatePersistedRevisions[domain] = revisions[domain];
        }
    }

    private resetBufferedStateRevisionTracking(): void {
        this.bufferedStateDirtyRevisions = createBufferedStateRevisionMap();
        this.bufferedStatePersistedRevisions = createBufferedStateRevisionMap();
    }

    private captureBufferedImportBaselineSnapshot(): BufferedImportBaselineSnapshot {
        return {
            revisions: this.getBufferedStateDirtyRevisionSnapshot(),
            sharedSettingsState: extractSharedSettingsWithMetadata(
                this.data.settings,
                this.sharedSettingsUpdatedAtByField,
            ),
            trackingRulesState: extractTrackingRules(
                this.data.folderTrackingRules,
                this.trackingRulesUpdatedAtByFolderPath,
                this.trackingRulesTombstones,
            ),
            dailyState: this.buildDailyStateSnapshotWithMetadata(),
        };
    }

    private applyBufferedImportBaselineSnapshot(
        snapshot: BufferedImportBaselineSnapshot,
        domains: readonly BufferedImportProtectedDomain[],
    ): void {
        const revisionSnapshot = snapshot.revisions;
        if (domains.includes("shared-settings")) {
            this.persistedSharedSettingsState = snapshot.sharedSettingsState;
            this.markBufferedPluginStatePersisted(["shared-settings"], revisionSnapshot);
        }
        if (domains.includes("tracking-rules")) {
            this.persistedTrackingRulesState = snapshot.trackingRulesState;
            this.markBufferedPluginStatePersisted(["tracking-rules"], revisionSnapshot);
        }
        if (domains.includes("daily-state")) {
            this.persistedDailyState = snapshot.dailyState;
            this.markBufferedPluginStatePersisted(["daily-state"], revisionSnapshot);
        }
    }

    private async prepareBufferedPluginStateForRemoteImport(reason: string): Promise<boolean> {
        const hasPendingCardsReview =
            this.store?.hasPendingReviewOverlayEntries() ||
            this.reviewStateCommitCoordinator?.hasPendingWork() ||
            this.pendingCardsStoreSaveRequested ||
            this.pendingCardsStoreSavePromise != null;
        if (hasPendingCardsReview) {
            this.logRuntimeDebug("[SR-BufferedState] cards-review-flush-before-import:start", {
                reason,
            });
            const flushedCards = await this.flushReviewPersistence(1200, { notify: false });
            if (
                !flushedCards ||
                this.store?.hasPendingReviewOverlayEntries() ||
                this.reviewStateCommitCoordinator?.hasPendingWork() ||
                this.pendingCardsStoreSaveRequested ||
                this.pendingCardsStoreSavePromise != null
            ) {
                this.logRuntimeDebug("[SR-BufferedState] cards-review-flush-before-import:failed", {
                    reason,
                });
                return false;
            }
            this.logRuntimeDebug("[SR-BufferedState] cards-review-flush-before-import:success", {
                reason,
            });
        }

        const pendingDomains = this.getPendingBufferedPluginStateDomains();
        if (pendingDomains.length === 0) {
            return true;
        }

        this.logRuntimeDebug("[SR-BufferedState] buffered-state-flush-before-import:start", {
            reason,
            domains: pendingDomains,
        });

        const flushed = await this.flushPendingPluginDataSave(1200);
        const remainingDomains = this.getPendingBufferedPluginStateDomains();
        if (!flushed) {
            this.logRuntimeDebug("[SR-BufferedState] buffered-state-flush-before-import:timeout", {
                reason,
                remainingDomains,
            });
            return false;
        }

        if (remainingDomains.length > 0) {
            this.logRuntimeDebug("[SR-BufferedState] buffered-state-flush-before-import:failed", {
                reason,
                remainingDomains,
            });
            return false;
        }

        this.logRuntimeDebug("[SR-BufferedState] buffered-state-flush-before-import:success", {
            reason,
            domains: pendingDomains,
        });
        return true;
    }

    private schedulePendingPluginDataSave(delayMs = 350): void {
        this.clearPendingPluginDataSaveTimer();
        this.pendingPluginDataSaveTimer = setTimeout(() => {
            this.pendingPluginDataSaveTimer = null;
            this.runAsync(this.flushPendingPluginDataSave(), "flush queued plugin data");
        }, delayMs);
    }

    public requestCardsStoreSave(delayMs = 1200): void {
        if (!this.store || this.syroReadOnlyReason) {
            return;
        }
        this.pendingCardsStoreSaveRequested = true;
        this.clearPendingCardsStoreSaveTimer();
        this.pendingCardsStoreSaveTimer = setTimeout(() => {
            this.pendingCardsStoreSaveTimer = null;
            this.runAsync(this.flushPendingCardsStoreSave(), "flush queued cards store");
        }, delayMs);
    }

    public async flushPendingCardsStoreSave(timeoutMs = 1500): Promise<boolean> {
        this.clearPendingCardsStoreSaveTimer();
        if (!this.pendingCardsStoreSaveRequested && this.pendingCardsStoreSavePromise === null) {
            return true;
        }

        if (this.pendingCardsStoreSavePromise === null) {
            this.pendingCardsStoreSavePromise = (async () => {
                this.pendingCardsStoreSaveRequested = false;
                try {
                    const saved = (await this.store?.save()) ?? false;
                    if (!saved) {
                        throw new Error("cards-save-skipped");
                    }
                    this.cardsStoreSaveFailureNotified = false;
                    return true;
                } catch (error) {
                    console.error("[SR] flush queued cards store failed", error);
                    this.pendingCardsStoreSaveRequested = true;
                    if (!this.cardsStoreSaveFailureNotified) {
                        this.cardsStoreSaveFailureNotified = true;
                        new Notice(t("DATA_UNABLE_TO_SAVE"));
                    }
                    this.requestCardsStoreSave(1000);
                    return false;
                } finally {
                    this.pendingCardsStoreSavePromise = null;
                    if (
                        this.pendingCardsStoreSaveRequested &&
                        this.pendingCardsStoreSaveTimer === null
                    ) {
                        this.requestCardsStoreSave(0);
                    }
                }
            })();
        }

        const result = await Promise.race([
            this.pendingCardsStoreSavePromise,
            new Promise<boolean>((resolve) => {
                setTimeout(() => resolve(false), timeoutMs);
            }),
        ]);

        return result && !this.pendingCardsStoreSaveRequested;
    }

    private enqueuePendingPluginDataSaveDomains(
        domains?: readonly PluginDataPersistDomain[] | null,
    ): void {
        for (const domain of this.normalizeRequestedPluginDataDomains(domains)) {
            this.pendingPluginDataSaveDomains.add(domain);
        }
    }

    private consumePendingPluginDataSaveDomains(): PluginDataPersistDomain[] {
        const domains = Array.from(this.pendingPluginDataSaveDomains);
        this.pendingPluginDataSaveDomains.clear();
        return domains.length > 0 ? domains : [...PLUGIN_DATA_PERSIST_DOMAINS];
    }

    public requestPluginDataSave(
        request: number | PluginDataPersistRequest = 350,
        options: { markDirty?: boolean } = {},
    ): void {
        const delayMs = typeof request === "number" ? request : (request.delayMs ?? 350);
        const domains = this.normalizeRequestedPluginDataDomains(
            typeof request === "number" ? undefined : request.domains,
        );
        if (options.markDirty ?? true) {
            this.markBufferedPluginStateDirty(domains);
        }
        if (domains.includes("daily-state")) {
            this.stagePendingDailyStateSection({
                preserveCommitId: options.markDirty === false,
            });
        }
        this.pendingPluginDataSaveRequested = true;
        this.enqueuePendingPluginDataSaveDomains(domains);
        this.schedulePendingPluginDataSave(delayMs);
    }

    public async flushPendingPluginDataSave(timeoutMs = 1500): Promise<boolean> {
        this.clearPendingPluginDataSaveTimer();
        if (!this.pendingPluginDataSaveRequested && this.pendingPluginDataSavePromise === null) {
            return true;
        }

        if (this.pendingPluginDataSavePromise === null) {
            const pendingDomains = this.consumePendingPluginDataSaveDomains();
            this.pendingPluginDataSavePromise = (async () => {
                this.pendingPluginDataSaveRequested = false;
                try {
                    await this.savePluginData({ domains: pendingDomains });
                    this.pluginDataSaveFailureNotified = false;
                    return true;
                } catch (error) {
                    console.error("[SR] flush queued plugin data failed", error);
                    this.pendingPluginDataSaveRequested = true;
                    this.enqueuePendingPluginDataSaveDomains(pendingDomains);
                    if (!this.pluginDataSaveFailureNotified) {
                        this.pluginDataSaveFailureNotified = true;
                        new Notice(t("DATA_UNABLE_TO_SAVE"));
                    }
                    this.schedulePendingPluginDataSave(1000);
                    return false;
                } finally {
                    this.pendingPluginDataSavePromise = null;
                    if (
                        this.pendingPluginDataSaveRequested &&
                        this.pendingPluginDataSaveTimer === null
                    ) {
                        this.schedulePendingPluginDataSave(0);
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

    public async flushReviewPersistence(
        timeoutMs = 1500,
        options: { notify?: boolean } = {},
    ): Promise<boolean> {
        const results = await Promise.race([
            (async () => {
                const values = [
                    this.store && typeof this.store.drainReviewOverlayFlush === "function"
                        ? await this.store.drainReviewOverlayFlush(timeoutMs)
                        : true,
                    await this.flushPendingPluginDataSave(timeoutMs),
                    this.reviewPersistenceCoordinator &&
                    typeof this.reviewPersistenceCoordinator.drain === "function"
                        ? await this.reviewPersistenceCoordinator.drain(timeoutMs)
                        : true,
                    this.reviewStateCommitCoordinator &&
                    typeof this.reviewStateCommitCoordinator.drain === "function"
                        ? await this.reviewStateCommitCoordinator.drain(timeoutMs)
                        : await this.flushPendingCardsStoreSave(timeoutMs),
                ];
                return values.every(Boolean);
            })(),
            new Promise<boolean>((resolve) => {
                setTimeout(() => resolve(false), timeoutMs);
            }),
        ]);

        if (!results && (options.notify ?? true)) {
            new Notice(t("DATA_REVIEW_SAVE_PENDING"));
        }

        return results;
    }

    private restorePendingCardReviewCommits(): void {
        if (!this.store || !this.reviewStateCommitCoordinator) {
            return;
        }

        const pendingEntries = this.store.getPendingReviewOverlayEntries();
        let needsCardsSave = false;
        for (const entry of pendingEntries) {
            if (entry.sessionCommitted === true) {
                needsCardsSave = true;
                continue;
            }
            this.reviewStateCommitCoordinator.restorePendingEntry(entry);
        }
        if (needsCardsSave) {
            this.requestCardsStoreSave(0);
        }
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

    private getSyroDataNotReadyReason(): string | null {
        if (this.pendingSyroRecoveryContext || this.pendingSyroDeviceSelectionContext) {
            return t("NOTICE_SYRO_DATA_NOT_READY");
        }

        if (
            !this.syroLayout ||
            !this.store ||
            !this.noteReviewStore ||
            !this.reviewCommitStore ||
            !this.reviewPersistenceCoordinator ||
            !this.reviewStateCommitCoordinator
        ) {
            return t("NOTICE_SYRO_DATA_NOT_READY");
        }

        return null;
    }

    public isSyroDataReady(): boolean {
        return this.getSyroDataNotReadyReason() === null;
    }

    public guardSyroDataReady(
        action: SyroDataReadyAction,
        options: {
            notify?: boolean;
            requireWritable?: boolean;
            logDebug?: boolean;
        } = {},
    ): boolean {
        const notify = options.notify ?? true;
        const requireWritable = options.requireWritable ?? action !== "item-info";
        const logDebug = options.logDebug ?? true;
        const notReadyReason = this.getSyroDataNotReadyReason();

        if (notReadyReason) {
            if (logDebug) {
                this.logRuntimeDebug(`[SR-StartupGate] blocked ${action}: ${notReadyReason}`);
            }
            if (notify) {
                new Notice(notReadyReason);
            }
            return false;
        }

        if (requireWritable && this.syroReadOnlyReason) {
            if (logDebug) {
                this.logRuntimeDebug(
                    `[SR-StartupGate] blocked ${action}: read-only protection active.`,
                    this.syroReadOnlyReason,
                );
            }
            if (notify) {
                new Notice(t("NOTICE_SYRO_READ_ONLY"));
            }
            return false;
        }

        return true;
    }

    private resetSyroDataBackedRuntimeState(): void {
        this.dataBackedRuntimeInitialized = false;
        this.hasPerformedInitialGC = false;
        this.store = null;
        this.noteReviewStore = null;
        this.reviewCommitStore = null;
        this.reviewPersistenceCoordinator = null;
        this.reviewStateCommitCoordinator = null;
        this.syroSessionManager = null;
        this.pendingCardsStoreSaveRequested = false;
        this.pendingCardsStoreSavePromise = null;
        this.cardsStoreSaveFailureNotified = false;
        this.clearPendingCardsStoreSaveTimer();
        this.pendingDailyStateCommitId = null;
        this.syroLayout = null;
        this.syroWorkspace = null;
        this.pendingOverlayStore = null;
        this.deckOptionsStore = null;
        this.sharedSettingsStore = null;
        this.trackingRulesStore = null;
        this.dailyStateStore = null;
        this.deviceStateStore = null;
        this.licenseStateStore = null;
        this.persistedSharedSettingsState = null;
        this.persistedTrackingRulesState = null;
        this.persistedDailyState = null;
        this.persistedDeviceState = null;
        this.persistedLicenseState = null;
        this.sharedSettingsUpdatedAtByField = {};
        this.trackingRulesUpdatedAtByFolderPath = {};
        this.trackingRulesTombstones = {};
        this.dailyStateAppliedOpIds = {};
        this.currentDeviceReviewCount = 0;
        this.pendingDailyStateOverlayFormalization = false;
        this.resetBufferedStateRevisionTracking();
        this.remoteDeltaFingerprint = "";
        this.pendingSyncRequest = null;
        this.lastSyncReviewMode = null;
        this.reviewDecks = {};
        this.lastSelectedReviewDeck = "";
        this.deckTree = new Deck("root", null);
        this.remainingDeckTree = new Deck("root", null);
        this.noteCache.clear();
        this.noteCacheSignature = "";
        this.cardStats = new Stats();
        this.noteStats = new Stats();
        this.dueNotesCount = 0;
        this.dueDatesNotes = {};
        DataStore.clearInstance();
        Queue.clearInstance();
    }

    private initializeSyroDataBackedRuntimeIfReady(
        context: "startup" | "layout-ready" | "device-change",
    ): Promise<boolean> {
        if (!this.guardSyroDataReady("note-review", { notify: false })) {
            this.logRuntimeDebug(
                `[SR-DataReady] skipped data-backed runtime initialization: context=${context}`,
            );
            return Promise.resolve(false);
        }

        if (this.dataBackedRuntimeInitialized) {
            return Promise.resolve(true);
        }

        IReviewNote.create(this.data.settings);
        if (this.noteReviewStore) {
            this.reviewDecks = this.noteReviewStore.buildReviewDecks(this.app.vault);
            this.updateAndSortDueNotes();
        }
        this.dataBackedRuntimeInitialized = true;
        this.logRuntimeDebug(
            `[SR-DataReady] data-backed runtime initialized: context=${context}`,
        );
        return Promise.resolve(true);
    }

    private ensureReviewQueueViewRegistered(): void {
        if (this.reviewQueueViewRegistered) {
            return;
        }

        this.app.workspace.detachLeavesOfType(REVIEW_QUEUE_VIEW_TYPE);
        this.registerView(REVIEW_QUEUE_VIEW_TYPE, (leaf) => new ReactNoteReviewView(leaf, this));
        this.reviewQueueViewRegistered = true;
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

        this.pendingFirstRunTutorialInitialization = obsidianJustInstalled;
        await this.initializeSyroDataBackedRuntimeIfReady("startup");
        await this.maybeInitializeFirstRunTutorialNote("startup");

        this.runAsync(this.savePluginData(), "save plugin data");

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
                    this.queueRemoteDeltaSyncCheck("interval");
                },
                REMOTE_DELTA_POLL_INTERVAL_MS,
            ),
        );
        if (typeof document !== "undefined") {
            this.registerDomEvent(document, "visibilitychange", () => {
                if (document.visibilityState === "hidden") {
                    this.queueBackgroundSyroSessionSeal("hidden");
                } else if (document.visibilityState === "visible") {
                    this.queueRemoteDeltaSyncCheck("visible");
                }
            });
        }
        if (typeof window !== "undefined") {
            this.registerDomEvent(window, "focus", () => {
                this.queueRemoteDeltaSyncCheck("focus");
            });
            this.registerDomEvent(window, "blur", () => {
                this.queueBackgroundSyroSessionSeal("blur");
            });
            this.registerDomEvent(window, "pagehide", () => {
                this.queueBackgroundSyroSessionSeal("pagehide");
            });
        }

        // Initialize Note Status Bar Item
        this.statusBarNote = this.addStatusBarItem();
        this.statusBarNote.classList.add("mod-clickable");
        setTooltip(this.statusBarNote, t("OPEN_NOTE_FOR_REVIEW"), { placement: "top" });
        this.statusBarNote.addEventListener("click", () => {
            if (!this.guardSyroDataReady("note-review")) {
                return;
            }
            this.runAsync(
                this.refreshNoteReview({ trigger: "review-entry" }).then(() => {
                    if (!this.guardSyroDataReady("note-review", { notify: false })) {
                        return;
                    }
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
            if (!this.guardSyroDataReady("flashcard-review")) {
                return;
            }

            this.runAsync(
                this.requestSync({ trigger: "review-entry" }).then((result) => {
                    if (result.status === "skipped" && result.reason === "not-ready") {
                        return;
                    }
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
            if (!this.guardSyroDataReady("flashcard-review")) {
                return;
            }

            this.runAsync(
                this.requestSync({ trigger: "review-entry" }).then((result) => {
                    if (result.status === "skipped" && result.reason === "not-ready") {
                        return;
                    }
                    return this.tabViewManager.openSRTabView(FlashcardReviewMode.Review);
                }),
                "open ribbon flashcard review",
            );
        });

        if (!this.data.settings.disableFileMenuReviewOptions) {
            this.registerEvent(
                this.app.workspace.on("file-menu", (menu, fileish: TAbstractFile) => {
                    const noteReviewStore = this.noteReviewStore;
                    if (
                        this.isSyroDataReady() &&
                        noteReviewStore &&
                        fileish instanceof TFile &&
                        fileish.extension === "md" &&
                        noteReviewStore.isTracked(fileish.path)
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
                            const noteItem = noteReviewStore.getItem(fileish.path);
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
                            const noteItem = noteReviewStore.getItem(fileish.path);
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
                                                    await noteReviewStore.save();
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
            this.runAsync(
                (async () => {
                    await this.initializeSyroDataBackedRuntimeIfReady("layout-ready");
                    if (!this.guardSyroDataReady("sync", { notify: false, logDebug: false })) {
                        return;
                    }
                    await this.initReviewQueueView();
                    await this.refreshNoteReview({ trigger: "startup" });
                    this.queueRemoteDeltaSyncCheck("startup");
                })(),
                "layout-ready data tasks",
            );
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
            this.requestPluginDataSave({ delayMs: 0, domains: ["daily-state"] });
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

        bumpCurrentDeviceReviewCount(this);
        this.requestPluginDataSave({ domains: ["daily-state"] });
    }

    public incrementDeviceReviewCount(): void {
        bumpCurrentDeviceReviewCount(this);
        this.requestPluginDataSave({ domains: ["daily-state"] });
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

        this.requestPluginDataSave({ domains: ["daily-state"] });
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

    private shouldEnableRemoteDeltaPolling(): boolean {
        return (
            !!this.syroLayout &&
            !!this.syroSessionManager &&
            !this.syroReadOnlyReason &&
            this.data?.settings?.autoIncrementalSync !== false &&
            !this.pendingSyroRecoveryContext &&
            !this.pendingSyroDeviceSelectionContext
        );
    }

    private queueRemoteDeltaSyncCheck(reason = "interval"): void {
        if (!this.shouldEnableRemoteDeltaPolling()) {
            return;
        }

        if (this.remoteDeltaSyncLock || this.syncLock || this.noteReviewRefreshLock) {
            this.remoteDeltaSyncPending = true;
            return;
        }

        this.runAsync(this.runRemoteDeltaSync(reason), `syro remote delta ${reason}`);
    }

    private queueBackgroundSyroSessionSeal(source = "background"): void {
        if (this.syroReadOnlyReason || !this.syroSessionManager) {
            return;
        }

        this.runAsync(
            this.syroSessionManager.flushActiveSession("background"),
            `syro session seal ${source}`,
        );
    }

    private replayPendingRemoteDeltaSyncIfNeeded(): void {
        if (!this.remoteDeltaSyncPending) {
            return;
        }

        this.remoteDeltaSyncPending = false;
        this.queueRemoteDeltaSyncCheck("pending");
    }

    private async runRemoteDeltaSync(reason = "interval"): Promise<void> {
        if (this.remoteDeltaSyncLock) {
            this.remoteDeltaSyncPending = true;
            return;
        }

        this.remoteDeltaSyncLock = true;
        try {
            let nextReason = reason;
            do {
                this.remoteDeltaSyncPending = false;
                await this.runRemoteDeltaSyncOnce(nextReason);
                nextReason = "pending";
            } while (
                this.remoteDeltaSyncPending &&
                !this.syncLock &&
                !this.noteReviewRefreshLock &&
                this.shouldEnableRemoteDeltaPolling()
            );
        } finally {
            this.remoteDeltaSyncLock = false;
            this.replayPendingRemoteDeltaSyncIfNeeded();
        }
    }

    private async runRemoteDeltaSyncOnce(reason = "interval"): Promise<void> {
        if (!this.shouldEnableRemoteDeltaPolling()) {
            return;
        }

        if (this.syncLock || this.noteReviewRefreshLock) {
            this.remoteDeltaSyncPending = true;
            return;
        }

        const nextFingerprint = await this.captureRemoteDeltaFingerprint();
        if (!nextFingerprint) {
            this.remoteDeltaFingerprint = "";
            return;
        }

        const pendingScan = (await this.syroSessionManager?.peekPendingSessions()) ?? {
            pendingSessionIds: [],
            impact: null,
        };
        const fingerprintChanged = nextFingerprint !== this.remoteDeltaFingerprint;
        if (!fingerprintChanged && pendingScan.pendingSessionIds.length === 0) {
            return;
        }

        if (fingerprintChanged) {
            this.logRuntimeDebug("[SR-Syro] Remote delta fingerprint changed.", {
                reason,
                previousFingerprint: this.remoteDeltaFingerprint,
                nextFingerprint,
            });
        }

        if (
            pendingScan.pendingSessionIds.length > 0 &&
            pendingScan.impact === "requires-global-sync"
        ) {
            await this.requestSync({ trigger: "remote-poll", force: true });
            await this.updateRemoteDeltaFingerprint();
            return;
        }

        const importResult = await this.importPendingSyroSessions({
            sealOwnOpenSession: false,
            reason: `remote-delta:${reason}`,
        });
        const outcome = await this.applyLightweightSessionDelta(importResult);
        if (outcome === "escalated") {
            await this.updateRemoteDeltaFingerprint();
            return;
        }

        if (
            importResult &&
            this.shouldLogRuntimeDebug() &&
            (importResult.importedSessionIds.length > 0 ||
                importResult.deletedSessionIds.length > 0 ||
                importResult.archivedSessionIds.length > 0)
        ) {
            console.debug("[SR-Syro] Applied remote delta import.", {
                reason,
                pendingScan,
                importResult,
            });
        }

        await this.updateRemoteDeltaFingerprint();
    }

    private async applyLightweightSessionDelta(
        importResult: SyroSessionImportResult | null,
    ): Promise<"noop" | "applied" | "escalated"> {
        const replayImpact =
            importResult?.replayImpact ?? createEmptySyroSessionReplaySummary();
        if (!hasSyroSessionReplayChanges(replayImpact)) {
            return "noop";
        }

        if (replayImpact.requiresGlobalSync) {
            await this.requestSync({ trigger: "remote-poll", force: true });
            return "escalated";
        }

        if (replayImpact.cardsRuntimeChanged) {
            if (!this.rebindDeckTreeRuntimeBindings()) {
                await this.requestSync({ trigger: "remote-poll", force: true });
                return "escalated";
            }

            this.refreshCurrentDeckRuntimeState(
                this.lastSyncReviewMode ?? FlashcardReviewMode.Review,
            );
        }

        if (replayImpact.noteReviewChanged) {
            await this.refreshNoteReview({ trigger: "remote-poll" });
        }

        this.syncEvents.emit("sync-complete");
        return "applied";
    }

    private rebindDeckTreeRuntimeBindings(): boolean {
        if (!this.store || !this.deckTree) {
            return false;
        }

        if (this.deckTree.getCardCount(CardListType.All, true) === 0) {
            return false;
        }

        return this.rebindDeckNodeRuntime(this.deckTree);
    }

    private rebindDeckNodeRuntime(deck: Deck): boolean {
        const cards = Array.from(
            new Set([...deck.newFlashcards, ...deck.dueFlashcards, ...deck.learningFlashcards]),
        );
        deck.newFlashcards = [];
        deck.dueFlashcards = [];
        deck.learningFlashcards = [];

        for (const card of cards) {
            if (typeof card.Id !== "number" || card.Id < 0) {
                return false;
            }

            const item = this.store.getItembyID(card.Id);
            if (!item) {
                return false;
            }

            card.repetitionItem = item;
            card.scheduleInfo = NoteCardScheduleParser.createInfo_algo(item.getSched() ?? null);

            switch (card.cardListType) {
                case CardListType.LearningCard:
                    deck.learningFlashcards.push(card);
                    break;
                case CardListType.DueCard:
                    deck.dueFlashcards.push(card);
                    break;
                default:
                    deck.newFlashcards.push(card);
                    break;
            }
        }

        for (const subdeck of deck.subdecks) {
            if (!this.rebindDeckNodeRuntime(subdeck)) {
                return false;
            }
        }

        deck.sortSubdecksList();
        return true;
    }

    private refreshCurrentDeckRuntimeState(reviewMode: FlashcardReviewMode): void {
        this.deckTree.sortSubdecksList();
        this.collectLearningCardsFromStore(this.deckTree);
        this.remainingDeckTree = DeckTreeFilter.filterForRemainingCards(
            this.questionPostponementList,
            this.deckTree,
            reviewMode,
        );

        const calc: DeckTreeStatsCalculator = new DeckTreeStatsCalculator();
        this.cardStats = calc.calculate(this.deckTree);
        setDueDates(this.cardStats.delayedDays.dict, this.cardStats.delayedDays.dict);

        const statsService = DeckStatsService.getInstance();
        statsService.setSyncEvents(this.syncEvents);
        statsService.clearCache();

        const learnAheadMillis = Math.max(0, this.data.settings.learnAheadMinutes) * 60 * 1000;
        this.recalculateDeckStatsCache(this.deckTree, learnAheadMillis);

        const fbar = this.reviewFloatBar;
        if (fbar) {
            fbar.cardtotalCB = () => {
                return this.remainingDeckTree.getCardCount(CardListType.All, true);
            };
            fbar.notetotalCB = () => {
                return this.noteStats?.getTotalCount?.() ?? 0;
            };
        }

        this.updateStatusBar();
    }

    private recalculateDeckStatsCache(deck: Deck, learnAheadMillis: number): void {
        const statsService = DeckStatsService.getInstance();
        statsService.recalculateDeck(deck, learnAheadMillis);
        for (const subdeck of deck.subdecks) {
            this.recalculateDeckStatsCache(subdeck, learnAheadMillis);
        }
    }

    private async updateRemoteDeltaFingerprint(): Promise<void> {
        this.remoteDeltaFingerprint = await this.captureRemoteDeltaFingerprint();
    }

    private async captureRemoteDeltaFingerprint(): Promise<string> {
        if (!this.syroLayout) {
            return "";
        }

        type SyroFingerprintStat = {
            mtime: number;
            size: number;
        };

        const adapter = this.app.vault.adapter as DataAdapter & {
            stat?: (path: string) => Promise<{ mtime?: number; size?: number } | null>;
        };
        const readFingerprintStat = async (path: string): Promise<SyroFingerprintStat | null> => {
            if (typeof adapter.stat !== "function") {
                return null;
            }

            try {
                const rawStat = (await adapter.stat(path)) as unknown;
                if (!rawStat || typeof rawStat !== "object") {
                    return null;
                }

                const candidate = rawStat as {
                    mtime?: unknown;
                    size?: unknown;
                };
                return {
                    mtime: typeof candidate.mtime === "number" ? candidate.mtime : 0,
                    size: typeof candidate.size === "number" ? candidate.size : 0,
                };
            } catch {
                return null;
            }
        };
        const entries: string[] = [];
        const sessionListing = await this.safeVaultList(this.syroLayout.sessionsRoot);
        const sessionDeviceFolders = sessionListing.folders
            .map((folderPath) => normalizeSyroPath(folderPath))
            .sort((left, right) => left.localeCompare(right));

        for (const sessionDeviceFolder of sessionDeviceFolders) {
            const deviceSessionListing = await this.safeVaultList(sessionDeviceFolder);
            const sessionFiles = deviceSessionListing.files
                .map((filePath) => normalizeSyroPath(filePath))
                .filter((filePath) => filePath.toLowerCase().endsWith(".session.jsonl"))
                .sort((left, right) => left.localeCompare(right));

            for (const filePath of sessionFiles) {
                const stat = await readFingerprintStat(filePath);
                entries.push(`${filePath}|${stat?.mtime ?? 0}|${stat?.size ?? 0}`);
            }
        }

        const deviceListing = await this.safeVaultList(this.syroLayout.devicesRoot);
        const deviceFolders = deviceListing.folders
            .map((folderPath) => normalizeSyroPath(folderPath))
            .sort((left, right) => left.localeCompare(right));

        for (const deviceFolder of deviceFolders) {
            const metaPath = normalizeSyroPath(`${deviceFolder}/device.json`);
            const exists = await adapter.exists(metaPath).catch(() => false);
            if (!exists) {
                continue;
            }

            const stat = await readFingerprintStat(metaPath);
            entries.push(
                `${metaPath}|${stat?.mtime ?? 0}|${stat?.size ?? 0}`,
            );
        }

        return entries.join("\n");
    }

    private async safeVaultList(root: string): Promise<{ files: string[]; folders: string[] }> {
        try {
            const listing = await this.app.vault.adapter.list(normalizeSyroPath(root));
            return {
                files: listing?.files ?? [],
                folders: listing?.folders ?? [],
            };
        } catch {
            return {
                files: [],
                folders: [],
            };
        }
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

    private buildPersistedNoteCachePayload(
        signature: string,
        cache: Map<string, { mtime: number; note: Note }>,
    ): PersistedNoteCacheFile {
        const items: PersistedNoteCacheItem[] = [];
        for (const [notePath, entry] of cache.entries()) {
            items.push({
                path: notePath,
                mtime: entry.mtime,
                data: serializeNote(entry.note),
            });
        }
        items.sort((left, right) => left.path.localeCompare(right.path));

        return {
            version: NOTE_CACHE_VERSION,
            signature,
            items,
        };
    }

    private hasNoteCacheMetadataChanges(
        nextCache: Map<string, { mtime: number }>,
        baselineCacheByPath: Map<string, { mtime: number }>,
    ): boolean {
        if (nextCache.size !== baselineCacheByPath.size) {
            return true;
        }

        for (const [notePath, entry] of nextCache.entries()) {
            const baseline = baselineCacheByPath.get(notePath);
            if (!baseline || baseline.mtime !== entry.mtime) {
                return true;
            }
        }

        return false;
    }

    private shouldPersistNoteCacheAfterSync(options: {
        syncMode: SyncMode;
        signatureChanged: boolean;
        cacheFileMissing: boolean;
        reparsedNotes: boolean;
        nextCache: Map<string, { mtime: number }>;
        baselineCacheByPath: Map<string, { mtime: number }>;
    }): boolean {
        if (
            options.syncMode === "full" ||
            options.signatureChanged ||
            options.cacheFileMissing ||
            options.reparsedNotes
        ) {
            return true;
        }

        return this.hasNoteCacheMetadataChanges(
            options.nextCache,
            options.baselineCacheByPath,
        );
    }

    private async saveNoteCacheToDisk(
        signature: string,
        cache: Map<string, { mtime: number; note: Note }>,
    ): Promise<void> {
        try {
            const adapter = Iadapter.instance.adapter;
            const path = this.getNoteCacheStorePath();
            const payload = this.buildPersistedNoteCachePayload(signature, cache);
            const serialized = JSON.stringify(payload);
            if (await adapter.exists(path)) {
                const existing = await adapter.read(path);
                if (existing === serialized) {
                    return;
                }
            }

            await adapter.write(path, serialized);
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
        if (this.shouldLogRuntimeDebug()) {
            console.debug(...args);
        }
    }

    private shouldLogRuntimeDebug(): boolean {
        return this.data?.settings?.showRuntimeDebugMessages === true;
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

    private buildPendingSyroDeviceSelectionContext(
        startup: SyroWorkspaceInitializeResult,
    ): SyroDeviceSelectionModalContext | null {
        if (startup.startupDecision !== "select-current-device") {
            return null;
        }

        return {
            defaultDeviceName: startup.defaultDeviceName,
            candidates: startup.validDevices,
        };
    }

    private createReadyStartupResult(
        startup: SyroWorkspaceInitializeResult,
        layout: SyroPersistenceLayout,
        currentDevice: SyroValidDeviceEntry | null,
        validDevices: SyroValidDeviceEntry[],
        invalidDevices: SyroInvalidDeviceEntry[],
    ): SyroWorkspaceInitializeResult {
        const otherDevices = currentDevice
            ? validDevices.filter((entry) => entry.deviceId !== currentDevice.deviceId)
            : validDevices;
        return {
            ...startup,
            startupDecision: "ready",
            layout,
            currentDevice,
            validDevices,
            invalidDevices,
            candidates: otherDevices,
            defaultDeviceName: currentDevice?.deviceName ?? startup.defaultDeviceName,
            recommendedSourceDeviceId: otherDevices[0]?.deviceId ?? null,
            readOnlyReason: null,
        };
    }

    private async runSyroRecoveryFlow(
        context: SyroRecoveryModalContext,
    ): Promise<SyroPersistenceLayout | null> {
        const modalResult = await new SyroRecoveryModal(this.app, context).openAndWait();
        if (!modalResult || !this.syroWorkspace) {
            return null;
        }

        return context.mode === "baseline-required"
            ? this.syroWorkspace.completeBaselineJoin({
                  deviceName: modalResult.deviceName,
                  sourceDeviceId: modalResult.sourceDeviceId,
              })
            : this.syroWorkspace.rebuildFromBaseline({
                  deviceName: modalResult.deviceName,
                  sourceDeviceId: modalResult.sourceDeviceId,
              });
    }

    private async runSyroDeviceSelectionFlow(
        context: SyroDeviceSelectionModalContext,
    ): Promise<SyroPersistenceLayout | null> {
        const selectionResult = await new SyroDeviceSelectionModal(this.app, context).openAndWait();
        if (!selectionResult || !this.syroWorkspace) {
            return null;
        }

        if (selectionResult.action === "use-existing") {
            return this.syroWorkspace.adoptExistingDevice(selectionResult.deviceId);
        }

        return this.runSyroRecoveryFlow({
            mode: "baseline-required",
            defaultDeviceName: context.defaultDeviceName,
            candidates: context.candidates,
            recommendedSourceDeviceId: context.candidates[0]?.deviceId ?? null,
        });
    }

    private async runPendingSyroRecoveryAction(): Promise<SyroPersistenceLayout | null> {
        if (this.pendingSyroDeviceSelectionContext) {
            return this.runSyroDeviceSelectionFlow(this.pendingSyroDeviceSelectionContext);
        }

        if (this.pendingSyroRecoveryContext) {
            return this.runSyroRecoveryFlow(this.pendingSyroRecoveryContext);
        }

        return null;
    }

    private async runExclusivePendingSyroRecovery(): Promise<SyroPersistenceLayout | null> {
        if (this.pendingSyroRecoveryFlow !== null) {
            return this.pendingSyroRecoveryFlow;
        }

        const recoveryFlow = this.runPendingSyroRecoveryAction();
        this.pendingSyroRecoveryFlow = recoveryFlow;
        try {
            return await recoveryFlow;
        } finally {
            if (this.pendingSyroRecoveryFlow === recoveryFlow) {
                this.pendingSyroRecoveryFlow = null;
            }
        }
    }

    private async resolveSyroWorkspaceInitialization(
        startup: SyroWorkspaceInitializeResult,
    ): Promise<SyroWorkspaceInitializeResult> {
        const recoveryContext = this.buildPendingSyroRecoveryContext(startup);
        const deviceSelectionContext = this.buildPendingSyroDeviceSelectionContext(startup);
        this.pendingSyroRecoveryContext = recoveryContext;
        this.pendingSyroDeviceSelectionContext = deviceSelectionContext;
        if (!recoveryContext && !deviceSelectionContext) {
            return startup;
        }

        await this.awaitWorkspaceLayoutReady();
        if (!this.syroWorkspace) {
            return {
                ...startup,
                startupDecision: "read-only",
                readOnlyReason: "[SR-Syro] Workspace recovery is unavailable.",
            };
        }

        try {
            const layout = await this.runExclusivePendingSyroRecovery();
            if (!layout) {
                return startup.layout
                    ? startup
                    : {
                          ...startup,
                          startupDecision: "read-only",
                          layout: null,
                          readOnlyReason:
                              "[SR-Syro] Startup recovery was cancelled by the user.",
                      };
            }

            const inventory = await this.syroWorkspace.listDeviceInventory();
            this.pendingSyroRecoveryContext = null;
            this.pendingSyroDeviceSelectionContext = null;
            return this.createReadyStartupResult(
                startup,
                layout,
                inventory.currentDevice,
                inventory.validDevices,
                inventory.invalidDevices,
            );
        } catch (error) {
            return {
                ...startup,
                startupDecision: startup.layout ? startup.startupDecision : "read-only",
                readOnlyReason: `[SR-Syro] Failed to complete startup recovery: ${String(error)}`,
            };
        }
    }

    private async pruneSyroInlineSyncMetadata(): Promise<void> {
        if (this.syroReadOnlyReason) {
            return;
        }

        const retentionMs = SYRO_SYNC_RETENTION_WINDOW_MS;
        const cardsChanged = this.store?.pruneSyncEntities(retentionMs) ?? false;
        const notesChanged = this.noteReviewStore?.pruneSyncEntities(retentionMs) ?? false;
        const timelineChanged = this.reviewCommitStore?.pruneSyncEntities(retentionMs) ?? false;
        const deckOptionsChanged = this.deckOptionsStore?.pruneSyncEntities(retentionMs) ?? false;
        const sharedSettingsChanged = pruneTimestampMap(
            this.sharedSettingsUpdatedAtByField,
            retentionMs,
        );
        let trackingRulesTombstonesChanged = false;
        for (const [folderPath, tombstone] of Object.entries(this.trackingRulesTombstones)) {
            const parsed = Date.parse(tombstone.updatedAt);
            if (!Number.isFinite(parsed) || Date.now() - parsed <= retentionMs) {
                continue;
            }

            delete this.trackingRulesTombstones[folderPath];
            trackingRulesTombstonesChanged = true;
        }
        const trackingRulesUpdatedChanged = pruneTimestampMap(
            this.trackingRulesUpdatedAtByFolderPath,
            retentionMs,
        );
        const dailyStateChanged = pruneTimestampMap(this.dailyStateAppliedOpIds, retentionMs);

        if (cardsChanged) {
            await this.store?.save();
        }
        if (notesChanged) {
            await this.noteReviewStore?.save();
        }
        if (timelineChanged) {
            await this.reviewCommitStore?.save();
        }
        if (deckOptionsChanged && this.deckOptionsStore) {
            const snapshot = createDeckOptionsStoreSnapshot(
                this.data.settings,
                this.deckOptionsStore.getSyncEntities(),
            );
            await this.deckOptionsStore.saveSerialized(snapshot.serialized);
        }
        if (sharedSettingsChanged && this.sharedSettingsStore) {
            await this.sharedSettingsStore.save(
                extractSharedSettingsWithMetadata(
                    this.data.settings,
                    this.sharedSettingsUpdatedAtByField,
                ),
            );
        }
        if ((trackingRulesTombstonesChanged || trackingRulesUpdatedChanged) && this.trackingRulesStore) {
            await this.trackingRulesStore.save(
                extractTrackingRules(
                    this.data.folderTrackingRules,
                    this.trackingRulesUpdatedAtByFolderPath,
                    this.trackingRulesTombstones,
                ),
            );
        }
        if (dailyStateChanged && this.dailyStateStore) {
            await this.dailyStateStore.save(this.buildDailyStateSnapshotWithMetadata());
        }
    }

    private async absorbLegacySyroMergeStateIfNeeded(): Promise<string | null> {
        if (
            this.syroReadOnlyReason ||
            !this.syroLayout ||
            !this.sharedSettingsStore ||
            !this.trackingRulesStore ||
            !this.dailyStateStore ||
            !this.deckOptionsStore ||
            !this.store ||
            !this.noteReviewStore ||
            !this.reviewCommitStore
        ) {
            return null;
        }

        const legacyMergeStatePath = `${this.syroLayout.deviceRoot}/sync-merge-state.json`;
        const adapter = this.app.vault.adapter;
        if (!(await adapter.exists(legacyMergeStatePath))) {
            return null;
        }

        let parsed: unknown;
        try {
            parsed = parseJsonUnknown(await adapter.read(legacyMergeStatePath));
        } catch (error) {
            return `[SR-Syro] Failed to parse legacy sync-merge-state.json: ${String(error)}`;
        }

        if (!isRecord(parsed) || getNumberProp(parsed, "version") !== 1 || !isRecord(parsed["entities"])) {
            return "[SR-Syro] Invalid legacy sync-merge-state.json schema.";
        }

        let cardsChanged = false;
        let notesChanged = false;
        let timelineChanged = false;
        let deckOptionsChanged = false;
        let sharedSettingsChanged = false;
        let trackingRulesChanged = false;
        let dailyStateChanged = false;

        for (const [targetUuid, entry] of Object.entries(parsed["entities"])) {
            if (!isRecord(entry)) {
                continue;
            }

            const updatedAt = getStringProp(entry, "updatedAt")?.trim();
            const domain = getStringProp(entry, "domain")?.trim();
            const entityType = getStringProp(entry, "entityType")?.trim();
            const pathHint = getStringProp(entry, "pathHint")?.trim();
            if (!updatedAt || !domain || !entityType) {
                continue;
            }

            const deleted = entry["deleted"] === true;

            switch (domain) {
                case "settings": {
                    const field = targetUuid.startsWith("settings:")
                        ? targetUuid.slice("settings:".length)
                        : "";
                    if (!field) {
                        continue;
                    }
                    const current = this.sharedSettingsUpdatedAtByField[field];
                    if (current && compareIsoTime(current, updatedAt) >= 0) {
                        continue;
                    }
                    this.sharedSettingsUpdatedAtByField[field] = updatedAt;
                    sharedSettingsChanged = true;
                    break;
                }
                case "tracking-rules": {
                    const folderPath = targetUuid.startsWith("tracking-rule:")
                        ? targetUuid.slice("tracking-rule:".length)
                        : pathHint ?? "";
                    if (!folderPath) {
                        continue;
                    }
                    const current = this.trackingRulesUpdatedAtByFolderPath[folderPath];
                    const tombstone = this.trackingRulesTombstones[folderPath]?.updatedAt;
                    const watermark =
                        current && tombstone
                            ? compareIsoTime(current, tombstone) >= 0
                                ? current
                                : tombstone
                            : current ?? tombstone ?? null;
                    if (watermark && compareIsoTime(watermark, updatedAt) >= 0) {
                        continue;
                    }
                    if (deleted) {
                        delete this.trackingRulesUpdatedAtByFolderPath[folderPath];
                        this.trackingRulesTombstones[folderPath] = { updatedAt };
                    } else {
                        this.trackingRulesUpdatedAtByFolderPath[folderPath] = updatedAt;
                        delete this.trackingRulesTombstones[folderPath];
                    }
                    trackingRulesChanged = true;
                    break;
                }
                case "daily-state":
                    this.dailyStateAppliedOpIds[targetUuid] = updatedAt;
                    dailyStateChanged = true;
                    break;
                case "deck-options":
                    deckOptionsChanged =
                        this.deckOptionsStore.markSyncEntity({
                            targetUuid,
                            updatedAt,
                            deleted,
                            entityType,
                            pathHint,
                        }) || deckOptionsChanged;
                    break;
                case "notes":
                    notesChanged =
                        this.noteReviewStore.markSyncEntity({
                            targetUuid,
                            updatedAt,
                            deleted,
                            entityType,
                            pathHint,
                        }) || notesChanged;
                    break;
                case "timeline":
                    timelineChanged =
                        this.reviewCommitStore.markSyncEntity({
                            targetUuid,
                            updatedAt,
                            deleted,
                            entityType,
                            pathHint,
                        }) || timelineChanged;
                    break;
                case "cards":
                    cardsChanged =
                        this.store.markSyncEntity({
                            targetUuid,
                            updatedAt,
                            deleted,
                            entityType,
                            pathHint,
                        }) || cardsChanged;
                    break;
            }
        }

        if (cardsChanged) {
            await this.store.save();
        }
        if (notesChanged) {
            await this.noteReviewStore.save();
        }
        if (timelineChanged) {
            await this.reviewCommitStore.save();
        }
        if (deckOptionsChanged) {
            const snapshot = createDeckOptionsStoreSnapshot(
                this.data.settings,
                this.deckOptionsStore.getSyncEntities(),
            );
            await this.deckOptionsStore.saveSerialized(snapshot.serialized);
        }
        if (sharedSettingsChanged) {
            await this.sharedSettingsStore.save(
                extractSharedSettingsWithMetadata(
                    this.data.settings,
                    this.sharedSettingsUpdatedAtByField,
                ),
            );
        }
        if (trackingRulesChanged) {
            await this.trackingRulesStore.save(
                extractTrackingRules(
                    this.data.folderTrackingRules,
                    this.trackingRulesUpdatedAtByFolderPath,
                    this.trackingRulesTombstones,
                ),
            );
        }
        if (dailyStateChanged) {
            await this.dailyStateStore.save(this.buildDailyStateSnapshotWithMetadata());
        }

        await adapter.remove(legacyMergeStatePath);
        return null;
    }

    private async reloadAfterSyroDeviceChange(): Promise<void> {
        this.pendingSyroRecoveryContext = null;
        this.pendingSyroDeviceSelectionContext = null;
        this.clearSyroReadOnly();
        await this.loadPluginData();
        await this.initializeSyroDataBackedRuntimeIfReady("device-change");
        await this.maybeInitializeFirstRunTutorialNote("device-change");
        await this.refreshNoteReview({ trigger: "startup" });
        this.syncEvents.emit("note-review-updated");
        this.syncEvents.emit("sync-complete");
    }

    public async openPendingSyroRecovery(): Promise<boolean> {
        if (
            (!this.pendingSyroRecoveryContext && !this.pendingSyroDeviceSelectionContext) ||
            !this.syroWorkspace
        ) {
            new Notice(t("NOTICE_SYRO_RECOVERY_NOT_NEEDED"));
            return false;
        }

        await this.awaitWorkspaceLayoutReady();
        try {
            const layout = await this.runExclusivePendingSyroRecovery();
            if (!layout) {
                new Notice(t("NOTICE_SYRO_RECOVERY_CANCELLED"));
                return false;
            }
        } catch (error) {
            this.enableSyroReadOnly(`[SR-Syro] Failed to complete recovery: ${String(error)}`);
            return false;
        }

        await this.reloadAfterSyroDeviceChange();
        return true;
    }

    private async flushBeforeSyroDeviceMutation(): Promise<void> {
        await this.flushPendingPluginDataSave();
        await this.syroSessionManager?.flushActiveSession("manual");
    }

    private async confirmSyroAction(
        message: string,
        options: { destructive?: boolean } = {},
    ): Promise<boolean> {
        return new ConfirmModal(this, message, () => undefined, options)
            .openAndWait()
            .catch(() => false);
    }

    private async getSyroPathFootprintBytes(rootPath: string): Promise<number> {
        const normalizedRoot = normalizeSyroPath(rootPath);
        const exists = await this.app.vault.adapter.exists(normalizedRoot).catch(() => false);
        if (!exists) {
            return 0;
        }

        const listing = await this.safeVaultList(normalizedRoot);
        if (listing.files.length === 0 && listing.folders.length === 0) {
            const raw = await this.app.vault.adapter.read(normalizedRoot).catch(() => "");
            return new TextEncoder().encode(raw).length;
        }

        let totalBytes = 0;
        for (const filePath of listing.files) {
            const raw = await this.app.vault.adapter.read(normalizeSyroPath(filePath)).catch(() => "");
            totalBytes += new TextEncoder().encode(raw).length;
        }
        for (const folderPath of listing.folders) {
            totalBytes += await this.getSyroPathFootprintBytes(folderPath);
        }
        return totalBytes;
    }

    private async getSyroDeviceFootprintBytes(
        deviceRoot: string,
        sessionRoot: string,
    ): Promise<number> {
        const [deviceBytes, sessionBytes] = await Promise.all([
            this.getSyroPathFootprintBytes(deviceRoot),
            this.getSyroPathFootprintBytes(sessionRoot),
        ]);
        return deviceBytes + sessionBytes;
    }

    private getSyroDeviceStatus(input: {
        isCurrent: boolean;
        inactiveDays: number | null;
        latestSessionAt: string | null;
        hasPendingRemoteChanges: boolean;
    }): SyroDeviceCardStatus {
        if (input.isCurrent) {
            return "current";
        }
        if (input.hasPendingRemoteChanges) {
            return "needs-sync";
        }
        if (!input.latestSessionAt) {
            return "no-session";
        }
        if (input.inactiveDays !== null && input.inactiveDays >= 14) {
            return "idle";
        }
        return "up-to-date";
    }

    private buildSyroDeviceCardState(
        device: SyroValidDeviceEntry,
        sessionSummary: SyroDeviceSessionSummary | null,
        footprintBytes: number,
        currentDeviceId: string | null,
    ): SyroDeviceCardState {
        const isCurrent = currentDeviceId === device.deviceId;
        const inactiveDays =
            Number.isFinite(Date.parse(device.lastSeenAt))
                ? Math.max(
                      0,
                      Math.floor((Date.now() - Date.parse(device.lastSeenAt)) / (24 * 60 * 60 * 1000)),
                  )
                : null;
        const status = this.getSyroDeviceStatus({
            isCurrent,
            inactiveDays,
            latestSessionAt: sessionSummary?.latestSessionAt ?? null,
            hasPendingRemoteChanges: sessionSummary?.hasPendingRemoteChanges === true,
        });

        return {
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            isCurrent,
            footprintBytes,
            reviewCount: isCurrent
                ? normalizeDeviceReviewCount(this.currentDeviceReviewCount)
                : device.deviceReviewCount,
            lastSeenAt: device.lastSeenAt ?? null,
            latestSessionAt: sessionSummary?.latestSessionAt ?? null,
            lastPulledIntoCurrentAt: isCurrent
                ? null
                : (sessionSummary?.lastPulledIntoCurrentAt ?? null),
            inactiveDays,
            status,
            canRename: isCurrent,
            canPullToCurrent: !isCurrent && currentDeviceId !== null,
            canDelete: !isCurrent,
        };
    }

    public async getSyroDeviceManagementState(): Promise<SyroDeviceManagementViewState> {
        if (!this.syroWorkspace) {
            return {
                currentDevice: null,
                devices: [],
                invalidDevices: [],
                hasPendingAction: false,
                readOnlyReason: this.syroReadOnlyReason,
            };
        }

        const inventory = await this.syroWorkspace.listDeviceInventory();
        const fallbackCurrentDevice =
            this.syroLayout?.device.deviceId != null
                ? inventory.validDevices.find(
                      (entry) => entry.deviceId === this.syroLayout?.device.deviceId,
                  ) ?? null
                : null;
        const currentDevice = inventory.currentDevice ?? fallbackCurrentDevice;
        const sessionSummaryEntries = await this.syroSessionManager?.summarizeDeviceSessions();
        const sessionSummaries = new Map(
            (sessionSummaryEntries ?? []).map((entry) => [entry.deviceFolderName, entry]),
        );
        const currentDeviceId = currentDevice?.deviceId ?? null;

        const validDeviceCards = await Promise.all(
            inventory.validDevices.map(async (entry) =>
                this.buildSyroDeviceCardState(
                    entry,
                    sessionSummaries.get(entry.deviceFolderName) ?? null,
                    await this.getSyroDeviceFootprintBytes(
                        entry.deviceRoot,
                        this.syroWorkspace.getSessionDirectoryPath(entry.deviceFolderName),
                    ),
                    currentDeviceId,
                ),
            ),
        );
        const invalidDeviceCards: SyroInvalidDeviceCardState[] = await Promise.all(
            inventory.invalidDevices.map(async (entry) => ({
                deviceFolderName: entry.deviceFolderName,
                footprintBytes: await this.getSyroDeviceFootprintBytes(
                    entry.deviceRoot,
                    this.syroWorkspace.getSessionDirectoryPath(entry.deviceFolderName),
                ),
                reviewCount: entry.deviceReviewCount,
                lastSeenAt:
                    entry.lastSeenAt ??
                    sessionSummaries.get(entry.deviceFolderName)?.latestSessionAt ??
                    null,
                invalidReason: entry.reason,
                files: entry.files,
                folders: entry.folders,
                canDelete: true,
            })),
        );
        const sortedDevices = validDeviceCards
            .filter((entry) => !entry.isCurrent)
            .sort((left, right) => {
                const pendingDelta =
                    Number(right.status === "needs-sync") - Number(left.status === "needs-sync");
                if (pendingDelta !== 0) {
                    return pendingDelta;
                }

                const latestSessionDelta = compareIsoTime(
                    right.latestSessionAt ?? "",
                    left.latestSessionAt ?? "",
                );
                if (latestSessionDelta !== 0) {
                    return latestSessionDelta;
                }

                return compareIsoTime(right.lastSeenAt ?? "", left.lastSeenAt ?? "");
            });

        return {
            currentDevice:
                validDeviceCards.find((entry) => entry.isCurrent) ??
                (currentDevice
                    ? this.buildSyroDeviceCardState(
                          currentDevice,
                          sessionSummaries.get(currentDevice.deviceFolderName) ?? null,
                          await this.getSyroDeviceFootprintBytes(
                              currentDevice.deviceRoot,
                              this.syroWorkspace.getSessionDirectoryPath(currentDevice.deviceFolderName),
                          ),
                          currentDeviceId,
                      )
                    : null),
            devices: sortedDevices,
            invalidDevices: invalidDeviceCards.sort((left, right) =>
                left.deviceFolderName.localeCompare(right.deviceFolderName),
            ),
            hasPendingAction:
                this.pendingSyroRecoveryContext !== null ||
                this.pendingSyroDeviceSelectionContext !== null,
            readOnlyReason: this.syroReadOnlyReason,
        };
    }

    public async setCurrentSyroDevice(deviceId: string): Promise<void> {
        if (!this.syroWorkspace) {
            throw new Error("[SR-Syro] Workspace is unavailable.");
        }

        await this.flushBeforeSyroDeviceMutation();
        await this.syroWorkspace.adoptExistingDevice(deviceId);
        await this.reloadAfterSyroDeviceChange();
        new Notice(t("NOTICE_SYRO_DEVICE_SELECTED"));
    }

    public async renameCurrentSyroDevice(nextDeviceName: string): Promise<boolean> {
        if (!this.syroWorkspace || !this.syroLayout) {
            throw new Error("[SR-Syro] Current device is unavailable.");
        }

        await this.flushBeforeSyroDeviceMutation();
        this.syroLayout = await this.syroWorkspace.renameCurrentDevice(this.syroLayout, nextDeviceName);
        await this.reloadAfterSyroDeviceChange();
        new Notice(t("NOTICE_SYRO_DEVICE_RENAMED"));
        return true;
    }

    public async pullSyroDeviceToCurrent(deviceId: string): Promise<boolean> {
        if (!this.syroWorkspace || !this.syroLayout || !this.syroSessionManager) {
            throw new Error("[SR-Syro] Current device is unavailable.");
        }
        if (this.syroReadOnlyReason) {
            throw new Error(this.syroReadOnlyReason);
        }

        const inventory = await this.syroWorkspace.listDeviceInventory();
        const sourceDevice = inventory.validDevices.find((entry) => entry.deviceId === deviceId);
        if (!sourceDevice) {
            throw new Error("[SR-Syro] Source device not found.");
        }
        if (inventory.currentDevice?.deviceId === deviceId) {
            throw new Error("[SR-Syro] The current device cannot sync from itself.");
        }

        const confirmed = await this.confirmSyroAction(
            t("SYRO_PULL_TO_CURRENT_CONFIRM", {
                source: sourceDevice.deviceName,
                current: this.syroLayout.device.deviceName,
            }),
            { destructive: true },
        );
        if (!confirmed) {
            return false;
        }

        await this.flushBeforeSyroDeviceMutation();
        const sourceDeviceFolderName = sourceDevice.deviceFolderName;
        this.syroLayout = await this.syroWorkspace.overwriteCurrentDeviceFromSource(
            this.syroLayout,
            deviceId,
        );
        await this.syroSessionManager.alignRemoteDeviceSessionsToEof(sourceDeviceFolderName);
        await this.reloadAfterSyroDeviceChange();
        new Notice(t("NOTICE_SYRO_DEVICE_PULLED"));
        return true;
    }

    public async deleteValidSyroDevice(deviceId: string): Promise<boolean> {
        if (!this.syroWorkspace || !this.syroSessionManager) {
            throw new Error("[SR-Syro] Workspace is unavailable.");
        }
        if (this.syroReadOnlyReason) {
            throw new Error(this.syroReadOnlyReason);
        }

        const inventory = await this.syroWorkspace.listDeviceInventory();
        const targetDevice = inventory.validDevices.find((entry) => entry.deviceId === deviceId);
        if (!targetDevice) {
            throw new Error("[SR-Syro] Device not found.");
        }
        if (inventory.currentDevice?.deviceId === deviceId) {
            throw new Error("[SR-Syro] The current device cannot be deleted.");
        }

        const confirmed = await new SyroDeleteValidDeviceModal(
            this.app,
            targetDevice.deviceName,
        ).openAndWait();
        if (!confirmed) {
            return false;
        }

        await this.flushBeforeSyroDeviceMutation();
        await this.syroWorkspace.deleteValidDevice(deviceId);
        await this.syroSessionManager.pruneRemoteDeviceCursorState(targetDevice.deviceFolderName);
        new Notice(t("NOTICE_SYRO_VALID_DEVICE_DELETED"));
        return true;
    }

    public async deleteInvalidSyroDeviceDirectory(deviceFolderName: string): Promise<boolean> {
        if (!this.syroWorkspace) {
            throw new Error("[SR-Syro] Workspace is unavailable.");
        }

        await this.awaitWorkspaceLayoutReady();
        const confirmed = await new SyroDeleteInvalidDeviceModal(
            this.app,
            deviceFolderName,
        ).openAndWait();
        if (!confirmed) {
            return false;
        }

        await this.syroWorkspace.deleteInvalidDeviceDirectory(deviceFolderName);
        new Notice(t("NOTICE_SYRO_INVALID_DEVICE_DELETED"));
        return true;
    }

    private async importPendingSyroSessions(
        options: {
            sealOwnOpenSession?: boolean;
            reason?: string;
        } = {},
    ): Promise<SyroSessionImportResult | null> {
        if (this.syroReadOnlyReason) {
            return null;
        }

        if (
            !this.syroSessionManager ||
            !this.syroWorkspace ||
            !this.deckOptionsStore ||
            !this.sharedSettingsStore ||
            !this.trackingRulesStore ||
            !this.dailyStateStore ||
            !this.store ||
            !this.noteReviewStore ||
            !this.reviewCommitStore
        ) {
            return null;
        }

        const importReason = options.reason ?? "manual";
        const readyForImport =
            await this.prepareBufferedPluginStateForRemoteImport(importReason);
        if (!readyForImport) {
            return {
                importedSessionIds: [],
                deletedSessionIds: [],
                archivedSessionIds: [],
                replayImpact: createEmptySyroSessionReplaySummary(),
            };
        }

        const inventory = await this.syroWorkspace.listDeviceInventory();
        const validDevicesById = new Map(
            inventory.validDevices.map((entry) => [entry.deviceId, entry] as const),
        );
        const importStartSnapshot = this.captureBufferedImportBaselineSnapshot();
        let latestCleanSnapshot = importStartSnapshot;
        const remoteCardsCache = new Map<string, ReturnType<typeof parseTrackedCardsStoreSnapshots>>();
        const remoteNotesCache = new Map<string, ReturnType<typeof parseNoteReviewStoreSnapshots>>();
        const aliasGroupsByDomain: Record<"cards" | "notes", Map<string, SyroUuidAliasGroup>> = {
            cards: new Map<string, SyroUuidAliasGroup>(),
            notes: new Map<string, SyroUuidAliasGroup>(),
        };
        const buildAliasGroupKey = (group: SyroUuidAliasGroup): string => {
            const normalized = Array.from(new Set(group.equivalentUuids))
                .filter((uuid) => typeof uuid === "string" && uuid.trim().length > 0)
                .sort((left, right) => left.localeCompare(right));
            return `${group.entityType}:${normalized.join("|")}`;
        };
        const collectAliasGroups = (
            domain: "cards" | "notes",
            groups: SyroUuidAliasGroup[],
        ): void => {
            for (const group of groups) {
                aliasGroupsByDomain[domain].set(buildAliasGroupKey(group), group);
            }
        };
        const loadRemoteCardsSnapshots = async (deviceId: string) => {
            if (remoteCardsCache.has(deviceId)) {
                return remoteCardsCache.get(deviceId) ?? null;
            }

            const validDevice = validDevicesById.get(deviceId);
            if (!validDevice) {
                remoteCardsCache.set(deviceId, null);
                return null;
            }

            try {
                const raw = await this.app.vault.adapter.read(`${validDevice.deviceRoot}/cards.json`);
                const parsed = parseTrackedCardsStoreSnapshots(raw);
                remoteCardsCache.set(deviceId, parsed);
                return parsed;
            } catch {
                remoteCardsCache.set(deviceId, null);
                return null;
            }
        };
        const loadRemoteNotesSnapshots = async (deviceId: string) => {
            if (remoteNotesCache.has(deviceId)) {
                return remoteNotesCache.get(deviceId) ?? null;
            }

            const validDevice = validDevicesById.get(deviceId);
            if (!validDevice) {
                remoteNotesCache.set(deviceId, null);
                return null;
            }

            try {
                const raw = await this.app.vault.adapter.read(`${validDevice.deviceRoot}/notes.json`);
                const parsed = parseNoteReviewStoreSnapshots(raw);
                remoteNotesCache.set(deviceId, parsed);
                return parsed;
            } catch {
                remoteNotesCache.set(deviceId, null);
                return null;
            }
        };

        const result = await this.syroSessionManager.importPendingSessions(
            async (_sessionId, records) => {
                const replaySummary = await replaySyroSessionRecords(records, {
                    settings: this.data.settings,
                    data: this.data,
                    store: this.store,
                    noteReviewStore: this.noteReviewStore,
                    reviewCommitStore: this.reviewCommitStore,
                    deckOptionsStore: this.deckOptionsStore,
                    sharedSettingsStore: this.sharedSettingsStore,
                    trackingRulesStore: this.trackingRulesStore,
                    dailyStateStore: this.dailyStateStore,
                    sharedSettingsUpdatedAtByField: this.sharedSettingsUpdatedAtByField,
                    trackingRulesUpdatedAtByFolderPath: this.trackingRulesUpdatedAtByFolderPath,
                    trackingRulesTombstones: this.trackingRulesTombstones,
                    dailyStateAppliedOpIds: this.dailyStateAppliedOpIds,
                    currentDeviceReviewCount: this.currentDeviceReviewCount,
                    loadRemoteCardsSnapshots,
                    loadRemoteNotesSnapshots,
                    collectAliasGroups,
                    shouldLogDebug: () => this.shouldLogRuntimeDebug(),
                    logDebug: (...args: unknown[]) => this.logRuntimeDebug(...args),
                });
                const currentSnapshot = this.captureBufferedImportBaselineSnapshot();
                const currentRevisions = this.getBufferedStateDirtyRevisionSnapshot();
                for (const domain of BUFFERED_IMPORT_PROTECTED_DOMAINS) {
                    if (currentRevisions[domain] !== importStartSnapshot.revisions[domain]) {
                        continue;
                    }
                    latestCleanSnapshot = {
                        ...latestCleanSnapshot,
                        revisions: {
                            ...latestCleanSnapshot.revisions,
                            [domain]: currentSnapshot.revisions[domain],
                        },
                        ...(domain === "shared-settings"
                            ? { sharedSettingsState: currentSnapshot.sharedSettingsState }
                            : {}),
                        ...(domain === "tracking-rules"
                            ? { trackingRulesState: currentSnapshot.trackingRulesState }
                            : {}),
                        ...(domain === "daily-state"
                            ? { dailyState: currentSnapshot.dailyState }
                            : {}),
                    };
                }
                return replaySummary;
            },
            options,
        );
        for (const domain of ["cards", "notes"] as const) {
            const groups = [...aliasGroupsByDomain[domain].values()];
            if (groups.length === 0) {
                continue;
            }
            await this.appendSyroUuidAliasBatch(domain, groups);
        }
        const locallyDirtyDuringImport = BUFFERED_IMPORT_PROTECTED_DOMAINS.filter(
            (domain) =>
                this.getBufferedStateDirtyRevisionSnapshot()[domain] !==
                importStartSnapshot.revisions[domain],
        );
        const safeDomains = BUFFERED_IMPORT_PROTECTED_DOMAINS.filter(
            (domain) => !locallyDirtyDuringImport.includes(domain),
        );
        if (safeDomains.length > 0) {
            this.applyBufferedImportBaselineSnapshot(latestCleanSnapshot, safeDomains);
        }
        if (locallyDirtyDuringImport.length > 0) {
            this.logRuntimeDebug(
                "[SR-BufferedState] buffered-state-baseline-preserved-due-to-local-dirty",
                {
                    reason: importReason,
                    domains: locallyDirtyDuringImport,
                },
            );
        }
        const pendingBufferedDomains = this.getPendingBufferedPluginStateDomains();
        const requeueDomains = BUFFERED_IMPORT_PROTECTED_DOMAINS.filter(
            (domain) =>
                locallyDirtyDuringImport.includes(domain) ||
                pendingBufferedDomains.includes(domain),
        );
        if (requeueDomains.length > 0) {
            this.requestPluginDataSave(
                {
                    delayMs: 0,
                    domains: requeueDomains,
                },
                {
                    markDirty: false,
                },
            );
            this.logRuntimeDebug("[SR-BufferedState] buffered-state-save-requeued-after-import", {
                reason: importReason,
                domains: requeueDomains,
            });
        }
        await this.pruneSyroInlineSyncMetadata();
        return result;
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
            this.noteReviewStore?.markSyncEntity({
                targetUuid,
                updatedAt,
                deleted: opType === "remove",
                entityType: "note-review",
                pathHint: snapshot.path,
            });
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
            this.reviewCommitStore?.markSyncEntity({
                targetUuid,
                updatedAt,
                deleted: opType === "delete",
                entityType: "timeline-entry",
                pathHint: notePath,
            });
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
                    trackedFileAliases: snapshot.trackedFileAliases,
                    trackedFileTags: snapshot.trackedFileTags,
                    trackedItem: snapshot.trackedItem,
                    item: snapshot.item,
                    ...extraPayload,
                },
                pathHint: snapshot.path,
                updatedAt,
            })) ?? false;
        if (appended) {
            this.store?.markSyncEntity({
                targetUuid,
                updatedAt,
                deleted: opType === "remove",
                entityType: "card-item",
                pathHint: snapshot.path,
            });
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
                    aliases: snapshot.aliases,
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
            this.store?.markSyncEntity({
                targetUuid,
                updatedAt,
                deleted: opType === "delete-file",
                entityType: "tracked-file",
                pathHint: snapshot.path,
            });
            for (const item of snapshot.relatedItems) {
                this.store?.markSyncEntity({
                    targetUuid: item.uuid || `card:${snapshot.path}:${item.ID}`,
                    updatedAt,
                    deleted: opType === "delete-file",
                    entityType: "card-item",
                    pathHint: snapshot.path,
                });
            }
        }
        return appended;
    }

    private async appendSyroUuidAliasBatch(
        domain: "cards" | "notes",
        groups: SyroUuidAliasGroup[],
    ): Promise<boolean> {
        if (this.syroReadOnlyReason || groups.length === 0) {
            return false;
        }

        const updatedAt = new Date().toISOString();
        return (
            (await this.syroSessionManager?.appendRecord({
                domain,
                entityType: "uuid-alias-batch",
                opType: "merge-aliases",
                targetUuid: `uuid-alias-batch:${domain}:${updatedAt}`,
                payload: {
                    groups,
                },
                updatedAt,
            })) ?? false
        );
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
            this.reviewCommitStore?.markSyncEntity({
                targetUuid: `timeline-file:${oldPath}`,
                updatedAt,
                deleted: false,
                entityType: "timeline-file",
                pathHint: newPath,
            });
            for (const commit of commits) {
                this.reviewCommitStore?.markSyncEntity({
                    targetUuid: `timeline-entry:${commit.id}`,
                    updatedAt,
                    deleted: false,
                    entityType: "timeline-entry",
                    pathHint: newPath,
                });
            }
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
            this.reviewCommitStore?.markSyncEntity({
                targetUuid: `timeline-file:${notePath}`,
                updatedAt,
                deleted: true,
                entityType: "timeline-file",
                pathHint: notePath,
            });
            for (const commit of commits) {
                this.reviewCommitStore?.markSyncEntity({
                    targetUuid: `timeline-entry:${commit.id}`,
                    updatedAt,
                    deleted: true,
                    entityType: "timeline-entry",
                    pathHint: notePath,
                });
            }
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
        if (!this.guardSyroDataReady("note-review")) {
            return;
        }
        const noteReviewStore = this.noteReviewStore;
        if (!noteReviewStore) {
            return;
        }
        this.clearFolderTrackingExclusion(file.path);

        noteReviewStore.ensureTracked(file.path, DEFAULT_DECKNAME, "manual", this.noteAlgorithm);
        await noteReviewStore.save();
        await this.appendSyroNoteUpsert(noteReviewStore.getEntrySnapshot(file.path), "track");
        await this.refreshNoteReview({ trigger: "manual" });
    }

    public async untrackNoteFromMenu(file: TFile): Promise<void> {
        if (!this.guardSyroDataReady("note-review")) {
            return;
        }
        const noteReviewStore = this.noteReviewStore;
        if (!noteReviewStore) {
            return;
        }
        const resolvedRule = this.getResolvedFolderTrackingRule(file.path);
        if (resolvedRule?.rule.track === true) {
            this.excludeNoteFromFolderTracking(file.path);
        }

        const removedSnapshot = noteReviewStore.removeWithSnapshot(file.path);
        await noteReviewStore.save();
        await this.appendSyroNoteRemove(removedSnapshot, "remove");

        if (this.reviewFloatBar.isDisplay() && this.data.settings.autoNextNote) {
            await this.reviewNextNote(this.lastSelectedReviewDeck);
        }

        await this.refreshNoteReview({ trigger: "manual" });
    }

    private async maybeInitializeFirstRunTutorialNote(
        trigger: "startup" | "device-change",
    ): Promise<void> {
        if (!this.pendingFirstRunTutorialInitialization) {
            return;
        }

        const result = await this.initializeFirstRunTutorialNote();
        if (result === "initialized") {
            this.pendingFirstRunTutorialInitialization = false;
            return;
        }

        if (result === "deferred") {
            this.logRuntimeDebug(
                `[SR-FirstRunTutorial] Initialization deferred: trigger=${trigger} noteReviewStoreReady=${
                    this.noteReviewStore ? "true" : "false"
                } noteAlgorithmReady=${this.noteAlgorithm ? "true" : "false"}`,
            );
            return;
        }

        console.warn(
            `[SR-FirstRunTutorial] Initialization failed; continuing plugin startup. trigger=${trigger}`,
        );
    }

    private async initializeFirstRunTutorialNote(): Promise<
        "initialized" | "deferred" | "failed"
    > {
        if (!this.noteReviewStore || !this.noteAlgorithm) {
            return "deferred";
        }

        const tutorial = getFirstRunTutorial();
        let tutorialFile = this.app.vault.getAbstractFileByPath(tutorial.path);

        if (!tutorialFile) {
            try {
                tutorialFile = await this.app.vault.create(tutorial.path, tutorial.content);
            } catch (error) {
                console.warn(
                    "[SR-FirstRunTutorial] Failed to create tutorial file:",
                    tutorial.path,
                    error,
                );
                return "failed";
            }
        }

        if (!(tutorialFile instanceof TFile)) {
            console.warn(
                "[SR-FirstRunTutorial] Tutorial path is not a markdown file:",
                tutorial.path,
            );
            return "failed";
        }

        try {
            this.noteReviewStore.ensureTracked(
                tutorialFile.path,
                DEFAULT_DECKNAME,
                "manual",
                this.noteAlgorithm,
            );
        } catch (error) {
            console.warn(
                "[SR-FirstRunTutorial] Failed to track tutorial note:",
                tutorialFile.path,
                error,
            );
            return "failed";
        }

        try {
            await this.noteReviewStore.save();
        } catch (error) {
            console.warn(
                "[SR-FirstRunTutorial] Failed to save tutorial note review state:",
                tutorialFile.path,
                error,
            );
            return "failed";
        }

        try {
            this.reviewDecks = this.noteReviewStore.buildReviewDecks(this.app.vault);
            this.updateAndSortDueNotes();
            this.syncEvents.emit("note-review-updated");
        } catch (error) {
            console.warn(
                "[SR-FirstRunTutorial] Failed to refresh tutorial note runtime state:",
                tutorialFile.path,
                error,
            );
            return "failed";
        }

        return "initialized";
    }

    public async refreshNoteReview({
        trigger = "manual",
    }: { trigger?: SyncTrigger } = {}): Promise<void> {
        if (
            !this.guardSyroDataReady("note-review", {
                notify: trigger === "manual" || trigger === "review-entry",
            })
        ) {
            return;
        }
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
            this.replayPendingRemoteDeltaSyncIfNeeded();
        }
    }

    private async refreshNoteReviewOnce(_trigger: SyncTrigger): Promise<void> {
        const noteReviewStore = this.noteReviewStore;
        if (!noteReviewStore) {
            this.logRuntimeDebug("[SR-StartupGate] refreshNoteReviewOnce skipped: store not ready");
            return;
        }
        graph.reset();
        this.easeByPath = this.easeByPath ?? new NoteEaseList(this.data.settings);
        this.linkRank = new LinkRank(this.data.settings, this.app.metadataCache);

        const notes = this.getNoteReviewableMarkdownFiles();
        const visiblePaths = new Set(notes.map((note) => note.path));
        let changed = noteReviewStore.cleanupMissingFiles(this.app.vault);

        this.linkRank.readLinks(notes);

        for (const path of noteReviewStore.listPaths()) {
            if (!visiblePaths.has(path)) {
                changed = noteReviewStore.remove(path) || changed;
            }
        }

        for (const note of notes) {
            const tracking = this.resolveNoteReviewTracking(note);
            const existing = noteReviewStore.getEntry(note.path);
            const previousDeckName = existing?.deckName;
            const previousSource = existing?.source;

            if (!tracking) {
                if (existing) {
                    changed = noteReviewStore.remove(note.path) || changed;
                }
                continue;
            }

            const item = noteReviewStore.ensureTracked(
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

        this.reviewDecks = noteReviewStore.buildReviewDecks(this.app.vault);
        this.updateAndSortDueNotes();

        if (changed) {
            await noteReviewStore.save();
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
        const shouldNotifyNotReady = trigger === "manual" || trigger === "review-entry";

        if (!this.guardSyroDataReady("sync", { notify: shouldNotifyNotReady })) {
            return { ...request, status: "skipped", reason: "not-ready" };
        }

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

        await this.flushReviewPersistence(1500, {
            notify: request.trigger === "manual" || request.trigger === "review-entry",
        });

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

        const sessionImportResult = await this.importPendingSyroSessions?.({
            sealOwnOpenSession: request.trigger !== "remote-poll",
            reason: request.trigger,
        });
        if (
            sessionImportResult &&
            this.shouldLogRuntimeDebug() &&
            (sessionImportResult.importedSessionIds.length > 0 ||
                sessionImportResult.deletedSessionIds.length > 0 ||
                sessionImportResult.archivedSessionIds.length > 0)
        ) {
            console.debug("[SR-Syro] Imported pending sessions before sync.", sessionImportResult);
        }
        if (sessionImportResult?.replayImpact.dailyStateChanged) {
            this.logRuntimeDebug("[SR-DailyState] pre-sync import updated daily-state", {
                trigger: request.trigger,
                importedSessionIds: sessionImportResult.importedSessionIds,
                deletedSessionIds: sessionImportResult.deletedSessionIds,
            });
        }

        await this.sync(request.reviewMode, request.mode, {
            trigger: request.trigger,
            force: request.force,
        });
        await this.updateRemoteDeltaFingerprint();
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
        const shouldNotifyNotReady =
            request.trigger === "manual" || request.trigger === "review-entry";
        if (!this.guardSyroDataReady("sync", { notify: shouldNotifyNotReady })) {
            return;
        }
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
        const noteCachePath = settings.enableNoteCachePersistence
            ? this.getNoteCacheStorePath()
            : null;
        const noteCacheFileMissing = noteCachePath
            ? !(await Iadapter.instance.adapter.exists(noteCachePath))
            : false;

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

        const noteCacheSignatureChanged =
            !!this.noteCacheSignature && this.noteCacheSignature !== currentSignature;
        if (!this.noteCacheSignature) {
            this.noteCacheSignature = currentSignature;
        }

        if (noteCacheSignatureChanged) {
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
            if (this.store) {
                await this.store.ensureReviewOverlayMerged();
            }

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
            const previousCacheMetadataByPath = new Map<string, { mtime: number }>();
            for (const [notePath, entry] of previousCache.entries()) {
                previousCacheMetadataByPath.set(notePath, {
                    mtime: entry.mtime,
                });
            }
            const nextCache = new Map<string, { mtime: number; note: Note }>();
            let noteCacheReparsedNotes = false;
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
                            noteCacheReparsedNotes = true;
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
            const noteCacheBaselineByPath =
                persistedCacheByPath.size > 0 || previousCacheMetadataByPath.size === 0
                    ? persistedCacheByPath
                    : previousCacheMetadataByPath;
            if (
                settings.enableNoteCachePersistence &&
                this.shouldPersistNoteCacheAfterSync({
                    syncMode,
                    signatureChanged: noteCacheSignatureChanged,
                    cacheFileMissing: noteCacheFileMissing,
                    reparsedNotes: noteCacheReparsedNotes,
                    nextCache,
                    baselineCacheByPath: noteCacheBaselineByPath,
                })
            ) {
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
            this.replayPendingRemoteDeltaSyncIfNeeded();
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
        if (!this.guardSyroDataReady("item-info", { notify: false })) {
            return {
                reviewableCount: 0,
                totalCount: 0,
            };
        }
        const store = this.store;
        if (!store) {
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
                store.getTrackedFile(file.path),
            );
            trackedFile.syncNoteCardsIndex(fileText, this.data.settings);

            return countInlineTitleStatsFromTrackedFile(
                trackedFile,
                (id) => store.getItembyID(id),
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
        if (!this.guardSyroDataReady("note-review")) {
            return;
        }
        const noteReviewStore = this.noteReviewStore;
        const reviewCommitStore = this.reviewCommitStore;
        if (!noteReviewStore || !reviewCommitStore) {
            return;
        }
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

        const item = noteReviewStore.ensureTracked(
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

        bumpCurrentDeviceReviewCount(this);
        if (settings.burySiblingCardsByNoteReview) {
            await this.savePluginData({ domains: ["daily-state"] });
        } else {
            this.requestPluginDataSave({ domains: ["daily-state"] });
        }

        await noteReviewStore.save();
        await this.appendSyroNoteUpsert(noteReviewStore.getEntrySnapshot(note.path), "review");
        try {
            const timelineCommit = await autoCommitReviewResponseToTimeline({
                app: this.app,
                commitStore: reviewCommitStore,
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
        if (!this.guardSyroDataReady("note-review")) {
            return;
        }
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
        if (!this.guardSyroDataReady("note-review")) {
            return;
        }
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
        if (JSON.stringify(this.dataShell) === JSON.stringify(shell)) {
            return;
        }
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
        const trackingRulesState = extractTrackingRules(this.data.folderTrackingRules, {}, {});
        const dailyState = this.buildDailyStateSnapshot();
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
            this.sharedSettingsUpdatedAtByField = {
                ...sharedSettingsState.updatedAtByField,
            };
        } else if (this.sharedSettingsStore.lastLoadError) {
            return this.sharedSettingsStore.lastLoadError;
        } else {
            const nextState = extractSharedSettings(this.data.settings);
            this.persistedSharedSettingsState = nextState;
            this.sharedSettingsUpdatedAtByField = {};
            if (!this.syroReadOnlyReason) {
                await this.sharedSettingsStore.save(nextState);
            }
        }

        const trackingRulesState = await this.trackingRulesStore.load();
        if (trackingRulesState) {
            applyTrackingRules(this.data.folderTrackingRules, trackingRulesState);
            this.persistedTrackingRulesState = trackingRulesState;
            this.trackingRulesTombstones = { ...trackingRulesState.tombstones };
            this.trackingRulesUpdatedAtByFolderPath = Object.fromEntries(
                Object.entries(trackingRulesState.rules).map(([folderPath, entry]) => [
                    folderPath,
                    entry.updatedAt,
                ]),
            );
        } else if (this.trackingRulesStore.lastLoadError) {
            return this.trackingRulesStore.lastLoadError;
        } else {
            const nextState = extractTrackingRules(this.data.folderTrackingRules, {}, {});
            this.persistedTrackingRulesState = nextState;
            this.trackingRulesTombstones = {};
            this.trackingRulesUpdatedAtByFolderPath = {};
            if (!this.syroReadOnlyReason) {
                await this.trackingRulesStore.save(nextState);
            }
        }

        const dailyState = await this.dailyStateStore.load();
        if (dailyState) {
            applyDailyState(this.data, dailyState);
            this.currentDeviceReviewCount = normalizeDeviceReviewCount(
                dailyState.deviceReviewCount,
            );
            this.persistedDailyState = dailyState;
            this.dailyStateAppliedOpIds = { ...dailyState.appliedOpIds };
        } else if (this.dailyStateStore.lastLoadError) {
            return this.dailyStateStore.lastLoadError;
        } else {
            this.currentDeviceReviewCount = 0;
            const nextState = this.buildDailyStateSnapshot();
            this.persistedDailyState = nextState;
            this.dailyStateAppliedOpIds = {};
            if (!this.syroReadOnlyReason) {
                await this.dailyStateStore.save(nextState);
            }
        }
        await this.applyPendingDailyStateSection("load-plugin-data");

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
        this.resetBufferedStateRevisionTracking();
        return null;
    }

    async loadPluginData(): Promise<void> {
        this.resetSyroDataBackedRuntimeState();
        const loadedDataRaw = (await this.loadData()) as unknown;
        const legacyData = parseLegacyPluginData(loadedDataRaw);
        this.dataShell = legacyData;
        this.initializeRuntimePluginData(legacyData);
        this.clearSyroReadOnly();
        this.syroWorkspace = new SyroWorkspace(this.app, this.manifest.dir, this.data.settings, {
            logDebug: (...args: unknown[]) => this.logRuntimeDebug(...args),
        });
        const startup = await this.resolveSyroWorkspaceInitialization(
            await this.syroWorkspace.initialize(),
        );
        this.syroLayout = startup.layout;
        if (startup.readOnlyReason) {
            this.syroReadOnlyReason = startup.readOnlyReason;
        }
        if (!this.syroLayout) {
            this.remoteDeltaFingerprint = "";
            this.applySyroReadOnlyState();
            this.logRuntimeDebug("[SR-StartupGate] loadPluginData exited without syroLayout");
            return;
        }

        this.pendingOverlayStore = new PendingOverlayStore({
            adapter: this.app.vault.adapter,
            path: this.syroLayout.pendingOverlayPath,
            shouldLogDebug: () => this.shouldLogRuntimeDebug(),
            logDebug: (...args: unknown[]) => this.logRuntimeDebug(...args),
            logWarn: (...args: unknown[]) => console.warn(...args),
            notifyWriteFailure: () => new Notice(t("DATA_UNABLE_TO_SAVE")),
        });
        await this.pendingOverlayStore.ensureLoaded();
        this.initializeSplitStateStores();

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
        this.syroSessionManager = new SyroSessionManager(this.app, this.syroLayout, {
            logDebug: (...args: unknown[]) => this.logRuntimeDebug(...args),
        });
        this.applySyroReadOnlyState();
        await this.syroSessionManager.initialize();
        if (this.pendingDailyStateOverlayFormalization) {
            this.requestPluginDataSave(
                {
                    delayMs: 0,
                    domains: ["daily-state"],
                },
                {
                    markDirty: false,
                },
            );
        }
        this.applySyroReadOnlyState();
        await this.deckOptionsStore.loadIntoSettings(this.data.settings);
        this.store = new DataStore(this.data.settings, {
            cardsPath: this.syroLayout.cardsPath,
            pendingOverlayPath: this.syroLayout.pendingOverlayPath,
            pendingOverlayStore: this.pendingOverlayStore,
            auxiliaryDataDir: this.syroLayout.deviceRoot,
        });
        this.applySyroReadOnlyState();
        await this.store.load();
        this.reviewStateCommitCoordinator = new ReviewStateCommitCoordinator({
            getStore: () => this.store,
            appendCardSnapshot: (snapshot, opType) => this.appendSyroCardSnapshot(opType, snapshot),
            requestCardsSave: (delayMs = 1200) => this.requestCardsStoreSave(delayMs),
            flushCardsSave: (timeoutMs = 1500) => this.flushPendingCardsStoreSave(timeoutMs),
            shouldLogDebug: () => this.shouldLogRuntimeDebug(),
            logDebug: (...args: unknown[]) => this.logRuntimeDebug(...args),
        });
        this.restorePendingCardReviewCommits();
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
        const legacyMergeStateError = await this.absorbLegacySyroMergeStateIfNeeded();
        if (legacyMergeStateError) {
            this.enableSyroReadOnly(legacyMergeStateError);
        }
        await this.flushReviewPersistence(1200, { notify: false });
        await this.importPendingSyroSessions();
        this.reviewPersistenceCoordinator = new ReviewPersistenceCoordinator({
            shouldLogDebug: () => this.shouldLogRuntimeDebug(),
            logDebug: (...args: unknown[]) => this.logRuntimeDebug(...args),
        });
        this.easeByPath = new NoteEaseList(this.data.settings);
        this.linkRank = new LinkRank(this.data.settings, this.app.metadataCache);
        this.reviewDecks = this.noteReviewStore.buildReviewDecks(this.app.vault);
        this.updateAndSortDueNotes();
        await this.updateRemoteDeltaFingerprint();
        setDebugParser(this.data.settings.showParserDebugMessages);
    }

    async savePluginData(options: PluginDataPersistOptions = {}): Promise<void> {
        const requestedDomains = new Set(
            this.normalizeRequestedPluginDataDomains(options.domains),
        );
        this.ensureBufferedPluginStateMarkedDirtyForSave(options.domains);
        const bufferedRevisionSnapshot = this.getBufferedStateDirtyRevisionSnapshot();
        const persistSharedSettings = requestedDomains.has("shared-settings");
        const persistTrackingRules = requestedDomains.has("tracking-rules");
        const persistDailyState = requestedDomains.has("daily-state");
        const persistDeviceState = requestedDomains.has("device-state");
        const persistLicenseState = requestedDomains.has("license-state");
        const persistDeckOptions = requestedDomains.has("deck-options");

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

        const sharedSettingsState = persistSharedSettings
            ? extractSharedSettingsWithMetadata(
                  this.data.settings,
                  this.sharedSettingsUpdatedAtByField,
              )
            : null;
        const previousSharedSettingsState = persistSharedSettings
            ? (this.persistedSharedSettingsState ?? createDefaultSharedSettingsState())
            : null;
        const deviceState =
            persistDeviceState || this.syroReadOnlyReason
                ? extractDeviceState({
                      settings: this.data.settings,
                      historyDeck: this.data.historyDeck,
                  })
                : null;
        const licenseState =
            persistLicenseState || this.syroReadOnlyReason
                ? extractLicenseState(this.data.settings)
                : null;
        const previousTrackingRulesState = persistTrackingRules
            ? (this.persistedTrackingRulesState ?? createDefaultTrackingRulesState())
            : null;
        const trackingRulesState = persistTrackingRules
            ? extractTrackingRules(
                  this.data.folderTrackingRules,
                  this.trackingRulesUpdatedAtByFolderPath,
                  this.trackingRulesTombstones,
              )
            : null;
        const previousDailyState = persistDailyState
            ? (this.persistedDailyState ?? createDefaultDailyState())
            : null;
        const pendingDailyStateSection = persistDailyState
            ? ((await this.pendingOverlayStore?.getDailyStateSection()) ?? null)
            : null;
        if (pendingDailyStateSection) {
            this.pendingDailyStateCommitId = pendingDailyStateSection.commitId;
        }
        const dailyState = persistDailyState
            ? pendingDailyStateSection
                ? this.buildDailyStateSnapshotFromPendingSection(pendingDailyStateSection)
                : this.buildDailyStateSnapshotWithMetadata()
            : null;
        let dailyStateSessionCommitted = !persistDailyState;

        if (this.syroReadOnlyReason) {
            if (persistDeviceState && deviceState) {
                await this.deviceStateStore.save(deviceState);
                this.persistedDeviceState = deviceState;
            }
            if (persistLicenseState && licenseState) {
                await this.licenseStateStore.save(licenseState);
                this.persistedLicenseState = licenseState;
            }
            await this.saveDataShell();
            return;
        }

        const updatedAt = new Date().toISOString();
        if (persistSharedSettings && sharedSettingsState && previousSharedSettingsState) {
            const sharedSettingsDiff = diffSharedSettings(
                previousSharedSettingsState,
                sharedSettingsState,
            );
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
                    for (const field of Object.keys(sharedSettingsDiff.changed)) {
                        this.sharedSettingsUpdatedAtByField[field] = updatedAt;
                    }
                }
            }
        }

        if (persistTrackingRules && trackingRulesState && previousTrackingRulesState) {
            for (const upsert of Object.keys(trackingRulesState.rules)) {
                delete trackingRulesState.tombstones[upsert];
            }
            const trackingRulesDiff = diffTrackingRules(
                previousTrackingRulesState,
                trackingRulesState,
            );
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
                    this.trackingRulesUpdatedAtByFolderPath[upsert.folderPath] = updatedAt;
                    delete this.trackingRulesTombstones[upsert.folderPath];
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
                    delete this.trackingRulesUpdatedAtByFolderPath[removal.folderPath];
                    this.trackingRulesTombstones[removal.folderPath] = {
                        updatedAt,
                    };
                }
            }
        }

        if (persistDailyState && dailyState && previousDailyState) {
            const dailyStateOperations = diffDailyState(previousDailyState, dailyState);
            const dailyStateCommitKey =
                pendingDailyStateSection?.commitId ??
                this.pendingDailyStateCommitId ??
                updatedAt;
            if (dailyStateOperations.length === 0) {
                dailyStateSessionCommitted = true;
            }
            for (const [index, operation] of dailyStateOperations.entries()) {
                const targetUuid = `daily-op:${dailyStateCommitKey}:${index}:${operation.opType}`;
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
                if (!appended) {
                    this.logRuntimeDebug(
                        "[SR-PendingOverlay] section-retained-due-to-incomplete-commit",
                        {
                            section: "dailyState",
                            reason: "session-append-failed",
                            targetUuid,
                        },
                    );
                    throw new Error(
                        `[SR-PendingOverlay] Failed to append daily-state session record: ${targetUuid}`,
                    );
                }
            }
            if (dailyStateOperations.length > 0) {
                dailyStateSessionCommitted = true;
            }
        }

        if (persistDeckOptions) {
            const deckOptionsSnapshot = createDeckOptionsStoreSnapshot(
                this.data.settings,
                this.deckOptionsStore.getSyncEntities(),
            );
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
                    this.deckOptionsStore.markSyncEntity({
                        targetUuid: "deck-options:global",
                        updatedAt,
                        deleted: false,
                        entityType: "deck-options",
                        pathHint: this.syroLayout?.deckOptionsPath,
                    });
                }
            }
        }

        if (persistSharedSettings) {
            const finalSharedSettingsState = extractSharedSettingsWithMetadata(
                this.data.settings,
                this.sharedSettingsUpdatedAtByField,
            );
            await this.sharedSettingsStore.save(finalSharedSettingsState);
            this.persistedSharedSettingsState = finalSharedSettingsState;
            this.markBufferedPluginStatePersisted(
                ["shared-settings"],
                bufferedRevisionSnapshot,
            );
        }

        if (persistTrackingRules) {
            const finalTrackingRulesState = extractTrackingRules(
                this.data.folderTrackingRules,
                this.trackingRulesUpdatedAtByFolderPath,
                this.trackingRulesTombstones,
            );
            await this.trackingRulesStore.save(finalTrackingRulesState);
            this.persistedTrackingRulesState = finalTrackingRulesState;
            this.trackingRulesTombstones = { ...finalTrackingRulesState.tombstones };
            this.markBufferedPluginStatePersisted(
                ["tracking-rules"],
                bufferedRevisionSnapshot,
            );
        }

        if (persistDailyState) {
            const finalDailyState = pendingDailyStateSection
                ? this.buildDailyStateSnapshotFromPendingSection(pendingDailyStateSection)
                : this.buildDailyStateSnapshotWithMetadata();
            await this.dailyStateStore.save(finalDailyState);
            this.persistedDailyState = finalDailyState;
            if (dailyStateSessionCommitted && this.pendingOverlayStore) {
                this.pendingOverlayStore.clearDailyStateSection();
                this.pendingOverlayStore.requestFlush();
                await this.pendingOverlayStore.drainFlush();
            }
            if (dailyStateSessionCommitted) {
                this.pendingDailyStateCommitId = null;
            }
            this.pendingDailyStateOverlayFormalization = false;
            this.markBufferedPluginStatePersisted(["daily-state"], bufferedRevisionSnapshot);
        }

        if (persistDeviceState && deviceState) {
            await this.deviceStateStore.save(deviceState);
            this.persistedDeviceState = deviceState;
        }

        if (persistLicenseState && licenseState) {
            await this.licenseStateStore.save(licenseState);
            this.persistedLicenseState = licenseState;
        }

        if (persistDeckOptions) {
            const finalDeckOptionsSnapshot = createDeckOptionsStoreSnapshot(
                this.data.settings,
                this.deckOptionsStore.getSyncEntities(),
            );
            await this.deckOptionsStore.saveSerialized(finalDeckOptionsSnapshot.serialized);
        }

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
        this.ensureReviewQueueViewRegistered();

        if (
            this.data.settings.enableNoteReviewPaneOnStartup &&
            this.getActiveLeaf(REVIEW_QUEUE_VIEW_TYPE) == null &&
            this.guardSyroDataReady("review-queue", { notify: false })
        ) {
            await this.activateReviewQueueViewPanel();
        }
    }

    private async activateReviewQueueViewPanel() {
        if (!this.guardSyroDataReady("review-queue")) {
            return;
        }
        const store = this.store;
        if (!store) {
            return;
        }
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
                    store.performGlobalGarbageCollection().then(() => {
                        this.hasPerformedInitialGC = true;
                        this.getReviewQueueView()?.redraw();
                    }),
                    "review queue garbage collection",
                );
            }, 1000);
        }
    }

    private async openReviewQueueView() {
        this.ensureReviewQueueViewRegistered();
        if (!this.guardSyroDataReady("review-queue")) {
            return;
        }
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
        if (!this.guardSyroDataReady("flashcard-review")) {
            return;
        }
        this.logRuntimeDebug("[SR-InNoteReview] openFlashcardsInNoteReview:start", {
            mode: FlashcardReviewMode[reviewMode],
            filePath: file.path,
        });
        const syncResult = await this.requestSync({
            reviewMode,
            trigger: "review-entry",
        });
        if (syncResult.status === "skipped" && syncResult.reason === "not-ready") {
            return;
        }

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
        const store = this.store;
        if (!store) {
            throw new Error(`Single-note review store is not ready: ${notePath}`);
        }
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

            if (!store.getItembyID(card.Id)) {
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
