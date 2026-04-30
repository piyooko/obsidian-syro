import { SRSettings } from "src/settings";
import { hasPlainCurlyCloze } from "src/util/curlyCloze";

export function hasAnkiClozeCandidate(fileText: string): boolean {
    return fileText.includes("{{c") || fileText.includes("{{C");
}

export function hasCurlyClozeCandidate(
    fileText: string,
    settings: Pick<SRSettings, "convertCurlyBracketsToClozes">,
): boolean {
    return settings.convertCurlyBracketsToClozes && hasPlainCurlyCloze(fileText);
}

function isInsideDoubleCurlySyntax(fileText: string, index: number): boolean {
    const openIndex = fileText.lastIndexOf("{{", index);
    if (openIndex === -1) {
        return false;
    }
    const closeBefore = fileText.lastIndexOf("}}", index);
    return closeBefore < openIndex;
}

function hasSeparatorCandidate(fileText: string, separator: string): boolean {
    if (!separator) {
        return false;
    }

    let index = fileText.indexOf(separator);
    while (index !== -1) {
        if (!isInsideDoubleCurlySyntax(fileText, index)) {
            return true;
        }
        index = fileText.indexOf(separator, index + separator.length);
    }
    return false;
}

export function hasEnabledCardFormatCandidate(
    fileText: string,
    settings: Pick<
        SRSettings,
        | "singleLineCardSeparator"
        | "singleLineReversedCardSeparator"
        | "multilineCardSeparator"
        | "multilineReversedCardSeparator"
        | "convertHighlightsToClozes"
        | "convertBoldTextToClozes"
        | "convertCurlyBracketsToClozes"
        | "convertAnkiClozesToClozes"
        | "isPro"
    >,
): boolean {
    return (
        hasSeparatorCandidate(fileText, settings.singleLineCardSeparator) ||
        hasSeparatorCandidate(fileText, settings.singleLineReversedCardSeparator) ||
        hasSeparatorCandidate(fileText, settings.multilineCardSeparator) ||
        hasSeparatorCandidate(fileText, settings.multilineReversedCardSeparator) ||
        (settings.convertHighlightsToClozes && fileText.includes("==")) ||
        (settings.convertBoldTextToClozes && fileText.includes("**")) ||
        hasCurlyClozeCandidate(fileText, settings) ||
        (settings.isPro && settings.convertAnkiClozesToClozes && hasAnkiClozeCandidate(fileText))
    );
}
