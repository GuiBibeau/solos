#!/bin/sh
# Install the solos binary from GitHub Releases.
#
#   curl -fsSL https://raw.githubusercontent.com/GuiBibeau/solos/main/install.sh | sh
#
# SOLOS_VERSION selects a release (default: latest); SOLOS_CHANNEL selects a lane when no version
# is given: latest (the stable lane, default) or canary (the newest merge to main, ADR-0036);
# SOLOS_INSTALL the prefix (default: ~/.solos). The binary lands in $SOLOS_INSTALL/bin/solos after
# its SHA-256 is checked against the release's SHA256SUMS. Then: `solos login`,
# `solos connect claude` (or codex, cursor).
set -eu

REPO="GuiBibeau/solos"
CHANNEL="${SOLOS_CHANNEL:-latest}"
VERSION="${SOLOS_VERSION:-$CHANNEL}"
PREFIX="${SOLOS_INSTALL:-$HOME/.solos}"
BIN_DIR="$PREFIX/bin"

os=$(uname -s)
arch=$(uname -m)
case "$os" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) echo "solos: unsupported operating system: $os" >&2; exit 1 ;;
esac
case "$arch" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) echo "solos: unsupported architecture: $arch" >&2; exit 1 ;;
esac
asset="solos-$os-$arch"

# A channel resolves to the newest release of its lane from the release list. The repository's
# own /releases/latest can be a release of another package (the contract package publishes
# through the same repository), so the tag is resolved from the list instead. "latest" is the
# stable lane: a solos@<major.minor.patch> tag, never a canary. "canary" is the newest
# solos@<version>-canary.<run>.g<sha> pre-release.
case "$VERSION" in
  latest) pattern='"tag_name": *"solos@[0-9]*\.[0-9]*\.[0-9]*"' ;;
  canary) pattern='"tag_name": *"solos@[0-9]*\.[0-9]*\.[0-9]*-canary\.[^"]*"' ;;
  *) pattern="" ;;
esac
if [ -n "$pattern" ]; then
  channel="$VERSION"
  VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=100" \
    | grep -o "$pattern" | head -n 1 | cut -d'"' -f4 | sed 's/^solos@//')
  if [ -z "$VERSION" ]; then
    echo "solos: no solos@* release on the $channel channel; set SOLOS_VERSION explicitly" >&2
    exit 1
  fi
fi
base="https://github.com/$REPO/releases/download/solos@$VERSION"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "downloading $asset ($VERSION)"
curl -fsSL "$base/$asset" -o "$tmp/$asset"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"

expected=$(awk -v name="$asset" '$2 == name { print $1 }' "$tmp/SHA256SUMS")
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$tmp/$asset" | cut -d' ' -f1)
else
  actual=$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1)
fi
if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
  echo "solos: checksum mismatch for $asset; refusing to install" >&2
  exit 1
fi

mkdir -p "$BIN_DIR"
mv "$tmp/$asset" "$BIN_DIR/solos"
chmod +x "$BIN_DIR/solos"
echo "installed $BIN_DIR/solos"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "add it to your PATH:  export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac
"$BIN_DIR/solos" --version
