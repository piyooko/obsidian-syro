import { SyncEvents } from "../Events/SyncEvents";
import { Card } from "../Card";
import { Deck } from "../Deck";
import { RepetitionItem } from "./repetitionItem";

export interface DeckStats {
    newCount: number;
    learnCount: number;
    dueCount: number;
    totalCount: number;
}

export class DeckStatsService {
    private static instance: DeckStatsService;
    private cache: Map<string, DeckStats> = new Map();
    private syncEvents: SyncEvents | null = null;

    private constructor() {}

    public static getInstance(): DeckStatsService {
        if (!DeckStatsService.instance) {
            DeckStatsService.instance = new DeckStatsService();
        }
        return DeckStatsService.instance;
    }

    public setSyncEvents(syncEvents: SyncEvents): void {
        this.syncEvents = syncEvents;
    }

    public calculateDeckStats(
        deckName: string,
        items: RepetitionItem[],
        learnAheadMillis: number = 0,
        now: number = Date.now(),
    ): void {
        let newCount = 0;
        let learnCount = 0;
        let dueCount = 0;
        let totalCount = 0;

        for (const item of items) {
            if (!item) continue;

            totalCount++;

            if (item.isNew) {
                newCount++;
            } else if (item.isReviewableLearning(now, learnAheadMillis)) {
                learnCount++;
            } else if (item.isDue) {
                dueCount++;
            }
        }

        this.cache.set(deckName, {
            newCount,
            learnCount,
            dueCount,
            totalCount,
        });

        if (this.syncEvents) {
            this.syncEvents.emit("deck-stats-updated");
        }
    }

    public recalculateDeck(
        deck: Deck | null | undefined,
        learnAheadMillis: number = 0,
        now: number = Date.now(),
    ): void {
        if (!deck) return;

        const deckName =
            deck.deckName === "root"
                ? "root"
                : deck.getTopicPath
                  ? deck.getTopicPath().path.join("/")
                  : deck.deckName;
        const items = [...deck.newFlashcards, ...deck.dueFlashcards, ...deck.learningFlashcards]
            .map((card: Card) => card.repetitionItem)
            .filter((item): item is RepetitionItem => Boolean(item));

        this.calculateDeckStats(deckName, items, learnAheadMillis, now);
    }

    public getStatsForDeck(deckName: string, includeChildren: boolean = false): DeckStats {
        const result: DeckStats = {
            newCount: 0,
            learnCount: 0,
            dueCount: 0,
            totalCount: 0,
        };

        if (!includeChildren) {
            const stats = this.cache.get(deckName);
            if (stats) {
                result.newCount += stats.newCount;
                result.learnCount += stats.learnCount;
                result.dueCount += stats.dueCount;
                result.totalCount += stats.totalCount;
            }
            return result;
        }

        if (deckName === "root" || deckName === "") {
            for (const stats of this.cache.values()) {
                result.newCount += stats.newCount;
                result.learnCount += stats.learnCount;
                result.dueCount += stats.dueCount;
                result.totalCount += stats.totalCount;
            }
            return result;
        }

        const prefix = `${deckName}/`;
        for (const [key, stats] of this.cache.entries()) {
            if (key === deckName || key.startsWith(prefix)) {
                result.newCount += stats.newCount;
                result.learnCount += stats.learnCount;
                result.dueCount += stats.dueCount;
                result.totalCount += stats.totalCount;
            }
        }

        return result;
    }

    public clearCache(): void {
        this.cache.clear();
    }
}
