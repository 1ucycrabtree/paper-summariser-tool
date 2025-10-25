import { defineConfig } from "eslint/config";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([{
    extends: compat.extends("eslint:recommended"),

    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.node,
            ...globals.webextensions,
            chrome: true,
            devtools: true,
        },
    },

    rules: {
        "no-console": 0,
        indent: 2,
        "no-unused-vars": ["error", { 
            "argsIgnorePattern": "^_",
            "varsIgnorePattern": "^_"
        }],
    },
},
{
    ignores: ["**/pdf.mjs", "**/pdf.worker.mjs", "**/dist/**"]
}
]);