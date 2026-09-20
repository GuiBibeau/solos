# 0006 — No policy or guardrails in solOS

Status: accepted, 2026-09-15

## Context

An autonomous agent with signing keys on mainnet is dangerous without limits. The obvious place
for spend caps, allowlists, and kill switches is next to the tools. The team's stack, however,
keeps policy, approval, and audit upstream in the calling agentic application for every capability,
not only Solana.

## Decision

solOS is a thin execution layer with many tools and no policy. No spend caps, no allowlists, no
kill switch, no mandatory confirmation. Two things remain as plain engineering, not policy:

- Every `execute` tool has a `simulate` twin, and `execute` tools take `skipSimulation`
  (default `false`) so a failing transaction is caught before fees are paid.
- Every `execute` tool is annotated `destructiveHint: true` and
  `_meta["anthropic/requiresUserInteraction"] = true`, so clients that support it prompt a human.

The push-back that this leaves nothing between a prompt-injected signal and `sendTransaction`
was raised and answered: that is upstream's job.

## Consequences

- Anyone running solOS directly against a funded mainnet wallet is trusting the caller entirely.
  `AGENTS.md` says so.
- A read-only deployment is one env var: `SOLOS_TOOL_TIER=read`.
