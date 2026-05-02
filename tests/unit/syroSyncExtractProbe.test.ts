import { ReviewResponse } from "src/scheduling";
import { createSyroSyncDiagnosticHarness } from "./helpers/syroSyncDiagnosticHarness";
import { createSyroSyncExtractProbe } from "./helpers/syroSyncExtractProbe";

const NOTE_PATH = "Sync QA/diagnostic/extracts.md";
const NOTE_TEXT = [
    "# Extract Diagnostics",
    "",
    "{{ir::alpha}}",
    "",
    "{{ir::beta}}",
    "",
].join("\n");

describe("syro sync extract diagnostic probe", () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date("2026-05-03T08:00:00.000Z"));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("diagnoses the extract memo write -> session -> replay chain", async () => {
        const diagnostic = createSyroSyncDiagnosticHarness();
        const extractProbe = createSyroSyncExtractProbe(NOTE_PATH);

        await diagnostic.runScenario({
            name: "extract memo chain",
            seed: async (ctx) => {
                await ctx.harness.seedVaultFile(NOTE_PATH, NOTE_TEXT);
                await ctx.harness.bootstrapDesktop();
                await ctx.harness.sync("desktop", "full");
                await ctx.harness.bootstrapMobileFromDesktop();
            },
            actions: [
                {
                    name: "desktop memo alpha",
                    client: "desktop",
                    run: async (ctx) => {
                        await extractProbe.updateMemo(ctx, "desktop", "alpha", "memo from desktop");
                    },
                    expectLocal: async (ctx) => {
                        extractProbe.expectExtractState(ctx, "desktop", "alpha", {
                            memo: "memo from desktop",
                            syncDeleted: false,
                        });
                    },
                    expectSession: async (ctx) => {
                        const alpha = extractProbe.findExtract(ctx, "desktop", "alpha");
                        ctx.expectSessionRecord({
                            client: "desktop",
                            domain: "extracts",
                            entityType: "extract-item",
                            opType: "memo",
                            targetUuid: alpha.uuid,
                            payload: (payload) =>
                                (payload as { item?: { memo?: string } }).item?.memo ===
                                "memo from desktop",
                        });
                    },
                },
            ],
            syncPlan: ["mobile"],
            expectFinal: async (ctx) => {
                extractProbe.expectExtractState(ctx, "mobile", "alpha", {
                    memo: "memo from desktop",
                    syncDeleted: false,
                });
                ctx.expectFormalConvergence("extracts", ["desktop", "mobile"]);
            },
        });
    });

    test("diagnoses extract review fields through replay", async () => {
        const diagnostic = createSyroSyncDiagnosticHarness();
        const extractProbe = createSyroSyncExtractProbe(NOTE_PATH);

        await diagnostic.runScenario({
            name: "extract review chain",
            seed: async (ctx) => {
                await ctx.harness.seedVaultFile(NOTE_PATH, NOTE_TEXT);
                await ctx.harness.bootstrapDesktop();
                await ctx.harness.sync("desktop", "full");
                await ctx.harness.bootstrapMobileFromDesktop();
            },
            actions: [
                {
                    name: "mobile review beta",
                    client: "mobile",
                    run: async (ctx) => {
                        await extractProbe.review(ctx, "mobile", "beta", ReviewResponse.Good);
                    },
                    expectLocal: async (ctx) => {
                        extractProbe.expectExtractState(ctx, "mobile", "beta", {
                            timesReviewed: 1,
                            timesCorrect: 1,
                            syncDeleted: false,
                        });
                    },
                    expectSession: async (ctx) => {
                        const beta = extractProbe.findExtract(ctx, "mobile", "beta");
                        ctx.expectSessionRecord({
                            client: "mobile",
                            domain: "extracts",
                            entityType: "extract-item",
                            opType: "review",
                            targetUuid: beta.uuid,
                            payload: (payload) =>
                                (payload as { item?: { timesReviewed?: number } }).item
                                    ?.timesReviewed === 1,
                        });
                    },
                },
            ],
            syncPlan: ["desktop"],
            expectFinal: async (ctx) => {
                extractProbe.expectExtractState(ctx, "desktop", "beta", {
                    timesReviewed: 1,
                    timesCorrect: 1,
                    syncDeleted: false,
                });
            },
        });
    });

    test("diagnoses delete and recreate as a tombstone plus new uuid chain", async () => {
        const diagnostic = createSyroSyncDiagnosticHarness();
        const extractProbe = createSyroSyncExtractProbe(NOTE_PATH);

        await diagnostic.runScenario({
            name: "extract delete recreate chain",
            seed: async (ctx) => {
                await ctx.harness.seedVaultFile(NOTE_PATH, NOTE_TEXT);
                await ctx.harness.bootstrapDesktop();
                await ctx.harness.sync("desktop", "full");
                await ctx.harness.bootstrapMobileFromDesktop();
            },
            actions: [
                {
                    name: "desktop memo before delete",
                    client: "desktop",
                    run: async (ctx) => {
                        await extractProbe.updateMemo(ctx, "desktop", "alpha", "memo before delete");
                    },
                    expectLocal: async (ctx) => {
                        extractProbe.expectExtractState(ctx, "desktop", "alpha", {
                            memo: "memo before delete",
                        });
                    },
                    expectSession: async (ctx) => {
                        ctx.expectSessionRecord({
                            client: "desktop",
                            domain: "extracts",
                            entityType: "extract-item",
                            opType: "memo",
                        });
                    },
                },
                {
                    name: "desktop delete and recreate original path",
                    client: "desktop",
                    run: async (ctx) => {
                        await ctx.harness.deleteVaultFile("desktop", NOTE_PATH);
                        await ctx.harness.modifyVaultFile("desktop", NOTE_PATH, NOTE_TEXT);
                    },
                    expectLocal: async () => undefined,
                    expectSession: async (ctx) => {
                        const chains = extractProbe.findDeleteRecreateChains(ctx, "desktop", NOTE_PATH);
                        expect(chains).toEqual(
                            expect.arrayContaining([
                                expect.objectContaining({
                                    rawMarkdown: "alpha",
                                    removedUuid: expect.any(String),
                                    recreatedUuid: expect.any(String),
                                }),
                            ]),
                        );
                        expect(chains.find((chain) => chain.rawMarkdown === "alpha")?.removedUuid).not.toBe(
                            chains.find((chain) => chain.rawMarkdown === "alpha")?.recreatedUuid,
                        );
                    },
                },
            ],
            syncPlan: [],
            expectFinal: async () => undefined,
        });
    });
});
