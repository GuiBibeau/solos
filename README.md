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
bun run check                   # format, lint, dependency rules, types
bun test                        # unit + integration (starts Surfpool offline automatically)

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
docs/adr          why things are the way they are
docs/clients      wiring snippets for Claude Code, Codex, Cursor
```

Read `AGENTS.md` before contributing (humans too) and `CONTEXT.md` for vocabulary.

## Tools today

| Tool | Tier |
|---|---|
| `solana_wallet_get_address` | read |
| `solana_wallet_get_balance` | read |
| `solana_transfer_simulate_sol` | simulate |
| `solana_transfer_send_sol` | execute |

`swap` and `market` have ports and use cases but no adapters yet; `signals` has ports only.

## License

Apache-2.0. Copyright 2026 Solana Foundation.
