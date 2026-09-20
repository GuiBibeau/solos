# 0019 — Lending uses one configured Kamino market

Status: accepted, 2026-09-19. Maintainer contract for issue #35.

## Context

The dormant lend/withdraw Actions lack market identity. A token can have reserves in several
markets; choosing the first result would execute a different intent.

## Decision

Issues #20/#21 add LendingVenue reserve and owner-supply reads. The default market is Kamino Main
Market `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF`; `KAMINO_LENDING_MARKET` may select one
other supported market. Program is `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD`. Validate the
market/reserve/mint relationship and supported account layouts. No best-yield market routing.

The reserve snapshot includes protocol, market, reserve, mint, decimals, supplyApy, borrowApy,
liquidity and receipt time. APYs are annual fractional decimal strings without incentives;
liquidity is available underlying base units. Underlying supply positions use exact reserve
exchange-rate math rounded down to underlying base units, not collateral-token quantities.
Aggregate the owner's supported supply obligations once per market/mint; include the distinct
obligation addresses in `positions`. Valid known reserve without supply returns amount="0" and
positions=[]; unavailable reserves, unsupported layouts and provider errors remain failures.

#22/#23 create lend/withdraw_lend Actions with explicit market, mint and positive u64 amount in
underlying base units. The use case obtains the configured market identity from LendingVenue;
the executor revalidates it against configuration. Only ActionExecutor builds/signs/submits.
A withdrawal amount is the requested underlying amount, not a collateral token count. Convert
to receipt units conservatively using the pinned protocol math and verify the predicted redeemed
base units equal the request; reject dust or an unrepresentable request rather than silently
rounding to a different amount or using a maximum sentinel. Keep the fresh exchange rate in
simulation evidence and report actual credited units separately after confirmation.
No borrowing, collateral routing, leverage or reward harvesting is introduced.

Owner enumeration follows ADR-0018, including receipt-mint deduplication. Read failures are not
empty portfolios. The configured market is the declared coverage, never all Kamino markets.

## Consequences

Deposit and withdrawal both need offline decoded-instruction coverage. Live funding waits until
both entry and exit exist; the operator compares underlying balances and receipt quantities
before deposit and after withdrawal, including rent, fees and dust. Reusable tests hold no credentials.
Old dormant Actions without market or with zero amount now fail schema validation; migration is
intentional and versioned. Existing wallet/transfer/swap callers are unaffected.
