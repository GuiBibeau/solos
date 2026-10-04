# Codex CLI

```sh
solos connect codex
```

adds a `[mcp_servers.solos]` table to `~/.codex/config.toml` with a backup, replacing an earlier
solos table (its `env` sub-table included) and leaving every other table alone. Start a new Codex
session; `/mcp` lists solos.

The table it writes:

```toml
[mcp_servers.solos]
command = "solos"
args = ["mcp", "serve"]
```

`--profile <name>` adds `env = { SOLOS_PROFILE = "<name>" }`. Codex keeps MCP servers in the user
config only, so `--scope project` is refused.

Codex loads every tool schema of an MCP server up front (no deferral), so prefer the server's
own discovery (below) or a static allowlist to keep context small:

```toml
[mcp_servers.solos]
command = "solos"
args = ["mcp", "serve", "--tier", "read"]
enabled_tools = ["solana_wallet_get_address", "solana_wallet_get_balance", "solana_market_ask_iris"]
```

`--tier` filters on the server side; `enabled_tools` filters on the client side. Either alone is
enough; both together are belt and braces.

## Tool tier

The server advertises **read and simulate** tools by default; execute tools appear only when the
Operator raises the ceiling: `solos connect codex --tier execute`. Accepted values are `read`,
`simulate` and `execute`. `SOLOS_TOOL_TIER` in `env` still works; the `--tier` flag wins when
both are set. Withheld tools never appear in `tools/list`.

## Tool discovery

By default the server advertises three tools and enables the rest on demand through
`solana_discovery_search_tools` and `tools/list_changed`. A client that does not follow list
changes needs everything up front: `solos connect codex --tools all`, and `enabled_tools` still
filters on top.

## From a checkout

`bun run solos connect codex` writes the source server instead:
`command = "bun"`, `args = ["--no-env-file", "/path/to/solos/packages/mcp/src/bin/stdio.js"]`.
