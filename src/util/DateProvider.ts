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
import moment from "moment";
import { Moment } from "moment";
import { ALLOWED_DATE_FORMATS } from "src/constants";

export interface IDateProvider {
    get today(): Moment;
    get startofToday(): Moment;
    get endofToday(): Moment;
}

export class LiveDateProvider implements IDateProvider {
    get today(): Moment {
        // return moment().startOf("day");
        return moment();
    }
    get startofToday(): Moment {
        return moment().startOf("day");
    }
    get endofToday(): Moment {
        return moment().endOf("day");
    }
}

export class StaticDateProvider implements IDateProvider {
    private moment: Moment;

    constructor(moment: Moment) {
        this.moment = moment;
    }

    get today(): Moment {
        return this.moment.clone();
    }
    get startofToday(): Moment {
        return this.moment.clone().startOf("day");
    }
    get endofToday(): Moment {
        return this.moment.clone().endOf("day");
    }

    static fromDateStr(str: string): StaticDateProvider {
        return new StaticDateProvider(DateUtil.dateStrToMoment(str));
    }
}

export class DateUtil {
    static dateStrToMoment(str: string): Moment {
        return moment(str, ALLOWED_DATE_FORMATS);
    }
}

export let globalDateProvider: IDateProvider = new LiveDateProvider();
