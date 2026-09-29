# solOS — agent guide

solOS is a thin Solana execution layer for LLM agents: an MCP server exposing well-named tools,
plus a harness that runs its own agent loop and routes tasks across model providers. Policy,
approval, and guardrails live upstream in a separate agentic app. Not here.

## STEP 0 — load the environment before live/provider-backed work

**MANDATORY: before EVERY LIVE/PROVIDER-BACKED QA TEST or live `solos` CLI/stdio MCP
command, source BOTH `.env` and `.env.local`. `bun run solos` does NOT load these files
automatically.** On this workstation `.env` contains `JUPITER_API_KEY`;
`.env.local` contains the live `SOLANA_RPC_URL`. Sourcing only `.env.local` falsely reports
that the Jupiter key is missing. Each agent tool call starts a fresh shell: **source both
files again in each invocation that needs them.** In a separate worktree use the
**original checkout's** files, not the worktree (which has only `.env.example`):

```sh
set -a
. /Users/guillaume/Github/solos/.env
. /Users/guillaume/Github/solos/.env.local
set +a
# Now run the live/provider-backed solos command in this same shell.
```

**Never print, commit or paste the contents or values of either file.** This step is for live/provider-backed work only: reusable offline Surfpool tests and `solos dev verify` must not use live credentials.

## Verify with the lever, never with ad-hoc scripts

Design work ends in ADRs and issues with acceptance criteria.

`solos` is the repo CLI and the verification tool. Every command prints JSON and exits non-zero
on domain errors. `bun run solos --help` is the source of truth for the surface.

```sh
bun run solos login --provider local     # pick a keypair already on this machine, save it as a profile
bun run solos profiles list
bun run solos dev surfpool up            # local Solana (offline mainnet fork), prints SOLANA_RPC_URL hint
bun run solos dev surfpool fund <addr> --sol 2
bun run solos wallet balance             # through core + adapters
bun run solos mcp list                   # spawns the MCP server over stdio, lists tools
bun run solos mcp call solana_wallet_get_balance --args '{}'
bun run solos dev check                  # format, lint, dependency rules, types
bun run solos dev test                   # unit + integration (Surfpool starts itself)
bun run solos dev verify --scope unit    # check + unit tests, prints Evidence JSON (scope: check|unit|full)
bun run solos dev evidence check --body-file pr.md --sha $(git rev-parse HEAD)  # what CI runs on PR bodies
bun run solos dev surfpool down
```

### Evidence

The JSON printed by `solos dev verify` is the only accepted proof that a pull request's checks
passed. It records the HEAD sha, whether the tree was dirty, the scope, tool versions, and one
entry per step (`ok` true/false/null for skipped, duration, last output line). Run it with `--json`
and paste the object in the PR body under a `## Evidence` heading inside a ```json fence. CI runs
`solos dev evidence check` against the PR body: the sha must match the PR head, `dirty` must be
false, `ok` must be true. Then CI re-runs `solos dev verify` on the same sha. A description of what
you ran is not evidence; the JSON is. That object proves the commit's checks. Live validation of an
execute path is a separate bar; see Funds and [features/feature-map.json](features/feature-map.json).

Do not write throwaway scripts to poke the chain or the server. If a verification step is missing,
add a `solos` command instead.

## Funds

Every Action strives for live validation: a real mainnet spend the operator has authorized.
Surfpool tests and unit Evidence prove the pull request. A live round proves the execute path.
Offline tests do not stand in for that round.

Record that round in the change set that documents it. Add the row to
[features/feature-map.json](features/feature-map.json) and write the QA notes for that path
in that change set. The row shape is [features/README.md](features/README.md). The round stays
unrecorded until both are in it.

- **Reusable tests never touch mainnet.** They run against Surfpool, offline by default, started
  automatically by `ensureSurfnet()` and torn down by the test preload.
- **Live validation of an execute path is a real mainnet spend, done when the operator authorizes
  a round.** Use the operator's funded local wallet and real RPC, not Surfpool, for that round.
  Before signing or sending, ask the operator to approve the wallet, cluster, token/amount cap,
  and SOL fee/rent cap. This guide is not standing permission to spend. Show the proposed transaction,
  simulate it first, never use `--skip-simulation` for QA, and stop on any failed simulation or
  missing/unchecked exit path. Keep amounts small; reconcile before/after balances, positions,
  signatures, fees, locked rent, and residual exposure. Report zero spend when nothing was sent.
  Put that reconciliation in the feature-map row and the QA notes in the same change set.
- **Use the operator's real RPC for live checks.** `SOLANA_RPC_URL` may be provided in local
  environment files (for example `.env.local` or `~/.config/solos/qa/quicknode.env`), not in
  the agent's inherited shell or the saved profile. Locate and load the operator-provisioned
  variable without displaying its value; confirm the endpoint's cluster with read-only `solos`
  commands before a funded test. Never commit RPC URLs, credentials, keypairs, or local env files,
  and never paste their values into issues, PRs, logs, or tool arguments. Use native CLI and a
  real stdio MCP child for live QA; do not substitute offline fixtures for a funded round.
- Mainnet is the default. There is no network enum; the RPC URL is the only switch. Startup fails
  without an RPC URL from `SOLANA_RPC_URL` or the active profile.
- Wallets come from `solos login --provider privy|local|pay|privy-server`, stored as profiles in
  `~/.config/solos/credentials.json` (0600). Resolution: `SOLOS_SIGNER_*` env, then `SOLOS_PROFILE`,
  then the default profile (ADR-0015). MCP client configs carry only `SOLOS_PROFILE`.

## Where things live

| Path | What | Rules |
|---|---|---|
| `packages/core/src/<slice>/` | `domain/`, `ports/`, `use-cases/`, `tools/`, `index.js` | Zero I/O. No Kit, MCP SDK, AI SDK, or `bun:*`. Other slices import only `index.js`. |
| `packages/core/src/shared/` | cross-slice primitives: errors, EventBus, Store, `ActionExecutor`, tool definition helpers | Never imports a slice. |
| `packages/actions/src/` | `Action`, `PortfolioState`, `Mandate`, `SimulationResult`, `ExecutionResult` schemas | The only published package. Imports nothing from the repo. Every change is an API change. |
| `packages/solana/src/` | Kit + keychain Layers implementing core ports, `DirectSignerExecutor`, Submission and its `Submitter` adapters, credential profiles and discovery, Surfpool helpers | The only place Kit appears. |
| `packages/mcp/src/` | stdio server, tool → MCP mapping, the one MCP client | HTTP transport later. |
| `apps/harness/src/` | daemon, router, ToolLoopAgent, sqlite store, tracing | Composition root in `composition.js`. |
| `apps/cli/src/` | `solos` (`@effect/cli`) | Thin: parse, provide Layers, emit JSON. |
| `features/feature-map.json` | live-validated execute paths | Row shape in features/README.md. Write the row in the same change set as the QA notes. |

Slices today, generated from the registry by `solos dev docs check --write` and gated by `solos
dev check` — do not edit the table by hand:

<!-- generated: slices -->
| Slice | Tools | Tiers |
|---|---|---|
| `discovery` | 1 | read |
| `launch` | 5 | read, simulate, execute |
| `lend` | 6 | read, simulate, execute |
| `liquidity` | 9 | read, simulate, execute |
| `market` | 6 | read |
| `perp` | 12 | read, simulate, execute |
| `portfolio` | 1 | read |
| `signals` | 0 | ports only |
| `swap` | 3 | read, simulate, execute |
| `transfer` | 2 | simulate, execute |
| `wallet` | 4 | read, simulate, execute |
<!-- /generated: slices -->

A slice with tools has adapters behind them in `packages/solana/src/<slice>/`; a ports-only slice
has a port tag and domain types and nothing wired. `market` covers Elfa Chat, token discovery, news
and summaries, Jupiter prices and on-chain token metadata.

`discovery` owns the one tool every other tool is found through. The MCP server registers every
tool the tier ceiling permits but advertises only `solana_discovery_search_tools`, the wallet
balance and the portfolio state; a search (free text, one group, or exact names) enables its
matches and fires `tools/list_changed` (ADR-0029). Free text goes through the `ToolSelector`
port: JEV through Vercel AI Gateway when `AI_GATEWAY_API_KEY` is set, the local matcher otherwise
or when JEV fails or is slow. The `ToolCatalogue` port carries the registry and the ceiling into
the use case; composition roots provide it. `--tools all` (or `SOLOS_TOOLS=all`) advertises
everything up front for clients that ignore list changes. Adapters live in
`packages/solana/src/discovery/`; `solos discovery select --query` runs a bare selection.

## Conventions that lint will enforce

- Plain `.js` with JSDoc types, `tsc --noEmit` strict. No build step.
- Effect is the architecture: a port is `Context.GenericTag("@solos/<slice>/<Port>")` typed via
  `@type {Context.Tag<Shape, Shape>}`; an adapter is a `Layer`; a use case is an `Effect` wrapped in
  `Effect.withSpan`. `Layer.provide` and `Effect.run*` appear only in composition roots and tests.
- Errors: one `Data.TaggedError` per cause via `taggedError("Name")`, declared in the owning slice's
  `domain/errors.js`, structured props only (use `reason`, never `cause`). Adapters translate library
  errors at the boundary; nothing library-specific escapes.
- Zod 4 for every schema. Domain types are `z.infer` typedefs.
- Execute-tier use cases build an `Action` from `@solos/actions` and call the `ActionExecutor` port.
  They never touch a signer or RPC. `DirectSignerExecutor` (local keypair) is the default; a vault
  engine is a different Layer, never a dependency (ADR-0013, ADR-0014).
- Tools: `defineTool` in `<slice>/tools/`, named `solana_<group>_<verb>_<object>`, tier
  `read | simulate | execute`, every argument `.describe()`d, description written the way a user
  would ask. Every `execute` tool has a `simulate` twin. `packages/core/src/tools-registry.test.js`
  enforces all of this.
- Production files are capped at 150 logical lines (comments and blanks excluded) and 225 physical
  lines; test files are capped at 300 logical and physical lines. `solos dev check` blocks changed
  files over those physical limits, requires touched legacy debt to be split, and reports untouched
  debt without blocking. The comparison is `HEAD` against its merge-base with `origin/main` (or
  `HEAD^` on `main`) and fails if that Git base is unavailable. Functions ≤40 lines, complexity ≤8,
  ≤20 statements, ≤3 params, kebab-case names, named exports.
- Tests: unit only for pure domain logic; everything else is an integration test through real
  adapters against Surfpool, colocated as `*.test.js`, suite names tagged `[integration]`.
- Logs are JSON on stderr. stdout is reserved for JSON-RPC (MCP) and JSON results (CLI).

## Adding a capability

1. Slice in `packages/core/src/<name>/`: domain types + errors, port tag, use case, tool definition,
   `index.js` exporting `<name>Tools`.
2. Register the tools array in `packages/core/src/index.js`.
3. For read tools: an adapter Layer in `packages/solana/src/<name>/`, wired into `SolanaLive` and
   `SolanaTestLive`. For execute tools: a new `Action` variant in `packages/actions` and a branch in
   `DirectSignerExecutor`. The branch builds a draft (its ordered instructions, any extra
   signers on their account metas, a named compute config) and hands it to Submission
   (`packages/solana/src/submission/`) with an optional probe (what simulation must show) and
   guard (what must hold right before sending). Submission fetches the lifetime and signs. A
   branch never signs, simulates, rechecks the lifetime or sends on its own (ADR-0031,
   ADR-0032); Phoenix onboarding's co-signed v0 wire is the one exception (ADR-0025), and it
   still confirms through Submission's loop.
4. Integration test against Surfpool next to the adapter.
5. `bun run solos dev check && bun run solos dev test`.

Decisions and their reasons are in `docs/adr/`. Vocabulary is in `CONTEXT.md`.
