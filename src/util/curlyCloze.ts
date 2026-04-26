export interface PlainCurlyClozeMatch {
    start: number;
    end: number;
    fullMatch: string;
    innerText: string;
}

const PLAIN_CURLY_CLOZE_REGEX = /\{\{(.*?)\}\}/g;
const ANKI_CLOZE_PREFIX_REGEX = /^[cC]\d+(?:::|：：)/;
const IR_EXTRACT_PREFIX_REGEX = /^ir(?:::|：：)/i;

export function isAnkiClozeInnerText(innerText: string): boolean {
    return ANKI_CLOZE_PREFIX_REGEX.test(innerText);
}

export function isIrExtractInnerText(innerText: string): boolean {
    return IR_EXTRACT_PREFIX_REGEX.test(innerText);
}

export function extractPlainCurlyClozeMatches(text: string): PlainCurlyClozeMatch[] {
    const matches: PlainCurlyClozeMatch[] = [];

    for (const match of text.matchAll(PLAIN_CURLY_CLOZE_REGEX)) {
        if (match.index === undefined) {
            continue;
        }

        const innerText = match[1];
        if (isAnkiClozeInnerText(innerText) || isIrExtractInnerText(innerText)) {
            continue;
        }

        const start = match.index;
        matches.push({
            start,
            end: start + match[0].length,
            fullMatch: match[0],
            innerText,
        });
    }

    return matches;
}

export function hasPlainCurlyCloze(text: string): boolean {
    return extractPlainCurlyClozeMatches(text).length > 0;
}

export function stripPlainCurlyClozeSyntax(text: string): string {
    return text.replace(PLAIN_CURLY_CLOZE_REGEX, (fullMatch, innerText: string) => {
        return isAnkiClozeInnerText(innerText) || isIrExtractInnerText(innerText)
            ? fullMatch
            : innerText;
    });
}
