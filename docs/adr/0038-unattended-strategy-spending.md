# 0038 — Unattended Strategy spending

Status: accepted, 2026-10-10. Amends ADR-0037.

## Context

When Strategies tick (#198), the Engine spends with no human approving each tick. ADR-0006 leaves
the human prompt on the client, and a tick has no person there. Consent moves to registration: a
person registers a Strategy with its Bounds, and later ticks spend inside those Bounds.

Registration is on main (#238). `StrategyBoundsSchema` is on main (#235). The `CapLedger` port
and `memoryCapLedger` are on main (#240, `6175ab4`). Nothing ticks. `STRATEGIES` is a build-time
`feature()` flag. It only compiles in the Engine strategy routes and the CLI `solos strategy`
group, and it is off in release builds. The durable ledger and the kill switch land with #243.
Of the owner, CONTEXT.md says "It is never authorization."

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
  `KillSwitchEngaged`. "Settle and release still complete." "`memoryCapLedger` keeps the switch
  in the process."
- **Durable ledger.** It lands with #243 as `sqliteCapLedger` on the Engine database. #243's
  record, kept here: "The cap ledger that shipped is a transactional SQLite adapter on the
  Engine database (`cap_reservations`, `cap_kills`, `cap_seq`), not the write-behind append-only
  log recorded above." That log is the one ADR-0037 described. "Each reserve, settle, release,
  and kill-switch write commits in one transaction, so a crash cannot leave a half-recorded
  reservation." On that branch, "reservations, settled amounts, per-tick sums, and an engaged
  kill switch survive closing and reopening it." "`KillSwitchEngaged` is HTTP 423, the status"
  ADR-0037 reserved. "The Engine's SQLite adapter keeps an engaged switch across restarts."
- **The cap ledger follows the Engine's Intent recovery** (ADR-0037), as #243 words it. "An
  in-flight Intent keeps its hold." "A restart does not release that hold and does not count it
  a second time." "When recovery finds the signature landed, `settle` records the reserved
  notional once for a confirmed transfer, or `0` when the transaction landed with an execution
  error." "The hold is released only when the Intent is marked failed: the blockhash expired
  and the signature is still absent, or the Engine stopped before anything was signed." That
  recovery lands with #243. "`memoryCapLedger` keeps the account in the process."
- **Engine allowlist.** An execute-tier Engine refuses to start without `--allowed-mints`.
  Allowing every mint requires passing `--allowed-mints any`. Paper and dry-run Engines keep
  `any` by default. A Strategy's `allowedMints` "can only narrow that allowlist, never widen
  it," so a default of `any` leaves that safeguard with nothing to narrow. #243's flag says
  "Omit to allow any mint." The refusal is this decision.
- **Removing `STRATEGIES` is what turns on live spending.** That removal waits until #243 has
  landed (the durable cap ledger and the kill switch), the funded mainnet rounds are recorded
  in `features/feature-map.json`, and Gui has signed off. The funded gate covers the #243 round
  and #198's schedule-Strategy swap: 0.01 SOL to USDC through the Engine as a `count: 1` Tick,
  then back to SOL. The removal is its own final commit on #198.

## Consequences

- A registered Strategy spends on each tick with no fresh approval. Bounds, the ledger, and the
  kill switch are the limit.
- Core, the tools, and the MCP server still hold no policy (ADR-0006). This policy is the
  Engine's, as a Caller (ADR-0037).
- ADR-0037 recorded a write-behind append-only cap ledger and did not build it. The port and
  `memoryCapLedger` are on main. `sqliteCapLedger`, the Engine kill switch, and HTTP 423 land
  with #243, and they replace that log.
- An execute-tier Engine starts with an explicit allowlist. Paper and dry-run keep `any`.
- An Intent that may have landed stays `in_flight`, and its hold keeps counting, until recovery
  settles the reserved notional once or releases the hold when the Intent is marked failed.
- This record leaves `STRATEGIES` in place and sends no transaction.
