# 0029 — Tool discovery is just in time: the server withholds tools and enables them on demand

Status: accepted, 2026-09-27. Extends ADR-0007, which chose a flat static list before the cost was
measured and before the SDK exposed `enable`, `disable` and `sendToolListChanged`. The
name-and-description discipline and the tier→annotation mapping stand unchanged; the "no runtime
registration, no `listChanged`" clause is superseded.

## Context

The tool list is the Caller's interface, and it is not free. Measured on the registry at 46 tools:
**14,783 bytes** for names, titles and annotations alone, before descriptions and JSON schemas, paid
on every turn by every Caller.

ADR-0007 deferred to clients: Claude Code defers MCP tools and searches, Claude and OpenAI have
native deferred loading, Codex has none. That is still true, and a Caller on a client with deferral
already pays nothing extra. But the cost is real for every Caller on a client without it, and the
Operator's tier ceiling already decides which tools exist — so the server can decide what to
advertise rather than leaving that entirely to the client.

## Decision

- Tools are registered but **withheld**; a search enables the matching ones just in time and fires
  `tools/list_changed`.
- **Enable/disable, not search-returns-text.** The SDK's `enable()`, `disable()` and
  `sendToolListChanged` mean a discovered tool arrives with its real JSON schema and its real
  annotations, so `destructiveHint` and `requiresUserInteraction` keep meaning what they say. A
  generic `invoke` that returns definitions as text throws away exactly the metadata the safety
  story rests on, and turns the annotation into a claim the server can no longer stand behind.
- **A compact catalogue in the server instructions** — every tool's name and a one-line summary —
  so a Caller can see the whole surface cheaply and ask precisely. Names are cheap; schemas are
  what cost.
- **Bootstrap**: the search tool plus the always-useful reads (wallet balance, portfolio state). A
  Caller's first question is "where am I", and answering it should not cost a discovery round-trip.
- **Three input modes**: free text, group, and explicit names. Only free text consults a
  `ToolSelector`; group and explicit names are exact and stay local.
- **Capped per search** (~8), with a note when more matched, so the context cost JIT exists to avoid
  does not come straight back.
- **An empty match explains** what solOS does not cover and names the groups, so the Caller can say
  why rather than rephrase and eventually invent a tool name.
- **A tool the tier ceiling withholds is named as existing but unavailable**, never silently absent.
  Silence makes a Caller loop. The signer is the secret; the tool list is not.
- **`--tools all`** disables discovery and advertises everything the ceiling permits, for clients
  that ignore `tools/list_changed`. Discovery defaults on.

## Consequences

- Discovery costs a round-trip. A Caller that already knows a tool's name and schema pays a search it
  did not need before; the catalogue in the instructions is what keeps that rare.
- Clients that ignore `tools/list_changed` are stuck worse than with no JIT at all unless they pass
  `--tools all`, which is why that escape hatch is part of the decision, not an add-on.
- The `ToolSelector` port keeps JEV's early-access status an adapter rather than an architecture, and
  a Caller with no JEV key still discovers by group or name, and by prose through the local
  deterministic matcher — ADR-0007's discipline is unchanged.
- The tier ceiling gains a default: `simulate`, not `execute`, and it moves from an inherited
  `SOLOS_TOOL_TIER` env var to a visible flag, where the Operator can see it.
