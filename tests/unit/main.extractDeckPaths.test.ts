import { moment, Notice, TFile } from "obsidian";
import { Deck, DeckTreeFilter } from "src/Deck";
import { ExtractStore } from "src/dataStore/extractStore";
import { RPITEMTYPE } from "src/dataStore/repetitionItem";
import { TrackedFile } from "src/dataStore/trackedFile";
import SRPlugin from "src/main";
import { DEFAULT_SETTINGS } from "src/settings";
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

    test("hides extracts whose source file is missing from deck paths, candidates, and stats", () => {
        const missingExtract = {
            uuid: "ir_missing_source",
            stage: "active",
            deckName: "Untitled",
            sourcePath: "Untitled.md",
            timesReviewed: 0,
            nextReview: 0,
        };
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            data: {
                settings: {
                    ...DEFAULT_SETTINGS,
                    enableExtracts: true,
                    convertFoldersToDecks: true,
                    trackedNoteToDecks: false,
                },
            },
            app: {
                vault: {
                    getAbstractFileByPath: jest.fn(() => null),
                },
            },
            extractStore: {
                list: jest.fn(() => [missingExtract]),
                getReviewCandidates: jest.fn((_deckPath, _limits, _resolveDeckName, canReviewExtract) =>
                    canReviewExtract?.(missingExtract) ? [missingExtract] : [],
                ),
                getStats: jest.fn((_deckPath, _limits, _resolveDeckName, canReviewExtract) =>
                    canReviewExtract?.(missingExtract)
                        ? { newCount: 1, dueCount: 0, totalCount: 1 }
                        : { newCount: 0, dueCount: 0, totalCount: 0 },
                ),
            },
        });

        expect(SRPlugin.prototype.getActiveExtractDeckPaths.call(plugin)).toEqual([]);
        expect(SRPlugin.prototype.getReviewableExtractDeckPaths.call(plugin, true)).toEqual([]);
        expect(SRPlugin.prototype.getExtractReviewCandidates.call(plugin, "Untitled", true)).toEqual(
            [],
        );
        expect(SRPlugin.prototype.getExtractReviewStats.call(plugin, "Untitled", true)).toEqual({
            newCount: 0,
            dueCount: 0,
            totalCount: 0,
        });
    });

    test("keeps the deck tree review count for legacy synchronous stats", async () => {
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

    test("counts note-local active extracts for readonly title stats", async () => {
        const now = 1_700_000_000_000;
        jest.spyOn(Date, "now").mockReturnValue(now);

        const file = createTFile("Syro 侧边栏复习教程.md");
        const sourceText = "{{ir::first}}\n{{ir::second}}\n{{ir::third}}";
        const matches = parseIrExtracts(sourceText);
        const extractStore = new ExtractStore(DEFAULT_SETTINGS, { extractsPath: "extracts.json" });
        const createSnapshot = (
            uuid: string,
            rawMarkdown: string,
            ordinal: number,
            overrides: Record<string, unknown> = {},
        ) => ({
            item: {
                id: ordinal + 1,
                uuid,
                sourcePath: file.path,
                sourceAnchor: { ...matches[ordinal].anchor, ordinal },
                rawMarkdown,
                memo: "",
                deckName: "Syro 侧边栏复习教程",
                stage: "active",
                createdAt: ordinal + 1,
                updatedAt: ordinal + 1,
                ...overrides,
            },
        });
        extractStore.upsertSnapshot(
            createSnapshot("ir_first", "first", 0, {
                timesReviewed: 4,
                nextReview: now + 86_400_000,
            }) as never,
        );
        extractStore.upsertSnapshot(
            createSnapshot("ir_second", "second", 1, {
                timesReviewed: 2,
                nextReview: now + 172_800_000,
            }) as never,
        );
        extractStore.upsertSnapshot(createSnapshot("ir_third", "third", 2) as never);

        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            data: {
                settings: {
                    ...DEFAULT_SETTINGS,
                    enableExtracts: true,
                    learnAheadMinutes: 0,
                },
            },
            app: {
                vault: {
                    read: jest.fn(() => Promise.resolve(sourceText)),
                },
            },
            guardSyroDataReady: jest.fn(() => true),
            store: {
                getTrackedFile: jest.fn(() => null),
                getItembyID: jest.fn(() => null),
            },
            extractStore,
            noteCache: new Map(),
        });

        expect(await SRPlugin.prototype.getReadonlyNoteLocalCardStats.call(plugin, file)).toEqual({
            reviewableCount: 1,
            totalCount: 3,
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
                getActiveByPath: jest.fn(() => []),
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
        (Notice as jest.Mock).mockClear();

        await SRPlugin.prototype.createExtractFromEditorSelection.call(plugin, editor as never);

        expect(emit).toHaveBeenCalledWith("extracts-updated");
        expect(updateStatusBar).toHaveBeenCalled();
        expect(Notice).not.toHaveBeenCalled();
    });

    test("blocks editor extract creation when the selection includes existing IR boundary syntax", async () => {
        moment.locale("zh-cn");
        const file = createTFile("摘录测试.md");
        const sourceText = "{{ir::这是一句}}话";
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
            extractStore: {
                getActiveByPath: jest.fn(() => []),
                syncFileExtracts: jest.fn(),
                save: jest.fn(() => Promise.resolve()),
            },
            syncEvents: {
                emit,
            },
            updateStatusBar,
        });
        const editor = {
            getSelection: jest.fn(() => "这是一句}}话"),
            getCursor: jest.fn((which: string) =>
                which === "to"
                    ? { line: 0, ch: sourceText.length }
                    : { line: 0, ch: "{{ir::".length },
            ),
            posToOffset: jest.fn((pos: { ch: number }) => pos.ch),
            offsetToPos: jest.fn((offset: number) => ({ line: 0, ch: offset })),
            getValue: jest.fn(() => sourceText),
            replaceRange: jest.fn(),
        };
        (Notice as jest.Mock).mockClear();

        await expect(
            SRPlugin.prototype.createExtractFromEditorSelection.call(plugin, editor as never),
        ).resolves.toBe(false);

        expect(editor.replaceRange).not.toHaveBeenCalled();
        expect(plugin.extractStore.syncFileExtracts).not.toHaveBeenCalled();
        expect(emit).not.toHaveBeenCalled();
        expect(updateStatusBar).not.toHaveBeenCalled();
        expect(Notice).toHaveBeenCalledWith("已阻止错误格式创建");
    });

    test("allows editor extract creation when the selection includes complete existing IR wrappers", async () => {
        const file = createTFile("摘录测试.md");
        const sourceText = "{{ir::这是一句}}话";
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
                getActiveByPath: jest.fn(() => []),
                syncFileExtracts: jest.fn(() => ({
                    added: [],
                    updated: [],
                    graduated: [],
                })),
                save: jest.fn(() => Promise.resolve()),
            },
            appendExtractSyncResult: jest.fn(() => Promise.resolve()),
            syncEvents: {
                emit,
            },
            updateStatusBar,
        });
        const editor = {
            getSelection: jest.fn(() => "{{ir::这是一句}}"),
            getCursor: jest.fn((which: string) =>
                which === "to" ? { line: 0, ch: sourceText.indexOf("话") } : { line: 0, ch: 0 },
            ),
            posToOffset: jest.fn((pos: { ch: number }) => pos.ch),
            offsetToPos: jest.fn((offset: number) => ({ line: 0, ch: offset })),
            getValue: jest.fn(() => sourceText),
            replaceRange: jest.fn(),
        };
        (Notice as jest.Mock).mockClear();

        await expect(
            SRPlugin.prototype.createExtractFromEditorSelection.call(plugin, editor as never),
        ).resolves.toBe(true);

        expect(editor.replaceRange).toHaveBeenCalledWith(
            "{{ir::{{ir::这是一句}}}}",
            { line: 0, ch: 0 },
            { line: 0, ch: sourceText.indexOf("话") },
        );
        expect(plugin.extractStore.syncFileExtracts).toHaveBeenCalled();
        expect(emit).toHaveBeenCalledWith("extracts-updated");
        expect(updateStatusBar).toHaveBeenCalled();
        expect(Notice).not.toHaveBeenCalledWith("已阻止错误格式创建");
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

    test("refreshes tracked card index after manual extract context adds a highlight cloze", async () => {
        const file = createTFile("摘录测试.md");
        const emit = jest.fn();
        const save = jest.fn(() => Promise.resolve());
        let sourceText = "before\n\ncontext {{ir::target}}\n\nafter";
        const trackedFile = new TrackedFile(file.path, RPITEMTYPE.CARD, "摘录测试");
        const syncNoteCardsIndex = jest.spyOn(trackedFile, "syncNoteCardsIndex");
        const sourceAnchor = {
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
        };
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
                    ...DEFAULT_SETTINGS,
                    enableExtracts: true,
                    convertHighlightsToClozes: true,
                    convertBoldTextToClozes: false,
                    convertAnkiClozesToClozes: false,
                },
            },
            store: {
                getTrackedFile: jest.fn(() => trackedFile),
                isTrackedCardfile: jest.fn(() => true),
                unTrackItem: jest.fn(),
            },
            extractStore: {
                get: jest.fn(() => ({
                    uuid: "ir_1",
                    stage: "active",
                    sourcePath: file.path,
                    sourceAnchor,
                    rawMarkdown: "target",
                    deckName: "摘录测试",
                })),
                syncFileExtracts: jest.fn(() => ({ added: [], updated: [], graduated: [] })),
                save,
            },
            getExtractDeckNameForFile: jest.fn(() => "摘录测试"),
            appendExtractSyncResult: jest.fn(() => Promise.resolve()),
            markSyncDirty: jest.fn(),
            loadNote: jest.fn(() => Promise.resolve({ questionList: [{ id: "q1" }] })),
            noteCache: new Map(),
            requestSync: jest.fn(() => Promise.resolve()),
            syncEvents: { emit },
        });

        await SRPlugin.prototype.updateExtractContextMarkdown.call(
            plugin,
            "ir_1",
            {
                sourceFrom: 0,
                sourceTo: sourceText.length,
                markdown: sourceText,
                currentOuterFrom: sourceAnchor.start,
                currentOuterTo: sourceAnchor.end,
                currentInnerFrom: sourceAnchor.innerStart,
                currentInnerTo: sourceAnchor.innerEnd,
                currentOpenTokenFrom: sourceAnchor.start,
                currentOpenTokenTo: sourceAnchor.innerStart,
                currentCloseTokenFrom: sourceAnchor.innerEnd,
                currentCloseTokenTo: sourceAnchor.end,
            },
            {
                markdown: "before\n\ncontext {{ir::target ==new card==}}\n\nafter",
                ranges: {
                    currentOuterFrom: "before\n\ncontext ".length,
                    currentOuterTo: "before\n\ncontext {{ir::target ==new card==}}".length,
                    currentInnerFrom: "before\n\ncontext {{ir::".length,
                    currentInnerTo: "before\n\ncontext {{ir::target ==new card==".length,
                    currentOpenTokenFrom: "before\n\ncontext ".length,
                    currentOpenTokenTo: "before\n\ncontext {{ir::".length,
                    currentCloseTokenFrom: "before\n\ncontext {{ir::target ==new card==".length,
                    currentCloseTokenTo:
                        "before\n\ncontext {{ir::target ==new card==}}".length,
                },
            },
        );

        expect(syncNoteCardsIndex).toHaveBeenCalledWith(sourceText, plugin.data.settings);
        expect(trackedFile.trackedItems?.map((item) => item.fingerprint)).toContain("new card");
        expect(plugin.loadNote).toHaveBeenCalledWith(file);
        expect(plugin.noteCache.get(file.path)).toEqual({
            mtime: file.stat?.mtime ?? 0,
            note: { questionList: [{ id: "q1" }] },
        });
        expect(plugin.markSyncDirty).toHaveBeenCalled();
        expect(plugin.requestSync).toHaveBeenCalledWith({ trigger: "file-event" });
    });

    test("refreshes extract source cards only for enabled bold and Anki cloze settings", async () => {
        const file = createTFile("摘录测试.md");
        const emit = jest.fn();
        let sourceText = "before {{ir::target}} after";
        const sourceAnchor = {
            start: "before ".length,
            end: "before {{ir::target}}".length,
            innerStart: "before {{ir::".length,
            innerEnd: "before {{ir::target".length,
            startLine: 0,
            endLine: 0,
            prefix: "",
            suffix: "",
            contentHash: "hash",
            ordinal: 0,
        };
        const createPlugin = (settings: Partial<typeof DEFAULT_SETTINGS>) => {
            const trackedFile = new TrackedFile(file.path, RPITEMTYPE.CARD, "摘录测试");
            const syncNoteCardsIndex = jest.spyOn(trackedFile, "syncNoteCardsIndex");
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
                        ...DEFAULT_SETTINGS,
                        enableExtracts: true,
                        ...settings,
                    },
                },
                store: {
                    getTrackedFile: jest.fn(() => trackedFile),
                    isTrackedCardfile: jest.fn(() => true),
                    unTrackItem: jest.fn(),
                },
                extractStore: {
                    get: jest.fn(() => ({
                        uuid: "ir_1",
                        stage: "active",
                        sourcePath: file.path,
                        sourceAnchor,
                        rawMarkdown: "target",
                        deckName: "摘录测试",
                    })),
                    syncFileExtracts: jest.fn(() => ({ added: [], updated: [], graduated: [] })),
                    save: jest.fn(() => Promise.resolve()),
                },
                getExtractDeckNameForFile: jest.fn(() => "摘录测试"),
                appendExtractSyncResult: jest.fn(() => Promise.resolve()),
                markSyncDirty: jest.fn(),
                loadNote: jest.fn(() => Promise.resolve({ questionList: [{ id: "q1" }] })),
                noteCache: new Map(),
                requestSync: jest.fn(() => Promise.resolve()),
                syncEvents: { emit },
            });
            return { plugin, trackedFile, syncNoteCardsIndex };
        };
        const saveWithMarkdown = async (plugin: SRPlugin, markdown: string) => {
            const closeTokenFrom = markdown.indexOf("}}");
            await SRPlugin.prototype.updateExtractContextMarkdown.call(
                plugin,
                "ir_1",
                {
                    sourceFrom: 0,
                    sourceTo: sourceText.length,
                    markdown: sourceText,
                    currentOuterFrom: sourceAnchor.start,
                    currentOuterTo: sourceAnchor.end,
                    currentInnerFrom: sourceAnchor.innerStart,
                    currentInnerTo: sourceAnchor.innerEnd,
                    currentOpenTokenFrom: sourceAnchor.start,
                    currentOpenTokenTo: sourceAnchor.innerStart,
                    currentCloseTokenFrom: sourceAnchor.innerEnd,
                    currentCloseTokenTo: sourceAnchor.end,
                },
                {
                    markdown,
                    ranges: {
                        currentOuterFrom: "before ".length,
                        currentOuterTo: closeTokenFrom + 2,
                        currentInnerFrom: "before {{ir::".length,
                        currentInnerTo: closeTokenFrom,
                        currentOpenTokenFrom: "before ".length,
                        currentOpenTokenTo: "before {{ir::".length,
                        currentCloseTokenFrom: closeTokenFrom,
                        currentCloseTokenTo: closeTokenFrom + 2,
                    },
                },
            );
        };

        const disabled = createPlugin({
            convertBoldTextToClozes: false,
            convertAnkiClozesToClozes: false,
        });
        await saveWithMarkdown(disabled.plugin, "before {{ir::**bold** {{c1::anki}}}} after");
        expect(disabled.syncNoteCardsIndex).toHaveBeenCalledWith(
            sourceText,
            disabled.plugin.data.settings,
        );
        expect(disabled.trackedFile.trackedItems).toEqual([]);
        expect(disabled.plugin.markSyncDirty).not.toHaveBeenCalled();

        sourceText = "before {{ir::target}} after";
        const enabled = createPlugin({
            convertBoldTextToClozes: true,
            convertAnkiClozesToClozes: true,
            isPro: true,
        });
        await saveWithMarkdown(enabled.plugin, "before {{ir::**bold** {{c1::anki}}}} after");
        expect(enabled.trackedFile.trackedItems?.map((item) => item.fingerprint)).toEqual([
            "anki",
            "bold",
        ]);
        expect(enabled.plugin.markSyncDirty).toHaveBeenCalled();
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

    test("undoes an extract review action by restoring the previous snapshot", async () => {
        const emit = jest.fn();
        const updateStatusBar = jest.fn();
        const snapshot = {
            item: {
                uuid: "ir_1",
                sourcePath: "摘录测试.md",
                sourceMode: "manual-ir",
                stage: "active",
                timesReviewed: 0,
            },
        };

        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            extractStore: {
                upsertSnapshot: jest.fn(),
                undoReviewedQuota: jest.fn(),
                get: jest.fn(() => snapshot.item),
                syncFileExtracts: jest.fn(() => ({ added: [], updated: [], graduated: [] })),
                save: jest.fn(() => Promise.resolve()),
            },
            getExtractDeckNameForFile: jest.fn(() => "摘录测试"),
            appendExtractSyncResult: jest.fn(() => Promise.resolve()),
            appendSyroExtractUpsert: jest.fn(() => Promise.resolve()),
            syncEvents: { emit },
            updateStatusBar,
        });

        const result = await SRPlugin.prototype.undoExtractReviewAction.call(plugin, {
            snapshot,
            countDeckName: "deck",
        });

        expect(result).toBe(snapshot.item);
        expect(plugin.extractStore.upsertSnapshot).toHaveBeenCalledWith(snapshot);
        expect(plugin.extractStore.undoReviewedQuota).toHaveBeenCalledWith(snapshot.item, "deck");
        expect(plugin.extractStore.save).toHaveBeenCalled();
        expect(plugin.appendSyroExtractUpsert).toHaveBeenCalledWith(snapshot, "undo");
        expect(emit).toHaveBeenCalledWith("extracts-updated");
        expect(updateStatusBar).toHaveBeenCalled();
    });

    test("undoes a manual extract graduation by restoring the source text", async () => {
        const file = createTFile("摘录测试.md");
        const emit = jest.fn();
        const updateStatusBar = jest.fn();
        let sourceText = "before target after";
        const snapshot = {
            item: {
                uuid: "ir_1",
                sourcePath: "摘录测试.md",
                sourceMode: "manual-ir",
                stage: "active",
                timesReviewed: 0,
            },
        };

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
                upsertSnapshot: jest.fn(),
                undoReviewedQuota: jest.fn(),
                get: jest.fn(() => snapshot.item),
                syncFileExtracts: jest.fn(() => ({ added: [], updated: [], graduated: [] })),
                save: jest.fn(() => Promise.resolve()),
            },
            getExtractDeckNameForFile: jest.fn(() => "摘录测试"),
            appendExtractSyncResult: jest.fn(() => Promise.resolve()),
            appendSyroExtractUpsert: jest.fn(() => Promise.resolve()),
            syncEvents: { emit },
            updateStatusBar,
        });

        await SRPlugin.prototype.undoExtractReviewAction.call(plugin, {
            snapshot,
            countDeckName: "deck",
            sourceTextBefore: "before {{ir::target}} after",
            sourceTextAfter: "before target after",
            noteReviewChanged: true,
        });

        expect(sourceText).toBe("before {{ir::target}} after");
        expect(plugin.app.vault.modify).toHaveBeenCalledWith(
            file,
            "before {{ir::target}} after",
        );
        expect(emit).toHaveBeenCalledWith("note-review-updated");
    });

    test("undoing a manual extract graduation does not overwrite later source edits", async () => {
        const file = createTFile("摘录测试.md");
        const emit = jest.fn();
        const updateStatusBar = jest.fn();
        const snapshot = {
            item: {
                uuid: "ir_1",
                sourcePath: "摘录测试.md",
                sourceMode: "manual-ir",
                stage: "active",
                timesReviewed: 0,
            },
        };

        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            app: {
                vault: {
                    getAbstractFileByPath: jest.fn(() => file),
                    read: jest.fn(() => Promise.resolve("before user edit after")),
                    modify: jest.fn(() => Promise.resolve()),
                },
            },
            extractStore: {
                upsertSnapshot: jest.fn(),
                undoReviewedQuota: jest.fn(),
                get: jest.fn(() => snapshot.item),
                save: jest.fn(() => Promise.resolve()),
            },
            appendSyroExtractUpsert: jest.fn(() => Promise.resolve()),
            syncEvents: { emit },
            updateStatusBar,
        });

        const result = await SRPlugin.prototype.undoExtractReviewAction.call(plugin, {
            snapshot,
            countDeckName: "deck",
            sourceTextBefore: "before {{ir::target}} after",
            sourceTextAfter: "before target after",
            noteReviewChanged: true,
        });

        expect(result).toBe(snapshot.item);
        expect(plugin.app.vault.modify).not.toHaveBeenCalled();
        expect(plugin.extractStore.upsertSnapshot).toHaveBeenCalledWith(snapshot);
        expect(plugin.extractStore.save).toHaveBeenCalled();
        expect(emit).toHaveBeenCalledWith("extracts-updated");
    });

    test("undoing a manual extract graduation restores the original uuid before file sync", async () => {
        const file = createTFile("摘录测试.md");
        const sourceTextBefore = "before {{ir::target}} after";
        let sourceText = "before target after";
        const extractStore = new ExtractStore(DEFAULT_SETTINGS, { extractsPath: "extracts.json" });
        extractStore.save = jest.fn(() => Promise.resolve());
        const [original] = extractStore.syncFileExtracts(file.path, sourceTextBefore, "摘录测试")
            .added;
        if (!original) throw new Error("Expected original extract");
        extractStore.graduateWithReviewCount(original.uuid, "deck");
        const syncDuringModify = jest.fn((nextText: string) =>
            extractStore.syncFileExtracts(file.path, nextText, "摘录测试"),
        );

        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            app: {
                vault: {
                    getAbstractFileByPath: jest.fn(() => file),
                    read: jest.fn(() => Promise.resolve(sourceText)),
                    modify: jest.fn((_file: TFile, nextText: string) => {
                        sourceText = nextText;
                        syncDuringModify(nextText);
                        return Promise.resolve();
                    }),
                },
            },
            extractStore,
            getExtractDeckNameForFile: jest.fn(() => "摘录测试"),
            appendExtractSyncResult: jest.fn(() => Promise.resolve()),
            appendSyroExtractUpsert: jest.fn(() => Promise.resolve()),
            syncEvents: { emit: jest.fn() },
            updateStatusBar: jest.fn(),
        });

        const result = await SRPlugin.prototype.undoExtractReviewAction.call(plugin, {
            snapshot: { item: original },
            countDeckName: "deck",
            sourceTextBefore,
            sourceTextAfter: "before target after",
            noteReviewChanged: true,
        });

        expect(result?.uuid).toBe(original.uuid);
        expect(extractStore.get(original.uuid)?.stage).toBe("active");
        expect(extractStore.getActiveByPath(file.path).map((item) => item.uuid)).toEqual([
            original.uuid,
        ]);
        expect(syncDuringModify).toHaveBeenCalled();
        expect(sourceText).toBe(sourceTextBefore);
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

    test("syncs automatic extracts from a single markdown file", async () => {
        const file = createTFile("摘录测试.md");
        const emit = jest.fn();
        const updateStatusBar = jest.fn();
        const rule = {
            sourcePath: "摘录测试.md",
            rule: "heading" as const,
            headingLevel: 1 as const,
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
        };

        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            data: {
                settings: {
                    enableExtracts: true,
                    autoExtractRules: {
                        "摘录测试.md": rule,
                    },
                    convertFoldersToDecks: true,
                    trackedNoteToDecks: false,
                },
            },
            app: {
                vault: {
                    cachedRead: jest.fn(() => Promise.resolve("# A\none")),
                },
            },
            getExtractDeckNameForFile: jest.fn(() => "摘录测试"),
            extractStore: {
                syncAutoExtractsForFile: jest.fn(() => ({
                    added: [{ uuid: "auto_1" }],
                    updated: [],
                    graduated: [],
                })),
                save: jest.fn(() => Promise.resolve()),
            },
            appendExtractSyncResult: jest.fn(() => Promise.resolve()),
            syncEvents: { emit },
            updateStatusBar,
        });

        await SRPlugin.prototype.syncAutoExtractsFromFile.call(plugin, file);

        expect(plugin.extractStore.syncAutoExtractsForFile).toHaveBeenCalledWith(
            "摘录测试.md",
            "# A\none",
            "摘录测试",
            expect.objectContaining({
                ...rule,
                headingLevels: [1],
            }),
        );
        expect(plugin.extractStore.save).toHaveBeenCalled();
        expect(emit).toHaveBeenCalledWith("extracts-updated");
        expect(updateStatusBar).toHaveBeenCalled();
    });

    test("keeps automatic extracts in deck stats after repeated file sync", async () => {
        const file = createTFile("知识.md");
        const rule = {
            sourcePath: "知识.md",
            rule: "heading" as const,
            headingLevel: 1 as const,
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
        };
        const extractStore = new ExtractStore(DEFAULT_SETTINGS, { extractsPath: "extracts.json" });
        extractStore.save = jest.fn(() => Promise.resolve());
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            data: {
                settings: {
                    ...DEFAULT_SETTINGS,
                    enableExtracts: true,
                    autoExtractRules: {
                        "知识.md": rule,
                    },
                    convertFoldersToDecks: true,
                    trackedNoteToDecks: false,
                },
            },
            app: {
                vault: {
                    cachedRead: jest.fn(() => Promise.resolve("# A\none")),
                    getAbstractFileByPath: jest.fn(() => file),
                },
            },
            createSrTFile: jest.fn((inputFile: TFile) => ({
                path: inputFile.path,
                getAllTagsFromCache: () => [],
            })),
            extractStore,
            appendExtractSyncResult: jest.fn(() => Promise.resolve()),
            syncEvents: { emit: jest.fn() },
            updateStatusBar: jest.fn(),
        });

        await SRPlugin.prototype.syncExtractsFromFile.call(plugin, file);
        await SRPlugin.prototype.syncExtractsFromFile.call(plugin, file);

        expect(SRPlugin.prototype.getActiveExtractDeckPaths.call(plugin)).toEqual(["知识"]);
        expect(SRPlugin.prototype.getExtractReviewStats.call(plugin, "知识", true)).toEqual({
            newCount: 1,
            dueCount: 0,
            totalCount: 1,
        });
    });

    test("enables an automatic extract rule and immediately syncs the file", async () => {
        const file = createTFile("摘录测试.md");
        const syncAutoExtractsFromFile = jest.fn(() => Promise.resolve());
        const savePluginData = jest.fn(() => Promise.resolve());
        const emit = jest.fn();
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            data: {
                settings: {
                    autoExtractRules: {},
                },
            },
            savePluginData,
            syncAutoExtractsFromFile,
            syncEvents: { emit },
        });

        const rule = await SRPlugin.prototype.enableAutoExtractRule.call(plugin, file, {
            rule: "heading",
            headingLevel: 2,
        });

        expect(rule).toEqual(
            expect.objectContaining({
                sourcePath: "摘录测试.md",
                rule: "heading",
                headingLevel: 2,
                headingLevels: [2],
                enabled: true,
            }),
        );
        expect(plugin.data.settings.autoExtractRules["摘录测试.md"]).toBe(rule);
        expect(savePluginData).toHaveBeenCalledWith({ domains: ["shared-settings"] });
        expect(syncAutoExtractsFromFile).toHaveBeenCalledWith(file, rule);
        expect(emit).toHaveBeenCalledWith("note-review-updated");
    });

    test("enables all heading levels for automatic extracts", async () => {
        const file = createTFile("摘录测试.md");
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            data: { settings: { autoExtractRules: {} } },
            savePluginData: jest.fn(() => Promise.resolve()),
            syncAutoExtractsFromFile: jest.fn(() => Promise.resolve()),
            syncEvents: { emit: jest.fn() },
        });

        const rule = await SRPlugin.prototype.setAutoExtractAllHeadings.call(plugin, file, true);

        expect(rule).toEqual(
            expect.objectContaining({
                sourcePath: "摘录测试.md",
                rule: "heading",
                headingLevels: [1, 2, 3, 4, 5, 6],
                allHeadingLevels: true,
                enabled: true,
            }),
        );
        expect(plugin.data.settings.autoExtractRules["摘录测试.md"]).toBe(rule);
        expect(plugin.syncAutoExtractsFromFile).toHaveBeenCalledWith(file, rule);
    });

    test("turning off one level from all headings preserves the other H1-H6 levels", async () => {
        const file = createTFile("摘录测试.md");
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            data: {
                settings: {
                    autoExtractRules: {
                        "摘录测试.md": {
                            sourcePath: "摘录测试.md",
                            rule: "heading",
                            headingLevels: [1, 2, 3, 4, 5, 6],
                            allHeadingLevels: true,
                            enabled: true,
                            createdAt: 1,
                            updatedAt: 1,
                        },
                    },
                },
            },
            savePluginData: jest.fn(() => Promise.resolve()),
            syncAutoExtractsFromFile: jest.fn(() => Promise.resolve()),
            syncEvents: { emit: jest.fn() },
        });

        const rule = await SRPlugin.prototype.setAutoExtractHeadingLevel.call(plugin, file, 3, false);

        expect(rule).toEqual(
            expect.objectContaining({
                headingLevels: [1, 2, 4, 5, 6],
                allHeadingLevels: false,
                enabled: true,
            }),
        );
        expect(plugin.syncAutoExtractsFromFile).toHaveBeenCalledWith(file, rule);
    });

    test("automatic extract graduation does not edit source markdown", async () => {
        const graduated = {
            uuid: "auto_1",
            sourceMode: "auto-slice",
            sliceRule: "heading",
            stage: "graduated",
            memo: "",
            sourcePath: "摘录测试.md",
            rawMarkdown: "# A\none",
            sourceAnchor: { start: 0, end: 7 },
        };
        const emit = jest.fn();
        const updateStatusBar = jest.fn();
        const plugin = Object.assign(Object.create(SRPlugin.prototype), {
            app: {
                vault: {
                    read: jest.fn(),
                    modify: jest.fn(),
                },
            },
            extractStore: {
                get: jest.fn(() => ({
                    ...graduated,
                    stage: "active",
                })),
                graduateWithReviewCount: jest.fn(() => graduated),
                save: jest.fn(() => Promise.resolve()),
            },
            appendSyroExtractGraduate: jest.fn(() => Promise.resolve()),
            reviewCommitStore: null,
            syncEvents: { emit },
            updateStatusBar,
        });

        await SRPlugin.prototype.graduateExtract.call(plugin, "auto_1", "deck");

        expect(plugin.app.vault.modify).not.toHaveBeenCalled();
        expect(plugin.extractStore.graduateWithReviewCount).toHaveBeenCalledWith("auto_1", "deck");
        expect(plugin.appendSyroExtractGraduate).toHaveBeenCalledWith({ item: graduated });
        expect(emit).toHaveBeenCalledWith("extracts-updated");
        expect(updateStatusBar).toHaveBeenCalled();
    });
});
