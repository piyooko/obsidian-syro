import {
    buildAutoHeadingLocators,
    buildManualIrLocators,
    normalizePersistedExtractNoteCache,
} from "src/cache/extractNoteCache";
import { parseIrExtracts } from "src/util/irExtractParser";

describe("extractNoteCache", () => {
    test("builds compact manual IR locators from parsed extracts", () => {
        const source = "{{ir::one}}\nline {{ir::two {{ir::nested}}}}";
        const matches = parseIrExtracts(source);
        const uuidByStart = new Map<number, string>(
            matches.map((match, index) => [match.start, `ir_${index}`]),
        );

        const cache = buildManualIrLocators(source, matches, uuidByStart);

        expect(cache.locators.ir_0).toMatchObject({
            uuid: "ir_0",
            startLine: 0,
            endLine: 0,
            lineOrdinal: 0,
            depth: 0,
        });
        expect(cache.locators.ir_2).toMatchObject({
            uuid: "ir_2",
            startLine: 1,
            lineOrdinal: 1,
            depth: 1,
            parentUuid: "ir_1",
        });
    });

    test("builds heading locators with title path and sibling ordinal", () => {
        const source = "# A\n\n## Same\none\n\n## Same\ntwo\n\n# B";

        const cache = buildAutoHeadingLocators(source, {
            sourcePath: "note.md",
            rule: "heading",
            headingLevel: 2,
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
        });

        expect(
            cache?.headings.map((heading) => ({
                key: heading.autoSliceKey,
                title: heading.title,
                titlePath: heading.titlePath,
                siblingTitleOrdinal: heading.siblingTitleOrdinal,
                startLine: heading.startLine,
            })),
        ).toEqual([
            {
                key: "heading:2:A/Same:0",
                title: "Same",
                titlePath: ["A", "Same"],
                siblingTitleOrdinal: 0,
                startLine: 2,
            },
            {
                key: "heading:2:A/Same:1",
                title: "Same",
                titlePath: ["A", "Same"],
                siblingTitleOrdinal: 1,
                startLine: 5,
            },
        ]);
    });

    test("builds heading locators for all extended heading levels", () => {
        const cache = buildAutoHeadingLocators("# A\n## B\n####### C\n########## D", {
            sourcePath: "note.md",
            rule: "heading",
            headingLevels: [1, 2, 3, 4, 5, 6],
            allHeadingLevels: true,
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
        });

        expect(
            cache?.headings.map((heading) => ({
                level: heading.level,
                key: heading.autoSliceKey,
            })),
        ).toEqual([
            { level: 1, key: "heading:1:A:0" },
            { level: 2, key: "heading:2:A/B:0" },
            { level: 7, key: "heading:7:A/B/C:0" },
            { level: 10, key: "heading:10:A/B/C/D:0" },
        ]);
        expect(cache?.rule).toMatchObject({
            headingLevels: [1, 2, 3, 4, 5, 6],
            allHeadingLevels: true,
        });
    });

    test("normalizes multi-level heading cache rules", () => {
        const cache = normalizePersistedExtractNoteCache({
            scannedAt: 1,
            fileMtime: 2,
            autoHeadings: {
                rule: {
                    kind: "heading",
                    headingLevels: [3, 1, 3, 10],
                },
                headings: [
                    {
                        autoSliceKey: "heading:10:A:0",
                        title: "A",
                        titlePath: ["A"],
                        level: 10,
                        siblingTitleOrdinal: 0,
                        startLine: 0,
                        endLine: 0,
                        headingLineOrdinal: 0,
                    },
                ],
            },
        });

        expect(cache?.autoHeadings?.rule.headingLevels).toEqual([1, 3, 10]);
        expect(cache?.autoHeadings?.headings[0].level).toBe(10);
    });

    test("normalizes persisted extract note cache defensively", () => {
        const cache = normalizePersistedExtractNoteCache({
            scannedAt: 1,
            fileMtime: 2,
            fileSize: 3,
            manualIr: {
                locators: {
                    ir_1: {
                        uuid: "ir_1",
                        startLine: 4,
                        endLine: 5,
                        lineOrdinal: 0,
                        depth: 1,
                        outerStart: 10,
                        outerEnd: 20,
                    },
                },
            },
        });

        expect(cache?.manualIr?.locators.ir_1).toMatchObject({
            uuid: "ir_1",
            startLine: 4,
            lineOrdinal: 0,
            depth: 1,
        });
    });
});
