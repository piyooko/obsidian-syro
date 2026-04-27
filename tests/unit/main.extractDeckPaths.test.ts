import { TFile } from "obsidian";
import { Deck, DeckTreeFilter } from "src/Deck";
import SRPlugin from "src/main";

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
});
