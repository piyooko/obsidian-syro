import type { SyroSessionDomain, SyroSessionRecord } from "./syroSessionManager";
import { Iadapter } from "./adapter";
import {
    getNumberProp,
    getStringProp,
    isRecord,
    parseJsonUnknown,
} from "src/util/typeGuards";

const SYRO_MERGE_STATE_VERSION = 1;

export interface SyroMergeEntityState {
    updatedAt: string;
    deleted: boolean;
    domain: SyroSessionDomain;
    entityType: string;
    pathHint?: string;
}

interface SyroMergeStateFile {
    version: number;
    entities: Record<string, SyroMergeEntityState>;
}

function normalizeMergeEntityState(value: unknown): SyroMergeEntityState | null {
    if (!isRecord(value)) {
        return null;
    }

    const updatedAt = getStringProp(value, "updatedAt")?.trim();
    const domain = getStringProp(value, "domain")?.trim() as SyroSessionDomain | undefined;
    const entityType = getStringProp(value, "entityType")?.trim();
    const pathHint = getStringProp(value, "pathHint")?.trim();

    if (!updatedAt || !domain || !entityType) {
        return null;
    }

    return {
        updatedAt,
        deleted: value["deleted"] === true,
        domain,
        entityType,
        ...(pathHint ? { pathHint } : {}),
    };
}

function compareIsoTime(left: string, right: string): number {
    if (left === right) {
        return 0;
    }
    return left < right ? -1 : 1;
}

export class SyroMergeStateStore {
    private entities = new Map<string, SyroMergeEntityState>();

    constructor(private readonly path: string) {}

    async load(): Promise<void> {
        const adapter = Iadapter.instance.adapter;
        if (!(await adapter.exists(this.path))) {
            this.entities.clear();
            return;
        }

        try {
            const raw = await adapter.read(this.path);
            if (!raw) {
                this.entities.clear();
                return;
            }

            const parsed = parseJsonUnknown(raw);
            if (
                !isRecord(parsed) ||
                getNumberProp(parsed, "version") !== SYRO_MERGE_STATE_VERSION ||
                !isRecord(parsed["entities"])
            ) {
                this.entities.clear();
                return;
            }

            const nextEntities = new Map<string, SyroMergeEntityState>();
            for (const [targetUuid, value] of Object.entries(parsed["entities"])) {
                if (typeof targetUuid !== "string" || targetUuid.length === 0) {
                    continue;
                }

                const normalized = normalizeMergeEntityState(value);
                if (normalized) {
                    nextEntities.set(targetUuid, normalized);
                }
            }

            this.entities = nextEntities;
        } catch {
            this.entities.clear();
        }
    }

    async save(): Promise<void> {
        const payload: SyroMergeStateFile = {
            version: SYRO_MERGE_STATE_VERSION,
            entities: Object.fromEntries(this.entities.entries()),
        };

        await Iadapter.instance.adapter.write(this.path, JSON.stringify(payload, null, 2));
    }

    get(targetUuid: string): SyroMergeEntityState | null {
        return this.entities.get(targetUuid) ?? null;
    }

    shouldApply(record: Pick<SyroSessionRecord, "targetUuid" | "updatedAt">): boolean {
        const current = this.get(record.targetUuid);
        if (!current) {
            return true;
        }

        return compareIsoTime(current.updatedAt, record.updatedAt) < 0;
    }

    markRecord(
        record: Pick<
            SyroSessionRecord,
            "targetUuid" | "updatedAt" | "domain" | "entityType" | "pathHint"
        >,
        deleted: boolean,
    ): void {
        this.markEntity({
            targetUuid: record.targetUuid,
            updatedAt: record.updatedAt,
            deleted,
            domain: record.domain,
            entityType: record.entityType,
            pathHint: record.pathHint,
        });
    }

    markEntity(input: {
        targetUuid: string;
        updatedAt: string;
        deleted: boolean;
        domain: SyroSessionDomain;
        entityType: string;
        pathHint?: string;
    }): void {
        const current = this.entities.get(input.targetUuid);
        if (current && compareIsoTime(current.updatedAt, input.updatedAt) >= 0) {
            return;
        }

        this.entities.set(input.targetUuid, {
            updatedAt: input.updatedAt,
            deleted: input.deleted,
            domain: input.domain,
            entityType: input.entityType,
            ...(input.pathHint ? { pathHint: input.pathHint } : {}),
        });
    }

    pruneExpired(retentionMs: number, now = Date.now()): number {
        let removed = 0;
        for (const [key, value] of this.entities.entries()) {
            const updatedAtMs = Date.parse(value.updatedAt);
            if (!Number.isFinite(updatedAtMs) || now - updatedAtMs <= retentionMs) {
                continue;
            }

            this.entities.delete(key);
            removed += 1;
        }

        return removed;
    }
}
