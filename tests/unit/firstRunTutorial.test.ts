describe("first run tutorial", () => {
    test("returns English tutorial for English and other non-Chinese locales", () => {
        jest.isolateModules(() => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { getFirstRunTutorial } = require("src/firstRunTutorial");

            expect(getFirstRunTutorial("en")).toMatchObject({
                path: "Syro Sidebar Review Tutorial.md",
            });
            expect(getFirstRunTutorial("en").content).toContain(
                "Welcome to Syro: your incremental reading flow starts here",
            );

            expect(getFirstRunTutorial("ja").path).toBe("Syro Sidebar Review Tutorial.md");
            expect(getFirstRunTutorial("de").content).toContain("Welcome to Syro");
        });
    });

    test("returns Simplified Chinese tutorial for zh aliases", () => {
        jest.isolateModules(() => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { getFirstRunTutorial } = require("src/firstRunTutorial");

            expect(getFirstRunTutorial("zh-cn")).toMatchObject({
                path: "Syro 侧边栏复习教程.md",
            });
            expect(getFirstRunTutorial("zh-tw").path).toBe("Syro 侧边栏复习教程.md");
            expect(getFirstRunTutorial("zh-hk").content).toContain("欢迎来到 Syro");
        });
    });

    test("default locale resolves through moment.locale()", () => {
        jest.isolateModules(() => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { moment } = require("obsidian");
            const mockLocale = moment.locale as jest.MockedFunction<() => string>;
            mockLocale.mockImplementation(() => "zh-hk");
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { getFirstRunTutorial } = require("src/firstRunTutorial");

            expect(getFirstRunTutorial().path).toBe("Syro 侧边栏复习教程.md");
        });
    });
});
