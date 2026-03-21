test("Check that localization entries are well-formed", () => {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { localeMap } = require("src/lang/helpers");
        for (const [language_code, locale] of Object.entries(localeMap) as [
            string,
            Record<string, string>,
        ][]) {
            const locale_keys = Object.keys(locale);
            if (locale_keys.length == 0 || language_code == "en") continue;

            expect(locale_keys.length).toBeGreaterThan(0);
            locale_keys.forEach((key) => {
                expect(typeof locale[key]).toBe("string");
            });
        }
    });
});

test("Test translation unknown locale", () => {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { moment } = require("obsidian");
        const mockLocale = moment.locale as jest.MockedFunction<() => string>;
        mockLocale.mockImplementation(() => "ki"); // Kikuyu
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { t } = require("src/lang/helpers");
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        expect(t("DECKS")).toEqual("Decks");
        expect(consoleSpy).toHaveBeenCalledWith("SRS error: Locale ki not found.");
    });
});

test("Test translation without interpolation in English", () => {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { moment } = require("obsidian");
        const mockLocale = moment.locale as jest.MockedFunction<() => string>;
        mockLocale.mockImplementation(() => "en");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { t } = require("src/lang/helpers");
        expect(t("DECKS")).toEqual("Decks");
    });
});

test("Test translation without interpolation in čeština", () => {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { moment } = require("obsidian");
        const mockLocale = moment.locale as jest.MockedFunction<() => string>;
        mockLocale.mockImplementation(() => "cs");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { t } = require("src/lang/helpers");
        expect(t("DECKS")).toEqual("Balíčky");
    });
});

test("Deck options labels stay Chinese-only in zh-cn", () => {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { moment } = require("obsidian");
        const mockLocale = moment.locale as jest.MockedFunction<() => string>;
        mockLocale.mockImplementation(() => "zh-cn");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { t } = require("src/lang/helpers");
        expect(t("DECK_OPTIONS_SECTION_NEW_CARDS")).toEqual("新卡片");
        expect(t("DECK_OPTIONS_LEARNING_STEPS")).toEqual("初学间隔");
        expect(t("DECK_OPTIONS_SECTION_LAPSES")).toEqual("遗忘");
        expect(t("DECK_OPTIONS_RELEARNING_STEPS")).toEqual("重学间隔");
        expect(t("DECK_OPTIONS_SECTION_REVIEWS")).toEqual("复习");
    });
});

test("Test translation with interpolation in English", () => {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { moment } = require("obsidian");
        const mockLocale = moment.locale as jest.MockedFunction<() => string>;
        mockLocale.mockImplementation(() => "en");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { t } = require("src/lang/helpers");
        expect(t("STATUS_BAR", { dueNotesCount: 1, dueFlashcardsCount: 2 })).toEqual(
            "Review: 1 note(s), 2 card(s) due",
        );
    });
});

test("Test translation with interpolation in German", () => {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { moment } = require("obsidian");
        const mockLocale = moment.locale as jest.MockedFunction<() => string>;
        mockLocale.mockImplementation(() => "de");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { t } = require("src/lang/helpers");
        expect(t("STATUS_BAR", { dueNotesCount: 1, dueFlashcardsCount: 2 })).toEqual(
            "Wiederholung: 1 Notiz(en), 2 Karte(n) anstehend",
        );
    });
});

test("Test translation not in enum", () => {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { moment } = require("obsidian");
        const mockLocale = moment.locale as jest.MockedFunction<() => string>;
        mockLocale.mockImplementation(() => "en");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { t } = require("src/lang/helpers");
        expect(t("notInEnum")).toEqual("notInEnum");
    });
});
