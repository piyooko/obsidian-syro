/**
 * 这个文件主要是干什么的：
 * [工具层] 数字计数词典。
 * 一个简单的辅助类，用于统计数字出现的次数（例如统计 easing 分布：Ease 230 有多少个，Ease 250 有多少个）。
 * 提供了增加、减少计数，以及计算总和、最大值等统计功能。
 *
 * 它在项目中属于：工具层 (Utils) / 统计辅助 (Stats Helper)
 *
 * 它会用到哪些文件：
 * (无内部依赖)
 *
 * 哪些文件会用到它：
 * 1. src/stats.ts (统计部分)
 */
import { getKeysPreserveType, getTypedObjectEntries } from "./utils";

export class ValueCountDict {
    dict: Record<number, number> = {}; // Record<value, count>

    clearCountIfMissing(value: number): void {
        if (!this.hasValue(value)) this.dict[value] = 0;
    }

    hasValue(value: number): boolean {
        return Object.prototype.hasOwnProperty.call(this.dict, value);
    }

    incrementCount(value: number): void {
        this.clearCountIfMissing(value);
        this.dict[value]++;
    }

    decrementCount(value: number): void {
        if (this.dict[value] > 0) {
            this.dict[value]--;
        }
    }

    getMaxValue(): number {
        return Math.max(...getKeysPreserveType(this.dict)) || 0;
    }

    getTotalOfValueMultiplyCount(): number {
        const v: number =
            getTypedObjectEntries(this.dict)
                .map(([value, count]) => value * count)
                .reduce((a, b) => a + b, 0) || 0;
        return v;
    }
}
