# 0022 — Liquidity acts on identified existing positions

Status: accepted, 2026-09-19. Maintainer contract for issue #35.

## Context

A pool address does not identify one LP position. Raw liquidity shares are not token amounts,
and a generic deposit must not invent a new tick range or bin strategy.

## Decision

#29/#30/#31 implement LiquidityVenue point/enumeration reads and add/remove twins for Orca.
#32/#33 add Meteora DLMM and Raydium CLMM behind the same tools. Protocol is explicit; an absent
adapter fails UnsupportedProtocol before network. There is no fallback to another venue.

position always means the protocol position account (Orca PDA, Meteora PositionV2, Raydium
personal position), never its NFT mint or pool. Validate signer/owner authority, pool, canonical
mints, supported token programs/extensions and protocol layouts. A missing or wrong-owner account
is an error. An existing owned zero-liquidity account is a successful read. Enumeration follows
ADR-0018 and reports owned receipt/NFT mints for deduplication.

AddLiquidityAction contains protocol, pool, position, amountA, amountB and maxSlippageBps. A/B
are u64 maximum token spends in pool mint order, at least one positive, including any supported
token transfer fees. The first adapters reject unsupported fee-bearing extensions. Increase only
that existing position and preserve its range. Round supported liquidity down to fit both spends;
never reinterpret a maximum as an exact spend. Reject zero liquidity/dust and leave unused
funds in the wallet. Use slippage 0..9999 and encode protocol liquidity/minimum and spend bounds.
No position creation, NFT transfer, discretionary claims or rebalancing.

RemoveLiquidityAction contains protocol, position, bps=1..10000 and maxSlippageBps=0..9999.
Remove floor(currentLiquidity*bps/10000); 10000 removes all current liquidity. For DLMM apply
that fraction independently to each occupied bin's shares, not to a sum allocated arbitrarily.
Reject a computed all-zero removal. Minimum A/B = floor(quotedPrincipal*(10000-slippage)/10000)
using the pinned protocol math and explicit token units; reject a nonzero quote rounded to zero
minimum. Encode the minimums in the actual instruction or fail if the protocol cannot express
them. Preserve NFT/account, existing range and unrelated position capital. Distinguish mandatory
protocol fee/reward transfers from principal in receipts and QA.

LpPosition returns protocol, position, instrument=pool, raw liquidity, tokenA/tokenB
{mint,amount,decimals} and nullable valueUsd. Orca/Raydium liquidity is the raw u128 position
liquidity; Meteora liquidity is the exact sum of raw occupied-bin liquidity shares, an inventory
indicator only, never a fungible economic amount. Underlying quantities sum per-bin protocol
math rounded down. Exclude unclaimed fees/rewards from principal and leave valuation null until
both principal components are priced. Adapters retain per-bin data for removes.

### Fixed Meteora allocation

Only the position's existing inclusive lower/upper bin range is eligible. Let X use bins at or
above the active bin and Y use bins at or below it, intersected with that range. For each token
separately, distribute 10000 bps uniformly over eligible bins: floor(10000/N) each, with one
extra bps to the lowest ascending bin IDs until the remainder is exhausted. A token with no
eligible bins is unused, not routed elsewhere. Round each per-bin base-unit spend down; leave
integer dust unused. At the active bin, fit the pair to current reserves using pinned exact
protocol math without exceeding either allocation; leave excess unused, never redistribute it.
Reject zero resulting shares. Encode explicit distributions/spend bounds and reject active-bin
drift rather than expanding the range. This deterministic rule applies to both empty and funded
existing positions; it does not copy current liquidity weights or select a new strategy.

Pin Meteora SDK/IDL revision `576919e3e4368e542c402f000b4264724f7f23ec` or a separately verified
replacement. Its distribution interface distinguishes per-token allocation from quote-value
weights; do not substitute equal quote weights or Number-based amount conversion.

### Meteora execution gate

The pinned IDL's remove_liquidity variants encode bin IDs and bps, but no minimum token receipts.
Its explicit per-token add_liquidity distribution also lacks an active-bin slippage argument.
An off-chain quote or successful simulation cannot enforce these bounds at execution. Therefore
#32 remains blocked for funded execution until a separately reviewed atomic guard or verified
instruction variant enforces the requested limits. Implementations must report this exact gap;
they must not ignore maxSlippageBps, silently relax the contract, or report simulated bounds as
on-chain protection. Reads and the deterministic allocation rule above remain specified.

## Consequences

Live adds wait for removes. Use dedicated tiny positions provisioned by the operator, record
principal/fees/rent and reclaim them; do not withdraw unrelated liquidity. Range creation,
NFT/account closure and reward harvesting remain outside these five public tools.

[Official Meteora distributions](https://github.com/MeteoraAg/dlmm-sdk/blob/576919e3e4368e542c402f000b4264724f7f23ec/ts-client/src/dlmm/helpers/weight.ts)

[Pinned instruction arguments](https://github.com/MeteoraAg/dlmm-sdk/blob/576919e3e4368e542c402f000b4264724f7f23ec/idls/dlmm.json)
