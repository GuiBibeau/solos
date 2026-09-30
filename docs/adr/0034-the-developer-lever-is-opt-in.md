# 0034 — The developer lever is opt-in: `solos dev` exists only under `SOLOS_DEV=1`

Status: accepted, 2026-09-30. Extends ADR-0010 (the `solos` CLI is the lever).

## Context

`solos` has been two things in one command tree: the operator CLI (`wallet`, `swap`, `perp`,
`mcp`, …) and the developer lever (`dev verify`, `dev evidence`, `dev surfpool`, `dev inspect`,
`dev check`, `dev docs`, `dev qa`, `dev test`). An agent operating a wallet through `solos --help`
therefore read "Developer and agent verification lever", "Evidence JSON (the only accepted proof
of work)" and "chain evidence for QA reconciliation". That vocabulary belongs to this
repository's pull-request process, not to the product an Operator installs. Observed on
2026-09-30 in a pi session run from the checkout: the model read the lever's help and reasoned
about verification and proof instead of about the wallet.

## Decision

- The `dev` group joins the command tree only when `SOLOS_DEV` is exactly `1`. Any other value,
  a blank one included, leaves it out, and `solos dev …` is then an unknown command.
- The checkout's `bun run solos` script sets the flag. Every documented `bun run solos dev …`
  invocation, CI included, keeps working unchanged; `docs:check` goes through that script for the
  same reason.
- An installed `solos` (a bin, a compiled binary, or `bun apps/cli/src/main.js` run directly)
  advertises the operator surface only.
- Nothing else reads the flag. It never widens a tier ceiling, never skips a simulation, never
  changes a default.

## Consequences

- `solos --help` outside the checkout is the operator surface; the lever's vocabulary stays in
  the repository.
- A developer who runs the entry directly without the flag sees no `dev` group. The remedy is
  `bun run solos`, or `SOLOS_DEV=1` in front of the direct invocation.
- A separate `solos-dev` entry point stays possible later without breaking this contract; the
  flag is the smaller change today.
- A coding agent started from the checkout still reads AGENTS.md as its project guide and still
  meets the lever's vocabulary there. That is the guide doing its job, not the product leaking.
