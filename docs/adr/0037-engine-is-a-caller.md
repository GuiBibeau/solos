# 0037 — The Engine is a Caller inside this repo

Status: accepted, 2026-10-10. Amends ADR-0013 and ADR-0014. Supersedes the "solOS refuses
strategies" note in `docs/design/dx.md` for the Engine only. Issue #194 asked for this record as
ADR-0036; that number is the release-lanes decision, already accepted, so this is 0037. No earlier
ADR was renumbered.

Amended by ADR-0038.

## Context

ADR-0013 left `SOLOS_EXECUTOR=engine` reserved for a `VaultEngineExecutor` that would talk to a
separate `vault-engine`. ADR-0014 put that engine in another repo and kept this one as
`finance-harness`. The product that actually has to hold a hot key on a laptop or a Frankfurt box
is different: the same tools, the same Actions, a signer that never leaves that box, and a place
for strategies later. The harness daemon and its SQLite store are already gone (#193). The seam
is `ActionExecutor`, which until now had one adapter, so the seam was hypothetical.

Strategies, spend caps and a kill switch are not this decision's implementation. They need a
recorded home so later children do not invent a second executor.

## Decision

- **The Engine is a Caller inside this monorepo**, at `apps/engine` (`@solos/engine`, bin
  `solos-engine`). It is not a second tool surface. Callers (the MCP server, the `solos` CLI)
  keep every tool. `SOLOS_EXECUTOR=engine` plus `SOLOS_ENGINE_URL` and `SOLOS_ENGINE_TOKEN`
  selects `EngineExecutor`, an HTTP adapter of `ActionExecutor`. A missing URL or token fails
  startup with `EngineConfigMissing`, which names the variable the way `RpcConfigMissing` does.
  The caller needs no signer variables: the hot key lives only on the Engine host. This amends
  ADR-0013. `SOLOS_EXECUTOR=engine` means this Engine, not a `VaultEngineExecutor` aimed at
  another repo.
- **Vault mode, if it comes, is a later Layer inside this Engine.** This amends ADR-0014. Wallet
  mode stays the default (`direct`). solOS still does not import a `vault-core`. The note in
  `docs/design/dx.md` that solOS refuses strategies stands for core, the tools and the MCP
  server (ADR-0006). It does not stand for the Engine: strategies will live here, as a Caller.
- **The Engine's API is a facade over `DirectSignerExecutor`.** It validates with `ActionSchema`,
  checks the bearer token, enforces the tier ceiling, stores Intents, and maps errors to HTTP
  statuses. It does not build transactions. Submission does, unchanged, in `slow` mode through
  the RPC Submitter (ADR-0031, ADR-0032).
- **Intent.** One Caller request to execute one Action, identified by `intentId`. CLI and MCP
  retries reuse the id `EngineExecutor` saved for that action in the caller's config directory
  (`engine-intents.sqlite`) before the first request; a lost response leaves the row, so the next
  execute of the same action sends the same id. The Engine executes an Intent at most once.
  States: `in_flight`, `settled` (with the `ExecutionResult`), `failed` (with the error
  envelope). A repeat of a settled or failed Intent returns the stored outcome. A repeat while
  in flight is `IntentInFlight` (409). At sign time, before broadcast, the Engine stores the
  transaction signature and its last valid block height on the Intent. On startup, and whenever
  a request touches an in-flight Intent that already has a signature, it looks the signature up.
  If it has landed, the Intent becomes `settled` with that result and is not resent. It becomes
  `failed` only once the blockhash has expired and the signature is still absent; only then is a
  resend with a new intent safe. Otherwise it stays `in_flight`, answers 409, and counts as
  possibly spent. An in-flight Intent with no signature at startup died before broadcast and is
  marked `failed`, because nothing was sent. The store is SQLite (`bun:sqlite`, WAL) owned by
  the Engine. It is the first table. The cap ledger and the strategy repository will join it
  later.
- **Wire.** Plain JSON, versioned prefix. Failures are
  `{ "error": { code, reason, remedy?, ...props } }`, the same envelope the CLI prints.

  ```
  POST /v1/actions/simulate   { action }                              -> SimulationResult
  POST /v1/actions/execute    { action, intentId, skipSimulation? }   -> ExecutionResult
  GET  /v1/intents/:intentId                                          -> { state, result? | error? }
  GET  /v1/health                                                     -> { ok, version, tier, mode, signer, rpcHost, uptimeMs }
  ```

  Statuses: 400 schema failure, 401 missing or wrong token, 403 tier withheld, 409 Intent in
  flight, 422 any `ExecutorError`, 423 Engine killed (reserved for the bounds child; not
  implemented here), 503 signer or RPC unavailable. Every route, health included, requires the
  bearer token. Later children may add fields to `/v1/health` without changing these.
- **How it starts.** `solos-engine` and `solos engine start` share one composition root.
  No flags: dry run, tier `simulate`, execute refused with a reason that names the tier and a
  remedy that names `--tier execute`. `--paper` boots Surfpool the way the tests do, funds the
  signer, and runs the execute tier against that fork; a missing `surfpool` binary fails startup
  with a remedy. `--tier execute` with a real `SOLANA_RPC_URL` is live. `SOLOS_TOOL_TIER` is
  honoured; the flag wins. `--paper` implies execute only when `--tier` was omitted. Startup
  prints one JSON line with the signer address, tier, RPC origin, data directory and mode. The
  token and any RPC path or query are redacted from stderr.
- **Cap ledger, recorded and not built.** The bounds child keeps the ledger in memory and writes
  it behind to SQLite as an append-only log, replayed at start. The trade-off accepted here: a
  crash can lose at most the one reservation write in flight, in exchange for not putting
  `reserve` on a disk fsync. A send that may have landed settles the reservation rather than
  releasing it, so the ledger prefers to over-count. That child implements it. This decision
  only reserves the trade-off and the table it will sit beside.
- **Tracing** is the harness's OTLP layer, copied into the Engine (about thirty lines, no shared
  package). Logs stay JSON on stderr (ADR-0011). Feature flags, when any exist, are read only in
  the Engine composition root via `feature()` from `bun:bundle`. None are required yet.

## Consequences

- Nothing above `ActionExecutor` learns that execution left the process. Tool names, tiers and
  result shapes are unchanged.
- Core, the MCP server and the CLI still hold no policy (ADR-0006). Caps, the kill switch and
  strategies are the Engine's, as a Caller.
- The hot key is a process boundary. A caller configured for the Engine and a caller configured
  `direct` are different deployments, not a fallback.
- 423 is reserved and unused until the bounds child adds `EngineKilled`.
- ADR-0013 and ADR-0014 each carry an "Amended by ADR-0037" line. The amendment text is here.
