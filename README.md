# solOS

A thin Solana execution layer for LLM agents. An MCP server, a harness, and the `solos` CLI
share one core. Many tools, no policy. Execute paths are proven with a real mainnet spend.

Bun, Effect, Zod, and Solana Kit. Mainnet by default.

## Quick start

```sh
bun install
bun run solos login --provider privy --rpc-url https://your-provider-url   # or local | pay
bun run solos mcp list
bun run solos wallet balance
```

Requires Bun ≥ 1.3.

## Layout

`packages/` is actions, core, Solana adapters, and the MCP server. `apps/` is the harness and the
`solos` CLI.

## Docs

- [Tools](docs/reference/tools/index.md)
- [Decisions](docs/adr/README.md)
- [Clients](docs/clients/) — Claude Code, Codex, and Cursor
- [AGENTS.md](AGENTS.md)
- [CONTEXT.md](CONTEXT.md)
- [Feature map](features/README.md)

## License

Apache-2.0. Copyright 2026 Solana Foundation.
