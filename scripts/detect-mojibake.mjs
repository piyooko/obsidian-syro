#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_HEAD = "HEAD";
const SELF_SCRIPT_PATH = "scripts/detect-mojibake.mjs";
const BASE_CANDIDATES = ["origin/main", "origin/master", "main", "master", "HEAD~1"];
const TEXT_FILE_PATTERN = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|css|scss|md|txt|yml|yaml)$/i;
const PRIORITY_FILE_PATTERN =
    /^(src\/.*\.(?:ts|tsx|css)|scripts\/.*\.(?:mjs|js|ts)|package\.json|manifest\.json|versions\.json|eslint.*|\.eslintrc.*)$/i;
const EXPLICIT_MOJIBAKE_PATTERNS = [
    /锟斤拷/u,
    /�/u,
    /Ã./u,
    /Â./u,
    /â[\u0080-\u00BF]/u,
    /ð[\u0080-\u00BF]/u,
];
const SUSPICIOUS_CHAR_PATTERN = /[闂閿鏉妗鍙鐨涓浠鍚鈥欐鍥鏆鎴楂鎺鎼妫钃锟�]/gu;

const args = parseArgs(process.argv.slice(2));
const repoRoot = execGit(["rev-parse", "--show-toplevel"]).trim();

process.chdir(repoRoot);

const warnings = [];
const base = resolveBase(args.base, warnings);
const head = resolveHead(args.head, warnings);
const trackedFiles = new Set(splitLines(safeGit(["ls-files"])).filter(isTextFile));
const candidateFiles = collectCandidateFiles({ base, head, trackedFiles });
const filesToScan =
    candidateFiles.length > 0 ? candidateFiles : [...trackedFiles].filter(isPriorityFile);
const findings = [];

for (const file of filesToScan) {
    if (file === SELF_SCRIPT_PATH) {
        continue;
    }

    const absPath = path.join(repoRoot, file);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
        continue;
    }

    const raw = fs.readFileSync(absPath);
    if (raw.includes(0)) {
        continue;
    }

    const content = raw.toString("utf8");
    const lines = content.split(/\r?\n/u);

    lines.forEach((line, index) => {
        const signals = getSignals(line);
        if (signals.length === 0) {
            return;
        }

        findings.push({
            file,
            lineNumber: index + 1,
            category: classifyLine(line, signals),
            line: line.trim(),
        });
    });
}

const grouped = groupBy(findings, (item) => item.category);
const runtimeHits = grouped["runtime-string"] ?? [];
const commentHits = grouped.comment ?? [];
const otherHits = grouped.other ?? [];

console.log("Mojibake scan");
console.log(`Base: ${base ?? "(auto unavailable; scanned current worktree and staged files)"}`);
console.log(`Head: ${head}`);
console.log(`Scanned files: ${filesToScan.length}`);
console.log(`Runtime strings: ${runtimeHits.length}`);
console.log(`Comments: ${commentHits.length}`);
console.log(`Other text: ${otherHits.length}`);

if (warnings.length > 0) {
    console.log("");
    console.log("Notes:");
    for (const warning of warnings) {
        console.log(`- ${warning}`);
    }
}

printGroup("runtime-string", runtimeHits);
printGroup("comment", commentHits);
printGroup("other", otherHits);

if (commentHits.length > 0) {
    const commentFiles = [...new Set(commentHits.map((item) => item.file))];
    console.log("");
    console.log("Residual comment mojibake files:");
    for (const file of commentFiles) {
        console.log(`- ${file}`);
    }
}

if (runtimeHits.length > 0) {
    process.exitCode = 1;
}

function parseArgs(argv) {
    let base = null;
    let head = DEFAULT_HEAD;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--base" && argv[index + 1]) {
            base = argv[index + 1];
            index += 1;
            continue;
        }
        if (arg === "--head" && argv[index + 1]) {
            head = argv[index + 1];
            index += 1;
        }
    }

    return { base, head };
}

function git(args) {
    return execGit(args, repoRoot);
}

function safeGit(args) {
    try {
        return git(args);
    } catch {
        return "";
    }
}

function execGit(args, cwd = process.cwd()) {
    return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function splitLines(text) {
    return text
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
}

function resolveBase(explicitBase, warnings) {
    if (explicitBase) {
        if (revisionExists(explicitBase)) {
            return explicitBase;
        }
        warnings.push(`Ignoring invalid --base revision: ${explicitBase}`);
        return null;
    }

    for (const candidate of BASE_CANDIDATES) {
        if (revisionExists(candidate)) {
            return candidate;
        }
    }

    warnings.push(
        "No default git base was resolved; skipping base-to-head diff and scanning current changes only.",
    );
    return null;
}

function resolveHead(explicitHead, warnings) {
    if (revisionExists(explicitHead)) {
        return explicitHead;
    }

    warnings.push(
        `Ignoring invalid --head revision: ${explicitHead}; falling back to ${DEFAULT_HEAD}.`,
    );
    return DEFAULT_HEAD;
}

function revisionExists(revision) {
    try {
        execGit(["rev-parse", "--verify", `${revision}^{commit}`], repoRoot);
        return true;
    } catch {
        return false;
    }
}

function collectCandidateFiles({ base, head, trackedFiles }) {
    const files = new Set();

    if (base) {
        addFilesFromGit(
            ["diff", "--name-only", "--diff-filter=ACMR", base, head, "--"],
            files,
            trackedFiles,
        );
    }

    addFilesFromGit(["diff", "--name-only", "--diff-filter=ACMR", "--"], files, trackedFiles);
    addFilesFromGit(
        ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "--"],
        files,
        trackedFiles,
    );
    addFilesFromGit(["ls-files", "--others", "--exclude-standard"], files, trackedFiles, {
        includeUntracked: true,
    });

    return [...files].sort();
}

function addFilesFromGit(args, files, trackedFiles, options = {}) {
    const output = safeGit(args);
    for (const file of splitLines(output)) {
        if (!isTextFile(file) || !isPriorityFile(file)) {
            continue;
        }

        if (options.includeUntracked || trackedFiles.has(file)) {
            files.add(file);
        }
    }
}

function isPriorityFile(file) {
    return PRIORITY_FILE_PATTERN.test(file) || isTextFile(file);
}

function isTextFile(file) {
    return TEXT_FILE_PATTERN.test(file);
}

function getSignals(line) {
    const signals = new Set();

    for (const pattern of EXPLICIT_MOJIBAKE_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
            signals.add(match[0]);
        }
    }

    const suspiciousChars = [...new Set(line.match(SUSPICIOUS_CHAR_PATTERN) ?? [])];
    if (suspiciousChars.length >= 4) {
        for (const char of suspiciousChars.slice(0, 4)) {
            signals.add(char);
        }
    }

    return [...signals];
}

function classifyLine(line, signals) {
    const trimmed = line.trim();
    if (/^(?:\/\/|\/\*|\*|\*\/)/u.test(trimmed)) {
        return "comment";
    }

    const escapedSignals = signals.map((signal) => escapeRegExp(signal));
    const stringPattern = new RegExp(
        `(["'\`])(?:\\\\.|(?!\\1).)*?(?:${escapedSignals.join("|")})(?:\\\\.|(?!\\1).)*?\\1`,
        "u",
    );
    if (stringPattern.test(line)) {
        return "runtime-string";
    }

    return "other";
}

function printGroup(name, items) {
    if (items.length === 0) {
        return;
    }

    console.log("");
    console.log(`[${name}]`);
    for (const item of items) {
        console.log(`- ${item.file}:${item.lineNumber} ${truncate(item.line, 160)}`);
    }
}

function truncate(text, maxLength) {
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function groupBy(items, getKey) {
    return items.reduce((accumulator, item) => {
        const key = getKey(item);
        accumulator[key] ??= [];
        accumulator[key].push(item);
        return accumulator;
    }, /** @type {Record<string, typeof items>} */ ({}));
}
