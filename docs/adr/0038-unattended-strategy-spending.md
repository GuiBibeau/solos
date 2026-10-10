# 0038 — Unattended Strategy spending

Status: accepted, 2026-10-10. Amends ADR-0037.

## Context

When Strategies tick (#198), the Engine spends with no human approving each tick. ADR-0006 leaves
the human prompt on the client, and a tick has no person there. Consent moves to registration: a
person registers a Strategy with its Bounds, and later ticks spend inside those Bounds.

Registration is on main (#238). `StrategyBoundsSchema` is on main (#235). The `CapLedger` port
and `memoryCapLedger` are on main (#240, `6175ab4`). Nothing ticks. `STRATEGIES` is a build-time
`feature()` flag. It only compiles in the Engine strategy routes and the CLI `solos strategy`
group, and it is off in release builds. The durable SQLite ledger and the Engine kill-switch
wiring are the rest of #195, in progress. Of the owner, CONTEXT.md says "It is never authorization."

## Decision

- **Bounds** are `StrategyBoundsSchema`. `maxNotionalPerTickUsd` "caps the sum of all reserves
  sharing a `tickId`." `maxDailySpendUsd` "caps what the Strategy may reserve during the current
  UTC day." `allowedMints`: "empty means any mint the Engine allowlist already permits, and a
  non-empty list can only narrow that allowlist, never widen it." A Strategy whose allowlist
  widens the Engine's "is refused at registration with `BoundsExceeded`." `expiresAt` "is when
  the bounds stop authorizing spends, or null when they do not expire on a clock."
  `maxConsecutiveFailures` "is how many failed ticks in a row move the Strategy to `failed`."
  "A breach is refused with `BoundsExceeded`."
- **Cap ledger.** Before every execute, `reserve({ strategyId, tickId, intentId, notionalUsd,
  mint })`. "`intentId` is the idempotency key for the whole ledger: a repeat reserve returns
  the same `reservationId` and does not count twice." `maxNotionalPerTickUsd` caps the sum of
  open and settled reservations that share a Strategy and `tickId`. Released reservations leave
  that sum. "An exact cap is allowed." "Daily spend is open holds plus settled amounts on the
  UTC day the hold was reserved." `settle` and `release` each apply once, on the reservation
  keyed by that `intentId`. The port and `memoryCapLedger` are what #240 merged. The call from
  a tick is #198, still ahead of this record.
- **The hold is the worst case:** "the notional at max slippage plus fees." `settle` "replaces
  an open hold with the measured spend and is not refused when that spend is higher," because
  the transaction has landed: "the overshoot is stored on the reservation and the per-Strategy
  switch engages," so any overshoot is limited to one transaction.
- **Kill switch.** It pauses new reserves "for one Strategy, or for every Strategy when the
  scope is `global`." "An engaged switch blocks new reserves only." `reserve` fails with
  `KillSwitchEngaged`. "Settle and release still complete." "The durable adapter must keep an
  engaged switch across restarts." "`memoryCapLedger` keeps the switch in the process." The
  durable SQLite ledger and the Engine kill-switch wiring land with the rest of #195, in
  progress.
- **The cap ledger follows the Engine's Intent recovery** (ADR-0037). While an Intent is
  `in_flight`, its hold keeps counting against the caps, including across an Engine restart.
  It settles once, to the actual amount, when the signature lands. It is released only when the
  blockhash has expired and the Intent is `failed`. An in-flight Intent with no signature at
  startup "becomes `failed`, because nothing was sent," and that hold is released. Surviving a
  restart is the durable ledger in the rest of #195. "`memoryCapLedger` keeps the account in
  the process."
- **Removing `STRATEGIES` is what turns on live spending.** That removal waits until #195 is
  fully merged (the durable cap ledger and the kill switch), a funded mainnet QA round is
  recorded in `features/feature-map.json`, and Gui has signed off. The removal is its own final
  commit on #198.

## Consequences

- A registered Strategy spends on each tick with no fresh approval. Bounds, the ledger, and the
  kill switch are the limit.
- Core, the tools, and the MCP server still hold no policy (ADR-0006). This policy is the
  Engine's, as a Caller (ADR-0037).
- ADR-0037 recorded the cap ledger and did not build it. The port and the in-memory adapter are
  built. The SQLite ledger and the Engine kill-switch wiring are the rest of #195.
- An Intent that may have landed stays `in_flight`, and its hold keeps counting, until the
  signature lands or the blockhash expires and the Intent fails.
- This record leaves `STRATEGIES` in place and sends no transaction.
