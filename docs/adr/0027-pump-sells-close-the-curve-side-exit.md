# 0027 — Pump sells use `sell_v2`, and wSOL on exactly one side is the direction

Status: accepted, 2026-09-25. Delivers issue #119. Amends the "no Pump sell tool" clause of
ADR-0020 and ADR-0025 (`0025-pump-buys-use-the-v2-exact-quote-instruction.md`); everything else
in both stands.

## Context

ADR-0020 and ADR-0025 both state there is no solOS Pump sell tool, and make an operator's checked
external exit route a precondition for any funded buy. That clause was the reason the live-QA gate
on issue #25 stayed shut after #118 landed: the buy was complete and tested offline, and nothing in
the repo could close a position it opened.

An external route is not actually available for a coin still on its bonding curve. A live curve has
no PumpSwap pool and no aggregator route — the curve *is* the market. So the precondition ADR-0020
set could not be met by the only kind of coin the buy is allowed to touch, and the gate could never
open. The exit had to be built, not found.

## Decision

**Instruction.** `sell_v2`, at the pinned IDL commit `81091419e4457566469d4e2a27f64ed84d42419c`.
Its account list is `buy_exact_quote_in_v2`'s 27 in the same order without
`global_volume_accumulator` (buy index 19), giving 26; its args are `amount` (coin base units in)
then `min_sol_output` (the floor the program enforces). Both facts are asserted in
`pump-sell-wire.test.js` against the buy's own list, so an upstream reorder of either instruction
fails the suite rather than the wallet.

**`amount` inverts meaning with direction.** A buy's `amount` is a lamport budget; a sell's is an
exact quantity of the coin. This is a real trap — the same field name carrying two units — so the
schemas, tool descriptions and CLI help each say which one they mean, and `LaunchSellInputSchema`
is a separate schema rather than a reuse of the buy's.

**Direction is read from the Action, never from a mint.** The published `SwapAction` refinement
widened from "a pump swap must have wSOL as its input" to "a pump swap must have wSOL on exactly
one side" (`@solos/actions`, minor). The executor then reads `inputMint === WSOL_MINT` as buy and
the other case as sell. Dropping the refinement entirely would have admitted a pump Action with SOL
on both sides or neither — a shape no pump curve can serve — so it was widened by exactly one case.

**The sell adds two gates to the buy's, and shares the rest.** `validateBuyReads` is called
unchanged, so a completed, foreign-owned, missing or non-SOL-quoted curve and an unreadable Global
refuse identically in both directions. What is new: the wallet must hold at least what it is
selling (an absent token account reads as zero, not as an RPC error), and a quantity that returns
no lamports after fees and slippage is refused rather than handed to the program as a zero floor —
the same reasoning as the buy's `BUDGET_TOO_SMALL`.

## What this does and does not give an operator

The sell closes a position **on a live curve**. It is not a general exit: a curve that completes
migrates to PumpSwap, the curve stops trading, and `sell_v2` refuses with the same `CURVE_COMPLETE`
the buy uses. solOS does not reroute to PumpSwap or an aggregator in either direction. So a buy
still leaves an exposure whose exit depends on the curve staying live, and the README and both
execute descriptions say so rather than implying a round trip is always available.

## Verification

Offline: the sell's wire form and 26-account list derived from and diffed against the buy's, the
sell curve maths including a round-trip-cannot-profit invariant, the balance and proceeds gates
against a loopback JSON-RPC server, and the widened Action contract's accept and reject cases.

Live: a funded mainnet round trip on 2026-09-25, curve `6UjqmVAa…dNgX` (`6Ujqm…pump`) at 227 bps
progress, wallet `E15BHE3B…SJ8f`, both legs simulated before sending and neither skipped.

| | Buy | Sell |
|---|---|---|
| Signature | `5Dt3xEPPJMPyRrVo44Sson4w2Wxq3SKQ7z8nx8k8ZVQVbXjXEA6AMC9Ed15sGQrXUqr29o8KTpviYrA8xddaorq8` | `7uLxFAU63sPY9uT75rzpdhgRoUPeiWh5MP8PYUxTiatL9BVPov5ZHKJocaeaHydw63wRj4SWfDznumXawWVAjXH` |
| Compute units | 106,908 | 75,284 |
| Network fee | 105,000 lamports | 105,000 lamports |
| Wallet delta | −12,965,040 | +9,648,083 |
| Coin balance | 0 → 2,949,392.806756 | → 0 |

The buy's debit reconciles exactly: 10,000,000 budget + 2,860,040 rent for the two accounts it
opened (Token-2022 ATA 1,513,840, user volume accumulator 1,346,200) + 105,000 fee. The round
trip cost 3,316,957 lamports net, of which 2,860,040 is rent still locked in those two accounts
and 210,000 is network fees; the remaining 246,917 is Pump's fees plus the curve spread on
0.01 SOL. **Residual token exposure is zero** — the position was fully closed, not merely reduced.

Two defects were found only by spending. The buy aborted with `NotAuthorized` (6000) reading the
wrong fee-recipient field, which meant no pump buy could ever have landed since #118; that is
fixed in this change and pinned by `global-decode.test.js`. The account order and the choice of
recipient array were then confirmed against a real on-chain `sell_v2` on the same curve rather
than inferred a second time.
