import SRPlugin from "src/main";

describe("SRPlugin resolveNoteReviewTracking", () => {
    const note = { path: "Projects/Alpha/Note.md" } as any;

    test("manual tracking wins over folder tracking", () => {
        const plugin = {
            noteReviewStore: {
                getEntry: jest.fn(() => ({
                    source: "manual",
                    deckName: "Manual Deck",
                })),
            },
            getResolvedFolderTrackingRule: jest.fn(() => ({
                folderPath: "Projects/Alpha",
                rule: {
                    track: true,
                    autoTag: false,
                    tags: [],
                    ownedTagsByPath: {},
                    excludedPaths: [],
                },
            })),
        };

        const result = (SRPlugin.prototype as any).resolveNoteReviewTracking.call(plugin, note);

        expect(result).toEqual({
            deckName: "Manual Deck",
            source: "manual",
        });
    });

    test("folder tracking is used when note has no manual source and is not excluded", () => {
        const plugin = {
            noteReviewStore: {
                getEntry: jest.fn(() => null),
            },
            getResolvedFolderTrackingRule: jest.fn(() => ({
                folderPath: "Projects/Alpha",
                rule: {
                    track: true,
                    autoTag: true,
                    tags: ["#review"],
                    ownedTagsByPath: {},
                    excludedPaths: [],
                },
            })),
        };

        const result = (SRPlugin.prototype as any).resolveNoteReviewTracking.call(plugin, note);

        expect(result).toEqual({
            deckName: "default",
            source: "folder",
        });
    });

    test("excluded folder note is not re-added by folder tracking", () => {
        const plugin = {
            noteReviewStore: {
                getEntry: jest.fn(() => ({
                    source: "folder",
                    deckName: "default",
                })),
            },
            getResolvedFolderTrackingRule: jest.fn(() => ({
                folderPath: "Projects/Alpha",
                rule: {
                    track: true,
                    autoTag: false,
                    tags: [],
                    ownedTagsByPath: {},
                    excludedPaths: ["Projects/Alpha/Note.md"],
                },
            })),
        };

        const result = (SRPlugin.prototype as any).resolveNoteReviewTracking.call(plugin, note);

        expect(result).toBeNull();
    });

    test("folder tracking ignores legacy tag-source entries", () => {
        const plugin = {
            noteReviewStore: {
                getEntry: jest.fn(() => ({
                    source: "tag",
                    deckName: "#review",
                })),
            },
            getResolvedFolderTrackingRule: jest.fn(() => ({
                folderPath: "Projects/Alpha",
                rule: {
                    track: true,
                    autoTag: false,
                    tags: [],
                    ownedTagsByPath: {},
                    excludedPaths: [],
                },
            })),
        };

        const result = (SRPlugin.prototype as any).resolveNoteReviewTracking.call(plugin, note);

        expect(result).toEqual({
            deckName: "default",
            source: "folder",
        });
    });
});
