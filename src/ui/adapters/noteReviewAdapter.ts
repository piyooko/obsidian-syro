import { CachedMetadata } from "obsidian";
import type SRPlugin from "src/main";
import type { ReviewDeck, SchedNote } from "src/ReviewDeck";
import type {
    NoteReviewSection,
    NoteReviewItem,
    NoteReviewSidebarState,
} from "../types/noteReview";
import { globalDateProvider } from "src/util/DateProvider";
import { t } from "src/lang/helpers";
import { Tags } from "src/tags";

const COLORS = {
    new: "var(--text-accent)",
    overdue: "#ff5555",
    today: "#ff9f1c",
    soon: "#ffc107",
    future: "#4caf50",
    later: "#2196f3",
};

function extractTags(fileCache: CachedMetadata | null): string[] {
    return Tags.getSidebarDisplayTags(fileCache);
}

function schedNoteToItem(sNote: SchedNote, index: number, plugin: SRPlugin): NoteReviewItem {
    const fileCache = plugin.app.metadataCache.getFileCache(sNote.note);
    return {
        id: `note-${sNote.note.path}-${index}`,
        title: sNote.note.basename,
        priority: sNote.item?.priority ?? 5,
        path: sNote.note.path,
        noteFile: sNote.note,
        dueUnix: sNote.dueUnix,
        isNew: false,
        lastScrollPercentage: plugin.reviewCommitStore?.getLatestScrollPercentage(sNote.note.path),
        tags: extractTags(fileCache),
    };
}

function newNoteToItem(sNote: SchedNote, index: number, plugin: SRPlugin): NoteReviewItem {
    const fileCache = plugin.app.metadataCache.getFileCache(sNote.note);
    return {
        id: `new-${sNote.note.path}-${index}`,
        title: sNote.note.basename,
        priority: sNote.item?.priority ?? 5,
        path: sNote.note.path,
        noteFile: sNote.note,
        isNew: true,
        lastScrollPercentage: plugin.reviewCommitStore?.getLatestScrollPercentage(sNote.note.path),
        tags: extractTags(fileCache),
    };
}

function getDaysGroupInfo(nDays: number): { title: string; color: string; sortOrder: number } {
    if (nDays < 0) {
        return {
            title: t("ADAPTER_DAYS_OVERDUE", { days: Math.abs(nDays) }),
            color: COLORS.overdue,
            sortOrder: nDays,
        };
    }

    if (nDays === 0) {
        return {
            title: t("ADAPTER_TODAY"),
            color: COLORS.today,
            sortOrder: 0,
        };
    }

    if (nDays === 1) {
        return {
            title: t("ADAPTER_TOMORROW"),
            color: COLORS.soon,
            sortOrder: 1,
        };
    }

    if (nDays <= 7) {
        return {
            title: t("ADAPTER_DAYS_FUTURE", { days: nDays }),
            color: COLORS.future,
            sortOrder: nDays,
        };
    }

    return {
        title: t("ADAPTER_DAYS_FUTURE", { days: nDays }),
        color: COLORS.later,
        sortOrder: nDays,
    };
}

export function reviewDeckToSections(deck: ReviewDeck, plugin: SRPlugin): NoteReviewSection[] {
    const sections: NoteReviewSection[] = [];
    const now = globalDateProvider.endofToday.valueOf();

    if (deck.newNotes.length > 0) {
        const newItems = deck.newNotes.map((note, index) => newNoteToItem(note, index, plugin));
        sections.push({
            id: "new",
            title: t("NEW"),
            count: newItems.length,
            color: COLORS.new,
            items: newItems,
        });
    }

    if (deck.scheduledNotes.length > 0) {
        const dayGroups = new Map<number, NoteReviewItem[]>();

        for (let i = 0; i < deck.scheduledNotes.length; i++) {
            const sNote = deck.scheduledNotes[i];
            const nDays = Math.ceil(((sNote.dueUnix ?? now) - now) / (24 * 3600 * 1000));

            if (!dayGroups.has(nDays)) {
                dayGroups.set(nDays, []);
            }

            dayGroups.get(nDays)?.push(schedNoteToItem(sNote, i, plugin));
        }

        const sortedDays = Array.from(dayGroups.keys()).sort((a, b) => a - b);

        for (const nDays of sortedDays) {
            const items = dayGroups.get(nDays) ?? [];
            const groupInfo = getDaysGroupInfo(nDays);

            sections.push({
                id: `day-${nDays}`,
                title: groupInfo.title,
                count: items.length,
                color: groupInfo.color,
                items,
            });
        }
    }

    return sections;
}

export function reviewDecksToSidebarState(
    plugin: SRPlugin,
    deckName?: string,
): NoteReviewSidebarState {
    const allSections: NoteReviewSection[] = [];
    let totalCount = 0;

    for (const key in plugin.reviewDecks) {
        if (deckName && key !== deckName) continue;

        const deck = plugin.reviewDecks[key];
        const sections = reviewDeckToSections(deck, plugin);

        for (const section of sections) {
            const existing = allSections.find((s) => s.id === section.id);
            if (existing) {
                existing.items.push(...section.items);
                existing.count += section.count;
            } else {
                allSections.push({ ...section });
            }
        }

        totalCount += deck.newNotes.length + deck.scheduledNotes.length;
    }

    allSections.sort((a, b) => {
        const getWeight = (id: string): number => {
            if (id === "new") return 0.5;
            const day = parseInt(id.replace("day-", ""));
            if (isNaN(day)) return 1000;
            return day;
        };

        return getWeight(a.id) - getWeight(b.id);
    });

    return {
        sections: allSections,
        totalCount,
        currentDeckName: deckName,
    };
}
