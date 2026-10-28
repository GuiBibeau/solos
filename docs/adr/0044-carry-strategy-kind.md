# 0044 — The carry strategy kind

Status: Accepted

Date: 2026-10-28

Extends ADR-0038, ADR-0041, ADR-0042, and ADR-0043. The funding read this kind consumes shipped
with the first half of issue #202.

## Context

Issue #202 asks for a Strategy that collects Phoenix perpetual funding while staying
delta-neutral: long the spot token, short the same notional on Phoenix. The funding read, the
`open_perp` and `close_perp` Actions, the clock, and sequential multi-action ticks already
exist. What was missing is the parameter schema, a pure evaluator, and the rule for a short
that fills when the spot leg does not.

The kind must not onboard a trader or deposit collateral. It must not treat one funding print
as the trend. A failed spot leg must not leave a naked short running.

## Decision

- **The clock wakes `carry`.** `nextDueInstant` is the same interval or cron the Strategy
  already carries.
- **Parameters.** `market` matches `^[A-Z][A-Z0-9]{1,15}(?:-PERP)?$`. `spotMint` is the long
  leg. `quoteMint` defaults to USDC. `notionalUsd` is a positive decimal, once per leg.
  `exitHurdleAprPct` must be strictly less than `entryHurdleAprPct`. `lookbackHours` is an
  integer from 1 to 168. `expectedHoldHours` is an integer of at least 1. `roundTripCostPct`
  defaults to 0.3 and must be non-negative. `maxSlippageBps` defaults to 50. `maxLeverage`
  defaults to 1. A non-empty mint allowlist must name the spot mint and the quote mint.
- **Break-even APR.** `roundTripCostPct * 8760 / expectedHoldHours`, in exact decimal
  arithmetic. Entry requires the trailing mean APR to exceed both `entryHurdleAprPct` and that
  break-even. Exit requires an open carry whose trailing mean is below `exitHurdleAprPct` or
  below zero.
- **Trailing mean.** Samples are the funding history inside the lookback, plus samples stored
  on prior ticks. Hourly history percents are annualized with `hourly * 8760`. The current
  print is one sample among them. It is the whole mean only when the window has no earlier
  sample. A one-hour spike therefore cannot clear a hurdle that the rest of the window holds
  down.
- **Observations.** The tick reads current APR, funding history, and the funding time; the
  spot mint's USD price, used as the mark because the funding snapshot publishes none; the
  perp side and size; onboarding (`ready` or not) and account equity; and the spot and quote
  balances, decimals, and USD prices. The kind never reads them itself.
- **Two legs, fixed order.** Enter emits `open_perp` short (`protocol: "phoenix"`, notional in
  1e6 USD units, limit `mark * (10000 - maxSlippageBps) / 10000`) and then a swap from
  `quoteMint` to `spotMint` for that notional. Exit emits `close_perp` (limit
  `mark * (10000 + maxSlippageBps) / 10000`) and then a swap of the entered spot amount back,
  capped by the current balance.
- **Readiness.** A trader who is not onboarded fails the tick and emits nothing. So does an
  entry whose collateral is below `notionalUsd / maxLeverage`, or whose quote balance cannot
  fund the spot swap. The kind does not onboard or deposit.
- **Unwind.** A short on `market` with no spot leg, including the state left when `open_perp`
  settles and the swap does not, emits only `close_perp` with reason `unwind` and
  `pauseAfter`. The Engine pauses, and the reason names the failed step and the settled
  Intent. There is no retry of the spot leg. A completed unwind pauses again.
- **Bounds.** `open_perp` reserves the USD notional plus a SOL fee. The swap reserves that
  notional at max slippage plus a SOL fee. Entry therefore counts `notionalUsd` twice.
  `close_perp` reserves only the SOL fee.
- **State lives on the Tick.** `state` holds the trailing mean, both hurdles, the break-even
  APR, `spotAmount`, the perp notional, `entryAt`, the funding samples, and `pauseAfter`.
  `solos strategy status` returns that object on `lastTick`.

## Consequences

- `schedule`, `trigger`, `rebalance`, `range`, and `carry` are the kinds the contract accepts.
- A missing funding print, a missing mark, or an unready trader fails the tick instead of
  guessing a leg.
- A mid-entry failure leaves the short in place until a resumed tick unwinds it and pauses.
  The Engine does not buy the spot on its own.
- Cross-venue carry, onboarding from the kind, and a live funded round stay out of this
  decision. A funded round is a separate operator-approved QA step.
