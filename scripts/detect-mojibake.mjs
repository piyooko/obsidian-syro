#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import mojibakeCore from "./detect-mojibake-core.cjs";

const { groupBy, scanContent, truncate } = mojibakeCore;

const DEFAULT_HEAD = "HEAD";
const SELF_SCRIPT_PATHS = ["scripts/detect-mojibake.mjs", "scripts/detect-mojibake-core.cjs"];
const BASE_CANDIDATES = ["origin/main", "origin/master", "main", "master", "HEAD~1"];
const TEXT_FILE_PATTERN = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|css|scss|md|txt|yml|yaml)$/i;
const PRIORITY_FILE_PATTERN =
    /^(src\/.*\.(?:ts|tsx|css)|scripts\/.*\.(?:mjs|js|ts)|package\.json|manifest\.json|versions\.json|eslint.*|\.eslintrc.*)$/i;

const invocationCwd = process.cwd();
const args = parseArgs(process.argv.slice(2));
const repoRoot = execGit(["rev-parse", "--show-toplevel"]).trim();

process.chdir(repoRoot);

const warnings = [];
const base = resolveBase(args.base, warnings);
const head = resolveHead(args.head, warnings);
const trackedFiles = new Set(splitLines(safeGit(["ls-files"])).filter(isTextFile));
const candidateFiles = collectCandidateFiles({ base, head, trackedFiles });
const explicitTargets = collectExplicitTargets(args.paths, invocationCwd, repoRoot, warnings);

if (!args.all && explicitTargets.length === 0 && candidateFiles.length > 0) {
    warnings.push(
        "Default mode scans changed and untracked text files only. Use --all to scan the full repo or --path <file|dir> to scan external/runtime data.",
    );
}

const defaultFilesToScan = args.all
    ? [...trackedFiles].filter(isPriorityFile)
    : candidateFiles.length > 0
      ? candidateFiles
      : [...trackedFiles].filter(isPriorityFile);
const scanTargets = buildScanTargets(defaultFilesToScan, explicitTargets, repoRoot);
const findings = [];
const selfScriptPaths = new Set(SELF_SCRIPT_PATHS.map((file) => path.resolve(repoRoot, file)));

for (const target of scanTargets) {
    if (selfScriptPaths.has(target.absPath)) {
        continue;
    }

    if (!fs.existsSync(target.absPath) || !fs.statSync(target.absPath).isFile()) {
        continue;
    }

    const raw = fs.readFileSync(target.absPath);
    if (raw.includes(0)) {
        continue;
    }

    const content = raw.toString("utf8");
    findings.push(...scanContent(content, target.displayPath));
}

const grouped = groupBy(findings, (item) => item.category);
const runtimeHits = grouped["runtime-string"] ?? [];
const commentHits = grouped.comment ?? [];
const otherHits = grouped.other ?? [];

console.log("Mojibake scan");
console.log(`Base: ${base ?? "(auto unavailable; scanned current worktree and staged files)"}`);
console.log(`Head: ${head}`);
console.log(`Scanned files: ${scanTargets.length}`);
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
    let all = false;
    const paths = [];

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
            continue;
        }
        if (arg === "--path" && argv[index + 1]) {
            paths.push(argv[index + 1]);
            index += 1;
            continue;
        }
        if (arg === "--all") {
            all = true;
        }
    }

    return { all, base, head, paths };
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

function collectExplicitTargets(inputPaths, cwd, repoRoot, warnings) {
    const targets = new Map();

    for (const inputPath of inputPaths) {
        const resolvedPath = path.resolve(cwd, inputPath);
        if (!fs.existsSync(resolvedPath)) {
            warnings.push(`Ignoring missing --path target: ${inputPath}`);
            continue;
        }

        addExplicitTarget(resolvedPath, targets, repoRoot);
    }

    return [...targets.values()].sort(compareTargets);
}

function addExplicitTarget(absPath, targets, repoRoot) {
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(absPath, { withFileTypes: true })) {
            if (entry.name === ".git" || entry.name === "node_modules") {
                continue;
            }

            addExplicitTarget(path.join(absPath, entry.name), targets, repoRoot);
        }
        return;
    }

    if (!stat.isFile() || !isTextFile(absPath)) {
        return;
    }

    const target = createScanTarget(absPath, repoRoot);
    targets.set(target.absPath, target);
}

function buildScanTargets(defaultFilesToScan, explicitTargets, repoRoot) {
    const targets = new Map();

    for (const file of defaultFilesToScan) {
        const target = createScanTarget(path.resolve(repoRoot, file), repoRoot);
        targets.set(target.absPath, target);
    }

    for (const target of explicitTargets) {
        targets.set(target.absPath, target);
    }

    return [...targets.values()].sort(compareTargets);
}

function createScanTarget(absPath, repoRoot) {
    const normalizedAbsPath = path.resolve(absPath);
    const relativePath = path.relative(repoRoot, normalizedAbsPath);
    const displayPath =
        relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
            ? relativePath.split(path.sep).join("/")
            : normalizedAbsPath;

    return { absPath: normalizedAbsPath, displayPath };
}

function compareTargets(left, right) {
    return left.displayPath.localeCompare(right.displayPath);
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
