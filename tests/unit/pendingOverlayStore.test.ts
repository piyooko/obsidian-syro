import {
    createPendingDailyStateSection,
    PendingOverlayStore,
} from "src/dataStore/pendingOverlayStore";

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/g, "");
}

function createMockAdapter(options: { failWrites?: number } = {}) {
    const files = new Map<string, string>();
    let remainingFailures = options.failWrites ?? 0;

    const adapter = {
        exists: jest.fn(async (path: string) => files.has(normalizePath(path))),
        read: jest.fn(async (path: string) => files.get(normalizePath(path)) ?? ""),
        write: jest.fn(async (path: string, value: string) => {
            if (remainingFailures > 0) {
                remainingFailures -= 1;
                throw new Error("write failed");
            }

            files.set(normalizePath(path), value);
        }),
    };

    return {
        adapter,
        files,
    };
}

function createDailyStateSection() {
    return createPendingDailyStateSection({
        commitId: "daily-state:test",
        buryDate: "2026-04-18",
        buryList: [],
        dailyDeckStats: {
            date: "2026-04-18",
            counts: {
                "归档": {
                    new: 20,
                    review: 5,
                },
            },
        },
        deviceReviewCount: 5,
    });
}

describe("PendingOverlayStore lifecycle", () => {
    test("dispose stops scheduled retry writes", async () => {
        jest.useFakeTimers();
        try {
            const { adapter } = createMockAdapter({ failWrites: 1 });
            const store = new PendingOverlayStore({
                adapter,
                path: ".obsidian/plugins/syro/devices/Desktop--70ad/pending.overlay.json",
                logWarn: jest.fn(),
            });

            store.stageDailyStateSection(createDailyStateSection());
            store.requestFlush();
            await jest.advanceTimersByTimeAsync(0);

            expect(adapter.write).toHaveBeenCalledTimes(1);

            store.dispose();
            await jest.advanceTimersByTimeAsync(5000);

            expect(adapter.write).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });

    test("dispose prevents later requestFlush from writing stale path", async () => {
        const { adapter } = createMockAdapter();
        const store = new PendingOverlayStore({
            adapter,
            path: ".obsidian/plugins/syro/devices/Desktop--70ad/pending.overlay.json",
            logWarn: jest.fn(),
        });

        store.stageDailyStateSection(createDailyStateSection());
        store.dispose();
        store.requestFlush();
        await Promise.resolve();

        expect(adapter.write).not.toHaveBeenCalled();
        await expect(store.drainFlush()).resolves.toBe(false);
    });

    test("a new store can still write normally after an older store was disposed", async () => {
        const { adapter, files } = createMockAdapter();
        const path = ".obsidian/plugins/syro/devices/Desktop--3606/pending.overlay.json";
        const oldStore = new PendingOverlayStore({
            adapter,
            path,
            logWarn: jest.fn(),
        });
        oldStore.dispose();

        const newStore = new PendingOverlayStore({
            adapter,
            path,
            logWarn: jest.fn(),
        });
        newStore.stageDailyStateSection(createDailyStateSection());

        await expect(newStore.drainFlush()).resolves.toBe(true);
        expect(adapter.write).toHaveBeenCalledTimes(1);
        expect(files.get(normalizePath(path))).toContain("\"dailyState\"");
    });
});
