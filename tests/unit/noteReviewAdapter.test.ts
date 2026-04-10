import { reviewDecksToSidebarState } from "src/ui/adapters/noteReviewAdapter";

jest.mock("src/lang/helpers", () => ({
    t: (key: string) => key,
}));

jest.mock("src/util/DateProvider", () => ({
    globalDateProvider: {
        endofToday: {
            valueOf: () => 0,
        },
    },
}));

describe("reviewDecksToSidebarState", () => {
    it("extracts sidebar tags only from file frontmatter properties", () => {
        const plugin = {
            reviewDecks: {
                default: {
                    newNotes: [
                        {
                            note: { path: "Inbox/Test.md", basename: "Test" },
                            item: { priority: 3 },
                        },
                    ],
                    scheduledNotes: [],
                },
            },
            app: {
                metadataCache: {
                    getFileCache: jest.fn().mockReturnValue({
                        frontmatter: {
                            tags: ["project", "#project/alpha", "project"],
                        },
                        tags: [{ tag: "#inline-only" }],
                    }),
                },
            },
        } as any;

        const state = reviewDecksToSidebarState(plugin);

        expect(state.sections).toHaveLength(1);
        expect(state.sections[0].items[0].tags).toEqual(["project", "project/alpha"]);
    });

    it("injects latest scroll percentages without changing sidebar grouping or ordering", () => {
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
                            dueUnix: 2 * 24 * 60 * 60 * 1000,
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
