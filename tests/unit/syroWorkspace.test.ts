import { DEFAULT_SETTINGS } from "src/settings";
import { SyroWorkspace } from "src/dataStore/syroWorkspace";

type MockAdapter = {
    basePath: string;
    exists: jest.Mock<Promise<boolean>, [string]>;
    mkdir: jest.Mock<Promise<void>, [string]>;
    read: jest.Mock<Promise<string>, [string]>;
    write: jest.Mock<Promise<void>, [string, string]>;
};

function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/g, "");
}

function createMockAdapter() {
    const files = new Map<string, string>();
    const directories = new Set<string>([
        ".obsidian",
        ".obsidian/plugins",
        ".obsidian/plugins/syro",
    ]);

    const ensureParentDirectories = (path: string): void => {
        const parts = normalizePath(path)
            .split("/")
            .filter((part) => part.length > 0);
        let current = "";
        for (let index = 0; index < Math.max(0, parts.length - 1); index++) {
            current = current ? `${current}/${parts[index]}` : parts[index];
            directories.add(current);
        }
    };

    const adapter: MockAdapter = {
        basePath: "C:/Vaults/Syro",
        exists: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            return files.has(normalized) || directories.has(normalized);
        }),
        mkdir: jest.fn(async (path: string) => {
            directories.add(normalizePath(path));
        }),
        read: jest.fn(async (path: string) => files.get(normalizePath(path)) ?? ""),
        write: jest.fn(async (path: string, value: string) => {
            const normalized = normalizePath(path);
            ensureParentDirectories(normalized);
            files.set(normalized, value);
        }),
    };

    return { adapter, files, directories };
}

describe("SyroWorkspace", () => {
    const manifestDir = ".obsidian/plugins/syro";
    const originalCrypto = globalThis.crypto;

    beforeEach(() => {
        window.localStorage.clear();
        if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
            jest.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
                "d84f1111-2222-3333-4444-555555555555",
            );
        } else {
            Object.defineProperty(globalThis, "crypto", {
                configurable: true,
                value: {
                    randomUUID: () => "d84f1111-2222-3333-4444-555555555555",
                    getRandomValues: (buffer: Uint8Array) => buffer,
                },
            });
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
        window.localStorage.clear();
        Object.defineProperty(globalThis, "crypto", {
            configurable: true,
            value: originalCrypto,
        });
    });

    function createWorkspace(adapter: MockAdapter): SyroWorkspace {
        return new SyroWorkspace(
            {
                vault: {
                    adapter,
                    getName: () => "SyroVault",
                },
            } as any,
            manifestDir,
            DEFAULT_SETTINGS,
        );
    }

    it("initializes the syro tree and persists the current device identity", async () => {
        const { adapter, files, directories } = createMockAdapter();

        const layout = await createWorkspace(adapter).initialize();

        expect(layout.device.deviceId).toBe("d84f1111-2222-3333-4444-555555555555");
        expect(layout.device.shortDeviceId).toBe("d84f");
        expect(layout.deviceRoot).toBe(".obsidian/plugins/syro/syro/devices/Desktop--d84f");
        expect(layout.cardsPath).toBe(
            ".obsidian/plugins/syro/syro/devices/Desktop--d84f/cards.json",
        );
        expect(layout.cardsOverlayPath).toBe(
            ".obsidian/plugins/syro/local-state/Desktop--d84f/cards.review_overlay.json",
        );
        expect(layout.noteCachePath).toBe(
            ".obsidian/plugins/syro/local-state/Desktop--d84f/note_cache.json",
        );
        expect(directories.has(".obsidian/plugins/syro/syro/devices/Desktop--d84f")).toBe(true);
        expect(directories.has(".obsidian/plugins/syro/local-state/Desktop--d84f")).toBe(true);

        const savedDeviceMeta = JSON.parse(
            files.get(".obsidian/plugins/syro/syro/devices/Desktop--d84f/device.json") ?? "{}",
        );
        expect(savedDeviceMeta.deviceName).toBe("Desktop");
        expect(savedDeviceMeta.importedSessionIds).toEqual([]);

        const repeatedLayout = await createWorkspace(adapter).initialize();
        expect(repeatedLayout.deviceRoot).toBe(layout.deviceRoot);
        expect(adapter.write).toHaveBeenCalledWith(
            ".obsidian/plugins/syro/syro/devices/Desktop--d84f/device.json",
            expect.any(String),
        );
    });

    it("copies legacy cards, notes, timeline, overlay, and cache files into the new layout", async () => {
        const { adapter, files } = createMockAdapter();
        files.set(".obsidian/plugins/syro/tracked_files.json", '{"items":[1]}');
        files.set(".obsidian/plugins/syro/review_notes.json", '{"items":{"note.md":{}}}');
        files.set(".obsidian/plugins/syro/review_commits.json", '{"note.md":[{"id":"1"}]}');
        files.set(
            ".obsidian/plugins/syro/tracked_files.review_overlay.json",
            '{"items":[{"id":1}]}',
        );
        files.set(".obsidian/plugins/syro/note_cache.json", '{"items":[{"path":"note.md"}]}');

        const layout = await createWorkspace(adapter).initialize();

        expect(files.get(layout.cardsPath)).toBe('{"items":[1]}');
        expect(files.get(layout.notesPath)).toBe('{"items":{"note.md":{}}}');
        expect(files.get(layout.timelinePath)).toBe('{"note.md":[{"id":"1"}]}');
        expect(files.get(layout.cardsOverlayPath)).toBe('{"items":[{"id":1}]}');
        expect(files.get(layout.noteCachePath)).toBe('{"items":[{"path":"note.md"}]}');
        expect(files.get(".obsidian/plugins/syro/tracked_files.json")).toBe('{"items":[1]}');
    });

    it("creates a copy-only migration backup and writes a one-time migration marker", async () => {
        const { adapter, files } = createMockAdapter();
        files.set(".obsidian/plugins/syro/tracked_files.json", '{"items":[1]}');
        files.set(".obsidian/plugins/syro/review_notes.json", '{"items":{"note.md":{}}}');

        const layout = await createWorkspace(adapter).initialize();
        const backupMetaPath = Array.from(files.keys()).find((path) =>
            path.endsWith("/meta.json"),
        );

        expect(backupMetaPath).toBeDefined();
        expect(backupMetaPath).toContain(".obsidian/plugins/syro/migration-backups/");
        expect(files.get(backupMetaPath!)).toContain('"sourceVersion": "0.0.11"');
        expect(files.get(layout.migrationStatePath)).toContain('"targetVersion": "0.0.12"');

        await createWorkspace(adapter).initialize();
        expect(
            Array.from(files.keys()).filter((path) => path.endsWith("/meta.json") && path.includes("/migration-backups/")),
        ).toHaveLength(1);
    });
});
