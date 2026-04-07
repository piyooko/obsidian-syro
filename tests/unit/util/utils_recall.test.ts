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

        expect(BlockUtils.getOrderedFingerprintKeys(text, settings)).toEqual(["c1_l0", "cb0"]);
        expect(BlockUtils.getFingerprintParts(text, settings)).toEqual(["anki", "plain"]);
        expect(BlockUtils.getFingerprintMap(text, settings)).toEqual({
            c1_l0: "anki",
            cb0: "plain",
        });
        expect(BlockUtils.getFingerprintMapWithContext(text, settings)).toMatchObject({
            c1_l0: { content: "anki" },
            cb0: { content: "plain" },
        });
    });

    test("keeps Anki line-scoped keys in source order for non-code content", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            convertAnkiClozesToClozes: true,
        };
        syncDefaultClozePatterns(settings);

        const text = "{{c2::alpha}}\n{{c1::beta}}\n{{c2::gamma}}";

        expect(BlockUtils.getOrderedFingerprintKeys(text, settings)).toEqual([
            "c2_l0",
            "c1_l1",
            "c2_l2",
        ]);
        expect(BlockUtils.getFingerprintParts(text, settings)).toEqual(["alpha", "beta", "gamma"]);
    });

    test("orders mixed Anki, standard, and plain curly keys like generated cards", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            convertAnkiClozesToClozes: true,
            convertHighlightsToClozes: true,
            convertCurlyBracketsToClozes: true,
        };
        syncDefaultClozePatterns(settings);

        const text = "{{c1::anki}} ==highlight== {{plain}}";

        expect(BlockUtils.getOrderedFingerprintKeys(text, settings)).toEqual([
            "c1_l0",
            "hl0",
            "cb0",
        ]);
        expect(BlockUtils.getFingerprintParts(text, settings)).toEqual([
            "anki",
            "highlight",
            "plain",
        ]);
    });
});
