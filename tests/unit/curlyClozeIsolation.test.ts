import { hasAnkiClozeCandidate, hasCurlyClozeCandidate } from "src/Events/trackFileEvents";
import { extractPlainCurlyClozeMatches, stripPlainCurlyClozeSyntax } from "src/util/curlyCloze";

describe("plain curly cloze isolation", () => {
    test("candidate detection keeps plain curly and Anki clozes separate", () => {
        expect(hasAnkiClozeCandidate("{{plain}}")).toBe(false);
        expect(hasCurlyClozeCandidate("{{plain}}", { convertCurlyBracketsToClozes: true })).toBe(
            true,
        );

        expect(hasAnkiClozeCandidate("{{c1::anki}}")).toBe(true);
        expect(hasCurlyClozeCandidate("{{c1::anki}}", { convertCurlyBracketsToClozes: true })).toBe(
            false,
        );

        expect(hasAnkiClozeCandidate("{{plain}} {{c1::anki}}")).toBe(true);
        expect(
            hasCurlyClozeCandidate("{{plain}} {{c1::anki}}", {
                convertCurlyBracketsToClozes: true,
            }),
        ).toBe(true);
    });

    test("plain curly extraction and stripping skip Anki clozes", () => {
        expect(extractPlainCurlyClozeMatches("{{plain}} {{c1::anki}}")).toEqual([
            {
                start: 0,
                end: 9,
                fullMatch: "{{plain}}",
                innerText: "plain",
            },
        ]);

        expect(stripPlainCurlyClozeSyntax("{{plain}} {{c1::anki}}")).toBe("plain {{c1::anki}}");
    });
});
