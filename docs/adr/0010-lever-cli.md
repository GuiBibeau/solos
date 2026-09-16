# 0010 — One `solos` CLI as operator tool and agent lever

Status: accepted, 2026-09-15

## Context

Agents asked to "verify the feature" write unvetted one-off scripts. A repo-local CLI with
predictable syntax and JSON output replaces pages of markdown instructions and makes verification
reproducible across parallel agents (the pstack "build the lever" idea).

## Decision

One CLI, `solos`, in `apps/cli` on `@effect/cli`, serving both operators and agents. Dev and
verification commands live under `solos dev`. Every command prints JSON (pretty on a TTY) and exits
non-zero on domain errors with the same `{ code, ...props }` shape MCP clients see.

Surface: `wallet balance|address`, `transfer sol`, `mcp list|call`, `router route`, `agent run`,
`daemon`, `dev surfpool up|down|status|fund|set-token`, `dev check`, `dev test`.

`solos mcp ...` spawns the repo's own MCP server exactly as an external client would and forwards
only known env keys. `solos dev surfpool up` starts a detached Surfpool and records it in
`.solos/surfpool.json`.

Agents learn about the lever from one section in `AGENTS.md` and from `--help`. No skill files
until a recipe repeats three times.

## Consequences

- The CLI depends on every package; nothing depends on the CLI.
- Missing verification steps are added as commands, never as scripts.
