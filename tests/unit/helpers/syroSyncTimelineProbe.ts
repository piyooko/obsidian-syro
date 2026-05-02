import type { ReviewCommitLog } from "src/dataStore/reviewCommitStore";
import type { SyroSyncDiagnosticContext } from "./syroSyncDiagnosticHarness";

export function createSyroSyncTimelineProbe(notePath: string) {
    const latestCommit = (ctx: SyroSyncDiagnosticContext, client: string): ReviewCommitLog => {
        const plugin = ctx.harness.getClient(client).plugin;
        const commit = plugin.reviewCommitStore?.getCommitsSnapshot(notePath)[0];
        if (!commit) {
            throw new Error(`Missing timeline commit for ${client}:${notePath}`);
        }
        return commit;
    };

    return {
        async addManualCommit(
            ctx: SyroSyncDiagnosticContext,
            client: string,
            message: string,
        ): Promise<void> {
            const plugin = ctx.harness.getClient(client).plugin;
            const commit = await plugin.reviewCommitStore?.addCommit(notePath, message);
            await plugin.appendSyroTimelineAdd(notePath, commit ?? null);
        },

        async editLatestCommit(
            ctx: SyroSyncDiagnosticContext,
            client: string,
            message: string,
        ): Promise<void> {
            const plugin = ctx.harness.getClient(client).plugin;
            const commit = latestCommit(ctx, client);
            const edited = await plugin.reviewCommitStore?.editCommit(notePath, commit.id, {
                message,
                entryType: "manual",
            });
            await plugin.appendSyroTimelineEdit(notePath, edited ?? null);
        },

        async deleteLatestCommit(ctx: SyroSyncDiagnosticContext, client: string): Promise<void> {
            const plugin = ctx.harness.getClient(client).plugin;
            const commit = latestCommit(ctx, client);
            await plugin.reviewCommitStore?.deleteCommit(notePath, commit.id);
            await plugin.appendSyroTimelineDelete(notePath, commit);
        },

        expectTimelineMessage(
            ctx: SyroSyncDiagnosticContext,
            client: string,
            message: string,
        ): void {
            const entries = ctx.harness
                .readTimelineFormalState(client)
                .filter((entry) => entry.path === notePath);
            expect(entries).toEqual(expect.arrayContaining([expect.objectContaining({ message })]));
        },

        expectNoTimelineEntries(ctx: SyroSyncDiagnosticContext, client: string): void {
            expect(
                ctx.harness
                    .readTimelineFormalState(client)
                    .filter((entry) => entry.path === notePath && !entry.syncDeleted),
            ).toEqual([]);
        },
    };
}
