# solOS — agent guide

solOS is a thin Solana execution layer for LLM agents: an MCP server exposing well-named tools,
plus a harness that runs its own agent loop and routes tasks across model providers. Policy,
approval, and guardrails live upstream in a separate agentic app. Not here.

## Verify with the lever, never with ad-hoc scripts

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

The JSON printed by `solos dev verify` is the only accepted proof of work. It records the HEAD sha,
whether the tree was dirty, the scope, tool versions, and one entry per step (`ok` true/false/null
for skipped, duration, last output line). Run it with `--json` and paste the object in the PR body
under a `## Evidence` heading inside a ```json fence. CI runs `solos dev evidence check` against
the PR body: the sha must match the PR head, `dirty` must be false, `ok` must be true. Then CI
re-runs `solos dev verify` on the same sha. A description of what you ran is not evidence; the JSON is.

Do not write throwaway scripts to poke the chain or the server. If a verification step is missing,
add a `solos` command instead.

## Funds

- **Reusable tests never touch mainnet.** They run against Surfpool, offline by default, started
  automatically by `ensureSurfnet()` and torn down by the test preload.
- **Live verification rounds may spend real SOL.** When asked to verify against mainnet, Claude Code
  has the go-ahead: set `SOLANA_RPC_URL` and a funded signer, run the `solos` commands, report
  signatures and amounts exactly. Keep amounts small and say what was spent.
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
| `packages/solana/src/` | Kit + keychain Layers implementing core ports, `DirectSignerExecutor`, credential profiles and discovery, Surfpool helpers | The only place Kit appears. |
| `packages/mcp/src/` | stdio server, tool → MCP mapping, the one MCP client | HTTP transport later. |
| `apps/harness/src/` | daemon, router, ToolLoopAgent, sqlite store, tracing | Composition root in `composition.js`. |
| `apps/cli/src/` | `solos` (`@effect/cli`) | Thin: parse, provide Layers, emit JSON. |

Slices today: `wallet`, `transfer`, `market` (Elfa Chat + discovery/news/summaries + Jupiter prices + on-chain token
metadata implemented), `swap` (ports + use cases, no adapters), `signals` (ports only).

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
- Changed code and test files are capped at 150 physical lines by `solos dev check`; comments and
  blanks count, touched legacy debt must be split, and untouched debt is reported without blocking.
  The comparison is `HEAD` against its merge-base with `origin/main` (or `HEAD^` on `main`) and
  fails if that Git base is unavailable. ESLint separately bounds logical lines. Functions ≤40
  lines, complexity ≤8, ≤3 params, kebab-case names, named exports.
- Tests: unit only for pure domain logic; everything else is an integration test through real
  adapters against Surfpool, colocated as `*.test.js`, suite names tagged `[integration]`.
- Logs are JSON on stderr. stdout is reserved for JSON-RPC (MCP) and JSON results (CLI).

## Adding a capability

1. Slice in `packages/core/src/<name>/`: domain types + errors, port tag, use case, tool definition,
   `index.js` exporting `<name>Tools`.
2. Register the tools array in `packages/core/src/index.js`.
3. For read tools: an adapter Layer in `packages/solana/src/<name>/`, wired into `SolanaLive` and
   `SolanaTestLive`. For execute tools: a new `Action` variant in `packages/actions` and a branch in
   `DirectSignerExecutor`.
4. Integration test against Surfpool next to the adapter.
5. `bun run solos dev check && bun run solos dev test`.

Decisions and their reasons are in `docs/adr/`. Vocabulary is in `CONTEXT.md`.
