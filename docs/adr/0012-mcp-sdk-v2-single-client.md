# 0012 — MCP SDK v2 and one MCP client for the whole repo

Status: accepted, 2026-09-15

## Context

The MCP TypeScript SDK shipped v2 as split packages (`@modelcontextprotocol/server`, `client`,
`core`, `node`) for the 2026-07-28 spec; the v1 monolith (`@modelcontextprotocol/sdk` 1.30) remains
mature. v2 requires Zod 4 (we are on 4.6), lists Bun as a supported runtime, puts stdio transports in
`/stdio` subpaths, and its open bugs are all HTTP-side. Verified on Bun with a round trip.

## Decision

- Server: `@modelcontextprotocol/server` + `/stdio`. `createSolosServer` takes tools and an Effect
  runtime and is transport-agnostic; `bin/stdio.js` is the composition root. HTTP transport later.
- Client: `@modelcontextprotocol/client` + `/stdio` wrapped once in `packages/mcp/src/client`.
  Used by black-box tests, `solos mcp`, and the harness. For third-party servers the harness passes
  that transport to `@ai-sdk/mcp`'s `createMCPClient`, which only converts tools. Only whitelisted
  env keys are forwarded to spawned servers.
- `@modelcontextprotocol/node` (Hono HTTP adapter) is not a dependency.

## Consequences

- One transport implementation to debug.
- If v2 proves rough, falling back to 1.30 touches `create-server.js`, `bin/stdio.js`, and
  `client/index.js` only.
