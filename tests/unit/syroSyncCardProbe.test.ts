import { createSyroSyncDiagnosticHarness } from "./helpers/syroSyncDiagnosticHarness";
import { createSyroSyncCardProbe } from "./helpers/syroSyncCardProbe";

const NOTE_PATH = "Sync QA/diagnostic/cards.md";

describe("syro sync card diagnostic probe", () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date("2026-05-03T09:00:00.000Z"));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("diagnoses the card review write -> session -> replay chain", async () => {
        const diagnostic = createSyroSyncDiagnosticHarness();
        const cardProbe = createSyroSyncCardProbe(NOTE_PATH);

        await diagnostic.runScenario({
            name: "card review chain",
            seed: async (ctx) => {
                await ctx.harness.seedFlashcardNote(NOTE_PATH, 2, "Card");
                await ctx.harness.bootstrapDesktop();
                await ctx.harness.sync("desktop", "full");
                await ctx.harness.bootstrapMobileFromDesktop();
            },
            actions: [
                {
                    name: "mobile review alpha",
                    client: "mobile",
                    run: async (ctx) => {
                        await cardProbe.reviewByFingerprint(ctx, "mobile", "Card 1 question");
                        await ctx.harness.stagePendingOverlay("mobile");
                        await ctx.harness.flushLocalPersistence("mobile");
                    },
                    expectLocal: async (ctx) => {
                        cardProbe.expectCardState(ctx, "mobile", "Card 1 question", {
                            timesReviewed: 1,
                        });
                    },
                    expectSession: async (ctx) => {
                        const alpha = cardProbe.findCard(ctx, "mobile", "Card 1 question");
                        ctx.expectSessionRecord({
                            client: "mobile",
                            domain: "cards",
                            entityType: "card-item",
                            opType: "review",
                            targetUuid: alpha.uuid,
                            payload: (payload) =>
                                (payload as { item?: { timesReviewed?: number } }).item
                                    ?.timesReviewed === 1,
                        });
                    },
                },
            ],
            syncPlan: ["desktop"],
            expectFinal: async (ctx) => {
                cardProbe.expectCardState(ctx, "desktop", "Card 1 question", {
                    timesReviewed: 1,
                });
            },
        });
    });
});
