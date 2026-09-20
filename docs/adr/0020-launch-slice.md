# 0020 — Launch buys select Pump explicitly

Status: accepted, 2026-09-19. Maintainer contract for issue #35.

## Context

A mint can be traded through multiple routes. Inferring the executor from its owner silently
changes swap intent, and the old unpublished draft proposed precisely that ambiguity.

## Decision

#24 adds LaunchVenue and `solana_launch_get_curve`; #25 adds buy simulate/execute twins. A swap
Action may carry `venue: "jupiter" | "pump"`. Omission means Jupiter and remains omitted when
parsed, preserving existing serialized Actions. Ordinary swap tools always choose Jupiter and
expose no venue selector. Launch buys explicitly set pump; executors reject unavailable routes
instead of falling through. An unimplemented Pump route must fail before a Jupiter request.

Pump buys use wSOL's mint as input identity but spend native lamports under the pinned Pump
instruction's semantics. amount is a positive u64 maximum input including protocol trading
fees; network fees and account rent are separate. maxSlippageBps must be 0..9999 for a live Pump
buy; a rounded zero minimum output is rejected. Validate exact-input instruction/account math
and all fee recipients from official program state/IDL before signing. No provider payer/tip,
referral, hidden routing, PumpSwap or mint-based fallback. Core creates Action; only the executor
accesses signer/RPC.

Completed curves are readable and may report completion without claiming migration succeeded.
A buy rejects completed or unsupported curves. The first series has no Pump sell tool. Real buy
QA requires a tested external exit for that same curve/token, a small budget, and a recorded exit
or explicit residual exposure. Do not claim a token balance increase proves a round trip.

## Consequences

Public swap Actions are backward compatible. Explicit Pump routing must be rejected until the
Pump executor implements it; the same mint in swap and launch remains intentionally routed differently.
The official Pump program and current exact-input IDL must be pinned in the adapter. The earlier
local draft's abbreviated program string is not authoritative; #24's verified issue pin applies.
