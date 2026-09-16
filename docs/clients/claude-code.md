# Claude Code

The repo ships `.mcp.json` so Claude Code picks the server up when opened here. For another
project, add to that project's `.mcp.json` or `~/.claude.json`:

```json
{
  "mcpServers": {
    "solos": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/solos/packages/mcp/src/bin/stdio.js"],
      "env": {
        "SOLOS_PROFILE": "main",
        "SOLOS_LOG_LEVEL": "info"
      }
    }
  }
}
```

Create the profile first: `solos login --provider local --profile main --rpc-url https://...`.
Explicit `SOLANA_RPC_URL` / `SOLOS_SIGNER_*` in `env` still override the profile.

Claude Code defers MCP tools by default and loads them through `ToolSearch`. Tool names are
`mcp__solos__solana_<group>_<verb>_<object>`; searching for a group name (`wallet`, `transfer`)
surfaces the whole group. Set `"alwaysLoad": true` on the entry to load everything eagerly.

Signing tools carry `_meta["anthropic/requiresUserInteraction"] = true`, so Claude Code prompts
before running them regardless of permission mode.

Read-only deployment: add `"SOLOS_TOOL_TIER": "read"` to `env`.
