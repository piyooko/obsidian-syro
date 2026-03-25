const fs = require("fs");
const os = require("os");
const path = require("path");

const { scanI18nFile, scanI18nProject } = require("../../scripts/check-i18n-core.cjs");

describe("check-i18n", () => {
    let tempRoot: string;

    beforeEach(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "syro-i18n-"));
    });

    afterEach(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test("reports hardcoded Notice text", () => {
        const filePath = path.join(tempRoot, "src", "sample.ts");
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(
            filePath,
            'import { Notice } from "obsidian";\nnew Notice("Review failed");\n',
            "utf8",
        );

        const findings = scanI18nFile(filePath, { rootDir: tempRoot, allowlist: [] });

        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({
            kind: "notice",
            text: "Review failed",
            relativePath: "src/sample.ts",
        });
    });

    test("ignores placeholders and technical log prefixes", () => {
        const filePath = path.join(tempRoot, "src", "sample.ts");
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(
            filePath,
            [
                'text.setPlaceholder("1.0");',
                'console.error("[SR] sync failed", error);',
                'export const COMMAND_ID = "editor:toggle-bold";',
                "",
            ].join("\n"),
            "utf8",
        );

        const findings = scanI18nFile(filePath, { rootDir: tempRoot, allowlist: [] });
        expect(findings).toHaveLength(0);
    });

    test("supports allowlisting by file and text fragment", () => {
        const filePath = path.join(tempRoot, "src", "firstRunTutorial.ts");
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(
            filePath,
            'export const FIRST_RUN_TUTORIALS = { en: { content: "Welcome to Syro" } };\n',
            "utf8",
        );

        const withoutAllowlist = scanI18nProject({
            rootDir: tempRoot,
            allowlist: [],
        });
        expect(withoutAllowlist).toHaveLength(1);
        expect(withoutAllowlist[0]).toMatchObject({
            kind: "exported-template",
            text: "Welcome to Syro",
        });

        const withAllowlist = scanI18nProject({
            rootDir: tempRoot,
            allowlist: [
                {
                    file: "src/firstRunTutorial.ts",
                    textIncludes: ["Welcome to Syro"],
                },
            ],
        });
        expect(withAllowlist).toHaveLength(0);
    });
});
