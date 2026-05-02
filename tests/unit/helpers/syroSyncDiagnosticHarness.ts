import { createHash } from "crypto";
import type {
    HarnessCardsStateEntry,
    HarnessExtractStateEntry,
    HarnessSessionRecordEntry,
    HarnessSessionRecordFilter,
    HarnessTimelineStateEntry,
    MultiDeviceHarness,
} from "./createSyroMultiDeviceHarness";
import { createSyroMultiDeviceHarness } from "./createSyroMultiDeviceHarness";

export type SyncClientKey = "desktop" | "mobile";
export type SyncDomain = "extracts" | "cards" | "timeline" | "file-identities";
export type SyncScenarioStage = "seed" | "run" | "local" | "session" | "sync" | "remote" | "final";

export interface SyncSessionRecordExpectation extends HarnessSessionRecordFilter {
    payload?: (payload: unknown, record: HarnessSessionRecordEntry) => boolean;
}

export interface SyncProbeAction {
    name: string;
    client: SyncClientKey;
    run(ctx: SyroSyncDiagnosticContext): Promise<void>;
    expectLocal(ctx: SyroSyncDiagnosticContext): Promise<void>;
    expectSession(ctx: SyroSyncDiagnosticContext): Promise<void>;
    expectRemote?: (ctx: SyroSyncDiagnosticContext) => Promise<void>;
}

export interface SyncScenario {
    name: string;
    seed(ctx: SyroSyncDiagnosticContext): Promise<void>;
    actions: SyncProbeAction[];
    syncPlan: SyncClientKey[];
    expectFinal(ctx: SyroSyncDiagnosticContext): Promise<void>;
}

function advanceDiagnosticClock(): void {
    const fakeClock = (setTimeout as unknown as { clock?: unknown }).clock;
    if (
        typeof jest === "undefined" ||
        typeof jest.setSystemTime !== "function" ||
        !fakeClock
    ) {
        return;
    }
    jest.setSystemTime(new Date(Date.now() + 1000));
}

export class SyroSyncDiagnosticError extends Error {
    scenarioName: string;
    actionName: string | null;
    stage: SyncScenarioStage;
    cause: unknown;
    diagnostics: unknown;

    constructor(input: {
        scenarioName: string;
        actionName?: string | null;
        stage: SyncScenarioStage;
        cause: unknown;
        diagnostics: unknown;
    }) {
        const causeMessage =
            input.cause instanceof Error ? input.cause.message : String(input.cause);
        super(
            [
                `Syro sync diagnostic failed at ${input.stage}`,
                `scenario=${input.scenarioName}`,
                input.actionName ? `action=${input.actionName}` : null,
                causeMessage,
            ]
                .filter(Boolean)
                .join(" | "),
        );
        this.name = "SyroSyncDiagnosticError";
        this.scenarioName = input.scenarioName;
        this.actionName = input.actionName ?? null;
        this.stage = input.stage;
        this.cause = input.cause;
        this.diagnostics = input.diagnostics;
    }
}

export class SyroSyncDiagnosticContext {
    readonly harness: MultiDeviceHarness;

    constructor(harness: MultiDeviceHarness) {
        this.harness = harness;
    }

    readSessionRecords(filter: HarnessSessionRecordFilter = {}): HarnessSessionRecordEntry[] {
        return this.harness.readSessionRecords(filter);
    }

    expectSessionRecord(expectation: SyncSessionRecordExpectation): HarnessSessionRecordEntry {
        const records = this.readSessionRecords(expectation).filter((entry) =>
            expectation.payload ? expectation.payload(entry.record.payload, entry) : true,
        );
        if (records.length === 0) {
            throw new Error(
                `Missing session record ${JSON.stringify({
                    client: expectation.client,
                    deviceFolderName: expectation.deviceFolderName,
                    domain: expectation.domain,
                    entityType: expectation.entityType,
                    opType: expectation.opType,
                    targetUuid: expectation.targetUuid,
                })}`,
            );
        }
        return records[records.length - 1];
    }

    expectSyncEntity(input: {
        client: string;
        domain: SyncDomain;
        targetUuid: string;
        deleted: boolean;
    }): void {
        const entity = this.harness.readSyncEntity(input.client, input.domain, input.targetUuid);
        expect(entity, `Missing sync entity ${input.domain}:${input.targetUuid}`).not.toBeNull();
        expect(entity?.deleted).toBe(input.deleted);
    }

    expectFormalConvergence(domain: "extracts" | "cards" | "timeline", clients: string[]): void {
        const [firstClient, ...restClients] = clients;
        if (!firstClient) {
            return;
        }
        const first = this.readComparableFormalState(domain, firstClient);
        for (const client of restClients) {
            expect(this.readComparableFormalState(domain, client)).toEqual(first);
        }
    }

    readComparableFormalState(
        domain: "extracts" | "cards" | "timeline",
        client: string,
    ): HarnessExtractStateEntry[] | HarnessCardsStateEntry[] | HarnessTimelineStateEntry[] {
        if (domain === "extracts") {
            return this.harness.readExtractsFormalState(client).map((entry) => ({
                ...entry,
                aliases: [entry.uuid, ...entry.aliases].sort((left, right) =>
                    left.localeCompare(right),
                ),
                uuid: "",
            }));
        }
        if (domain === "cards") {
            return this.harness.readCardsFormalState(client).map((entry) => ({
                ...entry,
                aliases: [entry.uuid, ...entry.aliases].sort((left, right) =>
                    left.localeCompare(right),
                ),
                trackedFileAliases: [entry.trackedFileUuid, ...entry.trackedFileAliases].sort(
                    (left, right) => left.localeCompare(right),
                ),
                uuid: "",
                trackedFileUuid: "",
            }));
        }
        return this.harness.readTimelineFormalState(client);
    }
}

export class SyroSyncDiagnosticHarness {
    readonly harness: MultiDeviceHarness;
    readonly context: SyroSyncDiagnosticContext;

    constructor(harness = createSyroMultiDeviceHarness()) {
        this.harness = harness;
        this.context = new SyroSyncDiagnosticContext(harness);
    }

    async runScenario(scenario: SyncScenario): Promise<void> {
        await this.wrap(scenario, null, "seed", () => scenario.seed(this.context));
        for (const action of scenario.actions) {
            advanceDiagnosticClock();
            await this.wrap(scenario, action, "run", () => action.run(this.context));
            await this.wrap(scenario, action, "local", () => action.expectLocal(this.context));
            await this.wrap(scenario, action, "session", () => action.expectSession(this.context));
            await this.replayActionToOtherClients(scenario, action);
        }
        for (const client of scenario.syncPlan) {
            advanceDiagnosticClock();
            await this.wrap(scenario, null, "sync", () =>
                this.harness.importPendingSessions(client).then(() => undefined),
            );
        }
        for (const action of scenario.actions) {
            if (action.expectRemote) {
                await this.wrap(scenario, action, "remote", () =>
                    action.expectRemote?.(this.context) ?? Promise.resolve(),
                );
            }
        }
        await this.wrap(scenario, null, "final", () => scenario.expectFinal(this.context));
    }

    private async replayActionToOtherClients(
        scenario: SyncScenario,
        action: SyncProbeAction,
    ): Promise<void> {
        const targetClients = scenario.syncPlan.filter((client) => client !== action.client);
        for (const client of targetClients) {
            advanceDiagnosticClock();
            await this.wrap(scenario, action, "sync", () =>
                this.harness.importPendingSessions(client).then(() => undefined),
            );
        }
    }

    private async wrap(
        scenario: SyncScenario,
        action: SyncProbeAction | null,
        stage: SyncScenarioStage,
        fn: () => Promise<void>,
    ): Promise<void> {
        try {
            await fn();
        } catch (error) {
            const diagnostics = this.collectFailureDiagnostics();
            if (process.env.SYRO_TEST_DIAGNOSTIC === "1") {
                console.error(
                    JSON.stringify(
                        {
                            scenario: scenario.name,
                            action: action?.name ?? null,
                            stage,
                            error: error instanceof Error ? error.message : String(error),
                            diagnostics,
                        },
                        null,
                        2,
                    ),
                );
            }
            throw new SyroSyncDiagnosticError({
                scenarioName: scenario.name,
                actionName: action?.name ?? null,
                stage,
                cause: error,
                diagnostics,
            });
        }
    }

    private collectFailureDiagnostics(): unknown {
        const clients = ["desktop", "mobile"].filter((client) => {
            try {
                this.harness.getClient(client);
                return true;
            } catch {
                return false;
            }
        });
        return {
            sessions: this.harness.readSessionRecords(),
            sessionDigestsByDevice: this.harness.readSessionDigests(),
            cursorSnapshotsByDevice: this.harness.collectDiagnostics(clients, [])
                .cursorSnapshotsByDevice,
            extracts: Object.fromEntries(
                clients.map((client) => [client, this.harness.readExtractsFormalState(client)]),
            ),
            cards: Object.fromEntries(
                clients.map((client) => [client, this.harness.readCardsFormalState(client)]),
            ),
            timeline: Object.fromEntries(
                clients.map((client) => [client, this.harness.readTimelineFormalState(client)]),
            ),
        };
    }
}

export function createSyroSyncDiagnosticHarness(): SyroSyncDiagnosticHarness {
    installDiagnosticCryptoIfMissing();
    return new SyroSyncDiagnosticHarness();
}

function installDiagnosticCryptoIfMissing(): void {
    const currentCrypto = globalThis.crypto as
        | (Crypto & { randomUUID?: () => `${string}-${string}-${string}-${string}-${string}` })
        | undefined;
    if (currentCrypto?.subtle?.digest) {
        return;
    }
    let uuidCounter = 0;
    Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: {
            ...(currentCrypto ?? {}),
            randomUUID: () => {
                uuidCounter += 1;
                const prefix = uuidCounter.toString(16).padStart(4, "0");
                return `${prefix}abcd-0000-4000-8000-000000000000`;
            },
            getRandomValues:
                currentCrypto?.getRandomValues?.bind(currentCrypto) ??
                ((buffer: Uint8Array) => buffer),
            subtle: {
                digest: async (_algorithm: string, data: BufferSource): Promise<ArrayBuffer> => {
                    const hash = createHash("sha256");
                    if (data instanceof ArrayBuffer) {
                        hash.update(Buffer.from(data));
                    } else {
                        hash.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
                    }
                    const digest = hash.digest();
                    return digest.buffer.slice(
                        digest.byteOffset,
                        digest.byteOffset + digest.byteLength,
                    );
                },
            },
        },
    });
}
