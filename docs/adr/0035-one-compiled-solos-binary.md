# 0035 — One compiled `solos` binary is the distribution; the CLI ships; `solos mcp serve`

Status: accepted, 2026-10-04. Extends ADR-0001 (Bun only) and ADR-0010 (the lever); amends the
"no `npx`" consequence of ADR-0001 and the 2026-09-26 DX note that the CLI never ships.

## Context

Issue #150 left two decisions open: whether the published server is Bun-only or Node-compatible,
and whether the CLI ships at all. Three facts settled them.

- `solos login` is how anyone creates a wallet profile, and `solos doctor` is how they find out
  why the server did not start. Without the CLI there is no install; the MCP server alone is not
  a product a stranger can start.
- Most MCP clients spawn servers with `npx`, and the whole dependency tree runs on Bun
  (`Bun.spawn` on the credential and `pay` paths, `bun:sqlite` in the harness, Kit adapters).
  Porting to Node is a rewrite with no benefit; asking every user to install Bun first is the
  cliff #150 names.
- `bun build --compile` bundles the CLI, with the MCP server inside it, into one executable in
  under a second. Two dependencies do not survive the bundler as shipped: `@solana/kit@2.3.0`,
  pinned by Kamino's SDKs, requires an empty module and the bundler emits `var x = ;`; and
  `@orca-so/whirlpools-core` reads its WASM from a build-machine path. Bun 1.4.2 has both bugs.
  Both are fixed by build plugins that change no behaviour.

The npm name `solos` belongs to an unrelated 2022 package and the `@solos` scope to an active npm
user, so nothing publishes under either. The project's npm org is `solos-sh`, named to pair
with a `solos.sh` install domain the project does not own yet, and the contract package moves from `@solos/actions` to
`@solos-sh/actions` before its first publish. Private workspace packages keep their `@solos/*`
names; they never publish.

## Decision

- **The product is one executable per platform**, `solos`, compiled by the lever command
  `solos dev build` through `Bun.build({ compile })` with two plugins in `apps/cli/src/build/`:
  an empty-module stub for `@solana/rpc-parsed-types`, and the whirlpools browser glue fed by the
  WASM embedded in the binary. Targets today: darwin-arm64, darwin-x64, linux-x64, linux-arm64.
  Windows follows when its cross-compile passes the same smoke test.
- **The MCP server is `solos mcp serve`.** An installed client config runs
  `"command": "solos", "args": ["mcp", "serve"]`, with `--tier` and `--tools` as before. The
  `solos-mcp` bin and `bun --no-env-file <stdio.js>` remain for checkouts; both call one
  `serveStdio`. `solosServerCommand()` returns the running binary when the process is compiled,
  so `solos mcp list|call` and the doctor's paste-ready config name the binary, never a path
  inside it.
- **A compiled binary autoloads nothing.** `.env` and `bunfig.toml` from the working directory
  are not read; configuration is explicit env or a profile (ADR-0015). This is the isolation the
  checkout gets from `--no-env-file`.
- **The version is defined at build time.** `solos dev build --version <semver>` sets
  `SOLOS_VERSION` into the bundle; `--version`, the MCP `serverInfo` and the ready line report
  it. A checkout reports `0.0.0`.
- **The build is proven, not described.** The host binary is smoke-tested from a neutral
  directory with an empty config dir: `--version`, `doctor` (both issues, config names the
  binary) and `mcp list` (the server inside the binary lists its tools). The lever exits 1
  when any check fails, and the Evidence of the release PR includes that run.
- **Distribution channels**: GitHub Releases carry the binaries and `SHA256SUMS`; the npm
  launcher `@solos-sh/cli`, whose bin is `solos`, depends on one platform package per target
  (`@solos-sh/cli-darwin-arm64`, `-darwin-x64`, `-linux-x64`, `-linux-arm64`) as
  `optionalDependencies`, so `npm i -g @solos-sh/cli` and `npx @solos-sh/cli` work on machines
  without Bun; and an
  `install.sh` in the repo, served from the repository's raw URL until an install domain fronts
  it, downloads the release binary. The launcher is
  plain Node and the binary embeds Bun, so ADR-0001's "no Node compatibility promise" still
  holds for the code.
- **The developer lever stays out of the product by ADR-0034**, not by the bundle: the binary
  carries the lever's code but never advertises it, and the heavy tools the lever drives
  (eslint, biome, tsc, Surfpool) are spawned, never bundled. Cutting modules with `bun:bundle`
  feature flags is reserved for the harness commands and the Engine (#193, #194).

## Consequences

- Client docs change from an absolute path into a checkout to `solos mcp serve`; the checkout's
  own `.mcp.json` keeps `bun run packages/mcp/src/bin/stdio.js`.
- `apps/cli` is the published entry, so its command tree is the product surface. Every
  operator-facing command there is public from the first release.
- Each binary is tens of megabytes (the Bun runtime plus every dependency). Acceptable for a
  tool installed once; a concern for a package installed per project, which is why the npm
  packages are platform-split.
- Bumping Bun re-tests the two bundler bugs through the build's smoke test; when a Bun release
  fixes one, its plugin goes.
- The Engine binary (#194, #196) follows the same lever, plugins and smoke-test shape.
