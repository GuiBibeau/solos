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
auto-run settings can allow reads and prompt on execute tools.

## Tool tier

The server advertises **read and simulate** tools by default. Raise the ceiling to `execute` with
the `--tier` flag, which beats the `SOLOS_TOOL_TIER` env var:

```json
{
  "mcpServers": {
    "solos": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/solos/packages/mcp/src/bin/stdio.js", "--tier", "execute"],
      "env": {
        "SOLOS_PROFILE": "main"
      }
    }
  }
}
```

Accepted values are `read`, `simulate` and `execute`. `SOLOS_TOOL_TIER` in `env` still works; the
`--tier` flag wins when both are set. Without it, an execute tool such as
`solana_transfer_execute_sol` is never advertised. Withheld tools are absent from `tools/list`, not
present and failing.
