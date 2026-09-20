# Kamino Lend reserve reads live QA

Offline tests exercise the real adapter, CLI, and MCP server against a seeded offline Surfnet:
synthetic Kamino Market and Reserve accounts encoded from the klend-sdk's own bundled IDL and
written under the pinned program `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` with the
`surfnet_setAccount` cheatcode. They prove the market selection, mapping, decode/guard, and
units behavior, not what a live market holds. Live QA compares one solOS reserve snapshot with
the same named Kamino market seen through a second client.

**Status: blocked.** A live read needs an operator RPC endpoint with the Kamino lending program
in its history; reusable tests and CI do not receive one. solOS lend reads are public — no
credential is provisioned anywhere; the only
configuration is `SOLANA_RPC_URL` plus the optional `KAMINO_LENDING_MARKET`. Live credentials
and endpoints belong only in the operator or approved QA environment.

## What to compare once an operator endpoint exists

1. Pick the mint (USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` on Main Market) and
   record the UTC time of the read. Run both surfaces:

   ```sh
   SOLANA_RPC_URL=... bun run solos lend reserve --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
   SOLANA_RPC_URL=... bun run solos mcp call solana_lend_get_reserve --args '{"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"}'
   ```

2. Compare against the same market on a block explorer or the Kamino UI, at the recorded time:
   - `market` is the configured market (default Main Market
     `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF`), `reserve` is that market's float-rate
     reserve PDA for the mint, and `mint` echoes the request.
   - `liquidity` equals the reserve's available underlying token amount in **base units** (the
     on-chain `liquidity.totalAvailableAmount`), not TVL, not USD, not `totalSupply -
     totalBorrow`; a UI dollar figure is never comparable.
   - `decimals` equals the USDC mint's decimals (6).
   - `supplyApy`/`borrowApy` are fractional decimal strings (`0.05` = 5%) without incentive
     rewards; they are observations that move every slot, so only same-slot comparisons are
     meaningful. Record time and units with the numbers.
   - The CLI and MCP surfaces must return identical JSON for the same mint and slot.
   - A mint with no reserve in the configured market must exit non-zero with
     `ReserveUnavailable`; an existing reserve with zero available liquidity must succeed with
     `liquidity: "0"`.

## Reporting

Record live QA as `blocked` until the prerequisites above exist. Never report it as passed
from fixture runs: seeded-surfnet suites prove adapter behavior, not venue state. The first
live QA round runs from the operator environment against a real RPC; no funded transaction is
involved (read-only slice).
