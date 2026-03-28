import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import fs from "fs";
import path from "path";

const prod = process.argv[2] === "production";

const CURRENT_DIR = process.cwd();
const PARENT_DIR = path.dirname(CURRENT_DIR);
const PROJECT_ROOT =
    path.basename(PARENT_DIR) === ".worktrees"
        ? path.resolve(CURRENT_DIR, "..", "..")
        : CURRENT_DIR;
const OBSIDIAN_PLUGIN_DIR = path.join(PROJECT_ROOT, "plugin_test", ".obsidian", "plugins", "syro");
const SOURCEMAP_MODE = prod ? false : "inline";

function copyToObsidian() {
    try {
        if (!fs.existsSync(OBSIDIAN_PLUGIN_DIR)) {
            fs.mkdirSync(OBSIDIAN_PLUGIN_DIR, { recursive: true });
        }

        const mainSrc = "./build/main.js";
        const mainDest = path.join(OBSIDIAN_PLUGIN_DIR, "main.js");
        if (fs.existsSync(mainSrc)) {
            fs.copyFileSync(mainSrc, mainDest);
            console.log("[copy] ✅ main.js → Obsidian");
        }

        const manifestSrc = "./manifest.json";
        const manifestDest = path.join(OBSIDIAN_PLUGIN_DIR, "manifest.json");
        if (fs.existsSync(manifestSrc)) {
            fs.copyFileSync(manifestSrc, manifestDest);
            console.log("[copy] ✅ manifest.json → Obsidian");
        }

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

function shouldUseReactJsx(filePath) {
    const normalized = filePath.replace(/\\/g, "/");

    if (normalized.includes("/src/ui/") && normalized.endsWith(".tsx")) {
        return true;
    }

    if (normalized.endsWith("/settings-react.tsx")) {
        return true;
    }

    if (normalized.endsWith("/ReactDeckUI.tsx")) {
        return true;
    }

    if (normalized.endsWith("/ReactCardUI.tsx")) {
        return true;
    }

    if (normalized.endsWith("/ReactNoteReviewView.tsx")) {
        return true;
    }

    return false;
}

const reactJsxPlugin = {
    name: "react-jsx",
    setup(build) {
        build.onLoad({ filter: /\.tsx$/ }, async (args) => {
            if (!shouldUseReactJsx(args.path)) {
                return null;
            }

            const source = await fs.promises.readFile(args.path, "utf8");

            const result = await esbuild.transform(source, {
                loader: "tsx",
                jsx: "automatic",
                sourcefile: args.path,
                sourcemap: SOURCEMAP_MODE,
            });

            return {
                contents: result.code,
                loader: "js",
            };
        });
    },
};

const framerMotionOptionalPeerPlugin = {
    name: "framer-motion-optional-peer",
    setup(build) {
        build.onLoad(
            { filter: /[\\/]framer-motion[\\/].*[\\/]filter-props\.mjs$/ },
            async (args) => {
                const source = await fs.promises.readFile(args.path, "utf8");
                const requireSnippet =
                    'loadExternalIsValidProp(require("@emotion/is-prop-valid").default);';

                if (!source.includes(requireSnippet)) {
                    return null;
                }

                const patchedSource =
                    'import isPropValid from "@emotion/is-prop-valid";\n' +
                    source.replace(requireSnippet, "loadExternalIsValidProp(isPropValid);");

                return {
                    contents: patchedSource,
                    loader: "js",
                    resolveDir: path.dirname(args.path),
                };
            },
        );
    },
};

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

const tailwindPlugin = {
    name: "tailwind-css",
    setup(build) {
        build.onEnd(async () => {
            const inputPath = "./src/ui/styles/tailwind.css";

            if (!fs.existsSync(inputPath)) {
                console.log("[tailwind-css] 跳过: src/ui/styles/tailwind.css 不存在");
                return;
            }

            try {
                const css = fs.readFileSync(inputPath, "utf8");

                const postcssImport = (await import("postcss-import")).default;

                const result = await postcss([
                    postcssImport(),
                    tailwindcss("./tailwind.config.js"),
                    autoprefixer,
                ]).process(css, { from: inputPath });

                const outputStylePath = "./build/styles.css";
                const esbuildCssPath = "./build/main.css";
                if (fs.existsSync(esbuildCssPath)) {
                    try {
                        fs.unlinkSync(esbuildCssPath);
                        console.log("[tailwind-css] 🧹 已删除 build/main.css，避免重复注入 CSS");
                    } catch (e) {
                        console.error("[tailwind-css] ⚠️ 删除 build/main.css 失败", e);
                    }
                }

                const fullCss = dedupeStyleSettingsBlocks(result.css);

                const tailwindMarkerStart = "/* === TAILWIND CSS START === */";
                const tailwindMarkerEnd = "/* === TAILWIND CSS END === */";

                const tailwindSection = `${tailwindMarkerStart}\n${fullCss}\n${tailwindMarkerEnd}`;

                fs.writeFileSync(outputStylePath, tailwindSection);
                console.log(
                    `[tailwind-css] ✅ 样式已合并 (Length: ${tailwindSection.length}, Contains sr-deck-row: ${tailwindSection.includes("sr-deck-row")})`,
                );
            } catch (err) {
                console.error("[tailwind-css] ❌ 编译失败:", err);
            }
        });
    },
};

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
    external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtins],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: SOURCEMAP_MODE,
    sourcesContent: !prod,
    treeShaking: true,
    outfile: "build/main.js",
    jsx: "transform",
    jsxFactory: "h",
    jsxFragment: "Fragment",
    plugins: [reactJsxPlugin, framerMotionOptionalPeerPlugin, tailwindPlugin, copyPlugin],
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
