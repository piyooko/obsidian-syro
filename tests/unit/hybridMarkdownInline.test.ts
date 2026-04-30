import { collectHybridInlineTokensForTest } from "src/editor/hybridMarkdownInline";

describe("collectHybridInlineTokens", () => {
    test("marks strong text and hides delimiters away from the cursor", () => {
        const markdown = "before **bold** after";

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 0, to: 0 });

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-strong"),
                    from: 7,
                    hidden: true,
                    to: 9,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-strong"),
                    from: 9,
                    to: 13,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-strong"),
                    from: 13,
                    hidden: true,
                    to: 15,
                }),
            ]),
        );
    });

    test("reveals strong delimiters when the cursor touches the token", () => {
        const markdown = "before **bold** after";

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 8, to: 8 });

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-strong"),
                    from: 7,
                    hidden: false,
                    to: 9,
                }),
            ]),
        );
    });

    test("reveals strong delimiters when the cursor is inside the strong body", () => {
        const markdown = "before **bold** after";

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 11, to: 11 });

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-strong"),
                    from: 7,
                    hidden: false,
                    to: 9,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-strong"),
                    from: 9,
                    to: 13,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-strong"),
                    from: 13,
                    hidden: false,
                    to: 15,
                }),
            ]),
        );
    });

    test("keeps formatting delimiters hidden when source reveal is disabled", () => {
        const markdown = "1. **bold** after";

        const tokens = collectHybridInlineTokensForTest(
            markdown,
            { from: 6, to: 6 },
            {
                revealFormatting: false,
            },
        );

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-strong"),
                    from: 3,
                    hidden: true,
                    to: 5,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-strong"),
                    from: 9,
                    hidden: true,
                    to: 11,
                }),
            ]),
        );
    });

    test("marks highlighted text and hides delimiters away from the cursor", () => {
        const markdown = "before ==mark== after";

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 0, to: 0 });

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-highlight"),
                    from: 7,
                    hidden: true,
                    to: 9,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-highlight"),
                    from: 9,
                    to: 13,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-highlight"),
                    from: 13,
                    hidden: true,
                    to: 15,
                }),
            ]),
        );
    });

    test("reveals highlight delimiters when the cursor is inside the highlight", () => {
        const markdown = "before ==mark== after";

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 10, to: 10 });

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-highlight"),
                    from: 7,
                    hidden: false,
                    to: 9,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-highlight"),
                    from: 9,
                    to: 13,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-highlight"),
                    from: 13,
                    hidden: false,
                    to: 15,
                }),
            ]),
        );
    });

    test("marks Anki cloze content and hides wrapper syntax away from the cursor", () => {
        const markdown = "A {{c2::answer::hint}} B";

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 0, to: 0 });
        const clozeContent = tokens.find((token) => token.from === 8 && token.to === 14);

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-cloze"),
                    from: 2,
                    hidden: true,
                    to: 8,
                }),
                expect.objectContaining({
                    className: "sr-cloze-highlight",
                    from: 8,
                    to: 14,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-cloze"),
                    from: 14,
                    hidden: true,
                    to: 22,
                }),
            ]),
        );
        expect(clozeContent?.className).not.toContain("cm-anki-cloze");
    });

    test("reveals Anki cloze source as one editor-compatible mark when the cursor is inside the cloze", () => {
        const markdown = "A {{c2::answer::hint}} B";

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 10, to: 10 });
        const clozeSource = tokens.find((token) => token.from === 2 && token.to === 22);

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: "sr-cloze-highlight sr-cloze-editing",
                    from: 2,
                    to: 22,
                }),
            ]),
        );
        expect(clozeSource?.className).not.toContain("cm-anki-cloze");
        expect(tokens.some((token) => token.className.includes("cm-anki-cloze"))).toBe(false);
    });

    test("keeps Anki cloze collapsed when the cursor is before the preceding visible character", () => {
        const markdown = "段的框{{c2::架数}}据深{{c1::度剖}}析";
        const clozeFrom = markdown.indexOf("{{c2::");
        const contentFrom = clozeFrom + "{{c2::".length;
        const contentTo = contentFrom + "架数".length;
        const clozeTo = contentTo + "}}".length;

        const tokens = collectHybridInlineTokensForTest(markdown, {
            from: clozeFrom - 1,
            to: clozeFrom - 1,
        });

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-cloze"),
                    from: clozeFrom,
                    hidden: true,
                    to: contentFrom,
                }),
                expect.objectContaining({
                    className: "sr-cloze-highlight",
                    from: contentFrom,
                    to: contentTo,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-cloze"),
                    from: contentTo,
                    hidden: true,
                    to: clozeTo,
                }),
            ]),
        );
        expect(tokens).not.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: "sr-cloze-highlight sr-cloze-editing",
                    from: clozeFrom,
                    to: clozeTo,
                }),
            ]),
        );
    });

    test("reveals Anki cloze source when the cursor touches the source boundary or selection overlaps it", () => {
        const markdown = "段的框{{c2::架数}}据深";
        const clozeFrom = markdown.indexOf("{{c2::");
        const clozeTo = clozeFrom + "{{c2::架数}}".length;
        const contentFrom = clozeFrom + "{{c2::".length;

        expect(
            collectHybridInlineTokensForTest(markdown, {
                from: clozeFrom,
                to: clozeFrom,
            }),
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: "sr-cloze-highlight sr-cloze-editing",
                    from: clozeFrom,
                    to: clozeTo,
                }),
            ]),
        );

        expect(
            collectHybridInlineTokensForTest(markdown, {
                from: contentFrom,
                to: contentFrom + 1,
            }),
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: "sr-cloze-highlight sr-cloze-editing",
                    from: clozeFrom,
                    to: clozeTo,
                }),
            ]),
        );
    });

    test("marks markdown and wiki links without exposing formatting by default", () => {
        const markdown = "A [label](target) and [[Page|Alias]]";

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 0, to: 0 });

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringContaining("cm-link"),
                    from: 3,
                    to: 8,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-link"),
                    from: 2,
                    hidden: true,
                    to: 3,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-link"),
                    from: 29,
                    to: 34,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-link"),
                    from: 22,
                    hidden: true,
                    to: 29,
                }),
            ]),
        );
    });

    test("reveals markdown link source tokens when the cursor is inside link text", () => {
        const markdown = "A [label](target)";

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 5, to: 5 });

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringContaining("cm-link"),
                    from: 3,
                    to: 8,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-link"),
                    from: 2,
                    hidden: false,
                    to: 3,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-link"),
                    from: 8,
                    hidden: false,
                    to: 17,
                }),
            ]),
        );
    });

    test("marks bare numeric references as Obsidian bare links", () => {
        const markdown = "source [5, 13, 29] text";

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 0, to: 0 });

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringMatching(
                        /cm-hmd-barelink.*cm-link|cm-link.*cm-hmd-barelink/,
                    ),
                    from: 7,
                    to: 8,
                }),
                expect.objectContaining({
                    className: expect.stringMatching(
                        /cm-hmd-barelink.*cm-link|cm-link.*cm-hmd-barelink/,
                    ),
                    from: 8,
                    to: 17,
                }),
                expect.objectContaining({
                    className: expect.stringMatching(
                        /cm-hmd-barelink.*cm-link|cm-link.*cm-hmd-barelink/,
                    ),
                    from: 17,
                    to: 18,
                }),
            ]),
        );
    });

    test("marks list heading and blockquote formatting tokens", () => {
        const markdown = "1. item\n   - child\n> quote\n## Heading";

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 0, to: 0 });

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-list-ol"),
                    from: 0,
                    to: 3,
                    widget: "list-number",
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-list-ul"),
                    from: 11,
                    to: 13,
                    widget: "list-bullet",
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-quote"),
                    from: 19,
                    to: 21,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-header"),
                    from: 27,
                    to: 30,
                }),
            ]),
        );
    });

    test("adds list depth classes to inline formatting inside list lines", () => {
        const markdown = "1. **绳镖**: first";

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 0, to: 0 });

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringMatching(/cm-list-1.*cm-strong|cm-strong.*cm-list-1/),
                    from: 5,
                    to: 7,
                }),
            ]),
        );
    });

    test("skips inline formatting inside fenced code and table widget ranges", () => {
        const markdown = [
            "| A | B |",
            "| - | - |",
            "| **x** | ==y== |",
            "",
            "```",
            "**code**",
            "==code==",
            "{{c1::code}}",
            "```",
            "",
            "**real** ==mark== {{c1::answer}}",
        ].join("\n");

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 0, to: 0 });

        expect(tokens.filter((token) => token.className.includes("cm-strong"))).toEqual([
            expect.objectContaining({
                from: markdown.lastIndexOf("real"),
                to: markdown.lastIndexOf("real") + "real".length,
            }),
        ]);
        expect(tokens.filter((token) => token.className.includes("cm-highlight"))).toHaveLength(1);
        expect(
            tokens.filter((token) => token.className === "sr-cloze-highlight"),
        ).toHaveLength(1);
    });
});
