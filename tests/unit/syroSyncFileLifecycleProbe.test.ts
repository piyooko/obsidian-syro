import { createSyroSyncDiagnosticHarness } from "./helpers/syroSyncDiagnosticHarness";
import { createSyroSyncExtractProbe } from "./helpers/syroSyncExtractProbe";
import { createSyroSyncFileLifecycleProbe } from "./helpers/syroSyncFileLifecycleProbe";

const NOTE_PATH = "Sync QA/diagnostic/lifecycle.md";
const RENAMED_PATH = "Sync QA/diagnostic/lifecycle-renamed.md";
const NOTE_TEXT = [
    "#flashcards",
    "",
    "{{ir::alpha}}",
    "",
    "Card alpha question::Card alpha answer",
    "",
].join("\n");

describe("syro sync file lifecycle diagnostic probe", () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date("2026-05-03T11:00:00.000Z"));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("diagnoses rename sessions for extracts, cards, and file identity state", async () => {
        const diagnostic = createSyroSyncDiagnosticHarness();
        const fileProbe = createSyroSyncFileLifecycleProbe(NOTE_PATH);

        await diagnostic.runScenario({
            name: "file lifecycle rename chain",
            seed: async (ctx) => {
                await ctx.harness.seedVaultFile(NOTE_PATH, NOTE_TEXT);
                await ctx.harness.bootstrapDesktop();
                await ctx.harness.sync("desktop", "full");
                await ctx.harness.bootstrapMobileFromDesktop();
            },
            actions: [
                {
                    name: "desktop rename source file",
                    client: "desktop",
                    run: async (ctx) => {
                        await fileProbe.rename(ctx, "desktop", RENAMED_PATH);
                    },
                    expectLocal: async (ctx) => {
                        const renamedExtractProbe = createSyroSyncExtractProbe(RENAMED_PATH);
                        renamedExtractProbe.expectExtractState(ctx, "desktop", "alpha", {
                            syncDeleted: false,
                        });
                        expect(
                            ctx.harness
                                .readCardsFormalState("desktop")
                                .some((entry) => entry.path === RENAMED_PATH),
                        ).toBe(true);
                    },
                    expectSession: async (ctx) => {
                        ctx.expectSessionRecord({
                            client: "desktop",
                            domain: "file-identities",
                            entityType: "file-identity",
                            opType: "upsert",
                            payload: (payload) =>
                                (payload as { oldPath?: string; newPath?: string }).oldPath ===
                                    NOTE_PATH &&
                                (payload as { newPath?: string }).newPath === RENAMED_PATH,
                        });
                        ctx.expectSessionRecord({
                            client: "desktop",
                            domain: "extracts",
                            entityType: "extract-item",
                            opType: "sync",
                            payload: (payload) =>
                                (payload as { item?: { sourcePath?: string } }).item?.sourcePath ===
                                RENAMED_PATH,
                        });
                        ctx.expectSessionRecord({
                            client: "desktop",
                            domain: "cards",
                            entityType: "tracked-file",
                            opType: "rename-file",
                            payload: (payload) =>
                                (payload as { oldPath?: string; newPath?: string }).oldPath ===
                                    NOTE_PATH &&
                                (payload as { newPath?: string }).newPath === RENAMED_PATH,
                        });
                    },
                },
            ],
            syncPlan: ["mobile"],
            expectFinal: async (ctx) => {
                const renamedExtractProbe = createSyroSyncExtractProbe(RENAMED_PATH);
                renamedExtractProbe.expectExtractState(ctx, "mobile", "alpha", {
                    syncDeleted: false,
                });
                expect(
                    ctx.harness
                        .readCardsFormalState("mobile")
                        .some((entry) => entry.path === RENAMED_PATH),
                ).toBe(true);
            },
        });
    });
});
