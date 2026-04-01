import { Notice, Platform } from "obsidian";
import { cyrb53 } from "src/util/utils";
import { SRSettings } from "src/settings";
import { extractPlainCurlyClozeMatches } from "src/util/curlyCloze";

export class DateUtils {
    /**
     * ms
     * @type {number}
     */

    static addTime(date: Date, time: number): Date {
        return new Date(date.getTime() + time);
    }

    static fromNow(time: number): Date {
        return this.addTime(new Date(), time);
    }

    static getTimestampInMs(date: Date): number {
        return date.getTime();
    }

    static DAYS_TO_MILLIS = 86400000;
}

const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
export class BlockUtils {
    static generateBlockId(length?: number): string {
        if (length === undefined) length = 6;
        let hash = "";
        for (let i = 0; i < length; i++) {
            hash += characters.charAt(Math.floor(Math.random() * characters.length));
        }

        return hash;
    }

    static getOrderedFingerprintKeys(cardText: string, settings: SRSettings): string[] {
        const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
        const keys: string[] = [];
        const isCodeBlock = text.startsWith("```") && settings.parseClozesInCodeBlocks;

        const ankiMatches = [...text.matchAll(/\{\{c(\d+)(?:::|：：)(.*?)(?:::|：：)?\}\}/gi)];
        if (ankiMatches.length > 0) {
            const seenKeys = new Set<string>();
            const clozes = ankiMatches
                .map((m) => {
                    const lineIndex = text.substring(0, m.index).split("\n").length - 1;
                    return {
                        id: parseInt(m[1]),
                        lineIndex,
                        key: isCodeBlock ? `c${m[1]}_l${lineIndex}` : `c${m[1]}`,
                    };
                })
                .sort((a, b) => {
                    if (a.id !== b.id) return a.id - b.id;
                    return a.lineIndex - b.lineIndex;
                });

            clozes.forEach((cloze) => {
                if (!seenKeys.has(cloze.key)) {
                    seenKeys.add(cloze.key);
                    keys.push(cloze.key);
                }
            });
        }

        if (settings.convertCurlyBracketsToClozes) {
            const plainCurlyMatches = extractPlainCurlyClozeMatches(text);
            plainCurlyMatches.forEach((_, i) => keys.push(`cb${i}`));
        }

        if (settings.convertHighlightsToClozes) {
            const highlights = [...text.matchAll(/==(.*?)==/g)];
            highlights.forEach((_, i) => keys.push(`hl${i}`));
        }

        if (settings.convertBoldTextToClozes) {
            const bolds = [...text.matchAll(/\*\*(.*?)\*\*/g)];
            bolds.forEach((_, i) => keys.push(`bd${i}`));
        }

        return keys;
    }

    static getTxtHash(cardText: string) {
        const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
        return cyrb53(text).substring(0, 8);
    }

    static getFingerprint(cardText: string, settings: SRSettings): string {
        const parts = this.getFingerprintParts(cardText, settings);
        if (parts.length === 0) {
            const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
            return cyrb53(text).substring(0, 8);
        }
        // Join parts with a stable separator so similar fragments do not collapse together.
        return parts.join("||");
    }

    static getFingerprintParts(cardText: string, settings: SRSettings): string[] {
        const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
        const fingerprintParts: string[] = [];
        const isCodeBlock = text.startsWith("```") && settings.parseClozesInCodeBlocks;

        const ankiMatches = [...text.matchAll(/\{\{c(\d+)(?:::|：：)(.*?)(?:::|：：)?\}\}/gi)];
        if (ankiMatches.length > 0) {
            const clozes = ankiMatches.map((m) => {
                const lineIndex = text.substring(0, m.index).split("\n").length - 1;
                return {
                    id: parseInt(m[1]),
                    content: m[2],
                    lineIndex: isCodeBlock ? lineIndex : 0,
                };
            });
            clozes.sort((a, b) => {
                if (a.id !== b.id) return a.id - b.id;
                return a.lineIndex - b.lineIndex;
            });
            fingerprintParts.push(...clozes.map((c) => c.content));
        }

        if (settings.convertCurlyBracketsToClozes) {
            const plainCurlyMatches = extractPlainCurlyClozeMatches(text);
            fingerprintParts.push(...plainCurlyMatches.map((match) => match.innerText));
        }

        if (settings.convertHighlightsToClozes) {
            const highlights = [...text.matchAll(/==(.*?)==/g)];
            fingerprintParts.push(...highlights.map((m) => m[1]));
        }

        if (settings.convertBoldTextToClozes) {
            const bolds = [...text.matchAll(/\*\*(.*?)\*\*/g)];
            fingerprintParts.push(...bolds.map((m) => m[1]));
        }

        if (fingerprintParts.length === 0) {
            const sep = settings.singleLineCardSeparator || "::";
            if (text.includes(sep)) {
                fingerprintParts.push(text.split(sep)[0].trim());
            }
        }

        return fingerprintParts;
    }

    static getFingerprintMap(cardText: string, settings: SRSettings): Record<string, string> {
        const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
        const result: Record<string, string> = {};
        const isCodeBlock = text.startsWith("```") && settings.parseClozesInCodeBlocks;

        const ankiMatches = [...text.matchAll(/\{\{c(\d+)(?:::|：：)(.*?)(?:::|：：)?\}\}/gi)];
        ankiMatches
            .map((m) => {
                const id = parseInt(m[1]);
                const lineIndex = text.substring(0, m.index).split("\n").length - 1;
                return {
                    id,
                    lineIndex,
                    key: isCodeBlock ? `c${m[1]}_l${lineIndex}` : `c${m[1]}`,
                    content: m[2],
                };
            })
            .sort((a, b) => {
                if (a.id !== b.id) return a.id - b.id;
                return a.lineIndex - b.lineIndex;
            })
            .forEach((cloze) => {
                if (!(cloze.key in result)) {
                    result[cloze.key] = cloze.content;
                }
            });

        if (settings.convertCurlyBracketsToClozes) {
            const plainCurlyMatches = extractPlainCurlyClozeMatches(text);
            plainCurlyMatches.forEach((match, i) => {
                result[`cb${i}`] = match.innerText;
            });
        }

        if (settings.convertHighlightsToClozes) {
            const highlights = [...text.matchAll(/==(.*?)==/g)];
            highlights.forEach((m, i) => {
                result[`hl${i}`] = m[1];
            });
        }

        if (settings.convertBoldTextToClozes) {
            const bolds = [...text.matchAll(/\*\*(.*?)\*\*/g)];
            bolds.forEach((m, i) => {
                result[`bd${i}`] = m[1];
            });
        }

        return result;
    }

    static getFingerprintMapWithContext(
        cardText: string,
        settings: SRSettings,
    ): Record<string, { content: string; context: string }> {
        const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
        const result: Record<string, { content: string; context: string }> = {};
        const isCodeBlock = text.startsWith("```") && settings.parseClozesInCodeBlocks;
        const CONTEXT_RADIUS = 250;

        const ankiMatches = [...text.matchAll(/\{\{c(\d+)(?:::|：：)(.*?)(?:::|：：)?\}\}/gi)];
        ankiMatches.forEach((m) => {
            const id = m[1];
            const pos = m.index;
            const lineIndex = text.substring(0, pos).split("\n").length - 1;
            const key = isCodeBlock ? `c${id}_l${lineIndex}` : `c${id}`;
            const before = text.substring(Math.max(0, pos - CONTEXT_RADIUS), pos);
            const after = text.substring(
                pos + m[0].length,
                Math.min(text.length, pos + m[0].length + CONTEXT_RADIUS),
            );
            result[key] = {
                content: m[2],
                context: before + after,
            };
        });

        if (settings.convertCurlyBracketsToClozes) {
            const plainCurlyMatches = extractPlainCurlyClozeMatches(text);
            plainCurlyMatches.forEach((match, i) => {
                const before = text.substring(
                    Math.max(0, match.start - CONTEXT_RADIUS),
                    match.start,
                );
                const after = text.substring(
                    match.end,
                    Math.min(text.length, match.end + CONTEXT_RADIUS),
                );
                result[`cb${i}`] = {
                    content: match.innerText,
                    context: before + after,
                };
            });
        }

        if (settings.convertHighlightsToClozes) {
            const highlights = [...text.matchAll(/==(.*?)==/g)];
            highlights.forEach((m, i) => {
                const pos = m.index;
                const before = text.substring(Math.max(0, pos - CONTEXT_RADIUS), pos);
                const after = text.substring(
                    pos + m[0].length,
                    Math.min(text.length, pos + m[0].length + CONTEXT_RADIUS),
                );
                result[`hl${i}`] = {
                    content: m[1],
                    context: before + after,
                };
            });
        }

        if (settings.convertBoldTextToClozes) {
            const bolds = [...text.matchAll(/\*\*(.*?)\*\*/g)];
            bolds.forEach((m, i) => {
                const pos = m.index;
                const before = text.substring(Math.max(0, pos - CONTEXT_RADIUS), pos);
                const after = text.substring(
                    pos + m[0].length,
                    Math.min(text.length, pos + m[0].length + CONTEXT_RADIUS),
                );
                result[`bd${i}`] = {
                    content: m[1],
                    context: before + after,
                };
            });
        }

        return result;
    }
}

export class MiscUtils {
    /**
     * Creates a copy of obj, and copies values from source into
     * the copy, but only if there already is a property with the
     * matching name.
     *
     * @param obj
     * @param source
     */
    static assignOnly<T extends object>(obj: T, source: Partial<T> | null | undefined): T {
        const newObj = Object.assign({}, obj);
        if (source != undefined) {
            Object.keys(obj).forEach((key) => {
                if (key in source) {
                    const typedKey = key as keyof T;
                    newObj[typedKey] = source[typedKey] as T[keyof T];
                }
            });
        }
        return newObj;
    }

    /**
     * Creates a copy of obj, and copies values from source into
     * the copy
     *
     * @param obj
     * @param source
     */
    static assignObjFully<T extends object>(obj: T, source: unknown): T {
        const newObj = Object.assign(obj, JSON.parse(JSON.stringify(source)) as object);
        return newObj;
    }

    /**
     * getRegExpGroups. Counts the number of capturing groups in the provided regular
     * expression.
     *
     * @param {RegExp} exp
     * @returns {number}
     */
    static getRegExpGroups(exp: RegExp): number {
        // Count capturing groups in RegExp, source: https://stackoverflow.com/questions/16046620/regex-to-count-the-number-of-capturing-groups-in-a-regex
        return new RegExp(exp.source + "|").exec("").length - 1;
    }

    /**
     * shuffle. Shuffles the given array in place into a random order
     * using Durstenfeld shuffle.
     *
     * @param {any[]} array
     */
    static shuffle<T>(array: T[]): void {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    static fixed(value: number, point: number) {
        const p: number = Math.pow(10, point);
        return Math.round(value * p) / p;
    }

    static /**
     * @param message
     */
    // fix: with try-catch for unit test.
    notice(message: string | DocumentFragment, duration?: number): void {
        try {
            new Notice(message, duration);
        } catch {
            console.debug(message);
        }
    }
}

// https://github.com/chartjs/Chart.js/blob/master/src/helpers/helpers.core.ts
/**
 * Returns true if `value` is an array (including typed arrays), else returns false.
 * @param value - The value to test.
 * @function
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
    return Array.isArray(value) || ArrayBuffer.isView(value);
}

// https://github.com/zsviczian/obsidian-excalidraw-plugin/
export const isVersionNewerThanOther = (version: string, otherVersion: string): boolean => {
    const v = version.match(/(\d+)\.(\d+)\.(\d+?)\.?(\d+)?/);
    const o = otherVersion.match(/(\d+)\.(\d+)\.(\d+?)\.?(\d+)?/);

    return Boolean(
        v &&
            v.length >= 4 &&
            o &&
            o.length >= 4 &&
            !(isNaN(parseInt(v[1])) || isNaN(parseInt(v[2])) || isNaN(parseInt(v[3]))) &&
            !(isNaN(parseInt(o[1])) || isNaN(parseInt(o[2])) || isNaN(parseInt(o[3]))) &&
            (newer(1) ||
                newer(2) ||
                newer(3) ||
                (!isNaN(parseInt(v[4])) && isNaN(parseInt(o[4]))) ||
                (!(isNaN(parseInt(v[4])) || isNaN(parseInt(o[4]))) && newer(4))),
    );

    function newer(idx: number): boolean {
        return (
            v
                .slice(1, idx)
                .every((_vstr, _idx) => parseInt(v[_idx + 1]) >= parseInt(o[_idx + 1])) &&
            parseInt(v[idx]) > parseInt(o[idx])
        );
    }
};

export const errorlog = (data: object): void => {
    console.error({ plugin: "Spaced-rep-recall:", ...data });
};

export const debug = (functionname: string, ...data: unknown[]) => {
    let duration: number;
    if (Number(data[0]) >= 0) {
        duration = Number(data[0]);
        data = data.slice(1);
    }
    const msg = { plugin: "SRR", func: functionname, ...data };
    console.debug("plugin: SRR, func: " + functionname + "\t" + JSON.stringify(data));
    if (Platform.isMobile) {
        MiscUtils.notice(JSON.stringify(msg), duration);
    }
};

export const logExecutionTime = () => {
    return function (
        target: object,
        propertyKey: string | symbol,
        propertyDescriptor: PropertyDescriptor,
    ) {
        const originalFunc = propertyDescriptor.value as
            | ((this: unknown, ...args: unknown[]) => unknown)
            | undefined;

        if (typeof originalFunc !== "function") {
            return propertyDescriptor;
        }

        propertyDescriptor.value = async function (this: unknown, ...args: unknown[]) {
            // const startTime = new Date().getTime();
            const startTime = performance.now();
            const results = (await originalFunc.apply(this, args)) as unknown;
            // const endTime = new Date().getTime();
            const endTime = performance.now();
            const msg = `*** ${propertyKey.toString()} took ${endTime - startTime} msec to run ***`;
            if (endTime - startTime > 10) {
                const functionName =
                    typeof originalFunc.name === "string" && originalFunc.name.length > 0
                        ? originalFunc.name
                        : propertyKey.toString();
                debug(functionName, undefined, { msg });
            }
            return results;
        };
        return propertyDescriptor;
    };
};

export function isIgnoredPath(noteFoldersToIgnore: string[], path: string) {
    // return noteFoldersToIgnore.some((folder) => isEqualOrSubPath(path, folder));
    return noteFoldersToIgnore.some((folder) => path.includes(folder));
}
