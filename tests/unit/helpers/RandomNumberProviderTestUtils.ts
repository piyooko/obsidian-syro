import * as RandomProviderModule from "src/util/RandomNumberProvider";
import { StaticRandomNumberProvider } from "src/util/RandomNumberProvider";

const staticRandomNumberProvider = new StaticRandomNumberProvider();

export interface IStaticRandom {
    lower: number;
    upper: number;
    next: number;
}

export function setupNextRandomNumber(info: IStaticRandom) {
    staticRandomNumberProvider.expectedLowerBound = info.lower;
    staticRandomNumberProvider.expectedUpperBound = info.upper;
    staticRandomNumberProvider.next = info.next;
}

export function setupStaticRandomNumberProvider() {
    (
        RandomProviderModule as unknown as {
            globalRandomNumberProvider: StaticRandomNumberProvider;
        }
    ).globalRandomNumberProvider = staticRandomNumberProvider;
}
