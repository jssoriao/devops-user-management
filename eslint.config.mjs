import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import eslint from "@eslint/js";

/**
 * @type {import("eslint").Linter.Config[]}
 * */
const config = [
  eslint.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "preserve-caught-error": "off",
    },
  },
  {
    ignores: ["node_modules/**", "bin/**", "dist/**"],
  },
];

export default config;
