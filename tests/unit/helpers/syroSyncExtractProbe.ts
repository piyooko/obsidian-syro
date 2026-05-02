import { TFile } from "obsidian";
import type { ReviewResponse } from "src/scheduling";
import type { HarnessExtractStateEntry } from "./createSyroMultiDeviceHarness";
import type { SyroSyncDiagnosticContext } from "./syroSyncDiagnosticHarness";

export interface ExtractStateExpectation {
    memo?: string;
    priority?: number;
    timesReviewed?: number;
    timesCorrect?: number;
    errorStreak?: number;
    stage?: string;
    syncDeleted?: boolean;
}

export interface ExtractDeleteRecreateChain {
    rawMarkdown: string;
    removedUuid: string;
    recreatedUuid: string;
    path: string;
}

export function createSyroSyncExtractProbe(sourcePath: string) {
    const findExtract = (
        ctx: SyroSyncDiagnosticContext,
        client: string,
        rawMarkdown: string,
    ): HarnessExtractStateEntry => {
        const entries = ctx.harness
            .readExtractsFormalState(client)
            .filter(
                (entry) => entry.sourcePath === sourcePath && entry.rawMarkdown === rawMarkdown,
            );
        if (entries.length === 0) {
            throw new Error(`Missing extract ${rawMarkdown} for ${client}:${sourcePath}`);
        }
        if (entries.length > 1) {
            throw new Error(`Ambiguous extract ${rawMarkdown} for ${client}:${sourcePath}`);
        }
        return entries[0];
    };

    return {
        findExtract,

        async updateMemo(
            ctx: SyroSyncDiagnosticContext,
            client: string,
            rawMarkdown: string,
            memo: string,
        ): Promise<void> {
            const item = findExtract(ctx, client, rawMarkdown);
            const plugin = ctx.harness.getClient(client).plugin;
            await plugin.updateExtractMemo(item.uuid, memo);
        },

        async review(
            ctx: SyroSyncDiagnosticContext,
            client: string,
            rawMarkdown: string,
            response: ReviewResponse,
        ): Promise<void> {
            const item = findExtract(ctx, client, rawMarkdown);
            const plugin = ctx.harness.getClient(client).plugin;
            await plugin.reviewExtract(item.uuid, response, item.deckName);
        },

        async graduate(
            ctx: SyroSyncDiagnosticContext,
            client: string,
            rawMarkdown: string,
        ): Promise<void> {
            const item = findExtract(ctx, client, rawMarkdown);
            const plugin = ctx.harness.getClient(client).plugin;
            await plugin.graduateExtract(item.uuid, item.deckName);
        },

        expectExtractState(
            ctx: SyroSyncDiagnosticContext,
            client: string,
            rawMarkdown: string,
            expected: ExtractStateExpectation,
        ): void {
            const item = findExtract(ctx, client, rawMarkdown);
            expect(item).toEqual(expect.objectContaining(expected));
        },

        findDeleteRecreateChains(
            ctx: SyroSyncDiagnosticContext,
            client: string,
            path: string,
        ): ExtractDeleteRecreateChain[] {
            const removeRecords = ctx.readSessionRecords({
                client,
                domain: "extracts",
                entityType: "extract-item",
                opType: "remove",
            });
            const createRecords = ctx.readSessionRecords({
                client,
                domain: "extracts",
                entityType: "extract-item",
                opType: "create",
            });
            const chains: ExtractDeleteRecreateChain[] = [];
            for (const removeRecord of removeRecords) {
                const removedItem = (removeRecord.record.payload as { item?: any }).item;
                if (!removedItem || removedItem.sourcePath !== path) {
                    continue;
                }
                const recreated = createRecords
                    .map((record) => (record.record.payload as { item?: any }).item)
                    .find(
                        (item) =>
                            item?.sourcePath === path &&
                            item.rawMarkdown === removedItem.rawMarkdown &&
                            item.uuid !== removedItem.uuid,
                    );
                if (!recreated) {
                    continue;
                }
                chains.push({
                    rawMarkdown: String(removedItem.rawMarkdown),
                    removedUuid: String(removedItem.uuid),
                    recreatedUuid: String(recreated.uuid),
                    path,
                });
            }
            return chains;
        },

        async syncFile(ctx: SyroSyncDiagnosticContext, client: string): Promise<void> {
            const plugin = ctx.harness.getClient(client).plugin;
            await plugin.syncExtractsFromFile(
                Object.assign(new TFile(), {
                    path: sourcePath,
                    name: sourcePath.split("/").pop() ?? sourcePath,
                    basename: sourcePath.replace(/\.md$/i, ""),
                    extension: "md",
                }),
            );
        },
    };
}
