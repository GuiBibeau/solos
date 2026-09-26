# Liquidity

Part of the [tool reference](index.md).

## Orca Whirlpool and Raydium CLMM LP positions

Reads: `solana_liquidity_get_position` (MCP) and `solos liquidity position --protocol orca|raydium
--position <position-account> [--owner <address>]` (CLI) read one existing LP position and
return the shared `LpPosition` contract:

- **`position` is the protocol position account** — the Whirlpool position PDA on orca, the
  `PersonalPositionState` PDA on raydium — never the position NFT mint and never the pool
  (ADR-0022). There is no mint-based inference and no fallback. Unknown protocol values fail
  input validation (`LiquidityInputInvalid`) before anything else.
- **What each venue supports.** orca: read, deposit, withdraw. raydium: read, deposit, withdraw,
  and opening and closing a position — the only venue whose position lifecycle solOS encodes, so
  an open or close naming any other protocol is refused before any RPC. meteora: point reads,
  owner enumeration, and deposit into an existing position. There is no `liquidity list`
  command; `solos portfolio state` is the enumeration path. Withdraw, open, and close still
  refuse meteora with `LiquidityUnsupportedProtocol` before any network access.
- **Ownership is proven, never assumed.** Whirlpool positions are tokenized: the owner is
  whoever holds the position NFT. solOS requires custody of the position NFT (one token
  account, amount 1, either token program) for the requested owner — an omitted owner means
  the configured signer. A transferred NFT therefore reads as `LiquidityPositionUnavailable`
  ("owner does not hold the position NFT"), never as a zero holding.
- **Exact units.** `liquidity` is the raw u128 share as a decimal string; `tokenA`/`tokenB`
  amounts are the underlying principal in base units at the pool's current Q64.64 sqrt price,
  computed with the pinned Orca math (`@orca-so/whirlpools-core` 3.1.1, zero dependencies),
  floor-rounded, BigInt end to end — never a JS Number. Decimals come from the pool's mint
  accounts (the Whirlpool account stores none). An owned zero-liquidity position is a
  **successful zero read** ("0"/"0"). `valueUsd` is always null: ADR-0022 prices no LP
  principal until both components are valued.
- **Corrupt state is typed.** Account data is decoded from the pinned Orca IDL
  (`@orca-so/whirlpools-sdk` 0.22.0 artifact, program metadata 0.9.0) only after three
  guards: owner program `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc`, exact size (Position
  216, Whirlpool 653), and the 8-byte Anchor discriminators. Missing accounts, impostor
  owners, wrong layouts, foreign-owned positions, and missing/corrupt referenced pools fail
  `LiquidityPositionUnavailable` with a fixed reason — never silently decoded, never
  fabricated zeros.
- **Bounded owner enumeration.** The port also exposes `listPositions` for a later portfolio
  slice (#34): the owner's token accounts across both token programs are the candidate
  receipts, bounded at 4096 accounts and 256 candidates with 100-account batches; reaching a
  bound fails `LiquidityEnumerationIncomplete` — complete or typed error, never a partial
  array. The ADR-0018 envelope carries `positions`, `perpAccounts: []`, and `receiptMints`
  (the position NFTs).
- **Reads are bounded.** At most four account reads per point read (position, custody,
  pool, mints), each with an aborting deadline, one attempt, no retries, no off-chain
  fetches. Nothing is deposited, withdrawn, claimed, rebalanced, signed, or sent.

```sh
SOLANA_RPC_URL=... bun run solos liquidity position --protocol orca --position <position-account>
SOLANA_RPC_URL=... bun run solos mcp call solana_liquidity_get_position --args '{"protocol":"orca","position":"<position-account>"}'
```

Operator QA requires an RPC endpoint and an operator-owned position. **The read-only round is
done** — run 2026-09-25 through both the CLI and a real stdio MCP child, which returned identical
JSON. The funded add/remove round is still outstanding, blocked on the wSOL funding gap for a
wallet holding native SOL (#126) or on provisioning a funded wSOL account outside solOS. See
[liquidity QA](../../liquidity-qa.md).

### Deposits into existing positions

`solana_liquidity_simulate_deposit` / `solana_liquidity_execute_deposit` (MCP) and
`solos liquidity simulate-deposit` / `solos liquidity deposit` (CLI) add liquidity to one
explicitly identified existing Orca or Raydium position — `--pool <pool> --position
<position-account> --amount-a <base-units> --amount-b <base-units> [--max-slippage-bps 50]
[--wrap-sol]` plus `[--skip-simulation]` on `deposit`. The existing-position prerequisite is absolute: the
position account must already exist, the signer must hold its NFT, and the named pool must
be the pool the position references — nothing creates a position, selects a range, or
rebalances.

Meteora uses these commands with the contract in
[Deposits into an existing Meteora position](#deposits-into-an-existing-meteora-position).

- **Budgets are maxima, on chain.** `amountA`/`amountB` are maximum spends in the pool's
canonical mint order (at least one positive). The executor computes the largest liquidity
both budgets can fund at the current price — rounding down, never reinterpreting a maximum
as an exact spend — and encodes spend bounds at the quoted amounts **plus the requested
slippage tolerance, capped by the budgets**, in the instruction's `token_max_a` and
`token_max_b`, which the Whirlpool program enforces (`TokenMaxExceeded`): a price move that
would overspend either bound aborts the transaction. A tighter tolerance therefore accepts
less price drift; with the budgets it can never spend more than requested. Unused funds
stay in the wallet.
- **Native SOL is wrapped only when asked.** Most concentrated liquidity is SOL-paired, and the
venues take wSOL, not native SOL. `wrapSol` (CLI `--wrap-sol`) defaults to **false**: left
alone, a wSOL side that is not already funded is refused, because moving native SOL the caller
never named can strip the balance that pays fees and rent, and that failure is silent. Asked
for, the wrap covers **exactly the shortfall against the quote** — never the whole budget — and
lives in the same transaction as the spend: create the account if absent, transfer, `SyncNative`,
deposit, close. A failure anywhere fails all of it, so no state exists in which SOL sits wrapped
because a deposit did not land. A **pre-existing** wSOL account is topped up and never closed:
its rent is the caller's. Note the other direction is not covered — a removal pays into the wSOL
account and nothing unwraps it, so proceeds from a SOL-paired position arrive wrapped.
- **One-sided adds work.** With the price below the position's range only token A is
required (token B's budget is ignored); above the range, only token B. In range, budgets
are two-sided: a zero budget on one side computes zero liquidity and is rejected. A
missing funding account on a side the quote needs nothing from is created idempotently
(`createIdempotent`, rent paid by the signer); a missing account on a side the quote needs
is still a typed rejection.
- **Custody is passed through.** The instruction names the actual token account that holds
the position NFT — not assumed to be the derived ATA. Wrong pool, a position account that
is not its mint's PDA, corrupt pool tick spacing, token-2022 mints, insufficient
balances, and zero-liquidity outcomes all fail `BuildRejected` (or the liquidity slice's
input errors) before anything is signed or sent.
- **Execution is bounded.** `skipSimulation` defaults false; a failed simulation, rejected
build, or expired blockhash sends nothing, and there is never a re-send after an ambiguous
submission.

```sh
SOLANA_RPC_URL=... bun run solos liquidity simulate-deposit --protocol orca --pool <pool> \
  --position <position-account> --amount-a <base-units> --amount-b <base-units>
SOLANA_RPC_URL=... bun run solos mcp call solana_liquidity_simulate_deposit \
  --args '{"protocol":"orca","pool":"<pool>","position":"<position-account>","amountA":"…","amountB":"…"}'
```

Live deposit QA stays **blocked** until #31 (bounded removals) exists and is checked, per
ADR-0022: no live deposit/open without a checked exit path.

## Meteora DLMM position reads

`solana_liquidity_get_position` and `solos liquidity position --protocol meteora --position
<position-account> [--owner <address>]` read one existing PositionV2 and return the same
`LpPosition` shape. A deposit into that position is
[below](#deposits-into-an-existing-meteora-position). Withdraw, open, and close still refuse
meteora with `LiquidityUnsupportedProtocol` before any network access.

- **`position` is the PositionV2 account pubkey**, never an NFT mint and never the pair
  (ADR-0022). `instrument` is that account's `lb_pair`. There is no position NFT.
- **Custody is the `owner` field** at byte 40. It must equal the requested owner; an omitted
  owner means the configured signer. A mismatch is `LiquidityPositionUnavailable` ("position
  owner does not match the requested owner"), never a zero holding.
- **`liquidity` is the sum of non-zero `liquidity_shares`** in the inclusive
  `lower_bin_id`..`upper_bin_id` window, as a decimal string. A non-zero share past that
  window is refused. The sum is an inventory indicator, not a fungible amount, and may pass
  u128 (ADR-0022). An owned all-zero window is a successful zero read (`"0"` / `"0"`).
- **Token amounts come from bin math.** For each occupied bin, token A (mint X) is
  `floor(share * amount_x / liquidity_supply)` and token B (mint Y) is the same with
  `amount_y`, then summed. That is `Bin::calculate_out_amount` at `lb_clmm` commit
  `576919e3e4368e542c402f000b4264724f7f23ec`, BigInt end to end. Decimals come from the mint
  accounts. Unclaimed fees and rewards are omitted. `valueUsd` is null.
- **Corrupt state is typed.** Program `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`.
  PositionV2 is 8120 bytes, LbPair 904, BinArray 10136, each checked for size and then the
  Anchor discriminator. A missing account, a foreign program owner, a bin array with the
  wrong index or pair, or a share above the bin's `liquidity_supply` fails
  `LiquidityPositionUnavailable`. The read loads the position, the pair, the bin arrays that
  hold occupied bins (a window is at most 70 bins, so at most two arrays), and the two mints.
  Nothing is deposited, withdrawn, claimed, signed, or sent.

```sh
SOLANA_RPC_URL=... bun run solos liquidity position --protocol meteora --position <position-account> --owner <owner>
SOLANA_RPC_URL=... bun run solos mcp call solana_liquidity_get_position --args '{"protocol":"meteora","position":"<position-account>","owner":"<owner>"}'
```

The zero-spend read is recorded in [liquidity QA](../../liquidity-qa.md).

### Deposits into an existing Meteora position

`solana_liquidity_simulate_deposit` / `solana_liquidity_execute_deposit` (MCP) and
`solos liquidity simulate-deposit` / `solos liquidity deposit` (CLI) add liquidity to one
existing PositionV2. The flags are the shared deposit flags: `--pool <pair> --position
<position-account> --amount-a <base-units> --amount-b <base-units>
[--max-slippage-bps 50] [--wrap-sol]`, plus `[--skip-simulation]` on `deposit`. `--wrap-sol`
is the same flag as in [Deposits into existing positions](#deposits-into-existing-positions).

- **The position already exists.** `position` is the PositionV2 account. The signer must be
  the `owner` at byte 40. There is no position NFT. The named pool must be the position's
  `lb_pair`. The call does not create a position and does not move `lower_bin_id` or
  `upper_bin_id`.
- **Spend is a signed `LiquidityParameter`.** The instruction is `add_liquidity2` from the
  pinned IDL (ADR-0022). `amountA` and `amountB` are maximum spends in the pair's mint order
  (token X, then token Y). They are signed as `amount_x` and `amount_y` caps, and those caps
  are at most the requested budgets. `bin_liquidity_dist` lists only bins already inside the
  position's window. X is spread over bins at or above the active bin; Y over bins at or
  below it. Each side's 10000 bps are uniform across its eligible bins. Per-bin spends round
  down. The active bin is fit to its reserves, and any unused cap stays in the wallet. A
  quote that buys no shares is rejected before anything is signed. The two sides need not
  fill in the same proportion.
- **Active-bin drift is refused before send.** After the quote, solOS reads the pair again
  and refuses when the active bin has moved more than `ceil(maxSlippageBps / binStep)` bins.
  Zero slippage allows zero bins of movement. That check is not an argument of
  `add_liquidity2` and is not enforced on chain. The on-chain bound is the signed
  `amount_x` and `amount_y` caps.
- **Withdraw, open, and close still refuse meteora** with `LiquidityUnsupportedProtocol`
  before any network access.

```sh
SOLANA_RPC_URL=... bun run solos liquidity simulate-deposit --protocol meteora --pool <pair> \
  --position <position-account> --amount-a <base-units> --amount-b <base-units>
```

The funded round is recorded in [liquidity QA](../../liquidity-qa.md).

### Owner enumeration

There is no `liquidity list` command. `solos portfolio state [--owner <address>]` and
`solana_portfolio_get_state` include meteora beside orca and raydium. The meteora scan is
`getProgramAccounts` on `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`: the PositionV2
discriminator at offset 0 and the owner pubkey at offset 40. Identity is the position
account pubkey. `receiptMints` is empty. A match that does not decode fails the whole
enumeration with `LiquidityPositionUnavailable`, never a skipped account. More than 256
matches fails `LiquidityEnumerationIncomplete` ("owner holds more than 256 candidate
positions"). That bound is per venue. One venue failing fails the portfolio read.
