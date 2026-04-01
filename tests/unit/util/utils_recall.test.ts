import { DEFAULT_SETTINGS, syncDefaultClozePatterns } from "src/settings";
import { BlockUtils, isVersionNewerThanOther } from "src/util/utils_recall";

describe("isVersionNewerThanOther", () => {
    test("newer", async () => {
        const ver = "1.2.5.5";
        const other = "1.2.5.4";
        const result = isVersionNewerThanOther(ver, other);
        expect(result).toEqual(true);
    });

    test("prev", async () => {
        const ver = "1.2.5.5";
        const other = "1.2.5.6";
        const result = isVersionNewerThanOther(ver, other);
        expect(result).toEqual(false);
    });

    test("prev2", async () => {
        const ver = "1.10.1.10";
        const other = "1.10.2.1";
        const result = isVersionNewerThanOther(ver, other);
        expect(result).toEqual(false);
    });
    test("prev3 and newer 4", async () => {
        const ver = "1.10.1.10";
        const other = "1.10.1";
        const result = isVersionNewerThanOther(ver, other);
        expect(result).toEqual(true);
    });
});

describe("BlockUtils plain curly cloze isolation", () => {
    test("keeps plain curly keys separate from Anki keys", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            convertCurlyBracketsToClozes: true,
            convertAnkiClozesToClozes: true,
        };
        syncDefaultClozePatterns(settings);

        const text = "{{plain}} {{c1::anki}}";

        expect(BlockUtils.getOrderedFingerprintKeys(text, settings)).toEqual(["c1", "cb0"]);
        expect(BlockUtils.getFingerprintParts(text, settings)).toEqual(["anki", "plain"]);
        expect(BlockUtils.getFingerprintMap(text, settings)).toEqual({
            c1: "anki",
            cb0: "plain",
        });
        expect(BlockUtils.getFingerprintMapWithContext(text, settings)).toMatchObject({
            c1: { content: "anki" },
            cb0: { content: "plain" },
        });
    });
});
