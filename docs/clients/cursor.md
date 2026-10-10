# Cursor

```sh
solos connect cursor
```

writes the solos entry into `~/.cursor/mcp.json` (user scope) with a backup, or into
`./.cursor/mcp.json` with `--scope project`. Open Cursor Settings, MCP; solos appears with its
tools.

The entry it writes:

```json
{
  "mcpServers": {
    "solos": {
      "command": "solos",
      "args": ["mcp", "serve"],
      "env": {}
    }
  }
}
```

`--profile <name>` adds `SOLOS_PROFILE` to `env`. Tool annotations (`readOnlyHint`,
`destructiveHint`) are set from each tool's tier, so Cursor's auto-run settings can allow reads
and prompt on execute tools.

## Tool tier

The server advertises **read and simulate** tools by default. Raise the ceiling with
`solos connect cursor --tier execute`, which writes `"args": ["mcp", "serve", "--tier", "execute"]`.
Accepted values are `read`, `simulate` and `execute`. `SOLOS_TOOL_TIER` in `env` still works; the
`--tier` flag wins when both are set. Without it, an execute tool such as
`solana_transfer_execute_sol` is never advertised. Withheld tools are absent from `tools/list`, not
present and failing.

## Tool discovery

By default the server advertises three tools and enables the rest on demand through
`solana_discovery_search_tools` and `tools/list_changed`. If Cursor does not pick up the changed
list, connect with `--tools all` to advertise every permitted tool up front.

## Remote engine

Put the three variables in the entry's `env`. The caller needs no `SOLOS_SIGNER_*`; the Engine
holds the key:

```json
"env": {
  "SOLOS_EXECUTOR": "engine",
  "SOLOS_ENGINE_URL": "http://127.0.0.1:8787",
  "SOLOS_ENGINE_TOKEN": "<the token the engine was started with>"
}
```

`SOLOS_ENGINE_URL` is the origin only. Start the engine with `solos engine start` (dry run),
`solos engine start --paper` (Surfpool), or `solos engine start --tier execute` (live).

## From a checkout

`bun run solos connect cursor` writes the source server instead: `"command": "bun"`,
`"args": ["--no-env-file", "/path/to/solos/packages/mcp/src/bin/stdio.js"]`.
