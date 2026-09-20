# Iris integration

Status: scoped through grill-with-docs for implementation through a GitHub issue.

## Agreed scope

- Integrate Iris, Elfa's market-intelligence stack.
- Support intelligence requests: an agent asks for market context on demand.
- Support wake-ups: incoming intelligence starts an agent run.
- The agent decides which conditions it wants to watch and registers its own alerts through
  tools. Matching alerts cause wake-ups; the user does not have to author every alert.
- Both modes belong in the intended outcome. The number and ordering of implementation issues
  are still open.

## Existing behavior

- Core tool definitions are shared by the MCP server and the harness.
- The signals slice has a `SignalSource` port and a generic `Signal` schema, but no adapter.
- `apps/harness/src/daemon/daemon.js` forwards a provided source to `signal.received` and logs
  and sinks events. It does not invoke the agent. Delivering a signal to this bus alone would
  not satisfy the agreed wake-up behavior.
- The harness composition currently provides no `SignalSource` and uses `EventSinkNoop`.

## Provider facts to account for

Checked against Elfa's documentation on 2026-09-16:

- [Market Events](https://docs.elfa.ai/market-intelligence/news-narratives/#market-events-new)
  provides structured events with impact, confidence, entities, tokens, and source links;
  access is Enterprise-only.
- [Auto notifications](https://docs.elfa.ai/auto/notifications/) supports webhook and SSE
  delivery for configured queries. Its SSE stream is live-only and does not replay events.
- [Auto query model](https://docs.elfa.ai/auto/query-model/) exposes validation and creation
  of conditions with notification actions. Queries have an expiry and are one-shot by default;
  recurrence is optional. This is a candidate for agent-registered alerts, not yet a selected
  implementation contract.
- These are distinct API surfaces. Whether Auto delivers the particular Iris intelligence
  wanted here, or another ingestion approach is needed, remains to be established.

## Open decisions

- Whether alerts belong to their originating task or to the agent globally, and what context
  is restored on a wake-up.
- Which alert condition types, expiry, recurrence, and lifecycle operations to expose.
- What context an intelligence request returns and what a woken agent should produce.
- Available Iris API access and the supported request and delivery contracts.
- Delivery, deduplication, restart behavior, and ownership of agent scheduling.
- Verification through `solos`, including repeatable tests without production credentials.

No new architectural trade-off has been settled yet. Record an ADR when a decision meets the
domain-modeling criteria; keep this document as the working scope and issue source.
