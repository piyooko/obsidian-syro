import { createHash } from "crypto";
import { type PendingOverlayFile } from "src/dataStore/pendingOverlayStore";
import { RPITEMTYPE } from "src/dataStore/repetitionItem";
import { FlashcardReviewMode, ReviewResponse } from "src/scheduling";
import { DEFAULT_SETTINGS } from "src/settings";
import {
    createSyroMultiDeviceHarness,
    type HarnessCardsStateEntry,
    type HarnessDailyStateSnapshot,
    type HarnessDeckOptionsStateSnapshot,
    type HarnessStateDiagnostics,
    type HarnessTrackedFileStateEntry,
} from "./helpers/createSyroMultiDeviceHarness";

const NOTE_ONE_PATH = "归档/Blog Public/日志 10.24--11.21.md";
const NOTE_TWO_PATH = "归档/Blog Public/日志 11.12-12.10 后面丢失到1.21.md";

const TARGET_DECK_PATHS = [
    "归档/Blog Public",
    "归档/Blog Public/日志 10.24--11.21",
    "归档/Blog Public/日志 11.12-12.10 后面丢失到1.21",
];

function noteDeckPath(notePath: string): string {
    return notePath.replace(/\\/g, "/").replace(/\.md$/i, "");
}

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
    return value.map((entry) => ({
        ...JSON.parse(JSON.stringify(entry)),
        aliases: [entry.uuid, ...entry.aliases].sort((left, right) => left.localeCompare(right)),
        trackedFileAliases: [entry.trackedFileUuid, ...entry.trackedFileAliases].sort(
            (left, right) => left.localeCompare(right),
        ),
        uuid: "",
        trackedFileUuid: "",
    })) as HarnessCardsStateEntry[];
}

function comparableTrackedFiles(
    value: HarnessTrackedFileStateEntry[],
): HarnessTrackedFileStateEntry[] {
    return value.map((entry) => ({
        ...JSON.parse(JSON.stringify(entry)),
        aliases: [entry.uuid, ...entry.aliases].sort((left, right) => left.localeCompare(right)),
        noteItemUuid: null,
        cardItemUuids: [],
        uuid: "",
    })) as HarnessTrackedFileStateEntry[];
}

function comparableDeckOptions(
    value: HarnessDeckOptionsStateSnapshot | null,
): HarnessDeckOptionsStateSnapshot | null {
    if (!value) {
        return null;
    }
    return JSON.parse(JSON.stringify(value)) as HarnessDeckOptionsStateSnapshot;
}

function expectDiagnosticsMatch(
    diagnostics: HarnessStateDiagnostics,
    leftClient: string,
    rightClient: string,
): void {
    expect(comparableCards(diagnostics.cardsByClient[leftClient])).toEqual(
        comparableCards(diagnostics.cardsByClient[rightClient]),
    );
    expect(comparableTrackedFiles(diagnostics.trackedFilesByClient[leftClient])).toEqual(
        comparableTrackedFiles(diagnostics.trackedFilesByClient[rightClient]),
    );
    expect(diagnostics.extractsByClient[leftClient]).toEqual(
        diagnostics.extractsByClient[rightClient],
    );
    expect(diagnostics.timelineByClient[leftClient]).toEqual(
        diagnostics.timelineByClient[rightClient],
    );
    expect(comparableDeckOptions(diagnostics.deckOptionsByClient[leftClient])).toEqual(
        comparableDeckOptions(diagnostics.deckOptionsByClient[rightClient]),
    );
    expect(comparableDailyState(diagnostics.dailyByClient[leftClient])).toEqual(
        comparableDailyState(diagnostics.dailyByClient[rightClient]),
    );
    expect(comparablePendingOverlay(diagnostics.pendingOverlayByClient[leftClient])).toEqual(
        comparablePendingOverlay(diagnostics.pendingOverlayByClient[rightClient]),
    );
    expect(diagnostics.deckCountsByClient[leftClient]).toEqual(
        diagnostics.deckCountsByClient[rightClient],
    );
}

function expectOverlaySectionsEmpty(value: PendingOverlayFile | null): void {
    expect(value).not.toBeNull();
    expect(value?.sections ?? {}).toEqual({});
}

function sessionEventOpIdsForDevice(
    diagnostics: HarnessStateDiagnostics,
    deviceFolderName: string,
): string[] {
    return (diagnostics.sessionDigestsByDevice[deviceFolderName] ?? []).map(
        (record) => record.opId,
    );
}

function dailyStateTargetUuidsForDevice(
    diagnostics: HarnessStateDiagnostics,
    deviceFolderName: string,
): string[] {
    return (diagnostics.sessionDigestsByDevice[deviceFolderName] ?? [])
        .filter(
            (record) =>
                record.domain === "daily-state" && record.targetUuid.startsWith("daily-op:"),
        )
        .map((record) => record.targetUuid);
}

function debugDiagnostics(label: string, diagnostics: HarnessStateDiagnostics): void {
    if (process.env.SYRO_TEST_DEBUG !== "1") {
        return;
    }

    console.log(`[SYRO-TEST-DEBUG] ${label}\n${JSON.stringify(diagnostics, null, 2)}`);
}

describe("multi-device review backend flow", () => {
    const originalCrypto = globalThis.crypto;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.useFakeTimers().setSystemTime(new Date("2026-04-18T08:00:00.000Z"));
        jest.clearAllTimers();
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
                    originalCrypto?.getRandomValues ?? ((buffer: Uint8Array) => buffer),
                subtle: originalCrypto?.subtle ?? {
                    digest: async (
                        _algorithm: string,
                        data: BufferSource,
                    ): Promise<ArrayBuffer> => {
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
        jest.setSystemTime(new Date("2026-04-18T08:00:00.000Z"));
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
        debugDiagnostics("baseline-roundtrip-final", diagnostics);
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

        expect(
            sessionEventOpIdsForDevice(diagnostics, expectedDeviceFolders[0]).length,
        ).toBeGreaterThan(0);
        expect(
            sessionEventOpIdsForDevice(diagnostics, expectedDeviceFolders[1]).length,
        ).toBeGreaterThan(0);
    });

    test("fresh baseline first import keeps source daily-state stable instead of replaying old source history again", async () => {
        const harness = createSyroMultiDeviceHarness();
        await harness.seedFlashcardNote(NOTE_ONE_PATH, 10, "首轮");

        await harness.bootstrapDesktop();
        await harness.reviewCards("desktop", NOTE_ONE_PATH, 3);
        await harness.sync("desktop", "incremental");
        jest.setSystemTime(new Date("2026-04-18T08:05:00.000Z"));
        await harness.bootstrapMobileFromDesktop();

        const diagnostics = harness.collectDiagnostics(["desktop", "mobile"], TARGET_DECK_PATHS);
        expect(comparableDailyState(diagnostics.dailyByClient.desktop)).toEqual(
            comparableDailyState(diagnostics.dailyByClient.mobile),
        );
        expect(diagnostics.deckCountsByClient.desktop).toEqual(
            diagnostics.deckCountsByClient.mobile,
        );
    });

    test("independent fresh devices reconcile the whole card library before importing first shared review history", async () => {
        const harness = createSyroMultiDeviceHarness();
        await harness.seedFlashcardNote(NOTE_ONE_PATH, 20, "双新设备");
        await harness.seedFlashcardNote(NOTE_TWO_PATH, 20, "对照");

        jest.setSystemTime(new Date("2026-04-18T08:12:00.000Z"));
        await harness.bootstrapDesktop();
        await harness.reviewCards("desktop", NOTE_ONE_PATH, 20);
        await harness.stagePendingOverlay("desktop");
        await harness.flushLocalPersistence("desktop");
        await harness.sync("desktop", "incremental");

        await harness.bootstrapMobileIndependently({
            beforeMerge: async (client) => {
                const store = client.plugin.store;
                expect(store).not.toBeNull();
                const cardIds = store!
                    .getItemsOfFile(NOTE_ONE_PATH)
                    .filter((item) => item.itemType === RPITEMTYPE.CARD)
                    .slice(0, 7)
                    .map((item) => item.ID);
                for (const itemId of cardIds) {
                    const item = store!.getItembyID(itemId);
                    expect(item).toBeDefined();
                    const wasNew = item?.isNew ?? false;
                    store!.reviewId(
                        itemId,
                        ReviewResponse.Good,
                        client.plugin.data.settings.fsrsSettings,
                    );
                    client.plugin.reviewStateCommitCoordinator?.queueCardCommit(itemId, "review");
                    client.plugin.incrementDailyCounts(NOTE_ONE_PATH.replace(/\.md$/i, ""), wasNew);
                }
                await client.plugin.store?.drainReviewOverlayFlush();
                await (client.plugin as any).pendingOverlayStore?.drainFlush();
                await client.plugin.flushReviewPersistence(2500, { notify: false });
                await client.plugin.requestSync({
                    reviewMode: FlashcardReviewMode.Review,
                    mode: "incremental",
                    trigger: "manual",
                });
            },
        });

        await harness.sync("desktop", "incremental");
        await harness.sync("mobile", "incremental");
        await harness.restartClient("desktop");
        await harness.restartClient("mobile");
        await harness.sync("desktop", "incremental");
        await harness.sync("mobile", "incremental");

        const diagnostics = harness.collectDiagnostics(["desktop", "mobile"], TARGET_DECK_PATHS);
        debugDiagnostics("first-meeting-final", diagnostics);
        expectDiagnosticsMatch(diagnostics, "desktop", "mobile");

        expect(
            diagnostics.cardsByClient.desktop.every(
                (entry) => entry.aliases.length > 0 && entry.trackedFileAliases.length > 0,
            ),
        ).toBe(true);
        expect(
            diagnostics.cardsByClient.mobile.every(
                (entry) => entry.aliases.length > 0 && entry.trackedFileAliases.length > 0,
            ),
        ).toBe(true);

        const reviewedDesktopCards = diagnostics.cardsByClient.desktop.filter(
            (entry) => entry.path === NOTE_ONE_PATH && entry.timesReviewed > 0,
        );
        const reviewedMobileCards = diagnostics.cardsByClient.mobile.filter(
            (entry) => entry.path === NOTE_ONE_PATH && entry.timesReviewed > 0,
        );
        expect(reviewedDesktopCards).toHaveLength(20);
        expect(reviewedMobileCards).toHaveLength(20);

        const expectedDailyNewCount = 27;
        expect(
            diagnostics.dailyByClient.desktop?.dailyDeckStats.counts[
                "归档/Blog Public/日志 10.24--11.21"
            ]?.new ?? 0,
        ).toBe(expectedDailyNewCount);
        expect(
            diagnostics.dailyByClient.mobile?.dailyDeckStats.counts[
                "归档/Blog Public/日志 10.24--11.21"
            ]?.new ?? 0,
        ).toBe(expectedDailyNewCount);
    });

    test("mobile baseline then desktop appends same-day review records and mobile later pulls them into formal state", async () => {
        const harness = createSyroMultiDeviceHarness();
        await harness.seedFlashcardNote(NOTE_ONE_PATH, 20, "基线后追加");
        await harness.seedFlashcardNote(NOTE_TWO_PATH, 20, "对照");

        const desktop = await harness.bootstrapDesktop();
        const mobile = await harness.bootstrapMobileFromDesktop();

        jest.setSystemTime(new Date("2026-04-18T08:12:00.000Z"));
        await harness.reviewCards("desktop", NOTE_ONE_PATH, 20);
        await harness.stagePendingOverlay("desktop");
        await harness.sync("desktop", "incremental");
        await harness.sync("mobile", "incremental");

        await harness.restartClient("desktop");
        await harness.restartClient("mobile");
        await harness.sync("desktop", "incremental");
        await harness.sync("mobile", "incremental");

        const diagnostics = harness.collectDiagnostics(["desktop", "mobile"], TARGET_DECK_PATHS);
        debugDiagnostics("baseline-append-final", diagnostics);
        expectDiagnosticsMatch(diagnostics, "desktop", "mobile");

        const desktopFolderName = ((desktop.plugin as any).syroLayout.deviceRoot as string)
            .split("/")
            .pop() as string;
        const mobileFolderName = ((mobile.plugin as any).syroLayout.deviceRoot as string)
            .split("/")
            .pop() as string;
        const desktopSessionPath = `${desktopFolderName}/2026-04-18.session.jsonl`;
        const desktopLatestOpId =
            sessionEventOpIdsForDevice(diagnostics, desktopFolderName).at(-1) ?? null;
        expect(
            diagnostics.cursorSnapshotsByDevice[mobileFolderName]?.cursors[desktopSessionPath]
                ?.lastOpId ?? null,
        ).toBe(desktopLatestOpId);
    });

    test("rapid same-day desktop review plus concurrent exit save still converges daily-state on mobile", async () => {
        const harness = createSyroMultiDeviceHarness();
        await harness.seedFlashcardNote(NOTE_ONE_PATH, 20, "日志一");
        await harness.seedFlashcardNote(NOTE_TWO_PATH, 20, "日志二");

        const desktop = await harness.bootstrapDesktop();
        const mobile = await harness.bootstrapMobileFromDesktop();

        jest.setSystemTime(new Date("2026-04-18T08:20:00.000Z"));
        await harness.reviewCards("desktop", NOTE_TWO_PATH, 20);

        const desktopClient = harness.getClient("desktop");
        await Promise.all([
            desktopClient.plugin.flushReviewPersistence(2500, { notify: false }),
            (desktopClient.plugin as any).savePluginData({
                domains: ["daily-state"],
                source: "test-review-exit",
            }),
        ]);

        await harness.sync("desktop", "incremental");
        await harness.sync("mobile", "incremental");
        await harness.restartClient("desktop");
        await harness.restartClient("mobile");
        await harness.sync("desktop", "incremental");
        await harness.sync("mobile", "incremental");

        const diagnostics = harness.collectDiagnostics(["desktop", "mobile"], TARGET_DECK_PATHS);
        expectDiagnosticsMatch(diagnostics, "desktop", "mobile");

        const desktopFolderName = ((desktop.plugin as any).syroLayout.deviceRoot as string)
            .split("/")
            .pop() as string;
        const desktopDailyTargetUuids = dailyStateTargetUuidsForDevice(
            diagnostics,
            desktopFolderName,
        );
        expect(new Set(desktopDailyTargetUuids).size).toBe(desktopDailyTargetUuids.length);
    });

    test("deck-options assignment conflicts plus a later rename converge tracked files and deck-options formal state on both devices", async () => {
        const harness = createSyroMultiDeviceHarness();
        const originalNotePath = "Archive/Deck Options Original.md";
        const renamedNotePath = "Archive/Deck Options Renamed.md";
        await harness.seedFlashcardNote(originalNotePath, 6, "Rename");

        await harness.bootstrapDesktop();
        await harness.sync("desktop", "incremental");
        await harness.bootstrapMobileFromDesktop();

        const desktopClient = await harness.activateClient("desktop");
        const desktopPreset = {
            ...DEFAULT_SETTINGS.deckOptionsPresets[0],
            uuid: "deck-preset-desktop-rename",
            createdAt: "2026-04-18T08:01:00.000Z",
            name: "Desktop Rename",
        };
        desktopClient.plugin.data.settings.deckOptionsPresets = [
            desktopClient.plugin.data.settings.deckOptionsPresets[0],
            desktopPreset,
        ];
        desktopClient.plugin.data.settings.deckPresetAssignment = {
            [noteDeckPath(originalNotePath)]: desktopPreset.uuid,
        };
        await desktopClient.plugin.saveDeckOptionsAndRequestSync();

        await harness.sync("mobile", "incremental");

        const mobileClient = await harness.activateClient("mobile");
        const mobilePreset = {
            ...DEFAULT_SETTINGS.deckOptionsPresets[0],
            uuid: "deck-preset-mobile-rename",
            createdAt: "2026-04-18T08:02:00.000Z",
            name: "Mobile Rename",
        };
        mobileClient.plugin.data.settings.deckOptionsPresets = [
            ...mobileClient.plugin.data.settings.deckOptionsPresets.filter(
                (preset) => preset.uuid !== mobilePreset.uuid,
            ),
            mobilePreset,
        ];
        mobileClient.plugin.data.settings.deckPresetAssignment = {
            [noteDeckPath(originalNotePath)]: mobilePreset.uuid,
        };
        await mobileClient.plugin.saveDeckOptionsAndRequestSync();

        await harness.sync("desktop", "incremental");

        await desktopClient.app.vault.adapter.rename(originalNotePath, renamedNotePath);
        const renamedNote = desktopClient.plugin.noteReviewStore?.renameWithSnapshot(
            originalNotePath,
            renamedNotePath,
        );
        if (renamedNote) {
            await desktopClient.plugin.noteReviewStore?.save();
            await desktopClient.plugin.appendSyroNoteRename(originalNotePath, renamedNote);
        }
        const renamedTimeline = desktopClient.plugin.reviewCommitStore?.renameFileWithSnapshot(
            originalNotePath,
            renamedNotePath,
        );
        if (renamedTimeline) {
            await desktopClient.plugin.reviewCommitStore?.save();
            await desktopClient.plugin.appendSyroTimelineRenameFile(
                originalNotePath,
                renamedNotePath,
                renamedTimeline.commits,
            );
        }
        const renamedTrackedFiles =
            desktopClient.plugin.store?.renamePathPrefixWithSnapshots(
                originalNotePath,
                renamedNotePath,
            ) ?? [];
        if (renamedTrackedFiles.length > 0) {
            await desktopClient.plugin.store?.save();
            for (const snapshot of renamedTrackedFiles) {
                await desktopClient.plugin.appendSyroCardsRenameFile(
                    snapshot.oldPath,
                    snapshot.file,
                );
            }
        }
        desktopClient.plugin.renameDeckOptionsAssignments(originalNotePath, renamedNotePath);
        await (desktopClient.plugin as any).savePluginData({
            domains: ["deck-options"],
            source: "test-rename",
        });

        await harness.sync("desktop", "incremental");
        await harness.sync("mobile", "incremental");
        await harness.restartClient("desktop");
        await harness.restartClient("mobile");
        await harness.sync("desktop", "incremental");
        await harness.sync("mobile", "incremental");

        const diagnostics = harness.collectDiagnostics(
            ["desktop", "mobile"],
            ["Archive", noteDeckPath(originalNotePath), noteDeckPath(renamedNotePath)],
        );
        debugDiagnostics("deck-options-rename-final", diagnostics);
        expectDiagnosticsMatch(diagnostics, "desktop", "mobile");

        expect(
            diagnostics.trackedFilesByClient.desktop.every(
                (entry) => entry.path !== originalNotePath,
            ),
        ).toBe(true);
        expect(
            diagnostics.trackedFilesByClient.mobile.every(
                (entry) => entry.path !== originalNotePath,
            ),
        ).toBe(true);
        expect(diagnostics.deckOptionsByClient.desktop?.assignments).toContainEqual([
            noteDeckPath(renamedNotePath),
            "deck-preset-desktop-rename",
        ]);
        expect(diagnostics.deckOptionsByClient.mobile?.assignments).toContainEqual([
            noteDeckPath(renamedNotePath),
            "deck-preset-desktop-rename",
        ]);
        expect(
            diagnostics.deckOptionsByClient.desktop?.assignments.some(
                ([deckPath]) => deckPath === noteDeckPath(originalNotePath),
            ),
        ).toBe(false);
        expect(
            diagnostics.deckOptionsByClient.mobile?.assignments.some(
                ([deckPath]) => deckPath === noteDeckPath(originalNotePath),
            ),
        ).toBe(false);

        const allSessionRecords = Object.values(diagnostics.sessionDigestsByDevice).flat();
        expect(
            allSessionRecords.some(
                (record) =>
                    record.domain === "deck-options" &&
                    record.entityType === "deck-options-assignment",
            ),
        ).toBe(true);
        expect(
            allSessionRecords.some(
                (record) =>
                    record.domain === "cards" &&
                    record.entityType === "tracked-file" &&
                    record.opType === "rename-file",
            ),
        ).toBe(true);
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
        store!.reviewId(targetItem!.ID, 2, client.plugin.data.settings.fsrsSettings);
        const commitId = coordinator!.queueCardCommit(targetItem!.ID, "review");
        client.plugin.incrementDailyCounts(NOTE_ONE_PATH.replace(/\.md$/i, ""), wasNew);
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
        await manager.importPendingSessions(
            async (_sessionId: string, records: Array<{ opId: string }>) => {
                importedOpIds.push(...records.map((record) => record.opId));
            },
        );

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
