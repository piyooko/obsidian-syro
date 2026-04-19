import { createHash } from "crypto";
import { createDeckOptionsStoreSnapshot } from "src/dataStore/deckOptionsStore";
import * as Legacy011Migration from "src/dataStore/syroLegacy011Migration";
import { DEFAULT_SETTINGS } from "src/settings";
import { SyroWorkspace } from "src/dataStore/syroWorkspace";
import { sha256Hex } from "src/util/hash";

type MockAdapter = {
    basePath: string;
    exists: jest.Mock<Promise<boolean>, [string]>;
    list: jest.Mock<Promise<{ files: string[]; folders: string[] }>, [string]>;
    mkdir: jest.Mock<Promise<void>, [string]>;
    read: jest.Mock<Promise<string>, [string]>;
    remove: jest.Mock<Promise<void>, [string]>;
    rename: jest.Mock<Promise<void>, [string, string]>;
    rmdir: jest.Mock<Promise<void>, [string, boolean]>;
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

    const moveDirectoryEntries = (fromPath: string, toPath: string): void => {
        const normalizedFrom = normalizePath(fromPath);
        const normalizedTo = normalizePath(toPath);
        const directoryEntries = Array.from(directories)
            .filter((entry) => entry === normalizedFrom || entry.startsWith(`${normalizedFrom}/`))
            .sort((left, right) => left.length - right.length);
        for (const entry of directoryEntries) {
            directories.delete(entry);
        }
        for (const entry of directoryEntries) {
            directories.add(normalizedTo + entry.slice(normalizedFrom.length));
        }

        const fileEntries = Array.from(files.entries()).filter(
            ([path]) => path === normalizedFrom || path.startsWith(`${normalizedFrom}/`),
        );
        for (const [path] of fileEntries) {
            files.delete(path);
        }
        for (const [path, value] of fileEntries) {
            files.set(normalizedTo + path.slice(normalizedFrom.length), value);
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
        remove: jest.fn(async (path: string) => {
            const normalized = normalizePath(path);
            files.delete(normalized);
        }),
        rename: jest.fn(async (fromPath: string, toPath: string) => {
            const normalizedFrom = normalizePath(fromPath);
            const normalizedTo = normalizePath(toPath);
            ensureParentDirectories(normalizedTo);

            if (files.has(normalizedFrom)) {
                const value = files.get(normalizedFrom) ?? "";
                files.delete(normalizedFrom);
                files.set(normalizedTo, value);
                return;
            }

            moveDirectoryEntries(normalizedFrom, normalizedTo);
        }),
        rmdir: jest.fn(async (path: string, recursive: boolean) => {
            const normalized = normalizePath(path);
            if (recursive) {
                const nestedFiles = Array.from(files.keys()).filter(
                    (key) => key === normalized || key.startsWith(`${normalized}/`),
                );
                for (const key of nestedFiles) {
                    files.delete(key);
                }
                const nestedDirs = Array.from(directories).filter(
                    (entry) => entry === normalized || entry.startsWith(`${normalized}/`),
                );
                for (const entry of nestedDirs) {
                    directories.delete(entry);
                }
                return;
            }

            const hasNestedFiles = Array.from(files.keys()).some((key) =>
                key.startsWith(`${normalized}/`),
            );
            const hasNestedDirs = Array.from(directories).some(
                (entry) => entry !== normalized && entry.startsWith(`${normalized}/`),
            );
            if (hasNestedFiles || hasNestedDirs) {
                throw new Error("Directory is not empty.");
            }
            directories.delete(normalized);
        }),
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

function createValidFileIdentitiesPayload(): string {
    return JSON.stringify({
        version: 1,
        entries: {
            "file-91acnote": {
                uuid: "file-91acnote",
                createdAt: "2026-04-12T00:00:00.000Z",
                updatedAt: "2026-04-13T00:00:00.000Z",
                path: "note.md",
                aliases: [],
                deleted: false,
            },
        },
        syncEntities: {},
    });
}

function createValidDeviceMetadata(options: {
    deviceId: string;
    deviceName: string;
    shortDeviceId: string;
    createdAt?: string;
    updatedAt?: string;
    lastSeenAt?: string;
    ownerInstallIdHash?: string | null;
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
            ownerInstallIdHash: options.ownerInstallIdHash ?? null,
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
        ownerInstallIdHash?: string | null;
        deviceReviewCount?: number;
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
            ownerInstallIdHash: options.ownerInstallIdHash ?? null,
        }),
    );
    files.set(`${sourceRoot}/cards.json`, '{"items":[{"uuid":"card-1"}]}');
    files.set(`${sourceRoot}/file-identities.json`, createValidFileIdentitiesPayload());
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
            deviceReviewCount: options.deviceReviewCount ?? 0,
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

function getCurrentDeviceStorageKey(basePath: string, manifestDir: string): string {
    return `syro:current-device:${basePath}:${manifestDir}`;
}

function getInstallInstanceStorageKey(basePath: string, manifestDir: string): string {
    return `syro:install-instance:${basePath}:${manifestDir}`;
}

describe("SyroWorkspace", () => {
    const manifestDir = ".obsidian/plugins/syro";
    const originalCrypto = globalThis.crypto;

    beforeEach(() => {
        window.localStorage.clear();
        Object.defineProperty(globalThis, "crypto", {
            configurable: true,
            value: {
                randomUUID: () => "d84f1111-2222-3333-4444-555555555555",
                getRandomValues:
                    originalCrypto?.getRandomValues ?? ((buffer: Uint8Array) => buffer),
                subtle: originalCrypto?.subtle ?? {
                    digest: async (algorithm: string, data: BufferSource): Promise<ArrayBuffer> => {
                        if (algorithm !== "SHA-256") {
                            throw new Error(`Unsupported digest: ${algorithm}`);
                        }

                        const hash = createHash("sha256");
                        if (data instanceof ArrayBuffer) {
                            hash.update(Buffer.from(data));
                        } else {
                            hash.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
                        }

                        const digest = hash.digest();
                        return digest.buffer.slice(
                            digest.byteOffset,
                            digest.byteOffset + digest.byteLength,
                        );
                    },
                },
            },
        });
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
        const layout = startup.layout!;
        const installState = JSON.parse(
            window.localStorage.getItem(
                getInstallInstanceStorageKey(adapter.basePath, manifestDir),
            ) ?? "{}",
        );
        const ownerInstallIdHash = await sha256Hex(installState.installInstanceId);
        const currentDeviceState = JSON.parse(
            window.localStorage.getItem(
                getCurrentDeviceStorageKey(adapter.basePath, manifestDir),
            ) ?? "{}",
        );

        expect(startup.startupDecision).toBe("ready");
        expect(layout.device.deviceId).toBe("d84f1111-2222-3333-4444-555555555555");
        expect(layout.device.shortDeviceId).toBe("d84f");
        expect(layout.deviceRoot).toBe(".obsidian/plugins/syro/devices/Desktop--d84f");
        expect(layout.cardsPath).toBe(".obsidian/plugins/syro/devices/Desktop--d84f/cards.json");
        expect(layout.fileIdentitiesPath).toBe(
            ".obsidian/plugins/syro/devices/Desktop--d84f/file-identities.json",
        );
        expect(layout.pendingOverlayPath).toBe(
            ".obsidian/plugins/syro/devices/Desktop--d84f/pending.overlay.json",
        );
        expect(layout.noteCachePath).toBe(
            ".obsidian/plugins/syro/devices/Desktop--d84f/note-cache.json",
        );
        expect(layout.currentDeviceSessionsRoot).toBe(
            ".obsidian/plugins/syro/sessions/Desktop--d84f",
        );
        expect(layout.currentDeviceSessionFilePath).toMatch(
            /^\.obsidian\/plugins\/syro\/sessions\/Desktop--d84f\/\d{4}-\d{2}-\d{2}\.session\.jsonl$/,
        );
        expect(directories.has(".obsidian/plugins/syro/devices/Desktop--d84f")).toBe(true);
        expect(directories.has(".obsidian/plugins/syro/sessions/Desktop--d84f")).toBe(true);
        expect(JSON.parse(files.get(layout.cardsPath) ?? "{}")).toMatchObject({
            items: [],
            trackedFiles: {},
            fileOrder: [],
        });
        expect(JSON.parse(files.get(layout.fileIdentitiesPath) ?? "{}")).toEqual({
            version: 1,
            entries: {},
            syncEntities: {},
        });
        expect(JSON.parse(files.get(layout.notesPath) ?? "{}")).toEqual({
            version: 1,
            nextItemId: 1,
            items: {},
            syncEntities: {},
        });
        expect(JSON.parse(files.get(layout.timelinePath) ?? "{}")).toEqual({
            version: 1,
            files: {},
            syncEntities: {},
        });
        expect(JSON.parse(files.get(layout.settingsPath) ?? "{}")).toMatchObject({
            version: 1,
            settings: expect.any(Object),
        });
        expect(JSON.parse(files.get(layout.trackingRulesPath) ?? "{}")).toEqual({
            version: 1,
            rules: {},
            tombstones: {},
        });
        expect(JSON.parse(files.get(layout.dailyStatePath) ?? "{}")).toEqual({
            version: 1,
            buryDate: "",
            buryList: [],
            dailyDeckStats: {
                date: "",
                counts: {},
            },
            deviceReviewCount: 0,
            appliedOpIds: {},
        });
        expect(JSON.parse(files.get(layout.deviceStatePath) ?? "{}")).toMatchObject({
            version: 1,
            settings: expect.any(Object),
            historyDeck: null,
        });
        expect(JSON.parse(files.get(layout.licenseStatePath) ?? "{}")).toEqual({
            version: 1,
            licenseKey: "",
            isPro: false,
            licenseInstallationId: "",
            licenseState: null,
        });
        expect(JSON.parse(files.get(layout.noteCachePath) ?? "{}")).toEqual({
            version: 4,
            signature: "",
            items: [],
        });

        const savedDeviceMeta = JSON.parse(
            files.get(".obsidian/plugins/syro/devices/Desktop--d84f/device.json") ?? "{}",
        );
        expect(savedDeviceMeta.deviceName).toBe("Desktop");
        expect(savedDeviceMeta.ownerInstallIdHash).toBe(ownerInstallIdHash);
        expect(savedDeviceMeta.importedSessionIds).toBeUndefined();
        expect(savedDeviceMeta.importedSessionRetentionUntil).toBeUndefined();
        expect(installState.installInstanceId).toBe("d84f1111-2222-3333-4444-555555555555");
        expect(currentDeviceState.deviceId).toBe("d84f1111-2222-3333-4444-555555555555");
        expect(currentDeviceState.deviceFolderName).toBe("Desktop--d84f");

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
        files.set(".obsidian/plugins/syro/ob_revlog.csv", "date,grade\n");

        const startup = await createWorkspace(adapter).initialize();
        const layout = startup.layout!;

        expect(startup.startupDecision).toBe("ready");
        expect(files.get(layout.cardsPath)).toBe('{"items":[]}');
        expect(files.get(layout.fileIdentitiesPath)).toBe(
            JSON.stringify(
                {
                    version: 1,
                    entries: {},
                    syncEntities: {},
                },
                null,
                2,
            ),
        );
        expect(files.get(layout.notesPath)).toBe(createValidNotesPayload());
        expect(files.get(layout.timelinePath)).toBe('{"note.md":[{"id":"1"}]}');
        expect(JSON.parse(files.get(layout.pendingOverlayPath) ?? "{}")).toEqual({
            version: 3,
            sections: {
                cardsReview: {
                    version: 2,
                    baseMtime: 0,
                    items: [
                        {
                            id: 1,
                            commitId: "legacy-card:1",
                            sessionCommitted: false,
                            sessionOpType: "upsert",
                        },
                    ],
                },
            },
        });
        expect(files.get(layout.noteCachePath)).toBe('{"items":[{"path":"note.md"}]}');
        expect(JSON.parse(files.get(layout.deckOptionsPath) ?? "{}")).toEqual(
            JSON.parse(createValidDeckOptionsPayload()),
        );

        const backupMetaPath = Array.from(files.keys()).find((path) => path.endsWith("/meta.json"));
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
        expect(files.get(backupMetaPath!.replace("/meta.json", "/ob_revlog.csv"))).toBe(
            "date,grade\n",
        );
    });

    it("delegates legacy workspace migration to the 011 migration module", async () => {
        const { adapter, files } = createMockAdapter();
        const migrateSpy = jest.spyOn(Legacy011Migration, "migrateLegacy011WorkspaceFiles");
        files.set(".obsidian/plugins/syro/data.json", '{"settings":{"openRandomNote":true}}');
        files.set(".obsidian/plugins/syro/tracked_files.json", '{"items":[]}');
        files.set(".obsidian/plugins/syro/review_notes.json", createValidNotesPayload());
        files.set(".obsidian/plugins/syro/review_commits.json", '{"note.md":[{"id":"1"}]}');

        const startup = await createWorkspace(adapter).initialize();

        expect(startup.startupDecision).toBe("ready");
        expect(migrateSpy).toHaveBeenCalledTimes(1);
        expect(migrateSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                manifestDir: ".obsidian/plugins/syro",
                layout: expect.objectContaining({
                    cardsPath: ".obsidian/plugins/syro/devices/Desktop--d84f/cards.json",
                }),
            }),
        );
        migrateSpy.mockRestore();
    });

    it("does not treat the 0.0.12 data shell as a legacy migration source", async () => {
        const { adapter, files } = createMockAdapter();
        files.set(
            ".obsidian/plugins/syro/data.json",
            JSON.stringify({
                version: 2,
                schemaVersion: "0.0.12",
                migrations: {
                    syro012: {
                        completedAt: "2026-04-14T06:00:00.000Z",
                        sourceVersion: "0.0.11",
                    },
                },
            }),
        );

        const startup = await createWorkspace(adapter).initialize();

        expect(startup.startupDecision).toBe("ready");
        expect(
            Array.from(files.keys()).some((path) => path.includes("/migration-backups/")),
        ).toBe(false);
    });

    it("skips backing up the 0.0.12 data shell even when other legacy files still need migration", async () => {
        const { adapter, files } = createMockAdapter();
        files.set(
            ".obsidian/plugins/syro/data.json",
            JSON.stringify({
                version: 2,
                schemaVersion: "0.0.12",
                migrations: {
                    syro012: {
                        completedAt: "2026-04-14T06:00:00.000Z",
                        sourceVersion: "0.0.11",
                    },
                },
            }),
        );
        files.set(".obsidian/plugins/syro/tracked_files.json", '{"items":[]}');
        files.set(".obsidian/plugins/syro/review_notes.json", createValidNotesPayload());
        files.set(".obsidian/plugins/syro/review_commits.json", '{"note.md":[{"id":"1"}]}');

        await createWorkspace(adapter).initialize();

        expect(
            Array.from(files.keys()).some(
                (path) =>
                    path.includes("/migration-backups/") && path.endsWith("/tracked_files.json"),
            ),
        ).toBe(true);
        expect(
            Array.from(files.keys()).some(
                (path) => path.includes("/migration-backups/") && path.endsWith("/data.json"),
            ),
        ).toBe(false);
    });

    it("migrates compatibility local-state files but ignores legacy session roots", async () => {
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
        const layout = startup.layout!;

        expect(startup.startupDecision).toBe("ready");
        expect(JSON.parse(files.get(layout.pendingOverlayPath) ?? "{}")).toEqual({
            version: 3,
            sections: {
                cardsReview: {
                    version: 2,
                    baseMtime: 0,
                    items: [
                        {
                            id: "compat-overlay",
                            commitId: "legacy-card:compat-overlay",
                            sessionCommitted: false,
                            sessionOpType: "upsert",
                        },
                    ],
                },
            },
        });
        expect(files.has(layout.currentDeviceSessionFilePath)).toBe(false);
        expect(
            files.has(".obsidian/plugins/syro/sessions/closed/2026-04-12T15-30-12__d84f__0001.jsonl"),
        ).toBe(false);
        expect(files.has(".obsidian/plugins/syro/sessions/archive/d84f__2026-04.sessionpack.gz")).toBe(
            false,
        );
    });

    it("preserves wrapped timeline payloads during legacy migration", async () => {
        const { adapter, files } = createMockAdapter();
        files.set(".obsidian/plugins/syro/data.json", '{"settings":{"openRandomNote":true}}');
        files.set(".obsidian/plugins/syro/tracked_files.json", '{"items":[]}');
        files.set(".obsidian/plugins/syro/review_notes.json", createValidNotesPayload());
        files.set(
            ".obsidian/plugins/syro/review_commits.json",
            '{"version":1,"files":{"note.md":[{"id":"1"}]},"syncEntities":{}}',
        );

        const startup = await createWorkspace(adapter).initialize();
        const layout = startup.layout!;

        expect(startup.startupDecision).toBe("ready");
        expect(files.get(layout.timelinePath)).toBe(
            '{"version":1,"files":{"note.md":[{"id":"1"}]},"syncEntities":{}}',
        );
    });

    it("enters read-only and skips the marker when migration validation fails", async () => {
        const { adapter, files } = createMockAdapter();
        files.set(".obsidian/plugins/syro/tracked_files.json", '{"items":[]}');
        files.set(".obsidian/plugins/syro/review_notes.json", '{"items":{"note.md":{}}}');

        const startup = await createWorkspace(adapter).initialize();

        expect(startup.startupDecision).toBe("read-only");
        expect(startup.readOnlyReason).toContain("Invalid formal file schema");
    });

    it("returns select-current-device when the only valid legacy device has no local binding", async () => {
        const { adapter, files, directories } = createMockAdapter();
        await addSourceDevice(adapter, files, {
            folderName: "Mobile--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Mobile",
            shortDeviceId: "91ac",
        });

        const workspace = createWorkspace(adapter);
        const startup = await workspace.initialize();

        expect(startup.startupDecision).toBe("select-current-device");
        expect(startup.layout).toBeNull();
        expect(startup.currentDevice).toBeNull();
        expect(startup.validDevices).toHaveLength(1);
        expect(directories.has(".obsidian/plugins/syro/devices/Desktop--d84f")).toBe(false);
    });

    it("returns select-current-device when a synced device belongs to a different installation", async () => {
        const { adapter, files } = createMockAdapter();
        window.localStorage.setItem(
            getInstallInstanceStorageKey(adapter.basePath, manifestDir),
            JSON.stringify({
                version: 1,
                installInstanceId: "mobile-install",
            }),
        );

        await addSourceDevice(adapter, files, {
            folderName: "Desktop--cd41",
            deviceId: "cd411111-2222-3333-4444-555555555555",
            deviceName: "Desktop",
            shortDeviceId: "cd41",
            ownerInstallIdHash: await sha256Hex("desktop-install"),
        });

        const startup = await createWorkspace(adapter).initialize();

        expect(startup.startupDecision).toBe("select-current-device");
        expect(startup.layout).toBeNull();
        expect(startup.currentDevice).toBeNull();
        expect(startup.validDevices.map((entry) => entry.deviceId)).toEqual([
            "cd411111-2222-3333-4444-555555555555",
        ]);
    });

    it("reads device review counts from daily-state and falls back to zero when missing", async () => {
        const { adapter, files } = createMockAdapter();
        await addSourceDevice(adapter, files, {
            folderName: "Desktop--cd41",
            deviceId: "cd411111-2222-3333-4444-555555555555",
            deviceName: "Desktop",
            shortDeviceId: "cd41",
            deviceReviewCount: 27,
        });
        await addSourceDevice(adapter, files, {
            folderName: "Mobile--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Mobile",
            shortDeviceId: "91ac",
        });
        files.delete(".obsidian/plugins/syro/devices/Mobile--91ac/daily-state.json");

        const startup = await createWorkspace(adapter).initialize();
        const desktop = startup.validDevices.find(
            (entry) => entry.deviceId === "cd411111-2222-3333-4444-555555555555",
        );
        const mobile = startup.validDevices.find(
            (entry) => entry.deviceId === "91ac1111-2222-3333-4444-555555555555",
        );

        expect(desktop?.deviceReviewCount).toBe(27);
        expect(mobile?.deviceReviewCount).toBe(0);
    });

    it("returns select-current-device when multiple valid devices exist and the current pointer is missing", async () => {
        const { adapter, files, directories } = createMockAdapter();
        await addSourceDevice(adapter, files, {
            folderName: "Desktop--cd41",
            deviceId: "cd411111-2222-3333-4444-555555555555",
            deviceName: "Desktop",
            shortDeviceId: "cd41",
            lastSeenAt: "2026-04-13T00:00:00.000Z",
        });
        await addSourceDevice(adapter, files, {
            folderName: "Mobile--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Mobile",
            shortDeviceId: "91ac",
            lastSeenAt: "2026-04-12T00:00:00.000Z",
        });
        directories.add(".obsidian/plugins/syro/devices/Desktop--ec3c");
        files.set(
            ".obsidian/plugins/syro/devices/Desktop--ec3c/settings.json",
            JSON.stringify({ version: 1, settings: {} }),
        );
        files.set(
            ".obsidian/plugins/syro/devices/Desktop--ec3c/daily-state.json",
            JSON.stringify({
                version: 1,
                buryDate: "2026-04-13",
                buryList: [],
                dailyDeckStats: {
                    date: "2026-04-13",
                    counts: {},
                },
                deviceReviewCount: 9,
                appliedOpIds: {},
            }),
        );

        const workspace = createWorkspace(adapter);
        const startup = await workspace.initialize();

        expect(startup.startupDecision).toBe("select-current-device");
        expect(startup.layout).toBeNull();
        expect(startup.validDevices).toHaveLength(2);
        expect(startup.invalidDevices).toEqual([
            expect.objectContaining({
                deviceFolderName: "Desktop--ec3c",
                reason: "missing-device-json",
                deviceReviewCount: 9,
                lastSeenAt: null,
            }),
        ]);
        expect(startup.candidates.map((entry) => entry.deviceId)).toEqual([
            "cd411111-2222-3333-4444-555555555555",
            "91ac1111-2222-3333-4444-555555555555",
        ]);
        expect(directories.has(".obsidian/plugins/syro/devices/Desktop--d84f")).toBe(false);
    });

    it("prefers a unique owner-install hash match and repairs the local pointer", async () => {
        const { adapter, files } = createMockAdapter();
        window.localStorage.setItem(
            getInstallInstanceStorageKey(adapter.basePath, manifestDir),
            JSON.stringify({
                version: 1,
                installInstanceId: "tablet-install",
            }),
        );

        const ownerInstallIdHash = await sha256Hex("tablet-install");
        await addSourceDevice(adapter, files, {
            folderName: "Tablet--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Tablet",
            shortDeviceId: "91ac",
            ownerInstallIdHash,
        });
        await addSourceDevice(adapter, files, {
            folderName: "Desktop--cd41",
            deviceId: "cd411111-2222-3333-4444-555555555555",
            deviceName: "Desktop",
            shortDeviceId: "cd41",
            ownerInstallIdHash: await sha256Hex("desktop-install"),
        });

        const startup = await createWorkspace(adapter).initialize();
        const currentDeviceState = JSON.parse(
            window.localStorage.getItem(
                getCurrentDeviceStorageKey(adapter.basePath, manifestDir),
            ) ?? "{}",
        );

        expect(startup.startupDecision).toBe("ready");
        expect(startup.currentDevice?.deviceId).toBe("91ac1111-2222-3333-4444-555555555555");
        expect(currentDeviceState).toEqual({
            version: 1,
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceFolderName: "Tablet--91ac",
        });
    });

    it("migrates a legacy pointer by hydrating ownerInstallIdHash", async () => {
        const { adapter, files } = createMockAdapter();
        window.localStorage.setItem(
            getInstallInstanceStorageKey(adapter.basePath, manifestDir),
            JSON.stringify({
                version: 1,
                installInstanceId: "legacy-install",
            }),
        );
        window.localStorage.setItem(
            getCurrentDeviceStorageKey(adapter.basePath, manifestDir),
            JSON.stringify({
                version: 1,
                deviceId: "91ac1111-2222-3333-4444-555555555555",
                deviceFolderName: "Mobile--91ac",
            }),
        );

        await addSourceDevice(adapter, files, {
            folderName: "Mobile--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Mobile",
            shortDeviceId: "91ac",
        });

        const startup = await createWorkspace(adapter).initialize();
        const migratedMeta = JSON.parse(
            files.get(".obsidian/plugins/syro/devices/Mobile--91ac/device.json") ?? "{}",
        );

        expect(startup.startupDecision).toBe("ready");
        expect(startup.currentDevice?.deviceId).toBe("91ac1111-2222-3333-4444-555555555555");
        expect(migratedMeta.ownerInstallIdHash).toBe(await sha256Hex("legacy-install"));
    });

    it("ignores a polluted pointer when another device uniquely matches the owner-install hash", async () => {
        const { adapter, files } = createMockAdapter();
        window.localStorage.setItem(
            getInstallInstanceStorageKey(adapter.basePath, manifestDir),
            JSON.stringify({
                version: 1,
                installInstanceId: "phone-install",
            }),
        );
        window.localStorage.setItem(
            getCurrentDeviceStorageKey(adapter.basePath, manifestDir),
            JSON.stringify({
                version: 1,
                deviceId: "cd411111-2222-3333-4444-555555555555",
                deviceFolderName: "Desktop--cd41",
            }),
        );

        await addSourceDevice(adapter, files, {
            folderName: "Desktop--cd41",
            deviceId: "cd411111-2222-3333-4444-555555555555",
            deviceName: "Desktop",
            shortDeviceId: "cd41",
            ownerInstallIdHash: await sha256Hex("desktop-install"),
        });
        await addSourceDevice(adapter, files, {
            folderName: "Phone--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Phone",
            shortDeviceId: "91ac",
            ownerInstallIdHash: await sha256Hex("phone-install"),
        });

        const startup = await createWorkspace(adapter).initialize();
        const currentDeviceState = JSON.parse(
            window.localStorage.getItem(
                getCurrentDeviceStorageKey(adapter.basePath, manifestDir),
            ) ?? "{}",
        );

        expect(startup.startupDecision).toBe("ready");
        expect(startup.currentDevice?.deviceId).toBe("91ac1111-2222-3333-4444-555555555555");
        expect(currentDeviceState.deviceId).toBe("91ac1111-2222-3333-4444-555555555555");
    });

    it("can still create a new baseline device from an existing source", async () => {
        const { adapter, files } = createMockAdapter();
        await addSourceDevice(adapter, files, {
            folderName: "Mobile--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Mobile",
            shortDeviceId: "91ac",
        });

        const workspace = createWorkspace(adapter);
        const layout = await workspace.completeBaselineJoin({
            deviceName: "Tablet",
            sourceDeviceId: "91ac1111-2222-3333-4444-555555555555",
        });

        expect(layout.device.deviceName).toBe("Tablet");
        expect(layout.device.baselineFromDeviceId).toBe("91ac1111-2222-3333-4444-555555555555");
        expect(layout.device.baselineBuiltAt).toBeTruthy();
        expect(layout.device.ownerInstallIdHash).toBe(
            await sha256Hex("d84f1111-2222-3333-4444-555555555555"),
        );
        expect(layout.device.importedSessionIds).toBeUndefined();
        expect(layout.device.importedSessionRetentionUntil).toBeUndefined();
        expect(files.get(layout.cardsPath)).toBe('{"items":[{"uuid":"card-1"}]}');
        expect(JSON.parse(files.get(layout.fileIdentitiesPath) ?? "{}")).toEqual(
            JSON.parse(createValidFileIdentitiesPayload()),
        );
        expect(JSON.parse(files.get(layout.deckOptionsPath) ?? "{}")).toEqual(
            JSON.parse(createValidDeckOptionsPayload()),
        );
    });

    it("seeds missing formal baseline files instead of leaving the new device empty", async () => {
        const { adapter, files } = createMockAdapter();
        await addSourceDevice(adapter, files, {
            folderName: "Mobile--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Mobile",
            shortDeviceId: "91ac",
        });
        files.delete(".obsidian/plugins/syro/devices/Mobile--91ac/timeline.json");
        files.delete(".obsidian/plugins/syro/devices/Mobile--91ac/device-state.json");
        files.delete(".obsidian/plugins/syro/devices/Mobile--91ac/license-state.json");

        const workspace = createWorkspace(adapter);
        const layout = await workspace.completeBaselineJoin({
            deviceName: "Tablet",
            sourceDeviceId: "91ac1111-2222-3333-4444-555555555555",
        });

        expect(JSON.parse(files.get(layout.timelinePath) ?? "{}")).toEqual({
            version: 1,
            files: {},
            syncEntities: {},
        });
        expect(JSON.parse(files.get(layout.deviceStatePath) ?? "{}")).toMatchObject({
            version: 1,
            settings: expect.any(Object),
            historyDeck: null,
        });
        expect(JSON.parse(files.get(layout.licenseStatePath) ?? "{}")).toEqual({
            version: 1,
            licenseKey: "",
            isPro: false,
            licenseInstallationId: "",
            licenseState: null,
        });
        expect(files.has(".obsidian/plugins/syro/devices/Tablet--d84f/device.json")).toBe(true);
    });

    it("cleans up the provisional device directory when baseline creation fails", async () => {
        const { adapter, files, directories } = createMockAdapter();
        await addSourceDevice(adapter, files, {
            folderName: "Mobile--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Mobile",
            shortDeviceId: "91ac",
        });
        files.set(".obsidian/plugins/syro/devices/Mobile--91ac/cards.json", '{"trackedFiles":5}');

        const workspace = createWorkspace(adapter);

        await expect(
            workspace.completeBaselineJoin({
                deviceName: "Tablet",
                sourceDeviceId: "91ac1111-2222-3333-4444-555555555555",
            }),
        ).rejects.toThrow();
        expect(directories.has(".obsidian/plugins/syro/devices/Tablet--d84f")).toBe(false);
        expect(files.has(".obsidian/plugins/syro/devices/Tablet--d84f/device.json")).toBe(false);
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
                ownerInstallIdHash: initial.layout.device.ownerInstallIdHash,
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

    it("cleans up the provisional device directory when rebuild fails", async () => {
        const { adapter, files, directories } = createMockAdapter();
        await addSourceDevice(adapter, files, {
            folderName: "Mobile--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Mobile",
            shortDeviceId: "91ac",
        });
        files.set(".obsidian/plugins/syro/devices/Mobile--91ac/cards.json", '{"trackedFiles":5}');

        const workspace = createWorkspace(adapter);

        await expect(
            workspace.rebuildFromBaseline({
                deviceName: "Tablet",
                sourceDeviceId: "91ac1111-2222-3333-4444-555555555555",
            }),
        ).rejects.toThrow();
        expect(directories.has(".obsidian/plugins/syro/devices/Tablet--d84f")).toBe(false);
        expect(files.has(".obsidian/plugins/syro/devices/Tablet--d84f/device.json")).toBe(false);
    });

    it("rebinds an existing device to the current installation and clears the previous binding", async () => {
        const { adapter, files } = createMockAdapter();
        const workspace = createWorkspace(adapter);
        const initial = await workspace.initialize();

        await addSourceDevice(adapter, files, {
            folderName: "Tablet--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Tablet",
            shortDeviceId: "91ac",
        });

        const adopted = await workspace.adoptExistingDevice("91ac1111-2222-3333-4444-555555555555");
        const adoptedMeta = JSON.parse(files.get(normalizePath(adopted.deviceMetaPath)) ?? "{}");
        const previousMeta = JSON.parse(
            files.get(normalizePath(initial.layout.deviceMetaPath)) ?? "{}",
        );
        const currentDeviceState = JSON.parse(
            window.localStorage.getItem(
                getCurrentDeviceStorageKey(adapter.basePath, manifestDir),
            ) ?? "{}",
        );

        expect(adopted.device.deviceId).toBe("91ac1111-2222-3333-4444-555555555555");
        expect(adoptedMeta.ownerInstallIdHash).toBe(initial.layout.device.ownerInstallIdHash);
        expect(previousMeta.ownerInstallIdHash).toBeNull();
        expect(currentDeviceState.deviceId).toBe("91ac1111-2222-3333-4444-555555555555");

        const repeated = await createWorkspace(adapter).initialize();
        expect(repeated.currentDevice?.deviceId).toBe("91ac1111-2222-3333-4444-555555555555");
    });

    it("enters read-only when multiple devices claim the same installation binding", async () => {
        const { adapter, files } = createMockAdapter();
        window.localStorage.setItem(
            getInstallInstanceStorageKey(adapter.basePath, manifestDir),
            JSON.stringify({
                version: 1,
                installInstanceId: "desktop-install",
            }),
        );

        const ownerInstallIdHash = await sha256Hex("desktop-install");
        await addSourceDevice(adapter, files, {
            folderName: "Desktop--cd41",
            deviceId: "cd411111-2222-3333-4444-555555555555",
            deviceName: "Desktop",
            shortDeviceId: "cd41",
            ownerInstallIdHash,
        });
        await addSourceDevice(adapter, files, {
            folderName: "Desktop--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Desktop Clone",
            shortDeviceId: "91ac",
            ownerInstallIdHash,
        });

        const startup = await createWorkspace(adapter).initialize();

        expect(startup.startupDecision).toBe("read-only");
        expect(startup.readOnlyReason).toContain("Multiple devices are bound to this installation");
        expect(startup.currentDevice).toBeNull();
    });

    it("renames the current device folder and its session directory", async () => {
        const { adapter, files } = createMockAdapter();
        const workspace = createWorkspace(adapter);
        const initial = await workspace.initialize();
        files.set(normalizePath(initial.layout.currentDeviceSessionFilePath), '{"version":1}\n');

        const renamed = await workspace.renameCurrentDevice(initial.layout, "Primary Desktop");

        expect(renamed.device.deviceName).toBe("Primary Desktop");
        expect(renamed.deviceRoot).toBe(".obsidian/plugins/syro/devices/Primary-Desktop--d84f");
        expect(renamed.currentDeviceSessionsRoot).toBe(
            ".obsidian/plugins/syro/sessions/Primary-Desktop--d84f",
        );
        expect(files.get(normalizePath(renamed.currentDeviceSessionFilePath))).toBe('{"version":1}\n');
        expect(files.has(normalizePath(initial.layout.currentDeviceSessionFilePath))).toBe(false);
        expect(
            JSON.parse(files.get(normalizePath(renamed.deviceMetaPath)) ?? "{}").deviceName,
        ).toBe("Primary Desktop");
    });

    it("overwrites the current device snapshot from another device while keeping the current identity", async () => {
        const { adapter, files } = createMockAdapter();
        const workspace = createWorkspace(adapter);
        const startup = await workspace.initialize();

        files.set(normalizePath(startup.layout.cardsPath), '{"items":[{"uuid":"local-card"}]}');
        files.set(
            normalizePath(startup.layout.settingsPath),
            JSON.stringify({ version: 1, settings: { openRandomNote: false } }),
        );
        await addSourceDevice(adapter, files, {
            folderName: "Tablet--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Tablet",
            shortDeviceId: "91ac",
        });

        const overwritten = await workspace.overwriteCurrentDeviceFromSource(
            startup.layout,
            "91ac1111-2222-3333-4444-555555555555",
        );
        const overwrittenMeta = JSON.parse(files.get(normalizePath(overwritten.deviceMetaPath)) ?? "{}");

        expect(overwritten.device.deviceId).toBe(startup.layout.device.deviceId);
        expect(overwritten.device.deviceName).toBe(startup.layout.device.deviceName);
        expect(overwritten.deviceRoot).toBe(startup.layout.deviceRoot);
        expect(overwritten.device.baselineFromDeviceId).toBe(
            "91ac1111-2222-3333-4444-555555555555",
        );
        expect(overwritten.device.baselineBuiltAt).toBeTruthy();
        expect(files.get(normalizePath(overwritten.cardsPath))).toBe('{"items":[{"uuid":"card-1"}]}');
        expect(JSON.parse(files.get(normalizePath(overwritten.fileIdentitiesPath)) ?? "{}")).toEqual(
            JSON.parse(createValidFileIdentitiesPayload()),
        );
        expect(files.get(normalizePath(overwritten.timelinePath))).toBe('{"note.md":[{"id":"1"}]}');
        expect(files.get(normalizePath(overwritten.noteCachePath))).toContain('"path":"note.md"');
        expect(overwrittenMeta.deviceId).toBe(startup.layout.device.deviceId);
        expect(overwrittenMeta.baselineFromDeviceId).toBe(
            "91ac1111-2222-3333-4444-555555555555",
        );
    });

    it("deletes a non-current valid device together with its session directory", async () => {
        const { adapter, files, directories } = createMockAdapter();
        const workspace = createWorkspace(adapter);
        const startup = await workspace.initialize();

        await addSourceDevice(adapter, files, {
            folderName: "Tablet--91ac",
            deviceId: "91ac1111-2222-3333-4444-555555555555",
            deviceName: "Tablet",
            shortDeviceId: "91ac",
        });
        await adapter.mkdir(".obsidian/plugins/syro/sessions/Tablet--91ac");
        files.set(
            ".obsidian/plugins/syro/sessions/Tablet--91ac/2026-04-13.session.jsonl",
            '{"version":1}\n',
        );

        await workspace.deleteValidDevice("91ac1111-2222-3333-4444-555555555555");

        expect(directories.has(".obsidian/plugins/syro/devices/Tablet--91ac")).toBe(false);
        expect(directories.has(".obsidian/plugins/syro/sessions/Tablet--91ac")).toBe(false);
        expect(files.has(".obsidian/plugins/syro/devices/Tablet--91ac/device.json")).toBe(false);
        expect(
            files.has(".obsidian/plugins/syro/sessions/Tablet--91ac/2026-04-13.session.jsonl"),
        ).toBe(false);
        await expect(workspace.deleteValidDevice(startup.layout.device.deviceId)).rejects.toThrow(
            "cannot be deleted",
        );
    });

    it("deletes only invalid device directories", async () => {
        const { adapter, files, directories } = createMockAdapter();
        await addSourceDevice(adapter, files, {
            folderName: "Desktop--cd41",
            deviceId: "cd411111-2222-3333-4444-555555555555",
            deviceName: "Desktop",
            shortDeviceId: "cd41",
        });
        directories.add(".obsidian/plugins/syro/devices/Desktop--ec3c");
        files.set(
            ".obsidian/plugins/syro/devices/Desktop--ec3c/settings.json",
            JSON.stringify({ version: 1, settings: {} }),
        );
        files.set(
            ".obsidian/plugins/syro/devices/Desktop--ec3c/device-state.json",
            JSON.stringify({ version: 1 }),
        );

        const workspace = createWorkspace(adapter);
        await workspace.deleteInvalidDeviceDirectory("Desktop--ec3c");

        expect(directories.has(".obsidian/plugins/syro/devices/Desktop--ec3c")).toBe(false);
        expect(files.has(".obsidian/plugins/syro/devices/Desktop--ec3c/settings.json")).toBe(false);
        expect(files.has(".obsidian/plugins/syro/devices/Desktop--cd41/device.json")).toBe(true);
        expect(adapter.rmdir).toHaveBeenCalledWith(
            ".obsidian/plugins/syro/devices/Desktop--ec3c",
            false,
        );
    });
});
