# 0033 — Simulation never carries a real signature, and every surface has a tier ceiling

Status: accepted, 2026-09-30. Extends ADR-0031 (Submission order) and ADR-0029 (tier ceiling on the
MCP server). Prompted by a DeepSec scan of `main` (Grok 4.7 and GLM 5.3 Flash, 2026-09-29), whose
confirmed findings this decision and its change set answer.

## Context

Submission (ADR-0031) sealed a draft first and simulated the sealed bytes, so the simulate tier
posted a fully signed, still-live transaction to the configured RPC under `simulateTransaction`.
Nothing was sent, but the endpoint held bytes it could broadcast. The RPC is Operator
infrastructure and trusted for reads; a simulate-tier tool nonetheless promises "nothing is sent",
and that promise should not depend on the endpoint's honesty.

The MCP server has advertised a tier ceiling since ADR-0029, default `simulate`. `solos agent run`
did not: it bound every tool, execute tier included, into the model loop. Third-party MCP servers
from `harness.config.js` joined that loop under their raw names, after the core tools, so one could
shadow `solana_transfer_execute_sol`. Their transport was also started twice and failed.

Three provider transports (Elfa reads, Elfa chat, Jupiter prices) let `fetch` follow redirects with
the API key attached, while the Jupiter swap transport pinned the origin. Several error sites put a
raw RPC URL or a raw library message into an error that leaves the process.

## Decision

- **The simulate tier simulates unsigned bytes.** Submission still seals (fetches the lifetime,
  signs, proves the v1 shape), but `simulateDraft` zeroes every signature before the RPC sees the
  wire and simulates with `sigVerify: false`. The execute tier simulates the signed bytes it is
  about to send; that is what a spend bound must measure. The Phoenix onboarding preflight does the
  same to its v0 wire.
- **Every surface that runs tools has a tier ceiling, default `simulate`.** `solos agent run`
  gains `--tier`, honouring `SOLOS_TOOL_TIER` like the server; the flag wins. Execute tools reach a
  model only when the Operator raised the ceiling for that surface.
- **Third-party MCP tools are namespaced `<server>__<tool>`** and can never replace a core tool.
  Their transport is created unstarted and started once by the AI SDK client. A server that fails
  during discovery closes every server opened before it.
- **The harness runs the same pure input guard as the MCP server** before the runtime, so a
  rejection is the same structured error on both surfaces.
- **One origin-pinned, size-bounded HTTP exchange** (`packages/solana/src/http/pinned-fetch.js`)
  serves every keyed provider transport: redirects are followed only on the start origin, a
  redirected POST is refused, bodies are read under a cap. The swap transport already behaved so.
- **Errors carry origins and fixed sentences only.** An RPC URL leaves the process as its origin;
  a library's exception text never does.

## Consequences

- A remote signer is still exercised on the simulate tier (sealing signs), which keeps "can this
  wallet sign" as a preflight, while the RPC receives nothing relayable.
- Simulation results can differ from the signed bytes only in the signature slots, which programs
  never read; unit and Surfnet tests pin the zeroed wire and `sigVerify: false`.
- `solos agent run` refuses execute tools by default. Runs that spent funds now need `--tier
  execute`, which is the visible flag the Operator meant to reach for.
- Operators with `harness.config.js` servers see their tools under new names.
- CI pins every action to a commit digest and verifies the Surfpool download against a recorded
  digest; Renovate keeps both current.
