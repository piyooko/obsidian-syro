import { Card } from "src/Card";
import { Note } from "src/Note";
import { ParsedQuestionInfo } from "src/parser";
import { CardType, Question, QuestionText } from "src/Question";
import { serializeNote, deserializeNote } from "src/cache/noteCacheStore";
import { TextDirection } from "src/util/TextDirection";
import { UnitTestSRFile } from "./helpers/UnitTestSRFile";

describe("noteCacheStore", () => {
    test("preserves breadcrumb metadata when serializing and deserializing notes", () => {
        const file = new UnitTestSRFile("## Child\nQ::A", "note.md");
        const question = new Question({
            parsedQuestionInfo: new ParsedQuestionInfo(CardType.SingleLineBasic, "Q::A", 1, 1),
            topicPathList: null,
            questionText: new QuestionText("Q::A", null, "Q::A", TextDirection.Ltr, null),
            hasEditLaterTag: false,
            questionContext: [
                { label: "Root", line: 0, level: 1 },
                { label: "Child", line: 1, level: 2 },
            ],
            cards: [],
            hasChanged: false,
        });
        question.setCardList([new Card({ cardIdx: 0, scheduleInfo: null })]);
        const note = new Note(file, [question], "## Child\nQ::A");

        const serialized = serializeNote(note);
        expect(serialized.questions[0].questionContext).toEqual([
            { label: "Root", line: 0, level: 1 },
            { label: "Child", line: 1, level: 2 },
        ]);

        const deserialized = deserializeNote(serialized, file);
        expect(deserialized.questionList[0].questionContext).toEqual([
            { label: "Root", line: 0, level: 1 },
            { label: "Child", line: 1, level: 2 },
        ]);
    });
});
