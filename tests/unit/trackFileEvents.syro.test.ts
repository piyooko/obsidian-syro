import { registerTrackFileEvents } from "src/Events/trackFileEvents";

jest.mock("src/lang/helpers", () => ({
    t: (key: string) => key,
}));

jest.mock("obsidian", () => {
    class TFile {
        path = "";
        extension = "md";
    }

    class TFolder {}

    class Menu {}

    class Modal {}

    return {
        TFile,
        TFolder,
        Menu,
        Modal,
        debounce: (fn: (...args: unknown[]) => unknown) => fn,
    };
});

describe("trackFileEvents syro session hooks", () => {
    function createMarkdownFile(path: string) {
        const { TFile } = jest.requireMock("obsidian") as { TFile: new () => { path: string } };
        const file = new TFile();
        file.path = path;
        return file;
    }

    test("rename emits note and timeline rename sessions before refreshing note review", async () => {
        const noteSnapshot = {
            path: "archive/renamed.md",
            source: "manual",
            deckName: "default",
            item: { uuid: "note-1" },
        };
        const timelineSnapshot = {
            oldPath: "folder/original.md",
            newPath: "archive/renamed.md",
            path: "archive/renamed.md",
            commits: [{ id: "commit-1", message: "saved", timestamp: 1 }],
        };
        const cardSnapshot = {
            oldPath: "folder/original.md",
            newPath: "archive/renamed.md",
            file: {
                uuid: "tracked-file-1",
                path: "archive/renamed.md",
                tags: ["card", "#flashcards"],
                items: { file: -1 },
                trackedItems: [] as never[],
                relatedItems: [] as never[],
            },
        };
        const plugin = {
            data: {
                settings: {
                    showRuntimeDebugMessages: false,
                },
            },
            registerEvent: jest.fn(),
            app: {
                vault: {
                    on: jest.fn((_event, handler) => handler),
                    read: jest.fn(),
                },
                metadataCache: {},
            },
            noteReviewStore: {
                renameWithSnapshot: jest.fn(() => noteSnapshot),
                renamePathPrefixWithSnapshots: jest.fn(() => []),
                save: jest.fn(async () => undefined),
            },
            reviewCommitStore: {
                renameFileWithSnapshot: jest.fn(() => timelineSnapshot),
                renamePathPrefixWithSnapshots: jest.fn(() => []),
                save: jest.fn(async () => undefined),
            },
            appendSyroNoteRename: jest.fn(async () => true),
            appendSyroTimelineRenameFile: jest.fn(async () => true),
            renameFolderTrackingPaths: jest.fn(() => false),
            ensureFolderTrackingForFile: jest.fn(async () => false),
            getResolvedFolderTrackingRule: jest.fn(() => null),
            store: {
                renamePathPrefixWithSnapshots: jest.fn(() => [cardSnapshot]),
                save: jest.fn(async () => undefined),
            },
            appendSyroCardsRenameFile: jest.fn(async () => true),
            markSyncDirty: jest.fn(),
            refreshNoteReview: jest.fn(async () => undefined),
            requestSync: jest.fn(async () => undefined),
            redrawReviewQueueView: jest.fn(),
        };

        registerTrackFileEvents(plugin as never);
        const renameHandler = plugin.app.vault.on.mock.calls.find(
            (call) => call[0] === "rename",
        )?.[1];

        if (typeof renameHandler !== "function") {
            throw new Error("Expected rename handler");
        }

        await renameHandler(createMarkdownFile("archive/renamed.md"), "folder/original.md");

        expect(plugin.noteReviewStore.save).toHaveBeenCalled();
        expect(plugin.reviewCommitStore.save).toHaveBeenCalled();
        expect(plugin.appendSyroNoteRename).toHaveBeenCalledWith("folder/original.md", noteSnapshot);
        expect(plugin.appendSyroTimelineRenameFile).toHaveBeenCalledWith(
            "folder/original.md",
            "archive/renamed.md",
            timelineSnapshot.commits,
        );
        expect(plugin.appendSyroCardsRenameFile).toHaveBeenCalledWith(
            "folder/original.md",
            cardSnapshot.file,
        );
        expect(plugin.store.save).toHaveBeenCalled();
        expect(plugin.markSyncDirty).toHaveBeenCalled();
        expect(plugin.requestSync).toHaveBeenCalledWith({ trigger: "file-event" });
        expect(plugin.refreshNoteReview).toHaveBeenCalledWith({ trigger: "file-event" });
    });

    test("delete emits note and timeline delete sessions before refreshing note review", async () => {
        const noteSnapshot = {
            path: "archive/deleted.md",
            source: "manual",
            deckName: "default",
            item: { uuid: "note-1" },
        };
        const timelineSnapshot = {
            path: "archive/deleted.md",
            commits: [{ id: "commit-1", message: "saved", timestamp: 1 }],
        };
        const cardSnapshot = {
            uuid: "tracked-file-1",
            path: "archive/deleted.md",
            tags: ["card", "#flashcards"],
            items: { file: -1 },
            trackedItems: [] as never[],
            relatedItems: [] as never[],
        };
        const plugin = {
            data: {
                settings: {
                    showRuntimeDebugMessages: false,
                },
            },
            registerEvent: jest.fn(),
            app: {
                vault: {
                    on: jest.fn((_event, handler) => handler),
                    read: jest.fn(),
                },
                metadataCache: {},
            },
            noteReviewStore: {
                removeWithSnapshot: jest.fn(() => noteSnapshot),
                removePathPrefixWithSnapshots: jest.fn(() => []),
                save: jest.fn(async () => undefined),
            },
            reviewCommitStore: {
                deleteFileWithSnapshot: jest.fn(() => timelineSnapshot),
                deletePathPrefixWithSnapshots: jest.fn(() => []),
                save: jest.fn(async () => undefined),
            },
            appendSyroNoteRemove: jest.fn(async () => true),
            appendSyroTimelineDeleteFile: jest.fn(async () => true),
            removeFolderTrackingPaths: jest.fn(() => false),
            store: {
                untrackPathPrefixWithSnapshots: jest.fn(() => [cardSnapshot]),
                save: jest.fn(async () => undefined),
            },
            appendSyroCardsDeleteFile: jest.fn(async () => true),
            markSyncDirty: jest.fn(),
            refreshNoteReview: jest.fn(async () => undefined),
            requestSync: jest.fn(async () => undefined),
            redrawReviewQueueView: jest.fn(),
        };

        registerTrackFileEvents(plugin as never);
        const deleteHandler = plugin.app.vault.on.mock.calls.find(
            (call) => call[0] === "delete",
        )?.[1];

        if (typeof deleteHandler !== "function") {
            throw new Error("Expected delete handler");
        }

        await deleteHandler(createMarkdownFile("archive/deleted.md"));

        expect(plugin.noteReviewStore.save).toHaveBeenCalled();
        expect(plugin.reviewCommitStore.save).toHaveBeenCalled();
        expect(plugin.appendSyroNoteRemove).toHaveBeenCalledWith(noteSnapshot);
        expect(plugin.appendSyroTimelineDeleteFile).toHaveBeenCalledWith(
            "archive/deleted.md",
            timelineSnapshot.commits,
        );
        expect(plugin.appendSyroCardsDeleteFile).toHaveBeenCalledWith(cardSnapshot);
        expect(plugin.store.save).toHaveBeenCalled();
        expect(plugin.markSyncDirty).toHaveBeenCalled();
        expect(plugin.requestSync).toHaveBeenCalledWith({ trigger: "file-event" });
        expect(plugin.refreshNoteReview).toHaveBeenCalledWith({ trigger: "file-event" });
    });
});
