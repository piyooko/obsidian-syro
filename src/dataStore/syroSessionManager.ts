import { App, DataAdapter } from "obsidian";
import type { DeckOptionsStoreFile } from "./deckOptionsStore";
import {
    classifySyroSessionRecordImpact,
    createEmptySyroSessionReplaySummary,
    mergeSyroSessionReplaySummary,
    type SyroPendingSessionImpact,
    type SyroSessionReplaySummary,
} from "./syroSessionImpact";
import type { SyroDeviceMetadata, SyroPersistenceLayout } from "./syroWorkspace";
import {
    buildCurrentDeviceSessionFilePath,
    formatLocalSessionDateKey,
    parseDeviceMetadata,
} from "./syroWorkspace";
import {
    getNumberProp,
    getStringProp,
    isRecord,
    parseJsonUnknown,
} from "src/util/typeGuards";

const SYRO_SESSION_RECORD_VERSION = 1;
const SYRO_SESSION_LINE_VERSION = 1;
const STALE_SESSION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type SessionAdapter = Pick<
    DataAdapter,
    "append" | "exists" | "list" | "mkdir" | "read" | "remove" | "write"
> & {
    rmdir?: (path: string, recursive: boolean) => Promise<void>;
};

export type SyroSessionDomain =
    | "cards"
    | "notes"
    | "timeline"
    | "deck-options"
    | "settings"
    | "tracking-rules"
    | "daily-state";

export interface SyroSessionRecord {
    version: number;
    sessionId: string;
    opId: string;
    deviceId: string;
    deviceName: string;
    domain: SyroSessionDomain;
    entityType: string;
    opType: string;
    targetUuid: string;
    createdAt: string;
    updatedAt: string;
    payload: unknown;
    pathHint?: string;
}

export interface SyroSessionEventLine {
    version: number;
    lineType: "event";
    record: SyroSessionRecord;
}

export interface SyroSessionCursorState {
    offset: number;
    lastOpId: string | null;
    updatedAt: string;
}

export interface SyroSessionCursorSnapshotLine {
    version: number;
    lineType: "cursor-snapshot";
    deviceId: string;
    deviceName: string;
    updatedAt: string;
    cursors: Record<string, SyroSessionCursorState>;
}

export type SyroSessionLine = SyroSessionEventLine | SyroSessionCursorSnapshotLine;

export type SyroSessionSealReason =
    | "manual"
    | "background"
    | "startup"
    | "unload"
    | "idle-timeout"
    | "record-limit";

type SessionFileInfo = {
    sessionId: string;
    sessionPath: string;
    filePath: string;
    dateKey: string;
    sourceDeviceFolderName: string;
};

type SessionFileDelta = SessionFileInfo & {
    records: SyroSessionRecord[];
    impact: SyroPendingSessionImpact | null;
    nextCursor: SyroSessionCursorState;
    cursorAdvanced: boolean;
};

type SyroDeviceEntry = {
    deviceFolderName: string;
    metaPath: string;
    metadata: SyroDeviceMetadata;
};

export interface SyroSessionImportResult {
    importedSessionIds: string[];
    deletedSessionIds: string[];
    archivedSessionIds: string[];
    replayImpact: SyroSessionReplaySummary;
}

export interface SyroPendingSessionScanResult {
    pendingSessionIds: string[];
    impact: SyroPendingSessionImpact | null;
}

export interface SyroDeviceSessionSummary {
    deviceFolderName: string;
    latestSessionAt: string | null;
    lastPulledIntoCurrentAt: string | null;
    hasPendingRemoteChanges: boolean;
}

type SyroSessionManagerOptions = {
    logDebug?: (...args: unknown[]) => void;
};

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function trimTrailingSlash(path: string): string {
    return normalizePath(path).replace(/\/+$/g, "");
}

function joinPath(...segments: string[]): string {
    if (segments.length === 0) {
        return "";
    }

    const normalizedSegments = segments
        .filter((segment) => segment.length > 0)
        .map((segment, index) => {
            const normalized = normalizePath(segment);
            if (index === 0) {
                return normalized.replace(/\/+$/g, "");
            }
            return normalized.replace(/^\/+/g, "").replace(/\/+$/g, "");
        })
        .filter((segment) => segment.length > 0);

    return normalizedSegments.join("/");
}

function dirname(path: string): string {
    const normalized = trimTrailingSlash(path);
    const slashIndex = normalized.lastIndexOf("/");
    return slashIndex >= 0 ? normalized.substring(0, slashIndex) : "";
}

async function ensureDirectory(adapter: SessionAdapter, targetDir: string): Promise<void> {
    const normalizedDir = trimTrailingSlash(targetDir);
    if (!normalizedDir || normalizedDir === ".") {
        return;
    }

    const parts = normalizedDir.split("/").filter((part) => part.length > 0);
    let current = normalizedDir.startsWith("/") ? "/" : "";
    for (const part of parts) {
        current = current === "/" ? `${current}${part}` : current ? `${current}/${part}` : part;
        if (await adapter.exists(current)) {
            continue;
        }
        await adapter.mkdir(current);
    }
}

function createUniqueId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `syro-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSessionFilePath(path: string): boolean {
    return normalizePath(path).toLowerCase().endsWith(".session.jsonl");
}

function getRelativeSessionPath(sessionsRoot: string, filePath: string): string {
    const normalizedRoot = trimTrailingSlash(sessionsRoot);
    const normalizedFile = normalizePath(filePath);
    const prefix = normalizedRoot ? `${normalizedRoot}/` : "";
    if (normalizedFile.startsWith(prefix)) {
        return normalizedFile.slice(prefix.length);
    }
    return normalizedFile;
}

function getSessionIdFromRelativePath(sessionPath: string): string {
    return normalizePath(sessionPath).replace(/\.session\.jsonl$/i, "");
}

function getSessionDateKey(sessionPath: string): string {
    const normalized = normalizePath(sessionPath);
    const fileName = normalized.slice(normalized.lastIndexOf("/") + 1);
    return fileName.replace(/\.session\.jsonl$/i, "");
}

function getSourceDeviceFolderName(sessionPath: string): string {
    return normalizePath(sessionPath).split("/")[0] ?? "";
}

function getLastCompleteOffset(raw: string): number {
    const lastNewlineIndex = raw.lastIndexOf("\n");
    return lastNewlineIndex >= 0 ? lastNewlineIndex + 1 : 0;
}

function isIsoTimeNewer(candidate: string, baseline: string | null): boolean {
    if (!baseline) {
        return true;
    }

    const candidateMs = Date.parse(candidate);
    const baselineMs = Date.parse(baseline);
    if (!Number.isFinite(candidateMs)) {
        return false;
    }
    if (!Number.isFinite(baselineMs)) {
        return true;
    }

    return candidateMs > baselineMs;
}

function pickLatestIsoTime(left: string | null, right: string | null): string | null {
    if (!left) {
        return right;
    }
    if (!right) {
        return left;
    }
    return isIsoTimeNewer(left, right) ? left : right;
}

function parseSessionRecord(value: unknown): SyroSessionRecord | null {
    if (!isRecord(value)) {
        return null;
    }

    const version = getNumberProp(value, "version");
    const sessionId = getStringProp(value, "sessionId")?.trim();
    const opId = getStringProp(value, "opId")?.trim();
    const deviceId = getStringProp(value, "deviceId")?.trim();
    const deviceName = getStringProp(value, "deviceName")?.trim();
    const domain = getStringProp(value, "domain")?.trim() as SyroSessionDomain | undefined;
    const entityType = getStringProp(value, "entityType")?.trim();
    const opType = getStringProp(value, "opType")?.trim();
    const targetUuid = getStringProp(value, "targetUuid")?.trim();
    const createdAt = getStringProp(value, "createdAt")?.trim();
    const updatedAt = getStringProp(value, "updatedAt")?.trim();
    const pathHint = getStringProp(value, "pathHint")?.trim();

    if (
        version !== SYRO_SESSION_RECORD_VERSION ||
        !sessionId ||
        !opId ||
        !deviceId ||
        !deviceName ||
        !domain ||
        !entityType ||
        !opType ||
        !targetUuid ||
        !createdAt ||
        !updatedAt
    ) {
        return null;
    }

    return {
        version,
        sessionId,
        opId,
        deviceId,
        deviceName,
        domain,
        entityType,
        opType,
        targetUuid,
        createdAt,
        updatedAt,
        payload: value["payload"],
        ...(pathHint ? { pathHint } : {}),
    };
}

function parseCursorStateMap(value: unknown): Record<string, SyroSessionCursorState> | null {
    if (!isRecord(value)) {
        return null;
    }

    const result: Record<string, SyroSessionCursorState> = {};
    for (const [sessionPath, rawEntry] of Object.entries(value)) {
        if (!sessionPath || !isRecord(rawEntry)) {
            continue;
        }

        const offset = getNumberProp(rawEntry, "offset");
        const lastOpId = getStringProp(rawEntry, "lastOpId");
        const updatedAt = getStringProp(rawEntry, "updatedAt")?.trim();
        if (
            typeof offset !== "number" ||
            !Number.isFinite(offset) ||
            offset < 0 ||
            !updatedAt
        ) {
            continue;
        }

        result[normalizePath(sessionPath)] = {
            offset: Math.trunc(offset),
            lastOpId: lastOpId?.trim() || null,
            updatedAt,
        };
    }

    return result;
}

function parseSessionLine(rawLine: string): SyroSessionLine | null {
    let parsed: unknown;
    try {
        parsed = parseJsonUnknown(rawLine);
    } catch {
        return null;
    }

    const legacyRecord = parseSessionRecord(parsed);
    if (legacyRecord) {
        return {
            version: SYRO_SESSION_LINE_VERSION,
            lineType: "event",
            record: legacyRecord,
        };
    }

    if (!isRecord(parsed)) {
        return null;
    }

    const version = getNumberProp(parsed, "version");
    const lineType = getStringProp(parsed, "lineType")?.trim();
    if (version !== SYRO_SESSION_LINE_VERSION || !lineType) {
        return null;
    }

    if (lineType === "event") {
        const record = parseSessionRecord(parsed["record"]);
        return record
            ? {
                  version,
                  lineType: "event",
                  record,
              }
            : null;
    }

    if (lineType === "cursor-snapshot") {
        const deviceId = getStringProp(parsed, "deviceId")?.trim();
        const deviceName = getStringProp(parsed, "deviceName")?.trim();
        const updatedAt = getStringProp(parsed, "updatedAt")?.trim();
        const cursors = parseCursorStateMap(parsed["cursors"]);
        if (!deviceId || !deviceName || !updatedAt || !cursors) {
            return null;
        }

        return {
            version,
            lineType: "cursor-snapshot",
            deviceId,
            deviceName,
            updatedAt,
            cursors,
        };
    }

    return null;
}

function buildEventLine(record: SyroSessionRecord): SyroSessionEventLine {
    return {
        version: SYRO_SESSION_LINE_VERSION,
        lineType: "event",
        record,
    };
}

function buildCursorSnapshotLine(
    layout: SyroPersistenceLayout,
    cursors: Map<string, SyroSessionCursorState>,
): SyroSessionCursorSnapshotLine {
    const sortedEntries = Array.from(cursors.entries()).sort(([left], [right]) =>
        left.localeCompare(right),
    );
    return {
        version: SYRO_SESSION_LINE_VERSION,
        lineType: "cursor-snapshot",
        deviceId: layout.device.deviceId,
        deviceName: layout.device.deviceName,
        updatedAt: new Date().toISOString(),
        cursors: Object.fromEntries(
            sortedEntries.map(([sessionPath, cursor]) => [sessionPath, { ...cursor }]),
        ),
    };
}

export class SyroSessionManager {
    private readonly adapter: SessionAdapter;
    private syncReadOnlyReason: string | null = null;
    private readonly sessionCursors = new Map<string, SyroSessionCursorState>();
    private hasCurrentDeviceCursorSnapshot = false;

    constructor(
        private readonly app: App,
        private readonly layout: SyroPersistenceLayout,
        private readonly options: SyroSessionManagerOptions = {},
    ) {
        this.adapter = this.app.vault.adapter as SessionAdapter;
    }

    async initialize(): Promise<void> {
        await ensureDirectory(this.adapter, this.layout.currentDeviceSessionsRoot);
        await this.restoreCurrentDeviceCursorSnapshot();
    }

    hasRestoredCurrentDeviceCursorSnapshot(): boolean {
        return this.hasCurrentDeviceCursorSnapshot;
    }

    setReadOnly(reason: string | null): void {
        this.syncReadOnlyReason = reason;
    }

    async summarizeDeviceSessions(): Promise<SyroDeviceSessionSummary[]> {
        const validDevices = await this.listValidDeviceEntries();
        const summaries = new Map<string, SyroDeviceSessionSummary>(
            validDevices.map((entry) => [
                entry.deviceFolderName,
                {
                    deviceFolderName: entry.deviceFolderName,
                    latestSessionAt: null,
                    lastPulledIntoCurrentAt: null,
                    hasPendingRemoteChanges: false,
                },
            ]),
        );
        const currentDeviceFolderName = this.getCurrentDeviceFolderName();
        const latestCurrentSnapshot = await this.loadLatestCursorSnapshot(currentDeviceFolderName);
        const currentCursors = latestCurrentSnapshot?.cursors ?? {};
        const sessionFiles = await this.listAllSessionFiles();

        for (const fileInfo of sessionFiles) {
            const summary =
                summaries.get(fileInfo.sourceDeviceFolderName) ??
                {
                    deviceFolderName: fileInfo.sourceDeviceFolderName,
                    latestSessionAt: null,
                    lastPulledIntoCurrentAt: null,
                    hasPendingRemoteChanges: false,
                };
            const meta = await this.inspectSessionFile(fileInfo.filePath);
            summary.latestSessionAt = pickLatestIsoTime(summary.latestSessionAt, meta.latestUpdatedAt);

            if (fileInfo.sourceDeviceFolderName !== currentDeviceFolderName) {
                const cursor = currentCursors[fileInfo.sessionPath];
                if (!cursor || cursor.offset < meta.completeLength) {
                    summary.hasPendingRemoteChanges = true;
                }
            }

            summaries.set(fileInfo.sourceDeviceFolderName, summary);
        }

        for (const [sessionPath, cursor] of Object.entries(currentCursors)) {
            const sourceDeviceFolderName = getSourceDeviceFolderName(sessionPath);
            if (!sourceDeviceFolderName || sourceDeviceFolderName === currentDeviceFolderName) {
                continue;
            }

            const summary =
                summaries.get(sourceDeviceFolderName) ??
                {
                    deviceFolderName: sourceDeviceFolderName,
                    latestSessionAt: null,
                    lastPulledIntoCurrentAt: null,
                    hasPendingRemoteChanges: false,
                };
            summary.lastPulledIntoCurrentAt = pickLatestIsoTime(
                summary.lastPulledIntoCurrentAt,
                cursor.updatedAt,
            );
            summaries.set(sourceDeviceFolderName, summary);
        }

        return Array.from(summaries.values()).sort((left, right) =>
            left.deviceFolderName.localeCompare(right.deviceFolderName),
        );
    }

    async resetCurrentDeviceSessionsToRemoteEof(): Promise<void> {
        if (this.syncReadOnlyReason) {
            return;
        }

        await this.clearCurrentDeviceSessionFiles();
        this.sessionCursors.clear();

        const remoteSessionFiles = await this.listRemoteSessionFiles();
        const updatedAt = new Date().toISOString();
        const alignedSessionPaths: string[] = [];

        for (const fileInfo of remoteSessionFiles) {
            const meta = await this.inspectSessionFile(fileInfo.filePath);
            this.sessionCursors.set(fileInfo.sessionPath, {
                offset: meta.completeLength,
                lastOpId: meta.lastOpId,
                updatedAt,
            });
            alignedSessionPaths.push(fileInfo.sessionPath);
        }

        this.logDebug("[SR-SyroSession] aligned all remote sessions to EOF", {
            alignedSessionPaths,
        });
        await this.appendCurrentCursorSnapshot();
    }

    async alignRemoteDeviceSessionsToEof(deviceFolderName: string): Promise<void> {
        if (this.syncReadOnlyReason) {
            return;
        }

        const preservedEntries = Array.from(this.sessionCursors.entries()).filter(
            ([sessionPath]) => getSourceDeviceFolderName(sessionPath) !== deviceFolderName,
        );

        await this.clearCurrentDeviceSessionFiles();
        this.sessionCursors.clear();

        for (const [sessionPath, cursor] of preservedEntries) {
            this.sessionCursors.set(sessionPath, cursor);
        }

        const remoteSessionFiles = await this.listRemoteSessionFiles();
        const updatedAt = new Date().toISOString();
        const alignedSessionPaths: string[] = [];

        for (const fileInfo of remoteSessionFiles) {
            if (fileInfo.sourceDeviceFolderName !== deviceFolderName) {
                continue;
            }

            const meta = await this.inspectSessionFile(fileInfo.filePath);
            this.sessionCursors.set(fileInfo.sessionPath, {
                offset: meta.completeLength,
                lastOpId: meta.lastOpId,
                updatedAt,
            });
            alignedSessionPaths.push(fileInfo.sessionPath);
        }

        this.logDebug("[SR-SyroSession] aligned remote source sessions to EOF after overwrite", {
            deviceFolderName,
            alignedSessionPaths,
            preservedSessionPaths: preservedEntries.map(([sessionPath]) => sessionPath),
        });
        await this.appendCurrentCursorSnapshot();
    }

    async pruneRemoteDeviceCursorState(deviceFolderName: string): Promise<void> {
        if (this.syncReadOnlyReason) {
            return;
        }

        let changed = false;
        for (const sessionPath of Array.from(this.sessionCursors.keys())) {
            if (getSourceDeviceFolderName(sessionPath) !== deviceFolderName) {
                continue;
            }

            this.sessionCursors.delete(sessionPath);
            changed = true;
        }

        if (changed) {
            await this.appendCurrentCursorSnapshot();
        }
    }

    async appendDeckOptionsChange(
        state: DeckOptionsStoreFile,
        updatedAt?: string,
    ): Promise<boolean> {
        return this.appendRecord({
            domain: "deck-options",
            entityType: "deck-options",
            opType: "replace",
            targetUuid: "deck-options:global",
            payload: state,
            pathHint: this.layout.deckOptionsPath,
            ...(updatedAt ? { updatedAt } : {}),
        });
    }

    async appendRecord(
        input: Omit<
            SyroSessionRecord,
            "version" | "sessionId" | "opId" | "deviceId" | "deviceName" | "createdAt" | "updatedAt"
        > & {
            createdAt?: string;
            updatedAt?: string;
        },
    ): Promise<boolean> {
        if (this.syncReadOnlyReason) {
            return false;
        }

        const sessionFilePath = await this.ensureCurrentSessionFilePath();
        const sessionPath = getRelativeSessionPath(this.layout.sessionsRoot, sessionFilePath);
        const now = new Date().toISOString();
        const record: SyroSessionRecord = {
            version: SYRO_SESSION_RECORD_VERSION,
            sessionId: getSessionIdFromRelativePath(sessionPath),
            opId: createUniqueId(),
            deviceId: this.layout.device.deviceId,
            deviceName: this.layout.device.deviceName,
            domain: input.domain,
            entityType: input.entityType,
            opType: input.opType,
            targetUuid: input.targetUuid,
            createdAt: input.createdAt ?? now,
            updatedAt: input.updatedAt ?? now,
            payload: input.payload,
            ...(input.pathHint ? { pathHint: input.pathHint } : {}),
        };

        await this.appendText(sessionFilePath, `${JSON.stringify(buildEventLine(record))}\n`);
        return true;
    }

    async flushActiveSession(_reason: SyroSessionSealReason = "manual"): Promise<string | null> {
        if (this.syncReadOnlyReason) {
            return null;
        }

        const sessionFilePath = await this.ensureCurrentSessionFilePath();
        if (!(await this.adapter.exists(sessionFilePath))) {
            return null;
        }

        return getSessionIdFromRelativePath(
            getRelativeSessionPath(this.layout.sessionsRoot, sessionFilePath),
        );
    }

    async importPendingSessions(
        replaySession: (
            sessionId: string,
            records: SyroSessionRecord[],
        ) => Promise<SyroSessionReplaySummary | void>,
        _options: {
            sealOwnOpenSession?: boolean;
        } = {},
    ): Promise<SyroSessionImportResult> {
        if (this.syncReadOnlyReason) {
            return {
                importedSessionIds: [],
                deletedSessionIds: [],
                archivedSessionIds: [],
                replayImpact: createEmptySyroSessionReplaySummary(),
            };
        }

        const deltas = await this.scanPendingSessionFiles();
        const importedSessionIds: string[] = [];
        let replayImpact = createEmptySyroSessionReplaySummary();
        let cursorSnapshotChanged = false;

        try {
            for (const delta of deltas) {
                if (!delta.cursorAdvanced) {
                    continue;
                }

                if (delta.records.length > 0) {
                    const sessionReplayImpact = await replaySession(delta.sessionId, delta.records);
                    if (sessionReplayImpact) {
                        replayImpact = mergeSyroSessionReplaySummary(
                            replayImpact,
                            sessionReplayImpact,
                        );
                    }
                }

                this.sessionCursors.set(delta.sessionPath, delta.nextCursor);
                importedSessionIds.push(delta.sessionId);
                cursorSnapshotChanged = true;
            }
        } finally {
            if (cursorSnapshotChanged) {
                await this.appendCurrentCursorSnapshot();
            }
        }

        const cleanup = await this.cleanupSessions();
        return {
            importedSessionIds,
            deletedSessionIds: cleanup.deletedSessionIds,
            archivedSessionIds: [],
            replayImpact,
        };
    }

    async peekPendingSessions(): Promise<SyroPendingSessionScanResult> {
        if (this.syncReadOnlyReason) {
            return {
                pendingSessionIds: [],
                impact: null,
            };
        }

        const deltas = await this.scanPendingSessionFiles();
        const pendingSessionIds: string[] = [];
        let impact: SyroPendingSessionImpact | null = null;

        for (const delta of deltas) {
            if (!delta.cursorAdvanced) {
                continue;
            }

            pendingSessionIds.push(delta.sessionId);
            if (delta.impact === "requires-global-sync") {
                impact = "requires-global-sync";
                break;
            }

            if (delta.records.length > 0) {
                impact ??= "runtime-only";
            }
        }

        return {
            pendingSessionIds,
            impact,
        };
    }

    private async ensureCurrentSessionFilePath(date: Date = new Date()): Promise<string> {
        const currentDeviceFolderName = this.getCurrentDeviceFolderName();
        const sessionFilePath = buildCurrentDeviceSessionFilePath(
            this.layout.sessionsRoot,
            currentDeviceFolderName,
            date,
        );
        this.layout.currentDeviceSessionFilePath = sessionFilePath;
        await ensureDirectory(this.adapter, dirname(sessionFilePath));
        return sessionFilePath;
    }

    private getCurrentDeviceFolderName(): string {
        const normalized = trimTrailingSlash(this.layout.currentDeviceSessionsRoot);
        return normalized.slice(normalized.lastIndexOf("/") + 1) || normalized;
    }

    private logDebug(...args: unknown[]): void {
        this.options.logDebug?.(...args);
    }

    private async appendText(path: string, value: string): Promise<void> {
        await ensureDirectory(this.adapter, dirname(path));
        if (await this.adapter.exists(path)) {
            await this.adapter.append(path, value);
            return;
        }

        await this.adapter.write(path, value);
    }

    private async appendCurrentCursorSnapshot(): Promise<void> {
        const sessionFilePath = await this.ensureCurrentSessionFilePath();
        const line = buildCursorSnapshotLine(this.layout, this.sessionCursors);
        await this.appendText(sessionFilePath, `${JSON.stringify(line)}\n`);
        this.hasCurrentDeviceCursorSnapshot = true;
    }

    private async restoreCurrentDeviceCursorSnapshot(): Promise<void> {
        this.sessionCursors.clear();
        this.hasCurrentDeviceCursorSnapshot = false;
        const latestSnapshot = await this.loadLatestCursorSnapshot(this.getCurrentDeviceFolderName());
        if (!latestSnapshot) {
            return;
        }

        for (const [sessionPath, cursor] of Object.entries(latestSnapshot.cursors)) {
            this.sessionCursors.set(sessionPath, cursor);
        }
        this.hasCurrentDeviceCursorSnapshot = true;
    }

    private async clearCurrentDeviceSessionFiles(): Promise<void> {
        const listing = await this.safeList(this.layout.currentDeviceSessionsRoot);
        for (const filePath of listing.files) {
            await this.adapter.remove(normalizePath(filePath));
        }

        for (const folderPath of listing.folders) {
            await this.clearSessionDirectoryRecursive(normalizePath(folderPath));
        }
    }

    private async clearSessionDirectoryRecursive(path: string): Promise<void> {
        const listing = await this.safeList(path);
        for (const filePath of listing.files) {
            await this.adapter.remove(normalizePath(filePath));
        }
        for (const folderPath of listing.folders) {
            await this.clearSessionDirectoryRecursive(normalizePath(folderPath));
        }
        await this.adapter.rmdir?.(path, false);
    }

    private async inspectSessionFile(filePath: string): Promise<{
        completeLength: number;
        lastOpId: string | null;
        latestUpdatedAt: string | null;
    }> {
        const raw = await this.adapter.read(filePath);
        const completeLength = getLastCompleteOffset(raw);
        if (completeLength <= 0) {
            return {
                completeLength: 0,
                lastOpId: null,
                latestUpdatedAt: null,
            };
        }

        let lastOpId: string | null = null;
        let latestUpdatedAt: string | null = null;
        const completeText = raw.slice(0, completeLength);

        for (const { rawLine } of this.iterateCompleteLines(completeText, 0)) {
            if (rawLine.trim().length === 0) {
                continue;
            }

            const parsedLine = parseSessionLine(rawLine);
            if (!parsedLine) {
                continue;
            }

            if (parsedLine.lineType === "event") {
                lastOpId = parsedLine.record.opId;
                latestUpdatedAt = pickLatestIsoTime(
                    latestUpdatedAt,
                    parsedLine.record.updatedAt,
                );
                continue;
            }

            latestUpdatedAt = pickLatestIsoTime(latestUpdatedAt, parsedLine.updatedAt);
        }

        return {
            completeLength,
            lastOpId,
            latestUpdatedAt,
        };
    }

    private async scanPendingSessionFiles(): Promise<SessionFileDelta[]> {
        const sessionFiles = await this.listRemoteSessionFiles();
        const deltas: SessionFileDelta[] = [];

        for (const fileInfo of sessionFiles) {
            const delta = await this.scanSessionFile(fileInfo);
            if (delta) {
                deltas.push(delta);
            }
        }

        return deltas;
    }

    private async scanSessionFile(fileInfo: SessionFileInfo): Promise<SessionFileDelta | null> {
        const raw = await this.adapter.read(fileInfo.filePath);
        const completeOffset = getLastCompleteOffset(raw);
        if (completeOffset <= 0) {
            return null;
        }

        const completeText = raw.slice(0, completeOffset);
        const currentCursor = this.sessionCursors.get(fileInfo.sessionPath) ?? null;
        const resumeOffset = this.resolveResumeOffset(completeText, currentCursor);
        if (resumeOffset >= completeText.length) {
            return null;
        }

        const records: SyroSessionRecord[] = [];
        let impact: SyroPendingSessionImpact | null = null;
        let lastProcessedOffset = resumeOffset;
        let lastOpId =
            resumeOffset > 0
                ? this.getPreviousEventOpIdAtOffset(completeText, resumeOffset)
                : null;

        for (const { rawLine, endOffset } of this.iterateCompleteLines(completeText, resumeOffset)) {
            lastProcessedOffset = endOffset;
            if (rawLine.trim().length === 0) {
                continue;
            }

            const parsedLine = parseSessionLine(rawLine);
            if (!parsedLine) {
                console.warn("[SR-Syro] Ignored malformed session line.", {
                    sessionPath: fileInfo.sessionPath,
                });
                continue;
            }

            if (parsedLine.lineType === "cursor-snapshot") {
                continue;
            }

            records.push(parsedLine.record);
            lastOpId = parsedLine.record.opId;
            const nextImpact = classifySyroSessionRecordImpact(parsedLine.record);
            if (nextImpact === "requires-global-sync") {
                impact = "requires-global-sync";
            } else {
                impact ??= "runtime-only";
            }
        }

        const cursorAdvanced =
            !currentCursor ||
            currentCursor.offset !== lastProcessedOffset ||
            currentCursor.lastOpId !== lastOpId;
        if (!cursorAdvanced) {
            return null;
        }

        return {
            ...fileInfo,
            records,
            impact,
            nextCursor: {
                offset: lastProcessedOffset,
                lastOpId,
                updatedAt: new Date().toISOString(),
            },
            cursorAdvanced,
        };
    }

    private resolveResumeOffset(
        completeText: string,
        currentCursor: SyroSessionCursorState | null,
    ): number {
        if (!currentCursor) {
            return 0;
        }

        if (currentCursor.offset === 0) {
            return 0;
        }

        const offset = Math.min(Math.max(currentCursor.offset, 0), completeText.length);
        if (
            currentCursor.lastOpId &&
            this.isLineBoundary(completeText, offset) &&
            this.getPreviousEventOpIdAtOffset(completeText, offset) === currentCursor.lastOpId
        ) {
            return offset;
        }

        if (!currentCursor.lastOpId) {
            if (!this.isLineBoundary(completeText, offset)) {
                this.logDebug("[SR-Syro] stale-cursor-reset", {
                    offset,
                    reason: "mid-line-without-last-opid",
                });
            }
            return 0;
        }

        const recoveredOffset = this.findEventEndOffsetByOpId(
            completeText,
            currentCursor.lastOpId,
        );
        if (recoveredOffset !== null) {
            this.logDebug("[SR-Syro] stale-cursor-recovered-by-opid", {
                offset,
                recoveredOffset,
                lastOpId: currentCursor.lastOpId,
            });
            return recoveredOffset;
        }

        this.logDebug("[SR-Syro] stale-cursor-recovered-from-zero", {
            offset,
            lastOpId: currentCursor.lastOpId,
        });
        return 0;
    }

    private isLineBoundary(completeText: string, offset: number): boolean {
        if (offset <= 0 || offset >= completeText.length) {
            return true;
        }

        return completeText[offset - 1] === "\n";
    }

    private getPreviousEventOpIdAtOffset(
        completeText: string,
        offset: number,
    ): string | null {
        let lastOpId: string | null = null;
        for (const { rawLine, endOffset } of this.iterateCompleteLines(completeText, 0)) {
            if (endOffset > offset) {
                break;
            }
            const parsedLine = parseSessionLine(rawLine);
            if (parsedLine?.lineType === "event") {
                lastOpId = parsedLine.record.opId;
            }
        }

        return lastOpId;
    }

    private findEventEndOffsetByOpId(completeText: string, opId: string): number | null {
        let lastMatchedOffset: number | null = null;
        for (const { rawLine, endOffset } of this.iterateCompleteLines(completeText, 0)) {
            const parsedLine = parseSessionLine(rawLine);
            if (parsedLine?.lineType === "event" && parsedLine.record.opId === opId) {
                lastMatchedOffset = endOffset;
            }
        }

        return lastMatchedOffset;
    }

    private *iterateCompleteLines(
        completeText: string,
        startOffset = 0,
    ): Generator<{ rawLine: string; endOffset: number }, void, undefined> {
        let cursor = Math.max(0, startOffset);
        while (cursor < completeText.length) {
            const newlineIndex = completeText.indexOf("\n", cursor);
            if (newlineIndex < 0) {
                return;
            }

            const rawLine = completeText.slice(cursor, newlineIndex).replace(/\r$/u, "");
            cursor = newlineIndex + 1;
            yield {
                rawLine,
                endOffset: cursor,
            };
        }
    }

    private async listRemoteSessionFiles(): Promise<SessionFileInfo[]> {
        const currentDeviceFolderName = this.getCurrentDeviceFolderName();
        const allSessionFiles = await this.listAllSessionFiles();
        return allSessionFiles.filter(
            (entry) => entry.sourceDeviceFolderName !== currentDeviceFolderName,
        );
    }

    private async listAllSessionFiles(): Promise<SessionFileInfo[]> {
        const listing = await this.safeList(this.layout.sessionsRoot);
        const sessionFiles: SessionFileInfo[] = [];

        for (const folderPath of listing.folders.sort((left, right) => left.localeCompare(right))) {
            const folderListing = await this.safeList(folderPath);
            for (const filePath of folderListing.files) {
                const normalizedPath = normalizePath(filePath);
                if (!isSessionFilePath(normalizedPath)) {
                    continue;
                }

                const sessionPath = getRelativeSessionPath(this.layout.sessionsRoot, normalizedPath);
                sessionFiles.push({
                    sessionId: getSessionIdFromRelativePath(sessionPath),
                    sessionPath,
                    filePath: normalizedPath,
                    dateKey: getSessionDateKey(sessionPath),
                    sourceDeviceFolderName: getSourceDeviceFolderName(sessionPath),
                });
            }
        }

        return sessionFiles.sort((left, right) => left.sessionPath.localeCompare(right.sessionPath));
    }

    private async safeList(root: string): Promise<{ files: string[]; folders: string[] }> {
        try {
            const listing = await this.adapter.list(trimTrailingSlash(root));
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

    private async loadLatestCursorSnapshot(
        deviceFolderName: string,
    ): Promise<SyroSessionCursorSnapshotLine | null> {
        const deviceSessionsRoot = joinPath(this.layout.sessionsRoot, deviceFolderName);
        const listing = await this.safeList(deviceSessionsRoot);
        let latestSnapshot: SyroSessionCursorSnapshotLine | null = null;

        for (const filePath of listing.files.sort((left, right) => left.localeCompare(right))) {
            const normalizedPath = normalizePath(filePath);
            if (!isSessionFilePath(normalizedPath)) {
                continue;
            }

            const raw = await this.adapter.read(normalizedPath);
            const completeText = raw.slice(0, getLastCompleteOffset(raw));
            for (const { rawLine } of this.iterateCompleteLines(completeText, 0)) {
                const parsedLine = parseSessionLine(rawLine);
                if (
                    parsedLine?.lineType === "cursor-snapshot" &&
                    isIsoTimeNewer(parsedLine.updatedAt, latestSnapshot?.updatedAt ?? null)
                ) {
                    latestSnapshot = parsedLine;
                }
            }
        }

        return latestSnapshot;
    }

    private async loadLatestCursorMapsByDevice(): Promise<
        Map<string, Map<string, SyroSessionCursorState>>
    > {
        const listing = await this.safeList(this.layout.sessionsRoot);
        const result = new Map<string, Map<string, SyroSessionCursorState>>();

        for (const folderPath of listing.folders) {
            const normalizedFolderPath = trimTrailingSlash(folderPath);
            const deviceFolderName =
                normalizedFolderPath.slice(normalizedFolderPath.lastIndexOf("/") + 1) ||
                normalizedFolderPath;
            const latestSnapshot = await this.loadLatestCursorSnapshot(deviceFolderName);
            result.set(
                deviceFolderName,
                new Map(
                    Object.entries(latestSnapshot?.cursors ?? {}).map(([sessionPath, cursor]) => [
                        normalizePath(sessionPath),
                        cursor,
                    ]),
                ),
            );
        }

        return result;
    }

    private async listValidDeviceEntries(): Promise<SyroDeviceEntry[]> {
        const listing = await this.safeList(this.layout.devicesRoot);
        const devices: SyroDeviceEntry[] = [];

        for (const deviceFolderPath of listing.folders) {
            const normalizedFolderPath = trimTrailingSlash(deviceFolderPath);
            const deviceFolderName =
                normalizedFolderPath.slice(normalizedFolderPath.lastIndexOf("/") + 1) ||
                normalizedFolderPath;
            const metaPath = joinPath(normalizedFolderPath, "device.json");
            if (!(await this.adapter.exists(metaPath))) {
                continue;
            }

            try {
                const raw = await this.adapter.read(metaPath);
                const parsed = parseDeviceMetadata(parseJsonUnknown(raw));
                if (!parsed) {
                    continue;
                }

                devices.push({
                    deviceFolderName,
                    metaPath,
                    metadata: parsed,
                });
            } catch {
                continue;
            }
        }

        if (!devices.some((entry) => entry.metadata.deviceId === this.layout.device.deviceId)) {
            devices.push({
                deviceFolderName: this.getCurrentDeviceFolderName(),
                metaPath: this.layout.deviceMetaPath,
                metadata: this.layout.device,
            });
        }

        return devices.sort((left, right) =>
            left.deviceFolderName.localeCompare(right.deviceFolderName),
        );
    }

    private async cleanupSessions(): Promise<{
        deletedSessionIds: string[];
    }> {
        if (this.syncReadOnlyReason) {
            return { deletedSessionIds: [] };
        }

        const sessionFiles = await this.listAllSessionFiles();
        if (sessionFiles.length === 0) {
            return { deletedSessionIds: [] };
        }

        const validDevices = await this.listValidDeviceEntries();
        if (validDevices.length === 0) {
            return { deletedSessionIds: [] };
        }

        const cursorMapsByDevice = await this.loadLatestCursorMapsByDevice();
        const latestEventAtMs = await this.findLatestSessionEventAtMs(sessionFiles);
        const silenceExpired =
            latestEventAtMs !== null && Date.now() - latestEventAtMs >= STALE_SESSION_WINDOW_MS;
        const todayKey = formatLocalSessionDateKey();
        const deletedSessionIds: string[] = [];

        for (const fileInfo of sessionFiles) {
            if (fileInfo.dateKey === todayKey) {
                continue;
            }

            const completeLength = await this.getCompleteLength(fileInfo.filePath);
            const allConfirmed = validDevices.every((deviceEntry) => {
                if (deviceEntry.deviceFolderName === fileInfo.sourceDeviceFolderName) {
                    return true;
                }

                const cursor = cursorMapsByDevice
                    .get(deviceEntry.deviceFolderName)
                    ?.get(fileInfo.sessionPath);
                return !!cursor && cursor.offset >= completeLength;
            });

            if (!allConfirmed && !silenceExpired) {
                continue;
            }

            await this.adapter.remove(fileInfo.filePath);
            deletedSessionIds.push(fileInfo.sessionId);
        }

        return {
            deletedSessionIds,
        };
    }

    private async findLatestSessionEventAtMs(sessionFiles: SessionFileInfo[]): Promise<number | null> {
        let latestEventAtMs: number | null = null;

        for (const fileInfo of sessionFiles) {
            const raw = await this.adapter.read(fileInfo.filePath);
            const completeText = raw.slice(0, getLastCompleteOffset(raw));
            for (const { rawLine } of this.iterateCompleteLines(completeText, 0)) {
                const parsedLine = parseSessionLine(rawLine);
                if (parsedLine?.lineType !== "event") {
                    continue;
                }

                const parsedUpdatedAt = Date.parse(parsedLine.record.updatedAt);
                if (!Number.isFinite(parsedUpdatedAt)) {
                    continue;
                }

                latestEventAtMs =
                    latestEventAtMs === null
                        ? parsedUpdatedAt
                        : Math.max(latestEventAtMs, parsedUpdatedAt);
            }
        }

        return latestEventAtMs;
    }

    private async getCompleteLength(filePath: string): Promise<number> {
        const raw = await this.adapter.read(filePath);
        return getLastCompleteOffset(raw);
    }
}
