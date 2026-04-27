import { CardType } from "src/Question";
import {
    CardFrontBack,
    CardFrontBackUtil,
    QuestionTypeClozeFormatter,
    QuestionTypeReviewFormatter,
} from "src/question-type";
import { DEFAULT_SETTINGS, SRSettings, syncDefaultClozePatterns } from "src/settings";

function extractCodeClozeMeta(front: string): { activeLineRelative: number; startLine: number } {
    const match = front.match(/<!--SR_CODE_CLOZE:(\d+):(\d+)-->/);
    if (!match) {
        throw new Error("Missing SR_CODE_CLOZE metadata");
    }

    return {
        activeLineRelative: Number(match[1]),
        startLine: Number(match[2]),
    };
}

test("CardType.SingleLineBasic", () => {
    expect(CardFrontBackUtil.expand(CardType.SingleLineBasic, "A::B", DEFAULT_SETTINGS)).toEqual([
        new CardFrontBack("A", "B"),
    ]);
    expect(
        CardFrontBackUtil.expand(
            CardType.SingleLineBasic,
            "- text before {{ir::extract text}} after",
            DEFAULT_SETTINGS,
        ),
    ).toEqual([new CardFrontBack("- text before {{ir::extract text}} after", "")]);
    expect(
        CardFrontBackUtil.expand(
            CardType.SingleLineBasic,
            "Q::A with {{ir::extract :: text}}",
            DEFAULT_SETTINGS,
        ),
    ).toEqual([new CardFrontBack("Q", "A with {{ir::extract :: text}}")]);
    expect(
        CardFrontBackUtil.expand(
            CardType.SingleLineBasic,
            "- text before {{ir::outer {{ir::inner :: text}} after}}",
            DEFAULT_SETTINGS,
        ),
    ).toEqual([new CardFrontBack("- text before {{ir::outer {{ir::inner :: text}} after}}", "")]);
});

test("CardType.SingleLineReversed", () => {
    expect(
        CardFrontBackUtil.expand(CardType.SingleLineReversed, "A:::B", DEFAULT_SETTINGS),
    ).toEqual([new CardFrontBack("A", "B"), new CardFrontBack("B", "A")]);
    expect(
        CardFrontBackUtil.expand(
            CardType.SingleLineReversed,
            "- text before {{ir::extract text}} after",
            DEFAULT_SETTINGS,
        ),
    ).toEqual([new CardFrontBack("- text before {{ir::extract text}} after", "")]);
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
            'Prefix ==visible==\n```js\nif (from && typeof from === "object" || typeof from === "function") {\n  return value ** 2;\n}\n```',
            DEFAULT_SETTINGS,
        ),
    ).toEqual([
        new CardFrontBack(
            "Prefix " +
                clozeFormatter.asking() +
                '\n```js\nif (from && typeof from === "object" || typeof from === "function") {\n  return value ** 2;\n}\n```',
            "Prefix " +
                clozeFormatter.showingAnswer("visible") +
                '\n```js\nif (from && typeof from === "object" || typeof from === "function") {\n  return value ** 2;\n}\n```',
            "Prefix " +
                reviewFormatter.asking("visible") +
                '\n```js\nif (from && typeof from === "object" || typeof from === "function") {\n  return value ** 2;\n}\n```',
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

test("CardType.Cloze records the correct review target for standard clozes", () => {
    const result = CardFrontBackUtil.expand(
        CardType.Cloze,
        "Intro\n==alpha==\nOutro",
        DEFAULT_SETTINGS,
        10,
    );

    expect(result).toHaveLength(1);
    expect(result[0].reviewTarget).toEqual({ startLine: 11, endLine: 11 });
});

test("CardType.Cloze records the correct review target for plain curly clozes", () => {
    const settings: SRSettings = {
        ...DEFAULT_SETTINGS,
        clozePatterns: [
            "==[123;;]answer[;;hint]==",
            "**[123;;]answer[;;hint]**",
            "{{[123;;]answer[;;hint]}}",
        ],
    };

    const result = CardFrontBackUtil.expand(
        CardType.Cloze,
        "Intro\nThis is {{interesting}}\nOutro",
        settings,
        20,
    );

    expect(result).toHaveLength(1);
    expect(result[0].reviewTarget).toEqual({ startLine: 21, endLine: 21 });
});

test("CardType.AnkiCloze keeps fenced code blocks in Anki-only mode", () => {
    const settings: SRSettings = {
        ...DEFAULT_SETTINGS,
        convertAnkiClozesToClozes: true,
        parseClozesInCodeBlocks: true,
    };

    const result = CardFrontBackUtil.expand(
        CardType.AnkiCloze,
        '```js\nif (from && typeof from === "object" || typeof from === "function") {\n  return {{c1::value}} ** 2;\n}\n```',
        settings,
    );

    expect(result).toHaveLength(1);
    expect(result[0].front).toContain("<!--SR_CODE_CLOZE:");
    expect(result[0].front).toContain("SR_CLOZE:");
    expect(result[0].front).toContain('typeof from === "object"');
    expect(result[0].front).not.toContain("SR_C:");
});

test("CardType.AnkiCloze starts displayed code lines at 1 when the fenced block begins on note line 0", () => {
    const settings: SRSettings = {
        ...DEFAULT_SETTINGS,
        convertAnkiClozesToClozes: true,
        parseClozesInCodeBlocks: true,
    };

    const result = CardFrontBackUtil.expand(
        CardType.AnkiCloze,
        "```ts\nconst alpha = 1;\nconst beta = {{c1::2}};\n```",
        settings,
        0,
    );

    expect(result).toHaveLength(1);
    expect(extractCodeClozeMeta(result[0].front)).toEqual({
        activeLineRelative: 3,
        startLine: 1,
    });
});

test("CardType.AnkiCloze keeps note-absolute line numbers when windowing trimmed code context", () => {
    const settings: SRSettings = {
        ...DEFAULT_SETTINGS,
        convertAnkiClozesToClozes: true,
        parseClozesInCodeBlocks: true,
        codeContextLines: 1,
    };

    const questionText = [
        "```ts",
        "const line1 = 1;",
        "const line2 = 2;",
        "const line3 = 3;",
        "const line4 = 4;",
        "const line5 = {{c1::5}};",
        "const line6 = 6;",
        "const line7 = 7;",
        "```",
    ].join("\n");

    const result = CardFrontBackUtil.expand(CardType.AnkiCloze, questionText, settings, 40);

    expect(result).toHaveLength(1);
    expect(extractCodeClozeMeta(result[0].front)).toEqual({
        activeLineRelative: 4,
        startLine: 44,
    });
});

test("CardType.AnkiCloze only links same-number clozes on the current line even with full note context", () => {
    const clozeFormatter = new QuestionTypeClozeFormatter();
    const reviewFormatter = new QuestionTypeReviewFormatter();
    const settings: SRSettings = {
        ...DEFAULT_SETTINGS,
        convertAnkiClozesToClozes: true,
        clozeContextMode: "full",
    };
    const questionText = "{{c2::alpha}} and {{c2::beta}}\ncarry {{c2::gamma}}";
    const noteText = `Intro line\n${questionText}\nOutro line`;

    const result = CardFrontBackUtil.expand(CardType.AnkiCloze, questionText, settings, 1, {
        noteText,
        firstLineNum: 1,
        lastLineNum: 2,
    });

    expect(result).toEqual([
        new CardFrontBack(
            `Intro line\n${clozeFormatter.asking()} and ${clozeFormatter.asking()}\ncarry gamma\nOutro line`,
            `Intro line\n${clozeFormatter.showingAnswer("alpha")} and ${clozeFormatter.showingAnswer("beta")}\ncarry gamma\nOutro line`,
            `Intro line\n${reviewFormatter.asking("alpha")} and ${reviewFormatter.asking("beta")}\ncarry gamma\nOutro line`,
            { startLine: 1, endLine: 1 },
        ),
        new CardFrontBack(
            `Intro line\nalpha and beta\ncarry ${clozeFormatter.asking()}\nOutro line`,
            `Intro line\nalpha and beta\ncarry ${clozeFormatter.showingAnswer("gamma")}\nOutro line`,
            `Intro line\nalpha and beta\ncarry ${reviewFormatter.asking("gamma")}\nOutro line`,
            { startLine: 2, endLine: 2 },
        ),
    ]);
});

test("CardType.AnkiCloze records multi-line review targets from full-note context", () => {
    const settings: SRSettings = {
        ...DEFAULT_SETTINGS,
        convertAnkiClozesToClozes: true,
        clozeContextMode: "full",
    };
    const questionText = "before {{c1::alpha\nbeta}} after";
    const noteText = `Intro line\n${questionText}\nOutro line`;

    const result = CardFrontBackUtil.expand(CardType.AnkiCloze, questionText, settings, 1, {
        noteText,
        firstLineNum: 1,
        lastLineNum: 2,
    });

    expect(result).toHaveLength(1);
    expect(result[0].reviewTarget).toEqual({ startLine: 1, endLine: 2 });
});

test("CardType.AnkiCloze safe trim keeps the current line but does not preserve distant same-number lines", () => {
    const clozeFormatter = new QuestionTypeClozeFormatter();
    const settings: SRSettings = {
        ...DEFAULT_SETTINGS,
        convertAnkiClozesToClozes: true,
        clozeContextMode: "full",
        clozeContextPerformanceMode: "safe-trim",
        clozeContextSoftLimitLines: 1,
    };
    const questionText = [
        "lead 1",
        "{{c2::alpha}} and {{c2::beta}}",
        "lead 2",
        "lead 3",
        "lead 4",
        "carry {{c2::gamma}}",
        "tail",
    ].join("\n");

    const result = CardFrontBackUtil.expand(CardType.AnkiCloze, questionText, settings, 0, {
        noteText: questionText,
        firstLineNum: 0,
        lastLineNum: 6,
    });

    expect(result).toHaveLength(2);
    expect(result[0].front).toContain(
        `\n${clozeFormatter.asking()} and ${clozeFormatter.asking()}\n`,
    );
    expect(result[0].front).not.toContain("carry {{c2::gamma}}");
    expect(result[0].front).not.toContain("carry gamma");
    expect(result[1].front).toContain(`carry ${clozeFormatter.asking()}`);
    expect(result[1].front).not.toContain("alpha");
});

test("CardType.AnkiCloze also expands plain curly clozes on the same line", () => {
    const clozeFormatter = new QuestionTypeClozeFormatter();
    const reviewFormatter = new QuestionTypeReviewFormatter();
    const settings: SRSettings = {
        ...DEFAULT_SETTINGS,
        convertCurlyBracketsToClozes: true,
        convertAnkiClozesToClozes: true,
    };
    syncDefaultClozePatterns(settings);

    const result = CardFrontBackUtil.expand(
        CardType.AnkiCloze,
        "{{c1::anki}} and {{plain}}",
        settings,
        0,
        undefined,
    );

    expect(result).toHaveLength(2);
    expect(result).toContainEqual(
        new CardFrontBack(
            `${clozeFormatter.asking()} and plain`,
            `${clozeFormatter.showingAnswer("anki")} and plain`,
            `${reviewFormatter.asking("anki")} and plain`,
        ),
    );
    expect(result).toContainEqual(
        new CardFrontBack(
            `anki and ${clozeFormatter.asking()}`,
            `anki and ${clozeFormatter.showingAnswer("plain")}`,
            `anki and ${reviewFormatter.asking("plain")}`,
        ),
    );
});

test("CardType.AnkiCloze keeps standard and plain curly clozes when mixed", () => {
    const clozeFormatter = new QuestionTypeClozeFormatter();
    const settings: SRSettings = {
        ...DEFAULT_SETTINGS,
        convertCurlyBracketsToClozes: true,
        convertAnkiClozesToClozes: true,
        convertHighlightsToClozes: true,
    };
    syncDefaultClozePatterns(settings);

    const result = CardFrontBackUtil.expand(
        CardType.AnkiCloze,
        "{{c1::anki}} and ==highlight== and {{plain}}",
        settings,
        0,
        undefined,
    );

    expect(result).toHaveLength(3);
    expect(
        result.some(
            (card) =>
                card.back === `anki and ${clozeFormatter.showingAnswer("highlight")} and plain`,
        ),
    ).toBe(true);
    expect(
        result.some(
            (card) =>
                card.back === `anki and highlight and ${clozeFormatter.showingAnswer("plain")}`,
        ),
    ).toBe(true);
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

        expect(
            CardFrontBackUtil.expand(CardType.Cloze, "==澶栧眰 **鍐呭眰** 鏂囨湰==", settings),
        ).toEqual([
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

        expect(
            CardFrontBackUtil.expand(CardType.Cloze, "==outer **inner** text==", settings),
        ).toEqual([
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
