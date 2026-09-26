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
Withdraw, open, and close still refuse meteora with `LiquidityUnsupportedProtocol` before
any network access. The funded deposit round is
[below](#meteora-dlmm-deposit-154). Owner enumeration is a separate zero-spend round.

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
the requested owner"). `withdraw` and `simulate-withdraw` with `--protocol meteora` still
fail `LiquidityUnsupportedProtocol` before any account read. Open and close do the same.
The deposit round is [below](#meteora-dlmm-deposit-154).

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
matches is `LiquidityEnumerationIncomplete`. Withdrawals stay refused.

## Meteora DLMM deposit (#154)

**Status: one funded mainnet deposit is recorded.** Kernel ran it on the #154 head
`87b514be86046b23d1412e26481138804ad33ae2`. Withdraw, open, and close still refuse meteora.
Gui asked to recuperate these funds after the track. That cleanup is planned and was not
part of this round.

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

Asymmetric fill is expected for this bin distribution.

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
