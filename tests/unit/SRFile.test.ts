import { TFile } from "obsidian";
import { SrTFile } from "src/SRFile";

function createHeading(heading: string, level: number, line: number) {
    return {
        heading,
        level,
        position: {
            start: { line, col: 0, offset: 0 },
            end: { line, col: heading.length, offset: heading.length },
        },
    };
}

describe("SrTFile.getQuestionContext", () => {
    test("returns nested breadcrumb metadata for headings before the card line", () => {
        const file = Object.assign(new TFile(), { path: "note.md", basename: "note" });
        const metadataCache = {
            getFileCache: jest.fn(() => ({
                headings: [
                    createHeading("Root[^1]", 1, 0),
                    createHeading("Child", 2, 2),
                    createHeading("Leaf", 3, 4),
                    createHeading("Later sibling", 2, 8),
                ],
            })),
        };
        const srFile = new SrTFile({} as never, metadataCache as never, file);

        expect(srFile.getQuestionContext(6)).toEqual([
            { label: "Root", line: 0, level: 1 },
            { label: "Child", line: 2, level: 2 },
            { label: "Leaf", line: 4, level: 3 },
        ]);
    });

    test("replaces same-level headings when a later sibling becomes active", () => {
        const file = Object.assign(new TFile(), { path: "note.md", basename: "note" });
        const metadataCache = {
            getFileCache: jest.fn(() => ({
                headings: [
                    createHeading("Root", 1, 0),
                    createHeading("Child", 2, 2),
                    createHeading("Sibling", 2, 5),
                ],
            })),
        };
        const srFile = new SrTFile({} as never, metadataCache as never, file);

        expect(srFile.getQuestionContext(6)).toEqual([
            { label: "Root", line: 0, level: 1 },
            { label: "Sibling", line: 5, level: 2 },
        ]);
    });

    test("returns an empty breadcrumb trail when the file has no headings", () => {
        const file = Object.assign(new TFile(), { path: "note.md", basename: "note" });
        const metadataCache = {
            getFileCache: jest.fn(() => ({ headings: [] })),
        };
        const srFile = new SrTFile({} as never, metadataCache as never, file);

        expect(srFile.getQuestionContext(3)).toEqual([]);
    });
});
