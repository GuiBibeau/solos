# 0004 — Vertical slices with hexagonal internals; five packages

Status: accepted, 2026-09-15

## Context

solOS will grow many unrelated capabilities (wallet, transfer, swap, market data, signals, ...).
A single top-level `domain/` folder becomes a junk drawer within a month. At the same time, the
volatile edges (RPC providers, DEX aggregators, feeds, LLM providers, MCP transport) vastly
outnumber the stable core, which is what hexagonal architecture is for.

## Decision

One hexagon per capability. Each slice in `packages/core/src/<slice>/` has `domain/`, `ports/`,
`use-cases/`, `tools/`, and an `index.js` that is the only thing other slices may import.
`shared/` holds cross-slice primitives and never imports a slice.

Packages (all private, `@solos/*`):

| package | role |
|---|---|
| `core` | slices + shared; zero I/O; forbidden deps: Kit, MCP SDK, AI SDK, `bun:*` |
| `solana` | Layers implementing core ports with Kit + keychain; Surfpool helpers |
| `mcp` | stdio server mapping tool definitions to MCP; the one MCP client |
| `harness` (app) | daemon, router, agent loop, sqlite store, tracing |
| `cli` (app) | `solos`, thin over everything above |

Tool definitions live in core slices (`tools/`) so the MCP server and the harness agent loop map
the same objects; neither knows about the other.

Enforcement: `eslint-plugin-boundaries` (element types with a captured `slice`) and
`.dependency-cruiser.cjs` (no cycles, no cross-slice internals, no I/O deps in core, nothing
imports apps).

## Consequences

- Adding a capability is a checklist (see `AGENTS.md`), not a design session.
- Feeds and LLM adapters start inside existing packages and get promoted to their own package
  when a second consumer appears.
