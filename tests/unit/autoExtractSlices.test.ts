import { buildAutoExtractSlices } from "src/util/autoExtractSlices";

describe("autoExtractSlices", () => {
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
