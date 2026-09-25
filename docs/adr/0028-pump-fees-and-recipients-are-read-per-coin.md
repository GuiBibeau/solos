# 0028 — Pump fees and fee recipients are read per coin, never reconstructed

Status: accepted, 2026-09-25. Delivers issue #121 and corrects a regression shipped in #120.
Supersedes the fee paragraph of ADR-0025 (`0025-pump-buys-use-the-v2-exact-quote-instruction.md`),
which said the rates are `Global.fee_basis_points` plus the curve's creator fee; everything else in
that ADR stands.

## Context

Three defects in pricing and addressing a pump trade were found in one session, all by spending
real SOL. None was visible offline, and two were invisible to simulation as configured.

**The fee schedule was the retired one.** Pump replaced its flat fee with a market-cap-dependent
schedule on 2025-09-01. The rates live in the fee program's `FeeConfig` as a tier table, and the
curve program reads them itself through `GetFeesWithQuoteMint`. solOS computed
`Global.fee_basis_points + BondingCurve.creator_fee_bps`. Measured on mainnet: the live table
charges 95 protocol + 30 creator = 125 bps, while the curve's own `creator_fee_bps` reads 0, so
solOS priced every trade at 95.

**The authorized fee recipient depends on the coin.** `Global` holds three fee-recipient fields
carrying three different keys. Real on-chain `sell_v2` transactions show the program authorizes
one set per coin, selected by the curve's `is_mayhem_mode` flag:

| `is_mayhem_mode` | authorized account | `Global` field |
|---|---|---|
| false | `62qc2CNX…` | scalar `fee_recipient`, offset 41 |
| true | `8SBKzEQU…` | `reserved_fee_recipients`, offset 516 |

Each is refused `NotAuthorized` (6000) from `fee_recipient.rs` for the other kind of coin. "Reserved"
names the field, not its status.

**A failed swap simulation could lose its reason.** `swap-submit.js` serialized the RPC error with a
bare `JSON.stringify`. A bigint in that payload throws inside the `SimulationFailed` constructor,
replacing the typed failure with an untyped `InternalError` — destroying the only statement of why
nothing was sent.

## Decision

**Read the fee, do not reconstruct it.** `fee-config.js` implements `bondingCurveMarketCap` and
`calculate_fee_tier` from the pinned `docs/FEE_PROGRAM_README.md`, in integers throughout. The
market cap uses the **mint's** supply, not the curve's `token_total_supply`: the two differ — a live
coin carried 2e15 against 1e15 — and they select different tiers. The documented fallback applies
only when there is no `FeeConfig` at all, and uses `Global`'s own creator rate, never the curve's.
A present but unparseable `FeeConfig` refuses rather than quietly pricing on the retired schedule,
and an empty tier table is corrupt rather than a zero fee.

**Decode both recipient sets and select on the flag.** A curve too short to carry `is_mayhem_mode`
is refused rather than guessed, because guessing aborts the whole transaction rather than degrading.

**Every submit path serializes simulation errors with `simulationErrorText`.** The swap branch was
the last holdout.

## Why this kept going wrong

Each of the three was found only by spending, and the reasons are worth keeping.

The fee error was **hidden by the default slippage**. A 30 bps shortfall sets `min_tokens_out` and
`min_sol_output` about 30 bps too high, and the 50 bps default absorbed it — so a funded round trip
in #120 passed while the arithmetic was wrong, and only `--max-slippage-bps 5` exposed it
(`BuySlippageBelowMinTokensOut`, 6042). Pump's own migration note suggests widening slippage "until
you make sure it's implemented correctly"; widening slippage is precisely what conceals this.

The recipient error was **hidden by a single observation**. #118 read the scalar, could not buy a
mayhem coin, and #120 replaced it with the reserved array — generalizing from the one coin in front
of it and breaking every ordinary coin, which is most of them. This is the failure ADR-0024 already
named: calibrating a constant against one measurement. It recurred in the same slice one day later.
The correction is not a better constant but a read: the chain states which set applies, per coin.

The third defect **hid the second**. The untyped `InternalError` from the serialization crash
concealed the `NotAuthorized` that would have named the problem immediately.

## Consequences

A pump trade now reads four accounts — curve, Global, mint, `FeeConfig` — in one concurrent batch,
and both directions share that read. `FeeConfig` was already passed to both instructions, so nothing
new is derived or sent.

Tier *selection* cannot currently be exercised against the chain: the live table has a single tier
from market cap zero. It is covered offline at, below and above each threshold, and the fixture is
pinned to the live table so an upstream change shows as a changed constant rather than as arithmetic
that still passes.

## Verification

Offline: the tier table decode including a u128 threshold past the 64-bit boundary, tier selection
at each boundary, both fallback and refusal paths, and both recipient selections against a fixture
whose two sets are deliberately different keys.

Live, 2026-09-25, all legs simulated first and none skipped, residual exposure zero on both coins:
a simulate that passes on an ordinary **and** a mayhem coin — which no single recipient choice can
do — plus funded round trips at `--max-slippage-bps 10` on each. Mayhem coin:
`5JfcpBWt…VAHG` / `3ASu7x7Z…1Syf`. Ordinary classic-SPL coin, the one `main` could not buy:
`4yeSWxvz…` / `2NW2CBJ7…UPwm`.
