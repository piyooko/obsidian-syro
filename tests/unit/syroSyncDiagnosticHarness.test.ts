import {
    createSyroSyncDiagnosticHarness,
    SyroSyncDiagnosticError,
} from "./helpers/syroSyncDiagnosticHarness";

describe("syro sync diagnostic harness", () => {
    test("wraps a missing session assertion with the failing sync stage", async () => {
        const diagnostic = createSyroSyncDiagnosticHarness();

        await expect(
            diagnostic.runScenario({
                name: "missing-session-record",
                seed: async () => undefined,
                actions: [
                    {
                        name: "expect memo record",
                        client: "desktop",
                        run: async () => undefined,
                        expectLocal: async () => undefined,
                        expectSession: async (ctx) => {
                            ctx.expectSessionRecord({
                                client: "desktop",
                                domain: "extracts",
                                entityType: "extract-item",
                                opType: "memo",
                            });
                        },
                    },
                ],
                syncPlan: [],
                expectFinal: async () => undefined,
            }),
        ).rejects.toMatchObject({
            name: "SyroSyncDiagnosticError",
            scenarioName: "missing-session-record",
            actionName: "expect memo record",
            stage: "session",
        } satisfies Partial<SyroSyncDiagnosticError>);
    });

    test("filters full session records by client and record shape", async () => {
        const diagnostic = createSyroSyncDiagnosticHarness();
        const ctx = diagnostic.context;

        await ctx.harness.seedVaultFile("cards/filter.md", "#flashcards\n\nAlpha::Beta\n");
        await ctx.harness.bootstrapDesktop();
        await ctx.harness.sync("desktop", "full");

        const records = ctx.readSessionRecords({
            client: "desktop",
        });

        expect(records.length).toBeGreaterThan(0);
        expect(records[0].record.payload).toEqual(expect.any(Object));
    });
});
