const ANKI_CLOZE_OPEN_REGEX = /\{\{c(\d+)(?:::|：：)/gi;

export const ANKI_CLOZE_FINGERPRINT_SEPARATOR = "||";

export interface AnkiClozeInfo {
    id: number;
    content: string;
    answerText: string;
    start: number;
    end: number;
    lineNum: number;
    lineIndex: number;
    endLineNum: number;
}

export interface AnkiClozeLineGroup {
    id: number;
    lineNum: number;
    lineIndex: number;
    endLineNum: number;
    start: number;
    end: number;
    clozeId: string;
    answerParts: string[];
    fingerprint: string;
    infos: AnkiClozeInfo[];
}

function getHintSeparatorIndex(content: string): number {
    const asciiIndex = content.indexOf("::");
    const fullWidthIndex = content.indexOf("：：");

    if (asciiIndex === -1) {
        return fullWidthIndex;
    }
    if (fullWidthIndex === -1) {
        return asciiIndex;
    }

    return Math.min(asciiIndex, fullWidthIndex);
}

function extractAnswerText(content: string): string {
    const separatorIndex = getHintSeparatorIndex(content);
    if (separatorIndex === -1) {
        return content;
    }

    return content.substring(0, separatorIndex);
}

function normalizeBaseAnkiClozeId(id: string | number): string {
    if (typeof id === "number") {
        return `c${id}`;
    }

    const normalized = id.toLowerCase();
    return normalized.startsWith("c") ? normalized : `c${normalized}`;
}

export function buildLineScopedAnkiClozeId(id: string | number, lineIndex: number): string {
    return `${normalizeBaseAnkiClozeId(id)}_l${lineIndex}`;
}

export function getLegacyAnkiClozeId(clozeId: string): string {
    const match = clozeId.toLowerCase().match(/^(c\d+)(?:_l\d+)?$/);
    return match?.[1] ?? clozeId;
}

export function getAnkiClozeIdLineIndex(clozeId: string): number | null {
    const match = clozeId.toLowerCase().match(/^c\d+_l(\d+)$/);
    return match ? Number(match[1]) : null;
}

export function isLineScopedAnkiClozeId(clozeId: string): boolean {
    return getAnkiClozeIdLineIndex(clozeId) !== null;
}

export function getAnkiClozeIdAliases(clozeId: string): string[] {
    const aliases = [clozeId];
    const legacyId = getLegacyAnkiClozeId(clozeId);
    if (legacyId !== clozeId) {
        aliases.push(legacyId);
    }
    return aliases;
}

export function extractAnkiClozeInfos(text: string): AnkiClozeInfo[] {
    const infos: AnkiClozeInfo[] = [];
    let match: RegExpExecArray | null;

    while ((match = ANKI_CLOZE_OPEN_REGEX.exec(text)) !== null) {
        const id = Number(match[1]);
        const startPos = match.index;
        const contentStart = startPos + match[0].length;

        let braceDepth = 0;
        let endPos = -1;

        for (let index = contentStart; index < text.length; index++) {
            if (braceDepth === 0 && text.startsWith("}}", index)) {
                endPos = index;
                break;
            }
            if (text[index] === "{") {
                braceDepth++;
            } else if (text[index] === "}" && braceDepth > 0) {
                braceDepth--;
            }
        }

        if (endPos === -1) {
            continue;
        }

        const lineNum = text.substring(0, startPos).split("\n").length;
        const content = text.substring(contentStart, endPos);

        infos.push({
            id,
            content,
            answerText: extractAnswerText(content),
            start: startPos,
            end: endPos + 2,
            lineNum,
            lineIndex: lineNum - 1,
            endLineNum: lineNum + (text.substring(startPos, endPos).match(/\n/g) || []).length,
        });

        ANKI_CLOZE_OPEN_REGEX.lastIndex = endPos + 2;
    }

    return infos;
}

export function groupLineScopedAnkiClozes(clozeInfos: AnkiClozeInfo[]): AnkiClozeLineGroup[] {
    const groups = new Map<string, AnkiClozeLineGroup>();

    for (const info of clozeInfos) {
        const clozeId = buildLineScopedAnkiClozeId(info.id, info.lineIndex);
        const existing = groups.get(clozeId);

        if (!existing) {
            groups.set(clozeId, {
                id: info.id,
                lineNum: info.lineNum,
                lineIndex: info.lineIndex,
                endLineNum: info.endLineNum,
                start: info.start,
                end: info.end,
                clozeId,
                answerParts: [info.answerText],
                fingerprint: info.answerText,
                infos: [info],
            });
            continue;
        }

        existing.start = Math.min(existing.start, info.start);
        existing.end = Math.max(existing.end, info.end);
        existing.endLineNum = Math.max(existing.endLineNum, info.endLineNum);
        existing.answerParts.push(info.answerText);
        existing.fingerprint = existing.answerParts.join(ANKI_CLOZE_FINGERPRINT_SEPARATOR);
        existing.infos.push(info);
    }

    return Array.from(groups.values());
}

export function extractLineScopedAnkiClozeGroups(text: string): AnkiClozeLineGroup[] {
    return groupLineScopedAnkiClozes(extractAnkiClozeInfos(text));
}
