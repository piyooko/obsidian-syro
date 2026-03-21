import * as DateProviderModule from "src/util/DateProvider";
import { DateUtil, StaticDateProvider } from "src/util/DateProvider";

const ORIGIN_DATE = "2023-09-06";

export function setupStaticDateProvider(dateStr: string) {
    (
        DateProviderModule as unknown as { globalDateProvider: StaticDateProvider }
    ).globalDateProvider = StaticDateProvider.fromDateStr(dateStr);
}

export function setupStaticDateProvider_OriginDatePlusDays(days: number) {
    const simulatedDate = DateUtil.dateStrToMoment(ORIGIN_DATE).add(days, "d");
    (
        DateProviderModule as unknown as { globalDateProvider: StaticDateProvider }
    ).globalDateProvider = new StaticDateProvider(simulatedDate);
}

export function setupStaticDateProvider_20230906() {
    setupStaticDateProvider(ORIGIN_DATE);
}
