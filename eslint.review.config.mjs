import eslintComments from "eslint-plugin-eslint-comments";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

const reviewGlobals = {
    cancelAnimationFrame: "readonly",
    clearTimeout: "readonly",
    console: "readonly",
    crypto: "readonly",
    createEl: "readonly",
    createFragment: "readonly",
    document: "readonly",
    DOMParser: "readonly",
    getComputedStyle: "readonly",
    navigator: "readonly",
    performance: "readonly",
    process: "readonly",
    requestAnimationFrame: "readonly",
    setTimeout: "readonly",
    window: "readonly",
};

export default tseslint.config(
    {
        ignores: ["build/**", "coverage/**", "docs/**", "site/**", "plugin_test/**"],
    },
    ...obsidianmd.configs.recommendedWithLocalesEn,
    {
        files: ["src/**/*.ts", "src/**/*.tsx"],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: "./tsconfig.json",
            },
            globals: reviewGlobals,
        },
        plugins: {
            "eslint-comments": eslintComments,
            obsidianmd,
        },
        rules: {
            "obsidianmd/prefer-file-manager-trash-file": "error",
            "no-console": ["error", { allow: ["warn", "error", "debug"] }],
            "no-empty": "error",
            "prefer-const": "off",
            "no-restricted-imports": [
                "error",
                {
                    paths: [
                        {
                            name: "moment",
                            message:
                                "The 'moment' package is bundled with Obsidian. Please import it from 'obsidian' instead.",
                        },
                    ],
                },
            ],
            "@typescript-eslint/no-base-to-string": "error",
            "@typescript-eslint/no-deprecated": "error",
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/no-require-imports": "error",
            "@typescript-eslint/no-unnecessary-type-assertion": "error",
            "@typescript-eslint/no-unsafe-enum-comparison": "error",
            "@typescript-eslint/only-throw-error": "error",
            "@typescript-eslint/require-await": "error",
            "@typescript-eslint/await-thenable": "error",
            "@typescript-eslint/restrict-plus-operands": "error",
            "@typescript-eslint/restrict-template-expressions": [
                "error",
                {
                    allowNumber: true,
                    allowBoolean: false,
                    allowAny: false,
                    allowNullish: true,
                },
            ],
            "eslint-comments/disable-enable-pair": "error",
            "eslint-comments/no-unlimited-disable": "error",
            "eslint-comments/require-description": "error",
        },
    },
);
