# Phoenix Perps live QA

Offline tests exercise the real adapter, CLI, and MCP server against loopback HTTP fixtures at
`PHOENIX_BASE_URL`. They cannot establish what a live registered account holds. Live QA
compares solOS output with the Phoenix UI for an operator account.

**Status: blocked.** A funded, registered read needs operator prerequisites that CI does not have:
a Phoenix Perps account registered for the operator's signer
(traderPdaIndex 0, activated), collateral deposited, and — before the later funded open/close
QA (#27/#28) — enough equity to hold a position. Reads themselves are public, so no credential
is provisioned anywhere; the only configuration is `PHOENIX_BASE_URL` (leave it unset for the
production endpoint `https://perp-api.phoenix.trade`). Live credentials belong only in the
operator or approved QA environment, never in issue comments, tool inputs, or implementation
sandboxes.

## Explicit trader onboarding (#101)

The default trader scope is the configured signer with both Phoenix trader indices fixed to zero.
The read-only `bun run solos perp onboarding-status` (or MCP
`solana_perp_get_onboarding_status`) reports `unregistered`, `partial` (registered but
not fully trading-enabled), or `ready`. On an already-ready trader, `onboard` returns
`already_ready` without a registration transaction or fee. A ready trader is not necessarily
funded: collateral deposit is a separate operation (#102).

**Only with explicit operator authorization and an approved SOL fee/rent budget:** verify the
signer and RPC endpoint, then run `bun run solos perp simulate-onboard` and inspect the
on-chain program, trader PDA, fee payer, and simulation logs. A successful simulation is a
prerequisite to `bun run solos perp onboard`. This operation calls Phoenix's official
permissioned build and server co-sign/submit endpoints; if access is denied or its returned
instructions do not match this wallet, it fails closed without sending. No raw API bodies or
private keys are reported. Record the resulting signature, actual fee and rent, and a follow-up
`onboarding-status` read. A confirmed transaction alone is not proof of enabled trading.
The SDK example uses v0 and Bun >=1.4.2; the solOS path constructs and validates v1, but live
server acceptance of v1 and a successful funded registration remain **unverified**. Do not
claim live onboarding passed from the offline tests, and do not auto-retry ambiguous submission.

### 2026-09-23 mainnet onboarding attempt

Operator approved up to $20 of SOL for #101 only. The configured signer was
`E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f`; its starting balance was
1,820,873,576 lamports and its Phoenix status was `unregistered`. A public price read gave
$117/SOL (about 170,940,170 lamports under the cap). Simulation against the configured
`SOLANA_RPC_URL` in the existing `.env.local` succeeded at 28,426 units and estimated a wallet
debit of **27,899,040 lamports** including a 10,000-lamport signature-fee cushion (about $3.26
at that read-time price). This estimate is not an on-chain spend limit.

A **single** `solos perp onboard` attempt returned an ambiguous confirmation timeout with expected
wallet signature `3cDMjM6m3GRPYudp1nUBFTPbTTaaPGaxsXMmLncFsDxxMYNHYZhBKyoJ7m83FSrx4272zt3nRTFFag4qHwvdmqjB`.
Read-only transaction inspection found no confirmed transaction on the configured RPC. Both an
immediate status/balance read and a second read 45 seconds later reported `unregistered` and
1,820,873,576 lamports. **No expenditure or registration was observed; the server-side cause is
unknown. Do not retry a funded send until the response and signature status are diagnosed.**

## What to compare once an operator account exists

1. Pick the signer's trader account (subaccount 0). Run:

   ```sh
   bun run solos perp position --market SOL
   bun run solos mcp call solana_perp_get_position --args '{"market":"SOL"}'
   ```

2. Compare against Phoenix, market by market:
   - `position.side` and the sign: a UI short must arrive as `side: "short"` with a positive
     absolute `amount`, never a negative or unsigned amount.
   - `position.amount` / 10^`decimals` equals the UI's position size in the base token.
   - `position.valueUsd` is null; the UI's "position value" is leveraged notional and must
     never be read as equity.
   - `account.equityUsd` vs the UI's account equity, when the account has an open position or
     spot collateral the snapshot cannot value, solOS reports null by design (ADR-0021): only
     compare when the output is non-null, and treat null as "unknown complete equity", not
     zero.
   - A market with no position on a registered account must return `side: "flat"`,
     `amount: "0"`, and the account equity once.
3. Repeat for a second market so the shared collateral/equity is seen counted once across
   markets, not duplicated per market.

## Reporting

Record live QA as `blocked` until the prerequisites above exist. Never report it as passed
from fixture runs: fixture-backed suites say `mode: fixture` implicitly and prove adapter
behavior, not venue state. The first funded QA round belongs with the #27/#28 prerequisites,
after registration and collateral, run from the operator environment.
