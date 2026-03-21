import { Card } from "src/Card";
import { Deck } from "src/Deck";
import { Note } from "src/Note";
import { NoteFileLoader } from "src/NoteFileLoader";
import { NoteQuestionParser } from "src/NoteQuestionParser";
import { CardType, Question } from "src/Question";
import { CardFrontBack, CardFrontBackUtil } from "src/question-type";
import { DEFAULT_SETTINGS, SRSettings } from "src/settings";
import { TopicPath } from "src/TopicPath";
import { TextDirection } from "src/util/TextDirection";
import { UnitTestSRFile } from "./helpers/UnitTestSRFile";
import { CardOrder, DeckOrder, DeckTreeIterator } from "src/DeckTreeIterator";

export function createTest_NoteQuestionParser(settings: SRSettings): NoteQuestionParser {
    const questionParser: NoteQuestionParser = new NoteQuestionParser(settings);
    return questionParser;
}
export function createTest_NoteParser(): NoteFileLoader {
    const settings: SRSettings = { ...DEFAULT_SETTINGS, convertFoldersToDecks: false };
    const result = new NoteFileLoader(settings);
    return result;
}

export class SampleItemDecks {
    static async createSingleLevelTree_NewCards(): Promise<Deck> {
        const text: string = `
Q1::A1
Q2::A2
Q3::A3`;
        return await SampleItemDecks.createDeckFromText(text, new TopicPath(["flashcards"]));
    }

    static createScienceTree(): Deck {
        const deck: Deck = new Deck("Root", null);
        deck.getOrCreateDeck(new TopicPath(["Science", "Physics", "Electromagnetism"]));
        deck.getOrCreateDeck(new TopicPath(["Science", "Physics", "Light"]));
        deck.getOrCreateDeck(new TopicPath(["Science", "Physics", "Fluids"]));
        deck.getOrCreateDeck(new TopicPath(["Math", "Geometry"]));
        deck.getOrCreateDeck(new TopicPath(["Math", "Algebra", "Polynomials"]));
        return deck;
    }

    static async createDeckFromText(
        text: string,
        folderTopicPath: TopicPath = TopicPath.emptyPath,
    ): Promise<Deck> {
        const file: UnitTestSRFile = new UnitTestSRFile(text);
        return await this.createDeckFromFile(file, folderTopicPath);
    }

    static async createDeckAndIteratorFromText(
        text: string,
        folderTopicPath: TopicPath,
        cardOrder: CardOrder,
        deckOrder: DeckOrder,
    ): Promise<[Deck, DeckTreeIterator]> {
        const deck: Deck = await SampleItemDecks.createDeckFromText(text, folderTopicPath);
        const iterator: DeckTreeIterator = new DeckTreeIterator(
            {
                cardOrder,
                deckOrder,
            },
            deck,
        );
        return [deck, iterator];
    }

    static async createDeckFromFile(
        file: UnitTestSRFile,
        folderTopicPath: TopicPath = TopicPath.emptyPath,
    ): Promise<Deck> {
        const deck: Deck = new Deck("Root", null);
        const noteLoader: NoteFileLoader = createTest_NoteParser();
        const note: Note = await noteLoader.load(file, TextDirection.Ltr, folderTopicPath);
        note.appendCardsToDeck(deck);
        return deck;
    }
}
