import { createHash } from "crypto";
import { type PendingOverlayFile } from "src/dataStore/pendingOverlayStore";
import { RPITEMTYPE } from "src/dataStore/repetitionItem";
import { createSyroMultiDeviceHarness, type HarnessCardsStateEntry, type HarnessDailyStateSnapshot, type HarnessStateDiagnostics } from "./helpers/createSyroMultiDeviceHarness";

const NOTE_ONE_PATH = "归档/Blog Public/日志 10.24--11.21.md";
const NOTE_TWO_PATH = "归档/Blog Public/日志 11.12-12.10 后面丢失到1.21.md";

const TARGET_DECK_PATHS = [
    "归档/Blog Public",
    "归档/Blog Public/日志 10.24--11.21",
    "归档/Blog Public/日志 11.12-12.10 后面丢失到1.21",
];

function comparableDailyState(
    value: HarnessDailyStateSnapshot | null,
): Omit<HarnessDailyStateSnapshot, "deviceReviewCount"> | null {
    if (!value) {
        return null;
    }
    const { deviceReviewCount: _deviceReviewCount, appliedOpIds, ...rest } = value;
    const normalizedAppliedOpIds = appliedOpIds
        .filter((entry) => entry.startsWith("daily-op:"))
        .sort((left, right) => left.localeCompare(right));
    return {
        ...rest,
        appliedOpIds: normalizedAppliedOpIds,
    };
}

function comparablePendingOverlay(value: PendingOverlayFile | null): PendingOverlayFile | null {
    if (!value) {
        return null;
    }
    return JSON.parse(JSON.stringify(value)) as PendingOverlayFile;
}

function comparableCards(value: HarnessCardsStateEntry[]): HarnessCardsStateEntry[] {
    return JSON.parse(JSON.stringify(value)) as HarnessCardsStateEntry[];
}

function expectDiagnosticsMatch(
    diagnostics: HarnessStateDiagnostics,
    leftClient: string,
    rightClient: string,
): void {
    expect(
        comparableCards(diagnostics.cardsByClient[leftClient]),
    ).toEqual(comparableCards(diagnostics.cardsByClient[rightClient]));
    expect(
        comparableDailyState(diagnostics.dailyByClient[leftClient]),
    ).toEqual(comparableDailyState(diagnostics.dailyByClient[rightClient]));
    expect(
        comparablePendingOverlay(diagnostics.pendingOverlayByClient[leftClient]),
    ).toEqual(comparablePendingOverlay(diagnostics.pendingOverlayByClient[rightClient]));
    expect(diagnostics.deckCountsByClient[leftClient]).toEqual(diagnostics.deckCountsByClient[rightClient]);
}

function expectOverlaySectionsEmpty(value: PendingOverlayFile | null): void {
    expect(value).not.toBeNull();
    expect(value?.sections ?? {}).toEqual({});
}

function sessionEventOpIdsForDevice(diagnostics: HarnessStateDiagnostics, deviceFolderName: string): string[] {
    return (diagnostics.sessionDigestsByDevice[deviceFolderName] ?? []).map((record) => record.opId);
}

describe("multi-device review backend flow", () => {
    const originalCrypto = globalThis.crypto;

    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date("2026-04-18T08:00:00.000Z"));
        jest.clearAllTimers();
        jest.restoreAllMocks();
        window.localStorage.clear();

        let uuidCounter = 0;
        Object.defineProperty(globalThis, "crypto", {
            configurable: true,
            value: {
                randomUUID: () => {
                    uuidCounter += 1;
                    const prefix = uuidCounter.toString(16).padStart(4, "0");
                    return `${prefix}abcd-0000-4000-8000-000000000000`;
                },
                getRandomValues:
                    originalCrypto?.getRandomValues ??
                    ((buffer: Uint8Array) => buffer),
                subtle:
                    originalCrypto?.subtle ??
                    {
                        digest: async (_algorithm: string, data: BufferSource): Promise<ArrayBuffer> => {
                            const hash = createHash("sha256");
                            if (data instanceof ArrayBuffer) {
                                hash.update(Buffer.from(data));
                            } else {
                                hash.update(
                                    Buffer.from(data.buffer, data.byteOffset, data.byteLength),
                                );
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
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllTimers();
        window.localStorage.clear();
        Object.defineProperty(globalThis, "crypto", {
            configurable: true,
            value: originalCrypto,
        });
    });

    test("desktop -> mobile -> desktop review roundtrip converges formal state, pending overlay, deck counts, and device folders", async () => {
        const harness = createSyroMultiDeviceHarness();
        await harness.seedFlashcardNote(NOTE_ONE_PATH, 20, "日志一");
        await harness.seedFlashcardNote(NOTE_TWO_PATH, 20, "日志二");

        const desktop = await harness.bootstrapDesktop();
        await harness.reviewCards("desktop", NOTE_ONE_PATH, 2);
        await harness.reviewCards("desktop", NOTE_TWO_PATH, 1);
        await harness.stagePendingOverlay("desktop");

        const desktopPendingBeforeCommit = harness.readPendingOverlay("desktop");
        expect(desktopPendingBeforeCommit?.sections.cardsReview?.items).toHaveLength(3);
        expect(desktopPendingBeforeCommit?.sections.dailyState).not.toBeUndefined();

        await harness.sync("desktop", "incremental");

        const mobile = await harness.bootstrapMobileFromDesktop();
        let diagnostics = harness.collectDiagnostics(["desktop", "mobile"], TARGET_DECK_PATHS);
        expectDiagnosticsMatch(diagnostics, "desktop", "mobile");

        jest.setSystemTime(new Date("2026-04-18T08:10:00.000Z"));
        await harness.reviewCards("mobile", NOTE_ONE_PATH, 1);
        await harness.reviewCards("mobile", NOTE_TWO_PATH, 2);
        await harness.stagePendingOverlay("mobile");

        const mobilePendingBeforeCommit = harness.readPendingOverlay("mobile");
        expect(mobilePendingBeforeCommit?.sections.cardsReview?.items).toHaveLength(3);
        expect(mobilePendingBeforeCommit?.sections.dailyState).not.toBeUndefined();

        await harness.sync("mobile", "incremental");
        await harness.sync("desktop", "incremental");

        await harness.restartClient("desktop");
        await harness.restartClient("mobile");
        await harness.sync("desktop", "incremental");
        await harness.sync("mobile", "incremental");

        diagnostics = harness.collectDiagnostics(["desktop", "mobile"], TARGET_DECK_PATHS);
        expectDiagnosticsMatch(diagnostics, "desktop", "mobile");

        expectOverlaySectionsEmpty(diagnostics.pendingOverlayByClient.desktop);
        expectOverlaySectionsEmpty(diagnostics.pendingOverlayByClient.mobile);

        const expectedDeviceFolders = [
            ((desktop.plugin as any).syroLayout.deviceRoot as string).split("/").pop(),
            ((mobile.plugin as any).syroLayout.deviceRoot as string).split("/").pop(),
        ].sort();
        const deviceFolders = diagnostics.deviceFolders
            .map((entry) => entry.folderName)
            .sort((left, right) => left.localeCompare(right));
        expect(deviceFolders).toEqual(expectedDeviceFolders);
        for (const entry of diagnostics.deviceFolders) {
            expect(entry.files).toEqual(
                expect.arrayContaining([
                    "device.json",
                    "cards.json",
                    "notes.json",
                    "timeline.json",
                    "deck-options.json",
                    "settings.json",
                    "tracking-rules.json",
                    "daily-state.json",
                    "device-state.json",
                    "license-state.json",
                    "pending.overlay.json",
                ]),
            );
        }

        expect(sessionEventOpIdsForDevice(diagnostics, expectedDeviceFolders[0]).length).toBeGreaterThan(0);
        expect(sessionEventOpIdsForDevice(diagnostics, expectedDeviceFolders[1]).length).toBeGreaterThan(0);
    });

    test("fresh baseline first import keeps source daily-state stable instead of replaying old source history again", async () => {
        const harness = createSyroMultiDeviceHarness();
        await harness.seedFlashcardNote(NOTE_ONE_PATH, 10, "首轮");

        await harness.bootstrapDesktop();
        await harness.reviewCards("desktop", NOTE_ONE_PATH, 3);
        await harness.sync("desktop", "incremental");
        await harness.bootstrapMobileFromDesktop();

        const diagnostics = harness.collectDiagnostics(["desktop", "mobile"], TARGET_DECK_PATHS);
        expect(
            comparableDailyState(diagnostics.dailyByClient.desktop),
        ).toEqual(comparableDailyState(diagnostics.dailyByClient.mobile));
        expect(diagnostics.deckCountsByClient.desktop).toEqual(diagnostics.deckCountsByClient.mobile);
    });

    test("restart recovers cardsReview pending entries when session already exists but cards.json has not been saved yet", async () => {
        const harness = createSyroMultiDeviceHarness();
        await harness.seedFlashcardNote(NOTE_ONE_PATH, 6, "挂账");
        await harness.bootstrapDesktop();

        const beforeFormal = harness.readCardsFormalState("desktop");
        const client = await harness.activateClient("desktop");
        const store = client.plugin.store;
        const coordinator = client.plugin.reviewStateCommitCoordinator;
        expect(store).not.toBeNull();
        expect(coordinator).not.toBeNull();

        const targetItem = store!
            .getItemsOfFile(NOTE_ONE_PATH)
            .find((item) => item.itemType === RPITEMTYPE.CARD);
        expect(targetItem).toBeDefined();
        const wasNew = targetItem!.isNew;
        store!.reviewId(
            targetItem!.ID,
            2,
            client.plugin.data.settings.fsrsSettings,
        );
        const commitId = coordinator!.queueCardCommit(targetItem!.ID, "review");
        client.plugin.incrementDailyCounts(
            NOTE_ONE_PATH.replace(/\.md$/i, ""),
            wasNew,
        );
        await harness.stagePendingOverlay("desktop");

        const snapshot = store!.getCardSnapshot(targetItem!.ID);
        expect(snapshot).not.toBeNull();
        await client.plugin.appendSyroCardUpsert(snapshot!, "review");
        store!.markPendingReviewSessionCommitted(targetItem!.ID, commitId ?? undefined);
        store!.requestFlushReviewOverlay();
        await store!.drainReviewOverlayFlush();
        await (client.plugin as any).pendingOverlayStore.drainFlush();

        const beforeRestartPending = harness.readPendingOverlay("desktop");
        expect(beforeRestartPending?.sections.cardsReview?.items).toHaveLength(1);
        expect(beforeRestartPending?.sections.cardsReview?.items[0]?.sessionCommitted).toBe(true);
        expect(harness.readCardsFormalState("desktop")).toEqual(beforeFormal);

        await harness.restartClient("desktop");
        const flushed = await harness.flushLocalPersistence("desktop");
        expect(flushed).toBe(true);
        await harness.sync("desktop", "incremental");

        const afterFormal = harness.readCardsFormalState("desktop");
        expect(afterFormal).not.toEqual(beforeFormal);
        expectOverlaySectionsEmpty(harness.readPendingOverlay("desktop"));
    });

    test("stale cursor that lands in the middle of a session line recovers by last op id and still imports the remaining legal events exactly once", async () => {
        const harness = createSyroMultiDeviceHarness();
        await harness.seedFlashcardNote(NOTE_ONE_PATH, 4, "游标");

        await harness.bootstrapDesktop();
        const mobile = await harness.bootstrapMobileFromDesktop();
        await harness.reviewCards("mobile", NOTE_ONE_PATH, 2);
        await harness.sync("mobile", "incremental");

        const desktop = await harness.activateClient("desktop");
        const mobileFolderName = ((mobile.plugin as any).syroLayout.deviceRoot as string)
            .split("/")
            .pop();
        const sessionPath = (harness.readSessionDigests()[mobileFolderName] ?? [])[0]?.sessionPath;
        expect(sessionPath).toBeTruthy();

        const fullSessionFilePath = `.obsidian/plugins/syro/sessions/${sessionPath}`;
        const raw = await desktop.app.vault.adapter.read(fullSessionFilePath);
        const eventLines = raw
            .split(/\r?\n/)
            .filter((line: string) => line.trim().length > 0)
            .map((line: string) => JSON.parse(line))
            .filter((line: Record<string, any>) => line.lineType === "event");
        expect(eventLines.length).toBeGreaterThanOrEqual(2);

        const lineOffsets: number[] = [];
        let runningOffset = 0;
        for (const line of raw.split(/\r?\n/)) {
            if (line.length === 0) {
                continue;
            }
            lineOffsets.push(runningOffset);
            runningOffset += line.length + 1;
        }

        const firstEventOpId = String(eventLines[0].record.opId);
        const secondEventOffset = lineOffsets[1] + 5;
        const manager = (desktop.plugin as any).syroSessionManager;
        manager.sessionCursors.set(sessionPath, {
            offset: secondEventOffset,
            lastOpId: firstEventOpId,
            updatedAt: "2026-04-18T08:10:00.000Z",
        });

        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
        const importedOpIds: string[] = [];
        await manager.importPendingSessions(async (_sessionId: string, records: Array<{ opId: string }>) => {
            importedOpIds.push(...records.map((record) => record.opId));
        });

        const expectedImportedOpIds = eventLines
            .slice(1)
            .map((line: Record<string, any>) => String(line.record.opId));
        expect(importedOpIds).toEqual(expectedImportedOpIds);
        expect(warnSpy).not.toHaveBeenCalledWith(
            "[SR-Syro] Ignored malformed session line.",
            expect.anything(),
        );
    });
});
