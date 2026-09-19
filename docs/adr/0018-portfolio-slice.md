# 0018 — Portfolio is a read model with explicit valuation scope

Status: accepted, 2026-09-19. Maintainer contract for issue #35.

## Context

Wallet balances alone omit lending claims, LP principal and shared perp equity. An unsigned
position amount cannot describe a short; summing market notional would invent net worth.

## Decision

Issue #34 adds PortfolioReader and `solana_portfolio_get_state`. It composes the wallet,
TokenRegistry/PriceFeed and optional exported LendingVenue, PerpVenue and LiquidityVenue ports.
The schemas in `@solos/actions` distinguish token, lend, perp and lp positions. Native SOL's
instrument is `SOL`; wSOL uses its mint and remains a separate balance. Token/lend amounts are
base units; perp amount is absolute base exposure with long/short/flat side; LP liquidity is
protocol shares with separate canonical token A/B principal amounts and decimals.

Identity within one owner: token = instrument; lend = protocol/market/mint with distinct
contributing obligation addresses; perp = protocol/trader account/market; LP = protocol/position
account. Multiple LP positions in one pool are distinct. Cash contains native SOL and recognized
stablecoins (USDC initially). Wrapped SOL and other tokens go in positions. Equity belongs in
`perpAccounts`, once per protocol/trader account, including an account with no open markets.
Per-market `valueUsd` is always null because notional is not equity. Account equity is signed
USD, including PnL and funding under the pinned venue formula, or null when not fully known.

Each venue's `listPositions(owner)` returns complete `{positions, perpAccounts, receiptMints}`;
non-perp venues return an empty perpAccounts array. receiptMints identifies wallet claims already
represented by those positions, including LP NFTs and lending receipt tokens. Exclude those
mints from wallet totals only after successful venue enumeration. Deduplicate token accounts by
address before summing by mint; never deduplicate distinct LP accounts by pool. Each adapter
bounds enumeration to 4096 accounts, 256 positions and 32 HTTP pages; reaching a truncation limit
raises EnumerationIncomplete, never a successful partial array. Missing optional Layer means
no configured coverage; a configured adapter failure propagates. Explicit owner is preserved.

Use integer/rational arithmetic. Token valuation = amount * observed USD price / 10^decimals;
round each known asset value down to 6 USD decimals, then sum exact signed account equity and
asset values. Prices are observed, including stablecoins; never assume a dollar peg. LP value
requires both underlying prices. Unknown nonzero token/lend/LP value or unknown account equity
makes valuationUsd null. Zero holdings contribute zero. Ignore per-market perp valueUsd in that
sum, using their matching account equity instead. Unknown debts/unsupported venue coverage mean
this is a supported-assets-and-perp-equity view, explicitly not full net worth. Kamino borrowing
is outside scope and never netted against supply or portrayed as zero debt.

Sort cash/positions by the identity above and equity by protocol/account. `at` is local assembly
time, not an atomic cross-provider snapshot. No background cache or risk/approval engine.

## Consequences

#21, #26 and #29 implement enumeration before #34. Reusable tests prove deduplication, null
propagation and exact units; live portfolio QA reconciles every configured venue separately.
Token records retain their old shape. Old lend/perp records need the migration documented in
`packages/actions/README.md`; generic consumers must narrow by kind before reading amount.
