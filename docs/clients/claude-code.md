# Claude Code

The repo ships `.mcp.json` so Claude Code picks the server up when opened here. It names no
profile, because profile names differ per Operator: the server takes `SOLOS_PROFILE` from the
environment Claude Code was started in, else your default profile (`solos profiles default
<name>`).

Claude Code starts the server at the root of the checkout it was opened in, and Bun loads that
root's `.env` and `.env.local` into the server process. `SOLANA_RPC_URL` and `JUPITER_API_KEY`
can therefore live there. Don't source those files before starting Claude Code: they would
then sit in Claude Code's own environment and in every tool shell it opens. A fresh worktree
has only `.env.example`, so copy both files in from the main checkout, keeping `.env.local` at
0600, before opening Claude Code there. Check the connection with `claude mcp get solos`.

For another project, add to that project's `.mcp.json` or `~/.claude.json`:

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

## Tool discovery

By default the server advertises three tools and withholds the rest until
`solana_discovery_search_tools` is called; matches then join the list through `tools/list_changed`,
which Claude Code follows. The instructions carry the full catalogue. To advertise every permitted
tool up front instead, add `"--tools", "all"` to `args` (or `"SOLOS_TOOLS": "all"` to `env`).
