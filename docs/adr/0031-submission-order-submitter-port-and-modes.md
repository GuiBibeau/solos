# 0031 — Submission owns one order of steps; delivery is a `Submitter` port; parameters are named modes

Status: accepted, 2026-09-27. Sits below ADR-0013: `ActionExecutor` is unchanged, and so is the
choice between wallet mode and vault mode. This decides what happens to a signed transaction
inside the direct-signer executor.

## Context

Every execute path ran a hand-written copy of "recheck the lifetime, simulate, recheck, send,
confirm". There were six copies (liquidity, lend, transfer and position open/close shared one;
swap, Jupiter and pump alike, had one; each Phoenix send had one), and they disagreed:

- Only swap, perp and `withdraw_lend` rechecked the blockhash lifetime. Every liquidity path,
  `lend` deposits, transfers and position open/close sent without a recheck.
- The simulate tier and the execute tier took different paths.
- Perp imported swap-named helpers (`recheckSignedSwapLifetime`).

Two needs were also on the way:

- **Delivery that can be swapped.** solOS may run on a server next to an RPC node, or send
  through a landing service or bundle engine. Keys stay with the Signer wherever solOS runs.
- **Speed and supervision set by parameters.** Swarms where the LLM sits outside the execution
  loop want speed. An LLM inside the loop may hold a transaction until someone decides to send
  it.

## Decision

- **Submission** (`packages/solana/src/submission/`) takes a signed v1 transaction through one
  fixed order:
  1. check the wire
  2. check the lifetime
  3. simulate
  4. the venue's last guard
  5. check the lifetime again
  6. deliver
  7. confirm

  `simulate` runs the first three steps with the same code. Parameters switch steps on or off;
  they never reorder them. Venues build transactions and contribute a simulation *probe* (the
  accounts to observe and a verdict on a clean result) and a pre-send *guard*. Venues never send.
- **`Submitter` is the delivery port**: `send(sealed)` and `status(signature)`. The confirmation
  loop (deadline, polling, "may have landed", execution failure) belongs to Submission, so every
  Submitter gets the same guarantees. The RPC node is the default adapter. Phoenix onboarding's
  co-signing endpoint is a second one (its v0 wire stays outside the order, per ADR-0025).
- **Lifetime rechecks are parameters, not invariants.** A transaction whose blockhash has
  expired cannot land, so skipping a recheck costs an accurate "nothing was sent" and a wasted
  send, never funds. What protects funds is a simulation verdict (the swap spend bound,
  ADR-0024) and bounds encoded in instructions.
- **A Submission mode is a named, Zod-validated set of parameters:** simulate, lifetime rechecks
  with their commitment and minimum remaining blocks, and confirmation commitment, deadline and
  poll interval.
  - `slow` is the default. It simulates, rechecks around the simulation and the guard, and waits
    for `confirmed`.
  - Other modes are presets of the same schema, never a second code path.
- **The Operator or code chooses the mode, never the LLM** through a tool argument. A fast mode
  assumes the LLM is outside the loop.
- **Resending the same signed bytes is always safe**, because one signature lands at most once.
  Re-signing creates a new transaction, so it is allowed only after the previous lifetime
  provably expired.
- **Planned, decided here, not yet built:**
  - A venue that relies on simulation for protection is not fast-eligible, and a mode that skips
    simulation refuses it before signing.
  - A Submitter may add only a priority fee and compute limit within the v1 caps, and one capped
    tip, before signing. The message is final once signed.

## Consequences

- Every v1 path now rechecks the lifetime after signing, and again before sending whenever a
  simulation or a guard ran in between. Liquidity, `lend` deposits, transfer and position
  open/close gained this, at one or two extra `getBlockHeight` calls per send. Their simulate
  tier gained one.
- Phoenix guards lose their own lifetime recheck. The one Submission runs after the guard sits
  closer to the send.
- Adding a venue means handing a signed transaction (and optionally a probe and a guard) to
  Submission. Adding a delivery route means one `Submitter` adapter.
- The remaining slices, in order:
  1. **Sealing.** Builders hand over instructions and a named compute config, and Submission
     fetches the lifetime and signs. The pre-sign check and minimum remaining blocks then apply
     everywhere.
  2. **A fast preset.** Selectable per process or per call from code, with fast-eligibility.
  3. **Submitter additions** (fee, tip) and a resend interval.
  4. **A `submitted` result status** with confirmation Events, for modes that do not wait. This
     is an `@solos/actions` change.
  5. **Held transactions** (simulate now, send exactly those bytes later) with a durable-nonce
     lifetime. This is an `@solos/actions` and tool change.
