#!/usr/bin/env bash
# Runs once inside the factory's station sandboxes at template build (FACTORY_SETUP_COMMAND), from
# the repository root of the /workspace/repo clone. Installs Bun at the pinned version, installs
# dependencies from the frozen lockfile, and runs the `check` scope of the verification lever so
# every session starts from a green tree. Needs no Solana credentials: the check scope is static
# (format, lint, dependency rules, types), and tests run on Surfpool, offline.
set -euo pipefail

BUN_VERSION="$(tr -d '[:space:]' < .bun-version)"
# Outside any home directory: the template is built by one uid and sessions may run as another.
# `repo-sandbox.js` (BUN_BIN) and the station instructions rely on this exact location.
export BUN_INSTALL="${BUN_INSTALL:-/workspace/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

if ! command -v bun > /dev/null 2>&1 || [ "$(bun --version)" != "$BUN_VERSION" ]; then
  curl -fsSL https://bun.sh/install | BUN_INSTALL="$BUN_INSTALL" bash -s "bun-v$BUN_VERSION"
fi
# Best effort: make `bun` resolve for sessions without touching PATH.
ln -sf "$BUN_INSTALL/bin/bun" /usr/local/bin/bun 2> /dev/null || true

bun install --frozen-lockfile
bun run solos dev verify --scope check --json
