# Submission live round (#184)

**Status: 26 funded mainnet sends are recorded.** Every one was simulated first and sent
exactly once, never with `--skip-simulation`. Every one confirmed and was reconciled against
on-chain account deltas. PR #184 moved every execute path onto one Submission order
(ADR-0031). This round re-validates those paths through it and validates the two tools the
round showed were missing. This note does not claim Surfpool coverage; that lives in the
suite.

## Setup

- **Operator and budget.** The operator approved the round on 2026-09-27: wallet
  `keychain-qa`, owner `E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f`, mainnet, $100 total.
- **Cluster check.** The configured RPC returned the #144 Meteora close signature at slot
  450,691,615.
- **Commits.**
  - Transfer, swap, pump, Phoenix, Raydium, Meteora and Orca ran
    `71543e97bcd7eb5792e97866b16435e1ceb26c90`.
  - Kamino ran `0cf1f47`, the reserve-selection fix below.
  - The token-account closes and the second Raydium open ran `61a1967`, the tools below.
- **Baseline.**

  | Asset | Amount |
  |---|---|
  | SOL | 1,464,018,480 lamports |
  | USDC | 14,312,114 |
  | USDT | 11,339,199 |
  | JUP | 39,069,353 |

  Phoenix was flat at equity 0, there was no Kamino supply, and there was no wSOL account.
  The existing Orca position `2LyZ…QgWZ` and Meteora position `8Kas…yFAvfyM` were empty.

| Path | Sends | Net |
|---|---|---|
| Transfer SOL | 1 | −6,000 lamports (fee) |
| Jupiter swap round trip | 2 | −13,240,999 lamports, 0 USDC. See the route account below |
| Pump buy and sell | 2 | −333,459 lamports |
| Phoenix collateral, open and close | 4 | −24,000 lamports, −1,938 USDC |
| Raydium CLMM open to close | 4 | −1,913,440 lamports (1,488,440 of it into a wSOL account, reclaimed later), −1 USDC |
| Meteora DLMM open to close | 4 | −425,000 lamports, −61 USDC, +56 USDT |
| Orca deposit and withdraw | 2 | −12,000 lamports; 9,999,999 lamports returned as wSOL |
| Kamino deposit and withdraw | 2 | −5,335,840 lamports (user-metadata rent and fees), −1 USDC |
| Raydium open naming its position | 3 | −320,000 lamports, −1 USDC |
| Close token account (wSOL, then Token-2022) | 2 | +11,482,439 and +1,507,840 lamports |

**Across the round:** −18,620,459 lamports (about $2.31 at $123.87/SOL), −2,002 USDC and
+56 USDT base units. The SOL figure breaks down as:

| Component | Lamports |
|---|---|
| TesseraV route account rent | −13,045,440 |
| Kamino user-metadata rent | −5,323,840 |
| Transaction fees | −1,656,000 |
| Pump venue fees | −123,458 |
| Rent back from the empty Token-2022 account | +1,513,840 |
| Swap price | +14,441 |
| Rounding | −2 |

Every position the round opened is closed. Phoenix is flat with zero collateral, and there is
no Kamino supply and no wSOL.

## Transfer SOL (#184)

A 0.001 SOL self-transfer simulated at 150 CU, then confirmed at slot 450,968,934 with
signature
`yEQrRZhGChXy5Bg2TM76nT66qc6h69scq3g21vMn4DxwUYUmT6dF79HBsdMZ72FR62jrrPEgKi6ETWxD4K4hbHh`.
The wallet delta was exactly the 6,000-lamport fee.

## Jupiter swap round trip (#184)

**SOL to USDC, 50 bps.** The fresh quote was 20,000,000 lamports in for 2,486,915 out, with a
2,474,480 minimum, routed through TesseraV. The simulation took 75,324 CU. The transaction
confirmed at slot 450,969,068 with signature
`4cgUrmKRM9Pd1Y4DbU1njhJYFUEaVwpAWJzDYmeFPtc72suBzBoqXvaDAbyBmmvDaF68gnUmGZVNHXi5sULh6SGq`
and a 105,000 fee. USDC rose 2,485,276, which is above the minimum and 7 bps under the fresh
quote. SOL fell 33,150,440:

| Component | Lamports |
|---|---|
| Swapped | 20,000,000 |
| Fee | 105,000 |
| New route account | 13,045,440 |

The route created account `13jmKxYnowfVd5JYQY6tcphMcAP599Tz1Jj9HxYofzqm`: 2,440 bytes, owned
by `9H6tua7jkLhdm3w8BvgpTn5LZNU7g4ZynDmCiNN3q6Rp`, with the taker paying its rent. The spend
bound admitted it inside its 20,000,000-lamport overhead allowance, which ADR-0024 sized for
exactly this kind of rent. solOS cannot reclaim that rent. See Findings.

**USDC back to SOL, 50 bps.** The simulation took 77,038 CU. The transaction confirmed at slot
450,969,276 with signature
`2543u33KP7aJg9yKfX1FHMwSE38xcWgVejasuznhw9BXCnV2JNp6pGXXt7LDuDaphH9BwkVvkK8o8swcwbAdNnAA`
and a 105,000 fee. It returned 20,014,441 lamports gross. USDC went back to exactly
14,312,114, and no wSOL account was left. A real stdio MCP child ran the simulate twin (164,554
CU on its own fresh route) and sent nothing.

## Pump buy and sell (#184)

The coin was `6UjqmVAaBtq5htSXvjK3Ve6zHNygksYpRK3zDKLKpump`, on a live curve at 196 bps
progress. Both trades used 100 bps of slippage.

| Trade | Simulation | Slot | Signature | Wallet SOL | Coin |
|---|---|---|---|---|---|
| Buy, 0.005 SOL | 91,212 CU | 450,969,405 | `4cBkBqndpEVPRw129HjgawsL55Gx1CHZZrWSRFUkyXZYX2PogyeXDy75fivB9DKGDKgsWzZGP6625MxThUq3CGBA` | −5,105,000 | +1,476,755,748,036 |
| Sell, all | 75,275 CU | 450,969,553 | `56VtN8qMesbDcQH51sB7syxB48FdWfrLzsrmZ9LpwfzWjFQnWnfzoFWgnNcNX9QtFKeAG2tHodopmwXZWpkX6vfq` | +4,771,541 | back to 0 |

Each trade paid the two fee recipients 46,914 and 14,815 lamports. The −333,459 net is
210,000 in transaction fees, 123,458 in venue fees and 1 lamport of curve rounding.

## Phoenix collateral, open and close (#184)

The trader was `DnNrzdydJpFhtwxZpebGF5ozCajsqpXbPJMKYBvkyWuS`, PDA 0 / subaccount 0,
onboarding-ready and flat. **This is the first funded trade on this path.** Every send's fee
was 6,000 lamports.

| Step | Simulation | Slot | Signature | Result |
|---|---|---|---|---|
| Deposit 5,000,000 | 30,345 CU, estimate 5,000,000, not guaranteed | 450,971,472 | `C2FxdjxxF1eQvXmmsKegACucvfKqcPXcT1QYzvFs2UQ5HqbfvwYoEHzYovSHFZB7bnn1dkYrrww7o4qLYJ7n2H2` | Wallet −5,000,000 USDC, trader +5,000,000 |
| Open SOL long | 161,984 CU, book 124.08/124.09 | 450,971,592 | `jQx517Q6vvDrgnoe19GAzty2vee9tJAJjE6PvoQPFUwfW1bZpWMF6fRoqjurXjTM5nUHzAyBWLXjx68ZaHfBjDs` | Long 2 lots (0.02 SOL); equity `null` by design |
| Reduce-only close, limit 123.44 | 160,843 CU | 450,971,716 | `4pHmrrYZmr5xBZ854dHUkZzXJQvKQd54rE1LMYqHdzrYnLT1bSD63HBHcLg4e2bo7morMUyXQPZWC5XWzQ81Bdff` | Flat, equity 4.998062 |
| Withdraw 4,998,062 | 47,511 CU | 450,971,877 | `2gAW7GbESjcbdRffCVa1jSUriyuDBk5zbB1rqGR2bzi8uCfDLYXUG1SvcjrGbGXUQ7bxFyp7tBUXN7B8vdXbTsxa` | Wallet +4,998,062, trader −4,998,062 |

The open was $3 notional at max leverage 2, with the limit at 124.68. Jupiter priced SOL at
124.064 at the time. Deposit, open and close each required a fresh read before sending: the
open read the position long, and the close read it flat.

The first close simulation exited non-zero. Its error line was lost to an output filter. The
simulate tier sends nothing, and the second simulation passed.

The trade cost 1,938 USDC base units in spread and fees.

## Raydium CLMM open to close (#184)

The pool was `3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv` (SOL/USDC), with ticks −22000..−21900
below the price, so the position held USDC only. Slippage was 50 bps.

| Step | Simulation | Slot | Signature | Result |
|---|---|---|---|---|
| Open, 1,000,000 USDC | 103,148 CU, liquidity 599,329,452 | 450,972,020 | `2PCRtttrME52p4n3P4HJU7W3oXxX4bhP6Wikp4UDQcFzLZDRNJagyaQtDnNXPYL155HghnDVVrXG1W3ATBtDuQ3M` | Position `7Hnhgoo9fyz9MxG4e9t1VzScxCWYPec6BEw5hk5s1TL4`, liquidity exactly the quote, principal 999,999; fee 110,000 |
| Deposit 500,000 | 32,239 CU, quote 299,664,726 | 450,972,200 | `4kAA3r2cQdMPCiTfTUAtmAVqzN2Vu7bib5e6y9q7Ev6vaeHn7QbZ92yyiFp2Mw6jYRHiNZYPZfwNHfcHiHcoKSt` | Liquidity 898,994,178, exactly +quote |
| Withdraw 10,000 bps | estB 1,499,999, minB 1,492,499 | 450,972,264 | `2rao74oV94amo2sxUCyZf3JnSXhVSz9SVHg3WpZj2X1kFRy7skrZVVLtveBTYvCkqxoGQCB6Ecj2pwiJpkJp3zgB` | +1,499,999 USDC, liquidity 0, NFT intact; no new rent (the RAY account already existed) |
| Close | 19,631 CU | 450,972,329 | `4Ng2sKqbZ5ZYJFEiK36mHXsEHZXJLXmKCJnCjfe5KoohuCYmQqeazFzU9UrqTPhdZDxHsM3uKLDHjyFxakYrr8WT` | All three rents returned |

The open's result named no position, so the position was found through portfolio enumeration.
See the round below. The open locked rent in four accounts:

| Account | Lamports |
|---|---|
| NFT mint `6YPk3w…` | 1,676,400 |
| Position | 2,077,720 |
| NFT token account `BW7vMC…` | 1,513,840 |
| wSOL account `BNP6pH…`, created for the side the open does not spend | 1,488,440 |

The close returned the first three.

The lifecycle net is −1 USDC and −1,913,440 lamports: 425,000 in fees plus the 1,488,440 of
wSOL-account rent, which the close-token-account round reclaimed.

## Meteora DLMM open to close (#184)

The pool was `ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq` (USDC/USDT), opened at
`lowerBinId` −1 with `width` 5.

| Step | Simulation | Slot | Signature | Result |
|---|---|---|---|---|
| Open | 10,030 CU | 450,972,486 | `51Ukgi52uUC2xpArzMVHXnfiMZb8eGEJKw4ePs2ha3LCnZuT68ucRJzF1suHMER2A6Lzsedrojc21YvGu7QAjNYL` | Position `DxrXarazk5ZMdnTsaLRgTj1PaKaYbomM2PahVrBC1ewe`, named in the result; rent 41,899,840 |
| Deposit, caps 1,000,000 / 1,000,000 | 40,066 CU, required 1,000,000 / 750,000 | 450,972,556 | `4cfQGWdxdbPpcNG9YitPWuin26jZyFP3PTtmWDxHQHj4BThcyfh7f5ozmw2W7tfTseLAF9ArirHT9zH8DgXCoK1Y` | Wallet paid exactly the required amounts; position 999,939 / 750,056 |
| Withdraw 10,000 bps | minimums 994,939 / 746,305 | 450,972,618 | `59A2TCzU8nzUKX2y5QmdYZBMbsWvqnme5UxvkTvgaqgEUNBMD6VQHL1XZgrz7C5J3bAeLB6KQhn2zEX1b9SsBQGV` | Exactly the estimates: +999,939 USDC, +750,056 USDT |
| Close | 6,364 CU | 450,972,672 | `3uaG88MvtQXrkd9qm5apw9eDBaPsPAwx5ALWRbY1wVgpP4cK82VmzRfYkkJBtmaEd2d9gMCQXS31Md3Hioy9asrw` | Rent returned in full |

The lifecycle net is fees only: −425,000 lamports, −61 USDC and +56 USDT.

## Orca Whirlpool deposit and withdraw (#184)

The position was `2LyZJBNUWMH7YXJvhT61NUNXjTbk7kHKZuwyPVA7QgWZ` on pool
`83v8iPyZihDEjDdY8RdZddyZNyUtXngz69Lgo9Kt5d6d`. It sits below its range, so it takes token A
(SOL) only. Slippage was 50 bps.

| Step | Simulation | Slot | Signature | Result |
|---|---|---|---|---|
| Deposit 10,000,000, wrapping SOL | 10,845 CU; the canonical wSOL account existed empty | 450,972,845 | `4P1V3GXX6EaFyiNJGfKdVgarX3RrSywPrrry73H6hUfY8ahKn6u1XtfjdmRi9TDTE79LVW8f4VgLoTXeirZKVrq2` | Liquidity 27,422,001, exactly the quote |
| Withdraw 10,000 bps | minA 9,949,999 | 450,972,916 | `2Cwa21kVnTFqAkkuN7rMqCG1J9Tss5SahhAK8B62tb2eZxpSmpRKPUVs2FSQSxKWY9tPQYfzqymzYmxn2VRuZLtE` | 9,999,999 lamports credited as **wSOL**; position kept at liquidity 0 |

Both fees were 6,000 lamports.

No solOS tool could turn that wSOL back into native SOL. Native-SOL swaps refuse to run while a
funded wSOL account exists. That gap is closed below.

## Kamino deposit and withdraw (#184)

On `71543e9` the deposit simulation was refused with "the configured market has no float-rate
reserve for this mint". Mainnet's Main Market now carries a fixed-term USDC reserve beside the
float-rate one. The deposit build took whichever reserve the scan returned first, while
`lend reserve` read the float-rate reserve fine. `0cf1f47` chooses the reserve by kind, and a
Surfpool test pins that; this round ran on it.

The market was `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF` and the reserve
`D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59`.

| Step | Simulation | Slot | Signature | Result |
|---|---|---|---|---|
| Deposit 1,000,000 | CLI 193,260 CU, MCP 193,056 CU; est. collateral 831,829 at rate 0.8318, not guaranteed; rent 22,961,600 | 450,973,951 | `29FbUUmzBWgqVSrCwm4AMus1i3BkBJANoEidt8YFKEAE7e7mDuvMXiBj2CWRJruk3iyXYSS4U7jfhMLCU9d3fZRB` | Rent exactly as quoted; supply 999,999 |
| Withdraw 999,999 | 126,398 CU, collateral 831,829 | 450,974,039 | `ToBfZxppAZcsLeDQ4a9sJoDzKJq4rsPL1GCHxExga9Hw96t88npNpuSyp7uqPf2Q4GkxsvnaksDoAKXG7wXRteV` | Supply 0; the program closed the obligation and returned 17,637,760 |

The deposit's rent went to user metadata `8MUXTQoZFaWTtKF3CRFYuLzmi7BGfJjN46i4doUAwLsR`
(5,323,840) and obligation `EoBPDzqwXttvu6hLNDdm7CQPkjcNUd2w8CUZHVoiXy8Z` (17,637,760). Both
fees were 6,000 lamports.

The net is −1 USDC and −5,335,840 lamports: the user-metadata rent, which stays locked, plus
fees.

## Raydium open naming its position (#184)

On `61a1967` the same USDC-only range was opened with 500,000.

| Step | Simulation | Slot | Signature | Result |
|---|---|---|---|---|
| Open | 76,235 CU | 450,977,656 | `3EG68MzvGBgonwMh1s7PN986MgoFxo6FqXMSDNPneg8PV2i74ME2ZwAnBeR46QQteMTzh8rzihzqwtiwDaHmX8V9` | Returned `position: GAHbg2CAxN4wC81tP9Z9PJfocw2gKv5STPY4SFaqYrun`, and a read confirmed it; fee 110,000 |
| Withdraw 10,000 bps | 45,234 CU | 450,977,715 | `5DJDydUr4ZBn8ncKQdT33GJYFUce4AveUjPXJiuGf1nQncQZjwmmwKucn47YyfoTmDVDVeufx6j7VkCgimooF4nR` | fee 105,000 |
| Close | 25,631 CU | 450,977,741 | `2iLu1xpQCF8R2PriSLf1a6N7ULE9SrQibyWus7sNSuMPFhAZbASfgr4vLQ8XXGTtvBxnMR9sBLqmLSxLx4CAoWqw` | 5,267,960 rent back |

The open reused the existing wSOL account, so it added no rent. The net is −320,000 lamports
in fees and −1 USDC.

## Close token account (#184)

On `61a1967` the new tool closed two accounts:

| Account | Simulation | Slot | Signature | Result |
|---|---|---|---|---|
| wSOL `BNP6pHgDRwiCNAJa3qfob88HbT9TWqwMFmHinZHTevAG` (the Orca and Raydium residue) | CLI 118 CU, MCP 118 CU; quote returned 11,488,439, unwrapped 9,999,999 | 450,977,876 | `2kvNmFxZ93ojTtMZn7ymRaqUBuqjiGmjsFMNP9GAA6QtBMghcHG1tPLUVbYkwQvsuFGQEHcZ9NqVbrVaiHKoTevf` | Account closed; wallet +11,482,439, the quote minus the 6,000 fee; no wSOL left |
| Empty Token-2022 `FXQNgoWqdLTzduEbqodADwj3kWstzG7r1nnmVBgKAKn3` (pump-coin account left from an earlier round) | 1,464 CU against Token-2022, read from the account's owner | 450,978,001 | `2VXDhrG3o5G7aZMxf73JeDSfuvbAnK6NXZRCHuTQQ7NG4X4qHcnSXjqARzSzQuNi5Ph1DRKe9N1seLxx9nhzq9tB` | +1,507,840 |

## Findings (#184)

- **A Jupiter route can open a per-taker account.** The TesseraV route opened
  `13jmKxYn…ofzqm` and made the taker pay 13,045,440 lamports of rent. That is inside the
  spend bound's overhead allowance, so the swap was admitted by design. The account belongs to
  `9H6tua7jkLhdm3w8BvgpTn5LZNU7g4ZynDmCiNN3q6Rp`, and solOS has no way to reclaim it. The
  quote does not show this cost ahead of time.
- **Kamino reserve selection was wrong.** It has been fixed in `0cf1f47`.
- **Two exits were missing and now exist.** Closing a token account covers both reclaiming rent
  and unwrapping wSOL. A Raydium open now names its position.
- **Kamino's user-metadata rent stays locked.** No solOS tool closes it; it is 5,323,840
  lamports.
- **Surfpool resolves a token account's mint when it records a send.** On an offline fork
  without that mint, the send errors after the transaction has landed. Submission then reports
  "may have landed" with the signature, as designed. The test seeds its mints.
