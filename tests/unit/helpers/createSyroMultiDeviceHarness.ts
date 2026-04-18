import { getAllTags, TFile, TFolder } from "obsidian";
import { FsrsAlgorithm } from "src/algorithms/fsrs";
import { DataStore, parseTrackedCardsStoreSnapshots } from "src/dataStore/data";
import { Iadapter } from "src/dataStore/adapter";
import { parsePendingOverlayFile, type PendingOverlayFile } from "src/dataStore/pendingOverlayStore";
import { Queue } from "src/dataStore/queue";
import { parseDailyState, type PersistedDailyState } from "src/dataStore/syroPluginDataStore";
import { SyroWorkspace } from "src/dataStore/syroWorkspace";
import { deckToUIState, findDeckByPath } from "src/ui/adapters/deckAdapter";
import SRPlugin from "src/main";
import { QuestionPostponementList } from "src/QuestionPostponementList";
import { RPITEMTYPE } from "src/dataStore/repetitionItem";
import { ReviewResponse, FlashcardReviewMode } from "src/scheduling";
import { DEFAULT_SETTINGS } from "src/settings";
import { WeightedMultiplierAlgorithm } from "src/algorithms/weightedMultiplier";
import { unitTest_GetAllTagsFromTextEx } from "./UnitTestHelper";

const MANIFEST_DIR = ".obsidian/plugins/syro";

type SharedFileSystem = {
    files: Map<string, string>;
    directories: Set<string>;
    mtimes: Map<string, number>;
    nextMtime: number;
};

type HarnessClient = {
    key: string;
    app: any;
    basePath: string;
    plugin: SRPlugin;
};

export interface HarnessDeckCounts {
    newCount: number;
    learningCount: number;
    dueCount: number;
}

export interface HarnessCardsStateEntry {
    key: string;
    path: string;
    uuid: string;
    aliases: string[];
    trackedFileUuid: string;
    trackedFileAliases: string[];
    queue: number;
    nextReview: number;
    learningStep: number | null;
    timesReviewed: number;
    timesCorrect: number;
    errorStreak: number;
    data: unknown;
}

export interface HarnessDailyStateSnapshot {
    buryDate: string;
    buryList: string[];
    dailyDeckStats: PersistedDailyState["dailyDeckStats"];
    appliedOpIds: string[];
    deviceReviewCount: number;
}

export interface HarnessDeviceFolderEntry {
    folderName: string;
    files: string[];
    folders: string[];
}

export interface HarnessSessionRecordDigest {
    sessionPath: string;
    sessionId: string;
    domain: string;
    entityType: string;
    opType: string;
    targetUuid: string;
    opId: string;
    updatedAt: string;
}

export interface HarnessCursorSnapshotDigest {
    updatedAt: string;
    cursors: Record<
        string,
        {
            offset: number;
            lastOpId: string | null;
            updatedAt: string;
        }
    >;
}

export interface HarnessStateDiagnostics {
    cardsByClient: Record<string, HarnessCardsStateEntry[]>;
    dailyByClient: Record<string, HarnessDailyStateSnapshot | null>;
    pendingOverlayByClient: Record<string, PendingOverlayFile | null>;
    deckCountsByClient: Record<string, Record<string, HarnessDeckCounts | null>>;
    sessionDigestsByDevice: Record<string, HarnessSessionRecordDigest[]>;
    cursorSnapshotsByDevice: Record<string, HarnessCursorSnapshotDigest | null>;
    deviceFolders: HarnessDeviceFolderEntry[];
}

export interface MultiDeviceHarness {
    seedVaultFile(path: string, content: string): Promise<void>;
    seedFlashcardNote(path: string, count: number, prefix?: string): Promise<void>;
    bootstrapDesktop(): Promise<HarnessClient>;
    bootstrapMobileFromDesktop(): Promise<HarnessClient>;
    bootstrapMobileIndependently(options?: {
        beforeMerge?: (client: HarnessClient) => Promise<void>;
    }): Promise<HarnessClient>;
    restartClient(clientKey: string): Promise<HarnessClient>;
    activateClient(clientKey: string): Promise<HarnessClient>;
    reviewCards(clientKey: string, notePath: string, count: number): Promise<number[]>;
    stagePendingOverlay(clientKey: string): Promise<void>;
    flushLocalPersistence(clientKey: string): Promise<boolean>;
    sync(clientKey: string, mode?: "incremental" | "full"): Promise<void>;
    readCardsFormalState(clientKey: string): HarnessCardsStateEntry[];
    readDailyStateFormal(clientKey: string): HarnessDailyStateSnapshot | null;
    readPendingOverlay(clientKey: string): PendingOverlayFile | null;
    readDeckCounts(clientKey: string, deckPaths: string[]): Record<string, HarnessDeckCounts | null>;
    readDeviceFolders(): HarnessDeviceFolderEntry[];
    readSessionDigests(): Record<string, HarnessSessionRecordDigest[]>;
    collectDiagnostics(clientKeys: string[], deckPaths: string[]): HarnessStateDiagnostics;
    getClient(clientKey: string): HarnessClient;
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/g, "");
}

function dirname(path: string): string {
    const normalized = normalizePath(path);
    const slashIndex = normalized.lastIndexOf("/");
    return slashIndex >= 0 ? normalized.slice(0, slashIndex) : "";
}

function basename(path: string): string {
    const normalized = normalizePath(path);
    const slashIndex = normalized.lastIndexOf("/");
    return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
}

function fileExtension(path: string): string {
    const name = basename(path);
    const dotIndex = name.lastIndexOf(".");
    return dotIndex >= 0 ? name.slice(dotIndex + 1) : "";
}

function fileBasename(path: string): string {
    const name = basename(path);
    const dotIndex = name.lastIndexOf(".");
    return dotIndex >= 0 ? name.slice(0, dotIndex) : name;
}

function createSharedFileSystem(): SharedFileSystem {
    return {
        files: new Map<string, string>(),
        directories: new Set<string>([".", ".obsidian", ".obsidian/plugins", MANIFEST_DIR]),
        mtimes: new Map<string, number>(),
        nextMtime: Date.now(),
    };
}

function bumpMtime(shared: SharedFileSystem): number {
    shared.nextMtime += 1;
    return shared.nextMtime;
}

function ensureParentDirectories(shared: SharedFileSystem, path: string): void {
    const normalized = normalizePath(path);
    const parts = normalized.split("/").filter((part) => part.length > 0);
    let current = "";
    for (let index = 0; index < Math.max(0, parts.length - 1); index++) {
        current = current ? `${current}/${parts[index]}` : parts[index];
        shared.directories.add(current);
    }
}

function writeSharedFile(shared: SharedFileSystem, path: string, value: string): void {
    const normalized = normalizePath(path);
    ensureParentDirectories(shared, normalized);
    shared.files.set(normalized, value);
    shared.mtimes.set(normalized, bumpMtime(shared));
}

function appendSharedFile(shared: SharedFileSystem, path: string, value: string): void {
    const normalized = normalizePath(path);
    ensureParentDirectories(shared, normalized);
    const previous = shared.files.get(normalized) ?? "";
    shared.files.set(normalized, `${previous}${value}`);
    shared.mtimes.set(normalized, bumpMtime(shared));
}

function removeSharedFile(shared: SharedFileSystem, path: string): void {
    const normalized = normalizePath(path);
    shared.files.delete(normalized);
    shared.mtimes.delete(normalized);
}

function removeSharedDirectory(shared: SharedFileSystem, path: string, recursive: boolean): void {
    const normalized = normalizePath(path);
    if (recursive) {
        for (const filePath of Array.from(shared.files.keys())) {
            if (filePath === normalized || filePath.startsWith(`${normalized}/`)) {
                shared.files.delete(filePath);
                shared.mtimes.delete(filePath);
            }
        }
        for (const dirPath of Array.from(shared.directories)) {
            if (dirPath === normalized || dirPath.startsWith(`${normalized}/`)) {
                shared.directories.delete(dirPath);
            }
        }
        return;
    }

    const hasChildren = Array.from(shared.files.keys()).some((filePath) =>
        filePath.startsWith(`${normalized}/`),
    );
    const hasNestedDirectories = Array.from(shared.directories).some(
        (dirPath) => dirPath !== normalized && dirPath.startsWith(`${normalized}/`),
    );
    if (hasChildren || hasNestedDirectories) {
        throw new Error(`Directory is not empty: ${normalized}`);
    }
    shared.directories.delete(normalized);
}

function moveSharedPath(shared: SharedFileSystem, fromPath: string, toPath: string): void {
    const normalizedFrom = normalizePath(fromPath);
    const normalizedTo = normalizePath(toPath);
    ensureParentDirectories(shared, normalizedTo);

    if (shared.files.has(normalizedFrom)) {
        const value = shared.files.get(normalizedFrom) ?? "";
        shared.files.delete(normalizedFrom);
        shared.mtimes.delete(normalizedFrom);
        shared.files.set(normalizedTo, value);
        shared.mtimes.set(normalizedTo, bumpMtime(shared));
        return;
    }

    const nestedDirectories = Array.from(shared.directories)
        .filter((dirPath) => dirPath === normalizedFrom || dirPath.startsWith(`${normalizedFrom}/`))
        .sort((left, right) => left.length - right.length);
    const nestedFiles = Array.from(shared.files.entries()).filter(
        ([filePath]) => filePath === normalizedFrom || filePath.startsWith(`${normalizedFrom}/`),
    );

    for (const dirPath of nestedDirectories) {
        shared.directories.delete(dirPath);
    }
    for (const [filePath] of nestedFiles) {
        shared.files.delete(filePath);
        shared.mtimes.delete(filePath);
    }

    for (const dirPath of nestedDirectories) {
        shared.directories.add(normalizedTo + dirPath.slice(normalizedFrom.length));
    }
    for (const [filePath, value] of nestedFiles) {
        const nextPath = normalizedTo + filePath.slice(normalizedFrom.length);
        shared.files.set(nextPath, value);
        shared.mtimes.set(nextPath, bumpMtime(shared));
    }
}

function copySharedFiles(
    source: SharedFileSystem,
    target: SharedFileSystem,
    shouldCopy: (path: string) => boolean,
): void {
    for (const directory of source.directories) {
        if (!shouldCopy(directory)) {
            continue;
        }
        ensureParentDirectories(target, `${directory}/child`);
        target.directories.add(directory);
    }

    for (const [path, value] of source.files.entries()) {
        if (!shouldCopy(path)) {
            continue;
        }
        writeSharedFile(target, path, value);
    }
}

function listSharedDirectory(
    shared: SharedFileSystem,
    path: string,
): { files: string[]; folders: string[] } {
    const normalized = normalizePath(path);
    const prefix = normalized ? `${normalized}/` : "";
    const files: string[] = [];
    const folders = new Set<string>();

    for (const directory of shared.directories) {
        if (!directory.startsWith(prefix) || directory === normalized) {
            continue;
        }
        const rest = directory.slice(prefix.length);
        if (rest.length === 0 || rest.includes("/")) {
            continue;
        }
        folders.add(directory);
    }

    for (const filePath of shared.files.keys()) {
        if (!filePath.startsWith(prefix)) {
            continue;
        }
        const rest = filePath.slice(prefix.length);
        if (rest.length === 0 || rest.includes("/")) {
            continue;
        }
        files.push(filePath);
    }

    return {
        files: files.sort((left, right) => left.localeCompare(right)),
        folders: Array.from(folders).sort((left, right) => left.localeCompare(right)),
    };
}

function createAdapter(shared: SharedFileSystem, basePath: string): any {
    return {
        basePath,
        append: jest.fn(async (path: string, value: string) => {
            appendSharedFile(shared, path, value);
        }),
        exists: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            return shared.files.has(normalized) || shared.directories.has(normalized);
        }),
        list: jest.fn(async (path: string) => listSharedDirectory(shared, path)),
        mkdir: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            ensureParentDirectories(shared, `${normalized}/child`);
            shared.directories.add(normalized);
        }),
        read: jest.fn(async (path: string) => shared.files.get(normalizePath(path)) ?? ""),
        remove: jest.fn(async (path: string) => {
            removeSharedFile(shared, path);
        }),
        rename: jest.fn(async (fromPath: string, toPath: string) => {
            moveSharedPath(shared, fromPath, toPath);
        }),
        rmdir: jest.fn(async (path: string, recursive: boolean) => {
            removeSharedDirectory(shared, path, recursive);
        }),
        stat: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            if (!shared.files.has(normalized)) {
                return null;
            }
            const content = shared.files.get(normalized) ?? "";
            return {
                mtime: shared.mtimes.get(normalized) ?? 0,
                size: content.length,
            };
        }),
        write: jest.fn(async (path: string, value: string) => {
            writeSharedFile(shared, path, value);
        }),
    };
}

function buildHeadingCache(text: string): Array<{
    heading: string;
    level: number;
    position: { start: { line: number; col: number; offset: null } };
}> {
    const headings: Array<{
        heading: string;
        level: number;
        position: { start: { line: number; col: number; offset: null } };
    }> = [];
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
        const match = /^(#{1,6})\s+(.*)$/.exec(line);
        if (!match) {
            continue;
        }
        headings.push({
            heading: match[2].trim(),
            level: match[1].length,
            position: {
                start: {
                    line: index,
                    col: 0,
                    offset: null,
                },
            },
        });
    }
    return headings;
}

function buildFrontmatter(text: string): Record<string, unknown> | null {
    if (!text.startsWith("---\n")) {
        return null;
    }
    const endIndex = text.indexOf("\n---", 4);
    if (endIndex < 0) {
        return null;
    }

    const frontmatterText = text.slice(4, endIndex);
    const result: Record<string, unknown> = {};
    const lines = frontmatterText.split(/\r?\n/);
    let currentArrayKey: string | null = null;
    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line.trim()) {
            continue;
        }
        if (currentArrayKey && /^\s*-\s+/.test(rawLine)) {
            const value = rawLine.replace(/^\s*-\s+/, "").trim();
            const current = Array.isArray(result[currentArrayKey]) ? result[currentArrayKey] : [];
            result[currentArrayKey] = [...(current as string[]), value];
            continue;
        }
        currentArrayKey = null;
        const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        if (!match) {
            continue;
        }
        const [, key, rawValue] = match;
        if (!rawValue) {
            currentArrayKey = key;
            result[key] = [];
            continue;
        }
        result[key] = rawValue;
    }
    return Object.keys(result).length > 0 ? result : null;
}

function buildFileCache(text: string): Record<string, unknown> {
    return {
        tags: unitTest_GetAllTagsFromTextEx(text),
        headings: buildHeadingCache(text),
        frontmatter: buildFrontmatter(text),
    };
}

function createTFile(shared: SharedFileSystem, path: string): TFile {
    const normalized = normalizePath(path);
    return Object.assign(new TFile(), {
        path: normalized,
        name: basename(normalized),
        basename: fileBasename(normalized),
        extension: fileExtension(normalized),
        stat: {
            mtime: shared.mtimes.get(normalized) ?? 0,
        },
    });
}

function createTFolder(shared: SharedFileSystem, path: string): TFolder {
    const normalized = normalizePath(path);
    const children = listSharedDirectory(shared, normalized);
    return Object.assign(new TFolder(), {
        path: normalized,
        name: basename(normalized),
        children: [
            ...children.folders.map((folderPath) => createTFolder(shared, folderPath)),
            ...children.files.map((filePath) => createTFile(shared, filePath)),
        ],
    });
}

function createApp(shared: SharedFileSystem, basePath: string): any {
    const adapter = createAdapter(shared, basePath);
    const metadataCache = {
        getFileCache: jest.fn((file: TFile) => {
            const text = shared.files.get(normalizePath(file.path)) ?? "";
            return buildFileCache(text);
        }),
        on: jest.fn(),
        off: jest.fn(),
        resolvedLinks: {},
        unresolvedLinks: {},
    };
    const vault = {
        adapter,
        cachedRead: jest.fn(async (file: TFile) => shared.files.get(normalizePath(file.path)) ?? ""),
        create: jest.fn(async (path: string, content: string) => {
            writeSharedFile(shared, path, content);
            return createTFile(shared, path);
        }),
        getAbstractFileByPath: jest.fn((path: string) => {
            const normalized = normalizePath(path);
            if (shared.files.has(normalized)) {
                return createTFile(shared, normalized);
            }
            if (shared.directories.has(normalized)) {
                return createTFolder(shared, normalized);
            }
            return null;
        }),
        getMarkdownFiles: jest.fn(() =>
            Array.from(shared.files.keys())
                .filter(
                    (path) =>
                        path.toLowerCase().endsWith(".md") && !path.startsWith(".obsidian/"),
                )
                .sort((left, right) => left.localeCompare(right))
                .map((path) => createTFile(shared, path)),
        ),
        getName: jest.fn(() => "SyroVault"),
        modify: jest.fn(async (file: TFile, content: string) => {
            writeSharedFile(shared, file.path, content);
        }),
        on: jest.fn(),
        off: jest.fn(),
        read: jest.fn(async (file: TFile) => shared.files.get(normalizePath(file.path)) ?? ""),
        trash: jest.fn(async (file: TFile) => {
            removeSharedFile(shared, file.path);
        }),
    };

    return {
        commands: {
            executeCommand: jest.fn(),
            executeCommandById: jest.fn(),
        },
        fileManager: {
            processFrontMatter: jest.fn(async (_file: TFile, fn: (frontmatter: any) => void) => {
                const frontmatter = {};
                fn(frontmatter);
            }),
            promptForFileRename: jest.fn(),
        },
        metadataCache,
        vault,
        workspace: {
            detachLeavesOfType: jest.fn(),
            getActiveFile: jest.fn(() => null),
            getActiveViewOfType: jest.fn(() => null),
            getLeaf: jest.fn(() => ({ openFile: jest.fn(), view: null })),
            getLeavesOfType: jest.fn(() => []),
            on: jest.fn(),
            off: jest.fn(),
            onLayoutReady: jest.fn((callback: () => void) => callback()),
            openPopoutLeaf: jest.fn(() => ({ openFile: jest.fn(), view: null })),
            trigger: jest.fn(),
        },
    };
}

function installTagMock(): void {
    if (typeof getAllTags === "function" && jest.isMockFunction(getAllTags)) {
        getAllTags.mockImplementation((fileCache: Record<string, unknown>) => {
            const tags = Array.isArray(fileCache?.tags) ? fileCache.tags : [];
            return tags
                .map((tag) => (typeof tag?.tag === "string" ? tag.tag : null))
                .filter((tag): tag is string => typeof tag === "string");
        });
    }
}

function createPluginDataShellStore(): {
    load: () => Promise<unknown>;
    save: (value: unknown) => Promise<void>;
} {
    let value: unknown = null;
    return {
        load: async () => (value == null ? value : JSON.parse(JSON.stringify(value))),
        save: async (nextValue: unknown) => {
            value = nextValue == null ? nextValue : JSON.parse(JSON.stringify(nextValue));
        },
    };
}

function getCurrentDeviceFolderName(plugin: SRPlugin): string {
    const layout = (plugin as any).syroLayout;
    return basename(layout.deviceRoot);
}

function getLayout(plugin: SRPlugin): any {
    return (plugin as any).syroLayout;
}

function noteDeckPath(notePath: string): string {
    return normalizePath(notePath).replace(/\.md$/i, "");
}

function normalizeDailyState(raw: string | null | undefined): HarnessDailyStateSnapshot | null {
    if (!raw) {
        return null;
    }
    const parsed = parseDailyState(JSON.parse(raw));
    if (!parsed) {
        return null;
    }
    return {
        buryDate: parsed.buryDate,
        buryList: [...parsed.buryList].sort((left, right) => left.localeCompare(right)),
        dailyDeckStats: JSON.parse(JSON.stringify(parsed.dailyDeckStats)),
        appliedOpIds: Object.keys(parsed.appliedOpIds ?? {}).sort((left, right) =>
            left.localeCompare(right),
        ),
        deviceReviewCount: parsed.deviceReviewCount ?? 0,
    };
}

function normalizeCardsState(raw: string | null | undefined): HarnessCardsStateEntry[] {
    if (!raw) {
        return [];
    }
    const parsed = parseTrackedCardsStoreSnapshots(raw);
    if (!parsed) {
        return [];
    }
    return parsed.cards
        .map((snapshot) => ({
            key: [
                snapshot.path,
                snapshot.trackedItem?.fingerprint ?? "",
                String(snapshot.trackedItem?.lineNo ?? -1),
                snapshot.trackedItem?.clozeId ?? "",
            ].join("::"),
            path: snapshot.path,
            uuid: snapshot.item.uuid,
            aliases: [...(snapshot.item.aliases ?? [])].sort((left, right) =>
                left.localeCompare(right),
            ),
            trackedFileUuid: snapshot.trackedFileUuid,
            trackedFileAliases: [...(snapshot.trackedFileAliases ?? [])].sort((left, right) =>
                left.localeCompare(right),
            ),
            queue: snapshot.item.queue,
            nextReview: snapshot.item.nextReview,
            learningStep: snapshot.item.learningStep ?? null,
            timesReviewed: snapshot.item.timesReviewed,
            timesCorrect: snapshot.item.timesCorrect,
            errorStreak: snapshot.item.errorStreak,
            data: JSON.parse(JSON.stringify(snapshot.item.data ?? null)),
        }))
        .sort((left, right) => left.key.localeCompare(right.key));
}

function parsePendingOverlay(raw: string | null | undefined): PendingOverlayFile | null {
    if (!raw) {
        return null;
    }
    return parsePendingOverlayFile(raw);
}

function collectSessionDigests(shared: SharedFileSystem): Record<string, HarnessSessionRecordDigest[]> {
    const result: Record<string, HarnessSessionRecordDigest[]> = {};
    for (const [path, raw] of shared.files.entries()) {
        if (!path.startsWith(".obsidian/plugins/syro/sessions/") || !path.endsWith(".session.jsonl")) {
            continue;
        }
        const sessionPath = path.replace(".obsidian/plugins/syro/sessions/", "");
        const deviceFolderName = sessionPath.split("/")[0] ?? "";
        const records = raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => {
                try {
                    return JSON.parse(line) as Record<string, any>;
                } catch {
                    return null;
                }
            })
            .filter((line): line is Record<string, any> => !!line)
            .filter((line) => line.lineType === "event" && line.record)
            .map((line) => ({
                sessionPath,
                sessionId: String(line.record.sessionId),
                domain: String(line.record.domain),
                entityType: String(line.record.entityType),
                opType: String(line.record.opType),
                targetUuid: String(line.record.targetUuid),
                opId: String(line.record.opId),
                updatedAt: String(line.record.updatedAt),
            }));
        result[deviceFolderName] = records;
    }
    return result;
}

function collectLatestCursorSnapshots(
    shared: SharedFileSystem,
): Record<string, HarnessCursorSnapshotDigest | null> {
    const result: Record<string, HarnessCursorSnapshotDigest | null> = {};
    for (const [path, raw] of shared.files.entries()) {
        if (!path.startsWith(".obsidian/plugins/syro/sessions/") || !path.endsWith(".session.jsonl")) {
            continue;
        }
        const sessionPath = path.replace(".obsidian/plugins/syro/sessions/", "");
        const deviceFolderName = sessionPath.split("/")[0] ?? "";
        const snapshots = raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => {
                try {
                    return JSON.parse(line) as Record<string, any>;
                } catch {
                    return null;
                }
            })
            .filter((line): line is Record<string, any> => !!line)
            .filter((line) => line.lineType === "cursor-snapshot")
            .map((line) => ({
                updatedAt: String(line.updatedAt),
                cursors: Object.fromEntries(
                    Object.entries(line.cursors ?? {}).map(([cursorSessionPath, value]) => [
                        cursorSessionPath,
                        {
                            offset: Number((value as Record<string, any>).offset ?? 0),
                            lastOpId:
                                typeof (value as Record<string, any>).lastOpId === "string"
                                    ? String((value as Record<string, any>).lastOpId)
                                    : null,
                            updatedAt: String((value as Record<string, any>).updatedAt ?? ""),
                        },
                    ]),
                ),
            }));
        for (const snapshot of snapshots) {
            const current = result[deviceFolderName];
            if (!current || current.updatedAt.localeCompare(snapshot.updatedAt) < 0) {
                result[deviceFolderName] = snapshot;
            }
        }
        result[deviceFolderName] ??= null;
    }
    return result;
}

async function initializePluginRuntime(plugin: SRPlugin): Promise<void> {
    plugin.cardAlgorithm = new FsrsAlgorithm();
    plugin.cardAlgorithm.updateSettings(plugin.data.settings.fsrsSettings);
    plugin.noteAlgorithm = new WeightedMultiplierAlgorithm();
    plugin.noteAlgorithm.updateSettings(plugin.data.settings.weightedMultiplierSettings);
    (plugin as any).questionPostponementList = new QuestionPostponementList(
        plugin,
        plugin.data.settings,
        plugin.data.buryList,
    );
    plugin.reviewFloatBar = {
        cardtotalCB: () => 0,
        close: jest.fn(),
        isDisplay: jest.fn(() => false),
        notetotalCB: () => 0,
        openNextCardCB: null,
    } as any;
    plugin.updateStatusBar = jest.fn();
    (plugin as any).shouldShowSyncProgressTip = jest.fn(() => false);
    (plugin as any).consumePendingReviewSessionReloadAfterSync = jest.fn(async () => undefined);
    (plugin as any).logRuntimeDebug = jest.fn();
    (plugin as any).shouldLogRuntimeDebug = jest.fn(() => false);
    plugin.data.settings.showSchedulingDebugMessages = false;
    plugin.data.settings.showRuntimeDebugMessages = process.env.SYRO_TEST_DEBUG === "1";
    plugin.data.settings.showStatusBar = false;
    await (plugin as any).initializeSyroDataBackedRuntimeIfReady("startup");
}

async function createPluginClient(
    shared: SharedFileSystem,
    pluginDataStore: { load: () => Promise<unknown>; save: (value: unknown) => Promise<void> },
    key: string,
    basePath: string,
): Promise<HarnessClient> {
    installTagMock();
    const app = createApp(shared, basePath);
    const manifest = {
        author: "test",
        authorUrl: "",
        description: "test manifest",
        dir: MANIFEST_DIR,
        id: "syro",
        isDesktopOnly: false,
        minAppVersion: "1.0.0",
        name: "Syro",
        version: "0.0.test",
    } as any;
    const plugin = new SRPlugin(app, manifest);
    (SRPlugin as any)._instance = plugin;
    Object.assign(plugin as any, {
        addCommand: jest.fn(),
        addRibbonIcon: jest.fn(),
        addSettingTab: jest.fn(),
        app,
        loadData: jest.fn(async () => pluginDataStore.load()),
        manifest,
        registerDomEvent: jest.fn(),
        registerEditorExtension: jest.fn(),
        registerEvent: jest.fn(),
        registerExtensions: jest.fn(),
        registerInterval: jest.fn(),
        registerMarkdownCodeBlockProcessor: jest.fn(),
        registerMarkdownPostProcessor: jest.fn(),
        registerView: jest.fn(),
        saveData: jest.fn(async (value: unknown) => pluginDataStore.save(value)),
    });
    Iadapter.create(app);
    await plugin.loadPluginData();
    await initializePluginRuntime(plugin);
    return {
        key,
        app,
        basePath,
        plugin,
    };
}

export function createSyroMultiDeviceHarness(): MultiDeviceHarness {
    const shared = createSharedFileSystem();
    const pluginDataStore = createPluginDataShellStore();
    const clients = new Map<string, HarnessClient>();

    async function reviewCardsOnClient(
        client: HarnessClient,
        notePath: string,
        count: number,
    ): Promise<number[]> {
        (SRPlugin as any)._instance = client.plugin;
        Iadapter.create(client.app);
        if (!client.plugin.store || !client.plugin.reviewStateCommitCoordinator) {
            throw new Error(`Client ${client.key} is not ready for review.`);
        }

        const store = client.plugin.store;
        const cardIds = store
            .getItemsOfFile(notePath)
            .filter((item) => item.itemType === RPITEMTYPE.CARD)
            .slice(0, count)
            .map((item) => item.ID);

        for (const itemId of cardIds) {
            const item = store.getItembyID(itemId);
            if (!item) {
                throw new Error(`Missing item ${itemId} for ${notePath}`);
            }
            const wasNew = item.isNew;
            store.reviewId(itemId, ReviewResponse.Good, client.plugin.data.settings.fsrsSettings);
            client.plugin.reviewStateCommitCoordinator.queueCardCommit(itemId, "review");
            client.plugin.incrementDailyCounts(noteDeckPath(notePath), wasNew);
        }

        return cardIds;
    }

    async function activateClient(clientKey: string): Promise<HarnessClient> {
        const client = clients.get(clientKey);
        if (!client) {
            throw new Error(`Unknown client: ${clientKey}`);
        }
        (SRPlugin as any)._instance = client.plugin;
        Iadapter.create(client.app);
        if (client.plugin.store) {
            (DataStore as any).instance = client.plugin.store;
            (Queue as any).instance = client.plugin.store.data.queues;
        }
        return client;
    }

    async function bootstrapDesktop(): Promise<HarnessClient> {
        const client = await createPluginClient(
            shared,
            pluginDataStore,
            "desktop",
            "C:/Vaults/Syro/Desktop",
        );
        clients.set("desktop", client);
        await activateClient("desktop");
        await client.plugin.requestSync({
            reviewMode: FlashcardReviewMode.Review,
            mode: "full",
            trigger: "manual",
        });
        return client;
    }

    async function bootstrapMobileFromDesktop(): Promise<HarnessClient> {
        const desktop = clients.get("desktop");
        if (!desktop) {
            throw new Error("Desktop client must be bootstrapped first.");
        }
        const mobileApp = createApp(shared, "C:/Vaults/Syro/Mobile");
        const workspace = new SyroWorkspace(mobileApp, MANIFEST_DIR, DEFAULT_SETTINGS);
        await workspace.initialize();
        await workspace.completeBaselineJoin({
            deviceName: "Mobile",
            sourceDeviceId: getLayout(desktop.plugin).device.deviceId,
        });

        const client = await createPluginClient(
            shared,
            pluginDataStore,
            "mobile",
            "C:/Vaults/Syro/Mobile",
        );
        clients.set("mobile", client);
        await activateClient("mobile");
        await client.plugin.requestSync({
            reviewMode: FlashcardReviewMode.Review,
            mode: "full",
            trigger: "manual",
        });
        return client;
    }

    async function bootstrapMobileIndependently(options?: {
        beforeMerge?: (client: HarnessClient) => Promise<void>;
    }): Promise<HarnessClient> {
        const isolatedShared = createSharedFileSystem();
        copySharedFiles(
            shared,
            isolatedShared,
            (path) =>
                !path.startsWith(".obsidian/plugins/syro/devices/") &&
                !path.startsWith(".obsidian/plugins/syro/sessions/"),
        );
        const isolatedPluginDataStore = createPluginDataShellStore();
        const isolatedMobile = await createPluginClient(
            isolatedShared,
            isolatedPluginDataStore,
            "mobile-isolated",
            "C:/Vaults/Syro/Mobile",
        );
        await isolatedMobile.plugin.requestSync({
            reviewMode: FlashcardReviewMode.Review,
            mode: "full",
            trigger: "manual",
        });
        if (options?.beforeMerge) {
            await options.beforeMerge(isolatedMobile);
        }

        const isolatedLayout = getLayout(isolatedMobile.plugin);
        const isolatedDeviceFolderName = basename(isolatedLayout.deviceRoot);
        copySharedFiles(
            isolatedShared,
            shared,
            (path) =>
                path === `.obsidian/plugins/syro/devices/${isolatedDeviceFolderName}` ||
                path.startsWith(`.obsidian/plugins/syro/devices/${isolatedDeviceFolderName}/`) ||
                path === `.obsidian/plugins/syro/sessions/${isolatedDeviceFolderName}` ||
                path.startsWith(`.obsidian/plugins/syro/sessions/${isolatedDeviceFolderName}/`),
        );

        const client = await createPluginClient(
            shared,
            pluginDataStore,
            "mobile",
            "C:/Vaults/Syro/Mobile",
        );
        clients.set("mobile", client);
        await activateClient("mobile");
        return client;
    }

    async function restartClient(clientKey: string): Promise<HarnessClient> {
        const existing = clients.get(clientKey);
        if (!existing) {
            throw new Error(`Unknown client: ${clientKey}`);
        }
        const restarted = await createPluginClient(
            shared,
            pluginDataStore,
            clientKey,
            existing.basePath,
        );
        clients.set(clientKey, restarted);
        return restarted;
    }

    const readCardsFormalState = (clientKey: string): HarnessCardsStateEntry[] => {
        const client = clients.get(clientKey);
        if (!client) {
            throw new Error(`Unknown client: ${clientKey}`);
        }
        const layout = getLayout(client.plugin);
        return normalizeCardsState(shared.files.get(normalizePath(layout.cardsPath)));
    };

    const readDailyStateFormal = (clientKey: string): HarnessDailyStateSnapshot | null => {
        const client = clients.get(clientKey);
        if (!client) {
            throw new Error(`Unknown client: ${clientKey}`);
        }
        const layout = getLayout(client.plugin);
        return normalizeDailyState(shared.files.get(normalizePath(layout.dailyStatePath)));
    };

    const readPendingOverlay = (clientKey: string): PendingOverlayFile | null => {
        const client = clients.get(clientKey);
        if (!client) {
            throw new Error(`Unknown client: ${clientKey}`);
        }
        const layout = getLayout(client.plugin);
        return parsePendingOverlay(shared.files.get(normalizePath(layout.pendingOverlayPath)));
    };

    const readDeckCounts = (
        clientKey: string,
        deckPaths: string[],
    ): Record<string, HarnessDeckCounts | null> => {
        const client = clients.get(clientKey);
        if (!client) {
            throw new Error(`Unknown client: ${clientKey}`);
        }
        const result: Record<string, HarnessDeckCounts | null> = {};
        for (const deckPath of deckPaths) {
            const deck = findDeckByPath(client.plugin.remainingDeckTree, deckPath);
            if (!deck) {
                result[deckPath] = null;
                continue;
            }
            const state = deckToUIState(deck, client.plugin);
            result[deckPath] = {
                newCount: state.newCount,
                learningCount: state.learningCount,
                dueCount: state.dueCount,
            };
        }
        return result;
    };

    const readDeviceFolders = (): HarnessDeviceFolderEntry[] =>
        listSharedDirectory(shared, ".obsidian/plugins/syro/devices").folders.map((folderPath) => {
            const listing = listSharedDirectory(shared, folderPath);
            return {
                folderName: basename(folderPath),
                files: listing.files.map((filePath) => basename(filePath)),
                folders: listing.folders.map((nestedPath) => basename(nestedPath)),
            };
        });

    const readSessionDigests = (): Record<string, HarnessSessionRecordDigest[]> =>
        collectSessionDigests(shared);

    const collectDiagnostics = (
        clientKeys: string[],
        deckPaths: string[],
    ): HarnessStateDiagnostics => ({
        cardsByClient: Object.fromEntries(
            clientKeys.map((clientKey) => [clientKey, readCardsFormalState(clientKey)]),
        ),
        dailyByClient: Object.fromEntries(
            clientKeys.map((clientKey) => [clientKey, readDailyStateFormal(clientKey)]),
        ),
        pendingOverlayByClient: Object.fromEntries(
            clientKeys.map((clientKey) => [clientKey, readPendingOverlay(clientKey)]),
        ),
        deckCountsByClient: Object.fromEntries(
            clientKeys.map((clientKey) => [clientKey, readDeckCounts(clientKey, deckPaths)]),
        ),
        sessionDigestsByDevice: readSessionDigests(),
        cursorSnapshotsByDevice: collectLatestCursorSnapshots(shared),
        deviceFolders: readDeviceFolders(),
    });

    return {
        async seedVaultFile(path: string, content: string): Promise<void> {
            writeSharedFile(shared, path, content);
        },

        async seedFlashcardNote(path: string, count: number, prefix = "Card"): Promise<void> {
            const lines = ["#flashcards", ""];
            for (let index = 1; index <= count; index++) {
                lines.push(`${prefix} ${index} question::${prefix} ${index} answer`);
            }
            writeSharedFile(shared, path, `${lines.join("\n")}\n`);
        },

        bootstrapDesktop,

        bootstrapMobileFromDesktop,

        bootstrapMobileIndependently,

        restartClient,

        activateClient,

        async reviewCards(clientKey: string, notePath: string, count: number): Promise<number[]> {
            const client = await activateClient(clientKey);
            return reviewCardsOnClient(client, notePath, count);
        },

        async stagePendingOverlay(clientKey: string): Promise<void> {
            const client = await activateClient(clientKey);
            await client.plugin.store?.drainReviewOverlayFlush();
            await (client.plugin as any).pendingOverlayStore?.drainFlush();
        },

        async flushLocalPersistence(clientKey: string): Promise<boolean> {
            const client = await activateClient(clientKey);
            return client.plugin.flushReviewPersistence(2500, { notify: false });
        },

        async sync(clientKey: string, mode: "incremental" | "full" = "incremental"): Promise<void> {
            const client = await activateClient(clientKey);
            await client.plugin.requestSync({
                reviewMode: FlashcardReviewMode.Review,
                mode,
                trigger: "manual",
            });
        },

        readCardsFormalState,

        readDailyStateFormal,

        readPendingOverlay,

        readDeckCounts,

        readDeviceFolders,

        readSessionDigests,

        collectDiagnostics,

        getClient(clientKey: string): HarnessClient {
            const client = clients.get(clientKey);
            if (!client) {
                throw new Error(`Unknown client: ${clientKey}`);
            }
            return client;
        },
    };
}
