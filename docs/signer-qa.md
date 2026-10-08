# Signer live round: keychain 2.0.0 (#192)

**Status: 29 funded mainnet sends are recorded, one lifecycle through every signing path.** Every
send was simulated first and sent exactly once, never with `--skip-simulation`. Every send
confirmed and was reconciled against wallet and position reads. The change under test is the
two-pin bump of `@solana/keychain` and `@solana/keychain-memory` from 1.4.0 to 2.0.0 with no
source change (#192). Four refusals happened before anything was sent; see Findings. This note
does not claim Surfpool coverage; that lives in the suite.

## Setup

- **Operator and budget.** The operator asked for the round on 2026-10-08: a full funded QA on
  mainnet with a $40 budget, run before merging. Wallet `keychain-qa`, owner
  `E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f`, signer backend `memory:keypair-file` as
  reported by `solos wallet address` before and after the bump. Caps applied inside that
  budget: at most 0.03 SOL or $3.50 of tokens per action, at most 0.05 SOL in fees and
  unrecovered rent, stop on any failed simulation.
- **Cluster check.** `solos dev inspect network` returned the mainnet genesis hash
  `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` at finalized slot 454,568,103.
- **Commit.** Every send ran `947e970a3003f9a0cea1b42d068ebf33b0a5fa1b`, the bump itself, on a tree that also carried
  the unrelated, uncommitted swap-QA inspection commands and notes; none of them touch signing.
- **Read-only checks.** `solos doctor` reported no issue for the profile; `solos wallet
  balance` read the balance below. No Privy profile exists on this workstation, so the Privy
  user-wallet and server-wallet paths were not exercised.
- **Baseline.** SOL 1,771,710,270 lamports; USDC 0 (account `DnK1…3cwp` existed); no USDT, no
  wSOL, no pump-coin account; Phoenix onboarded, flat, equity 0; no Kamino supply; the Orca
  position `2LyZ…QgWZ` held and empty; no Meteora or Raydium position. Jupiter priced SOL at
  $112.46.

| Path | Sends | Net |
|---|---|---|
| Transfer SOL | 1 | −6,000 lamports (fee) |
| Jupiter swaps, four legs | 4 | −434,881 lamports: 420,000 in fees, 14,881 in price |
| Pump buy and sell | 2 | −333,459 lamports net of the 1,513,840 coin-account rent reclaimed below |
| Phoenix collateral, open, close, withdraw | 4 | −24,000 lamports, −579 USDC |
| Kamino deposit and withdraw | 2 | −12,000 lamports, −1 USDC |
| Meteora DLMM: open, close, open, deposit, withdraw, close | 6 | −640,000 lamports, +26 USDC, −31 USDT |
| Raydium CLMM open to close | 4 | −425,000 lamports in fees, −1 USDC; 2,976,880 of venue-created account rent reclaimed below |
| Orca deposit and withdraw | 2 | −12,000 lamports; 9,999,999 returned as wSOL |
| Close token accounts (wSOL, USDT, RAY, pump coin) | 4 | +15,955,159 lamports, of which 9,999,999 unwrapped |

**Across the round:** −1,911,341 lamports, about $0.22 at $112.46/SOL. The stablecoins the
venues consumed (555 USDC and 31 USDT base units) were bought with SOL at the start and the
remainder sold back at the end, so they are inside that SOL figure. Every rent the round locked
came back. The figure breaks down as:

| Component | Lamports |
|---|---|
| Transaction fees | −1,773,000 |
| Pump venue fees | −123,458 |
| Swap price across the four legs | −14,881 |
| Pump curve and Orca principal rounding | −2 |

Every position the round opened is closed. Phoenix is flat with zero collateral, there is no
Kamino supply, no wSOL, no USDT, no RAY and no pump-coin account; the wallet holds only the
accounts it started with.

## Transfer SOL

A 0.001 SOL self-transfer simulated at 150 CU, then confirmed at slot 454,569,053 with signature
`3SqANRB7B48upsocq7br38HZ18pbuY7h8fa8EYoUkUUddZibsEF2cHHB3ABPdUh4hB7fCG8m4Sf48Gnup2ASRrGJ`.
The wallet delta was exactly the 6,000-lamport fee.

## Jupiter swaps

Four legs at 50 bps, each simulated on its own fresh build, each confirmed with a 105,000 fee.

| Leg | Simulation | Signature | Result |
|---|---|---|---|
| 30,000,000 lamports to USDC | 204,258 CU | `2jR5ncrWuLq2bU1fshC8be5bnukUsi7HFyLTcbmmCErNiXrWvxpCt6FZ45PBReqQVgh3AJ6tP8iCkghpxYVZk3wA` | +3,371,852 USDC, $112.40/SOL; SOL −30,105,000 exactly |
| 10,000,000 lamports to USDT | 270,021 CU | `4Rt1Dooz26v96Rp2bp8ZTCYVjXowHSQsDP26YRu1JoP9EkTHv2uQvF5KCchgaLPF2656iBTTAmpk1GFJDcHpvQpi` | +1,124,668 USDT; SOL −11,593,440: the input, the fee and 1,488,440 of rent for the new USDT account `BHMs…HnAz` |
| 1,124,637 USDT to SOL | 80,482 CU | `2B7iRbpJhr626wKwf43jgq76SBynzfH5YfNeAGcxuZqpjb2a5oKDFvGvgnAKdmUKuScUFhmgMHkAPM5aqo7oNfAx` | +10,001,035 lamports gross; USDT to 0 |
| 3,371,297 USDC to SOL | 165,267 CU | `5RemgfnaQhP1X651UHo2awpjd7Lu1gxFPpAbVriWVTaLjwb1eV8vecFu1AB93xU3EfBJmecq5ayRj7nA8tvAKiVp` | +29,984,084 lamports gross; USDC to 0 |

The third leg was first refused before it was built, while the wallet's wSOL account still held
the Orca withdrawal; see Findings. The USDT account's rent came back in the close step.

## Pump buy and sell

The coin was `6UjqmVAaBtq5htSXvjK3Ve6zHNygksYpRK3zDKLKpump`, still on a live curve at 196 bps
progress. Both trades used 100 bps of slippage.

| Trade | Simulation | Signature | Wallet SOL | Coin |
|---|---|---|---|---|
| Buy, 0.005 SOL | 104,263 CU | `nwVLouS88qvAisSJJSiUuwT3RE4cmkLP9GhNU3G9da8CzsbrgroUFNYhHPeinYFGnQmArUquifH42fEquBKpZSn` | −6,618,840 | +1,476,755,747,200 |
| Sell, all | 75,584 CU | `4HaURpfsEFNFB5BpBHKZNV8p7WvgydWigPK5VjVhzKYS33Br6hFf1rVE2mjNqD26zB9oYVJ2XTVvbzMCnXDEsLrd` | +4,771,541 | back to 0 |

The buy spent exactly its 5,000,000 budget plus the 105,000 fee and 1,513,840 of rent to recreate
the coin's Token-2022 account `FXQN…AKn3`. Net of that rent, the pair cost 333,459 lamports:
210,000 in transaction fees, 123,458 in venue fees and 1 lamport of curve rounding, the same
figures as the sealing round.

## Phoenix collateral, open, close and withdraw

The trader was `DnNrzdydJpFhtwxZpebGF5ozCajsqpXbPJMKYBvkyWuS`, PDA 0 / subaccount 0,
onboarding-ready and flat. Every send's fee was 6,000 lamports.

| Step | Simulation | Signature | Result |
|---|---|---|---|
| Deposit 2,500,000 USDC | 29,954 CU, estimate 2,500,000, not guaranteed | `jFdnJXbRv2ELMUs4yXJUPES4diYsyewagQ2fj53WWA4efVWgHyTuwrHk3KU2zGdteYnPrWghiXSSuRbGKwnbCtD` | Wallet −2,500,000, trader +2,500,000; equity 2.5 |
| Open SOL long, $2.50 notional, max leverage 2, limit 113.12 | 187,777 CU | `48jefzGBPU1Nhbp3Eh2nBwXj6aaf4mBUCt1NmDHhVt5q8qzxX9dF1Qfy7a6AqJ1ezALHMhTzrwLgJngk1kg5w3cA` | Long 2 lots (0.02 SOL); equity `null` by design |
| Reduce-only close, limit 111.89 | 196,555 CU | `37MhwdjaoZkZ85ACHBtJSP84tzbT3Hp9HMAbcz3hL2iPkHe2Ynbxa6SiUMR93r4oKWVpsJ4frb8siojZjXovppoM` | Flat, equity 2.499421 |
| Withdraw 2,499,421 | 46,767 CU | `5iDqoy2M89ZWJJxAkujyxqUwSy8doRGKEXFQFwYn2aHBQQYUm2xVwndjshX8iFsEHqMLjfnL9ouu7fSk4wdwbFSv` | Wallet +2,499,421, trader −2,499,421; equity 0 on a later read |

Jupiter priced SOL at $112.45 before the open and $112.57 before the close. Two close attempts
about 20 and 25 seconds after the open were refused before a build; see Findings. The trade cost
579 USDC base units in spread and fees.

## Kamino deposit and withdraw

The market was `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF` and the reserve
`D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59`. Both fees were 6,000 lamports.

| Step | Simulation | Signature | Result |
|---|---|---|---|
| Deposit 1,000,000 | 135,301 CU; collateral 830,293 at the read-time rate, not guaranteed; obligation re-initialised | `5F4jtztPTdE4bYDp8TW4kh1DrN1HpjtKtxYUADP82xBdqkjRTunjmPGf3hNEcWbH8aTXSPC4iiXrjqJjkNVuKB2S` | Supply 999,999 in obligation `EoBP…Xy8Z` |
| Withdraw 999,999 | 123,309 CU, collateral 830,293 | `3DURHQBjF4GouiQZtdNJ8jhjuZsiKgFiptuJXcVi5CLLkSxPNYmCZtgaDwW23xmEaRBZ86jbbhxqEJGK6V7dgtFL` | Supply 0; the program closed the obligation |

The SOL delta across both sends was exactly the two fees, so the obligation rent the deposit
locked came back in full. The net is −1 USDC and −12,000 lamports.

## Meteora DLMM open to close

The pool was `ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq` (USDC/USDT, bin step 1). Opens
cost 110,000 in fees (two signatures plus the priority fee: the position key signed beside the
fee payer) and locked 41,899,840 of rent; every other send cost 105,000. The first open reused
the earlier rounds' window, `lowerBinId` −1 and `width` 5, and its deposit was refused at
simulation because the pool's active bin had moved to 5; see Findings. That position was closed
empty and a second one opened on bins 3 to 7.

| Step | Simulation | Signature | Result |
|---|---|---|---|
| Open, bins −1 to 3 | 10,030 CU | `7p5fscw6kcYMqQSHeovW63JdCyNZ3Bq5BrzQ37DPKAjEYoZ7Stkgc1Yyfcd99CEUs1ewT99qvd76aaUDoZUVHKW` | Position `Mmu2FUp7tz6UX7BUWH3kfr84eSwV1hvgm1vQdZSRkj3`, slot 454,570,087; wallet −42,009,840 |
| Close, empty | 6,364 CU | `3a7YUoBmDXCBc641Lawehp5EmoHTeAtXfqb2jagEP95hrVxX8XtGAWQo8VBUUwM68oDSwhzp5f22GGbhFiAAhVnx` | Slot 454,570,630; wallet +41,794,840, the rent minus the fee |
| Open, bins 3 to 7 | 10,030 CU | `2fpiYz1WTBNu2Gesm1w4fj1BHNiwMRenTzjH2KGooTLdBCq67MqdKCEgQL57oL8DwUQ41EPi5NQHD6Aoie7csMtk` | Position `GyL9gbViTzce2otneTzppp7vEt5kL2v5R8NHazobiVbN`, slot 454,570,646; wallet −42,009,840 |
| Deposit, caps 1,000,000 / 1,000,000, 50 bps | 45,096 CU; required 1,000,000 / 706,813 | `3eJFMiEdjBvFDf3Dg5JRN5tb9GMZUMyRMfbRLjYxFNEF3dECXsmRuS94vgGYRKZVydpqWNJJM4LXQLNRXQUeTq6i` | Wallet paid exactly the required amounts; position 1,000,026 / 706,782 |
| Withdraw 10,000 bps, 50 bps | 45,126 CU; estimates 1,000,026 / 706,782, minimums 995,025 / 703,248 | `4pP4msiqXzCVZ8Qz82AHj18qYjRBGujLKR8t7pzVcQXVTo6cscRBDwACCEWDwKZ53oqFor9r7kWSCb3wQgQvGVNA` | Exactly the estimates: +1,000,026 USDC, +706,782 USDT; liquidity 0 |
| Close | 6,364 CU | `5Mi5jgTcMBjYs1BGC5zPk3FLZKRkfvyed7t4FJ9QJSTWxSydwY8s5ukkKUFArHUCTBiTFE6tMjc1dnQ9fQLRuqzb` | Slot 454,570,693; rent returned in full |

The six sends net −640,000 lamports in fees, +26 USDC and −31 USDT.

## Raydium CLMM open to close

The pool was `3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv` (SOL/USDC), with ticks
−22200..−22100 below the price, so the position held USDC only. Caps were 1,000 lamports of
SOL and 1,000,000 USDC on the open, 1,000 and 500,000 on the deposit. Slippage was 50 bps.

| Step | Simulation | Signature | Result |
|---|---|---|---|
| Open | 99,452 CU | `3LSurkWbqcMV7w5EHrCVJaQXNWAt4Y1NKwCQx4Ei8iFagnu3GuexsUuz2pEiRedpAszyWhQkXHzT5SQmyVa9bCvG` | Position `5WMqZqxtaDriG8rLy855TdeYq8rSDfkahoV8yqdPVk72`, named in the result; liquidity 605,352,511, principal 999,999 USDC; fee 110,000 |
| Deposit 500,000 | 34,403 CU, quote 302,676,255; required 0 / 500,000 | `4KUmUaaCcEBgqEDVukvi8Q5v9TgTzUEmrbFEUXSFrUwV6edq3X1WSWboSjGZTwL5URVee9z9WEbBrqfqC8ZTugGh` | Liquidity 908,028,766, exactly +quote; principal 1,499,999 |
| Withdraw 10,000 bps | 61,905 CU; estB 1,499,999, minB 1,492,499 | `63yxLzE5fkxsFNrijwkEUMLL4AYMGGYk1ThjZWepyN2m3C4FwgaaTA535vtT9418zHzaSB8oXXHRGGvgLEoXraLH` | +1,499,999 USDC, liquidity 0 |
| Close | 18,897 CU | `5VqKxv4JqJpHQER4vwftp6oBc6oqg1z3KVeYwtQZG7yCAGyWimm6TR7mxhokKQa8C1C3bdagrLmx8myYHxyBrmX3` | The position's rents returned |

The lifecycle SOL delta was −3,401,880: 425,000 in fees plus the rent of two empty accounts the
venue created, the wSOL account `BNP6pHgDRwiCNAJa3qfob88HbT9TWqwMFmHinZHTevAG` at the open and a
RAY reward account `D82F9iCXxqgU2eToXPS79WNMdZ1KgzgS52k5dkgAEwux` at the withdraw, 1,488,440
each, both reclaimed in the close step. The token net is −1 USDC.

## Orca Whirlpool deposit and withdraw

The position was `2LyZJBNUWMH7YXJvhT61NUNXjTbk7kHKZuwyPVA7QgWZ` on pool
`83v8iPyZihDEjDdY8RdZddyZNyUtXngz69Lgo9Kt5d6d`, below its range, so it takes SOL only. Caps
were 10,000,000 lamports wrapped and 1 USDC; slippage 50 bps; both fees 6,000.

| Step | Simulation | Signature | Result |
|---|---|---|---|
| Deposit, wrapping SOL | 10,823 CU; required 10,000,000 / 0; the canonical wSOL account existed empty, left by the Raydium open | `YnxDFGuM4U8XtkEcLCafy1gKVd8PLrGh2cY6quH8BLJYEUF9sNrYBanehiTQFU97XoLQJ2a5tLZMWsfieMNqm8s` | Liquidity 27,422,001, exactly the quote; principal 9,999,999 |
| Withdraw 10,000 bps | 10,435 CU; estA 9,999,999, minA 9,949,999 | `555Bqj4FM7QVkTeBr3gJyoCrQ767Rtc5tcVFNKUh34uez4dGxmbx5MgtqrYcqnanX2if4EzqR6dNMfUaXoeN7yUg` | 9,999,999 lamports credited as wSOL; position kept at liquidity 0 |

## Close token accounts

| Account | Simulation | Signature | Result |
|---|---|---|---|
| wSOL `BNP6…evAG` | 118 CU; quote returned 11,488,439, unwrapped 9,999,999 | `46rLYBNBdx6nX4BQeyqE3AnL3jUfcjQd2fnDBmmHbJUQh3VeSF7FwUbwinTWiZnF6QnongbH9FAZouXhX2mw26EZ` | Wallet +11,482,439 |
| USDT `BHMs…HnAz`, empty | 120 CU; quote 1,488,440 | `2Jtn8BFRGsENe52G1oQNKbtwitemzexSGi5s6NqZPizVfnqwP6sGe6D871TqukZ6kNxj2zhJsXo9FT1TrGWS9JGH` | +1,482,440 |
| RAY `D82F…Ewux`, empty | 120 CU; quote 1,488,440 | `U2j7myhfNJSWXQBTuzoUY8N76sW2UDMpTgmfqFvkEu96pwJaEGRVAAQJu3YVDGn1XAjBEbufYCJVv1eRgG4zCrr` | +1,482,440 |
| Pump coin `FXQN…AKn3`, Token-2022, empty | 1,464 CU; quote 1,513,840 | `2C6Tzy6BqBJrCeiwCvoYqu9ug9tpBMbDvPVSeBihLuGQZKGWhzAUdBuYSJ5ro8maX2Fw9Un94e375ckZACNDs7Kj` | +1,507,840 |

## Findings

- **The 2.0.0 memory signer signed every path.** Single-signer legacy and v0 transactions
  (transfer, Jupiter with lookup tables, Pump, Phoenix, Kamino, Orca), and the two paths where
  an ephemeral key signs beside the wallet (the Meteora position key, the Raydium NFT mint),
  whose opens show the second 5,000-lamport signature in their 110,000 fee. The backend name
  `memory:keypair-file` is unchanged. No call site changed for the bump.
- **Phoenix refused the close twice, sending nothing, then accepted it.** Attempts 20 and 25
  seconds after the open returned `BuildRejected: Phoenix close position disagrees with
  on-chain state`: the API's position lots or sequence number had not caught up with the fill.
  A third attempt about 50 seconds after the open built, simulated and confirmed. The guard
  held as designed; a close right after an open should expect to wait.
- **A stale Meteora window is caught by simulation, not by a guard.** The window the earlier
  rounds used, bins −1 to 3, now sits wholly below the active bin, 5. The two-sided deposit was
  refused by the program at simulation (`AddLiquidity2`, `InvalidInput`, 6002) and nothing
  was sent, but 215,000 lamports went to opening and closing the useless position. A deposit
  guard that reads the active bin against the position's window before quoting would turn this
  into a named refusal with a remedy. The active bin was read from the pool account's bytes
  through `solos dev inspect account-data`.
- **Jupiter refused to build while wSOL held a balance.** With the Orca withdrawal sitting in
  the wSOL account, the USDT-to-SOL build returned `BuildRejected` with the remedy to unwrap
  first. Closing the account, then swapping, worked. Order the Orca path after the swaps, or
  unwrap in between.
- **Closes now cost 105,000.** The sealing round recorded 6,000 for Meteora and Raydium closes;
  this round's closes carry the 100,000 priority fee like the other venue sends.
- **A Raydium withdraw creates a reward token account.** The withdraw created an empty RAY
  account and charged 1,488,440 of rent; closing it reclaimed the rent. The lifecycle net is
  not flat until that close.
- **Reads can lag.** The Phoenix equity read right after the withdrawal still showed 2.499421;
  a read 70 seconds later showed 0. Reconciliation should read twice.
