#!/usr/bin/env bash
# Build solos-engine for Linux and smoke-test the binary this machine can run.
# A version that differs from apps/engine/package.json fails before any compile.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

version=""
features=""
targets="linux-x64,linux-arm64"
outdir="dist/engine"
engine_pid=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      version="${2:-}"
      shift 2
      ;;
    --features)
      features="${2-}"
      shift 2
      ;;
    --targets)
      targets="${2:-}"
      shift 2
      ;;
    --outdir)
      outdir="${2:-}"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

cleanup() {
  if [[ -n "${engine_pid}" ]] && kill -0 "$engine_pid" 2>/dev/null; then
    kill "$engine_pid" 2>/dev/null || true
    wait "$engine_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_ready() {
  local pid="$1" log="$2" _
  for _ in $(seq 1 150); do
    if grep -q '"message":"solos engine ready"' "$log"; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "solos-engine exited before it was ready" >&2
      cat "$log" >&2
      exit 1
    fi
    sleep 0.2
  done
  echo "solos-engine did not become ready" >&2
  cat "$log" >&2
  exit 1
}

assert_dotenv_ignored() {
  local binary="$1" dir output status
  dir="$(mktemp -d)"
  cp "$binary" "${dir}/solos-engine"
  printf 'SOLOS_ENGINE_TOKEN=from-dotenv\nSOLANA_RPC_URL=http://127.0.0.1:1\n' > "${dir}/.env"
  set +e
  output="$(
    cd "$dir"
    env -i PATH="$PATH" HOME="$dir" "${dir}/solos-engine" --data-dir "${dir}/data" 2>&1
  )"
  status=$?
  set -e
  if [[ "$status" -eq 0 || "$output" != *"SOLOS_ENGINE_TOKEN is not set"* ]]; then
    echo "a .env beside the binary changed startup; expected a missing token" >&2
    echo "$output" >&2
    exit 1
  fi
}

assert_dry_run() {
  local binary="$1" expected="$2" shipped="$3"
  local token key port data log pid body ok got_version tier mode unauth gated
  token="$(bun -e 'process.stdout.write(crypto.randomUUID())')"
  key="$(
    cd "${root}/packages/solana"
    bun -e 'import { randomSeed, seedToPrivateKeyString } from "./src/surfnet/index.js"; process.stdout.write(await seedToPrivateKeyString(randomSeed()))'
  )"
  port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
  data="$(mktemp -d)"
  log="$(mktemp)"
  env -i PATH="$PATH" HOME="$data" \
    SOLOS_ENGINE_TOKEN="$token" \
    SOLOS_SIGNER_PRIVATE_KEY="$key" \
    SOLANA_RPC_URL="http://127.0.0.1:1" \
    SOLOS_LOG_LEVEL="warn" \
    "$binary" --host 127.0.0.1 --port "$port" --data-dir "$data" >"$log" 2>&1 &
  pid=$!
  engine_pid="$pid"
  wait_ready "$pid" "$log"
  body="$(curl -fsS --max-time 5 -H "Authorization: Bearer ${token}" "http://127.0.0.1:${port}/v1/health")"
  ok="$(jq -r '.ok' <<<"$body")"
  got_version="$(jq -r '.version' <<<"$body")"
  tier="$(jq -r '.tier' <<<"$body")"
  # Dry-run start reports mode "dry" (no --tier execute, no --paper).
  mode="$(jq -r '.mode' <<<"$body")"
  if [[ "$ok" != "true" || "$got_version" != "$expected" || "$tier" != "simulate" || "$mode" != "dry" ]]; then
    echo "unexpected /v1/health: ${body}" >&2
    exit 1
  fi
  unauth="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${port}/v1/health")"
  if [[ "$unauth" != "401" ]]; then
    echo "GET /v1/health without a token returned ${unauth}, expected 401" >&2
    exit 1
  fi
  if [[ ",${shipped}," != *",STRATEGIES,"* ]]; then
    gated="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 -H "Authorization: Bearer ${token}" "http://127.0.0.1:${port}/v1/strategies")"
    if [[ "$gated" != "404" ]]; then
      echo "GET /v1/strategies returned ${gated}, expected 404 while STRATEGIES is not shipped" >&2
      exit 1
    fi
  fi
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  engine_pid=""
}

smoke_binary() {
  local binary="$1" expected="$2" shipped="$3" help reported
  chmod +x "$binary"
  help="$("$binary" --help)"
  [[ "$help" == *"Start the engine"* ]]
  reported="$("$binary" --version | tr -d '[:space:]')"
  if [[ "$reported" != "$expected" ]]; then
    echo "--version reported ${reported}, expected ${expected}" >&2
    exit 1
  fi
  assert_dotenv_ignored "$binary"
  assert_dry_run "$binary" "$expected" "$shipped"
}

manifest="$(jq -r '.version' apps/engine/package.json)"
pkg_name="$(jq -r '.name' apps/engine/package.json)"
if [[ "$pkg_name" != "@solos/engine" ]]; then
  echo "apps/engine/package.json name is ${pkg_name}, expected @solos/engine" >&2
  exit 1
fi
if [[ -z "$version" ]]; then
  version="$manifest"
fi
if [[ "$version" != "$manifest" ]]; then
  echo "version ${version} does not match @solos/engine ${manifest}; refusing to build" >&2
  exit 1
fi

mkdir -p "$outdir"
ENGINE_VERSION="$version" \
  ENGINE_FEATURES="$features" \
  ENGINE_TARGETS="$targets" \
  ENGINE_OUTDIR="$outdir" \
  bun scripts/engine-compile.js

(
  cd "$outdir"
  files=()
  IFS=',' read -r -a requested <<<"$targets"
  for name in "${requested[@]}"; do
    name="${name// /}"
    [[ -n "$name" ]] || continue
    files+=("solos-engine-${name}")
  done
  sha256sum "${files[@]}" > SHA256SUMS
  sha256sum --check SHA256SUMS
)

if [[ ",${targets// /}," == *",linux-arm64,"* ]]; then
  if [[ ! -s "${outdir}/solos-engine-linux-arm64" ]]; then
    echo "solos-engine-linux-arm64 is missing or empty" >&2
    exit 1
  fi
  grep -Eq '^[[:xdigit:]]{64}  solos-engine-linux-arm64$' "${outdir}/SHA256SUMS"
fi

host_target=""
case "$(uname -m)" in
  x86_64) host_target="linux-x64" ;;
  aarch64 | arm64) host_target="linux-arm64" ;;
esac

if [[ -n "$host_target" && ",${targets// /}," == *",${host_target},"* ]]; then
  smoke_binary "${outdir}/solos-engine-${host_target}" "$version" "$features"
fi

printf '{"ok":true,"version":"%s","targets":"%s"}\n' "$version" "$targets"
