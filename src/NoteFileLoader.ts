/**
 * 这个文件主要是干什么的：
 * 负责从磁盘加载并解析笔记文件。
 * 它是连接文件系统 (ISRFile) 和 模型对象 (Note) 的工厂类。
 *
 * 它在项目中属于：工具层 (Utility Layer)
 *
 * 它会用到哪些文件：
 * 1. src/SRFile.ts (文件读取)
 * 2. src/NoteQuestionParser.ts (解析内容)
 * 3. src/Note.ts (生成的对象)
 *
 * 哪些文件会用到它：
 * 1. src/main.ts (加载插件数据时)
 * 2. src/FlashcardReviewSequencer.ts (需要加载特定笔记时)
 */
import { ISRFile } from "./SRFile";
import { Note } from "./Note";
import { Question } from "./Question";
import { TopicPath } from "./TopicPath";
import { NoteQuestionParser } from "./NoteQuestionParser";
import { SRSettings } from "./settings";
import { TextDirection } from "./util/TextDirection";

export class NoteFileLoader {
    fileText: string;
    fixesMade: boolean;
    noteTopicPath: TopicPath;
    noteFile: ISRFile;
    settings: SRSettings;

    constructor(settings: SRSettings) {
        this.settings = settings;
    }

    async load(
        noteFile: ISRFile,
        defaultTextDirection: TextDirection,
        folderTopicPath: TopicPath,
    ): Promise<Note | null> {
        this.noteFile = noteFile;

        const questionParser: NoteQuestionParser = new NoteQuestionParser(this.settings);

        const onlyKeepQuestionsWithTopicPath: boolean = true;
        const questionList: Question[] = await questionParser.createQuestionList(
            noteFile,
            defaultTextDirection,
            folderTopicPath,
            onlyKeepQuestionsWithTopicPath,
        );

        const result: Note = new Note(noteFile, questionList, questionParser.noteText);
        return result;
    }
}
