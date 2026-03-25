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
import en from "./locale/en";
import zhCN from "./locale/zh-cn";

export type SupportedLocale = "en" | "zh-cn";
export type TranslationKey = keyof typeof en;
type TranslationDictionary = typeof en;

export const localeMap: Record<SupportedLocale, TranslationDictionary> = {
    en,
    "zh-cn": zhCN,
};

export function resolveSupportedLocale(locale: string): SupportedLocale {
    const normalizedLocale = typeof locale === "string" ? locale.toLowerCase() : "";

    if (normalizedLocale.startsWith("zh")) {
        return "zh-cn";
    }

    return "en";
}

function interpolate(str: string, params: Record<string, unknown>): string {
    return str.replace(/\$\{([A-Za-z0-9_]+)\}/g, (match, key: string) => {
        if (!Object.prototype.hasOwnProperty.call(params, key)) {
            return match;
        }

        const value = params[key];
        if (value == null) {
            return "";
        }

        switch (typeof value) {
            case "string":
                return value;
            case "number":
            case "boolean":
            case "bigint":
                return String(value);
            default:
                return match;
        }
    });
}

function isTranslationKey(value: string): value is TranslationKey {
    return Object.prototype.hasOwnProperty.call(en, value) === true;
}

export function t(str: string, params?: Record<string, unknown>): string {
    const locale = localeMap[resolveSupportedLocale(moment.locale())];
    const result = isTranslationKey(str) ? locale[str] ?? en[str] : str;

    if (params) {
        return interpolate(result, params);
    }

    return result;
}
