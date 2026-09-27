# Codex CLI

Codex loads every tool schema of a user MCP server up front (no deferral), so use the static
allowlist to keep context small. In `~/.codex/config.toml`:

```toml
[mcp_servers.solos]
command = "bun"
args = ["run", "/absolute/path/to/solos/packages/mcp/src/bin/stdio.js"]
env = { SOLOS_PROFILE = "main" }
```

Read-only preset:

```toml
[mcp_servers.solos]
command = "bun"
args = ["run", "/absolute/path/to/solos/packages/mcp/src/bin/stdio.js"]
env = { SOLOS_PROFILE = "main", SOLOS_TOOL_TIER = "read" }
enabled_tools = ["solana_wallet_get_address", "solana_wallet_get_balance", "solana_market_ask_iris"]
```

`SOLOS_TOOL_TIER` filters on the server side; `enabled_tools` filters on the client side. Either
alone is enough; both together are belt and braces.

## Tool tier

The server advertises **read and simulate** tools by default; execute tools appear only when the
Operator raises the ceiling. Pass it as a server flag, which beats the env var:

```toml
[mcp_servers.solos]
command = "bun"
args = ["run", "/absolute/path/to/solos/packages/mcp/src/bin/stdio.js", "--tier", "execute"]
env = { SOLOS_PROFILE = "main" }
```

Accepted values are `read`, `simulate` and `execute`. `SOLOS_TOOL_TIER` in `env` still works; the
`--tier` flag wins when both are set. Withheld tools never appear in `tools/list`.
