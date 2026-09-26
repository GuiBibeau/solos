# Lend

Part of the [tool reference](index.md).

## Kamino Lend reserve and supply reads, deposits and withdrawals

`solana_lend_get_reserve` (MCP) and `solos lend reserve --mint <address>` (CLI) read one
reserve's rates and available liquidity from one explicitly configured Kamino market and
return `{ protocol, market, reserve, mint, decimals, supplyApy, borrowApy, liquidity, at }`:

`solana_lend_get_position` and `solos lend position --mint <address> [--owner <address>]`
read one owner's aggregate supply in the same market. Omitted owner means the active signer;
an explicit owner is used verbatim. The result is the published lend Position with underlying
base units and the distinct obligation accounts that contribute supply.

- **One configured market, never a search.** The default market is Kamino Main Market
  `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF`; `KAMINO_LENDING_MARKET` may select one other
  supported market. The market address is validated and echoed in every snapshot (`market` plus
  the exact `reserve` PDA), so later reads and execution reuse the same identities. There is no
  APY-based market choice and no first-reserve-across-markets fallback: two markets holding a
  reserve for the same mint answer with the configured market's float-rate reserve or fail
  `ReserveUnavailable` for that market.
- **Program pin.** Lending program `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD`; reads go
  through Kamino's official `@kamino-finance/klend-sdk` over the same configured Solana RPC
  every other tool uses. No provider key, no second RPC endpoint, no off-chain HTTP leg.
- **Exact units.** `liquidity` is the reserve's available underlying token amount in base units
  (`liquidity.totalAvailableAmount`, u64, decimal string, BigInt end to end) — never TVL, never
  USD, never `totalSupply - totalBorrow`. `decimals` is the reserve liquidity mint's decimals.
  An existing reserve with zero available liquidity is a successful read with `liquidity: "0"`.
  Supply positions sum collateral units across each distinct owner obligation, convert once at
  the reserve's current collateral-per-liquidity exchange rate using integer arithmetic, and
  round down to underlying base units. Borrow entries are never subtracted or reported as supply.
- **APYs are observations, not promised returns.** `supplyApy`/`borrowApy` are annual fractional
  decimal strings (`0.05` = 5%) computed by the SDK's published per-slot interest math and
  exclude incentive reward yields by documented contract. They move every slot; record the time
  when comparing.
- **Typed failures.** Input that is not a 32-byte base58 address fails `LendingInputInvalid`
  before any RPC; a missing configured market fails `LendingMarketUnavailable`; a mint without a
  float-rate reserve (or a mapping violation) fails `ReserveUnavailable`; an undecodable reserve
  account fails `LendingLayoutUnsupported`; a decoded value outside the snapshot schema fails
  `LendingResponseInvalid`; a deadline miss fails `LendingTimeout`; transport failures surface
  as the shared `RpcError`. Corrupt obligations fail `LendingObligationInvalid`; enumerations
  beyond 4096 accounts, 256 positions, or 32 pages fail `LendingEnumerationIncomplete` rather
  than returning a partial result. One attempt per read, no retries, raw provider bodies never travel.
- **Deposits and withdrawals are bounded and twinned** (#22/#23). `solana_lend_simulate_deposit` /
  `solana_lend_execute_deposit` supply one exact underlying amount into the configured market, and
  `solana_lend_simulate_withdraw` / `solana_lend_execute_withdraw` redeem back out of it. The
  amount encoded in the transaction is the exact amount asked for, so nothing more can be spent;
  the executor re-plans against live chain state on every call, and a simulation never submits.
  Borrowing, leverage and elevation-group obligations are never touched.

```sh
SOLANA_RPC_URL=... bun run solos lend reserve --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
KAMINO_LENDING_MARKET=<market> SOLANA_RPC_URL=... bun run solos lend reserve --mint <address>
SOLANA_RPC_URL=... bun run solos mcp call solana_lend_get_reserve --args '{"mint":"<address>"}'
SOLANA_RPC_URL=... bun run solos lend position --mint <address> --owner <owner>
SOLANA_RPC_URL=... bun run solos mcp call solana_lend_get_position --args '{"mint":"<address>","owner":"<owner>"}'
```

`KAMINO_LENDING_MARKET` is optional everywhere and is forwarded to the MCP child like the other
solOS keys; without it every tool still works against the default market.

Operator QA compares one USDC reserve snapshot with the same named Kamino market, recording
time and units. Report it blocked until an operator RPC exists; see [lend QA](../../lend-qa.md).
