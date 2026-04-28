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

        expect(cache?.headings.map((heading) => ({
            key: heading.autoSliceKey,
            title: heading.title,
            titlePath: heading.titlePath,
            siblingTitleOrdinal: heading.siblingTitleOrdinal,
            startLine: heading.startLine,
        }))).toEqual([
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
