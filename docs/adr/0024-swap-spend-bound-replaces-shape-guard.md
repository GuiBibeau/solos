# 0024 — A measured spend bound replaces the swap shape guard

Status: accepted, 2026-09-24. Supersedes ADR-0023.

## Context

ADR-0023 admitted read-only taker repeats in the swap instruction and rejected every writable or
signer repeat, on the grounds that message compilation coalesces duplicate keys by unioning
privileges: the taker is the fee payer, so a writable occurrence anywhere lets the route CPI a
System transfer against the wallet. That reasoning is correct and still holds.

What ADR-0023 did not establish is how often real routes need it. Measured against mainnet on
2026-09-24 from the `keychain-qa` wallet, 0.01 SOL into USDC at 50 bps:

- **10 of 14 builds rejected** with `swap instruction repeated the taker with authority beyond
  its validated slot`. USDC into SOL rejected 1 of 8.
- Every rejected build had exactly one extra taker occurrence, always writable and never a
  signer, and in every case the account immediately before it was `MNFSTq…` — the Manifest
  program. Manifest funds the trader's seat from the wallet, so it needs the taker writable.

So the guard rejected one thing: routes through Manifest, which is most of the SOL into USDC
book. The tool was safe and mostly unusable — the same failure ADR-0023 was written to end
(issue #90), narrowed rather than removed.

A shape check cannot separate the two cases. Manifest's writable taker and a drain's writable
taker are the same account meta. Allowlisting the preceding program does not help: a crafted
build can place `MNFSTq…` before any slot.

## Decision

Bound the effect, not the shape.

1. **The shape check keeps only what it can decide.** A taker occurrence declared a *signer*
   outside the validated authority slot still rejects — it is an authority position the
   validator never reviewed. A *writable* repeat is admitted.

2. **The spend is bounded by measurement.** `simulateSwapBounded` simulates the exact signed
   transaction, reads the taker's lamports before and after, and refuses to send when the wallet
   would lose more than the swap's own input plus `SWAP_OVERHEAD_LAMPORTS_MAX` (0.01 SOL). The
   balance read and the simulation are issued together: both observe the same recent bank, and
   the allowance dwarfs a one-slot skew.

This is strictly stronger than what it replaces. The shape guard bounded nothing — it refused
certain account layouts and said nothing about what an admitted layout could cost. The spend
bound caps the loss from *any* admitted build, including layouts nobody anticipated.

## Calibration

`SWAP_OVERHEAD_LAMPORTS_MAX` is 0.02 SOL, measured rather than chosen. All figures mainnet,
2026-09-24, 50 bps, from the `keychain-qa` wallet:

| Pair | Destination account | Overhead | Frequency |
|---|---|---|---|
| SOL -> USDC, 0.01 SOL | already open | **105,000** | 18 of 20 routes |
| SOL -> USDC, 0.01 SOL | already open | 13,150,440 | 1 of 20 |
| SOL -> BONK, 0.1 SOL | absent | **14,638,880** | 5 of 10 routes |

Overhead is fees when the accounts already exist and rent when the route has to open them. The
first calibration used 0.01 SOL, taken from the USDC pair alone, and refused half of SOL -> BONK
— the measurement that produced this number came from watching the bound reject real trades.

0.02 SOL clears the worst observed by ~37% and sits ~190x above the fee-only case. The allowance
is fixed, not a fraction of notional, because fees and rent do not scale with the amount
swapped: a 1 SOL swap may lose at most 2% beyond its input, a 10 SOL swap 0.2%.

## Consequences

- Manifest routes sign and land. Measured after the change at 0.1 SOL: SOL -> USDC 10 of 10,
  SOL -> BONK 8 of 10, against 3 of 14 for SOL -> USDC before. Four live mainnet executes landed,
  each in 2.2-2.6s wall clock.
- A swap whose overhead exceeds the allowance is refused with a typed `SimulationFailed` naming
  the lamports it would have cost and the lamports it may cost, so the ceiling can be raised
  deliberately rather than guessed at. The original shape guard named nothing, which is why the
  Manifest breakage took a mainnet probe to diagnose; a bound nobody can read is a bound nobody
  can calibrate.
- The residual failures are not solOS's: Jupiter answered HTTP 400 on 2 of 10 BONK builds, and
  the transport takes a single attempt with no retry, so a provider blip is a failed swap.
  Volatile pairs also fail simulation on price at 50 bps, which is the guard working.
- The bound depends on simulation. `--skip-simulation` skips it, as it already skips every other
  simulation-stage check; it stays out of QA by the rule in AGENTS.md.
- `swap simulate` reports the same refusal as `swap execute`, so the twin still predicts the
  execute outcome.
