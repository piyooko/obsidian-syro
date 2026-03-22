/**
 * 杩欎釜鏂囦欢涓昏鏄共浠€涔堢殑锛?
 * [宸ュ叿灞俔 闅忔満鏁版彁渚涜€呮帴鍙ｄ笌瀹炵幇銆?
 * 鍚屾牱鏄负浜嗘柟渚垮崟鍏冩祴璇曪紝鍙互鏇挎崲鎺?`Math.random()`锛岃闅忔満缁撴灉鍙娴嬨€?
 * 涔熷寘鍚簡 `WeightedRandomNumber` 绫伙紝鐢ㄤ簬瀹炵幇甯︽潈閲嶇殑闅忔満鎶藉彇閫昏緫銆?
 *
 * 瀹冨湪椤圭洰涓睘浜庯細宸ュ叿灞?(Utils) / 闅忔満 (Random)
 *
 * 瀹冧細鐢ㄥ埌鍝簺鏂囦欢锛?
 * (鏃犲唴閮ㄤ緷璧?
 *
 * 鍝簺鏂囦欢浼氱敤鍒板畠锛?
 * 1. src/DeckTreeIterator.ts (闅忔満澶嶄範椤哄簭)
 * 2. src/algorithms/balance.ts
 */
import { getTypedObjectEntries } from "./utils";

export interface IRandomNumberProvider {
    getInteger(lowerBound: number, upperBound: number): number;
}

export class RandomNumberProvider implements IRandomNumberProvider {
    getInteger(lowerBound: number, upperBound: number): number {
        const range = upperBound - lowerBound + 1;
        return Math.floor(Math.random() * range) + lowerBound;
    }
}

export class StaticRandomNumberProvider implements IRandomNumberProvider {
    expectedLowerBound: number;
    expectedUpperBound: number;
    next: number;

    getInteger(lowerBound: number, upperBound: number): number {
        if (lowerBound != this.expectedLowerBound || upperBound != this.expectedUpperBound)
            throw new Error(
                `lowerBound: A${lowerBound}/E${this.expectedLowerBound}, upperBound: A${upperBound}/E${this.expectedUpperBound}`,
            );
        return this.next;
    }
}

export class WeightedRandomNumber {
    private provider: IRandomNumberProvider;

    constructor(provider: IRandomNumberProvider) {
        this.provider = provider;
    }

    static create(): WeightedRandomNumber {
        return new WeightedRandomNumber(globalRandomNumberProvider);
    }

    //
    // weights is a dictionary:
    //      first number - a key that can be returned
    //      second number - the "bucket size" - this is a weight that influences the probability of the
    //          first number being returned
    //
    // returns:
    //      first number - one of the keys from the weights parameter
    //      second number - an "index" value; 0 <= index < bucketSize
    getRandomValues(weights: Record<number, number>): [number, number] {
        const total: number = WeightedRandomNumber.calcTotalOfCount(weights);
        if (Object.values(weights).some((i) => !Number.isInteger(i) || i < 0))
            throw new Error("All weights must be positive integers");

        const v: number = this.provider.getInteger(0, total - 1);
        let x: number = 0;
        for (const kvp in weights) {
            const [value, count] = [Number(kvp), weights[kvp]];
            if (v < x + count) {
                // x <= v < x + count
                const index: number = v - x;
                return [value, index];
            }
            x += count;
        }
        throw new Error("Unable to determine weighted random value.");
    }

    private static calcTotalOfCount(weights: Record<number, number>): number {
        const total: number =
            getTypedObjectEntries(weights)
                .map(([_, count]) => count)
                .reduce((a, b) => a + b, 0) || 0;
        return total;
    }
}

export let globalRandomNumberProvider: IRandomNumberProvider = new RandomNumberProvider();
const staticRandomNumberProvider: StaticRandomNumberProvider = new StaticRandomNumberProvider();
