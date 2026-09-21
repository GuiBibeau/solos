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

**Status: blocked until #31 (bounded removals) is live and checked.** ADR-0022 forbids a
live deposit/open without a checked exit path. Once #31 ships, run this round with a tiny
stated budget on an operator-provisioned test position:

1. Read the position before (`solos liquidity position`) and record both token balances of
   the signer.
2. `simulate-deposit` with the chosen budgets; record the quoted liquidity, the required
   amounts, and the encoded spend bounds (quoted amounts plus slippage, capped by the
   budgets), then `deposit` and record the signature, fees paid, and compute units.
3. Read the position after: raw liquidity must have grown by exactly the quoted amount, and
   the underlying amounts by at most the budgets (delta per token = spent). Both signer
   balances must have dropped by no more than the budgets; unused funds stay in the wallet.
4. Remove the test liquidity with #31's tools and reconcile both tokens, rent, and fees back
   to the pre-round state within the stated tolerance. Record everything in the QA report.

Never report a deposit QA as passed from fixture runs, and never spend beyond the stated
budget.
