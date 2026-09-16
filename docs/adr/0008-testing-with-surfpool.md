# 0008 — Integration tests over implementation details, on Surfpool

Status: accepted, 2026-09-15

## Context

Tests that assert a port was called or that mock a use case's collaborators rot fast and prove
little. Solana has a local mainnet-fork validator, Surfpool, with cheatcodes to set any state.

## Decision

- Unit tests only for pure domain logic (lamports math, amount formatting, env parsing, route
  resolution). No fakes of ports, no assertions on calls.
- Every slice is tested end to end through its real adapter against Surfpool, colocated as
  `*.test.js`, suite names tagged `[integration]`. The MCP server is tested black-box over stdio
  with the real client. The agent loop is tested with `MockLanguageModelV4` for the model and real
  tools against Surfpool.
- Surfpool runs as the CLI binary behind a small `Surfnet` port (`packages/solana/src/surfnet/`).
  `ensureSurfnet()` starts one per `bun test` run on a free port, offline, and attaches instead when
  `SURFNET_RPC_URL` is set. The test preload (`scripts/test-preload.js`) stops it in a global
  `afterAll` and kills it on exit signals. The embedded `@solana/surfpool` package becomes an
  alternative adapter once its peer dependency reaches Kit 8.
- Offline mode has no mainnet mints, so tests materialise mints with `setMint` (program codec +
  `surfnet_setAccount`). Tests that need real mainnet state (future swap) set
  `SURFNET_DATASOURCE_RPC_URL` and skip when it is absent, so CI runs with zero secrets.
- **Reusable tests never touch mainnet. Live verification rounds in Claude Code may spend real
  SOL when the user asks.** Both are stated in `AGENTS.md`.
- Router evals are deferred.

## Consequences

- CI installs Surfpool with the official script; the whole suite runs in seconds with no RPC key.
- Surfpool's `jsonParsed` gaps and SIGTERM handling are absorbed by the adapter, not the tests.
