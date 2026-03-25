import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadAllowlist, scanI18nProject } = require("./check-i18n-core.cjs");

const rootDir = process.cwd();
const allowlistPath = path.join(rootDir, "scripts", "check-i18n-allowlist.json");
const allowlist = loadAllowlist(allowlistPath);
const findings = scanI18nProject({ rootDir, allowlist });

if (findings.length === 0) {
    console.log("check:i18n passed: no hardcoded user-facing text detected.");
    process.exit(0);
}

console.error(`check:i18n failed with ${findings.length} finding(s):`);
for (const finding of findings) {
    console.error(
        `- ${finding.relativePath}:${finding.line}:${finding.column} [${finding.kind}] ${finding.text}`,
    );
}
process.exit(1);
