# 0043 — The range strategy kind

Status: Accepted

Date: 2026-10-28

Extends ADR-0038, ADR-0041, and ADR-0042.

## Context

Issue #201 asks for one Strategy that keeps a single Meteora DLMM position centred on price.
The pool read, `PoolState`, and `LpPosition.range` already landed. The clock, the tick loop,
bounds, and the four liquidity Actions (`remove_liquidity`, `close_position`, `open_position`,
`add_liquidity`) already exist and are live-validated. What was missing is the parameter
schema, a pure evaluator, and a sequential tick that can hand a withdrawal's amounts and a
new position account to the next Action.

Orca and Raydium stay out. This kind only opens Meteora positions, because that is the
lifecycle already live-validated. A flicker at the edge of the range must not churn the
position, and a failed step must not be retried against a wallet that is only half moved.

## Decision

- **The clock wakes `range`.** `nextDueInstant` is the same interval or cron the Strategy
  already carries.
- **Parameters.** `protocol` is `meteora`. `pool` is the LbPair. `position` is the PositionV2
  account the Strategy currently manages. `width` is an integer from 1 to 70. `recenterWhenOutsideFor`
  is at least 1. `maxRecentersPerDay` is an integer from 1 to 24. `maxSlippageBps` defaults to 50.
- **Observations.** The tick reads the pool (`activeId`, `binStep`, both mints and decimals,
  `priceAPerB`, the read time), the LP position (address, bin range, token amounts, USD value),
  both token prices, and the tick instant. A position with no bin range is still delivered so
  evaluate can fail the tick. The reader does not fail the read for a missing position.
- **Evaluate is pure.** Inside the inclusive bin window the streak resets and no Action is
  emitted. Outside, the streak increments by one tick. The tick emits nothing until the streak
  reaches `recenterWhenOutsideFor`. The replacement window is
  `lowerBinId = activeId - floor(width / 2)` with the same width. A window outside
  `-443636..443636` fails the tick and emits nothing. The four Actions are, in order,
  `remove_liquidity` at 10000 bps, `close_position`, `open_position`, and `add_liquidity`.
- **The day's budget is the kind's own.** `recentersToday` counts completed recenters on
  `floor(instant / 86_400_000)`. When the budget is spent the tick emits nothing and records
  that `maxRecentersPerDay` is exhausted. The count increments only when the tick outcome is
  `executed`. `skipped_bounds`, `skipped_kill_switch`, and a failed step keep the previous count.
- **A multi-Action tick is sequential.** It stops at the first failure. There is no unwind and
  no retry. The Strategy pauses, and the reason names the step index, the Action type, and the
  Intent. `status` lists which Intents settled. The deposit amounts are the amounts the
  withdrawal returned in that same tick. Both zero skips the deposit. The Strategy's `position`
  changes only after `open_position` settles. If a later step then fails, that new address is
  kept and the recenter is not counted.
- **Bounds count the principal once.** `remove_liquidity` reserves the position's USD value
  scaled by `bps / 10000`, plus a SOL fee. `close_position` and `open_position` reserve only
  the SOL fee. `add_liquidity` after a removal in the same tick reserves only the SOL fee. A
  standalone deposit prices `amountA` and `amountB`. `maxRecentersPerDay` is additional to the
  Engine caps.
- **State lives on the Tick.** `state` holds `activeId`, `lowerBinId`, `upperBinId`, `position`,
  `outsideStreak`, `recentersToday`, `recenterDay`, `lastRecenterAt`, and `lastRecenterIntents`.
  `solos strategy status` returns that object on `lastTick`, including the last recenter's
  Intent ids on later inside-range ticks.

## Consequences

- `schedule`, `trigger`, `rebalance`, and `range` are the kinds the contract accepts. `carry`
  still fails until its issue ships.
- A missing position range fails the tick instead of guessing a window.
- A mid-tick failure leaves the wallet where the last settled Action left it. The Operator
  resumes after inspecting. The Engine does not rebuild the old position.
- Orca and Raydium pool reads and recentering, asymmetric widths, fee claiming, and a live
  funded round stay out of this decision.
