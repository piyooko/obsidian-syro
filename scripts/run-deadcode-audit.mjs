import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const outputPath = path.join(rootDir, "docs", "deadcode-audit.md");
const fileDecisionOverrides = new Map([
    [
        "src/ui/modals/getInputModal.ts",
        {
            bucket: "A",
            risk: "low",
            action: "等待下一轮清理：本轮仅清理局部垃圾，删除前再复核命令入口与动态挂载链",
        },
    ],
    [
        "src/util/platform.ts",
        {
            bucket: "B",
            risk: "medium",
            action: "兼容性保留：先确认移动端/桌面平台适配链路是否仍需这个薄封装",
        },
    ],
    [
        "src/algorithms/balance/postpone.ts",
        {
            bucket: "B",
            risk: "medium",
            action: "兼容性保留：先确认推迟复习命令与旧平衡算法是否已完全断链",
        },
    ],
    [
        "src/dataStore/location_switch.ts",
        {
            bucket: "B",
            risk: "medium",
            action: "先确认历史迁移与测试引用，再决定是否删",
        },
    ],
    [
        "src/NoteEaseCalculator.ts",
        {
            bucket: "A",
            risk: "low",
            action: "优先交给 AI 复核，确认入口链断开后直接删",
        },
    ],
]);
const highConfidenceFilePatterns = [
    /^src\/ui\/modals\/getInputModal\.ts$/,
    /^src\/NoteEaseCalculator\.ts$/,
];

const reviewFilePatterns = [/^src\/dataStore\/location_switch\.ts$/];
const priorityCheckRules = [
    {
        pattern: /^src\/ui\/modals\/getInputModal\.ts$/,
        note: "- `src/ui/modals/getInputModal.ts`: 已延后到下一轮；本轮只清掉局部垃圾，删除前还要复核命令入口与动态挂载链。",
    },
    {
        pattern: /^src\/dataStore\/location_switch\.ts$/,
        note: "- `src/dataStore/location_switch.ts`: 确认是否只剩测试引用和历史迁移注释。",
    },
    {
        pattern: /^src\/NoteEaseCalculator\.ts$/,
        note: "- `src/NoteEaseCalculator.ts`: 确认没有运行时或测试依赖。",
    },
    {
        pattern: /^src\/util\/platform\.ts$/,
        note: "- `src/util/platform.ts`: 兼容性保留；下一轮要确认平台适配层是否还需要这个薄封装。",
    },
    {
        pattern: /^src\/algorithms\/balance\/postpone\.ts$/,
        note: "- `src/algorithms/balance/postpone.ts`: 兼容性保留；下一轮要确认推迟复习命令与旧平衡算法是否已完全断链。",
    },
];

function runTool(label, args, allowFailure = false) {
    const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
    const commandArgs =
        process.platform === "win32" ? ["/d", "/s", "/c", "pnpm", ...args] : args;
    const result = spawnSync(command, commandArgs, {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });

    if (!allowFailure && result.status !== 0) {
        throw new Error(`${label} failed with exit code ${result.status ?? "null"}`);
    }

    return {
        label,
        status: result.status ?? 1,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}

function parseJsonOutput(result) {
    const text = result.stdout.trim();
    if (!text) {
        return { files: [], issues: [] };
    }

    return JSON.parse(text);
}

function parseTscDiagnostics(output) {
    const diagnostics = [];
    const pattern = /^(?<file>.+)\((?<line>\d+),(?<col>\d+)\): error TS(?<code>\d+): (?<message>.+)$/;

    for (const line of output.split(/\r?\n/)) {
        const match = line.match(pattern);
        if (!match?.groups) {
            continue;
        }

        diagnostics.push({
            file: match.groups.file.replace(/\\/g, "/"),
            line: Number(match.groups.line),
            col: Number(match.groups.col),
            code: match.groups.code,
            message: match.groups.message,
        });
    }

    return diagnostics;
}

function collectIssuesByType(report, issueKey) {
    const rows = [];

    for (const issue of report.issues ?? []) {
        const matches = issue[issueKey] ?? [];
        for (const match of matches) {
            rows.push({
                file: issue.file.replace(/\\/g, "/"),
                name: match.name,
                line: match.line,
                col: match.col,
            });
        }
    }

    return rows;
}

function dedupeRows(rows, keyBuilder) {
    const seen = new Set();
    const deduped = [];

    for (const row of rows) {
        const key = keyBuilder(row);
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        deduped.push(row);
    }

    return deduped;
}

function uniqueSorted(values) {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function classifyProdFile(file) {
    const override = fileDecisionOverrides.get(file);
    if (override) {
        return override;
    }

    if (highConfidenceFilePatterns.some((pattern) => pattern.test(file))) {
        return {
            bucket: "A",
            risk: "low",
            action: "优先交给 AI 复核，确认入口链断开后直接删",
        };
    }

    if (reviewFilePatterns.some((pattern) => pattern.test(file))) {
        return {
            bucket: "B",
            risk: "medium",
            action: "先确认历史迁移与测试引用，再决定是否删",
        };
    }

    return {
        bucket: "B",
        risk: "medium",
        action: "先检查动态入口、旧逻辑或注释引用，再决定是否删",
    };
}

function escapeCell(value) {
    return String(value).replace(/\|/g, "\\|");
}

function renderTable(rows, columns) {
    if (rows.length === 0) {
        return "_None_\n";
    }

    const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
    const divider = `| ${columns.map(() => "---").join(" | ")} |`;
    const body = rows.map((row) => {
        return `| ${columns.map((column) => escapeCell(row[column.key] ?? "")).join(" | ")} |`;
    });

    return [header, divider, ...body].join("\n") + "\n";
}

function buildProdFileRows(prodReport) {
    return uniqueSorted(prodReport.files ?? []).map((file) => {
        const classification = classifyProdFile(file);
        return {
            target: file,
            symbol: "unused file",
            bucket: classification.bucket,
            risk: classification.risk,
            action: classification.action,
        };
    });
}

function buildSymbolRows(reports, typeLabel, bucket, risk, action) {
    const issueKey = typeLabel === "export" ? "exports" : "types";
    const rows = reports.flatMap((report) =>
        collectIssuesByType(report, issueKey).map((issue) => ({
            target: `${issue.file}:${issue.line}:${issue.col}`,
            symbol: issue.name,
            bucket,
            risk,
            action,
        })),
    );

    return dedupeRows(rows, (row) => `${row.target}#${row.symbol}`);
}

function buildDependencyRows(prodReport, repoReport) {
    const prodDeps = dedupeRows(
        [
            ...collectIssuesByType(prodReport, "dependencies"),
            ...collectIssuesByType(prodReport, "devDependencies"),
        ],
        (row) => `${row.file}#${row.name}`,
    );
    const repoDeps = dedupeRows(
        [
            ...collectIssuesByType(repoReport, "dependencies"),
            ...collectIssuesByType(repoReport, "devDependencies"),
        ],
        (row) => `${row.file}#${row.name}`,
    );
    const prodMap = new Map(prodDeps.map((item) => [`${item.file}#${item.name}`, item]));
    const repoMap = new Map(repoDeps.map((item) => [`${item.file}#${item.name}`, item]));
    const keys = uniqueSorted([...prodMap.keys(), ...repoMap.keys()]);

    return keys.map((key) => {
        const prodItem = prodMap.get(key);
        const repoItem = repoMap.get(key);
        const item = repoItem ?? prodItem;
        const resolvedByRepo = Boolean(prodItem) && !repoItem;

        return {
            target: `${item.file}:${item.line}:${item.col}`,
            symbol: item.name,
            bucket: resolvedByRepo ? "C" : "B",
            risk: resolvedByRepo ? "low" : "medium",
            action: resolvedByRepo
                ? "repo 审计已覆盖到对应工具链文件，保留依赖"
                : "确认上游文件或工具链配置是否真的可删，再决定是否移除依赖",
        };
    });
}

function buildUnlistedRows(repoReport) {
    return collectIssuesByType(repoReport, "unlisted").map((issue) => ({
        target: `${issue.file}:${issue.line}:${issue.col}`,
        symbol: issue.name,
        bucket: "B",
        risk: "medium",
        action: "确认测试或工具脚本是否应显式声明该依赖",
    }));
}

function buildTscRows(diagnostics) {
    return diagnostics.map((diagnostic) => ({
        target: `${diagnostic.file}:${diagnostic.line}:${diagnostic.col}`,
        code: `TS${diagnostic.code}`,
        detail: diagnostic.message,
    }));
}

function buildPriorityChecks(prodReport) {
    const files = uniqueSorted(prodReport.files ?? []);
    return priorityCheckRules
        .filter((rule) => files.some((file) => rule.pattern.test(file)))
        .map((rule) => rule.note);
}

function renderReport({ prodReport, repoReport, tscDiagnostics }) {
    const prodFileRows = buildProdFileRows(prodReport);
    const exportRows = buildSymbolRows(
        [prodReport, repoReport],
        "export",
        "B",
        "medium",
        "确认调用链后再删",
    );
    const typeRows = buildSymbolRows(
        [prodReport, repoReport],
        "type",
        "B",
        "medium",
        "确认类型外部约定后再删",
    );
    const dependencyRows = buildDependencyRows(prodReport, repoReport);
    const unlistedRows = buildUnlistedRows(repoReport);
    const tscRows = buildTscRows(tscDiagnostics);
    const priorityChecks = buildPriorityChecks(prodReport);

    const aRows = prodFileRows.filter((row) => row.bucket === "A");
    const bRows = [
        ...prodFileRows.filter((row) => row.bucket === "B"),
        ...exportRows,
        ...typeRows,
        ...dependencyRows.filter((row) => row.bucket === "B"),
        ...unlistedRows,
    ];
    const cRows = dependencyRows.filter((row) => row.bucket === "C");

    const generatedAt = new Date().toISOString();

    return `# 死代码审计候选清单

- 生成时间: ${generatedAt}
- 生成命令: \`pnpm run audit:deadcode\`
- 生产侧 Knip: ${prodReport.files.length} 个 unused files, ${collectIssuesByType(prodReport, "exports").length} 个 unused exports, ${collectIssuesByType(prodReport, "types").length} 个 unused exported types
- 全仓库 Knip: ${repoReport.files.length} 个 unused files, ${collectIssuesByType(repoReport, "exports").length} 个 unused exports, ${collectIssuesByType(repoReport, "types").length} 个 unused exported types
- src-only TypeScript: ${tscDiagnostics.length} 条未使用局部变量/参数诊断

## 使用约定

- A 档: 高置信可删候选。无明显运行时入口，适合优先交给 AI 复核。
- B 档: 需要 AI / 人工复核。通常仍和旧逻辑、迁移链路、测试或符号级引用有关。
- C 档: 配置覆盖或动态装配带来的噪音，不进入当前删减名单。

## A 档: 高置信可删候选

${renderTable(aRows, [
    { key: "target", label: "文件/符号" },
    { key: "bucket", label: "归类" },
    { key: "risk", label: "误判风险" },
    { key: "action", label: "推荐动作" },
])}
## B 档: 需要 AI / 人工复核

${renderTable(bRows, [
    { key: "target", label: "文件/符号" },
    { key: "symbol", label: "命中项" },
    { key: "bucket", label: "归类" },
    { key: "risk", label: "误判风险" },
    { key: "action", label: "推荐动作" },
])}
## C 档: 误报或配置型噪音

${renderTable(cRows, [
    { key: "target", label: "文件/符号" },
    { key: "symbol", label: "命中项" },
    { key: "bucket", label: "归类" },
    { key: "risk", label: "误判风险" },
    { key: "action", label: "推荐动作" },
])}
## src/** 局部垃圾候选

${renderTable(tscRows, [
    { key: "target", label: "文件/符号" },
    { key: "code", label: "类型" },
    { key: "detail", label: "诊断" },
])}
## 高优先级人工抽查

${priorityChecks.length > 0 ? priorityChecks.join("\n") : "_None_"}
`;
}

function main() {
    const prodResult = runTool(
        "knip-production",
        ["exec", "knip", "--config", "knip.json", "--production", "--reporter", "json", "--no-config-hints", "--no-exit-code"],
        true,
    );
    const repoResult = runTool(
        "knip-repo",
        ["exec", "knip", "--config", "knip.repo.json", "--reporter", "json", "--no-config-hints", "--no-exit-code"],
        true,
    );
    const tscResult = runTool(
        "tsc-src-unused",
        ["exec", "tsc", "--project", "tsconfig.audit.json", "--pretty", "false", "--noEmit"],
        true,
    );

    const prodReport = parseJsonOutput(prodResult);
    const repoReport = parseJsonOutput(repoResult);
    const tscDiagnostics = parseTscDiagnostics(`${tscResult.stdout}\n${tscResult.stderr}`);
    const report = renderReport({ prodReport, repoReport, tscDiagnostics });

    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, report, "utf8");

    process.stdout.write(`Wrote dead code audit report to ${outputPath}\n`);
    process.stdout.write(
        `Summary: prod files=${prodReport.files.length}, repo files=${repoReport.files.length}, src diagnostics=${tscDiagnostics.length}\n`,
    );

    if (prodResult.status !== 0 || repoResult.status !== 0 || tscResult.status !== 0) {
        process.exitCode = 1;
    }
}

main();
