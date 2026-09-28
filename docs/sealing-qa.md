# Sealing live round (#186)

**Status: 23 funded mainnet sends are recorded.** Every one was simulated first and sent
exactly once, never with `--skip-simulation`. Every one confirmed and was reconciled against
on-chain account deltas. ADR-0032 moved signing out of the venues and into Submission: every
v1 builder now hands over a draft, and sealing fetches the lifetime, checks it and signs. This
round runs one lifecycle through every changed path. One further send, a Meteora open, never
landed and cost nothing; see Findings. This note does not claim Surfpool coverage; that lives in
the suite.

## Setup

- **Operator and budget.** The operator approved the round on 2026-09-27: wallet
  `keychain-qa`, owner `E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f`, mainnet, every changed
  path, $5 total, of which at most 0.04 SOL in fees and unrecovered rent, and at most 0.02 SOL
  or $2.50 of tokens per action.
- **Cluster check.** The configured RPC returned the #184 transfer signature at slot
  450,968,934.
- **Commit.** Every send ran `50a50016d266b1050903b9465959d97503cf81cc` on a clean tree.
- **Baseline.** It matched the #184 closing state exactly.

  | Asset | Amount |
  |---|---|
  | SOL | 1,445,398,021 lamports |
  | USDC | 14,310,112 |
  | USDT | 11,339,255 |
  | JUP | 39,069,353 |

  Phoenix was flat at equity 0, there was no Kamino supply, no wSOL account and no pump-coin
  account. The existing Orca position `2LyZ…QgWZ` and Meteora position `8Kas…yFAvfyM` were
  empty. Jupiter priced SOL at $123.15.

| Path | Sends | Net |
|---|---|---|
| Transfer SOL | 1 | −6,000 lamports (fee) |
| Jupiter swap round trip | 2 | −226,743 lamports, 0 USDC |
| Pump buy and sell | 2 | −1,847,299 lamports, 1,513,840 of it coin-account rent reclaimed below |
| Phoenix collateral, open and close | 4 | −24,000 lamports, −1,724 USDC |
| Kamino deposit and withdraw | 2 | −12,000 lamports, −1 USDC |
| Meteora DLMM open to close | 4 | −425,000 lamports, −2 USDC, −3 USDT |
| Raydium CLMM open to close | 4 | −1,913,440 lamports, 1,488,440 of it wSOL-account rent reclaimed below; −1 USDC |
| Orca deposit and withdraw | 2 | −10,012,000 lamports; 9,999,999 returned as wSOL |
| Close token account (wSOL, then Token-2022) | 2 | +11,482,439 and +1,507,840 lamports |

**Across the round:** −1,476,203 lamports (about $0.18 at $121.69–$123.15/SOL), −1,728 USDC
and −3 USDT base units. Every rent the round locked came back. The SOL figure breaks down as:

| Component | Lamports |
|---|---|
| Transaction fees | −1,336,000 |
| Pump venue fees | −123,458 |
| Swap price | −16,743 |
| Pump curve rounding | −1 |
| Orca principal rounding | −1 |

Every position the round opened is closed. Phoenix is flat with zero collateral, and there is
no Kamino supply, no wSOL and no pump-coin account.

## Transfer SOL

A 0.001 SOL self-transfer simulated at 150 CU, then confirmed at slot 451,019,457 with
signature
`4taWX2MyZhQNGqXNhB6FdPaw5jJNCnFzmPXzSpfY2vN1UDwTmjkP1ozPDEYnka8W1wXGzH7JXDAcTufyYfpJUr3B`.
The wallet delta was exactly the 6,000-lamport fee.

## Jupiter swap round trip

**SOL to USDC, 50 bps.** 20,000,000 lamports in. The simulation took 106,326 CU on its own
fresh build. The transaction confirmed at slot 451,019,563 with signature
`5cJdHCHfeGg365rsserZVr4khpaWbSckYCPngH2siL2QjdaHsDJ6vFEgSRygj1kbiG16jzbzWctxTzA4a8zG15xt`
and a 105,000 fee. USDC rose 2,461,841, a rate of $123.09/SOL against Jupiter's $123.15. SOL
fell exactly 20,105,000: this route opened no taker-paid account.

**USDC back to SOL, 50 bps.** The fresh quote was 2,461,841 in for 19,981,990 lamports out,
with a 19,882,080 minimum. The simulation took 167,154 CU. The transaction confirmed at slot
451,019,718 with signature
`2m4Yp96Ukd1a8Q4JhNZ9q5f7gf77J9zpSxkTQCUhQeBcmPVjQJL3fnqy4cA9FpxFUaFVVemLqF44VyK3sXVyBL2F`
and a 105,000 fee. It returned 19,983,257 lamports gross, 1,267 above the quote. USDC went back
to exactly 14,310,112, and no wSOL account was left.

## Pump buy and sell

The coin was `6UjqmVAaBtq5htSXvjK3Ve6zHNygksYpRK3zDKLKpump`, still on a live curve at 196 bps
progress. Both trades used 100 bps of slippage.

| Trade | Simulation | Slot | Signature | Wallet SOL | Coin |
|---|---|---|---|---|---|
| Buy, 0.005 SOL | 103,971 CU | 451,019,900 | `4rTYorz8Pz8x511nmKCZitc5ioFVe1KghXJRR8XHT8fLANNGetXSMkYsoh4SCnk9he1VQEmgqKT2ztQLunBqP444` | −6,618,840 | +1,476,755,747,618 |
| Sell, all | 75,275 CU | 451,020,009 | `2z3xtrt49bNcsB2qyRZCXghvT2X68XtyHioTys1An289iH8jVo4d69B1QGhVQGzsaZhNBfw7x9U76JZruXwL8fEy` | +4,771,541 | back to 0 |

The buy spent exactly its 5,000,000 budget: 4,938,271 into the curve and 46,914 plus 14,815
to the two fee recipients. It also paid 1,513,840 of rent to recreate the coin's Token-2022
account `FXQNgo…VgKAKn3`. The sell paid the same two fees. Selling everything left that account
empty with its rent, which the close-token-account round reclaimed. Net of that rent, the pair
cost 333,459 lamports: 210,000 in transaction fees, 123,458 in venue fees and 1 lamport of
curve rounding.

## Phoenix collateral, open and close

The trader was `DnNrzdydJpFhtwxZpebGF5ozCajsqpXbPJMKYBvkyWuS`, PDA 0 / subaccount 0,
onboarding-ready and flat. Every send's fee was 6,000 lamports.

| Step | Simulation | Slot | Signature | Result |
|---|---|---|---|---|
| Deposit 2,500,000 | 30,307 CU, estimate 2,500,000, not guaranteed | 451,020,222 | `54gtu7oF3SGS1tMqhkGJPB7hiuAKZfpQJN6LbjFNnqxZ7pBqp6Ntu9fHMdJV8gQHbCD1MfEja2NzQ62KjCVvg597` | Wallet −2,500,000 USDC, trader +2,500,000 |
| Open SOL long | 180,420 CU | 451,020,305 | `o99Cj8oqjkwpGG1n8QNNmoGGf2cPPftru8DtGXuofTsKM9piJ45wKkCmCQUzRumFJu2ZcGchKUUoPBfYqnxVgYG` | Long 2 lots (0.02 SOL); equity `null` by design |
| Reduce-only close, limit 122.33 | 164,265 CU | 451,020,401 | `arvsLPs3NRiThavTXcChHVVnjxFaeVEasWK8nnuUhxdFhY4QooqmWssSPLgD4DuTLzKpXBPdibF2TUbbCK3DCx7` | Flat, equity 2.498276 |
| Withdraw 2,498,276 | 47,511 CU | 451,020,486 | `5pP67tWHCKZwoC3jb8nTeyVQKxP8h2FeXzunYVoMNGcS8V6EkEW41CnAFGbiCu38p5YebmGxiyaSMUE9imZ22HPT` | Wallet +2,498,276, trader −2,498,276 |

The open was $2.50 notional at max leverage 2, with the limit at 123.80. Jupiter priced SOL at
$123.15 at the start of the round and $122.95 right after the open. The open and close builds
still check their own 5 s freshness window before handing over their drafts, and both passed
it.

The trade cost 1,724 USDC base units in spread and fees.

## Kamino deposit and withdraw

The market was `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF` and the reserve
`D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59`.

| Step | Simulation | Slot | Signature | Result |
|---|---|---|---|---|
| Deposit 1,000,000 | CLI 135,245 CU, MCP 135,645 CU; est. collateral 831,814 at rate 0.8318, not guaranteed; obligation re-initialised, rent 17,637,760 | 451,020,774 | `z1DuUjc8GkkGEx47KUqLe373jwaid4Qynm33SB56PXkpveGH7bUZR8ZN2yeW4Fuq6jvCjHZTWfqsovz5A1UZmJK` | Rent exactly as quoted; supply 999,999 |
| Withdraw 999,999 | 124,206 CU, collateral 831,814 | 451,020,876 | `4iDtiXrTEHdfZpvTSN76nWRrCPiAnQA8Pcne1jJDQZdvkM2E1weEnVyNKEaaVEKwt8YL8j3nRhGQCzbaqXZK1Avg` | Supply 0; the program closed the obligation and returned 17,637,760 |

The user metadata #184 created was reused, so nothing new stayed locked. Both fees were 6,000
lamports. The net is −1 USDC and −12,000 lamports.

## Meteora DLMM open to close

The pool was `ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq` (USDC/USDT), opened at
`lowerBinId` −1 with `width` 5. The first open attempt did not land; see Findings. The open
below is a fresh one, simulated again first.

| Step | Simulation | Slot | Signature | Result |
|---|---|---|---|---|
| Open | 10,030 CU | 451,027,153 | `5pziyRc41sXPK5ZjcFW2Ci6C5jNjbZaKcgTyXRtVWZmzfDoQmZ45yQdcBgdVuaNkhSpaytX51B8MjRy6ZNSX1BDe` | Position `EYPnVg9rPDMfZNZwVpvQeqyEYp2oUhQ835gTK5psqoMp`, named in the result; rent 41,899,840; fee 110,000 |
| Deposit, caps 1,000,000 / 1,000,000 | 40,060 CU, required 1,000,000 / 750,000 | 451,027,273 | `mJteZuXhRVXpseyHzgveZSAd2qtUBupauR2NCYpDPrXfqtjTpoohK8NorugN3akdGSeAQzEMf6kDmgs5FxDkgdK` | Wallet paid exactly the required amounts; position 999,998 / 749,997 |
| Withdraw 10,000 bps | 45,032 CU; minimums 994,998 / 746,247 | 451,027,388 | `5eAsSAJcb51SBoKtpiCZXVSeKi93SPT5fN9DBmveeNdJJj7F6rECzynnt5tNaDDBprbdukncTxx9mREEKhu16Cd6` | Exactly the estimates: +999,998 USDC, +749,997 USDT |
| Close | 6,364 CU | 451,027,496 | `3Y6ZRREnEWgHHRJYXWjKTzNuAb3KPTKbRsKeP2qfhE6raFoZ7NRwFMYeuKp45PLanhLkMairtptsANkdVoVfXiKV` | Rent returned in full |

The open's 110,000 fee is two 5,000-lamport signatures plus the 100,000 priority fee: the
position key rode on the instruction's account meta, and sealing signed with it beside the fee
payer. The lifecycle net is fees only: −425,000 lamports, −2 USDC and −3 USDT.

## Raydium CLMM open to close

The pool was `3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv` (SOL/USDC), with ticks −22000..−21900
below the price, so the position held USDC only. Slippage was 50 bps.

| Step | Simulation | Slot | Signature | Result |
|---|---|---|---|---|
| Open, 1,000,000 USDC | 98,648 CU, liquidity 599,329,452 | 451,027,664 | `5VjEMemBJv41hwgTUQSEHUGyC1YCLkGLKKStPuRfyiigFyWE6QnhdUcVttZB6wDQBuYL1BM3rVBfMa2BaFdySGTd` | Position `6WUWJ1myJCWbUiWnACRTNSQeFZUxUwSdgcwzymL8VxfS`, named in the result; liquidity exactly the quote, principal 999,999; fee 110,000 |
| Deposit 500,000 | 32,239 CU, quote 299,664,726 | 451,027,787 | `CoesNdA8c7okKvgFnRVJRRvjMuhMn8mtdnq8sc7R1jPgvh8kpCy1FX9GmVY7NbqVunAKob2Qa55Bpvo7bi42VCc` | Liquidity 898,994,178, exactly +quote |
| Withdraw 10,000 bps | 45,234 CU; estB 1,499,999, minB 1,492,499 | 451,027,892 | `5tjc3sQpfPZZKh2XULM2VBzRiFFVTh8sammHzS2rVrbMhXfgsNuXEKXR8TSyqPTvaQkB1EiScxZW73y4SafBhkaZ` | +1,499,999 USDC, liquidity 0; no new rent |
| Close | 18,131 CU | 451,027,992 | `4acCUDUv4ACJZRHJhTtRyqHWtHTAup3EFVryiGBqKpUhHUE73fLNxUtRrEuGdj59yp2anYDuEWv24TjL9NfeC29B` | All three rents returned |

The open's 110,000 fee is two signatures plus the priority fee: the ephemeral NFT mint signed
through its own account meta. The open locked rent in four accounts:

| Account | Lamports |
|---|---|
| NFT mint `EcwHnL…942hU` | 1,676,400 |
| Position | 2,077,720 |
| NFT token account `DexV7B…BodF` | 1,513,840 |
| wSOL account `BNP6pH…evAG`, created for the side the open does not spend | 1,488,440 |

The close returned the first three, 5,267,960 in all. The lifecycle net is −1 USDC and
−1,913,440 lamports: 425,000 in fees plus the 1,488,440 of wSOL-account rent, which the
close-token-account round reclaimed.

## Orca Whirlpool deposit and withdraw

The position was `2LyZJBNUWMH7YXJvhT61NUNXjTbk7kHKZuwyPVA7QgWZ` on pool
`83v8iPyZihDEjDdY8RdZddyZNyUtXngz69Lgo9Kt5d6d`. It sits below its range, so it takes token A
(SOL) only. Slippage was 50 bps.

| Step | Simulation | Slot | Signature | Result |
|---|---|---|---|---|
| Deposit 10,000,000, wrapping SOL | 10,823 CU; the canonical wSOL account existed empty, left by the Raydium open | 451,028,116 | `3oLzAMBmRFfCPmyTPHLm4nDwEusVawReJT1JRmgPgjBGBKDvf4pxgvwpjHCNaLoAZS6MXQbiaqC925YAvQGB5qFw` | Liquidity 27,422,001, exactly the quote |
| Withdraw 10,000 bps | 10,435 CU; minA 9,949,999 | 451,028,227 | `5NzqmHQ3XVw5LJ7CwPH6uQ8PCLb7awqeai9e2t1bR6bRgVPnSx2ev2Gq9htu8RHV8YnKzCwk4vzkDjAx7DcEXhqc` | 9,999,999 lamports credited as **wSOL**; position kept at liquidity 0 |

Both fees were 6,000 lamports.

## Close token account

| Account | Simulation | Slot | Signature | Result |
|---|---|---|---|---|
| wSOL `BNP6pHgDRwiCNAJa3qfob88HbT9TWqwMFmHinZHTevAG` (the Orca and Raydium residue) | CLI 118 CU, MCP 118 CU; quote returned 11,488,439, unwrapped 9,999,999 | 451,028,350 | `3ZjphNYg3FT29NSd6zfGHPXQDmaiReS7Yz4VF9xGgqNoofJccYUDa18ogZdqS4ZnAPH9oBZYuVq1SkBKUgatRPcp` | Account closed; wallet +11,482,439, the quote minus the 6,000 fee; no wSOL left |
| Empty Token-2022 `FXQNgoWqdLTzduEbqodADwj3kWstzG7r1nnmVBgKAKn3` (the pump-coin account) | 1,464 CU against Token-2022 | 451,028,453 | `JgJwQKJKCtPMS1xcCGdnwxusXTyXb5fG8SZBXm5VcAzHL9R8kyCAXFaTCkfYdrE4nJ5Z7NP4GknJxkNbECmyQAU` | +1,507,840 |

## Findings

- **Sealing signed every path from its draft.** No venue signed. The two opens that carry a
  second signer show it on chain: the Meteora position key and the Raydium NFT mint each added
  a 5,000-lamport signature to the fee. The paths whose instruction order carries weight
  confirmed in the order their drafts gave: Kamino's refreshes right before the deposit, which
  the program checks, Orca's wrap before the deposit, and Jupiter's setup, swap and cleanup. No
  send was refused for its lifetime.
- **A Meteora open ended "may have landed" while the configured RPC was slow.** The first
  attempt took more than four minutes to return, and a balance read right after it took more
  than two. Submission returned `TransactionFailed` with the may-have-landed reason and the
  signature
  `vAhnyBRCYN9vqVqCA775yL8QGZG4NWXhmub8gx6jGz9gZBxML52eTZuGi3XWQYPLUeLdk79N84ezGCYr2mk42GM`,
  as designed. Once reads were fast again, the RPC had no record of that signature, the wallet
  had not moved, and the blockhash had long expired. So it never landed and cost nothing. The
  fresh open above came back confirmed about two seconds after its command started. The round
  did not record where the four minutes went.
- **A reconciliation read can lag.** The first account read after the Meteora close returned
  the account as it was before the close. A second read found it gone. Sends were not affected,
  but reconciliation should read twice before concluding an account survived.
- **Selling a pump coin in full leaves its account.** The Token-2022 account and its 1,513,840
  lamports of rent stay after the sell; closing the token account reclaims them.
