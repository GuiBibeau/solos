# 0021 — Phoenix perps use bounded IOC intent and shared account equity

Status: accepted, 2026-09-19. Maintainer contract for issue #35.

## Context

The dormant perp Actions contain neither a price bound nor account scope. Per-market unsigned
amount/value cannot safely represent shorts or shared collateral.

## Decision

Issues #26/#27/#28 introduce PerpVenue reads, flat-only opens, and reduce-only closes. Mainnet
program `EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih` is verified in Ellipsis Labs' official
Rise source at revision `4bd3c505f16f09fdbe9fb2eff035aeaef8b7b12d`. Pin the matching codecs/order
packet layout at that revision or a separately verified replacement, not Phoenix spot's IDL.
Normalize requested symbols through exchange metadata. `PHOENIX_BASE_URL` defaults to
`https://perp-api.phoenix.trade`; loopback overrides support offline fixtures.

Actions explicitly contain traderPdaIndex=0 and traderSubaccountIndex=0. Derive and validate the
trader account from the configured signer; never substitute another subaccount/owner. Existing
registration, activation and sufficient collateral are prerequisites. No onboarding or collateral
transfer is hidden in the execution tools. Read-only explicit owner is honored.

Open includes side, positive notionalUsd (u64, 1e6 USD units), maxLeverage (1..100) and required
positive decimal limitPriceUsd. Close includes required limitPriceUsd. This absolute limit is the
executable bound: maximum for a buy, minimum for a sell. Native CLI #27/#28 must require
`--limit-price-usd`; replace the provisional slippage-only interface in their briefs. IOC buy
ticks round down, sell ticks round up; base lots and quote-lot notional caps round down. Encode
both the finite price and numQuoteLots budget so better short fills cannot exceed requested
notional. Reject dust/overflow and unsupported limits rather than relaxing bounds. Trading fees
and collateral are separate from notional; maxLeverage uses current total account exposure and
signed equity, then enforces both caller and protocol limits. Unknown/stale state fails closed.

Use a freshly read market/account state no older than 5 seconds at build, with on-chain order
expiry no more than 32 slots after the observed slot. Revalidate before send; never rebuild a
simulated transaction automatically. Opens require a flat market and no resting orders that
could alter it; IOC creates no persistent order. Close direction opposes current exposure and
must set the protocol REDUCE_ONLY flag with base lots no greater than observed size. A flat close
fails NoPositionToClose. A concurrent change cannot reverse exposure. Confirmation can mean
partial or zero IOC fill: return ExecutionResult and observe the position, never invent "filled".

Position carries absolute base-unit amount plus side=long/short/flat, market and trader account.
Flat is exactly zero. Its valueUsd is null, never leveraged notional. Point reads return
`{position, account}` where account is the PerpAccount equity record. Valid absent trader returns
flat plus confirmed-zero account equity; provider/corrupt/incomplete-state errors do not.
`listPositions(owner)` follows ADR-0018 and includes the account equity once, even when flat.
Signed USD equity includes losses; unknown complete equity is null, not guessed collateral.

## Consequences

#27 and #28 must both exist before funded open/read/close/read QA. Observe residual size after
partial closes and decide explicitly whether another bounded close is warranted; never auto
retry on ambiguous submission. Collateral withdrawal/registration remain operator tasks.
Old dormant unbounded perp Actions require migration; no existing executed tool loses behavior.

## Sources

- [Official program addresses](https://github.com/Ellipsis-Labs/rise-public/blob/4bd3c505f16f09fdbe9fb2eff035aeaef8b7b12d/ts/src/core/constants.ts)
- [IOC packet builder](https://github.com/Ellipsis-Labs/rise-public/blob/4bd3c505f16f09fdbe9fb2eff035aeaef8b7b12d/ts/src/orderPackets.ts)
- [Wire order packet and reduce-only flag](https://github.com/Ellipsis-Labs/rise-public/blob/4bd3c505f16f09fdbe9fb2eff035aeaef8b7b12d/rust/ix/src/order_packet.rs)
