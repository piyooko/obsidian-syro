import type { SyroSyncDiagnosticContext } from "./syroSyncDiagnosticHarness";

export function createSyroSyncFileLifecycleProbe(path: string) {
    return {
        async rename(
            ctx: SyroSyncDiagnosticContext,
            client: string,
            newPath: string,
        ): Promise<void> {
            await ctx.harness.renameVaultFile(client, path, newPath);
        },

        async delete(ctx: SyroSyncDiagnosticContext, client: string): Promise<void> {
            await ctx.harness.deleteVaultFile(client, path);
        },

        async recreate(
            ctx: SyroSyncDiagnosticContext,
            client: string,
            text: string,
        ): Promise<void> {
            await ctx.harness.modifyVaultFile(client, path, text);
        },
    };
}
