import { Deck, DeckTreeFilter } from "src/Deck";
import { IFlashcardReviewSequencer } from "src/FlashcardReviewSequencer";
import type SRPlugin from "src/main";
import { TopicPath } from "src/TopicPath";
import { findDeckByPath } from "./adapters/deckAdapter";

export interface ActivateDeckReviewSessionOptions {
    plugin: SRPlugin;
    sequencer: IFlashcardReviewSequencer;
    fullPath: string;
    sourceDeckTree?: Deck;
    fullDeckTree?: Deck;
    globalRemainingDeckTree?: Deck;
    applyDailyLimits?: boolean;
}

export interface ActivateDeckReviewSessionResult {
    isolatedContextDeck: Deck;
    fullPath: string;
}

export function wrapDeckWithRoot(fullPath: string, isolatedDeck: Deck): Deck {
    const root = new Deck("Root", null);
    if (!fullPath || fullPath === "root") {
        return isolatedDeck;
    }

    const parts = fullPath.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
        const node = new Deck(parts[i], current);
        current.subdecks.push(node);
        current = node;
    }

    isolatedDeck.parent = current;
    current.subdecks.push(isolatedDeck);

    return root;
}

export function activateDeckReviewSession({
    plugin,
    sequencer,
    fullPath,
    sourceDeckTree = plugin.remainingDeckTree,
    fullDeckTree = plugin.deckTree,
    globalRemainingDeckTree = sourceDeckTree,
    applyDailyLimits = true,
}: ActivateDeckReviewSessionOptions): ActivateDeckReviewSessionResult | null {
    const rawTargetDeck = findDeckByPath(sourceDeckTree, fullPath);
    if (!rawTargetDeck) {
        return null;
    }

    const isolatedContextDeck = applyDailyLimits
        ? DeckTreeFilter.filterByDailyLimits(rawTargetDeck, plugin)
        : rawTargetDeck;
    const wrappedDeckTree = wrapDeckWithRoot(fullPath, isolatedContextDeck);

    sequencer.setDeckTree(fullDeckTree, wrappedDeckTree, globalRemainingDeckTree, fullPath);
    sequencer.setCurrentDeck(TopicPath.emptyPath);

    return {
        isolatedContextDeck,
        fullPath,
    };
}
