# Liquidity

Part of the [tool reference](index.md).

## Orca Whirlpool LP positions and deposits

Reads: `solana_liquidity_get_position` (MCP) and `solos liquidity position --protocol orca --position
<position-account> [--owner <address>]` (CLI) read one existing Whirlpool LP position and
return the shared `LpPosition` contract:

- **`position` is the protocol position account** (the Whirlpool position PDA), never the
  position NFT mint and never the pool (ADR-0022). There is no mint-based inference and no
  fallback: meteora and raydium are enum-valid venues but have no adapter yet, and they fail
  `LiquidityUnsupportedProtocol` before any network access, from the tool's pure check hook,
  the use-case gate, and a defensive gate in the adapter. Unknown protocol values fail input
  validation (`LiquidityInputInvalid`) even earlier.
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
explicitly identified existing Orca position — `--pool <pool> --position <position-account>
--amount-a <base-units> --amount-b <base-units> [--max-slippage-bps 50]` plus
`[--skip-simulation]` on `deposit`. The existing-position prerequisite is absolute: the
position account must already exist, the signer must hold its NFT, and the named pool must
be the pool the position references — nothing creates a position, selects a range, or
rebalances.

- **Budgets are maxima, on chain.** `amountA`/`amountB` are maximum spends in the pool's
canonical mint order (at least one positive). The executor computes the largest liquidity
both budgets can fund at the current price — rounding down, never reinterpreting a maximum
as an exact spend — and encodes spend bounds at the quoted amounts **plus the requested
slippage tolerance, capped by the budgets**, in the instruction's `token_max_a` and
`token_max_b`, which the Whirlpool program enforces (`TokenMaxExceeded`): a price move that
would overspend either bound aborts the transaction. A tighter tolerance therefore accepts
less price drift; with the budgets it can never spend more than requested. Unused funds
stay in the wallet.
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
