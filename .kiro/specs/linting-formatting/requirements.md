# Requirements Document

## Introduction

Set up ESLint and Prettier for a TypeScript Pulumi project to enforce consistent code style and catch common errors. The tooling integrates into the existing pnpm-based workflow and CI pipeline so that formatting and linting are checked automatically on every push and pull request.

## Glossary

- **ESLint**: A static analysis tool that identifies and reports problematic patterns in TypeScript and JavaScript code.
- **Prettier**: An opinionated code formatter that enforces a consistent style by parsing and reprinting code.
- **CI_Workflow**: The GitHub Actions workflow defined in `.github/workflows/ci.yml` that runs automated checks on push and pull request events.
- **Package_Json**: The `package.json` file that declares project scripts and dependencies.
- **Config_File**: A configuration file (e.g., `eslint.config.mjs`, `.prettierrc`) that controls the behavior of a tool.

## Requirements

### Requirement 1: Install Linting and Formatting Dev Dependencies

**User Story:** As a developer, I want all required ESLint and Prettier packages installed as dev dependencies via pnpm, so that the tooling is available locally and in CI.

#### Acceptance Criteria

1. THE Package_Json SHALL include `eslint` (latest major version) as a dev dependency.
2. THE Package_Json SHALL include `typescript-eslint` as a dev dependency.
3. THE Package_Json SHALL include `prettier` as a dev dependency.
4. THE Package_Json SHALL include `eslint-config-prettier` as a dev dependency to disable ESLint rules that conflict with Prettier.
5. THE Package_Json SHALL include all dev dependencies installable via `pnpm install` without errors.

### Requirement 2: Create ESLint Configuration

**User Story:** As a developer, I want an ESLint configuration that uses the recommended TypeScript rules, so that common errors and bad practices are caught automatically.

#### Acceptance Criteria

1. THE Config_File for ESLint SHALL exist at `eslint.config.mjs` in the project root.
2. THE Config_File for ESLint SHALL extend the recommended TypeScript-ESLint configuration.
3. THE Config_File for ESLint SHALL integrate `eslint-config-prettier` to avoid conflicts with Prettier formatting rules.
4. THE Config_File for ESLint SHALL target TypeScript files (`**/*.ts`).
5. THE Config_File for ESLint SHALL exclude the `node_modules` and `bin` directories from linting.

### Requirement 3: Create Prettier Configuration

**User Story:** As a developer, I want a Prettier configuration file, so that code formatting is consistent across the project.

#### Acceptance Criteria

1. THE Config_File for Prettier SHALL exist at `.prettierrc` in the project root.
2. THE Config_File for Prettier SHALL specify a configuration compatible with the existing TypeScript codebase.

### Requirement 4: Add npm Scripts for Linting and Formatting

**User Story:** As a developer, I want `lint`, `format`, and `format:check` scripts in package.json, so that I can run linting and formatting from the command line.

#### Acceptance Criteria

1. WHEN a developer runs `pnpm lint`, THE Package_Json script SHALL execute ESLint against the project source files.
2. WHEN a developer runs `pnpm format`, THE Package_Json script SHALL execute Prettier to format all project files in-place.
3. WHEN a developer runs `pnpm format:check`, THE Package_Json script SHALL execute Prettier in check mode and exit with a non-zero code when files are not formatted.

### Requirement 5: Update CI Workflow to Run Format Check, Lint, and Tests

**User Story:** As a developer, I want the CI pipeline to check formatting, run linting, and run tests, so that code quality is enforced on every push and pull request.

#### Acceptance Criteria

1. THE CI_Workflow SHALL run `pnpm format:check` before running lint and tests.
2. THE CI_Workflow SHALL run `pnpm lint` after the format check step.
3. THE CI_Workflow SHALL continue to run `pnpm test` after the lint step.
4. IF `pnpm format:check` exits with a non-zero code, THEN THE CI_Workflow SHALL fail the build.
5. IF `pnpm lint` exits with a non-zero code, THEN THE CI_Workflow SHALL fail the build.
