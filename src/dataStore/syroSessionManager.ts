import { App, DataAdapter } from "obsidian";
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

type SessionAdapter = Pick<
    DataAdapter,
    "append" | "exists" | "list" | "read" | "remove" | "rename" | "write"
>;

export type SyroSessionDomain = "cards" | "notes" | "timeline" | "deck-options";

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

type BufferedSessionLineParseResult = {
    raw: string;
    value: SyroBufferedSessionLine;
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

    constructor(
        private readonly app: App,
        private readonly layout: SyroPersistenceLayout,
    ) {
        this.adapter = this.app.vault.adapter as SessionAdapter;
    }

    async initialize(): Promise<void> {
        await this.restoreActiveSessionBuffer();
    }

    async appendDeckOptionsChange(state: DeckOptionsStoreFile): Promise<boolean> {
        return this.appendRecord({
            domain: "deck-options",
            entityType: "deck-options",
            opType: "replace",
            targetUuid: "deck-options:global",
            payload: state,
            pathHint: this.layout.deckOptionsPath,
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
        return true;
    }

    async flushActiveSession(): Promise<string | null> {
        if (!this.activeSession || this.activeSession.records.length === 0) {
            await this.clearActiveSessionBuffer();
            this.activeSession = null;
            return null;
        }

        const sessionId = this.createClosedSessionId(this.activeSession.sessionSeq);
        const sessionFileName = `${sessionId}.jsonl`;
        const finalPath = joinPath(this.layout.sessionsRoot, sessionFileName);

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
        const listing = await this.safeList(this.layout.sessionsRoot);
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
        const listing = await this.safeList(this.layout.devicesRoot);
        const devices: SyroDeviceMetadata[] = [];

        for (const deviceFolderPath of listing.folders) {
            const metaPath = joinPath(deviceFolderPath, "device.json");
            if (!(await this.adapter.exists(metaPath))) {
                continue;
            }

            try {
                const raw = await this.adapter.read(metaPath);
                const parsed = parseDeviceMetadata(parseJsonUnknown(raw));
                if (parsed) {
                    devices.push(parsed);
                }
            } catch {
                continue;
            }
        }

        if (!devices.some((device) => device.deviceId === this.layout.device.deviceId)) {
            devices.push(this.layout.device);
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

    private async markCurrentDeviceImported(sessionId: string): Promise<void> {
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
}
