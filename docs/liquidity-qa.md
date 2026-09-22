# Orca Whirlpool LP positions live QA

Offline tests exercise the real adapter, CLI, and MCP server against a seeded offline
Surfnet: raw Position (216 bytes) and Whirlpool (653 bytes) accounts written under the pinned
program `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` with the `surfnet_setAccount`
cheatcode, decoded from the pinned Orca IDL. They prove the decode/guard/custody/math
behavior, not what a live pool holds. Live QA compares solOS output with the same pool state
seen through a second client.

**Status: blocked.** A live read needs operator prerequisites that CI does not have: an RPC endpoint and an existing
operator-owned Whirlpool position with its NFT in the operator's wallet. solOS reads are
public — no credential is provisioned anywhere; the only configuration is `SOLANA_RPC_URL`.
Live credentials and wallets belong only in the operator or approved QA environment, never
in issue comments, tool inputs, or implementation sandboxes.

## What to compare once an operator position exists

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

Record live QA as `blocked` until the prerequisites above exist. Never report it as passed
from fixture runs: seeded-surfnet suites prove adapter behavior, not venue state. The first
live QA round runs from the operator environment against a real RPC with an operator-owned
position; no funded transaction is involved (read-only slice).

## Deposits into an existing position (#30)

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
