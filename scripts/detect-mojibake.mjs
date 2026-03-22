#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE = "51db186";
const DEFAULT_HEAD = "HEAD";
const SELF_SCRIPT_PATH = "scripts/detect-mojibake.mjs";
const TEXT_FILE_PATTERN =
    /\.(?:ts|tsx|js|jsx|mjs|cjs|json|css|scss|md|txt|yml|yaml)$/i;
const PRIORITY_FILE_PATTERN =
    /^(src\/.*\.(?:ts|tsx|css)|scripts\/.*\.(?:mjs|js|ts)|package\.json|manifest\.json|versions\.json|eslint.*|\.eslintrc.*)$/i;
const MOJIBAKE_FRAGMENTS = [
    "姝ｅ湪",
    "鍚屾",
    "瑙ｆ瀽",
    "绗旇",
    "鏋勫缓",
    "鐗岀粍",
    "瀹屾垚",
    "鎻愮ず",
    "闅愯棌",
    "骞挎挱",
    "娓呮礂",
    "鑴忔暟鎹",
    "杩欎釜鏂囦欢",
    "鎻掍欢",
    "濮濓絽婀",
    "濞撳懐鎮",
    "閹笛嗩攽",
    "閸氬本顒",
    "閸ㄥ啫婧囬崶鐐存暪",
    "sync鉃?",
    "plugin.sync() 瀹屾垚",
];
const SUSPICIOUS_CHAR_PATTERN = /[鈥€鍚姝瑙鏋绗旇瀹鎻闅骞挎濮娓呮礂鑴忔閸锛銆]/gu;

const { base, head } = parseArgs(process.argv.slice(2));
const repoRoot = execGit(["rev-parse", "--show-toplevel"]).trim();

process.chdir(repoRoot);

const trackedFiles = new Set(splitLines(git(["ls-files"])).filter(isTextFile));
const candidateFiles = collectCandidateFiles(base, head, trackedFiles);
const filesToScan = candidateFiles.length > 0 ? candidateFiles : [...trackedFiles].filter(isPriorityFile);
const findings = [];

for (const file of filesToScan) {
    if (file === SELF_SCRIPT_PATH) {
        continue;
    }

    const absPath = path.join(repoRoot, file);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
        continue;
    }

    const content = fs.readFileSync(absPath, "utf8");
    const lines = content.split(/\r?\n/u);

    lines.forEach((line, index) => {
        const fragments = getMatchingFragments(line);
        if (fragments.length === 0) {
            return;
        }

        findings.push({
            file,
            lineNumber: index + 1,
            category: classifyLine(line, fragments),
            fragments,
            line: line.trim(),
        });
    });
}

const grouped = groupBy(findings, (item) => item.category);
const runtimeHits = grouped["runtime-string"] ?? [];
const commentHits = grouped.comment ?? [];
const otherHits = grouped.other ?? [];

console.log("Mojibake scan");
console.log(`Base: ${base}`);
console.log(`Head: ${head} (plus current worktree changes)`);
console.log(`Scanned files: ${filesToScan.length}`);
console.log(`Runtime strings: ${runtimeHits.length}`);
console.log(`Comments: ${commentHits.length}`);
console.log(`Other text: ${otherHits.length}`);

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
    let base = DEFAULT_BASE;
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

function collectCandidateFiles(base, head, trackedFiles) {
    const files = new Set();
    const diffCommands = [
        ["diff", "--name-only", "--diff-filter=ACMR", base, head, "--"],
        ["diff", "--name-only", "--diff-filter=ACMR", "--"],
        ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "--"],
    ];

    for (const args of diffCommands) {
        for (const file of splitLines(git(args))) {
            if (trackedFiles.has(file) && isPriorityFile(file)) {
                files.add(file);
            }
        }
    }

    return [...files].sort();
}

function isPriorityFile(file) {
    return PRIORITY_FILE_PATTERN.test(file) || isTextFile(file);
}

function isTextFile(file) {
    return TEXT_FILE_PATTERN.test(file);
}

function getMatchingFragments(line) {
    const matchedFragments = MOJIBAKE_FRAGMENTS.filter((fragment) => line.includes(fragment));
    if (matchedFragments.length > 0) {
        return matchedFragments;
    }

    const charHits = new Set(line.match(SUSPICIOUS_CHAR_PATTERN) ?? []);
    if (charHits.size >= 4) {
        return [...charHits].slice(0, 4);
    }

    return [];
}

function classifyLine(line, fragments) {
    const trimmed = line.trim();
    if (/^(?:\/\/|\/\*|\*|\*\/)/u.test(trimmed)) {
        return "comment";
    }

    const escapedFragments = fragments.map((fragment) => escapeRegExp(fragment));
    const stringPattern = new RegExp(
        `(["'\`])(?:\\\\.|(?!\\1).)*?(?:${escapedFragments.join("|")})(?:\\\\.|(?!\\1).)*?\\1`,
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
    return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
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
