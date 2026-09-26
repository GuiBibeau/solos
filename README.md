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
bun run solos dev verify --scope unit --json   # Evidence: proof the PR checks passed (ADR-0016)
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
docs/adr          why things are the way they are
docs/clients      wiring snippets for Claude Code, Codex, Cursor
docs/reference    tool list and per-slice behavior
features          live-spend status of Actions
```

Read [AGENTS.md](AGENTS.md) before contributing (humans too) and [CONTEXT.md](CONTEXT.md) for
vocabulary. Decisions are in [docs/adr](docs/adr/README.md). Per-tool behavior is in
[docs/reference/tools](docs/reference/tools/index.md).

## How work gets done

Design work ends in ADRs and issues with acceptance criteria. Every authored pull request carries
the JSON printed by `solos dev verify` under `## Evidence`; CI checks it against the head commit and
re-runs the same command.
See [ADR-0016](docs/adr/0016-verification-evidence.md) for the verification contract.

## How we validate

Every Action strives for a real mainnet spend. Surfpool tests and the Evidence JSON on a pull
request are the required check on a commit. An execute path is proven when the operator authorizes
a round: simulate first, keep the amount small, and reconcile balances.

The [feature map](features/README.md) records what is live-spend validated, what is Surfpool-only,
and what is unimplemented. The round's rules are in [AGENTS.md](AGENTS.md#funds).

## License

Apache-2.0. Copyright 2026 Solana Foundation.
