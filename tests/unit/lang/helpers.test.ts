import en from "src/lang/locale/en";
import zhCN from "src/lang/locale/zh-cn";

function loadHelpers(locale: string) {
    let helpers: typeof import("src/lang/helpers");

    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { moment } = require("obsidian");
        const mockLocale = moment.locale as jest.MockedFunction<() => string>;
        mockLocale.mockImplementation(() => locale);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        helpers = require("src/lang/helpers");
    });

    return helpers!;
}

describe("lang helpers", () => {
    test.each([
        ["en", "en"],
        ["zh-cn", "zh-cn"],
        ["zh-tw", "zh-cn"],
        ["zh-hk", "zh-cn"],
        ["ja", "en"],
        ["de", "en"],
    ])("resolveSupportedLocale(%s) -> %s", (input, expected) => {
        const { resolveSupportedLocale } = loadHelpers("en");
        expect(resolveSupportedLocale(input)).toBe(expected);
    });

    test("localeMap only contains en and zh-cn", () => {
        const { localeMap } = loadHelpers("en");
        expect(Object.keys(localeMap).sort()).toEqual(["en", "zh-cn"]);
    });

    test("English and Simplified Chinese locale keys stay in sync", () => {
        expect(Object.keys(en).sort()).toEqual(Object.keys(zhCN).sort());
    });

    test("t() uses Simplified Chinese for zh aliases", () => {
        const { t } = loadHelpers("zh-tw");
        expect(t("DECKS")).toBe("卡组");
        expect(t("STATUS_BAR_NOTE_DUE", { dueNotesCount: 2 })).toBe("2 笔记已到期");
    });

    test("t() falls back to English for non-Chinese locales without logging an error", () => {
        const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        const { t } = loadHelpers("ja");

        expect(t("DECKS")).toBe("Decks");
        expect(
            t("STATUS_BAR", {
                dueNotesCount: 1,
                dueFlashcardsCount: 2,
            }),
        ).toBe("Review: 1 note(s), 2 card(s) due");
        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
    });

    test("t() returns the original key when it is unknown", () => {
        const { t } = loadHelpers("en");
        expect(t("notInEnum")).toBe("notInEnum");
    });
});
