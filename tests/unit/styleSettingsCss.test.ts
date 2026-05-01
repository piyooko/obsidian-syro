const fs = require("fs");
const path = require("path");

const readStyleSettingsCss = (): string =>
    fs.readFileSync(
        path.join(__dirname, "../../src/ui/styles/style-settings.css"),
        "utf8",
    );

const extractSettingBlock = (css: string, settingId: string): string => {
    const blockStart = css.indexOf(`id: ${settingId}`);
    expect(blockStart).toBeGreaterThanOrEqual(0);

    const nextSettingStart = css.indexOf("\n  -\n", blockStart + settingId.length);
    expect(nextSettingStart).toBeGreaterThan(blockStart);

    return css.slice(blockStart, nextSettingStart);
};

const readNumericSettingValue = (block: string, key: string): number => {
    const match = new RegExp(`^    ${key}: (\\d+)$`, "m").exec(block);
    expect(match).not.toBeNull();

    return Number(match?.[1]);
};

describe("style settings CSS", () => {
    test("mobile review card top gap defaults to 36px and can expand to 120px", () => {
        const block = extractSettingBlock(readStyleSettingsCss(), "syro-mobile-review-screen-top-gap");

        expect(readNumericSettingValue(block, "default")).toBe(36);
        expect(readNumericSettingValue(block, "max")).toBe(120);
    });
});
