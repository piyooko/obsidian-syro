import js from "@eslint/js";
import eslintComments from "eslint-plugin-eslint-comments";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["build/**", "coverage/**", "docs/**", "site/**", "plugin_test/**"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/**/*.ts", "src/**/*.tsx"],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: "./tsconfig.json",
            },
        },
        plugins: {
            "eslint-comments": eslintComments,
            obsidianmd,
        },
        rules: {
            ...obsidianmd.configs.recommendedWithLocalesEn,
            "obsidianmd/prefer-file-manager-trash-file": "error",
            "no-console": ["error", { allow: ["warn", "error", "debug"] }],
            "no-empty": "error",
            "no-irregular-whitespace": "off",
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
            "@typescript-eslint/no-unused-vars": "off",
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
