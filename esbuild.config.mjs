import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import fs from "fs";
import path from "path";

const prod = process.argv[2] === "production";

// Obsidian 插件目录（用于构建后自动复制）
const CURRENT_DIR = process.cwd();
const PARENT_DIR = path.dirname(CURRENT_DIR);
const PROJECT_ROOT =
    path.basename(PARENT_DIR) === ".worktrees"
        ? path.resolve(CURRENT_DIR, "..", "..")
        : CURRENT_DIR;
const OBSIDIAN_PLUGIN_DIR = path.join(PROJECT_ROOT, "plugin_test", ".obsidian", "plugins", "syro");

/**
 * 复制文件到 Obsidian 插件目录
 */
function copyToObsidian() {
    // 每次构建（包括生产模式）都执行复制

    try {
        // 确保目标目录存在
        if (!fs.existsSync(OBSIDIAN_PLUGIN_DIR)) {
            fs.mkdirSync(OBSIDIAN_PLUGIN_DIR, { recursive: true });
        }

        // 复制 main.js
        const mainSrc = "./build/main.js";
        const mainDest = path.join(OBSIDIAN_PLUGIN_DIR, "main.js");
        if (fs.existsSync(mainSrc)) {
            fs.copyFileSync(mainSrc, mainDest);
            console.log("[copy] ✅ main.js → Obsidian");
        }

        // 复制 manifest.json
        const manifestSrc = "./manifest.json";
        const manifestDest = path.join(OBSIDIAN_PLUGIN_DIR, "manifest.json");
        if (fs.existsSync(manifestSrc)) {
            fs.copyFileSync(manifestSrc, manifestDest);
            console.log("[copy] ✅ manifest.json → Obsidian");
        }

        // 复制 styles.css
        const stylesSrc = "./build/styles.css";
        const stylesDest = path.join(OBSIDIAN_PLUGIN_DIR, "styles.css");
        if (fs.existsSync(stylesSrc)) {
            fs.copyFileSync(stylesSrc, stylesDest);
            console.log("[copy] ✅ styles.css → Obsidian");
        }
    } catch (err) {
        console.error("[copy] ❌ 复制失败:", err.message);
    }
}

/**
 * 判断文件是否需要使用 React JSX 处理
 * - src/ui/ 目录下的所有 TSX 文件
 * - src/gui/settings-react.tsx (React 版设置面板)
 * - src/gui/ReactDeckUI.tsx (React 版牌组树)
 */
function shouldUseReactJsx(filePath) {
    const normalized = filePath.replace(/\\/g, "/");

    // src/ui/ 目录下的所有 TSX 文件
    if (normalized.includes("/src/ui/") && normalized.endsWith(".tsx")) {
        return true;
    }

    // settings-react.tsx 使用 React
    if (normalized.endsWith("/settings-react.tsx")) {
        return true;
    }

    // ReactDeckUI.tsx 使用 React
    if (normalized.endsWith("/ReactDeckUI.tsx")) {
        return true;
    }

    // ReactCardUI.tsx 使用 React (新增)
    if (normalized.endsWith("/ReactCardUI.tsx")) {
        return true;
    }

    // ReactNoteReviewView.tsx 使用 React (笔记复习侧边栏)
    if (normalized.endsWith("/ReactNoteReviewView.tsx")) {
        return true;
    }

    return false;
}

/**
 * 自定义插件：为特定文件使用 React JSX
 * 其他 TSX 文件使用 vhtml (h 函数)
 */
const reactJsxPlugin = {
    name: "react-jsx",
    setup(build) {
        // 拦截所有 TSX 文件，检查是否需要 React 处理
        build.onLoad({ filter: /\.tsx$/ }, async (args) => {
            if (!shouldUseReactJsx(args.path)) {
                return null; // 让默认处理器处理
            }

            const source = await fs.promises.readFile(args.path, "utf8");

            // 使用 esbuild 的 transform API 单独处理这个文件，使用 React JSX
            const result = await esbuild.transform(source, {
                loader: "tsx",
                jsx: "automatic", // React 17+ 自动 JSX
                sourcefile: args.path,
                sourcemap: "inline",
            });

            return {
                contents: result.code,
                loader: "js",
            };
        });
    },
};

/**
 * 递归收集目录下所有 CSS 文件
 * @param {string} dir - 要扫描的目录
 * @param {string[]} excludeFiles - 要排除的文件名
 * @returns {string[]} - CSS 文件路径数组
 */
function collectCssFiles(dir, excludeFiles = []) {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // 递归扫描子目录
            results.push(...collectCssFiles(fullPath, excludeFiles));
        } else if (
            entry.isFile() &&
            entry.name.endsWith(".css") &&
            !excludeFiles.includes(entry.name)
        ) {
            results.push(fullPath);
        }
    }
    return results;
}

function dedupeStyleSettingsBlocks(cssText) {
    const settingsBlockRegex = /\/\*\s*@settings[\s\S]*?\*\//g;
    const seenIds = new Set();

    return cssText
        .replace(settingsBlockRegex, (block) => {
            const idMatch = block.match(/^\s*id:\s*(.+)$/m);
            const blockId = idMatch ? idMatch[1].trim() : block.trim();

            if (seenIds.has(blockId)) {
                return "";
            }

            seenIds.add(blockId);
            return block;
        })
        .replace(/\n{3,}/g, "\n\n");
}

/**
 * 自定义 CSS 插件：处理 Tailwind CSS 编译
 * 将 src/ui/styles/tailwind.css 编译并追加到 styles.css
 * 同时收集 src/ui/ 目录下的所有 CSS 文件
 */
const tailwindPlugin = {
    name: "tailwind-css",
    setup(build) {
        build.onEnd(async () => {
            const inputPath = "./src/ui/styles/tailwind.css";

            // 如果输入文件不存在，跳过
            if (!fs.existsSync(inputPath)) {
                console.log("[tailwind-css] 跳过: src/ui/styles/tailwind.css 不存在");
                return;
            }

            try {
                const css = fs.readFileSync(inputPath, "utf8");

                // 动态导入 postcss-import
                const postcssImport = (await import("postcss-import")).default;

                // 编译 Tailwind (包含 postcss-import 处理 @import)
                const result = await postcss([
                    postcssImport(), // 处理 @import 语句
                    tailwindcss("./tailwind.config.js"),
                    autoprefixer,
                ]).process(css, { from: inputPath });

                // 递归收集 src/ui/ 目录下的所有 CSS 文件（排除 tailwind.css 入口）
                const uiDir = "./src/ui";
                const cssFiles = collectCssFiles(uiDir, ["tailwind.css"]);

                let componentStyles = "";
                for (const cssFile of cssFiles) {
                    const relativePath = path.relative(".", cssFile);
                    componentStyles += `\n/* === ${relativePath} === */\n`;
                    componentStyles += fs.readFileSync(cssFile, "utf8") + "\n";
                }

                console.log(`[tailwind-css] 📁 收集到 ${cssFiles.length} 个 CSS 文件:`);
                cssFiles.forEach((f) => console.log(`  - ${path.relative(".", f)}`));

                // 读取现有的 build/styles.css
                const outputStylePath = "./build/styles.css";
                const existingStyles = fs.existsSync(outputStylePath)
                    ? fs.readFileSync(outputStylePath, "utf8")
                    : "";

                // 读取并合并 build/main.css (由 imports 生成)
                const esbuildCssPath = "./build/main.css";
                let esbuildCss = "";
                if (fs.existsSync(esbuildCssPath)) {
                    esbuildCss = fs.readFileSync(esbuildCssPath, "utf8");
                    try {
                        fs.unlinkSync(esbuildCssPath);
                        console.log("[tailwind-css] 📦 已合并并删除 build/main.css");
                    } catch (e) {
                        console.error("[tailwind-css] ⚠️ 删除 build/main.css 失败", e);
                    }
                }

                // 合并所有样式
                const fullCss = dedupeStyleSettingsBlocks(
                    result.css +
                        "\n\n/* === COMPONENT STYLES === */\n" +
                        componentStyles +
                        "\n\n/* === ESBUILD IMPORTS === */\n" +
                        esbuildCss,
                );

                // 查找并替换或追加 Tailwind 区域
                const tailwindMarkerStart = "/* === TAILWIND CSS START === */";
                const tailwindMarkerEnd = "/* === TAILWIND CSS END === */";

                const tailwindSection = `${tailwindMarkerStart}\n${fullCss}\n${tailwindMarkerEnd}`;

                let newStyles;
                if (existingStyles.includes(tailwindMarkerStart)) {
                    const regex = new RegExp(
                        `${tailwindMarkerStart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${tailwindMarkerEnd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
                        "g",
                    );
                    newStyles = existingStyles.replace(regex, tailwindSection);
                } else {
                    newStyles = existingStyles + "\n\n" + tailwindSection;
                }

                fs.writeFileSync(outputStylePath, newStyles);
                console.log(
                    `[tailwind-css] ✅ 样式已合并 (Length: ${newStyles.length}, Contains sr-deck-row: ${newStyles.includes("sr-deck-row")})`,
                );
            } catch (err) {
                console.error("[tailwind-css] ❌ 编译失败:", err);
            }
        });
    },
};

/**
 * 复制到 Obsidian 插件目录的插件
 */
const copyPlugin = {
    name: "copy-to-obsidian",
    setup(build) {
        build.onEnd(() => {
            copyToObsidian();
        });
    },
};

const context = await esbuild.context({
    entryPoints: ["src/main.ts"],
    loader: {
        ".md": "text",
        ".png": "dataurl",
    },
    bundle: true,
    external: [
        "obsidian",
        "electron",
        "@codemirror/*",
        "@lezer/*",
        ...builtins,
        // 注意：React 和 framer-motion 等需要被打包进去，不要排除
    ],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: "inline",
    sourcesContent: !prod,
    treeShaking: true,
    outfile: "build/main.js",
    // 默认使用 vhtml 的 h 函数（用于 src/gui/ 下的旧代码）
    jsx: "transform",
    jsxFactory: "h",
    jsxFragment: "Fragment",
    // 插件：React JSX 插件放在最前面，它会拦截需要 React 处理的文件
    plugins: [reactJsxPlugin, tailwindPlugin, copyPlugin],
    // 定义全局替换（生产模式优化）
    define: {
        "process.env.NODE_ENV": prod ? '"production"' : '"development"',
    },
});

if (prod) {
    context.rebuild().catch(() => process.exit(1));
    context.dispose();
} else {
    console.log(`[dev] 监视模式已启动`);
    console.log(`[dev] React JSX: src/ui/*.tsx, settings-react.tsx`);
    console.log(`[dev] vhtml (h): 其他 *.tsx 文件`);
    console.log(`[dev] 构建产物将自动复制到: ${OBSIDIAN_PLUGIN_DIR}`);
    context.watch().catch(() => process.exit(1));
}
