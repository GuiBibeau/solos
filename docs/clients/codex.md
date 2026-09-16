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
enabled_tools = ["solana_wallet_get_address", "solana_wallet_get_balance"]
```

`SOLOS_TOOL_TIER` filters on the server side; `enabled_tools` filters on the client side. Either
alone is enough; both together are belt and braces.
