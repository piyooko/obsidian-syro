import {
    normalizeFrontmatterTags,
    parseFolderTrackingTagInput,
    renamePathPrefix,
    resolveFolderTrackingRule,
} from "src/folderTracking";

describe("folderTracking helpers", () => {
    test("parseFolderTrackingTagInput normalizes separators and hashes", () => {
        expect(parseFolderTrackingTagInput("review, #project\nalpha  #review")).toEqual([
            "#review",
            "#project",
            "#alpha",
        ]);
    });

    test("normalizeFrontmatterTags accepts arrays and comma separated strings", () => {
        expect(normalizeFrontmatterTags(["review", "#project"])).toEqual(["#review", "#project"]);
        expect(normalizeFrontmatterTags("review,project/alpha")).toEqual([
            "#review",
            "#project/alpha",
        ]);
    });

    test("resolveFolderTrackingRule prefers the nearest matching folder", () => {
        const resolved = resolveFolderTrackingRule(
            {
                Projects: {
                    track: true,
                    autoTag: false,
                    tags: [],
                    ownedTagsByPath: {},
                    excludedPaths: [],
                },
                "Projects/Alpha": {
                    track: false,
                    autoTag: true,
                    tags: ["#alpha"],
                    ownedTagsByPath: {},
                    excludedPaths: [],
                },
            },
            "Projects/Alpha/Note.md",
        );

        expect(resolved?.folderPath).toBe("Projects/Alpha");
        expect(resolved?.rule.autoTag).toBe(true);
    });

    test("renamePathPrefix rewrites exact paths and descendants only", () => {
        expect(renamePathPrefix("Projects/Alpha", "Projects/Alpha", "Archive/Alpha")).toBe(
            "Archive/Alpha",
        );
        expect(renamePathPrefix("Projects/Alpha/Note.md", "Projects/Alpha", "Archive/Alpha")).toBe(
            "Archive/Alpha/Note.md",
        );
        expect(renamePathPrefix("Projects/Beta/Note.md", "Projects/Alpha", "Archive/Alpha")).toBe(
            "Projects/Beta/Note.md",
        );
    });
});
