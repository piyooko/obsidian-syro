import { ReviewResponse } from "src/scheduling";
import type { HarnessCardsStateEntry } from "./createSyroMultiDeviceHarness";
import type { SyroSyncDiagnosticContext } from "./syroSyncDiagnosticHarness";

export interface CardStateExpectation {
    timesReviewed?: number;
    timesCorrect?: number;
    errorStreak?: number;
    queue?: number;
}

export function createSyroSyncCardProbe(notePath: string) {
    const findCard = (
        ctx: SyroSyncDiagnosticContext,
        client: string,
        fingerprint: string,
    ): HarnessCardsStateEntry => {
        const entries = ctx.harness
            .readCardsFormalState(client)
            .filter(
                (entry) =>
                    entry.path === notePath &&
                    (entry.fingerprint === fingerprint || entry.fingerprint.includes(fingerprint)),
            );
        if (entries.length === 0) {
            throw new Error(`Missing card ${fingerprint} for ${client}:${notePath}`);
        }
        if (entries.length > 1) {
            throw new Error(`Ambiguous card ${fingerprint} for ${client}:${notePath}`);
        }
        return entries[0];
    };

    return {
        findCard,

        async seedClozeNote(
            ctx: SyroSyncDiagnosticContext,
            fingerprints: readonly string[],
        ): Promise<void> {
            const lines = ["#flashcards", ""];
            for (const fingerprint of fingerprints) {
                lines.push(`Card ${fingerprint}: {{c1::${fingerprint}}}`);
                lines.push("");
            }
            await ctx.harness.seedVaultFile(notePath, lines.join("\n"));
        },

        async reviewByFingerprint(
            ctx: SyroSyncDiagnosticContext,
            client: string,
            fingerprint: string,
        ): Promise<void> {
            const plugin = ctx.harness.getClient(client).plugin;
            const item = findCard(ctx, client, fingerprint);
            const store = plugin.store;
            if (!store || !plugin.reviewStateCommitCoordinator) {
                throw new Error(`Client ${client} is not ready for card review`);
            }
            const beforeReview = store.getItembyID(item.itemId);
            if (!beforeReview) {
                throw new Error(`Missing card item ${item.itemId}`);
            }
            store.reviewId(item.itemId, ReviewResponse.Good, plugin.data.settings.fsrsSettings);
            plugin.reviewStateCommitCoordinator.queueCardCommit(item.itemId, "review");
            plugin.incrementDailyCounts(notePath.replace(/\.md$/i, ""), beforeReview.isNew);
        },

        expectCardState(
            ctx: SyroSyncDiagnosticContext,
            client: string,
            fingerprint: string,
            expected: CardStateExpectation,
        ): void {
            const item = findCard(ctx, client, fingerprint);
            expect(item).toEqual(expect.objectContaining(expected));
        },
    };
}
