import { App, DataAdapter } from "obsidian";
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import type { DeckOptionsStoreFile } from "./deckOptionsStore";
import type { SyroDeviceMetadata, SyroPersistenceLayout } from "./syroWorkspace";
import { parseDeviceMetadata } from "./syroWorkspace";
import {
    getNumberProp,
    getStringProp,
    isRecord,
    parseJsonUnknown,
} from "src/util/typeGuards";

const SYRO_SESSION_RECORD_VERSION = 1;
const SYRO_BUFFER_LINE_VERSION = 1;
const SYRO_ARCHIVE_ENTRY_VERSION = 1;
const ACTIVE_DEVICE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const STALE_SESSION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const IMPORTED_SESSION_RETENTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const SESSION_RECORD_LIMIT = 100;

type SessionAdapter = Pick<
    DataAdapter,
    | "append"
    | "exists"
    | "list"
    | "read"
    | "readBinary"
    | "remove"
    | "rename"
    | "write"
    | "writeBinary"
>;

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

interface SyroBufferedSessionLine {
    version: number;
    sessionSeq: number;
    openedAt: string;
    record: SyroSessionRecord;
}

interface ActiveSyroSession {
    sessionSeq: number;
    openedAt: string;
    records: SyroSessionRecord[];
}

export type SyroSessionSealReason =
    | "manual"
    | "background"
    | "startup"
    | "unload"
    | "idle-timeout"
    | "record-limit";

type BufferedSessionLineParseResult = {
    raw: string;
    value: SyroBufferedSessionLine;
};

type SessionFileParseResult = {
    sessionId: string;
    filePath: string;
    validRecords: SyroSessionRecord[];
    validLines: string[];
    badLines: string[];
};

type SyroDeviceEntry = {
    metaPath: string;
    metadata: SyroDeviceMetadata;
};

export interface SyroSessionImportResult {
    importedSessionIds: string[];
    deletedSessionIds: string[];
    archivedSessionIds: string[];
}

interface ArchivedSessionPackEntry {
    version: number;
    sessionId: string;
    archivedAt: string;
    content: string;
}

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

function createUniqueId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `syro-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatSessionClosedAt(date: Date): string {
    return date.toISOString().slice(0, 19).replace(/:/g, "-");
}

function createPendingSessionId(shortDeviceId: string, sessionSeq: number): string {
    return `pending:${shortDeviceId}:${String(sessionSeq).padStart(4, "0")}`;
}

function getSessionIdFromPath(filePath: string): string {
    const normalized = normalizePath(filePath);
    const fileName = normalized.slice(normalized.lastIndexOf("/") + 1);
    return fileName.replace(/\.jsonl$/i, "");
}

function parseClosedAtMs(sessionId: string): number | null {
    const [stamp] = sessionId.split("__");
    if (!stamp || !stamp.includes("T")) {
        return null;
    }

    const [datePart, timePart] = stamp.split("T");
    if (!datePart || !timePart) {
        return null;
    }

    const parsed = Date.parse(`${datePart}T${timePart.replace(/-/g, ":")}Z`);
    return Number.isFinite(parsed) ? parsed : null;
}

function gzipText(content: string): ArrayBuffer {
    const compressed = gzipSync(strToU8(content));
    return compressed.buffer.slice(
        compressed.byteOffset,
        compressed.byteOffset + compressed.byteLength,
    );
}

function gunzipText(content: ArrayBuffer): string {
    return strFromU8(gunzipSync(new Uint8Array(content)));
}

function getArchivePackName(sessionId: string): string | null {
    const [, shortDeviceId] = sessionId.split("__");
    const closedAtMs = parseClosedAtMs(sessionId);
    if (!shortDeviceId || closedAtMs === null) {
        return null;
    }

    const closedAt = new Date(closedAtMs).toISOString();
    return `${shortDeviceId}__${closedAt.slice(0, 7)}.sessionpack.gz`;
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

function parseBufferedSessionLine(rawLine: string): BufferedSessionLineParseResult | null {
    let parsed: unknown;
    try {
        parsed = parseJsonUnknown(rawLine);
    } catch {
        return null;
    }
    if (!isRecord(parsed)) {
        return null;
    }

    const version = getNumberProp(parsed, "version");
    const sessionSeq = getNumberProp(parsed, "sessionSeq");
    const openedAt = getStringProp(parsed, "openedAt")?.trim();
    const record = parseSessionRecord(parsed["record"]);

    if (
        version !== SYRO_BUFFER_LINE_VERSION ||
        typeof sessionSeq !== "number" ||
        !Number.isFinite(sessionSeq) ||
        sessionSeq < 1 ||
        !openedAt ||
        !record
    ) {
        return null;
    }

    return {
        raw: rawLine,
        value: {
            version,
            sessionSeq: Math.trunc(sessionSeq),
            openedAt,
            record,
        },
    };
}

function serializeBufferedSessionLine(
    sessionSeq: number,
    openedAt: string,
    record: SyroSessionRecord,
): string {
    return JSON.stringify({
        version: SYRO_BUFFER_LINE_VERSION,
        sessionSeq,
        openedAt,
        record,
    });
}

export class SyroSessionManager {
    private readonly adapter: SessionAdapter;
    private activeSession: ActiveSyroSession | null = null;
    private syncReadOnlyReason: string | null = null;
    private idleSealTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private readonly app: App,
        private readonly layout: SyroPersistenceLayout,
    ) {
        this.adapter = this.app.vault.adapter as SessionAdapter;
    }

    async initialize(): Promise<void> {
        await this.restoreActiveSessionBuffer();
        this.scheduleIdleSealTimer();
    }

    setReadOnly(reason: string | null): void {
        this.syncReadOnlyReason = reason;
        if (reason) {
            this.clearIdleSealTimer();
            return;
        }

        this.scheduleIdleSealTimer();
    }

    async importPendingSessions(
        replaySession: (sessionId: string, records: SyroSessionRecord[]) => Promise<void>,
    ): Promise<SyroSessionImportResult> {
        if (this.syncReadOnlyReason) {
            return {
                importedSessionIds: [],
                deletedSessionIds: [],
                archivedSessionIds: [],
            };
        }

        if (!(await this.shouldPersistNewRecords())) {
            return {
                importedSessionIds: [],
                deletedSessionIds: [],
                archivedSessionIds: [],
            };
        }

        const importedSessionIds: string[] = [];
        await this.flushOwnOpenSessionBeforeImport();
        const sessionFiles = await this.listSessionFiles();

        for (const filePath of sessionFiles) {
            const sessionId = getSessionIdFromPath(filePath);
            if (this.layout.device.importedSessionIds.includes(sessionId)) {
                continue;
            }

            const parsed = await this.parseSessionFile(filePath);
            if (parsed.badLines.length > 0) {
                await this.writeBadSessionLines(filePath, parsed.badLines);
                await this.writeCleanSessionFile(filePath, parsed.validLines);
            }

            if (parsed.validRecords.length > 0) {
                await replaySession(sessionId, parsed.validRecords);
            }

            await this.markCurrentDeviceImported(sessionId);
            importedSessionIds.push(sessionId);
        }

        const cleanup = await this.cleanupSessions();
        return {
            importedSessionIds,
            deletedSessionIds: cleanup.deletedSessionIds,
            archivedSessionIds: cleanup.archivedSessionIds,
        };
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

        if (!this.activeSession && !(await this.shouldPersistNewRecords())) {
            return false;
        }

        const activeSession = await this.ensureActiveSession();
        const now = new Date().toISOString();
        const record: SyroSessionRecord = {
            version: SYRO_SESSION_RECORD_VERSION,
            sessionId: createPendingSessionId(
                this.layout.device.shortDeviceId,
                activeSession.sessionSeq,
            ),
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

        activeSession.records.push(record);
        await this.adapter.append(
            this.layout.activeSessionBufferPath,
            `${serializeBufferedSessionLine(activeSession.sessionSeq, activeSession.openedAt, record)}\n`,
        );
        this.scheduleIdleSealTimer();
        if (activeSession.records.length >= SESSION_RECORD_LIMIT) {
            await this.sealActiveSession("record-limit");
        }
        return true;
    }

    async flushActiveSession(reason: SyroSessionSealReason = "manual"): Promise<string | null> {
        return this.sealActiveSession(reason);
    }

    async sealActiveSession(reason: SyroSessionSealReason): Promise<string | null> {
        if (this.syncReadOnlyReason) {
            return null;
        }

        this.clearIdleSealTimer();
        if (!this.activeSession || this.activeSession.records.length === 0) {
            await this.clearActiveSessionBuffer();
            this.activeSession = null;
            return null;
        }

        const sessionId = this.createClosedSessionId(this.activeSession.sessionSeq);
        const sessionFileName = `${sessionId}.jsonl`;
        const finalPath = joinPath(this.layout.closedSessionsRoot, sessionFileName);

        if (!(await this.adapter.exists(finalPath))) {
            const tempPath = `${finalPath}.tmp`;
            const serialized = `${this.activeSession.records
                .map((record) =>
                    JSON.stringify({
                        ...record,
                        sessionId,
                    }),
                )
                .join("\n")}\n`;

            await this.adapter.write(tempPath, serialized);
            const verified = await this.adapter.read(tempPath);
            if (verified !== serialized) {
                throw new Error("[SyroSession] Session temp file verification failed.");
            }
            await this.adapter.rename(tempPath, finalPath);
        }

        await this.markCurrentDeviceImported(sessionId);
        await this.clearActiveSessionBuffer();
        this.activeSession = null;
        if (reason !== "unload") {
            this.scheduleIdleSealTimer();
        }
        return sessionId;
    }

    private async shouldPersistNewRecords(): Promise<boolean> {
        const devices = await this.listValidDevices();
        return new Set(devices.map((device) => device.deviceId)).size >= 2;
    }

    private async ensureActiveSession(): Promise<ActiveSyroSession> {
        if (this.activeSession) {
            return this.activeSession;
        }

        this.activeSession = {
            sessionSeq: await this.getNextSessionSeq(),
            openedAt: new Date().toISOString(),
            records: [],
        };
        return this.activeSession;
    }

    private createClosedSessionId(sessionSeq: number): string {
        return `${formatSessionClosedAt(new Date())}__${this.layout.device.shortDeviceId}__${String(
            sessionSeq,
        ).padStart(4, "0")}`;
    }

    private async getNextSessionSeq(): Promise<number> {
        const listing = await this.safeList(this.layout.closedSessionsRoot);
        const pattern = new RegExp(
            `__${this.layout.device.shortDeviceId}__(\\d+)\\.jsonl$`,
            "i",
        );
        let maxSeq = 0;
        for (const filePath of listing.files) {
            const match = normalizePath(filePath).match(pattern);
            if (!match) {
                continue;
            }
            const seq = Number.parseInt(match[1], 10);
            if (Number.isFinite(seq)) {
                maxSeq = Math.max(maxSeq, seq);
            }
        }
        return maxSeq + 1;
    }

    private async listValidDevices(): Promise<SyroDeviceMetadata[]> {
        const entries = await this.listValidDeviceEntries();
        return entries.map((entry) => entry.metadata);
    }

    private async listValidDeviceEntries(): Promise<SyroDeviceEntry[]> {
        const listing = await this.safeList(this.layout.devicesRoot);
        const devices: SyroDeviceEntry[] = [];

        for (const deviceFolderPath of listing.folders) {
            const metaPath = joinPath(deviceFolderPath, "device.json");
            if (!(await this.adapter.exists(metaPath))) {
                continue;
            }

            try {
                const raw = await this.adapter.read(metaPath);
                const parsed = parseDeviceMetadata(parseJsonUnknown(raw));
                if (parsed) {
                    devices.push({
                        metaPath,
                        metadata: parsed,
                    });
                }
            } catch {
                continue;
            }
        }

        if (!devices.some((device) => device.metadata.deviceId === this.layout.device.deviceId)) {
            devices.push({
                metaPath: this.layout.deviceMetaPath,
                metadata: this.layout.device,
            });
        }

        return devices;
    }

    private async safeList(root: string): Promise<{ files: string[]; folders: string[] }> {
        try {
            const listing = await this.adapter.list(trimTrailingSlash(root));
            return {
                files: listing?.files ?? [],
                folders: listing?.folders ?? [],
            };
        } catch {
            return { files: [], folders: [] };
        }
    }

    // The local active-session buffer is private to this device, so invalid lines are quarantined.
    private async restoreActiveSessionBuffer(): Promise<void> {
        if (!(await this.adapter.exists(this.layout.activeSessionBufferPath))) {
            return;
        }

        const raw = await this.adapter.read(this.layout.activeSessionBufferPath);
        const lines = raw
            .split(/\r?\n/g)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length === 0) {
            await this.clearActiveSessionBuffer();
            return;
        }

        const validLines: BufferedSessionLineParseResult[] = [];
        const badLines: string[] = [];
        let expectedSessionSeq: number | null = null;
        let expectedOpenedAt: string | null = null;

        for (const line of lines) {
            const parsed = parseBufferedSessionLine(line);
            if (!parsed) {
                badLines.push(line);
                continue;
            }

            if (expectedSessionSeq === null || expectedOpenedAt === null) {
                expectedSessionSeq = parsed.value.sessionSeq;
                expectedOpenedAt = parsed.value.openedAt;
            }

            if (
                parsed.value.sessionSeq !== expectedSessionSeq ||
                parsed.value.openedAt !== expectedOpenedAt
            ) {
                badLines.push(line);
                continue;
            }

            validLines.push(parsed);
        }

        if (badLines.length > 0) {
            await this.writeBadBufferLines(badLines);
        }

        if (validLines.length === 0 || expectedSessionSeq === null || expectedOpenedAt === null) {
            await this.clearActiveSessionBuffer();
            return;
        }

        this.activeSession = {
            sessionSeq: expectedSessionSeq,
            openedAt: expectedOpenedAt,
            records: validLines.map((line) => line.value.record),
        };

        const cleanedBuffer = `${validLines.map((line) => line.raw).join("\n")}\n`;
        await this.adapter.write(this.layout.activeSessionBufferPath, cleanedBuffer);
        this.scheduleIdleSealTimer();
    }

    private async writeBadBufferLines(badLines: string[]): Promise<void> {
        const badPath = `${this.layout.activeSessionBufferPath}.bad`;
        const existing =
            (await this.adapter.exists(badPath)) && (await this.adapter.read(badPath))
                ? await this.adapter.read(badPath)
                : "";
        const prefix = existing && !existing.endsWith("\n") ? `${existing}\n` : existing;
        await this.adapter.write(badPath, `${prefix}${badLines.join("\n")}\n`);
    }

    private async clearActiveSessionBuffer(): Promise<void> {
        if (await this.adapter.exists(this.layout.activeSessionBufferPath)) {
            await this.adapter.remove(this.layout.activeSessionBufferPath);
        }
    }

    private async listSessionFiles(): Promise<string[]> {
        const listing = await this.safeList(this.layout.closedSessionsRoot);
        return listing.files
            .map((filePath) => normalizePath(filePath))
            .filter((filePath) => filePath.toLowerCase().endsWith(".jsonl"))
            .sort((left, right) => left.localeCompare(right));
    }

    private async parseSessionFile(filePath: string): Promise<SessionFileParseResult> {
        const raw = await this.adapter.read(filePath);
        const lines = raw
            .split(/\r?\n/g)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        const validRecords: SyroSessionRecord[] = [];
        const validLines: string[] = [];
        const badLines: string[] = [];

        for (const line of lines) {
            let parsed: unknown;
            try {
                parsed = parseJsonUnknown(line);
            } catch {
                badLines.push(line);
                continue;
            }

            const record = parseSessionRecord(parsed);
            if (!record) {
                badLines.push(line);
                continue;
            }

            validRecords.push(record);
            validLines.push(line);
        }

        return {
            sessionId: getSessionIdFromPath(filePath),
            filePath,
            validRecords,
            validLines,
            badLines,
        };
    }

    private async writeBadSessionLines(filePath: string, badLines: string[]): Promise<void> {
        const badPath = `${filePath}.bad`;
        const existing =
            (await this.adapter.exists(badPath)) && (await this.adapter.read(badPath))
                ? await this.adapter.read(badPath)
                : "";
        const prefix = existing && !existing.endsWith("\n") ? `${existing}\n` : existing;
        await this.adapter.write(badPath, `${prefix}${badLines.join("\n")}\n`);
    }

    private async writeCleanSessionFile(filePath: string, validLines: string[]): Promise<void> {
        const serialized = validLines.length > 0 ? `${validLines.join("\n")}\n` : "";
        await this.adapter.write(filePath, serialized);
    }

    private async cleanupSessions(): Promise<{
        deletedSessionIds: string[];
        archivedSessionIds: string[];
    }> {
        if (this.syncReadOnlyReason) {
            return {
                deletedSessionIds: [],
                archivedSessionIds: [],
            };
        }

        const deviceEntries = await this.listValidDeviceEntries();
        const activeCutoff = Date.now() - ACTIVE_DEVICE_WINDOW_MS;
        const activeDevices = deviceEntries.filter((entry) => {
            const lastSeenAt = Date.parse(entry.metadata.lastSeenAt);
            return Number.isFinite(lastSeenAt) && lastSeenAt >= activeCutoff;
        });
        const effectiveActiveDevices = activeDevices.length > 0 ? activeDevices : deviceEntries;
        const sessionFiles = await this.listSessionFiles();
        const deletedSessionIds: string[] = [];
        const archivedSessionIds: string[] = [];

        for (const filePath of sessionFiles) {
            const sessionId = getSessionIdFromPath(filePath);
            const allActiveImported = effectiveActiveDevices.every((entry) =>
                entry.metadata.importedSessionIds.includes(sessionId),
            );
            if (allActiveImported) {
                await this.adapter.remove(filePath);
                deletedSessionIds.push(sessionId);
                continue;
            }

            const closedAtMs = parseClosedAtMs(sessionId);
            if (closedAtMs === null || Date.now() - closedAtMs < STALE_SESSION_WINDOW_MS) {
                continue;
            }

            await this.archiveSessionFile(filePath, sessionId);
            await this.adapter.remove(filePath);
            archivedSessionIds.push(sessionId);
        }

        if (deletedSessionIds.length > 0 || archivedSessionIds.length > 0) {
            await this.extendImportedSessionRetention(deviceEntries, [
                ...deletedSessionIds,
                ...archivedSessionIds,
            ]);
            await this.trimImportedSessionIds(deviceEntries);
        }

        return {
            deletedSessionIds,
            archivedSessionIds,
        };
    }

    private async archiveSessionFile(filePath: string, sessionId: string): Promise<void> {
        const archivePackName = getArchivePackName(sessionId);
        if (!archivePackName || !this.adapter.readBinary || !this.adapter.writeBinary) {
            const fallbackPath = joinPath(this.layout.archivedSessionsRoot, `${sessionId}.jsonl`);
            await this.adapter.write(fallbackPath, await this.adapter.read(filePath));
            return;
        }

        const archivePath = joinPath(this.layout.archivedSessionsRoot, archivePackName);
        const content = await this.adapter.read(filePath);
        const entry: ArchivedSessionPackEntry = {
            version: SYRO_ARCHIVE_ENTRY_VERSION,
            sessionId,
            archivedAt: new Date().toISOString(),
            content,
        };

        let combinedText = `${JSON.stringify(entry)}\n`;
        if (await this.adapter.exists(archivePath)) {
            const previousBinary = await this.adapter.readBinary(archivePath);
            const previousText = gunzipText(previousBinary);
            combinedText = previousText.endsWith("\n")
                ? `${previousText}${JSON.stringify(entry)}\n`
                : `${previousText}\n${JSON.stringify(entry)}\n`;
        }

        await this.adapter.writeBinary(archivePath, gzipText(combinedText));
    }

    private async trimImportedSessionIds(deviceEntries: SyroDeviceEntry[]): Promise<void> {
        const retainedSessionIds = new Set(
            (await this.listSessionFiles()).map((filePath) => getSessionIdFromPath(filePath)),
        );

        await Promise.all(
            deviceEntries.map(async (entry) => {
                const now = Date.now();
                const trimmed = entry.metadata.importedSessionIds.filter((sessionId) => {
                    if (retainedSessionIds.has(sessionId)) {
                        return true;
                    }

                    const retentionUntil = entry.metadata.importedSessionRetentionUntil[sessionId];
                    const parsedRetention = Date.parse(retentionUntil);
                    return Number.isFinite(parsedRetention) && parsedRetention > now;
                });
                const trimmedRetention = Object.fromEntries(
                    Object.entries(entry.metadata.importedSessionRetentionUntil).filter(
                        ([sessionId, retentionUntil]) =>
                            trimmed.includes(sessionId) &&
                            Number.isFinite(Date.parse(retentionUntil)) &&
                            Date.parse(retentionUntil) > now,
                    ),
                );
                if (
                    trimmed.length === entry.metadata.importedSessionIds.length &&
                    Object.keys(trimmedRetention).length ===
                        Object.keys(entry.metadata.importedSessionRetentionUntil).length
                ) {
                    return;
                }

                entry.metadata.importedSessionIds = trimmed;
                entry.metadata.importedSessionRetentionUntil = trimmedRetention;
                entry.metadata.updatedAt = new Date().toISOString();
                if (entry.metadata.deviceId === this.layout.device.deviceId) {
                    this.layout.device.importedSessionIds = trimmed;
                    this.layout.device.importedSessionRetentionUntil =
                        entry.metadata.importedSessionRetentionUntil;
                    this.layout.device.updatedAt = entry.metadata.updatedAt;
                }

                await this.adapter.write(entry.metaPath, JSON.stringify(entry.metadata, null, 2));
            }),
        );
    }

    private async flushOwnOpenSessionBeforeImport(): Promise<void> {
        if (!this.activeSession || this.activeSession.records.length === 0) {
            return;
        }

        await this.sealActiveSession("startup");
    }

    private async markCurrentDeviceImported(sessionId: string): Promise<void> {
        if (this.syncReadOnlyReason) {
            return;
        }

        if (!this.layout.device.importedSessionIds.includes(sessionId)) {
            this.layout.device.importedSessionIds.push(sessionId);
        }

        const now = new Date().toISOString();
        this.layout.device.updatedAt = now;
        this.layout.device.lastSeenAt = now;
        await this.adapter.write(
            this.layout.deviceMetaPath,
            JSON.stringify(this.layout.device, null, 2),
        );
    }

    private clearIdleSealTimer(): void {
        if (this.idleSealTimer !== null) {
            clearTimeout(this.idleSealTimer);
            this.idleSealTimer = null;
        }
    }

    private scheduleIdleSealTimer(): void {
        this.clearIdleSealTimer();
        if (this.syncReadOnlyReason || !this.activeSession || this.activeSession.records.length === 0) {
            return;
        }

        this.idleSealTimer = setTimeout(() => {
            this.idleSealTimer = null;
            void this.sealActiveSession("idle-timeout").catch((error) => {
                console.error("[SR-Syro] idle session seal failed", error);
            });
        }, SESSION_IDLE_TIMEOUT_MS);
    }

    private async extendImportedSessionRetention(
        deviceEntries: SyroDeviceEntry[],
        sessionIds: string[],
    ): Promise<void> {
        if (sessionIds.length === 0) {
            return;
        }

        const retentionUntil = new Date(Date.now() + IMPORTED_SESSION_RETENTION_WINDOW_MS).toISOString();
        await Promise.all(
            deviceEntries.map(async (entry) => {
                let changed = false;
                for (const sessionId of sessionIds) {
                    if (!entry.metadata.importedSessionIds.includes(sessionId)) {
                        continue;
                    }

                    const current = entry.metadata.importedSessionRetentionUntil[sessionId];
                    if (current && current >= retentionUntil) {
                        continue;
                    }

                    entry.metadata.importedSessionRetentionUntil[sessionId] = retentionUntil;
                    changed = true;
                }

                if (!changed) {
                    return;
                }

                entry.metadata.updatedAt = new Date().toISOString();
                if (entry.metadata.deviceId === this.layout.device.deviceId) {
                    this.layout.device.importedSessionRetentionUntil = {
                        ...entry.metadata.importedSessionRetentionUntil,
                    };
                    this.layout.device.updatedAt = entry.metadata.updatedAt;
                }

                await this.adapter.write(entry.metaPath, JSON.stringify(entry.metadata, null, 2));
            }),
        );
    }
}
