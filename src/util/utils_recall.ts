/**
 * 这个文件主要是干什么的：
 * [工具层] 业务相关工具函数集合。
 * 包含了一些特定于 Recall/SR 业务逻辑的工具，如 Block ID 生成、Fingerprint (指纹) 计算。
 * 指纹计算逻辑尤为重要，用于识别卡片内容是否发生变化。
 *
 * 它在项目中属于：工具层 (Utils) / 业务工具 (Business Utils)
 *
 * 它会用到哪些文件：
 * 1. src/settings.ts
 * 2. src/util/utils.ts
 *
 * 哪些文件会用到它：
 * 1. src/dataStore/trackedFile.ts (计算指纹)
 * 2. src/stats.ts
 */
import { Notice, Platform } from "obsidian";
import { cyrb53, isEqualOrSubPath } from "src/util/utils";
import { SRSettings } from "src/settings";

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

        const ankiMatches = [...text.matchAll(/\{\{c(\d+)(?:::|锛氾細)(.*?)(?:::|锛氾細)?\}\}/gi)];
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

    /**
     * 获取全文哈希 (保留原有逻辑，作为一种特征)
     */
    static getTxtHash(cardText: string) {
        const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
        return cyrb53(text).substring(0, 8); // 统一长度为8
    }

    /**
     * 【全能版】获取卡片核心内容指纹 (Fingerprint)
     * 兼容：Anki 挖空、高亮挖空、粗体挖空、以及普通问答卡
     */
    static getFingerprint(cardText: string, settings: SRSettings): string {
        const parts = this.getFingerprintParts(cardText, settings);
        if (parts.length === 0) {
            // 兜底：使用全文哈希
            const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
            return cyrb53(text).substring(0, 8);
        }
        // 用竖线分隔各部分内容，便于后续拆解比对
        return parts.join("｜"); // 使用全角竖线避免与内容冲突
    }

    /**
     * 获取指纹各部分的原始内容数组
     * 顺序必须与卡片生成顺序严格一致：先 Anki (按ID排序) 后 高亮/粗体 (按位置)
     */
    static getFingerprintParts(cardText: string, settings: SRSettings): string[] {
        const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
        const fingerprintParts: string[] = [];
        const isCodeBlock = text.startsWith("```") && settings.parseClozesInCodeBlocks;

        // 1. Anki 风格挖空 {{c1::内容}} (支持中文冒号，忽略大小写)
        // 必须先处理且按 ID 排序
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

        // 2. 高亮/粗体 - 必须后处理，按出现位置
        if (settings.convertHighlightsToClozes) {
            const highlights = [...text.matchAll(/==(.*?)==/g)];
            fingerprintParts.push(...highlights.map((m) => m[1]));
        }

        if (settings.convertBoldTextToClozes) {
            const bolds = [...text.matchAll(/\*\*(.*?)\*\*/g)];
            fingerprintParts.push(...bolds.map((m) => m[1]));
        }

        // 3. 问答卡没有挖空部分
        if (fingerprintParts.length === 0) {
            const sep = settings.singleLineCardSeparator || "::";
            if (text.includes(sep)) {
                fingerprintParts.push(text.split(sep)[0].trim());
            }
        }

        return fingerprintParts;
    }

    /**
     * 【itemMap 架构】获取带 key 的指纹 Map
     * key 格式：Anki cloze 用 "c1", "c2"... 或 "c1_l2" (代码块内同ID按行区分)
     * 用于 CardInfo.itemMap 的键值对应
     */
    static getFingerprintMap(cardText: string, settings: SRSettings): Record<string, string> {
        const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
        const result: Record<string, string> = {};
        const isCodeBlock = text.startsWith("```") && settings.parseClozesInCodeBlocks;

        // 1. Anki 风格挖空 {{c1::内容}} - key = "c1", "c2"... 或 "c1_l2"
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

        // 2. 高亮 - key = "hl0", "hl1"...
        if (settings.convertHighlightsToClozes) {
            const highlights = [...text.matchAll(/==(.*?)==/g)];
            highlights.forEach((m, i) => {
                result[`hl${i}`] = m[1];
            });
        }

        // 3. 粗体 - key = "bd0", "bd1"...
        if (settings.convertBoldTextToClozes) {
            const bolds = [...text.matchAll(/\*\*(.*?)\*\*/g)];
            bolds.forEach((m, i) => {
                result[`bd${i}`] = m[1];
            });
        }

        return result;
    }

    /**
     * 【每个挖空独立上下文】获取指纹 Map，同时提取每个挖空位置前后各 250 字符的上下文
     * 用于 CardInfo.itemContextMap 的置信度比对
     *
     * 返回格式: { key: { content: 挖空内容, context: 前后250字符拼接 } }
     */
    static getFingerprintMapWithContext(
        cardText: string,
        settings: SRSettings,
    ): Record<string, { content: string; context: string }> {
        const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
        const result: Record<string, { content: string; context: string }> = {};
        const isCodeBlock = text.startsWith("```") && settings.parseClozesInCodeBlocks;
        const CONTEXT_RADIUS = 250;

        // 1. Anki 风格挖空 {{c1::内容}}
        const ankiMatches = [...text.matchAll(/\{\{c(\d+)(?:::|：：)(.*?)(?:::|：：)?\}\}/gi)];
        ankiMatches.forEach((m) => {
            const id = m[1];
            const pos = m.index!;
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

        // 2. 高亮 ==内容==
        if (settings.convertHighlightsToClozes) {
            const highlights = [...text.matchAll(/==(.*?)==/g)];
            highlights.forEach((m, i) => {
                const pos = m.index!;
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

        // 3. 粗体 **内容**
        if (settings.convertBoldTextToClozes) {
            const bolds = [...text.matchAll(/\*\*(.*?)\*\*/g)];
            bolds.forEach((m, i) => {
                const pos = m.index!;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static assignOnly(obj: any, source: any): any {
        const newObj = Object.assign(obj);
        if (source != undefined) {
            Object.keys(obj).forEach((key) => {
                if (key in source) {
                    newObj[key] = source[key];
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static assignObjFully(obj: any, source: any): any {
        const newObj = Object.assign(obj, JSON.parse(JSON.stringify(source)));
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static shuffle(array: any[]) {
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
        } catch (error) {
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
    if (Array.isArray && Array.isArray(value)) {
        return true;
    }
    const type = Object.prototype.toString.call(value);
    if (type.slice(0, 7) === "[object" && type.slice(-6) === "Array]") {
        return true;
    }
    return false;
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

// eslint-disable-next-line @typescript-eslint/ban-types
export const errorlog = (data: {}) => {
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

/**
 * target: 当前对象的原型，假设 TestClass 是对象，那么 target 就是 TestClass.prototype
 *
 * propertyKey: 方法的名称
 *
 * descriptor: 方法的属性描述符，即 Object.getOwnPropertyDescriptor(TestClass.prototype, propertyKey)
 *
 * 链接：https://juejin.cn/post/7059737328394174501
 * @returns
 */
export const logExecutionTime = () => {
    return function (
        target: object,
        propertyKey: string | symbol,
        propertyDescriptor: PropertyDescriptor,
    ) {
        const originalFunc = propertyDescriptor.value;

        // 修改原有function的定义
        propertyDescriptor.value = async function (...args: unknown[]) {
            // const startTime = new Date().getTime();
            const startTime = performance.now();
            const results = await originalFunc.apply(this, args);
            // const endTime = new Date().getTime();
            const endTime = performance.now();
            const msg = `*** ${propertyKey.toString()} took ${endTime - startTime} msec to run ***`;
            if (endTime - startTime > 10) debug(originalFunc.name, undefined, { msg });
            return results;
        };
        return propertyDescriptor;
    };
};

export function isIgnoredPath(noteFoldersToIgnore: string[], path: string) {
    // return noteFoldersToIgnore.some((folder) => isEqualOrSubPath(path, folder));
    return noteFoldersToIgnore.some((folder) => path.includes(folder));
}
