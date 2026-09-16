# 0007 — Flat static tool list; discovery is naming and description discipline

Status: accepted, 2026-09-15

## Context

solOS will expose dozens or hundreds of tools. The concern was context-window cost and just-in-time
discovery. Research (2026-09-14) found the clients already solve it: Claude Code defers all MCP
tools by default and searches names, descriptions, and argument descriptions; the Claude and OpenAI
APIs have native deferred loading; Codex has none and gets no savings from server tricks. The MCP
spec has no `tools/search`, and no major client re-lists tools on `listChanged` mid-turn.

## Decision

- Register the complete tool list at startup, sorted by name (prompt-cache stability). No runtime
  registration, no `listChanged`, no `search_tools` + `call_tool` meta-dispatcher.
- Names: `solana_<group>_<verb>_<object>`, underscores only, group = slice. Survives Claude Code's
  `mcp__<server>__<tool>` mangling unchanged.
- Descriptions start with the words a user would say and describe every argument. A registry test
  (`packages/core/src/tools-registry.test.js`) fails the build otherwise: name regex, group prefix,
  minimum description length, every argument documented, every `execute` has a `simulate` twin.
- Tier → MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) plus
  `_meta["anthropic/requiresUserInteraction"]` on `execute`, `_meta["solos/tier"]` and
  `_meta["solos/group"]` for any client that wants them.
- Server `instructions`: a short capability map, one line per group.
- Harness agent loop: progressive disclosure via `prepareStep → activeTools` by group.
- Client docs in `docs/clients/` (Codex gets an `enabled_tools` preset).

## Consequences

- Adding a tool is adding a definition; discovery needs nothing else.
- If the MCP roadmap's "progressive discovery" lands, it slots in as a server option without
  changing tool definitions.
