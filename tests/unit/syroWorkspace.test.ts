import { createDeckOptionsStoreSnapshot } from "src/dataStore/deckOptionsStore";
import { DEFAULT_SETTINGS } from "src/settings";
import { SyroWorkspace } from "src/dataStore/syroWorkspace";

type MockAdapter = {
    basePath: string;
    exists: jest.Mock<Promise<boolean>, [string]>;
    list: jest.Mock<Promise<{ files: string[]; folders: string[] }>, [string]>;
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
        list: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            const prefix = normalized ? `${normalized}/` : "";
            const folderSet = new Set<string>();
            const fileList: string[] = [];

            for (const directory of directories) {
                if (!directory.startsWith(prefix) || directory === normalized) {
                    continue;
                }
                const rest = directory.slice(prefix.length);
                if (rest.length === 0 || rest.includes("/")) {
                    continue;
                }
                folderSet.add(directory);
            }

            for (const filePath of files.keys()) {
                if (!filePath.startsWith(prefix)) {
                    continue;
                }
                const rest = filePath.slice(prefix.length);
                if (rest.length === 0 || rest.includes("/")) {
                    continue;
                }
                fileList.push(filePath);
            }

            return {
                files: fileList.sort(),
                folders: Array.from(folderSet).sort(),
            };
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

function createValidNotesPayload(): string {
    return JSON.stringify({
        version: 1,
        nextItemId: 1,
        items: {},
    });
}

function createValidDeckOptionsPayload(): string {
    return JSON.stringify(createDeckOptionsStoreSnapshot(DEFAULT_SETTINGS).state);
}

function createValidDeviceMetadata(options: {
    deviceId: string;
    deviceName: string;
    shortDeviceId: string;
    createdAt?: string;
    updatedAt?: string;
    lastSeenAt?: string;
    baselineFromDeviceId?: string | null;
    baselineBuiltAt?: string | null;
    importedSessionIds?: string[];
    importedSessionRetentionUntil?: Record<string, string>;
}): string {
    return JSON.stringify(
        {
            version: 1,
            deviceId: options.deviceId,
            deviceName: options.deviceName,
            shortDeviceId: options.shortDeviceId,
            createdAt: options.createdAt ?? "2026-04-12T00:00:00.000Z",
            updatedAt: options.updatedAt ?? "2026-04-12T00:00:00.000Z",
            lastSeenAt: options.lastSeenAt ?? "2026-04-13T00:00:00.000Z",
            baselineFromDeviceId: options.baselineFromDeviceId ?? null,
            baselineBuiltAt: options.baselineBuiltAt ?? null,
            importedSessionIds: options.importedSessionIds ?? [],
            importedSessionRetentionUntil: options.importedSessionRetentionUntil ?? {},
        },
        null,
        2,
    );
}

async function addSourceDevice(
    adapter: MockAdapter,
    files: Map<string, string>,
    options: {
        folderName: string;
        deviceId: string;
        deviceName: string;
        shortDeviceId: string;
        lastSeenAt?: string;
    },
): Promise<void> {
    const sourceRoot = `.obsidian/plugins/syro/devices/${options.folderName}`;
    await adapter.mkdir(sourceRoot);
    files.set(
        `${sourceRoot}/device.json`,
        createValidDeviceMetadata({
            deviceId: options.deviceId,
            deviceName: options.deviceName,
            shortDeviceId: options.shortDeviceId,
            lastSeenAt: options.lastSeenAt,
        }),
    );
    files.set(`${sourceRoot}/cards.json`, '{"items":[{"uuid":"card-1"}]}');
    files.set(`${sourceRoot}/notes.json`, createValidNotesPayload());
    files.set(`${sourceRoot}/timeline.json`, '{"note.md":[{"id":"1"}]}');
    files.set(`${sourceRoot}/deck-options.json`, createValidDeckOptionsPayload());
    files.set(
        `${sourceRoot}/settings.json`,
        JSON.stringify({
            version: 1,
            settings: {
                openRandomNote: true,
            },
        }),
    );
    files.set(
        `${sourceRoot}/tracking-rules.json`,
        JSON.stringify({
            version: 1,
            rules: {
                inbox: {
                    track: true,
                    autoTag: true,
                    tags: ["#inbox"],
                    ownedTagsByPath: {},
                    excludedPaths: [],
                },
            },
            tombstones: {},
        }),
    );
    files.set(
        `${sourceRoot}/daily-state.json`,
        JSON.stringify({
            version: 1,
            buryDate: "2026-04-13",
            buryList: ["note-a"],
            dailyDeckStats: {
                date: "2026-04-13",
                counts: {
                    default: {
                        new: 1,
                        review: 2,
                    },
                },
            },
        }),
    );
    files.set(
        `${sourceRoot}/note-cache.json`,
        JSON.stringify({
            version: 1,
            items: [{ path: "note.md" }],
        }),
    );
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

    it("initializes the flattened syro tree and persists the current device identity", async () => {
        const { adapter, files, directories } = createMockAdapter();

        const startup = await createWorkspace(adapter).initialize();
        const layout = startup.layout;

        expect(startup.startupDecision).toBe("ready");
        expect(layout.device.deviceId).toBe("d84f1111-2222-3333-4444-555555555555");
        expect(layout.device.shortDeviceId).toBe("d84f");
        expect(layout.deviceRoot).toBe(".obsidian/plugins/syro/devices/Desktop--d84f");
        expect(layout.cardsPath).toBe(".obsidian/plugins/syro/devices/Desktop--d84f/cards.json");
        expect(layout.cardsOverlayPath).toBe(
            ".obsidian/plugins/syro/devices/Desktop--d84f/cards.review_overlay.json",
        );
        expect(layout.noteCachePath).toBe(
            ".obsidian/plugins/syro/devices/Desktop--d84f/note-cache.json",
        );
        expect(layout.activeSessionBufferPath).toBe(
            ".obsidian/plugins/syro/sessions/open/Desktop--d84f.open.jsonl",
        );
        expect(directories.has(".obsidian/plugins/syro/devices/Desktop--d84f")).toBe(true);
        expect(directories.has(".obsidian/plugins/syro/sessions/open")).toBe(true);

        const savedDeviceMeta = JSON.parse(
            files.get(".obsidian/plugins/syro/devices/Desktop--d84f/device.json") ?? "{}",
        );
        expect(savedDeviceMeta.deviceName).toBe("Desktop");
        expect(savedDeviceMeta.importedSessionIds).toEqual([]);
        expect(savedDeviceMeta.importedSessionRetentionUntil).toEqual({});

        const repeated = await createWorkspace(adapter).initialize();
        expect(repeated.layout.deviceRoot).toBe(layout.deviceRoot);
        expect(repeated.startupDecision).toBe("ready");
    });

    it("creates backup plus migration marker only after generated files validate", async () => {
        const { adapter, files, directories } = createMockAdapter();
        files.set(".obsidian/plugins/syro/data.json", '{"settings":{"openRandomNote":true}}');
        files.set(".obsidian/plugins/syro/tracked_files.json", '{"items":[]}');
        files.set(".obsidian/plugins/syro/review_notes.json", createValidNotesPayload());
        files.set(".obsidian/plugins/syro/review_commits.json", '{"note.md":[{"id":"1"}]}');
        files.set(
            ".obsidian/plugins/syro/tracked_files.review_overlay.json",
            '{"items":[{"id":1}]}',
        );
        files.set(".obsidian/plugins/syro/note_cache.json", '{"items":[{"path":"note.md"}]}');

        const startup = await createWorkspace(adapter).initialize();
        const layout = startup.layout;

        expect(startup.startupDecision).toBe("ready");
        expect(files.get(layout.cardsPath)).toBe('{"items":[]}');
        expect(files.get(layout.notesPath)).toBe(createValidNotesPayload());
        expect(files.get(layout.timelinePath)).toBe('{"note.md":[{"id":"1"}]}');
        expect(files.get(layout.cardsOverlayPath)).toBe('{"items":[{"id":1}]}');
        expect(files.get(layout.noteCachePath)).toBe('{"items":[{"path":"note.md"}]}');
        expect(JSON.parse(files.get(layout.deckOptionsPath) ?? "{}")).toEqual(
            JSON.parse(createValidDeckOptionsPayload()),
        );

        const backupMetaPath = Array.from(files.keys()).find((path) =>
            path.endsWith("/meta.json"),
        );
        expect(backupMetaPath).toBeDefined();
        expect(backupMetaPath).toContain(".obsidian/plugins/syro/migration-backups/");
        expect(files.get(backupMetaPath!)).toContain('"sourceVersion": "0.0.11"');
        expect(
            files.get(
                backupMetaPath!.replace("/meta.json", "/deck-options.settings-snapshot.json"),
            ),
        ).toContain('"deckOptionsPresets"');
        expect(files.get(backupMetaPath!.replace("/meta.json", "/data.json"))).toContain(
            '"openRandomNote":true',
        );
    });

    it("migrates compatibility local-state and legacy session roots into the new tree", async () => {
        const { adapter, files, directories } = createMockAdapter();
        files.set(".obsidian/plugins/syro/data.json", '{"settings":{"openRandomNote":true}}');
        files.set(".obsidian/plugins/syro/tracked_files.json", '{"items":[]}');
        files.set(".obsidian/plugins/syro/review_notes.json", createValidNotesPayload());
        files.set(".obsidian/plugins/syro/review_commits.json", '{"note.md":[{"id":"1"}]}');
        files.set(
            ".obsidian/plugins/syro/tracked_files.review_overlay.json",
            '{"items":[{"id":"legacy-overlay"}]}',
        );
        files.set(
            ".obsidian/plugins/syro/local-state/cards.review_overlay.json",
            '{"items":[{"id":"compat-overlay"}]}',
        );
        files.set(
            ".obsidian/plugins/syro/local-state/active-session-buffer.jsonl",
            '{"version":1,"sessionId":"open-1","opId":"op-1"}\n',
        );
        files.set(
            ".obsidian/plugins/syro/sessions/2026-04-12T15-30-12__d84f__0001.jsonl",
            '{"version":1,"sessionId":"closed-1","opId":"op-1"}\n',
        );
        files.set(
            ".obsidian/plugins/syro/sessions-archive/d84f__2026-04.sessionpack.gz",
            "gzip-bytes",
        );
        directories.add(".obsidian/plugins/syro/local-state");
        directories.add(".obsidian/plugins/syro/sessions-archive");

        const startup = await createWorkspace(adapter).initialize();
        const layout = startup.layout;

        expect(startup.startupDecision).toBe("ready");
        expect(files.get(layout.cardsOverlayPath)).toBe('{"items":[{"id":"compat-overlay"}]}');
        expect(files.get(layout.activeSessionBufferPath)).toBe(
            '{"version":1,"sessionId":"open-1","opId":"op-1"}\n',
        );
        expect(
            files.get(
                ".obsidian/plugins/syro/sessions/closed/2026-04-12T15-30-12__d84f__0001.jsonl",
            ),
        ).toBe('{"version":1,"sessionId":"closed-1","opId":"op-1"}\n');
        expect(
            files.get(".obsidian/plugins/syro/sessions/archive/d84f__2026-04.sessionpack.gz"),
        ).toBe("gzip-bytes");
    });

    it("enters read-only and skips the marker when migration validation fails", async () => {
        const { adapter, files } = createMockAdapter();
        files.set(".obsidian/plugins/syro/tracked_files.json", '{"items":[]}');
        files.set(".obsidian/plugins/syro/review_notes.json", '{"items":{"note.md":{}}}');

        const startup = await createWorkspace(adapter).initialize();

        expect(startup.startupDecision).toBe("read-only");
        expect(startup.readOnlyReason).toContain("Invalid formal file schema");
    });

    it("requires baseline when another valid device exists and the current device has not joined yet", async () => {
        const { adapter, files } = createMockAdapter();
        await addSourceDevice(adapter, files, {
            folderName: "Mobile--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Mobile",
            shortDeviceId: "91ac",
        });

        const workspace = createWorkspace(adapter);
        const startup = await workspace.initialize();

        expect(startup.startupDecision).toBe("baseline-required");
        expect(startup.candidates).toHaveLength(1);
        expect(startup.recommendedSourceDeviceId).toBe("91ac1111-2222-3333-4444-555555555555");

        const layout = await workspace.completeBaselineJoin({
            deviceName: "Tablet",
            sourceDeviceId: "91ac1111-2222-3333-4444-555555555555",
        });

        expect(layout.device.deviceName).toBe("Tablet");
        expect(layout.device.baselineFromDeviceId).toBe("91ac1111-2222-3333-4444-555555555555");
        expect(layout.device.baselineBuiltAt).toBeTruthy();
        expect(layout.device.importedSessionIds).toEqual([]);
        expect(layout.device.importedSessionRetentionUntil).toEqual({});
        expect(files.get(layout.cardsPath)).toBe('{"items":[{"uuid":"card-1"}]}');
        expect(JSON.parse(files.get(layout.deckOptionsPath) ?? "{}")).toEqual(
            JSON.parse(createValidDeckOptionsPayload()),
        );
        expect(JSON.parse(files.get(layout.settingsPath) ?? "{}")).toEqual(
            expect.objectContaining({
                version: 1,
                settings: expect.objectContaining({
                    openRandomNote: true,
                }),
            }),
        );
        expect(JSON.parse(files.get(layout.trackingRulesPath) ?? "{}")).toEqual(
            expect.objectContaining({
                version: 1,
                rules: expect.objectContaining({
                    inbox: expect.objectContaining({
                        track: true,
                    }),
                }),
            }),
        );
        expect(JSON.parse(files.get(layout.dailyStatePath) ?? "{}")).toEqual(
            expect.objectContaining({
                version: 1,
                buryDate: "2026-04-13",
            }),
        );
        expect(JSON.parse(files.get(layout.noteCachePath) ?? "{}")).toEqual(
            expect.objectContaining({
                version: 1,
            }),
        );
    });

    it("requires rebuild when the current device is stale and a fresher peer exists", async () => {
        const { adapter, files } = createMockAdapter();
        const workspace = createWorkspace(adapter);
        const initial = await workspace.initialize();

        files.set(
            normalizePath(initial.layout.deviceMetaPath),
            createValidDeviceMetadata({
                deviceId: initial.layout.device.deviceId,
                deviceName: initial.layout.device.deviceName,
                shortDeviceId: initial.layout.device.shortDeviceId,
                createdAt: "2026-03-01T00:00:00.000Z",
                updatedAt: "2026-03-01T00:00:00.000Z",
                lastSeenAt: "2026-03-01T00:00:00.000Z",
            }),
        );

        await addSourceDevice(adapter, files, {
            folderName: "Mobile--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Mobile",
            shortDeviceId: "91ac",
            lastSeenAt: "2026-04-13T00:00:00.000Z",
        });

        const rebuiltStartup = await createWorkspace(adapter).initialize();
        expect(rebuiltStartup.startupDecision).toBe("rebuild-required");
        expect(rebuiltStartup.recommendedSourceDeviceId).toBe(
            "91ac1111-2222-3333-4444-555555555555",
        );
    });

    it("enters read-only when the persisted current device file becomes invalid", async () => {
        const { adapter, files } = createMockAdapter();
        const workspace = createWorkspace(adapter);
        const initial = await workspace.initialize();

        files.set(normalizePath(initial.layout.deviceMetaPath), "{broken");

        const startup = await createWorkspace(adapter).initialize();
        expect(startup.startupDecision).toBe("read-only");
        expect(startup.readOnlyReason).toContain("device.json");
    });
});
