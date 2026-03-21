/**
 * 这个文件主要是干什么的：
 * [工具层] 多行文本查找与替换工具。
 * 用于在长文本中查找跨越多行的字符串（例如一段被拆分成多行的 HTML 注释），并进行替换。
 * 解决了简单的 `string.replace` 无法处理因换行符处理不一致或多行匹配的问题。
 *
 * 它在项目中属于：工具层 (Utils) / 字符串处理 (String)
 *
 * 它会用到哪些文件：
 * 1. src/util/utils.ts (分行工具)
 *
 * 哪些文件会用到它：
 * 1. src/dataStore/location_switch.ts (迁移数据时删除旧注释)
 */
import { literalStringReplace, splitTextIntoLineArray } from "./utils";

export class MultiLineTextFinder {
    static findAndReplace(
        sourceText: string,
        searchText: string,
        replacementText: string,
    ): string | null {
        let result: string = null;
        if (sourceText.includes(searchText.trimEnd())) {
            result = literalStringReplace(sourceText, searchText, replacementText);
        } else {
            const sourceTextArray = splitTextIntoLineArray(sourceText);
            const searchTextArray = splitTextIntoLineArray(searchText);
            const lineNo: number | null = MultiLineTextFinder.find(
                sourceTextArray,
                searchTextArray,
            );
            if (lineNo !== null) {
                const replacementTextArray = splitTextIntoLineArray(replacementText);
                const linesToRemove: number = searchTextArray.length;
                sourceTextArray.splice(lineNo, linesToRemove, ...replacementTextArray);
                result = sourceTextArray.join("\n");
            }
        }
        return result;
    }

    static find(sourceText: string[], searchText: string[]): number | null {
        let result: number = null;
        let searchIdx: number = 0;
        const maxSearchIdx: number = searchText.length - 1;
        for (let sourceIdx = 0; sourceIdx < sourceText.length; sourceIdx++) {
            const sourceLine: string = sourceText[sourceIdx].trim();
            const searchLine: string = searchText[searchIdx].trim();
            if (searchLine == sourceLine) {
                if (searchIdx == maxSearchIdx) {
                    result = sourceIdx - searchIdx;
                    break;
                }
                searchIdx++;
            } else {
                searchIdx = 0;
            }
        }
        return result;
    }
}
