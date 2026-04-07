import { Notice, Platform } from "obsidian";
import { cyrb53 } from "src/util/utils";
import { SRSettings } from "src/settings";
import { extractPlainCurlyClozeMatches } from "src/util/curlyCloze";
import { extractStandardClozeMatches } from "src/util/codeAwareCloze";
import { extractAnkiClozeInfos, groupLineScopedAnkiClozes } from "src/util/ankiClozeGrouping";

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

interface FingerprintEntry {
    key: string;
    lineOffset: number;
    content: string;
    start: number;
    end: number;
}

function stripSrComments(cardText: string): string {
    return cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
}

function isCodeBlockCardText(text: string, settings: SRSettings): boolean {
    return (text.startsWith("```") || text.startsWith("~~~")) && settings.parseClozesInCodeBlocks;
}

function buildAnkiFingerprintEntries(text: string, settings: SRSettings): FingerprintEntry[] {
    const groups = groupLineScopedAnkiClozes(extractAnkiClozeInfos(text));
    if (groups.length === 0) {
        return [];
    }

    const orderedGroups = isCodeBlockCardText(text, settings)
        ? [...groups].sort((left, right) => left.id - right.id || left.lineIndex - right.lineIndex)
        : groups;

    return orderedGroups.map((group) => ({
        key: group.clozeId,
        lineOffset: group.lineIndex,
        content: group.fingerprint,
        start: group.start,
        end: group.end,
    }));
}

function buildStandardFingerprintEntries(text: string, settings: SRSettings): FingerprintEntry[] {
    if (!settings.convertHighlightsToClozes && !settings.convertBoldTextToClozes) {
        return [];
    }

    let highlightIndex = 0;
    let boldIndex = 0;

    return extractStandardClozeMatches(text).flatMap((match) => {
        if (match.type === "highlight") {
            if (!settings.convertHighlightsToClozes) {
                return [];
            }
            return [
                {
                    key: `hl${highlightIndex++}`,
                    lineOffset: text.substring(0, match.start).split("\n").length - 1,
                    content: match.innerText,
                    start: match.start,
                    end: match.end,
                },
            ];
        }

        if (!settings.convertBoldTextToClozes) {
            return [];
        }

        return [
            {
                key: `bd${boldIndex++}`,
                lineOffset: text.substring(0, match.start).split("\n").length - 1,
                content: match.innerText,
                start: match.start,
                end: match.end,
            },
        ];
    });
}

function buildPlainCurlyFingerprintEntries(text: string, settings: SRSettings): FingerprintEntry[] {
    if (!settings.convertCurlyBracketsToClozes) {
        return [];
    }

    return extractPlainCurlyClozeMatches(text).map((match, index) => ({
        key: `cb${index}`,
        lineOffset: text.substring(0, match.start).split("\n").length - 1,
        content: match.innerText,
        start: match.start,
        end: match.end,
    }));
}

function buildOrderedFingerprintEntries(text: string, settings: SRSettings): FingerprintEntry[] {
    return [
        ...buildAnkiFingerprintEntries(text, settings),
        ...buildStandardFingerprintEntries(text, settings),
        ...buildPlainCurlyFingerprintEntries(text, settings),
    ];
}

function buildContext(text: string, start: number, end: number, radius: number): string {
    const before = text.substring(Math.max(0, start - radius), start);
    const after = text.substring(end, Math.min(text.length, end + radius));
    return before + after;
}
export class BlockUtils {
    static generateBlockId(length?: number): string {
        if (length === undefined) length = 6;
        let hash = "";
        for (let i = 0; i < length; i++) {
            hash += characters.charAt(Math.floor(Math.random() * characters.length));
        }

        return hash;
    }

    static getOrderedFingerprintTargets(
        cardText: string,
        settings: SRSettings,
    ): Array<{ key: string; lineOffset: number }> {
        const text = stripSrComments(cardText);
        return buildOrderedFingerprintEntries(text, settings).map((entry) => ({
            key: entry.key,
            lineOffset: entry.lineOffset,
        }));
    }

    static getOrderedFingerprintKeys(cardText: string, settings: SRSettings): string[] {
        return this.getOrderedFingerprintTargets(cardText, settings).map((target) => target.key);
    }

    static getTxtHash(cardText: string) {
        const text = stripSrComments(cardText);
        return cyrb53(text).substring(0, 8);
    }

    static getFingerprint(cardText: string, settings: SRSettings): string {
        const parts = this.getFingerprintParts(cardText, settings);
        if (parts.length === 0) {
            const text = stripSrComments(cardText);
            return cyrb53(text).substring(0, 8);
        }
        // Join parts with a stable separator so similar fragments do not collapse together.
        return parts.join("||");
    }

    static getFingerprintParts(cardText: string, settings: SRSettings): string[] {
        const text = stripSrComments(cardText);
        const fingerprintParts = buildOrderedFingerprintEntries(text, settings).map(
            (entry) => entry.content,
        );

        if (fingerprintParts.length === 0) {
            const sep = settings.singleLineCardSeparator || "::";
            if (text.includes(sep)) {
                fingerprintParts.push(text.split(sep)[0].trim());
            }
        }

        return fingerprintParts;
    }

    static getFingerprintMap(cardText: string, settings: SRSettings): Record<string, string> {
        const text = stripSrComments(cardText);
        const result: Record<string, string> = {};
        buildOrderedFingerprintEntries(text, settings).forEach((entry) => {
            result[entry.key] = entry.content;
        });

        return result;
    }

    static getFingerprintMapWithContext(
        cardText: string,
        settings: SRSettings,
    ): Record<string, { content: string; context: string }> {
        const text = stripSrComments(cardText);
        const result: Record<string, { content: string; context: string }> = {};
        const contextRadius = 250;

        buildOrderedFingerprintEntries(text, settings).forEach((entry) => {
            result[entry.key] = {
                content: entry.content,
                context: buildContext(text, entry.start, entry.end, contextRadius),
            };
        });

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
