# solOS

A thin Solana execution layer for LLM agents. Two faces, one core:

- **MCP server** (`packages/mcp`): stdio server that Claude Code, Codex, Cursor and any MCP client
  can spawn. Flat, searchable tool list; every signing tool has a simulate twin.
- **Harness** (`apps/harness`): long-running daemon with an event bus, a provider-neutral model
  router, and an agent loop that uses the same tools directly plus any third-party MCP server.

Plain JavaScript on Bun, Effect for architecture, Zod for schemas, Solana Kit 8 for the chain,
`@solana/keychain` for signing. Mainnet by default; Surfpool for everything reusable.

## Quick start

```sh
bun install
bun run solos login --provider privy --rpc-url https://your-provider-url   # browser login; or local | pay
bun run solos dev verify --scope unit --json   # Evidence: the only accepted proof of work (ADR-0016)
bun run solos dev verify                        # full: adds Surfpool integration tests

bun run solos dev surfpool up   # local network for manual verification
bun run solos wallet balance
bun run solos mcp list
```

Requires Bun ≥ 1.3 and [Surfpool](https://solana.com/docs/tools/surfpool)
(`curl -sL https://run.surfpool.run/ | bash`).

## Layout

```
packages/actions  Action / state / result schemas, the one published package
packages/core     domain, ports, use cases, tool definitions   (zero I/O)
packages/solana   Kit + keychain adapters, DirectSignerExecutor, Surfpool helpers
packages/mcp      stdio MCP server, the single MCP client
apps/harness      daemon, router, agent loop, sqlite store, tracing
apps/cli          `solos`: operator CLI and verification lever
apps/factory      eve software factory: GitHub issue → stations → draft PR (Node 24 for the eve CLI only)
docs/adr          why things are the way they are
docs/clients      wiring snippets for Claude Code, Codex, Cursor
```

Read `AGENTS.md` before contributing (humans too) and `CONTEXT.md` for vocabulary.

## How work gets done

Design is human: a grilling session ends in an ADR and issues with acceptance criteria. Labelling
an issue `agent-ready` hands it to the factory (`apps/factory`), which plans, implements, and
independently reviews the change in sandboxes and opens a **draft** pull request. Every pull
request, from a person or an agent, carries the JSON printed by `solos dev verify` under
`## Evidence`; CI checks it against the head commit and re-runs the same command. A person marks
the draft ready and merges. See `docs/factory.md` for operating the factory and ADR-0016 for why.

## Tools today

| Tool | Tier |
|---|---|
| `solana_wallet_get_address` | read |
| `solana_wallet_get_balance` | read |
| `solana_market_ask_iris` | read |
| `solana_transfer_simulate_sol` | simulate |
| `solana_transfer_send_sol` | execute |

`market` has the Iris adapter behind `ELFA_API_KEY`; `swap` still has ports and use cases but no
adapter; `signals` has ports only.

## Market intelligence (Elfa Iris)

`solana_market_ask_iris` (MCP) and `solos market ask --question` (CLI) send one market question to
Elfa's Iris and return the written answer, the credits the call consumed, and the receive time.
Links appear only when the provider includes them; solOS never invents citations or certainty.

- **Setup:** export `ELFA_API_KEY`. Chat access requires an Elfa Grow plan or above, or
  pay-as-you-go credits. The key stays in the environment — never in tool arguments.
- **Credits:** every call consumes Elfa credits; the response reports the exact amount as
  `creditsConsumed`.
- **Endpoint:** `POST {ELFA_BASE_URL}/v2/chat`, default `https://api.elfa.ai`. Plain `http` is
  accepted only for loopback hosts running local test fixtures.
- **One attempt, 30-second deadline.** Elfa bills per request and chat can run past a minute, so
  solOS never retries automatically — a silent retry would double-bill.

Trial (the ordinary Solana profile/RPC startup requirements still apply):

```sh
ELFA_API_KEY=... bun run solos market ask --question "What changed for SOL in the last 24 hours?"
ELFA_API_KEY=... bun run solos mcp call solana_market_ask_iris --args '{"question":"What changed for SOL in the last 24 hours?"}'
```

## License

Apache-2.0. Copyright 2026 Solana Foundation.
