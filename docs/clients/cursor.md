# Cursor

`.cursor/mcp.json` in a project, or `~/.cursor/mcp.json` globally:

```json
{
  "mcpServers": {
    "solos": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/solos/packages/mcp/src/bin/stdio.js"],
      "env": {
        "SOLOS_PROFILE": "main"
      }
    }
  }
}
```

Tool annotations (`readOnlyHint`, `destructiveHint`) are set from each tool's tier, so Cursor's
auto-run settings can allow reads and prompt on `solana_transfer_send_sol`.
