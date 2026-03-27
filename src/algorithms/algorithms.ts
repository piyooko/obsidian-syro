import { MiscUtils } from "src/util/utils_recall";
import { RepetitionItem, ReviewResult } from "src/dataStore/repetitionItem";

export abstract class SrsAlgorithm<TSettings extends object = object> {
    settings: TSettings;

    updateSettings(settings: unknown): void {
        const normalizedSettings: Partial<TSettings> | undefined =
            typeof settings === "object" && settings !== null
                ? (settings as Partial<TSettings>)
                : undefined;
        this.settings = MiscUtils.assignOnly(this.defaultSettings(), normalizedSettings);
    }

    abstract defaultSettings(): TSettings;
    abstract defaultData(): object;
    abstract onSelection(item: RepetitionItem, option: string, repeat: boolean): ReviewResult;
    abstract calcAllOptsIntervals(item: RepetitionItem): number[];
    abstract srsOptions(): string[];
    abstract displaySettings(
        containerEl: HTMLElement,
        update: (settings: TSettings, refresh?: boolean) => void,
    ): void;
}
