# 0042 — The rebalance strategy kind

Status: Accepted

Date: 2026-10-28

Extends ADR-0038 and ADR-0041.

## Context

Issue #200 asks for one Strategy that holds a wallet at target mint weights and trades when any
weight drifts outside a band. The tick loop, the clock, bounds, and swap execution already exist.
What was missing is the parameter schema, a pure evaluator, and the observations that value cash.

A rebalance over lending, perp, or LP positions would size trades against holdings the portfolio
may leave unpriced. v1 therefore weights wallet cash only. Native SOL is wrapped SOL.

## Decision

- **The clock wakes `rebalance`.** `nextDueInstant` is the same interval or cron the Strategy
  already carries. A rebalance draft requires `tickSource.type === "clock"`.
- **Parameters.** `targets` maps at least two mints to weights in `(0, 1)` that sum to 1 within
  1e-6. `bandBps` is an integer from 1 to 5000. `quoteMint` defaults to USDC. `minTradeUsd` is a
  positive decimal. `maxSlippageBps` defaults to 50. When `bounds.allowedMints` is non-empty it
  must include every target mint and the quote mint.
- **Observations.** For each target mint and the quote mint the Engine reads `balance:<mint>`,
  `decimals:<mint>`, `price:<mint>`, and `priceAt:<mint>`. `priceAt` is the oldest of those
  quotes, so the staleness limit applies to the whole set. Native SOL and the wrapped-SOL token
  account both count as wrapped SOL. A `PriceUnavailable` quote is an empty price string.
- **Evaluate is pure.** A missing or non-positive price fails the tick, names the mint, and emits
  no swap. A zero wallet, or every target inside the band, emits nothing and records each mint's
  weight, target, and drift. Outside the band, overweight mints sell into the quote mint and
  underweight mints buy from it. The quote mint, when it is a target, absorbs the residual: there
  is no quote-to-quote swap and no direct token-to-token swap. Legs below `minTradeUsd` are
  dropped. Trades are ordered by descending USD notional, sells before buys on a tie.
- **Bounds still cap the tick.** The Engine reserves each swap in that order. When a later reserve
  exceeds `maxNotionalPerTickUsd`, that swap and every swap after it are not sent. The tick
  records `skipped_bounds` with the cap reason and the step index. Leading intents stay settled.
  The next tick emits only what is still outside the band.
- **State lives on the Tick.** `state.mints` holds `weight`, `target`, and `driftBps` per target
  mint. `solos strategy status` returns that object on `lastTick`, with the Actions and Intent
  states the tick recorded.

## Consequences

- `schedule`, `trigger`, and `rebalance` are the kinds the contract accepts. `range` and `carry`
  still fail until their issues ship.
- A price feed that omits a target or the quote mint fails the tick instead of trading against a
  partial book.
- Weights ignore lending, perp, and LP positions. Those books are a later kind.
- Swaps still route through Jupiter. The quote mint is the only intermediate asset.
