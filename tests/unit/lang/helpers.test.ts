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

test("Sync labels stay explicit in English and zh-cn", () => {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { moment } = require("obsidian");
        const mockLocale = moment.locale as jest.MockedFunction<() => string>;

        mockLocale.mockImplementation(() => "en");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { t } = require("src/lang/helpers");
        expect(t("DECK_TREE_FULL_SYNC_TITLE")).toEqual("Sync changes (incremental)");
        expect(t("CMD_GLOBAL_SYNC_FULL")).toEqual("Rebuild all cards (reparse all notes)");
        expect(t("CMD_GLOBAL_SYNC_CARDS")).toEqual("Repair tracked cards (clean ghost cards)");
    });

    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { moment } = require("obsidian");
        const mockLocale = moment.locale as jest.MockedFunction<() => string>;
        mockLocale.mockImplementation(() => "zh-cn");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { t } = require("src/lang/helpers");
        expect(t("DECK_TREE_FULL_SYNC_TITLE")).toEqual(
            "\u589e\u91cf\u540c\u6b65\uff08\u4ec5\u5904\u7406\u6539\u52a8\uff09",
        );
        expect(t("CMD_GLOBAL_SYNC_FULL")).toEqual(
            "\u91cd\u5efa\u5168\u90e8\u5361\u7247\uff08\u91cd\u65b0\u89e3\u6790\u6240\u6709\u7b14\u8bb0\uff09",
        );
        expect(t("CMD_GLOBAL_SYNC_CARDS")).toEqual(
            "\u4fee\u590d\u5df2\u8ffd\u8e2a\u5361\u7247\uff08\u6e05\u7406\u5e7d\u7075\u5361\uff09",
        );
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
