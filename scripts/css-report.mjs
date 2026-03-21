import fs from "fs";
import path from "path";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const uiRoot = path.join(srcRoot, "ui");
const tailwindEntry = path.join(uiRoot, "styles", "tailwind.css");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".md"]);

function walkFiles(dir) {
    if (!fs.existsSync(dir)) return [];

    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkFiles(fullPath));
        } else if (entry.isFile()) {
            results.push(fullPath);
        }
    }
    return results;
}

function toPosix(filePath) {
    return filePath.replace(/\\/g, "/");
}

function rel(filePath) {
    return toPosix(path.relative(root, filePath));
}

function read(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function resolveReference(fromFile, specifier) {
    if (!specifier.endsWith(".css")) return null;
    const absolute = path.resolve(path.dirname(fromFile), specifier);
    return fs.existsSync(absolute) ? absolute : null;
}

function collectCssReferences(files) {
    const references = new Map();
    const importRegex = /import\s+(?:[^"'`]+?\s+from\s+)?["']([^"']+\.css)["']/g;
    const atImportRegex = /@import\s+["']([^"']+\.css)["']/g;

    for (const file of files) {
        const content = read(file);
        for (const regex of [importRegex, atImportRegex]) {
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(content)) !== null) {
                const resolved = resolveReference(file, match[1]);
                if (!resolved) continue;
                if (!references.has(resolved)) references.set(resolved, []);
                references.get(resolved).push(file);
            }
        }
    }

    return references;
}

function collectSrClassDefinitions(cssFiles) {
    const classToFiles = new Map();

    for (const file of cssFiles) {
        const content = read(file);
        const matches = content.match(/\.sr-[A-Za-z0-9_-]+/g) ?? [];
        const classes = new Set(matches.map((value) => value.slice(1)));
        for (const className of classes) {
            if (!classToFiles.has(className)) classToFiles.set(className, []);
            classToFiles.get(className).push(file);
        }
    }

    return classToFiles;
}

function collectClassUsages(classNames, files) {
    const usages = new Map();
    for (const className of classNames) usages.set(className, []);

    for (const file of files) {
        const content = read(file);
        for (const className of classNames) {
            if (content.includes(className)) {
                usages.get(className).push(file);
            }
        }
    }

    return usages;
}

const allUiFiles = walkFiles(uiRoot);
const cssFiles = allUiFiles.filter((file) => path.extname(file) === ".css");
const reportCssFiles = cssFiles.filter((file) => file !== tailwindEntry);
const sourceFiles = walkFiles(srcRoot).filter((file) => sourceExtensions.has(path.extname(file)));
const nonCssSourceFiles = sourceFiles.filter((file) => path.extname(file) !== ".css");

const cssReferences = collectCssReferences([...sourceFiles, ...cssFiles]);
const directImportOnly = new Map(
    [...cssReferences.entries()].filter(([_, referrers]) =>
        referrers.some((file) => sourceExtensions.has(path.extname(file))),
    ),
);

const unreferencedCssFiles = reportCssFiles
    .filter((file) => !cssReferences.has(file))
    .sort((a, b) => rel(a).localeCompare(rel(b)));

const classDefinitions = collectSrClassDefinitions(reportCssFiles);
const classUsages = collectClassUsages([...classDefinitions.keys()], nonCssSourceFiles);
const unusedSrClasses = [...classDefinitions.entries()]
    .filter(([className]) => (classUsages.get(className) ?? []).length === 0)
    .sort(([a], [b]) => a.localeCompare(b));
const duplicateSrClasses = [...classDefinitions.entries()]
    .filter(([_, files]) => files.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));

const basenameToFiles = new Map();
for (const file of reportCssFiles) {
    const name = path.basename(file);
    if (!basenameToFiles.has(name)) basenameToFiles.set(name, []);
    basenameToFiles.get(name).push(file);
}
const duplicateBasenames = [...basenameToFiles.entries()]
    .filter(([_, files]) => files.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));

console.log("CSS Report");
console.log(`root: ${root}`);
console.log(`ui css files scanned: ${reportCssFiles.length}`);
console.log(`tailwind entry: ${rel(tailwindEntry)}`);
console.log("");

console.log("Build note");
console.log("- esbuild.config.mjs currently bundles all src/ui/*.css recursively.");
console.log("- A file can be bundled even if it has no direct import or @import.");
console.log("");

console.log("Directly unreferenced CSS files");
if (unreferencedCssFiles.length === 0) {
    console.log("- none");
} else {
    for (const file of unreferencedCssFiles) {
        console.log(`- ${rel(file)}`);
    }
}
console.log("");

console.log("Duplicate CSS basenames");
if (duplicateBasenames.length === 0) {
    console.log("- none");
} else {
    for (const [name, files] of duplicateBasenames) {
        console.log(`- ${name}`);
        for (const file of files) {
            console.log(`  ${rel(file)}`);
        }
    }
}
console.log("");

console.log("Suspicious unused .sr-* classes");
if (unusedSrClasses.length === 0) {
    console.log("- none");
} else {
    for (const [className, files] of unusedSrClasses) {
        console.log(`- ${className} :: ${files.map(rel).join(", ")}`);
    }
}
console.log("");

console.log("Duplicate .sr-* class definitions");
if (duplicateSrClasses.length === 0) {
    console.log("- none");
} else {
    for (const [className, files] of duplicateSrClasses) {
        console.log(`- ${className}`);
        for (const file of files) {
            console.log(`  ${rel(file)}`);
        }
    }
}
console.log("");

console.log("Referenced CSS files");
for (const file of [...reportCssFiles].sort((a, b) => rel(a).localeCompare(rel(b)))) {
    const referrers = cssReferences.get(file) ?? [];
    const sourceReferrers = (directImportOnly.get(file) ?? []).map(rel);
    const cssReferrers = referrers.filter((referrer) => path.extname(referrer) === ".css").map(rel);

    if (sourceReferrers.length === 0 && cssReferrers.length === 0) continue;

    console.log(`- ${rel(file)}`);
    if (sourceReferrers.length > 0) {
        console.log(`  source: ${sourceReferrers.join(", ")}`);
    }
    if (cssReferrers.length > 0) {
        console.log(`  css: ${cssReferrers.join(", ")}`);
    }
}
