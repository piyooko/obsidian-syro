/**
 * 鏉╂瑤閲滈弬鍥︽娑撴槒顩﹂弰顖氬叡娴犫偓娑斿牏娈戦敍?
 * [瀹搞儱鍙跨仦淇?娑撴艾濮熼惄绋垮彠瀹搞儱鍙块崙鑺ユ殶闂嗗棗鎮庨妴?
 * 閸栧懎鎯堟禍鍡曠娴滄稓澹掔€规矮绨?Recall/SR 娑撴艾濮熼柅鏄忕帆閻ㄥ嫬浼愰崗鍑ょ礉婵?Block ID 閻㈢喐鍨氶妴涓梚ngerprint (閹稿洨姹? 鐠侊紕鐣婚妴?
 * 閹稿洨姹楃拋锛勭暬闁槒绶亸銈勮礋闁插秷顩﹂敍宀€鏁ゆ禍搴ょ槕閸掝偄宕遍悧鍥у敶鐎硅妲搁崥锕€褰傞悽鐔峰綁閸栨牓鈧?
 *
 * 鐎瑰啫婀い鍦窗娑擃厼鐫樻禍搴窗瀹搞儱鍙跨仦?(Utils) / 娑撴艾濮熷銉ュ徔 (Business Utils)
 *
 * 鐎瑰啩绱伴悽銊ュ煂閸濐亙绨洪弬鍥︽閿?
 * 1. src/settings.ts
 * 2. src/util/utils.ts
 *
 * 閸濐亙绨洪弬鍥︽娴兼氨鏁ら崚鏉跨暊閿?
 * 1. src/dataStore/trackedFile.ts (鐠侊紕鐣婚幐鍥╂睏)
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
     * 閼惧嘲褰囬崗銊︽瀮閸濆牆绗?(娣囨繄鏆€閸樼喐婀侀柅鏄忕帆閿涘奔缍旀稉杞扮缁夊秶澹掑?
     */
    static getTxtHash(cardText: string) {
        const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
        return cyrb53(text).substring(0, 8); // 缂佺喍绔撮梹鍨娑?
    }

    /**
     * 閵嗘劕鍙忛懗鐣屽閵嗘垼骞忛崣鏍у幢閻楀洦鐗宠箛鍐ㄥ敶鐎硅瀵氱痪?(Fingerprint)
     * 閸忕厧顔愰敍娆皀ki 閹告牜鈹栭妴渚€鐝禍顔藉缁屾亽鈧胶鐭栨担鎾村缁屾亽鈧椒浜掗崣濠冩珮闁岸妫剁粵鏂垮幢
     */
    static getFingerprint(cardText: string, settings: SRSettings): string {
        const parts = this.getFingerprintParts(cardText, settings);
        if (parts.length === 0) {
            // 閸忔粌绨抽敍姘▏閻劌鍙忛弬鍥ф惐鐢?
            const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
            return cyrb53(text).substring(0, 8);
        }
        // Join parts with a stable separator so similar fragments do not collapse together.
        return parts.join("||");
    }

    /**
     * 閼惧嘲褰囬幐鍥╂睏閸氬嫰鍎撮崚鍡欐畱閸樼喎顫愰崘鍛啇閺佹壆绮?
     * 妞ゅ搫绨箛鍛淬€忔稉搴″幢閻楀洨鏁撻幋鎰般€庢惔蹇庡紬閺嶉棿绔撮懛杈剧窗閸?Anki (閹稿D閹烘帒绨? 閸?妤傛ü瀵?缁ぞ缍?(閹稿缍呯純?
     */
    static getFingerprintParts(cardText: string, settings: SRSettings): string[] {
        const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
        const fingerprintParts: string[] = [];
        const isCodeBlock = text.startsWith("```") && settings.parseClozesInCodeBlocks;

        // 1. Anki 妞嬪孩鐗搁幐鏍敄 {{c1::閸愬懎顔恾} (閺€顖涘瘮娑擃厽鏋冮崘鎺戝娇閿涘苯鎷烽悾銉ャ亣鐏忓繐鍟?
        // 韫囧懘銆忛崗鍫濐槱閻炲棔绗栭幐?ID 閹烘帒绨?
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

        // 2. 妤傛ü瀵?缁ぞ缍?- 韫囧懘銆忛崥搴☆槱閻炲棴绱濋幐澶婂毉閻滈缍呯純?
        if (settings.convertHighlightsToClozes) {
            const highlights = [...text.matchAll(/==(.*?)==/g)];
            fingerprintParts.push(...highlights.map((m) => m[1]));
        }

        if (settings.convertBoldTextToClozes) {
            const bolds = [...text.matchAll(/\*\*(.*?)\*\*/g)];
            fingerprintParts.push(...bolds.map((m) => m[1]));
        }

        // 3. 闂傤喚鐡熼崡鈩冪梾閺堝瀵茬粚娲劥閸?
        if (fingerprintParts.length === 0) {
            const sep = settings.singleLineCardSeparator || "::";
            if (text.includes(sep)) {
                fingerprintParts.push(text.split(sep)[0].trim());
            }
        }

        return fingerprintParts;
    }

    /**
     * 閵嗘亼temMap 閺嬭埖鐎妴鎴ｅ箯閸欐牕鐢?key 閻ㄥ嫭瀵氱痪?Map
     * key 閺嶇厧绱￠敍娆皀ki cloze 閻?"c1", "c2"... 閹?"c1_l2" (娴狅絿鐖滈崸妤€鍞撮崥瀛朌閹稿顢戦崠鍝勫瀻)
     * 閻劋绨?CardInfo.itemMap 閻ㄥ嫰鏁崐鐓庮嚠鎼?
     */
    static getFingerprintMap(cardText: string, settings: SRSettings): Record<string, string> {
        const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
        const result: Record<string, string> = {};
        const isCodeBlock = text.startsWith("```") && settings.parseClozesInCodeBlocks;

        // 1. Anki 妞嬪孩鐗搁幐鏍敄 {{c1::閸愬懎顔恾} - key = "c1", "c2"... 閹?"c1_l2"
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

        // 2. 妤傛ü瀵?- key = "hl0", "hl1"...
        if (settings.convertHighlightsToClozes) {
            const highlights = [...text.matchAll(/==(.*?)==/g)];
            highlights.forEach((m, i) => {
                result[`hl${i}`] = m[1];
            });
        }

        // 3. 缁ぞ缍?- key = "bd0", "bd1"...
        if (settings.convertBoldTextToClozes) {
            const bolds = [...text.matchAll(/\*\*(.*?)\*\*/g)];
            bolds.forEach((m, i) => {
                result[`bd${i}`] = m[1];
            });
        }

        return result;
    }

    /**
     * 閵嗘劖鐦℃稉顏呭缁岃櫣瀚粩瀣╃瑐娑撳鏋冮妴鎴ｅ箯閸欐牗瀵氱痪?Map閿涘苯鎮撻弮鑸靛絹閸欐牗鐦℃稉顏呭缁岃桨缍呯純顔煎閸氬骸鎮?250 鐎涙顑侀惃鍕瑐娑撳鏋?
     * 閻劋绨?CardInfo.itemContextMap 閻ㄥ嫮鐤嗘穱鈥冲濮ｆ柨顕?
     *
     * 鏉╂柨娲栭弽鐓庣础: { key: { content: 閹告牜鈹栭崘鍛啇, context: 閸撳秴鎮?50鐎涙顑侀幏鍏煎复 } }
     */
    static getFingerprintMapWithContext(
        cardText: string,
        settings: SRSettings,
    ): Record<string, { content: string; context: string }> {
        const text = cardText.replace(/<!--SR:.+-->/gm, "").trimEnd();
        const result: Record<string, { content: string; context: string }> = {};
        const isCodeBlock = text.startsWith("```") && settings.parseClozesInCodeBlocks;
        const CONTEXT_RADIUS = 250;

        // 1. Anki 妞嬪孩鐗搁幐鏍敄 {{c1::閸愬懎顔恾}
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

        // 2. 妤傛ü瀵?==閸愬懎顔?=
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

        // 3. 缁ぞ缍?**閸愬懎顔?*
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
        return newObj as T;
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

/**
 * target: 瑜版挸澧犵€电钖勯惃鍕斧閸ㄥ绱濋崑鍥啎 TestClass 閺勵垰顕挒鈽呯礉闁絼绠?target 鐏忚鲸妲?TestClass.prototype
 *
 * propertyKey: 閺傝纭堕惃鍕倳缁?
 *
 * descriptor: 閺傝纭堕惃鍕潣閹勫伎鏉╂壆顑侀敍灞藉祮 Object.getOwnPropertyDescriptor(TestClass.prototype, propertyKey)
 *
 * 闁剧偓甯撮敍姝╰tps://juejin.cn/post/7059737328394174501
 * @returns
 */
export const logExecutionTime = () => {
    return function (
        target: object,
        propertyKey: string | symbol,
        propertyDescriptor: PropertyDescriptor,
    ) {
        const originalFunc = propertyDescriptor.value;

        // 娣囶喗鏁奸崢鐔告箒function閻ㄥ嫬鐣炬稊?
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
