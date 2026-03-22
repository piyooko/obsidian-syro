/**
 * 这个文件主要是干什么的：
 * [工具层] 日期提供者接口与实现。
 * 主要是为了方便单元测试，可以注入一个静态的日期提供者，模拟“今天”是某一天，而不用修改系统时间。
 * 同时也提供了获取“今天”、“今天开始时间”、“今天结束时间”的统一方法。
 *
 * 它在项目中属于：工具层 (Utils) / 测试辅助 (Test Helper)
 *
 * 它会用到哪些文件：
 * 1. moment.js
 *
 * 哪些文件会用到它：
 * 1. src/scheduling.ts (计算复习日期)
 * 2. 单元测试文件
 */
/**
 * 日期处理（便于测试）。
 */
import { moment } from "obsidian";
import { ALLOWED_DATE_FORMATS } from "src/constants";

export interface MomentValue {
    add(amount: number, unit: string): MomentValue;
    clone(): MomentValue;
    endOf(unit: string): MomentValue;
    format(pattern: string): string;
    isSameOrBefore(value: unknown): boolean;
    startOf(unit: string): MomentValue;
    unix?: unknown;
    valueOf(): number;
}

function momentFactory(...args: unknown[]): MomentValue {
    const runtimeMoment =
        typeof window !== "undefined" &&
        "moment" in window &&
        typeof window.moment === "function"
            ? (window.moment as (...momentArgs: unknown[]) => MomentValue)
            : null;

    if (runtimeMoment) {
        return runtimeMoment(...args);
    }

    const obsidianMoment = moment as unknown;
    if (typeof obsidianMoment === "function") {
        return (obsidianMoment as (...momentArgs: unknown[]) => MomentValue)(...args);
    }

    throw new Error("moment runtime unavailable");
}

export interface IDateProvider {
    get today(): MomentValue;
    get startofToday(): MomentValue;
    get endofToday(): MomentValue;
}

export class LiveDateProvider implements IDateProvider {
    get today(): MomentValue {
        // return moment().startOf("day");
        return momentFactory();
    }
    get startofToday(): MomentValue {
        return momentFactory().startOf("day");
    }
    get endofToday(): MomentValue {
        return momentFactory().endOf("day");
    }
}

export class StaticDateProvider implements IDateProvider {
    private moment: MomentValue;

    constructor(moment: MomentValue) {
        this.moment = moment;
    }

    get today(): MomentValue {
        return this.moment.clone();
    }
    get startofToday(): MomentValue {
        return this.moment.clone().startOf("day");
    }
    get endofToday(): MomentValue {
        return this.moment.clone().endOf("day");
    }

    static fromDateStr(str: string): StaticDateProvider {
        return new StaticDateProvider(DateUtil.dateStrToMoment(str));
    }
}

export class DateUtil {
    static dateStrToMoment(str: string): MomentValue {
        return momentFactory(str, ALLOWED_DATE_FORMATS);
    }
}

export const globalDateProvider: IDateProvider = new LiveDateProvider();
