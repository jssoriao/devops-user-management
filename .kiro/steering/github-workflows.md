---
inclusion: fileMatch
fileMatchPattern: ".github/workflows/**"
---

# GitHub Actions Workflow Conventions

When writing GitHub Actions workflows:

1. Use the latest major versions of official actions:
   - `actions/checkout@v5`
   - `actions/setup-node@v6`
2. Use Node.js 24 (current LTS) as the runtime version
3. Use `pnpm install --frozen-lockfile` for dependency installation in CI
4. Pin action versions to major tags (e.g., `@v5`) not specific SHAs
