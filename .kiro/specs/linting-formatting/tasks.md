# Implementation Plan: Linting & Formatting

## Overview

Add ESLint and Prettier tooling to the existing TypeScript/Pulumi project. Install dev dependencies via pnpm, create configuration files using ESLint flat config and a minimal `.prettierrc`, wire up npm scripts, and update the CI workflow.

## Tasks

- [x] 1. Install dev dependencies and add npm scripts
  - [x] 1.1 Add `eslint`, `typescript-eslint`, `prettier`, and `eslint-config-prettier` as dev dependencies in `package.json`
    - Run `pnpm add -D eslint typescript-eslint prettier eslint-config-prettier` to install latest versions
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 Add `lint`, `format`, and `format:check` scripts to `package.json`
    - `"lint": "eslint . --max-warnings 0"`
    - `"format": "prettier --write ."`
    - `"format:check": "prettier --check ."`
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 2. Create ESLint configuration
  - [x] 2.1 Create `eslint.config.mjs` at the project root
    - Use flat config format with `tseslint.config()` helper
    - Import `@eslint/js` recommended, spread `tseslint.configs.recommended`, and append `eslintConfigPrettier` last
    - Add global `ignores` for `node_modules/**` and `bin/**`
    - Add `files: ["**/*.ts"]` targeting TypeScript files
    - Order imports by line length (longest first) per project convention
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3. Create Prettier configuration
  - [x] 3.1 Create `.prettierrc` at the project root
    - Use JSON format with settings compatible with the existing codebase: `semi: true`, `singleQuote: false`, `trailingComma: "all"`, `printWidth: 80`, `tabWidth: 2`
    - _Requirements: 3.1, 3.2_

- [x] 4. Update CI workflow
  - [x] 4.1 Update `.github/workflows/ci.yml` to run `pnpm format:check` and `pnpm lint` before `pnpm test`
    - Insert `- run: pnpm format:check` and `- run: pnpm lint` steps between `pnpm install --frozen-lockfile` and `pnpm test`
    - Keep `actions/checkout@v5`, `actions/setup-node@v6`, `pnpm/action-setup@v4`, Node.js 24
    - Each step fails the build independently on non-zero exit
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

## Notes

- Each task references specific requirements for traceability
