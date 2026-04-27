import { TFile } from "obsidian";
import { Deck, DeckTreeFilter } from "src/Deck";
import SRPlugin from "src/main";
import { parseIrExtracts } from "src/util/irExtractParser";

function createTFile(path: string): TFile {
    const basename = path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
    return Object.assign(new TFile(), {
        path,
        basename,
        extension: "md",
    });
}

describe("SRPlugin extract deck paths", () => {
    beforeEach(() => {
        jest.spyOn(DeckTreeFilter, "filterByDailyLimits").mockImplementation((deck) => deck);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("uses source file deck path for active extracts with stale deck names", () => {
        const sourceFile = createTFile("摘录测试.md");
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            data: {
                settings: {
                    enableExtracts: true,
                    convertFoldersToDecks: true,
                    trackedNoteToDecks: false,
                },
            },
            app: {
                vault: {
                    getAbstractFileByPath: jest.fn(() => sourceFile),
                },
            },
            noteReviewStore: null,
            createSrTFile: jest.fn((file: TFile) => ({
                path: file.path,
                getAllTagsFromCache: () => [],
            })),
            extractStore: {
                list: jest.fn(() => [
                    {
                        stage: "active",
                        deckName: "default",
                        sourcePath: "摘录测试.md",
                    },
                ]),
            },
        });

        expect((SRPlugin.prototype as any).getActiveExtractDeckPaths.call(plugin)).toEqual([
            "摘录测试",
        ]);
    });

    test("counts extract stats through the source file deck resolver", () => {
        const sourceFile = createTFile("数学卡.md");
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            data: {
                settings: {
                    enableExtracts: true,
                    convertFoldersToDecks: true,
                    trackedNoteToDecks: false,
                    deckOptionsPresets: [],
                    deckOptionsAssignments: {},
                },
            },
            app: {
                vault: {
                    getAbstractFileByPath: jest.fn(() => sourceFile),
                },
            },
            noteReviewStore: null,
            createSrTFile: jest.fn((file: TFile) => ({
                path: file.path,
                getAllTagsFromCache: () => [],
            })),
            extractStore: {
                getStats: jest.fn((_deckPath, _limits, resolveDeckName) => {
                    const resolved = resolveDeckName({
                        deckName: "启动页排版",
                        sourcePath: "数学卡.md",
                    });
                    return resolved === "数学卡"
                        ? { newCount: 1, dueCount: 0, totalCount: 1 }
                        : { newCount: 0, dueCount: 0, totalCount: 0 };
                }),
            },
        });

        expect(SRPlugin.prototype.getExtractReviewStats.call(plugin, "数学卡", true)).toEqual({
            newCount: 1,
            dueCount: 0,
            totalCount: 1,
        });
    });

    test("uses the deck tree review count for inline-title stats", async () => {
        const root = new Deck("root", null);
        const math = new Deck("数学卡", root);
        root.subdecks.push(math);

        const file = createTFile("数学卡.md");
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            remainingDeckTree: root,
            data: {
                settings: {
                    enableExtracts: true,
                    convertFoldersToDecks: true,
                    trackedNoteToDecks: false,
                    learnAheadMinutes: 0,
                    deckOptionsPresets: [],
                    deckOptionsAssignments: {},
                },
            },
            createSrTFile: jest.fn((inputFile: TFile) => ({
                path: inputFile.path,
                getAllTagsFromCache: () => [],
            })),
            getExtractReviewStats: jest.fn(() => ({
                newCount: 0,
                dueCount: 0,
                totalCount: 0,
            })),
        });

        expect(await SRPlugin.prototype.getReadonlyNoteCardStats.call(plugin, file)).toEqual({
            reviewableCount: 0,
            totalCount: 0,
        });
    });

    test("refreshes extract listeners and status bar after creating an extract from the editor", async () => {
        const file = createTFile("摘录测试.md");
        const emit = jest.fn();
        const updateStatusBar = jest.fn();
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            data: {
                settings: {
                    enableExtracts: true,
                    convertFoldersToDecks: true,
                    trackedNoteToDecks: false,
                },
            },
            app: {
                workspace: {
                    getActiveFile: jest.fn(() => file),
                },
            },
            guardSyroDataReady: jest.fn(() => true),
            createSrTFile: jest.fn((inputFile: TFile) => ({
                path: inputFile.path,
                getAllTagsFromCache: () => [],
            })),
            extractStore: {
                syncFileExtracts: jest.fn(() => ({
                    added: [],
                    updated: [],
                    graduated: [],
                })),
                save: jest.fn(() => Promise.resolve()),
            },
            appendSyroExtractUpsert: jest.fn(),
            appendSyroExtractGraduate: jest.fn(),
            syncEvents: {
                emit,
            },
            updateStatusBar,
        });
        const editor = {
            getSelection: jest.fn(() => "alpha"),
            getCursor: jest.fn((which: string) =>
                which === "to" ? { line: 0, ch: 5 } : { line: 0, ch: 0 },
            ),
            posToOffset: jest.fn((pos: { ch: number }) => pos.ch),
            offsetToPos: jest.fn((offset: number) => ({ line: 0, ch: offset })),
            getValue: jest.fn(() => "alpha beta"),
            replaceRange: jest.fn(),
        };

        await SRPlugin.prototype.createExtractFromEditorSelection.call(plugin, editor as never);

        expect(emit).toHaveBeenCalledWith("extracts-updated");
        expect(updateStatusBar).toHaveBeenCalled();
    });

    test("updates an extract context range in the source note and resyncs extracts", async () => {
        const file = createTFile("摘录测试.md");
        let sourceText = "before\n\ncontext {{ir::target}}\n\nafter";
        const syncFileExtracts = jest.fn(() => ({ added: [], updated: [], graduated: [] }));
        const save = jest.fn(() => Promise.resolve());
        const emit = jest.fn();

        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            app: {
                vault: {
                    getAbstractFileByPath: jest.fn(() => file),
                    read: jest.fn(() => Promise.resolve(sourceText)),
                    modify: jest.fn((_file: TFile, nextText: string) => {
                        sourceText = nextText;
                        return Promise.resolve();
                    }),
                },
            },
            data: {
                settings: {
                    enableExtracts: true,
                    convertFoldersToDecks: true,
                    trackedNoteToDecks: false,
                },
            },
            extractStore: {
                get: jest.fn(() => ({
                    uuid: "ir_1",
                    stage: "active",
                    sourcePath: "摘录测试.md",
                    sourceAnchor: {
                        start: "before\n\ncontext ".length,
                        end: "before\n\ncontext {{ir::target}}".length,
                        innerStart: "before\n\ncontext {{ir::".length,
                        innerEnd: "before\n\ncontext {{ir::target".length,
                        startLine: 2,
                        endLine: 2,
                        prefix: "",
                        suffix: "",
                        contentHash: "hash",
                        ordinal: 0,
                    },
                    rawMarkdown: "target",
                    deckName: "摘录测试",
                })),
                syncFileExtracts,
                save,
            },
            getExtractDeckNameForFile: jest.fn(() => "摘录测试"),
            appendExtractSyncResult: jest.fn(() => Promise.resolve()),
            syncEvents: { emit },
        });

        await SRPlugin.prototype.updateExtractContextMarkdown.call(
            plugin,
            "ir_1",
            {
                sourceFrom: 0,
                sourceTo: sourceText.length,
                markdown: sourceText,
                currentOuterFrom: "before\n\ncontext ".length,
                currentOuterTo: "before\n\ncontext {{ir::target}}".length,
                currentInnerFrom: "before\n\ncontext {{ir::".length,
                currentInnerTo: "before\n\ncontext {{ir::target".length,
                currentOpenTokenFrom: "before\n\ncontext ".length,
                currentOpenTokenTo: "before\n\ncontext {{ir::".length,
                currentCloseTokenFrom: "before\n\ncontext {{ir::target".length,
                currentCloseTokenTo: "before\n\ncontext {{ir::target}}".length,
            },
            {
                markdown: "before edited\n\ncontext {{ir::target edited}}\n\nafter edited",
                ranges: {
                    currentOuterFrom: "before edited\n\ncontext ".length,
                    currentOuterTo: "before edited\n\ncontext {{ir::target edited}}".length,
                    currentInnerFrom: "before edited\n\ncontext {{ir::".length,
                    currentInnerTo: "before edited\n\ncontext {{ir::target edited".length,
                    currentOpenTokenFrom: "before edited\n\ncontext ".length,
                    currentOpenTokenTo: "before edited\n\ncontext {{ir::".length,
                    currentCloseTokenFrom: "before edited\n\ncontext {{ir::target edited".length,
                    currentCloseTokenTo:
                        "before edited\n\ncontext {{ir::target edited}}".length,
                },
            },
        );

        expect(sourceText).toBe("before edited\n\ncontext {{ir::target edited}}\n\nafter edited");
        expect(syncFileExtracts).toHaveBeenCalled();
        expect(save).toHaveBeenCalled();
        expect(emit).toHaveBeenCalledWith("extracts-updated");
    });

    test("sets extract review date through plugin and emits extract updates", async () => {
        const emit = jest.fn();
        const updateStatusBar = jest.fn();
        const updated = { uuid: "ir_1", nextReview: Date.now() + 1000 };

        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            data: { settings: { enableExtracts: true } },
            extractStore: {
                setNextReviewDate: jest.fn(() => updated),
                save: jest.fn(() => Promise.resolve()),
            },
            appendSyroExtractUpsert: jest.fn(() => Promise.resolve()),
            syncEvents: { emit },
            updateStatusBar,
        });

        const result = await SRPlugin.prototype.setExtractReviewDate.call(
            plugin,
            "ir_1",
            updated.nextReview,
            "deck",
        );

        expect(result).toBe(updated);
        expect(plugin.extractStore.setNextReviewDate).toHaveBeenCalledWith(
            "ir_1",
            updated.nextReview,
            "deck",
        );
        expect(plugin.appendSyroExtractUpsert).toHaveBeenCalledWith({ item: updated }, "review");
        expect(emit).toHaveBeenCalledWith("extracts-updated");
        expect(updateStatusBar).toHaveBeenCalled();
    });

    test("graduates an extract through wrapper removal while counting the review quota", async () => {
        const file = createTFile("摘录测试.md");
        let sourceText = "before {{ir::target}} after";
        const match = parseIrExtracts(sourceText)[0];
        const item = {
            uuid: "ir_1",
            stage: "active",
            sourcePath: "摘录测试.md",
            sourceAnchor: { ...match.anchor, ordinal: 0 },
            rawMarkdown: "target",
            memo: "",
            deckName: "摘录测试",
        };
        const graduated = { ...item, stage: "graduated", timesReviewed: 1 };
        const emit = jest.fn();
        const updateStatusBar = jest.fn();

        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            app: {
                vault: {
                    getAbstractFileByPath: jest.fn(() => file),
                    read: jest.fn(() => Promise.resolve(sourceText)),
                    modify: jest.fn((_file: TFile, nextText: string) => {
                        sourceText = nextText;
                        return Promise.resolve();
                    }),
                },
            },
            extractStore: {
                get: jest.fn(() => item),
                graduateWithReviewCount: jest.fn(() => graduated),
                syncFileExtracts: jest.fn(() => ({ added: [], updated: [], graduated: [] })),
                save: jest.fn(() => Promise.resolve()),
            },
            getExtractDeckNameForFile: jest.fn(() => "摘录测试"),
            appendExtractSyncResult: jest.fn(() => Promise.resolve()),
            appendSyroExtractGraduate: jest.fn(() => Promise.resolve()),
            reviewCommitStore: null,
            syncEvents: { emit },
            updateStatusBar,
        });

        await SRPlugin.prototype.graduateExtract.call(plugin, "ir_1", "deck");

        expect(sourceText).toBe("before target after");
        expect(plugin.extractStore.graduateWithReviewCount).toHaveBeenCalledWith("ir_1", "deck");
        expect(plugin.appendSyroExtractGraduate).toHaveBeenCalledWith({ item: graduated });
        expect(plugin.extractStore.save).toHaveBeenCalled();
        expect(emit).toHaveBeenCalledWith("extracts-updated");
        expect(updateStatusBar).toHaveBeenCalled();
    });

    test("syncs extracts from a single markdown file and emits updates when changed", async () => {
        const file = createTFile("摘录测试.md");
        const emit = jest.fn();
        const updateStatusBar = jest.fn();

        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            data: {
                settings: {
                    enableExtracts: true,
                    convertFoldersToDecks: true,
                    trackedNoteToDecks: false,
                },
            },
            app: {
                vault: {
                    cachedRead: jest.fn(() => Promise.resolve("{{ir::one}}")),
                },
            },
            getExtractDeckNameForFile: jest.fn(() => "摘录测试"),
            extractStore: {
                syncFileExtracts: jest.fn(() => ({
                    added: [{ uuid: "ir_1" }],
                    updated: [],
                    graduated: [],
                })),
                save: jest.fn(() => Promise.resolve()),
            },
            appendExtractSyncResult: jest.fn(() => Promise.resolve()),
            syncEvents: { emit },
            updateStatusBar,
        });

        await SRPlugin.prototype.syncExtractsFromFile.call(plugin, file);

        expect(plugin.extractStore.syncFileExtracts).toHaveBeenCalledWith(
            "摘录测试.md",
            "{{ir::one}}",
            "摘录测试",
        );
        expect(plugin.extractStore.save).toHaveBeenCalled();
        expect(emit).toHaveBeenCalledWith("extracts-updated");
        expect(updateStatusBar).toHaveBeenCalled();
    });
});
