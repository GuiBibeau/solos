# Claude Code

```sh
solos connect claude
```

writes the solos entry into `~/.claude.json` (user scope) with a backup, or into `./.mcp.json`
with `--scope project`. Restart Claude Code; `claude mcp get solos` confirms the connection.

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

The server takes the default profile; `--profile <name>` adds `SOLOS_PROFILE` to `env`. Explicit
`SOLANA_RPC_URL` / `SOLOS_SIGNER_*` in `env` still override the profile (ADR-0015). Secrets never
go in the file.

Claude Code defers MCP tools by default and loads them through `ToolSearch`. Tool names are
`mcp__solos__solana_<group>_<verb>_<object>`; searching for a group name (`wallet`, `transfer`)
surfaces the whole group. Set `"alwaysLoad": true` on the entry to load everything eagerly.

Signing tools carry `_meta["anthropic/requiresUserInteraction"] = true`, so Claude Code prompts
before running them regardless of permission mode.

## Tool tier

The server advertises **read and simulate** tools by default; execute tools (the ones that sign
and send) appear only when the Operator raises the ceiling deliberately:

```sh
solos connect claude --tier execute
```

which writes `"args": ["mcp", "serve", "--tier", "execute"]`. `SOLOS_TOOL_TIER` in `env` does the
same and still works; `--tier` wins when both are set. The accepted values are `read`, `simulate`
and `execute`. Withheld tools are absent from `tools/list`, not present and failing, so a Caller
plans around what it can see.

## Tool discovery

By default the server advertises three tools and withholds the rest until
`solana_discovery_search_tools` is called; matches then join the list through `tools/list_changed`,
which Claude Code follows. To advertise every permitted tool up front instead, connect with
`--tools all`.

## From a checkout

The repo ships `.mcp.json`, so Claude Code opened at the root starts the source server with
`bun run packages/mcp/src/bin/stdio.js`. It names no profile: the server takes `SOLOS_PROFILE`
from the environment Claude Code was started in, else your default profile. Bun loads the root's
`.env` and `.env.local` into that server process, so `SOLANA_RPC_URL` and `JUPITER_API_KEY` can
live there; do not source those files before starting Claude Code, or they sit in every tool
shell too. `bun run solos connect claude --print` shows the checkout's own entry.
