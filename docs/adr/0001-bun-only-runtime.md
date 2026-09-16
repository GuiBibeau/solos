# 0001 — Bun is the only runtime and package manager

Status: accepted, 2026-09-15

## Context

The project was first framed as a pnpm monorepo running on Bun. That is two toolchains for one
job: two lockfile models, pnpm's strict `node_modules` layout occasionally fighting Bun's resolver,
and two things to install in CI. Nothing upstream requires pnpm.

## Decision

Bun for everything: workspaces (`"workspaces"` in the root `package.json`), install, scripts,
test runner (`bun test`), and distribution (`bun build --compile`). No Node compatibility promise.
Adapters may use `bun:sqlite`, `Bun.spawn`, `Bun.listen` freely. Bun 1.3 uses isolated installs
by default, so each workspace has its own `node_modules`; that is expected.

## Consequences

- External MCP clients must have Bun installed; the client config is `bun run <path>/stdio.js`.
  A compiled single binary is the planned distribution artifact.
- `@types/bun` provides the ambient types for `tsc`.
- No `npx`. Every doc snippet says `bun run`.
