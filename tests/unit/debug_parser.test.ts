import * as fs from "fs";

import { parse } from "src/parser";
import { SRSettings } from "src/settings";
import { BlockUtils } from "src/util/utils_recall";

const settings = {
    singleLineCardSeparator: "::",
    singleLineReversedCardSeparator: ":::",
    multilineCardSeparator: "?",
    multilineReversedCardSeparator: "??",
    multilineCardEndMarker: "",
    editLaterTag: "#editLater",
    convertHighlightsToClozes: true,
    convertBoldTextToClozes: false,
    convertCurlyBracketsToClozes: true,
    convertAnkiClozesToClozes: true,
    clozePatterns: [
        "==[123;;]answer[;;hint]==",
        "**[123;;]answer[;;hint]**",
        "{{[123;;]answer[;;hint]}}",
    ],
} as unknown as SRSettings;

test("debug parser for 三月维护-测试文件.md", () => {
    const target = "plugin_test/三月维护-测试文件.md";
    if (!fs.existsSync(target)) {
        expect(true).toBe(true);
        return;
    }

    const content = fs.readFileSync(target, "utf-8");
    const parsed = parse(content, settings as any);

    expect(parsed.length).toBeGreaterThan(0);

    const parsedDuoYu = parsed.find((question) => question.text.includes("多余"));
    expect(parsedDuoYu).toBeDefined();
    expect(BlockUtils.getTxtHash(parsedDuoYu!.text)).toHaveLength(8);
    expect(BlockUtils.getFingerprint(parsedDuoYu!.text, settings)).not.toEqual("");
});
