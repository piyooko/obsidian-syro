/**
 * 这个文件主要是干什么的：
 * [工具层] 多语言/国际化 (i18n) 辅助工具。
 * 提供 `t()` 函数，根据 Obsidian 的当前语言设置，加载对应的语言包并返回翻译后的字符串。
 * 同时也处理了字符串插值。
 *
 * 它在项目中属于：工具层 (Utils) / 国际化 (i18n)
 *
 * 它会用到哪些文件：
 * 1. src/lang/locale/* (各种语言包)
 *
 * 哪些文件会用到它：
 * (被项目中几乎所有 UI 和交互相关的模块引用)
 */
// https://github.com/mgmeyers/obsidian-kanban/blob/93014c2512507fde9eafd241e8d4368a8dfdf853/src/lang/helpers.ts

import { moment } from "obsidian";
import af from "./locale/af";
import ar from "./locale/ar";
import cz from "./locale/cz";
import bn from "./locale/bn";
import da from "./locale/da";
import de from "./locale/de";
import en from "./locale/en";
import enGB from "./locale/en-gb";
import es from "./locale/es";
import fr from "./locale/fr";
import hi from "./locale/hi";
import id from "./locale/id";
import it from "./locale/it";
import ja from "./locale/ja";
import ko from "./locale/ko";
import mr from "./locale/mr";
import nl from "./locale/nl";
import no from "./locale/no";
import pl from "./locale/pl";
import pt from "./locale/pt";
import ptBR from "./locale/pt-br";
import ro from "./locale/ro";
import ru from "./locale/ru";
import ta from "./locale/ta";
import te from "./locale/te";
import th from "./locale/th";
import tr from "./locale/tr";
import uk from "./locale/uk";
import ur from "./locale/ur";
import vi from "./locale/vi";
import zhCN from "./locale/zh-cn";
import zhTW from "./locale/zh-tw";

export const localeMap: { [k: string]: Partial<typeof en> } = {
    af,
    ar,
    bn,
    cs: cz,
    da,
    de,
    en,
    "en-gb": enGB,
    es,
    fr,
    hi,
    id,
    it,
    ja,
    ko,
    mr,
    nl,
    nn: no,
    pl,
    pt,
    "pt-br": ptBR,
    ro,
    ru,
    ta,
    te,
    th,
    tr,
    uk,
    ur,
    vi,
    "zh-cn": zhCN,
    "zh-tw": zhTW,
};

const locale = localeMap[moment.locale()];

// https://stackoverflow.com/a/41015840/
function interpolate(str: string, params: Record<string, unknown>): string {
    const names: string[] = Object.keys(params);
    const vals: unknown[] = Object.values(params);
    return new Function(...names, `return \`${str}\`;`)(...vals);
}

export function t(str: keyof typeof en, params?: Record<string, unknown>): string {
    if (!locale) {
        console.error(`SRS error: Locale ${moment.locale()} not found.`);
    }

    const result = (locale && locale[str]) || en[str] || str;

    if (params) {
        return interpolate(result, params);
    }

    return result;
}
