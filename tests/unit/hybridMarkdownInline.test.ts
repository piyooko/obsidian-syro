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

    test("marks list heading and blockquote formatting tokens", () => {
        const markdown = "1. item\n   - child\n> quote\n## Heading";

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 0, to: 0 });

        expect(tokens).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-list-ol"),
                    from: 0,
                    to: 3,
                }),
                expect.objectContaining({
                    className: expect.stringContaining("cm-formatting-list-ul"),
                    from: 11,
                    to: 13,
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

    test("skips fenced code and table widget ranges", () => {
        const markdown = [
            "| A | B |",
            "| - | - |",
            "| **x** | y |",
            "",
            "```",
            "**code**",
            "```",
            "",
            "**real**",
        ].join("\n");

        const tokens = collectHybridInlineTokensForTest(markdown, { from: 0, to: 0 });

        expect(tokens.filter((token) => token.className.includes("cm-strong"))).toEqual([
            expect.objectContaining({
                from: markdown.lastIndexOf("real"),
                to: markdown.lastIndexOf("real") + "real".length,
            }),
        ]);
    });
});
