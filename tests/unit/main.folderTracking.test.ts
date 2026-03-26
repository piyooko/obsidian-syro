import SRPlugin from "src/main";
import { Tags } from "src/tags";

describe("SRPlugin resolveNoteReviewTracking", () => {
    const note = { path: "Projects/Alpha/Note.md" } as any;

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("manual tracking wins over folder tracking when no review tag exists", () => {
        jest.spyOn(Tags, "getNoteDeckName").mockReturnValue(null);

        const plugin = {
            data: { settings: { untrackWithReviewTag: false } },
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
        jest.spyOn(Tags, "getNoteDeckName").mockReturnValue(null);

        const plugin = {
            data: { settings: { untrackWithReviewTag: false } },
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
        jest.spyOn(Tags, "getNoteDeckName").mockReturnValue(null);

        const plugin = {
            data: { settings: { untrackWithReviewTag: false } },
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

    test("review tags still win even when folder tracking exists", () => {
        jest.spyOn(Tags, "getNoteDeckName").mockReturnValue("#review");

        const plugin = {
            data: { settings: { untrackWithReviewTag: false } },
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
                    autoTag: true,
                    tags: ["#review"],
                    ownedTagsByPath: {},
                    excludedPaths: [],
                },
            })),
        };

        const result = (SRPlugin.prototype as any).resolveNoteReviewTracking.call(plugin, note);

        expect(result).toEqual({
            deckName: "#review",
            source: "tag",
        });
    });
});
