# DX design notes

Settled in a grilling session, 2026-09-26. **Notes, not a plan of record** — nothing here is
ticketed yet, and the sequencing constraint at the bottom comes first.

Vocabulary that came out of this is already in `CONTEXT.md`: **Caller**, **Operator**,
**Discovery**, **Tier ceiling**.

## What solOS is, for DX purposes

**Caller-first.** The Caller is an agent, human-prompted or swarm-prompted. A human reaches solOS
by prompting one, never by driving a wallet UI. The Operator owns the signer, sets the boundary
out of band, and is not in the loop of any individual call.

**Safety at the boundary, not in the call path.** No confirmation prompts — that is wallet UX and
it belongs upstream (ADR-0006). The Operator's one deliberate act is the tier ceiling.

**solOS refuses strategies, and little else.** Primitives for autonomy; the harness and swarm
packages compose them. Jito submissions, shreds and the rest are in scope eventually — not
groomed. The Engine is the exception, decided in
[ADR-0037](../adr/0037-engine-is-a-caller.md): it is a Caller in this repo, and strategies live
there.

**The CLI is a validation tool**, not a product. It proves behaviour quickly and adapts. It ships
with the repo, never to npm. That settles the open question in #150: publish the MCP server and
`@solos-sh/actions`, nothing else, and cut the `dev` surface from anything published.

## Discovery

The tool list is the Caller's interface and it is not free: 14,783 bytes for names, titles and
annotations alone, before descriptions and JSON schemas, paid every turn.

- **JIT.** Tools are registered but withheld; a search enables the matches just in time. The SDK
  supports this directly — `enable()`, `disable()`, `update()`, `sendToolListChanged` — so the
  Caller gets real schemas and real annotations, not a text blob through a generic invoke. That
  distinction is what keeps `destructiveHint` meaningful.
- **A compact catalogue in the server instructions**: every tool's name and a one-line summary, so
  a Caller can see the whole surface cheaply and ask for precisely what it needs. The expensive
  part is schemas, not names.
- **Bootstrap**: the search tool plus the always-useful reads (balance, portfolio). A Caller's
  first question is "where am I", and answering it should not cost a discovery round-trip.
- **Three input modes**: free text, group, explicit names. Only free text consults a selector.
- **`ToolSelector` port.** Local deterministic default; **JEV** (typesafe.ai System One model —
  structured choice, 70–500ms, cardinality 255) as an opt-in adapter. Keeping it a port means its
  early-access status costs an adapter rather than an architecture, and that a stranger never
  needs a second API key to discover anything. Jupiter is the precedent: optional key, checked at
  call time, discovery never breaks without it.
- **Capped per search** (~8), with a note that more matched.
- **An empty match explains** what solOS does not cover, so the Caller can say why rather than
  rephrase and eventually invent a tool name.
- **A tool the ceiling withholds is named as existing.** The signer is the secret; the tool list
  is not. Silence makes a Caller loop.
- **`--tools all`** for clients that ignore `tools/list_changed`. JIT defaults on.

## The execute gate already exists

`createSolosServer` takes `tierCeiling`, and `filterByTier` removes tools **before registration**
— so it hides rather than fails, which is the behaviour we want. Two things are wrong:

1. it defaults to `"execute"`, the most permissive setting;
2. it is reachable only through `SOLOS_TOOL_TIER`, an env var, which is inherited invisibly.

Flip the default to `simulate` and expose it as a flag, where it lives in the Operator's config
file and can be seen.

## Three cross-cutting rules

**1. State a fact once.** CLI help generated from tool definitions; the venue sentence in a
liquidity description generated from `READ_PROTOCOLS` / `LIFECYCLE_PROTOCOLS`. Drift here was
caught twice by a reviewer and zero times by a test — the fix is to make it impossible, not
detectable. Where generation genuinely does not fit, `tools-registry.test.js` is the home.

**2. Errors owe a remedy.** `{ code, reason, remedy? }` as the invariant, structured props
alongside. `reason` is always present and always one sentence — `InsufficientFunds` currently
ships bare lamports with no sentence at all, which is the bug that proves the rule. `remedy` names
the next action where one exists. Fix the `InternalError` stack-trace leak in the same pass:
`errors.js` already documents that it never carries stack traces outward, and the CLI path does.

**3. Failures report everything at once.** `solos doctor` — validates config without starting a
server. Covers the cold-start round-trips (signer resolves before RPC, so an Operator fixes one
and discovers the next), the invisible MCP failure (`CONNECTION_CLOSED` with the real cause dead
on the child's stderr), the `rpcUrl: null` trap after a login without `--rpc-url`, and the
`--no-env-file` that the client docs omit though the repo's own MCP client passes it deliberately.

## One concrete break, worth doing before npm

Rename the transfer execute tool to `solana_transfer_execute_sol`. It is the only execute tool not
matching the pattern the server's own instructions promise, so a Caller guesses a name that does
not exist — and with JIT that is a search which finds nothing. Breaking for saved configs and
prompts, which is exactly why it happens before publishing.

## Sequencing

**Finish the Meteora scope first.** None of the above starts until that lands: these are
cross-cutting refactors and they would collide with slice work in flight.

## Still open

- Whether JIT discovery gets an ADR. It fits all three tests — hard to reverse, surprising without
  context, a real trade-off between context cost and a discovery round-trip.
- Whether "primitives, not strategies" is recorded as an ADR or as README non-goals. ADR-0006
  covers adjacent ground.
