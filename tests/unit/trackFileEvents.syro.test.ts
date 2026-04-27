import { registerTrackFileEvents } from "src/Events/trackFileEvents";
import { createDeterministicFileIdentityUuid } from "src/dataStore/syroFileIdentityStore";

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
        const emitted: string[] = [];
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
            getSyroFileIdentity: jest.fn((uuid: string) => ({
                uuid,
                createdAt: "2026-04-18T08:00:00.000Z",
            })),
            appendSyroNoteRename: jest.fn(async () => true),
            appendSyroTimelineRenameFile: jest.fn(async () => true),
            renameFolderTrackingPaths: jest.fn(() => false),
            renameDeckOptionsAssignments: jest.fn(() => true),
            ensureFolderTrackingForFile: jest.fn(async () => false),
            getResolvedFolderTrackingRule: jest.fn(() => null),
            store: {
                renamePathPrefixWithSnapshots: jest.fn(() => [cardSnapshot]),
                save: jest.fn(async () => undefined),
            },
            appendSyroFileIdentityUpsert: jest.fn(async () => {
                emitted.push("file-identity-upsert");
                return true;
            }),
            appendSyroCardsRenameFile: jest.fn(async () => {
                emitted.push("cards-rename");
                return true;
            }),
            guardSyroDataReady: jest.fn(() => true),
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

        expect(plugin.renameDeckOptionsAssignments).toHaveBeenCalledWith(
            "folder/original.md",
            "archive/renamed.md",
        );
        expect(plugin.noteReviewStore.save).toHaveBeenCalled();
        expect(plugin.reviewCommitStore.save).toHaveBeenCalled();
        expect(plugin.appendSyroNoteRename).toHaveBeenCalledWith(
            "folder/original.md",
            noteSnapshot,
        );
        expect(plugin.appendSyroTimelineRenameFile).toHaveBeenCalledWith(
            "folder/original.md",
            "archive/renamed.md",
            timelineSnapshot.commits,
        );
        expect(plugin.appendSyroFileIdentityUpsert.mock.calls).toEqual([
            [
                expect.objectContaining({
                    uuid: "note-1",
                    path: "archive/renamed.md",
                    deleted: false,
                }),
            ],
            [
                expect.objectContaining({
                    uuid: createDeterministicFileIdentityUuid("folder/original.md"),
                    path: "archive/renamed.md",
                    deleted: false,
                }),
            ],
            [
                expect.objectContaining({
                    uuid: "tracked-file-1",
                    path: "archive/renamed.md",
                    deleted: false,
                }),
            ],
        ]);
        expect(plugin.appendSyroCardsRenameFile).toHaveBeenCalledWith(
            "folder/original.md",
            cardSnapshot.file,
        );
        expect(plugin.appendSyroFileIdentityUpsert.mock.invocationCallOrder[0]).toBeLessThan(
            plugin.appendSyroNoteRename.mock.invocationCallOrder[0],
        );
        expect(plugin.appendSyroFileIdentityUpsert.mock.invocationCallOrder[1]).toBeLessThan(
            plugin.appendSyroTimelineRenameFile.mock.invocationCallOrder[0],
        );
        expect(plugin.appendSyroNoteRename.mock.invocationCallOrder[0]).toBeLessThan(
            plugin.appendSyroCardsRenameFile.mock.invocationCallOrder[0],
        );
        expect(emitted).toEqual([
            "file-identity-upsert",
            "file-identity-upsert",
            "file-identity-upsert",
            "cards-rename",
        ]);
        expect(plugin.store.save).toHaveBeenCalled();
        expect(plugin.markSyncDirty).toHaveBeenCalled();
        expect(plugin.requestSync).toHaveBeenCalledWith({ trigger: "file-event" });
        expect(plugin.refreshNoteReview).toHaveBeenCalledWith({ trigger: "file-event" });
    });

    test("delete emits note and timeline delete sessions before refreshing note review", async () => {
        const emitted: string[] = [];
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
            getSyroFileIdentity: jest.fn((uuid: string) => ({
                uuid,
                createdAt: "2026-04-18T08:00:00.000Z",
            })),
            appendSyroNoteRemove: jest.fn(async () => true),
            appendSyroTimelineDeleteFile: jest.fn(async () => true),
            removeFolderTrackingPaths: jest.fn(() => false),
            removeDeckOptionsAssignments: jest.fn(() => true),
            store: {
                untrackPathPrefixWithSnapshots: jest.fn(() => [cardSnapshot]),
                save: jest.fn(async () => undefined),
            },
            appendSyroFileIdentityDelete: jest.fn(async () => {
                emitted.push("file-identity-delete");
                return true;
            }),
            appendSyroCardsDeleteFile: jest.fn(async () => {
                emitted.push("cards-delete");
                return true;
            }),
            guardSyroDataReady: jest.fn(() => true),
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

        expect(plugin.removeDeckOptionsAssignments).toHaveBeenCalledWith("archive/deleted.md");
        expect(plugin.noteReviewStore.save).toHaveBeenCalled();
        expect(plugin.reviewCommitStore.save).toHaveBeenCalled();
        expect(plugin.appendSyroNoteRemove).toHaveBeenCalledWith(noteSnapshot);
        expect(plugin.appendSyroTimelineDeleteFile).toHaveBeenCalledWith(
            "archive/deleted.md",
            timelineSnapshot.commits,
        );
        expect(plugin.appendSyroFileIdentityDelete.mock.calls).toEqual([
            [
                expect.objectContaining({
                    uuid: "note-1",
                    path: "archive/deleted.md",
                    deleted: true,
                }),
            ],
            [
                expect.objectContaining({
                    uuid: createDeterministicFileIdentityUuid("archive/deleted.md"),
                    path: "archive/deleted.md",
                    deleted: true,
                }),
            ],
            [
                expect.objectContaining({
                    uuid: "tracked-file-1",
                    path: "archive/deleted.md",
                    deleted: true,
                }),
            ],
        ]);
        expect(plugin.appendSyroCardsDeleteFile).toHaveBeenCalledWith(cardSnapshot);
        expect(plugin.appendSyroFileIdentityDelete.mock.invocationCallOrder[0]).toBeLessThan(
            plugin.appendSyroNoteRemove.mock.invocationCallOrder[0],
        );
        expect(plugin.appendSyroFileIdentityDelete.mock.invocationCallOrder[1]).toBeLessThan(
            plugin.appendSyroTimelineDeleteFile.mock.invocationCallOrder[0],
        );
        expect(plugin.appendSyroNoteRemove.mock.invocationCallOrder[0]).toBeLessThan(
            plugin.appendSyroCardsDeleteFile.mock.invocationCallOrder[0],
        );
        expect(emitted).toEqual([
            "file-identity-delete",
            "file-identity-delete",
            "file-identity-delete",
            "cards-delete",
        ]);
        expect(plugin.store.save).toHaveBeenCalled();
        expect(plugin.markSyncDirty).toHaveBeenCalled();
        expect(plugin.requestSync).toHaveBeenCalledWith({ trigger: "file-event" });
        expect(plugin.refreshNoteReview).toHaveBeenCalledWith({ trigger: "file-event" });
    });

    test("modify syncs extracts for the changed markdown file", async () => {
        const modifyHandlers: Array<(file: { path: string; extension: string }) => Promise<void>> =
            [];
        const file = createMarkdownFile("摘录测试.md") as { path: string; extension: string };
        file.extension = "md";

        const plugin = {
            data: {
                settings: {
                    showRuntimeDebugMessages: false,
                    convertCurlyBracketsToClozes: false,
                    singleLineCardSeparator: "::",
                    singleLineReversedCardSeparator: ":::",
                    multilineCardSeparator: "?",
                    multilineReversedCardSeparator: "??",
                },
            },
            registerEvent: jest.fn(),
            guardSyroDataReady: jest.fn(() => true),
            app: {
                vault: {
                    on: jest.fn((event, handler) => {
                        if (event === "modify") {
                            modifyHandlers.push(handler);
                        }
                        return {};
                    }),
                    read: jest.fn(() => Promise.resolve("{{ir::one}}")),
                },
            },
            store: {
                getTrackedFile: jest.fn(() => null),
                isTrackedCardfile: jest.fn(() => false),
            },
            noteReviewStore: {
                isTracked: jest.fn(() => false),
            },
            getResolvedFolderTrackingRule: jest.fn(() => null),
            syncExtractsFromFile: jest.fn(() => Promise.resolve()),
            loadNote: jest.fn(() => Promise.resolve({ questionList: [] })),
            markSyncDirty: jest.fn(),
            requestSync: jest.fn(() => Promise.resolve()),
            redrawReviewQueueView: jest.fn(),
            refreshNoteReview: jest.fn(() => Promise.resolve()),
        };

        registerTrackFileEvents(plugin as never);
        await modifyHandlers[0](file);

        expect(plugin.syncExtractsFromFile).toHaveBeenCalledWith(file);
    });
});
