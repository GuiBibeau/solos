# Orca Whirlpool LP positions live QA

Offline tests exercise the real adapter, CLI, and MCP server against a seeded offline
Surfnet: raw Position (216 bytes) and Whirlpool (653 bytes) accounts written under the pinned
program `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` with the `surfnet_setAccount`
cheatcode, decoded from the pinned Orca IDL. They prove the decode/guard/custody/math
behavior, not what a live pool holds. Live QA compares solOS output with the same pool state
seen through a second client.

**Status: the read is done; the funded round is blocked on a capability, not on a position.**

A live read needs an RPC endpoint and an operator-owned Whirlpool position with its NFT in the
operator's wallet. Both exist, and the read was run on 2026-09-25:

```
$ solos liquidity position --protocol orca --position 2LyZJBNUWMH7YXJvhT61NUNXjTbk7kHKZuwyPVA7QgWZ
{"kind":"lp","protocol":"orca","position":"2LyZ…QgWZ","instrument":"83v8iPyZ…5d6d",
 "liquidity":"0","tokenA":{"mint":"So111…112","amount":"0","decimals":9},
 "tokenB":{"mint":"EPjFW…Dt1v","amount":"0","decimals":6},"valueUsd":null}

$ solos mcp call solana_liquidity_get_position --args '{"protocol":"orca","position":"2LyZ…QgWZ"}'
… identical `structuredContent`, through a real stdio MCP child.
```

Both surfaces, as the checklist below requires: the CLI and a real stdio MCP child returned
byte-identical JSON for the same position and pool state.

The position is live, held, and **empty**: ticks -10000..-5000 against a pool at tick -21359, so
it sits below its range and is a 100% token-A position. Passing a different `--owner` returns
`LiquidityPositionUnavailable: owner does not hold the position NFT`, which confirms custody is
checked against the given owner rather than assumed.

**What still blocks the funded add/remove round is issue #126, not a missing position.** Token A
here is wSOL, and the deposit path never wraps: `fundingSide` refuses when a side needs more than
its token account holds, and this wallet holds native SOL with no wSOL account at all.

To be precise about the scope, because an earlier draft of this overstated it: `fundingSide`
accepts an existing account whenever its balance covers the requirement, so a wallet that
**already holds enough wSOL can add today**. What #126 blocks is the wallet that holds native SOL
and expects solOS to wrap it — which is the normal case, and this one. The funded round below can
therefore run either after #126 lands, or sooner by provisioning a funded wSOL account for this
wallet outside solOS.

solOS reads are public — no credential is provisioned anywhere; the only configuration is
`SOLANA_RPC_URL`. Live credentials and wallets belong only in the operator or approved QA
environment, never in issue comments, tool inputs, or implementation sandboxes.

## What to compare

1. Pick the position **account** (the Whirlpool position PDA — never the NFT mint, never the
   pool) and the wallet that holds its NFT. Run:

   ```sh
   SOLANA_RPC_URL=... bun run solos liquidity position --protocol orca --position <position-account>
   SOLANA_RPC_URL=... bun run solos mcp call solana_liquidity_get_position --args '{"protocol":"orca","position":"<position-account>"}'
   ```

2. Compare against the same pool state on a block explorer or a second client:
   - `liquidity` equals the position's raw u128 liquidity share, decimal-exact.
   - `tokenA.amount` / `tokenB.amount` equal the underlying principal at the current pool
     sqrt price for the position's tick range (in-range: both nonzero; below range: token B
     exactly "0"; above range: token A exactly "0").
   - `tokenA.decimals` / `tokenB.decimals` equal the pool mints' decimals.
   - `valueUsd` is null by design (ADR-0022): never compare it against a UI dollar figure.
   - The CLI and MCP surfaces must return identical JSON for the same position and pool
     state.
   - An owned zero-liquidity position must return `liquidity: "0"` with `"0"` amounts and
     exit 0; a position whose NFT the wallet does not hold must exit non-zero with
     `LiquidityPositionUnavailable`.

## Reporting

**The read-only round is done** — run on 2026-09-25 against the position above, through both the
CLI and a real stdio MCP child, with no funded transaction involved. Re-run it whenever the
adapter changes; it costs nothing.

Never report a round as passed from fixture runs: seeded-surfnet suites prove adapter behavior,
not venue state. What remains is the **funded** add/remove round, which needs either #126 or a
wSOL account provisioned for this wallet outside solOS — record that one as `blocked` until one
of those is true.

## Meteora DLMM position read

Offline tests seed PositionV2, LbPair, and BinArray accounts under
`LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` and prove the decode, the owner-field check, and
the pinned bin math. They do not prove what a live pair holds.

**Status: the zero-spend read is done.** Run on 2026-09-26. Nothing was signed or sent.
Open and close still refuse meteora with `LiquidityUnsupportedProtocol` before any network
access (#144). The funded deposit round is
[below](#meteora-dlmm-deposit-154). The funded withdrawal round is
[below](#meteora-dlmm-withdraw-156). Owner enumeration is a separate zero-spend round.

The position is a third party's, so the command names `--owner`. Startup still needs
`SOLANA_RPC_URL` and a configured signer.

```
$ solos liquidity position --protocol meteora \
    --position mpJ2Ewzr5ncHHkgvLKa9jiyZS5LBxJvDRuqZsJoKmmM \
    --owner 8m23JRic714aXZQmDXawzXo6YUN9R4qN5z5BLHUZtLBi
```

Recorded result:

- position `mpJ2Ewzr5ncHHkgvLKa9jiyZS5LBxJvDRuqZsJoKmmM`
- owner `8m23JRic714aXZQmDXawzXo6YUN9R4qN5z5BLHUZtLBi` (PositionV2 `owner`)
- pair `5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6` (SOL/USDC; `instrument`)
- liquidity `1179069276345261306613608345909`
- token A `0` (9 decimals)
- token B `63939249963` (6 decimals). Kernel read the same position as `63939249979`. The
  gap is bin-reserve drift: each occupied bin contributes `floor(share * reserve / supply)`,
  so a reserve move between reads changes the amount.
- `valueUsd` null
- the bin window sits entirely below the active bin, so the position is all token Y

A different `--owner` returns `LiquidityPositionUnavailable` ("position owner does not match
the requested owner"). Open and close still fail `LiquidityUnsupportedProtocol` before any
account read (#144). The deposit round is [below](#meteora-dlmm-deposit-154). The withdrawal
round is [below](#meteora-dlmm-withdraw-156).

## Meteora DLMM owner enumeration

**Status: the zero-spend enumeration is done.** Run on 2026-09-26. Kernel was green on
`cff0c44`, a post-batch re-check of that round. Nothing was signed or sent. There is no list
command. Portfolio state is the path.

```
$ solos portfolio state --owner 8m23JRic714aXZQmDXawzXo6YUN9R4qN5z5BLHUZtLBi
```

Recorded result:

- 8 meteora LP positions
- includes `mpJ2Ewzr5ncHHkgvLKa9jiyZS5LBxJvDRuqZsJoKmmM` with liquidity
  `1179069276345261306613608345909`
- spot-check of that position's token B: `63939249994`

The earlier point read of the same position reported token B `63939249963` (Kernel
`63939249979`). The amount is `floor(share * reserve / supply)` per occupied bin, so a
reserve move between reads changes it. Meteora `receiptMints` is empty. A scan match that
does not decode is `LiquidityPositionUnavailable` for the whole enumeration. More than 256
matches is `LiquidityEnumerationIncomplete`. The withdrawal round is
[below](#meteora-dlmm-withdraw-156).

## Meteora DLMM deposit (#154)

**Status: one funded mainnet deposit is recorded.** Kernel ran it on the #154 head
`87b514be86046b23d1412e26481138804ad33ae2`. On that code, open and close still refuse
meteora. Gui asked to recuperate these funds after the track. That cleanup was not part of
this round. The later removal is [Meteora DLMM withdraw (#156)](#meteora-dlmm-withdraw-156).

The pair is USDC/USDT `ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq`. The position already
existed. Kernel ran `simulate-deposit`, then `deposit`, with `maxSlippageBps` 50 and caps of
1 USDC and 1 USDT.

Recorded result:

- position `8KasnSHnqFGbBsj9rJUrVBue8x9s2BbqbT1URSFAvfyM`
- owner `E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f`
- pair `ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq` (USDC/USDT)
- caps 1 USDC and 1 USDT
- wallet −0.817 USDC and −1.000 USDT
- position token A 3.045 → 3.862 USDC
- position token B 2.955 → 3.955 USDT
- liquidity increased
- simulation succeeded, 67599 compute units, `violations` `[]`
- signature `5fnTWddQTckyCWbJkPHBn8CoaAuAkhwg8u9vmnjxKG3tnHtWPL5K7YU4TuKWDa7tzD8kDcm561J796gVY5uRi5Go`
- venue quote `requiredA` 816578 and `requiredB` 999994, raw
- wallet raw delta −816578 USDC and −999994 USDT
- position raw delta +816583 USDC and +999989 USDT

The wallet display line is those raw wallet deltas, rounded to three decimal places. The
position display lines change by those raw position deltas, rounded to three decimal places.
Asymmetric fill is expected for this bin distribution.

This round did not record the exact liquidity share change, the SOL delta, the transaction
fee, locked rent, or residual fee and reward exposure.

## Meteora DLMM withdraw (#156)

**Status: one funded mainnet removal is recorded.** Kernel ran it on the #156 head
`19473131186768189a2ca684e86b90d545f18ce1`, before that branch was updated. On that code,
open and close still refuse meteora (#144).

The pair is USDC/USDT `ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq` on mainnet. Position
`8KasnSHnqFGbBsj9rJUrVBue8x9s2BbqbT1URSFAvfyM` already existed. The owner is
`E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f`. `maxSlippageBps` was 50. Both sends use
those accounts and that cap.

The partial removal used `bps` 2500. Signature
`5jGAC579o7M8zMmusJvnC7WJNhx6ywDodrVqdW43XpV2bP1UT3qpY8ZhohNyDz2gpigZJiame78SQvpG1qFvJZfm`.

- simulation quote `estA` 965122 and `estB` 989012, raw
- liquidity `144030935790571124226517579` → `108023201842928343169888189`
- position USDC 3.860492 → 2.895370, USDT 3.956059 → 2.967047
- wallet USDC 9.844564 → 10.809686 (+0.965122), USDT 7.383163 → 8.372175 (+0.989012)
- SOL −0.000105, about 105000 lamports of fee

The full removal used `bps` 10000. Signature
`3fjnnFcqtB9u3qCdVTWLMxW2xFJ8eJ6foDXK3nCAwX761BYwHDhFhSTxZinecWR55aHbY88MbaXTeXz7Z4oMyEaz`.

- liquidity share 0
- position USDC 0, USDT 0
- wallet USDC 10.809686 → 13.705056 (+2.895370), USDT 8.372175 → 11.339222 (+2.967047)
- SOL −0.000105, about 105000 lamports of fee

The two recorded wallet deltas sum to +3.860492 USDC and +3.956059 USDT.

The full exit has no recorded simulation `estA` or `estB`, and no `min_withdraw_x` or
`min_withdraw_y` floors. Residual fee and reward were not measured. The removal is
`NoShrinkBoth` and does not claim fees.

The PositionV2 account may still exist empty. Full unwind and close of this position are
not this round. A later round opened and closed a different position. That round is
[Meteora DLMM open to close (#144)](#meteora-dlmm-open-to-close-144).

## Meteora DLMM open to close (#144)

**Status: one funded mainnet open, two deposits, withdraw, and close is recorded.** Kernel ran it
on the #171 head `4e11eb8d640b41147c5f96c67a536dfe5444ff5c`. #171 has not merged. This note
does not claim Surfpool coverage.

The pool is USDC/USDT `ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq` on mainnet. The owner is
`E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f`. Position
`9bebk4KxuSB9xg2zaKst5cfVxBhJmrxDDy1CqpKeuxuX` was opened in this round and closed after the
withdraw. The open used `activeId` 1, `lowerBinId` -1, and `width` 5. Deposit and withdraw
used `maxSlippageBps` 50. The named deposit caps were 1 USDC and 1 USDT, 1000000 base units
each.

Open. Signature
`4kB6n1r5r6FaFADb3gwFzrRG4yiXTZTb1KXY3YwxsmLSeA93oJH3LGzu7v5RkyWhPrViNi1phvUTceSwGX5w2utd`.
Simulation compute units 10030. SOL −0.04200984, recorded as rent.

Two deposits landed about 36 seconds apart. Each call set `amountX` 703250 and `amountY`
999993, both within the named 1000000 caps. Each wallet transfer was −703249 USDC and
−999991 USDT.

The first deposit signature is
`5UUmAgf52LQ35miTBF6NcUP2EwM5SvAJgsrD2Uud9TYD7rGAZRzUTdfpBEP6vRyeh3oAg8YGKBSU481d8ppPZMw3`.
Simulation compute units and the venue quote were not recorded for this send.

The second deposit signature is
`2fSMieCgZCzmMtmfqsfUMfVZQAq8M8UjiRWphKLY2PZ4d9BVbzau1YHwqpkHKdh6pV9YNb3K7hKp5p8X1iX9DybT`.
It used the same `amountX`, `amountY`, and wallet transfer. Simulation compute units were
48577. Venue `requiredA` was 703249 and `requiredB` was 999991, equal to that wallet transfer.

The two wallet transfers sum to −1406498 USDC and −1999982 USDT.

Withdraw. Signature
`659VgBqNiZ9ic27Rm9kkc3zYsQRWUEAxNgo7HquBrJvsK54iqjM3vxaYzNr7bSXh9fLUQMMiQc7h76vALunbZH11`.
Simulation compute units 45689. The withdraw returned essentially that combined deposit
transfer. Exact withdraw token amounts were not recorded. `bps`, `estA`, `estB`,
`min_withdraw_x`, and `min_withdraw_y` were not recorded.

Close. Signature
`2cqDXY74xB2LymtVw2T1wuUceaXRhV86KjzZk7pZ66bsbUfsRfaW9UsZoXhGU2vkBT9XhdASdMyY7Xt5drux2DzF`.
Simulation compute units 6364. SOL +0.04179484, recorded as rent returned. The position
account was closed.

From before the open to after the close, the wallet token net is +18 USDC and −23 USDT base
units. The recorded net SOL fee is −0.00053. That figure is not the ~0.057 SOL rent estimate.
This note does not derive the net by subtracting the open and close SOL lines. Deposit and
withdraw SOL deltas were not recorded. Residual fee and reward were not measured.

## Deposits into an existing position (#30)

Orca and Raydium. The Meteora funded round is
[Meteora DLMM deposit (#154)](#meteora-dlmm-deposit-154).

`solana_liquidity_simulate_deposit` / `solana_liquidity_execute_deposit` and
`solos liquidity simulate-deposit` / `deposit` add liquidity to one explicitly identified
existing position. Prerequisites are the read prerequisites **plus** a funded signer: the
signer must hold the position NFT, own token accounts for both pool mints with at least the
budgeted amounts, and the named pool must be the pool the position references. The position
must already exist — solOS never creates a position, selects a range, or rebalances.

Offline coverage: seeded Surfnet suites drive the real executor over the real RPC (build,
guards, budget-fit quote, instruction assembly, exact-transaction simulation, zero sends on
failure), and locally decoded fixture transactions prove the encoded max spends and the
pool/position/authority/tick-array accounts. What they cannot prove is live pool behavior;
that is what this QA round is for.

**Status: live-checked (#97 QA round).** ADR-0022 forbade a live deposit/open without a
checked exit path; the #97 QA round deposited 0.05 SOL into an operator-provisioned test
position and removed it again through the #31 tools (signatures and reconciliation in PR
#97). Rerun this round with a tiny stated budget on an operator-provisioned test position:

1. Read the position before (`solos liquidity position`) and record both token balances of
   the signer.
2. `simulate-deposit` with the chosen budgets; record the `venueQuote` — the quoted
   liquidity, the required amounts, and the encoded spend bounds (quoted amounts plus
   slippage, capped by the budgets) — then `deposit` and record the signature, fees paid,
   and compute units.
3. Read the position after: raw liquidity must have grown by exactly the quoted amount, and
   the underlying amounts by at most the budgets (delta per token = spent). Both signer
   balances must have dropped by no more than the budgets; unused funds stay in the wallet.
4. Remove the test liquidity with #31's tools and reconcile both tokens, rent, and fees back
   to the pre-round state within the stated tolerance. Record everything in the QA report.

Never report a deposit QA as passed from fixture runs, and never spend beyond the stated
budget.

## Bounded removals from an existing position (#31)

Orca and Raydium. The Meteora funded round is
[Meteora DLMM withdraw (#156)](#meteora-dlmm-withdraw-156).

`solana_liquidity_simulate_withdraw` / `solana_liquidity_execute_withdraw` and
`solos liquidity simulate-withdraw` / `withdraw` remove a bounded percentage of one
explicitly identified existing position's current liquidity. Prerequisites are the read
prerequisites **plus** a funded signer: the signer must hold the position NFT, and token
accounts must exist for every side the position is quoted to pay (a missing receiving
account for a side owed nothing is created idempotently by the driver; one owed tokens is a
typed rejection). `bps` is the fraction of the position's CURRENT liquidity: 1..10000, where
10000 removes all liquidity now held. Fractional liquidity units round down; a removal that
computes to zero liquidity is rejected before anything is built.

Offline coverage: seeded Surfnet suites drive the real executor over the real RPC (guards,
custody, bps fraction, slippage-bounded minimums, instruction assembly, exact-transaction
simulation, zero sends on failure), and the decoded simulated wire instruction proves the
removed liquidity amount and both minimum receipts the caller signed up for. What they
cannot prove is live pool behavior; that is what this QA round is for.

Reconciliation for the QA report — every removal round records:

1. **Before**: the position read (raw liquidity, underlying A/B amounts) and the signer's
   token A and B balances, plus SOL balance.
2. **Intent**: `bps` and `maxSlippageBps`; the simulate output's `venueQuote` — the
   planned liquidity and quoted amounts, plus the exact minimum receipts encoded in the
   instruction (these are the reconciliation floor for step 3).
3. **After**: the signature, fees paid, compute units; the position read (raw liquidity
   must have dropped by exactly the planned amount); the signer's token A/B balances (delta
   per token must meet the encoded minimum recorded in step 2. A side may pay MORE than the
   pre-send quote — the instruction encodes no maximum, and a favorable price move between
   quote and send is a valid removal, not a failure: record the pre-send quote and the
   actual deltas side by side and explain any excess by the price move).
4. **Nonprincipal receipts, distinct from principal**: transaction fee(s) and priority fee
   (SOL), plus — only when the driver created a missing receiving account — the ATA rent
   (documented in the tool descriptions as a protocol-mandated transfer). Fees and rewards
   accrued inside the position are NOT claimed by these tools and must not be counted as
   removed principal; #29 reads exclude them.
5. **Remaining exposure**: what is still in the position (e.g. a partial removal's leftover
   liquidity, or any unclaimed fee/reward balance), stated explicitly.

A full removal (10000 bps) must leave a valid zero-liquidity position — still readable by
`solos liquidity position`, NFT intact, never closed. Never report a removal QA as passed
from fixture runs, and never spend beyond the stated budget.
