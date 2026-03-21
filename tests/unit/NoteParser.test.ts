import { TopicPath } from "src/TopicPath";
import { Note } from "src/Note";
import { Question } from "src/Question";
import { DEFAULT_SETTINGS } from "src/settings";
import { NoteFileLoader } from "src/NoteFileLoader";
import { setupStaticDateProvider_20230906 } from "./helpers/DateProviderTestUtils";
import { TextDirection } from "src/util/TextDirection";
import { UnitTestSRFile } from "./helpers/UnitTestSRFile";

const loader: NoteFileLoader = new NoteFileLoader(DEFAULT_SETTINGS);

beforeAll(() => {
    setupStaticDateProvider_20230906();
});

describe("Multiple questions in the text", () => {
    test("SingleLineBasic: No schedule info", async () => {
        const noteText: string = `#flashcards/test
Q1::A1
Q2::A2
Q3::A3
`;
        const file: UnitTestSRFile = new UnitTestSRFile(noteText);
        const folderTopicPath = TopicPath.emptyPath;
        const note: Note = await loader.load(file, TextDirection.Ltr, folderTopicPath);
        const questionList = note.questionList;
        expect(questionList.length).toEqual(3);
    });
});
