import { createSyroSyncDiagnosticHarness } from "./helpers/syroSyncDiagnosticHarness";
import { createSyroSyncTimelineProbe } from "./helpers/syroSyncTimelineProbe";

const NOTE_PATH = "Sync QA/diagnostic/timeline.md";

describe("syro sync timeline diagnostic probe", () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date("2026-05-03T10:00:00.000Z"));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("diagnoses timeline add, edit, and delete session replay", async () => {
        const diagnostic = createSyroSyncDiagnosticHarness();
        const timelineProbe = createSyroSyncTimelineProbe(NOTE_PATH);

        await diagnostic.runScenario({
            name: "timeline add edit delete chain",
            seed: async (ctx) => {
                await ctx.harness.seedVaultFile(NOTE_PATH, "# Timeline\n\nbody\n");
                await ctx.harness.bootstrapDesktop();
                await ctx.harness.sync("desktop", "full");
                await ctx.harness.bootstrapMobileFromDesktop();
            },
            actions: [
                {
                    name: "desktop add timeline",
                    client: "desktop",
                    run: async (ctx) => {
                        await timelineProbe.addManualCommit(ctx, "desktop", "timeline one");
                    },
                    expectLocal: async (ctx) => {
                        timelineProbe.expectTimelineMessage(ctx, "desktop", "timeline one");
                    },
                    expectSession: async (ctx) => {
                        ctx.expectSessionRecord({
                            client: "desktop",
                            domain: "timeline",
                            entityType: "timeline-entry",
                            opType: "add",
                            payload: (payload) =>
                                (payload as { commit?: { message?: string } }).commit?.message ===
                                "timeline one",
                        });
                    },
                },
                {
                    name: "desktop edit timeline",
                    client: "desktop",
                    run: async (ctx) => {
                        await timelineProbe.editLatestCommit(ctx, "desktop", "timeline two");
                    },
                    expectLocal: async (ctx) => {
                        timelineProbe.expectTimelineMessage(ctx, "desktop", "timeline two");
                    },
                    expectSession: async (ctx) => {
                        ctx.expectSessionRecord({
                            client: "desktop",
                            domain: "timeline",
                            entityType: "timeline-entry",
                            opType: "edit",
                            payload: (payload) =>
                                (payload as { commit?: { message?: string } }).commit?.message ===
                                "timeline two",
                        });
                    },
                },
                {
                    name: "desktop delete timeline",
                    client: "desktop",
                    run: async (ctx) => {
                        await timelineProbe.deleteLatestCommit(ctx, "desktop");
                    },
                    expectLocal: async (ctx) => {
                        timelineProbe.expectNoTimelineEntries(ctx, "desktop");
                    },
                    expectSession: async (ctx) => {
                        ctx.expectSessionRecord({
                            client: "desktop",
                            domain: "timeline",
                            entityType: "timeline-entry",
                            opType: "delete",
                        });
                    },
                },
            ],
            syncPlan: ["mobile"],
            expectFinal: async (ctx) => {
                timelineProbe.expectNoTimelineEntries(ctx, "mobile");
            },
        });
    });
});
