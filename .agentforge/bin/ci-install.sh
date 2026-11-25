#!/usr/bin/env bash
# Installs the repository's dependencies for LynnCraft's QA jobs, and Playwright's
# browser when the repo has browser tests. Copied into .agentforge/bin/ by install-ci.
set -euo pipefail
if [ -f package-lock.json ]; then npm ci
elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile
elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile
elif [ -f package.json ]; then npm install
fi
if [ -f package.json ] && grep -q '"@playwright/test"' package.json; then
  npx playwright install --with-deps chromium
fi
