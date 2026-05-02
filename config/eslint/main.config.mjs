import js from "@eslint/js";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

const sharedGlobals = {
    __dirname: "readonly",
    cancelAnimationFrame: "readonly",
    clearTimeout: "readonly",
    console: "readonly",
    createDiv: "readonly",
    createEl: "readonly",
    createFragment: "readonly",
    createSpan: "readonly",
    createSvg: "readonly",
    crypto: "readonly",
    document: "readonly",
    DOMParser: "readonly",
    File: "readonly",
    FileReader: "readonly",
    FormData: "readonly",
    global: "readonly",
    globalThis: "readonly",
    HTMLElement: "readonly",
    MutationObserver: "readonly",
    navigator: "readonly",
    Node: "readonly",
    performance: "readonly",
    process: "readonly",
    module: "readonly",
    requestAnimationFrame: "readonly",
    require: "readonly",
    setTimeout: "readonly",
    structuredClone: "readonly",
    TextDecoder: "readonly",
    TextEncoder: "readonly",
    URL: "readonly",
    URLSearchParams: "readonly",
    window: "readonly",
};

const jestGlobals = {
    afterAll: "readonly",
    afterEach: "readonly",
    beforeAll: "readonly",
    beforeEach: "readonly",
    describe: "readonly",
    expect: "readonly",
    it: "readonly",
    jest: "readonly",
    test: "readonly",
};

const sharedRules = {
    "linebreak-style": 0,
    quotes: ["warn", "double", { avoidEscape: true }],
    semi: ["error", "always"],
};

export default tseslint.config(
    {
        ignores: [
            "build/**",
            "coverage/**",
            "docs/**",
            "node_modules/**",
            "plugin_test/**",
            "site/**",
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "tests/**/*.tsx"],
        languageOptions: {
            ecmaVersion: 12,
            sourceType: "module",
            globals: sharedGlobals,
        },
        plugins: {
            obsidianmd,
        },
        rules: {
            ...sharedRules,
            "obsidianmd/commands/no-default-hotkeys": "error",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
        },
    },
    {
        files: ["tests/**/*.ts", "tests/**/*.tsx"],
        languageOptions: {
            globals: {
                ...sharedGlobals,
                ...jestGlobals,
            },
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/no-unsafe-function-type": "off",
            "@typescript-eslint/no-unused-vars": "off",
        },
    },
    {
        files: ["tests/**/*.js", "tests/**/*.cjs", "**/__mocks__/**/*.js"],
        languageOptions: {
            ecmaVersion: 12,
            sourceType: "commonjs",
            globals: {
                ...sharedGlobals,
                ...jestGlobals,
            },
        },
        rules: {
            ...sharedRules,
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/no-unused-vars": "off",
        },
    },
    {
        files: ["src/main.ts"],
        rules: {
            "no-empty": "off",
        },
    },
);
