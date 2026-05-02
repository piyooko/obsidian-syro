import { normalizeAutoExtractRule } from "src/settings";
import { buildAutoExtractSlices } from "src/util/autoExtractSlices";

describe("autoExtractSlices", () => {
    test("normalizes legacy and multi-level heading rules", () => {
        expect(
            normalizeAutoExtractRule(
                {
                    sourcePath: "note.md",
                    rule: "heading",
                    headingLevel: 2,
                    enabled: true,
                    createdAt: 1,
                    updatedAt: 1,
                },
                "note.md",
            )?.headingLevels,
        ).toEqual([2]);

        expect(
            normalizeAutoExtractRule(
                {
                    sourcePath: "note.md",
                    rule: "heading",
                    headingLevels: [3, 1, 3, 10],
                    enabled: true,
                    createdAt: 1,
                    updatedAt: 1,
                },
                "note.md",
            )?.headingLevels,
        ).toEqual([1, 3, 10]);
    });

    test("cuts heading sections at the selected heading level", () => {
        const slices = buildAutoExtractSlices(
            "# Root\nintro\n## A\na\n### Deep\nchild\n## B\nb\n# Next\nn",
            {
                sourcePath: "note.md",
                rule: "heading",
                headingLevel: 2,
                enabled: true,
                createdAt: 1,
                updatedAt: 1,
            },
        );

        expect(slices.map((slice) => slice.rawMarkdown)).toEqual([
            "## A\na\n### Deep\nchild",
            "## B\nb",
        ]);
        expect(slices.map((slice) => slice.key)).toEqual([
            "heading:2:Root/A:0",
            "heading:2:Root/B:0",
        ]);
    });

    test("disambiguates same-name headings under the same parent", () => {
        const slices = buildAutoExtractSlices("# Root\n## A\none\n## A\ntwo", {
            sourcePath: "note.md",
            rule: "heading",
            headingLevel: 2,
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
        });

        expect(slices.map((slice) => slice.key)).toEqual([
            "heading:2:Root/A:0",
            "heading:2:Root/A:1",
        ]);
    });

    test("ignores headings inside fenced code blocks", () => {
        const slices = buildAutoExtractSlices("# Real\n```md\n# Code\n```\ntext", {
            sourcePath: "note.md",
            rule: "heading",
            headingLevel: 1,
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
        });

        expect(slices).toHaveLength(1);
        expect(slices[0].rawMarkdown).toBe("# Real\n```md\n# Code\n```\ntext");
    });

    test("cuts only selected heading levels in multi-level mode", () => {
        const slices = buildAutoExtractSlices("# Root\n## A\na\n### B\nb\n#### C\nc\n## D\nd", {
            sourcePath: "note.md",
            rule: "heading",
            headingLevels: [2, 4],
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
        });

        expect(slices.map((slice) => slice.key)).toEqual([
            "heading:2:Root/A:0",
            "heading:4:Root/A/B/C:0",
            "heading:2:Root/D:0",
        ]);
        expect(slices[0].rawMarkdown).toBe("## A\na\n### B\nb\n#### C\nc");
        expect(slices[1].rawMarkdown).toBe("#### C\nc");
    });

    test("all-heading mode creates slices for extended heading levels", () => {
        const slices = buildAutoExtractSlices(
            "# Root\n## A\na\n####### Deep\nd\n########## Ten\nt",
            {
                sourcePath: "note.md",
                rule: "heading",
                headingLevels: [1, 2, 3, 4, 5, 6],
                allHeadingLevels: true,
                enabled: true,
                createdAt: 1,
                updatedAt: 1,
            },
        );

        expect(slices.map((slice) => slice.key)).toEqual([
            "heading:1:Root:0",
            "heading:2:Root/A:0",
            "heading:7:Root/A/Deep:0",
            "heading:10:Root/A/Deep/Ten:0",
        ]);
    });

    test("does not create slices when heading rules are disabled", () => {
        const slices = buildAutoExtractSlices("# A\ntext", {
            sourcePath: "note.md",
            rule: "heading",
            headingLevel: 1,
            enabled: false,
            createdAt: 1,
            updatedAt: 1,
        });

        expect(slices).toHaveLength(0);
    });
});
