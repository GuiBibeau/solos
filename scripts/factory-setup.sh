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
SURFPOOL_INSTALL="${SURFPOOL_INSTALL:-/workspace/.local}"
export PATH="$BUN_INSTALL/bin:$SURFPOOL_INSTALL/bin:$PATH"

if ! command -v bun > /dev/null 2>&1 || [ "$(bun --version)" != "$BUN_VERSION" ]; then
  curl -fsSL https://bun.sh/install | BUN_INSTALL="$BUN_INSTALL" bash -s "bun-v$BUN_VERSION"
fi
# Best effort: make `bun` resolve for sessions without touching PATH.
ln -sf "$BUN_INSTALL/bin/bun" /usr/local/bin/bun 2> /dev/null || true

# Sessions run as a different uid than the template build: give them the same PATH and heap.
{ echo 'export PATH="/workspace/.bun/bin:/workspace/.local/bin:$PATH"'; echo 'export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144}"'; } > /etc/profile.d/solos-factory.sh 2> /dev/null || true

# Match CI's pinned offline runtime. Installing it in the shared workspace makes full verification
# available to later session users without giving the sandbox an RPC URL or starting a process.
SURFPOOL_VERSION="$(sed -nE 's/^[[:space:]]*SURFPOOL_VERSION: "([^"]+)".*/\1/p' .github/workflows/ci.yml | head -1)"
if [ -z "$SURFPOOL_VERSION" ]; then
  echo "factory-setup: SURFPOOL_VERSION is missing from .github/workflows/ci.yml" >&2
  exit 1
fi
platform="$(uname -s)"
architecture="$(uname -m)"
if [ "$platform" != "Linux" ] || [ "$architecture" != "x86_64" ]; then
  echo "factory-setup: full verification unsupported on $platform/$architecture" >&2
else
  if ! command -v surfpool > /dev/null 2>&1 || ! bash scripts/factory-surfpool-version.sh "$SURFPOOL_VERSION"; then
    url="https://github.com/solana-foundation/surfpool/releases/download/v${SURFPOOL_VERSION}/surfpool-linux-x64.tar.gz"
    mkdir -p "$SURFPOOL_INSTALL/bin"
    curl -fsSL "$url" | tar -xz -C "$SURFPOOL_INSTALL/bin"
    chmod +x "$SURFPOOL_INSTALL/bin/surfpool"
  fi
  if ! bash scripts/factory-surfpool-version.sh "$SURFPOOL_VERSION"; then
    echo "factory-setup: Surfpool version does not match $SURFPOOL_VERSION" >&2
    exit 1
  fi
fi

bun install --frozen-lockfile

# Smoke test the checkout with the check scope; on failure, surface the Evidence in the build log
# (stdout is swallowed by the template builder).
if ! evidence="$(bun run solos dev verify --scope check --json)"; then
  echo "factory-setup: verify --scope check failed; Evidence:" >&2
  echo "$evidence" >&2
  exit 1
fi
