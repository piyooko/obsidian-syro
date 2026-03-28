const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const DEFAULT_SOURCE_DIR = "src";
const DEFAULT_EXTENSIONS = new Set([".ts", ".tsx"]);
const DEFAULT_EXCLUDED_DIRS = new Set([
    "tests",
    "test",
    "build",
    "site",
    "plugin_test",
    "node_modules",
    "coverage",
    "dist",
]);
const TARGET_METHOD_NAMES = new Set([
    "setName",
    "setDesc",
    "setTitle",
    "setPlaceholder",
    "setButtonText",
    "appendText",
]);
const EXPORT_NAME_HINT = /(template|content|tutorial|message|text)/i;
const FORMULA_TOKENS = new Set(["next", "curr", "imp", "round", "d"]);

function normalizeSlashes(value) {
    return value.split(path.sep).join("/");
}

function normalizeText(value) {
    return value.replace(/\s+/g, " ").trim();
}

function loadAllowlist(allowlistPath) {
    if (!allowlistPath || !fs.existsSync(allowlistPath)) {
        return [];
    }

    const parsed = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
    return Array.isArray(parsed?.entries) ? parsed.entries : [];
}

function collectSourceFiles(rootDir, sourceDir = DEFAULT_SOURCE_DIR) {
    const baseDir = path.join(rootDir, sourceDir);
    if (!fs.existsSync(baseDir)) {
        return [];
    }

    const files = [];
    const visit = (currentDir) => {
        for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (DEFAULT_EXCLUDED_DIRS.has(entry.name)) {
                    continue;
                }
                visit(fullPath);
                continue;
            }

            if (DEFAULT_EXTENSIONS.has(path.extname(entry.name))) {
                files.push(fullPath);
            }
        }
    };

    visit(baseDir);
    return files.filter((filePath) => {
        const relativePath = normalizeSlashes(path.relative(rootDir, filePath));
        return !relativePath.startsWith("src/lang/locale/");
    });
}

function isAllowlisted(relativePath, text, allowlist) {
    const normalizedPath = normalizeSlashes(relativePath);
    const normalizedText = normalizeText(text);

    return allowlist.some((entry) => {
        const matchesFile = !entry.file || normalizeSlashes(entry.file) === normalizedPath;
        const matchesText =
            !Array.isArray(entry.textIncludes) ||
            entry.textIncludes.some((fragment) => normalizedText.includes(normalizeText(fragment)));
        return matchesFile && matchesText;
    });
}

function hasVisibleLetters(text) {
    return /[\p{L}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
        text,
    );
}

function looksLikePath(text) {
    return (
        /[\\/]/.test(text) ||
        /\.(md|markdown|json|ya?ml|txt|png|jpe?g|gif|svg|webp|css|scss|sass|html?)$/i.test(text)
    );
}

function looksLikeCssSelector(text) {
    return /^[.#[]/.test(text) || /(^|[\s>+~])[.#][A-Za-z0-9_-]+/.test(text);
}

function looksLikeIdentifier(text) {
    return (
        /^[A-Z0-9_:-]{2,}$/.test(text) ||
        (/^[a-z0-9_.:-]+$/i.test(text) && /[._:-]/.test(text)) ||
        /^[a-z]+(?:-[a-z0-9]+)+$/i.test(text)
    );
}

function isPurePlaceholder(text) {
    return /^(?:\d+(?:\.\d+)?[a-z%]*)(?:\s+\d+(?:\.\d+)?[a-z%]*)*$/i.test(text);
}

function looksLikeFormula(text) {
    return (
        /[=/*]/.test(text) &&
        /[A-Za-z]/.test(text) &&
        /^[A-Za-z0-9_${}\s.,:+\-*/()%[\]]+$/.test(text)
    );
}

function isVisibleTextCandidate(text) {
    const normalized = normalizeText(text);
    if (!normalized || !hasVisibleLetters(normalized)) {
        return false;
    }

    if (
        looksLikePath(normalized) ||
        looksLikeCssSelector(normalized) ||
        looksLikeIdentifier(normalized) ||
        isPurePlaceholder(normalized) ||
        looksLikeFormula(normalized)
    ) {
        return false;
    }

    if (/^[A-Za-z]$/.test(normalized)) {
        return false;
    }

    if (/^[A-Za-z]+$/.test(normalized) && FORMULA_TOKENS.has(normalized.toLowerCase())) {
        return false;
    }

    return true;
}

function shouldScanConsole(relativePath, methodName) {
    if (methodName !== "error" && methodName !== "warn") {
        return false;
    }

    return (
        relativePath === "src/main.ts" ||
        relativePath.startsWith("src/ui/") ||
        relativePath.startsWith("src/services/")
    );
}

function isNaturalLanguageLog(text) {
    const normalized = normalizeText(text);
    if (!isVisibleTextCandidate(normalized)) {
        return false;
    }

    if (/^\[[^\]]+\]/.test(normalized)) {
        return false;
    }

    if (/[a-z][A-Z]|[_%]/.test(normalized) || /\b[A-Z]{2,}\b/.test(normalized)) {
        return false;
    }

    if (normalized.endsWith(":") && !/[\p{Script=Han}]/u.test(normalized)) {
        return false;
    }

    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    return /[\p{Script=Han}]/u.test(normalized) || wordCount >= 4;
}

function getStringCandidates(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return [{ node, text: node.text }];
    }

    if (ts.isTemplateExpression(node)) {
        let text = node.head.text;
        for (const span of node.templateSpans) {
            text += "${}" + span.literal.text;
        }
        return [{ node, text }];
    }

    return [];
}

function getPropertyName(node) {
    if (!node) {
        return null;
    }

    if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
        return node.text;
    }

    return null;
}

function createFinding(sourceFile, rootDir, node, kind, text) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return {
        filePath: sourceFile.fileName,
        relativePath: normalizeSlashes(path.relative(rootDir, sourceFile.fileName)),
        line: line + 1,
        column: character + 1,
        kind,
        text: normalizeText(text),
    };
}

function scanExportedInitializer(initializer, exportName, report) {
    if (!initializer) {
        return;
    }

    for (const candidate of getStringCandidates(initializer)) {
        report(candidate.node, "exported-template", candidate.text);
    }

    if (ts.isObjectLiteralExpression(initializer)) {
        for (const property of initializer.properties) {
            if (!ts.isPropertyAssignment(property)) {
                continue;
            }

            const propertyName = getPropertyName(property.name) ?? exportName;
            scanExportedInitializer(property.initializer, propertyName, report);
        }
        return;
    }

    if (ts.isArrayLiteralExpression(initializer)) {
        initializer.elements.forEach((element) =>
            scanExportedInitializer(element, exportName, report),
        );
    }
}

function scanI18nFile(filePath, options = {}) {
    const rootDir = options.rootDir ?? process.cwd();
    const allowlist = options.allowlist ?? [];
    const relativePath = normalizeSlashes(path.relative(rootDir, filePath));
    if (relativePath.startsWith("src/lang/locale/")) {
        return [];
    }

    const sourceText = fs.readFileSync(filePath, "utf8");
    const scriptKind = path.extname(filePath) === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        scriptKind,
    );
    const findings = [];

    const report = (node, kind, text) => {
        const normalized = normalizeText(text);
        if (!normalized) {
            return;
        }

        const isConsole = kind === "console";
        const isVisibleCandidate = isConsole
            ? isNaturalLanguageLog(normalized)
            : isVisibleTextCandidate(normalized);
        if (!isVisibleCandidate) {
            return;
        }

        if (isAllowlisted(relativePath, normalized, allowlist)) {
            return;
        }

        findings.push(createFinding(sourceFile, rootDir, node, kind, normalized));
    };

    const visit = (node) => {
        if (
            ts.isNewExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === "Notice" &&
            node.arguments?.length
        ) {
            getStringCandidates(node.arguments[0]).forEach((candidate) => {
                report(candidate.node, "notice", candidate.text);
            });
        }

        if (ts.isCallExpression(node)) {
            if (ts.isPropertyAccessExpression(node.expression)) {
                const methodName = node.expression.name.text;
                if (TARGET_METHOD_NAMES.has(methodName) && node.arguments.length > 0) {
                    getStringCandidates(node.arguments[0]).forEach((candidate) => {
                        report(candidate.node, methodName, candidate.text);
                    });
                }

                if (
                    ts.isIdentifier(node.expression.expression) &&
                    node.expression.expression.text === "console" &&
                    shouldScanConsole(relativePath, methodName) &&
                    node.arguments.length > 0
                ) {
                    getStringCandidates(node.arguments[0]).forEach((candidate) => {
                        report(candidate.node, "console", candidate.text);
                    });
                }
            }
        }

        if (ts.isJsxText(node)) {
            report(node, "jsx-text", node.getText(sourceFile));
        }

        if (ts.isVariableStatement(node)) {
            const isExported = node.modifiers?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
            );
            if (isExported) {
                for (const declaration of node.declarationList.declarations) {
                    const exportName = ts.isIdentifier(declaration.name)
                        ? declaration.name.text
                        : "";
                    if (EXPORT_NAME_HINT.test(exportName)) {
                        scanExportedInitializer(declaration.initializer, exportName, report);
                    }
                }
            }
        }

        ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    findings.sort((left, right) => {
        if (left.line !== right.line) {
            return left.line - right.line;
        }
        return left.column - right.column;
    });

    return findings;
}

function scanI18nProject(options = {}) {
    const rootDir = options.rootDir ?? process.cwd();
    const allowlist =
        options.allowlist ??
        loadAllowlist(
            options.allowlistPath ?? path.join(rootDir, "scripts/check-i18n-allowlist.json"),
        );
    const files =
        options.files ?? collectSourceFiles(rootDir, options.sourceDir ?? DEFAULT_SOURCE_DIR);

    return files
        .flatMap((filePath) => scanI18nFile(filePath, { rootDir, allowlist }))
        .sort((left, right) => {
            if (left.relativePath !== right.relativePath) {
                return left.relativePath.localeCompare(right.relativePath);
            }
            if (left.line !== right.line) {
                return left.line - right.line;
            }
            return left.column - right.column;
        });
}

module.exports = {
    collectSourceFiles,
    loadAllowlist,
    scanI18nFile,
    scanI18nProject,
};
