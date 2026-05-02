#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_PLUGIN_DIR = "C:\\Users\\85870\\Dropbox\\血字的研究\\.obsidian\\plugins\\syro";

const CardQueue = {
    Suspended: -1,
    New: 0,
    Learn: 1,
    Review: 2,
};

const FsrsState = {
    New: 0,
    Learning: 1,
    Review: 2,
    Relearning: 3,
};

function parseArgs(argv) {
    const args = {
        pluginDir: DEFAULT_PLUGIN_DIR,
        device: null,
        now: Date.now(),
        learnAheadMinutes: 0,
        deck: null,
        json: false,
        all: false,
        includeExtracts: true,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        if (arg === "--plugin-dir" && next) {
            args.pluginDir = next;
            i++;
        } else if (arg === "--device" && next) {
            args.device = next;
            i++;
        } else if (arg === "--now" && next) {
            const parsed = Date.parse(next);
            if (!Number.isFinite(parsed)) {
                throw new Error(`Invalid --now value: ${next}`);
            }
            args.now = parsed;
            i++;
        } else if (arg === "--learn-ahead-minutes" && next) {
            args.learnAheadMinutes = Number(next);
            if (!Number.isFinite(args.learnAheadMinutes) || args.learnAheadMinutes < 0) {
                throw new Error(`Invalid --learn-ahead-minutes value: ${next}`);
            }
            i++;
        } else if (arg === "--deck" && next) {
            args.deck = normalizeDeckName(next);
            i++;
        } else if (arg === "--json") {
            args.json = true;
        } else if (arg === "--all") {
            args.all = true;
        } else if (arg === "--cards-only") {
            args.includeExtracts = false;
        } else if (arg === "--help" || arg === "-h") {
            printHelp();
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return args;
}

function printHelp() {
    console.log(`Usage:
  node scripts/audit-card-due-counts.mjs [options]

Options:
  --plugin-dir <path>           Syro plugin data directory.
  --device <name>               Device folder name, for example Desktop--a7dd.
  --now <iso-or-date>           Override current time for due calculation.
  --learn-ahead-minutes <n>     Learning queue look-ahead window. Default: 0.
  --deck <name>                 Filter by exact deck/topic path.
  --all                         Print all card rows, not only review/learn anomalies.
  --cards-only                  Skip extracts.json audit.
  --json                        Print machine-readable JSON.
  --help                        Show this help.
`);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listCardFiles(pluginDir, deviceFilter) {
    const devicesDir = path.join(pluginDir, "devices");
    if (!fs.existsSync(devicesDir)) {
        throw new Error(`Missing devices directory: ${devicesDir}`);
    }

    return fs
        .readdirSync(devicesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => !deviceFilter || entry.name === deviceFilter)
        .map((entry) => {
            const filePath = path.join(devicesDir, entry.name, "cards.json");
            return { device: entry.name, filePath };
        })
        .filter((entry) => fs.existsSync(entry.filePath));
}

function listDeviceDirs(pluginDir, deviceFilter) {
    const devicesDir = path.join(pluginDir, "devices");
    if (!fs.existsSync(devicesDir)) {
        throw new Error(`Missing devices directory: ${devicesDir}`);
    }

    return fs
        .readdirSync(devicesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => !deviceFilter || entry.name === deviceFilter)
        .map((entry) => ({
            device: entry.name,
            deviceDir: path.join(devicesDir, entry.name),
        }));
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseTimestamp(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

function deriveQueue(item) {
    if (typeof item.queue === "number") {
        return item.queue;
    }

    const data = isRecord(item.data) ? item.data : {};
    if ("state" in data) {
        if (data.state === FsrsState.Learning || data.state === FsrsState.Relearning) {
            return CardQueue.Learn;
        }
        if (data.state === FsrsState.Review) {
            return CardQueue.Review;
        }
        return CardQueue.New;
    }

    if ((item.timesReviewed ?? 0) === 0) {
        return CardQueue.New;
    }

    if (item.learningStep !== null && item.learningStep !== undefined) {
        return CardQueue.Learn;
    }

    return CardQueue.Review;
}

function normalizeItem(item) {
    const data = isRecord(item.data) ? item.data : {};
    const queue = deriveQueue(item);
    const dataDue = parseTimestamp(data.due);
    let nextReview = parseTimestamp(item.nextReview);

    const shouldRestoreNextReviewFromDue =
        queue !== CardQueue.New ||
        (item.timesReviewed ?? 0) > 0 ||
        (item.learningStep !== null && item.learningStep !== undefined) ||
        data.state !== FsrsState.New;

    if (shouldRestoreNextReviewFromDue && nextReview === 0 && dataDue > 0) {
        nextReview = dataDue;
    }

    return {
        ...item,
        queue,
        nextReview,
        dataDue,
        deckName: normalizeDeckName(item.deckName ?? ""),
        itemType: item.itemType ?? "",
        timesReviewed: item.timesReviewed ?? 0,
    };
}

function normalizeDeckName(deckName) {
    return String(deckName ?? "")
        .replace(/^#/, "")
        .replace(/\\/g, "/")
        .trim();
}

function isInDeck(itemDeck, filterDeck) {
    if (!filterDeck) {
        return true;
    }

    return itemDeck === filterDeck || itemDeck.startsWith(`${filterDeck}/`);
}

function queueName(queue) {
    switch (queue) {
        case CardQueue.Suspended:
            return "Suspended";
        case CardQueue.New:
            return "New";
        case CardQueue.Learn:
            return "Learn";
        case CardQueue.Review:
            return "Review";
        default:
            return `Unknown(${queue})`;
    }
}

function classify(item, now, learnAheadMillis) {
    const isCard = item.itemType === "card";
    const isNew = item.queue === CardQueue.New;
    const isReviewQueue = item.queue === CardQueue.Review;
    const isLearnQueue = item.queue === CardQueue.Learn;
    const isStrictDue = isReviewQueue && item.nextReview > 0 && item.nextReview <= now;
    const isReviewFuture = isReviewQueue && item.nextReview > now;
    const isLearnAvailable = isLearnQueue && item.nextReview <= now + learnAheadMillis;
    const isLearnFuture = isLearnQueue && item.nextReview > now + learnAheadMillis;
    const isNewWithElapsedDataDue = isNew && item.dataDue > 0 && item.dataDue <= now;

    return {
        isCard,
        isNew,
        isReviewQueue,
        isLearnQueue,
        isStrictDue,
        isReviewFuture,
        isLearnAvailable,
        isLearnFuture,
        isNewWithElapsedDataDue,
    };
}

function increment(map, deckName, kind) {
    if (!map.has(deckName)) {
        map.set(deckName, {
            deckName,
            totalCards: 0,
            newCards: 0,
            reviewQueueCards: 0,
            strictDueCards: 0,
            futureReviewCards: 0,
            learnQueueCards: 0,
            learnAvailableCards: 0,
            learnFutureCards: 0,
            newCardsWithElapsedDataDue: 0,
        });
    }
    map.get(deckName)[kind]++;
}

function deckAncestors(deckName) {
    if (!deckName) {
        return [""];
    }

    const parts = deckName.split("/").filter(Boolean);
    const result = [""];
    for (let i = 0; i < parts.length; i++) {
        result.push(parts.slice(0, i + 1).join("/"));
    }
    return result;
}

function summarizeItems(items, now, learnAheadMillis, deckFilter) {
    const summary = {
        totalCards: 0,
        newCards: 0,
        reviewQueueCards: 0,
        strictDueCards: 0,
        futureReviewCards: 0,
        learnQueueCards: 0,
        learnAvailableCards: 0,
        learnFutureCards: 0,
        newCardsWithElapsedDataDue: 0,
    };
    const byDeckRollup = new Map();
    const rows = [];

    for (const rawItem of items) {
        const item = normalizeItem(rawItem);
        if (item.itemType !== "card") {
            continue;
        }
        if (!isInDeck(item.deckName, deckFilter)) {
            continue;
        }

        const flags = classify(item, now, learnAheadMillis);
        summary.totalCards++;
        if (flags.isNew) summary.newCards++;
        if (flags.isReviewQueue) summary.reviewQueueCards++;
        if (flags.isStrictDue) summary.strictDueCards++;
        if (flags.isReviewFuture) summary.futureReviewCards++;
        if (flags.isLearnQueue) summary.learnQueueCards++;
        if (flags.isLearnAvailable) summary.learnAvailableCards++;
        if (flags.isLearnFuture) summary.learnFutureCards++;
        if (flags.isNewWithElapsedDataDue) summary.newCardsWithElapsedDataDue++;

        for (const ancestor of deckAncestors(item.deckName)) {
            increment(byDeckRollup, ancestor, "totalCards");
            if (flags.isNew) increment(byDeckRollup, ancestor, "newCards");
            if (flags.isReviewQueue) increment(byDeckRollup, ancestor, "reviewQueueCards");
            if (flags.isStrictDue) increment(byDeckRollup, ancestor, "strictDueCards");
            if (flags.isReviewFuture) increment(byDeckRollup, ancestor, "futureReviewCards");
            if (flags.isLearnQueue) increment(byDeckRollup, ancestor, "learnQueueCards");
            if (flags.isLearnAvailable) increment(byDeckRollup, ancestor, "learnAvailableCards");
            if (flags.isLearnFuture) increment(byDeckRollup, ancestor, "learnFutureCards");
            if (flags.isNewWithElapsedDataDue) {
                increment(byDeckRollup, ancestor, "newCardsWithElapsedDataDue");
            }
        }

        rows.push({
            id: item.ID,
            uuid: item.uuid ?? "",
            deckName: item.deckName,
            queue: item.queue,
            queueName: queueName(item.queue),
            nextReview: item.nextReview,
            nextReviewIso: item.nextReview > 0 ? new Date(item.nextReview).toISOString() : "",
            dataDueIso: item.dataDue > 0 ? new Date(item.dataDue).toISOString() : "",
            state: isRecord(item.data) ? item.data.state : undefined,
            timesReviewed: item.timesReviewed,
            strictDue: flags.isStrictDue,
            reviewFuture: flags.isReviewFuture,
            learnAvailable: flags.isLearnAvailable,
            learnFuture: flags.isLearnFuture,
            newWithElapsedDataDue: flags.isNewWithElapsedDataDue,
        });
    }

    rows.sort((left, right) => {
        const leftTime = left.nextReview || Number.MAX_SAFE_INTEGER;
        const rightTime = right.nextReview || Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime || Number(left.id ?? 0) - Number(right.id ?? 0);
    });

    return {
        summary,
        byDeckRollup: [...byDeckRollup.values()].sort((left, right) =>
            left.deckName.localeCompare(right.deckName),
        ),
        rows,
    };
}

function loadFilePathSet(deviceDir) {
    const result = new Set();
    const noteCachePath = path.join(deviceDir, "note-cache.json");
    const fileIdentitiesPath = path.join(deviceDir, "file-identities.json");

    if (fs.existsSync(noteCachePath)) {
        try {
            const noteCache = readJson(noteCachePath);
            const notes = Array.isArray(noteCache.notes)
                ? noteCache.notes
                : Array.isArray(noteCache.files)
                  ? noteCache.files
                  : [];
            for (const note of notes) {
                if (typeof note?.path === "string") {
                    result.add(normalizePath(note.path));
                }
            }

            for (const key of Object.keys(noteCache.notes ?? {})) {
                if (key.endsWith(".md")) {
                    result.add(normalizePath(key));
                }
            }
        } catch {
            // Optional source-presence hint only.
        }
    }

    if (fs.existsSync(fileIdentitiesPath)) {
        try {
            const fileIdentities = readJson(fileIdentitiesPath);
            for (const entry of Object.values(fileIdentities.entries ?? {})) {
                if (typeof entry?.path === "string" && entry.deleted !== true) {
                    result.add(normalizePath(entry.path));
                }
            }
        } catch {
            // Optional source-presence hint only.
        }
    }

    return result;
}

function normalizePath(value) {
    return String(value ?? "")
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "");
}

function normalizeExtractDeckPath(value) {
    const normalized = normalizeDeckName(value || "default");
    return normalized || "default";
}

function getExtractReviewOrderTime(item) {
    if ((item.timesReviewed ?? 0) === 0 || (item.nextReview ?? 0) === 0) {
        return item.createdAt ?? 0;
    }
    return item.nextReview ?? 0;
}

function summarizeExtracts(extractsFilePath, now, deckFilter) {
    if (!fs.existsSync(extractsFilePath)) {
        return null;
    }

    const data = readJson(extractsFilePath);
    const items = Object.values(data.items ?? {});
    const reviewedCounts = data.reviewedCounts ?? {};
    const deviceDir = path.dirname(extractsFilePath);
    const knownSourcePaths = loadFilePathSet(deviceDir);
    const canCheckSources = knownSourcePaths.size > 0;
    const sourceExists = (item) =>
        !canCheckSources || knownSourcePaths.has(normalizePath(item.sourcePath));
    const activeItems = items
        .filter((item) => item?.stage === "active")
        .filter(sourceExists)
        .map((item) => ({
            ...item,
            deckName: normalizeExtractDeckPath(item.deckName),
            nextReview: parseTimestamp(item.nextReview),
            timesReviewed: Number(item.timesReviewed ?? 0),
            priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 5,
            createdAt: parseTimestamp(item.createdAt),
        }))
        .filter((item) => isInDeck(item.deckName, deckFilter));

    const due = activeItems
        .filter((item) => item.timesReviewed > 0 && item.nextReview <= now)
        .sort(
            (left, right) => left.priority - right.priority || left.nextReview - right.nextReview,
        );
    const fresh = activeItems
        .filter((item) => item.timesReviewed === 0 || item.nextReview === 0)
        .sort((left, right) => left.priority - right.priority || left.createdAt - right.createdAt);
    const future = activeItems
        .filter((item) => item.timesReviewed > 0 && item.nextReview > now)
        .sort((left, right) => left.nextReview - right.nextReview);

    const candidates = [...due, ...fresh].sort(
        (left, right) =>
            left.priority - right.priority ||
            getExtractReviewOrderTime(left) - getExtractReviewOrderTime(right),
    );

    const summary = {
        totalActiveExtracts: activeItems.length,
        newExtracts: fresh.length,
        dueExtracts: due.length,
        futureExtracts: future.length,
        candidateExtracts: candidates.length,
    };
    const byDeckRollup = new Map();
    for (const item of activeItems) {
        for (const ancestor of deckAncestors(item.deckName)) {
            if (!byDeckRollup.has(ancestor)) {
                byDeckRollup.set(ancestor, {
                    deckName: ancestor,
                    totalActiveExtracts: 0,
                    newExtracts: 0,
                    dueExtracts: 0,
                    futureExtracts: 0,
                    candidateExtracts: 0,
                });
            }
            const stats = byDeckRollup.get(ancestor);
            stats.totalActiveExtracts++;
            if (item.timesReviewed === 0 || item.nextReview === 0) stats.newExtracts++;
            else if (item.nextReview <= now) stats.dueExtracts++;
            else stats.futureExtracts++;
        }
    }
    for (const item of candidates) {
        for (const ancestor of deckAncestors(item.deckName)) {
            byDeckRollup.get(ancestor).candidateExtracts++;
        }
    }

    const rows = [...due, ...future, ...fresh].map((item) => ({
        id: item.id,
        uuid: item.uuid,
        deckName: item.deckName,
        sourcePath: item.sourcePath,
        priority: item.priority,
        timesReviewed: item.timesReviewed,
        nextReview: item.nextReview,
        nextReviewIso: item.nextReview > 0 ? new Date(item.nextReview).toISOString() : "",
        stage: item.stage,
        due: item.timesReviewed > 0 && item.nextReview <= now,
        fresh: item.timesReviewed === 0 || item.nextReview === 0,
        future: item.timesReviewed > 0 && item.nextReview > now,
    }));

    return {
        filePath: extractsFilePath,
        sourcePresenceChecked: canCheckSources,
        reviewedCounts,
        summary,
        byDeckRollup: [...byDeckRollup.values()].sort((left, right) =>
            left.deckName.localeCompare(right.deckName),
        ),
        rows,
    };
}

function formatCountLine(label, stats) {
    return `${label.padEnd(22)} new=${String(stats.newCards).padStart(3)} learn=${String(
        stats.learnAvailableCards,
    ).padStart(3)} due=${String(stats.strictDueCards).padStart(3)} reviewQueue=${String(
        stats.reviewQueueCards,
    ).padStart(3)} futureReview=${String(stats.futureReviewCards).padStart(3)} total=${String(
        stats.totalCards,
    ).padStart(3)} newDataDueElapsed=${String(stats.newCardsWithElapsedDataDue).padStart(3)}`;
}

function printHuman(result, args) {
    console.log(`Syro card due audit`);
    console.log(`pluginDir: ${args.pluginDir}`);
    console.log(`now: ${new Date(args.now).toISOString()}`);
    console.log(`learnAheadMinutes: ${args.learnAheadMinutes}`);
    if (args.deck) console.log(`deck filter: ${args.deck}`);
    console.log("");

    for (const deviceResult of result.devices) {
        console.log(`Device: ${deviceResult.device}`);
        console.log(`cardsFile: ${deviceResult.filePath}`);
        console.log(formatCountLine("ALL", deviceResult.summary));

        const nonZeroDecks = deviceResult.byDeckRollup.filter(
            (deck) =>
                deck.strictDueCards > 0 ||
                deck.learnAvailableCards > 0 ||
                deck.futureReviewCards > 0 ||
                deck.newCardsWithElapsedDataDue > 0,
        );

        if (nonZeroDecks.length > 0) {
            console.log("Deck rollup with due/learn/future review:");
            for (const deck of nonZeroDecks) {
                const label = deck.deckName || "(root)";
                console.log(`  ${formatCountLine(label.slice(0, 22), deck)}`);
            }
        }

        const interestingRows = args.all
            ? deviceResult.rows
            : deviceResult.rows.filter(
                  (row) =>
                      row.strictDue ||
                      row.learnAvailable ||
                      row.reviewFuture ||
                      row.learnFuture ||
                      row.newWithElapsedDataDue,
              );

        if (interestingRows.length > 0) {
            console.log("Rows:");
            for (const row of interestingRows.slice(0, 200)) {
                console.log(
                    [
                        `  id=${row.id}`,
                        `deck=${row.deckName || "(none)"}`,
                        `queue=${row.queueName}`,
                        `next=${row.nextReviewIso || "0"}`,
                        `dataDue=${row.dataDueIso || "0"}`,
                        `state=${row.state ?? ""}`,
                        `strictDue=${row.strictDue}`,
                        `newDataDueElapsed=${row.newWithElapsedDataDue}`,
                        `learnAvailable=${row.learnAvailable}`,
                        `reviewFuture=${row.reviewFuture}`,
                    ].join(" | "),
                );
            }
            if (interestingRows.length > 200) {
                console.log(`  ... ${interestingRows.length - 200} more rows omitted`);
            }
        }

        console.log("");

        if (deviceResult.extracts) {
            console.log(`Extracts: ${deviceResult.extracts.filePath}`);
            const stats = deviceResult.extracts.summary;
            console.log(
                `  ALL extracts             new=${String(stats.newExtracts).padStart(
                    3,
                )} due=${String(stats.dueExtracts).padStart(3)} future=${String(
                    stats.futureExtracts,
                ).padStart(3)} candidates=${String(stats.candidateExtracts).padStart(
                    3,
                )} active=${String(stats.totalActiveExtracts).padStart(3)}`,
            );

            const nonZeroExtractDecks = deviceResult.extracts.byDeckRollup.filter(
                (deck) => deck.dueExtracts > 0 || deck.newExtracts > 0 || deck.futureExtracts > 0,
            );
            if (nonZeroExtractDecks.length > 0) {
                console.log("Extract deck rollup:");
                for (const deck of nonZeroExtractDecks) {
                    const label = (deck.deckName || "(root)").slice(0, 26).padEnd(26);
                    console.log(
                        `  ${label} new=${String(deck.newExtracts).padStart(3)} due=${String(
                            deck.dueExtracts,
                        ).padStart(3)} future=${String(deck.futureExtracts).padStart(
                            3,
                        )} candidates=${String(deck.candidateExtracts).padStart(3)} active=${String(
                            deck.totalActiveExtracts,
                        ).padStart(3)}`,
                    );
                }
            }

            const interestingExtracts = args.all
                ? deviceResult.extracts.rows
                : deviceResult.extracts.rows.filter((row) => row.due || row.future);
            if (interestingExtracts.length > 0) {
                console.log("Extract rows:");
                for (const row of interestingExtracts.slice(0, 200)) {
                    console.log(
                        [
                            `  id=${row.id}`,
                            `deck=${row.deckName}`,
                            `source=${row.sourcePath}`,
                            `next=${row.nextReviewIso || "0"}`,
                            `times=${row.timesReviewed}`,
                            `due=${row.due}`,
                            `future=${row.future}`,
                            `fresh=${row.fresh}`,
                        ].join(" | "),
                    );
                }
                if (interestingExtracts.length > 200) {
                    console.log(`  ... ${interestingExtracts.length - 200} more extracts omitted`);
                }
            }

            console.log("");
        }
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const learnAheadMillis = args.learnAheadMinutes * 60 * 1000;
    const deviceDirs = listDeviceDirs(args.pluginDir, args.device);
    if (deviceDirs.length === 0) {
        throw new Error("No device directories found.");
    }

    const result = {
        pluginDir: args.pluginDir,
        now: args.now,
        nowIso: new Date(args.now).toISOString(),
        learnAheadMinutes: args.learnAheadMinutes,
        deckFilter: args.deck,
        devices: deviceDirs.map(({ device, deviceDir }) => {
            const filePath = path.join(deviceDir, "cards.json");
            if (!fs.existsSync(filePath)) {
                throw new Error(`Missing cards.json: ${filePath}`);
            }
            const data = readJson(filePath);
            const items = Array.isArray(data.items) ? data.items : [];
            return {
                device,
                filePath,
                ...summarizeItems(items, args.now, learnAheadMillis, args.deck),
                extracts: args.includeExtracts
                    ? summarizeExtracts(path.join(deviceDir, "extracts.json"), args.now, args.deck)
                    : null,
            };
        }),
    };

    if (args.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        printHuman(result, args);
    }
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
