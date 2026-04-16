import { FsrsAlgorithm } from "src/algorithms/fsrs";

jest.mock("obsidian", () => ({
    Notice: class Notice {
        constructor(_message?: string, _timeout?: number) {}
    },
    Setting: class Setting {},
    Platform: {
        isMobile: false,
    },
    moment: {
        locale: () => "en",
    },
}));

jest.mock("src/dataStore/data", () => ({
    DataStore: {
        instance: {
            dataPath: "/tmp/tracked_files.json",
        },
        getInstance: () => ({
            dataPath: "/tmp/tracked_files.json",
        }),
    },
}));

import { DataStore } from "src/dataStore/data";

describe("FSRS settings compatibility", () => {
    beforeEach(() => {
        (DataStore as any).instance = {
            dataPath: "/tmp/tracked_files.json",
        };
    });

    test("updateSettings silently falls back to defaults for non-current w arrays", () => {
        const algorithm = new FsrsAlgorithm();
        const defaultW = [...algorithm.defaultSettings().w];
        const invalidLegacyW = [
            0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26,
            0.29, 2.61,
        ];

        algorithm.updateSettings({
            w: invalidLegacyW,
        });

        expect(algorithm.settings.w).toEqual(defaultW);
    });

    test("updateSettings keeps valid custom w arrays", () => {
        const algorithm = new FsrsAlgorithm();
        const customW = algorithm.defaultSettings().w.map((value, index) => value + index * 0.01);

        algorithm.updateSettings({
            w: customW,
        });

        expect(algorithm.settings.w).toEqual(customW);
    });

    test("updateSettings backfills official learning step defaults when missing", () => {
        const algorithm = new FsrsAlgorithm();

        algorithm.updateSettings({
            learning_steps: undefined,
            relearning_steps: undefined,
        });

        expect(algorithm.settings.learning_steps).toEqual(
            algorithm.defaultSettings().learning_steps,
        );
        expect(algorithm.settings.relearning_steps).toEqual(
            algorithm.defaultSettings().relearning_steps,
        );
    });

    test("updateSettings does not require DataStore instance during early startup", () => {
        (DataStore as any).instance = undefined;
        const algorithm = new FsrsAlgorithm();

        expect(() => {
            algorithm.updateSettings({});
        }).not.toThrow();
        expect(algorithm.logfilepath).toBe("ob_revlog.csv");
    });
});
