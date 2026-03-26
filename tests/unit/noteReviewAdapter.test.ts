jest.mock("obsidian", () => {
    const actualMoment = require("moment");
    const moment = (...args: unknown[]) => actualMoment(...args);

    Object.assign(moment, actualMoment);
    moment.locale = jest.fn(() => "en");

    return { moment };
});

import { reviewDecksToSidebarState } from "src/ui/adapters/noteReviewAdapter";
import { globalDateProvider } from "src/util/DateProvider";

describe("noteReviewAdapter", () => {
    it("injects latest scroll percentages without changing sidebar grouping or ordering", () => {
        const now = globalDateProvider.endofToday.valueOf();
        const newFile = { path: "notes/new-note.md", basename: "New Note" };
        const futureFile = { path: "notes/future-note.md", basename: "Future Note" };
        const getLatestScrollPercentage = jest.fn((path: string) =>
            path === newFile.path ? 0 : 0.34,
        );
        const plugin = {
            app: {
                metadataCache: {
                    getFileCache: (file: { path: string }) =>
                        file.path === newFile.path
                            ? { frontmatter: { tags: ["#alpha"] } }
                            : { frontmatter: { tags: "beta, #gamma" } },
                },
            },
            reviewCommitStore: {
                getLatestScrollPercentage,
            },
            reviewDecks: {
                Inbox: {
                    deckName: "Inbox",
                    newNotes: [{ note: newFile, item: { priority: 2 } }],
                    scheduledNotes: [
                        {
                            note: futureFile,
                            item: { priority: 7 },
                            dueUnix: now + 2 * 24 * 60 * 60 * 1000,
                        },
                    ],
                },
            },
        } as any;

        const state = reviewDecksToSidebarState(plugin);

        expect(state.totalCount).toBe(2);
        expect(state.sections.map((section) => section.id)).toEqual(["new", "day-2"]);

        const newItem = state.sections[0].items[0];
        const futureItem = state.sections[1].items[0];

        expect(newItem.lastScrollPercentage).toBe(0);
        expect(futureItem.lastScrollPercentage).toBe(0.34);
        expect(newItem.tags).toEqual(["alpha"]);
        expect(futureItem.tags).toEqual(["beta", "gamma"]);
        expect(getLatestScrollPercentage).toHaveBeenCalledWith(newFile.path);
        expect(getLatestScrollPercentage).toHaveBeenCalledWith(futureFile.path);
    });
});
