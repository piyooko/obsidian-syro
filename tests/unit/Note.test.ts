import { TopicPath } from "src/TopicPath";
import { Deck } from "src/Deck";
import { Note } from "src/Note";
import { DEFAULT_SETTINGS } from "src/settings";
import { NoteFileLoader } from "src/NoteFileLoader";
import { TextDirection } from "src/util/TextDirection";
import { UnitTestSRFile } from "./helpers/UnitTestSRFile";

const noteFileLoader: NoteFileLoader = new NoteFileLoader({
    ...DEFAULT_SETTINGS,
    convertFoldersToDecks: false,
});

describe("appendCardsToDeck", () => {
    test("Multiple questions, single card per question", async () => {
        const noteText: string = `#flashcards/test
Q1::A1
Q2::A2
Q3::A3
`;
        const file: UnitTestSRFile = new UnitTestSRFile(noteText);
        const folderTopicPath = TopicPath.emptyPath;
        const note: Note = await noteFileLoader.load(file, TextDirection.Ltr, folderTopicPath);
        const deck: Deck = Deck.emptyDeck;
        note.appendCardsToDeck(deck);
        const subdeck: Deck = deck.getDeck(new TopicPath(["flashcards", "test"]));
        expect(subdeck.newFlashcards[0].front).toEqual("Q1");
        expect(subdeck.newFlashcards[1].front).toEqual("Q2");
        expect(subdeck.newFlashcards[2].front).toEqual("Q3");
        expect(subdeck.dueFlashcards.length).toEqual(0);
    });

    test("Multiple questions, multiple cards per question", async () => {
        const noteText: string = `#flashcards/test
Q1:::A1
Q2:::A2
Q3:::A3
`;
        const file: UnitTestSRFile = new UnitTestSRFile(noteText);
        const folderTopicPath = TopicPath.emptyPath;
        const note: Note = await noteFileLoader.load(file, TextDirection.Ltr, folderTopicPath);
        const deck: Deck = Deck.emptyDeck;
        note.appendCardsToDeck(deck);
        const subdeck: Deck = deck.getDeck(new TopicPath(["flashcards", "test"]));
        expect(subdeck.newFlashcards.length).toEqual(6);
        const frontList = subdeck.newFlashcards.map((card) => card.front);

        expect(frontList).toEqual(["Q1", "A1", "Q2", "A2", "Q3", "A3"]);
        expect(subdeck.dueFlashcards.length).toEqual(0);
    });
});

describe("create Multiple Cloze", () => {
    test("Multiple cloze, some with  schedule details", async () => {
        const originalText: string = `#flashcards/test

This is a really very {{interesting}} and ==fascinating== and **great** test
<!--SR:!2023-09-02,4,270!2023-09-02,5,270-->
`;
        const settings2 = {
            ...DEFAULT_SETTINGS,
            convertFoldersToDecks: false,
            multiClozeCard: true,
            convertBoldTextToClozes: true,
            convertHighlightsToClozes: true,
            convertCurlyBracketsToClozes: true,
            clozePatterns: [
                "==[123;;]answer[;;hint]==",
                "**[123;;]answer[;;hint]**",
                "{{[123;;]answer[;;hint]}}",
            ],
        };

        const file: UnitTestSRFile = new UnitTestSRFile(originalText);
        const folderTopicPath = TopicPath.emptyPath;
        const loader = new NoteFileLoader(settings2);
        const note: Note = await loader.load(file, TextDirection.Ltr, folderTopicPath);

        note.createMultiCloze(settings2);

        const deck: Deck = Deck.emptyDeck;
        note.appendCardsToDeck(deck);
        const subdeck: Deck = deck.getDeck(new TopicPath(["flashcards", "test"]));
        expect(subdeck.newFlashcards).toHaveLength(1);
        expect(subdeck.dueFlashcards).toHaveLength(2);

        const allCards = [...subdeck.newFlashcards, ...subdeck.dueFlashcards];
        const allFronts = allCards.map((card) => card.front);
        const allBacks = allCards.map((card) => card.back).join("\n");

        expect(allCards).toHaveLength(3);
        expect(allFronts.every((front) => front.startsWith("This is a really very "))).toBe(true);
        expect(allFronts.some((front) => front.includes("SR_H:%5B...%5D"))).toBe(true);
        expect(allBacks).toContain("interesting");
        expect(allBacks).toContain("fascinating");
        expect(allBacks).toContain("great");
        expect(
            allBacks.includes("SR_S:") || allBacks.includes("<span style='color:#2196f3'>"),
        ).toBe(true);
    });
});

describe("writeNoteFile", () => {
    test("Multiple questions, some with too many schedule details", async () => {
        const originalText: string = `#flashcards/test
Q1::A1
#flashcards Q2::A2
<!--SR:!2023-09-02,4,270!2023-09-02,5,270-->
Q3:::A3
<!--SR:!2023-09-02,4,270!2023-09-02,5,270!2023-09-02,6,270!2023-09-02,7,270-->
`;
        const file: UnitTestSRFile = new UnitTestSRFile(originalText);
        const note: Note = await noteFileLoader.load(file, TextDirection.Ltr, TopicPath.emptyPath);

        await note.writeNoteFile(DEFAULT_SETTINGS);
        const updatedText: string = file.content;

        const expectedText: string = `#flashcards/test
Q1::A1
#flashcards Q2::A2

Q3:::A3
`;
        expect(updatedText).toEqual(expectedText);
    });
});

describe("cloze review context source text", () => {
    test("clearTransientFileText keeps file text for Anki cloze review", async () => {
        const noteText: string = `#flashcards/test
1
1
1

11{{c1::1}}

111
`;
        const file: UnitTestSRFile = new UnitTestSRFile(noteText);
        const settings = {
            ...DEFAULT_SETTINGS,
            convertFoldersToDecks: false,
            convertAnkiClozesToClozes: true,
            isPro: true,
        };
        const loader = new NoteFileLoader(settings);
        const note: Note = await loader.load(file, TextDirection.Ltr, TopicPath.emptyPath);

        await note.clearTransientFileText(settings);

        expect(note.fileText).toEqual("");
        expect(note.reviewFileText).toEqual(noteText);
    });

    test("ensureReviewFileText reloads source text for cached Anki cloze notes", async () => {
        const noteText: string = `#flashcards/test
1
1
1

11{{c1::1}}

111
`;
        const file: UnitTestSRFile = new UnitTestSRFile(noteText);
        const settings = {
            ...DEFAULT_SETTINGS,
            convertFoldersToDecks: false,
            convertAnkiClozesToClozes: true,
            isPro: true,
        };
        const loader = new NoteFileLoader(settings);
        const note: Note = await loader.load(file, TextDirection.Ltr, TopicPath.emptyPath);
        note.fileText = "";
        note.reviewFileText = "";

        await note.ensureReviewFileText(settings);

        expect(note.reviewFileText).toEqual(noteText);
    });
});
