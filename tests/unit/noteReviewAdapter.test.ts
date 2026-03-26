import { getAllTags } from "obsidian";
import { reviewDecksToSidebarState } from "src/ui/adapters/noteReviewAdapter";

jest.mock("obsidian", () => ({
    getAllTags: jest.fn(),
}));

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

const getAllTagsMock = getAllTags as jest.MockedFunction<typeof getAllTags>;

describe("reviewDecksToSidebarState", () => {
    beforeEach(() => {
        getAllTagsMock.mockReset();
    });

    it("extracts Obsidian tags even when they are not stored in frontmatter.tags", () => {
        getAllTagsMock.mockReturnValue(["#project", "#project/alpha", "#project"]);

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
                    getFileCache: jest.fn().mockReturnValue({}),
                },
            },
        } as any;

        const state = reviewDecksToSidebarState(plugin);

        expect(state.sections).toHaveLength(1);
        expect(state.sections[0].items[0].tags).toEqual(["project", "project/alpha"]);
        expect(getAllTagsMock).toHaveBeenCalledWith({});
    });

    it("injects latest scroll percentages without changing sidebar grouping or ordering", () => {
        getAllTagsMock.mockImplementation((cache: any) => {
            if (Array.isArray(cache?.frontmatter?.tags)) {
                return cache.frontmatter.tags;
            }

            if (typeof cache?.frontmatter?.tags === "string") {
                return cache.frontmatter.tags.split(",").map((tag: string) => tag.trim());
            }

            return [];
        });

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
