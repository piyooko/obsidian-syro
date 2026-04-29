const { scanContent } = require("../../scripts/detect-mojibake-core.cjs");

const garbledAnkiCloze = `Anki ${String.fromCharCode(0x93b8, 0x682b, 0x2516)}`;
const shortGarbledCloze = String.fromCharCode(0x93b8, 0x682b);

describe("detect-mojibake", () => {
    test("reports the garbled Anki cloze supporter notice as a runtime string", () => {
        const findings = scanContent(`new Notice("${garbledAnkiCloze}");\n`, "src/sample.ts");

        expect(findings).toEqual([
            expect.objectContaining({
                file: "src/sample.ts",
                lineNumber: 1,
                category: "runtime-string",
            }),
        ]);
    });

    test("reports garbled tooltip title strings without requiring four suspicious characters", () => {
        const findings = scanContent(
            `<button title="Anki ${shortGarbledCloze}">Bad</button>\n`,
            "src/sample.tsx",
        );

        expect(findings).toEqual([
            expect.objectContaining({
                file: "src/sample.tsx",
                lineNumber: 1,
                category: "runtime-string",
            }),
        ]);
    });

    test("ignores normal localized Anki cloze labels", () => {
        expect(scanContent('new Notice("Anki 挖空");\n', "src/sample.ts")).toEqual([]);
        expect(scanContent('const label = t("SETTINGS_ANKI_CLOZE");\n', "src/sample.ts")).toEqual(
            [],
        );
    });
});
