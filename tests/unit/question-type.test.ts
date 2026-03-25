import { CardType } from "src/Question";
import {
    CardFrontBack,
    CardFrontBackUtil,
    QuestionTypeClozeFormatter,
    QuestionTypeReviewFormatter,
} from "src/question-type";
import { DEFAULT_SETTINGS, SRSettings } from "src/settings";

test("CardType.SingleLineBasic", () => {
    expect(CardFrontBackUtil.expand(CardType.SingleLineBasic, "A::B", DEFAULT_SETTINGS)).toEqual([
        new CardFrontBack("A", "B"),
    ]);
});

test("CardType.SingleLineReversed", () => {
    expect(
        CardFrontBackUtil.expand(CardType.SingleLineReversed, "A:::B", DEFAULT_SETTINGS),
    ).toEqual([new CardFrontBack("A", "B"), new CardFrontBack("B", "A")]);
});

describe("CardType.MultiLineBasic", () => {
    test("Basic", () => {
        expect(
            CardFrontBackUtil.expand(
                CardType.MultiLineBasic,
                "A1\nA2\n?\nB1\nB2",
                DEFAULT_SETTINGS,
            ),
        ).toEqual([new CardFrontBack("A1\nA2", "B1\nB2")]);
    });
});

test("CardType.MultiLineReversed", () => {
    expect(
        CardFrontBackUtil.expand(
            CardType.MultiLineReversed,
            "A1\nA2\n??\nB1\nB2",
            DEFAULT_SETTINGS,
        ),
    ).toEqual([new CardFrontBack("A1\nA2", "B1\nB2"), new CardFrontBack("B1\nB2", "A1\nA2")]);
});

test("CardType.Cloze", () => {
    const clozeFormatter = new QuestionTypeClozeFormatter();
    const reviewFormatter = new QuestionTypeReviewFormatter();

    expect(
        CardFrontBackUtil.expand(
            CardType.Cloze,
            "This is a very ==interesting== test",
            DEFAULT_SETTINGS,
        ),
    ).toEqual([
        new CardFrontBack(
            "This is a very " + clozeFormatter.asking() + " test",
            "This is a very " + clozeFormatter.showingAnswer("interesting") + " test",
            "This is a very " + reviewFormatter.asking("interesting") + " test",
        ),
    ]);

    const settings2: SRSettings = {
        ...DEFAULT_SETTINGS,
        clozePatterns: [
            "==[123;;]answer[;;hint]==",
            "**[123;;]answer[;;hint]**",
            "{{[123;;]answer[;;hint]}}",
        ],
    };

    expect(
        CardFrontBackUtil.expand(CardType.Cloze, "This is a very **interesting** test", settings2),
    ).toEqual([
        new CardFrontBack(
            "This is a very " + clozeFormatter.asking() + " test",
            "This is a very " + clozeFormatter.showingAnswer("interesting") + " test",
            "This is a very " + reviewFormatter.asking("interesting") + " test",
        ),
    ]);

    expect(
        CardFrontBackUtil.expand(CardType.Cloze, "This is a very {{interesting}} test", settings2),
    ).toEqual([
        new CardFrontBack(
            "This is a very " + clozeFormatter.asking() + " test",
            "This is a very " + clozeFormatter.showingAnswer("interesting") + " test",
            "This is a very " + reviewFormatter.asking("interesting") + " test",
        ),
    ]);

    expect(
        CardFrontBackUtil.expand(
            CardType.Cloze,
            "This is a really very {{interesting}} and ==fascinating== and **great** test",
            settings2,
        ),
    ).toEqual([
        new CardFrontBack(
            "This is a really very interesting and " + clozeFormatter.asking() + " and great test",
            "This is a really very interesting and " +
                clozeFormatter.showingAnswer("fascinating") +
                " and great test",
            "This is a really very interesting and " +
                reviewFormatter.asking("fascinating") +
                " and great test",
        ),
        new CardFrontBack(
            "This is a really very interesting and fascinating and " +
                clozeFormatter.asking() +
                " test",
            "This is a really very interesting and fascinating and " +
                clozeFormatter.showingAnswer("great") +
                " test",
            "This is a really very interesting and fascinating and " +
                reviewFormatter.asking("great") +
                " test",
        ),
        new CardFrontBack(
            "This is a really very " + clozeFormatter.asking() + " and fascinating and great test",
            "This is a really very " +
                clozeFormatter.showingAnswer("interesting") +
                " and fascinating and great test",
            "This is a really very " +
                reviewFormatter.asking("interesting") +
                " and fascinating and great test",
        ),
    ]);
});

test("CardType.Cloze ignores fenced code operators while keeping outer cloze text", () => {
    const clozeFormatter = new QuestionTypeClozeFormatter();
    const reviewFormatter = new QuestionTypeReviewFormatter();

    expect(
        CardFrontBackUtil.expand(
            CardType.Cloze,
            "Prefix ==visible==\n```js\nif (from && typeof from === \"object\" || typeof from === \"function\") {\n  return value ** 2;\n}\n```",
            DEFAULT_SETTINGS,
        ),
    ).toEqual([
        new CardFrontBack(
            "Prefix " +
                clozeFormatter.asking() +
                "\n```js\nif (from && typeof from === \"object\" || typeof from === \"function\") {\n  return value ** 2;\n}\n```",
            "Prefix " +
                clozeFormatter.showingAnswer("visible") +
                "\n```js\nif (from && typeof from === \"object\" || typeof from === \"function\") {\n  return value ** 2;\n}\n```",
            "Prefix " +
                reviewFormatter.asking("visible") +
                "\n```js\nif (from && typeof from === \"object\" || typeof from === \"function\") {\n  return value ** 2;\n}\n```",
        ),
    ]);
});

test("CardType.Cloze preserves standard cloze wrapped around inline code", () => {
    const clozeFormatter = new QuestionTypeClozeFormatter();
    const reviewFormatter = new QuestionTypeReviewFormatter();

    expect(
        CardFrontBackUtil.expand(CardType.Cloze, "This has ==`inline`== code", DEFAULT_SETTINGS),
    ).toEqual([
        new CardFrontBack(
            "This has " + clozeFormatter.asking() + " code",
            "This has " + clozeFormatter.showingAnswer("`inline`") + " code",
            "This has " + reviewFormatter.asking("`inline`") + " code",
        ),
    ]);
});

test("CardType.AnkiCloze keeps fenced code blocks in Anki-only mode", () => {
    const settings: SRSettings = {
        ...DEFAULT_SETTINGS,
        convertAnkiClozesToClozes: true,
        parseClozesInCodeBlocks: true,
    };

    const result = CardFrontBackUtil.expand(
        CardType.AnkiCloze,
        "```js\nif (from && typeof from === \"object\" || typeof from === \"function\") {\n  return {{c1::value}} ** 2;\n}\n```",
        settings,
    );

    expect(result).toHaveLength(1);
    expect(result[0].front).toContain("<!--SR_CODE_CLOZE:");
    expect(result[0].front).toContain("SR_CLOZE:");
    expect(result[0].front).toContain('typeof from === "object"');
    expect(result[0].front).not.toContain("SR_C:");
});
describe.skip("Nested standard clozes", () => {
    const clozeFormatter = new QuestionTypeClozeFormatter();
    const reviewFormatter = new QuestionTypeReviewFormatter();

    const createStandardSettings = (): SRSettings => ({
        ...DEFAULT_SETTINGS,
        convertHighlightsToClozes: true,
        convertBoldTextToClozes: true,
        convertAnkiClozesToClozes: true,
        clozePatterns: ["==[123;;]answer[;;hint]==", "**[123;;]answer[;;hint]**"],
    });

    test("fully wrapped highlight and bold collapse into one card", () => {
        const settings = createStandardSettings();

        expect(CardFrontBackUtil.expand(CardType.Cloze, "==**鏂囨湰**==", settings)).toEqual([
            new CardFrontBack(
                clozeFormatter.asking(),
                clozeFormatter.showingAnswer("**鏂囨湰**"),
                reviewFormatter.asking("**鏂囨湰**"),
            ),
        ]);
    });

    test("fully wrapped bold and highlight collapse into one card", () => {
        const settings = createStandardSettings();

        expect(CardFrontBackUtil.expand(CardType.Cloze, "**==鏂囨湰==**", settings)).toEqual([
            new CardFrontBack(
                clozeFormatter.asking(),
                clozeFormatter.showingAnswer("==鏂囨湰=="),
                reviewFormatter.asking("==鏂囨湰=="),
            ),
        ]);
    });

    test("distinct nested ranges still generate separate cards", () => {
        const settings = createStandardSettings();

        expect(CardFrontBackUtil.expand(CardType.Cloze, "==澶栧眰 **鍐呭眰** 鏂囨湰==", settings)).toEqual([
            new CardFrontBack(
                clozeFormatter.asking(),
                clozeFormatter.showingAnswer("澶栧眰 **鍐呭眰** 鏂囨湰"),
                reviewFormatter.asking("澶栧眰 **鍐呭眰** 鏂囨湰"),
            ),
            new CardFrontBack(
                "澶栧眰 " + clozeFormatter.asking() + " 鏂囨湰",
                "澶栧眰 " + clozeFormatter.showingAnswer("鍐呭眰") + " 鏂囨湰",
                "澶栧眰 " + reviewFormatter.asking("鍐呭眰") + " 鏂囨湰",
            ),
        ]);
    });

    test("anki mix reuses the same normalized standard cloze logic", () => {
        const settings = createStandardSettings();

        const result = CardFrontBackUtil.expand(
            CardType.AnkiCloze,
            "{{c1::Anki}} 鍜?==**鏂囨湰**==",
            settings,
            0,
            undefined,
        );

        expect(result).toHaveLength(2);
        expect(
            result.filter(
                (card) => card.back === `Anki 鍜?${clozeFormatter.showingAnswer("**鏂囨湰**")}`,
            ),
        ).toHaveLength(1);
    });
});

describe("Nested standard clozes (ASCII coverage)", () => {
    const clozeFormatter = new QuestionTypeClozeFormatter();
    const reviewFormatter = new QuestionTypeReviewFormatter();

    const createStandardSettings = (overrides: Partial<SRSettings> = {}): SRSettings => ({
        ...DEFAULT_SETTINGS,
        convertHighlightsToClozes: true,
        convertBoldTextToClozes: true,
        convertAnkiClozesToClozes: true,
        clozePatterns: ["==[123;;]answer[;;hint]==", "**[123;;]answer[;;hint]**"],
        ...overrides,
    });

    test("fully wrapped highlight and bold collapse into one card", () => {
        const settings = createStandardSettings();

        expect(CardFrontBackUtil.expand(CardType.Cloze, "==**text**==", settings)).toEqual([
            new CardFrontBack(
                clozeFormatter.asking(),
                clozeFormatter.showingAnswer("text"),
                reviewFormatter.asking("text"),
            ),
        ]);
    });

    test("fully wrapped bold and highlight collapse into one card", () => {
        const settings = createStandardSettings();

        expect(CardFrontBackUtil.expand(CardType.Cloze, "**==text==**", settings)).toEqual([
            new CardFrontBack(
                clozeFormatter.asking(),
                clozeFormatter.showingAnswer("text"),
                reviewFormatter.asking("text"),
            ),
        ]);
    });

    test("equivalent nesting with only highlight enabled still produces one plain cloze answer", () => {
        const settings = createStandardSettings({
            convertBoldTextToClozes: false,
            clozePatterns: ["==[123;;]answer[;;hint]=="],
        });

        expect(CardFrontBackUtil.expand(CardType.Cloze, "==**text**==", settings)).toEqual([
            new CardFrontBack(
                clozeFormatter.asking(),
                clozeFormatter.showingAnswer("text"),
                reviewFormatter.asking("text"),
            ),
        ]);
    });

    test("equivalent nesting with only bold enabled still produces one plain cloze answer", () => {
        const settings = createStandardSettings({
            convertHighlightsToClozes: false,
            clozePatterns: ["**[123;;]answer[;;hint]**"],
        });

        expect(CardFrontBackUtil.expand(CardType.Cloze, "==**text**==", settings)).toEqual([
            new CardFrontBack(
                clozeFormatter.asking(),
                clozeFormatter.showingAnswer("text"),
                reviewFormatter.asking("text"),
            ),
        ]);
    });

    test("distinct nested ranges still generate separate cards", () => {
        const settings = createStandardSettings();

        expect(CardFrontBackUtil.expand(CardType.Cloze, "==outer **inner** text==", settings)).toEqual([
            new CardFrontBack(
                clozeFormatter.asking(),
                clozeFormatter.showingAnswer("outer inner text"),
                reviewFormatter.asking("outer inner text"),
            ),
            new CardFrontBack(
                "outer " + clozeFormatter.asking() + " text",
                "outer " + clozeFormatter.showingAnswer("inner") + " text",
                "outer " + reviewFormatter.asking("inner") + " text",
            ),
        ]);
    });

    test("anki mix reuses the same normalized standard cloze logic", () => {
        const settings = createStandardSettings();

        const result = CardFrontBackUtil.expand(
            CardType.AnkiCloze,
            "{{c1::Anki}} and ==**text**==",
            settings,
            0,
            undefined,
        );

        expect(result).toHaveLength(2);
        expect(
            result.filter(
                (card) => card.back === `Anki and ${clozeFormatter.showingAnswer("text")}`,
            ),
        ).toHaveLength(1);
    });
});
