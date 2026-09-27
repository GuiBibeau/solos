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

## Tool tier

The server advertises **read and simulate** tools by default; execute tools (the ones that sign
and send) appear only when the Operator raises the ceiling deliberately. Two ways to raise it, and
an explicit flag beats the env var:

```json
{
  "mcpServers": {
    "solos": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/solos/packages/mcp/src/bin/stdio.js", "--tier", "execute"],
      "env": { "SOLOS_PROFILE": "main" }
    }
  }
}
```

`SOLOS_TOOL_TIER` in `env` does the same and still works; `--tier` wins when both are set. The
accepted values are `read`, `simulate` and `execute`. A read-only deployment is `"--tier", "read"`
or `"SOLOS_TOOL_TIER": "read"`. Withheld tools are absent from `tools/list`, not present and
failing, so a Caller plans around what it can see.
