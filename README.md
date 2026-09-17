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
| `solana_market_get_trending_tokens` | read |
| `solana_market_get_token_news` | read |
| `solana_market_get_event_summary` | read |
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

### Free-plan discovery and news

The same key supports these read tools on Elfa's Free plan:

| CLI | MCP tool | Result |
|---|---|---|
| `market trending` | `solana_market_get_trending_tokens` | Tokens ranked by mention activity, previous counts and percentage changes |
| `market news --coin-ids solana` | `solana_market_get_token_news` | News-source X posts, source links, timestamps and engagement |
| `market summary --keywords Solana` | `solana_market_get_event_summary` | Event summaries and provider-supplied citations (5 credits/call) |

All use `--time-window` (`30m`, `1h`, `4h`, `24h`, `7d`, `30d`; default `24h`). Trending and news
accept `--page` and `--page-size` (1–50, default 10); trending also accepts `--min-mentions`.
News uses comma-separated **CoinGecko IDs**, not tickers. Summary accepts comma-separated keywords
and `--search-type and|or` (default `or`). Each command makes one request without retries. Summary generation has a 180-second deadline;
other endpoints have a 30-second deadline. External MCP clients should allow at least 190 seconds
for `solana_market_get_event_summary` (the bundled CLI already does).

```sh
bun run solos market trending --time-window 24h --page-size 5
bun run solos market news --coin-ids solana --time-window 24h
bun run solos market summary --keywords Solana --time-window 24h
bun run solos mcp call solana_market_get_token_news --args '{"coinIds":["solana"],"timeWindow":"24h"}'
bun run solos dev verify --scope full --qa elfa-market --json
```

Results include `provider`, `receivedAt`, and `creditsConsumed` from Elfa's `x-elfa-credits` header
(`null` if unavailable). Receipt time is not a source freshness guarantee. Empty result lists are
valid. Trending is experimental; it measures attention, not price or sentiment. News contains
links and metrics, not raw post text. See [live QA](docs/iris-qa.md) for the bounded six-call suite.

## License

Apache-2.0. Copyright 2026 Solana Foundation.
