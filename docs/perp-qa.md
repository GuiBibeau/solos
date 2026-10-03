# Phoenix Perps live QA

Offline tests exercise the real adapter, CLI, and MCP server against loopback HTTP fixtures at
`PHOENIX_BASE_URL`. They cannot establish what a live registered account holds. Live QA
compares solOS output with the Phoenix UI for an operator account.

**Status: #101 onboarding and #102 collateral-only round trip validated on mainnet; funded trading QA remains blocked.** The operator's
trader (PDA index 0, subaccount 0) is registered with immediate trading and deposit permissions,
but currently has zero equity. A fresh, separately approved collateral top-up and a verified
#28 reduce-only exit path are prerequisites for any funded open/read/close/read QA. Reads themselves are public, so no credential
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
The pinned SDK TypeScript builder example uses v0 (Rust uses legacy) and declares Bun >=1.4.2.
The original solOS v1 submission was inconclusive. The onboarding-only wire follows the pinned
v0 example under ADR-0025; a subsequent permissioned v0 submission **confirmed on mainnet**.
A `cold` registered trader with immediate permissions is onboarding-ready even without collateral;
`ready` never means its balance suffices to trade. Never auto-retry an ambiguous submission.

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
unknown. The new code preserves a Phoenix HTTP status or invalid-response signal if received;
it uses the pinned v0 builder wire instead of v1, but neither change proves why this attempt
failed. A subsequent **read-only** simulation of the pinned v0 wire on the configured RPC passed
at 28,426 compute units with the same estimated debit; the server has not been asked to submit
this v0 wire. Do not retry a funded send without fresh operator approval and a reconciled prior
send.**

### 2026-09-23 mainnet enrollment validated

With fresh authorization capped at $50, the configured mainnet signer remained at
**1,820,873,576 lamports**, `unregistered`; the earlier v1 signature was still unavailable on
the configured RPC. Jupiter quoted SOL at $116.68750674921928. The explicit v0 simulation
passed (28,426 compute units) and estimated **27,899,040 lamports** wallet debit. One `solos perp
onboard` call confirmed as
[`5gsKNcnPk4gncgFk1F7aYUz9jrcnMF9d5wsxGdNKmRyCDsimfMZYrBpCar5QUgMUujrnpU6BaNJ7WfGLAqTijpoc`](https://explorer.solana.com/tx/5gsKNcnPk4gncgFk1F7aYUz9jrcnMF9d5wsxGdNKmRyCDsimfMZYrBpCar5QUgMUujrnpU6BaNJ7WfGLAqTijpoc),
slot **449719124**, on-chain error `null`. Read-only transaction inspection reconciled the
wallet's **−27,889,040 lamports** to **10,000 transaction fees** and **27,879,040 lamports rent**
credited to Phoenix-owned trader `DnNrzdydJpFhtwxZpebGF5ozCajsqpXbPJMKYBvkyWuS` (5,360
bytes). The final wallet balance was **1,792,984,536 lamports**, about **$3.2543** less at the
read-time price, far below the approved $50 ceiling. No USDC was deposited and no position was
opened.

The first status read reported `partial` only because the unfunded account was `cold`; its
required `immediate` permissions were already enabled (Phoenix's pinned capability verifier
checks permissions independently of the activity state). After correcting that readiness test,
`onboarding-status` returned `ready` for the same trader. `perp position --market SOL` returned
flat/zero equity. A second invocation of `onboard` returned `already_ready` and the wallet
balance stayed **1,792,984,536 lamports**: no duplicate transaction or fee. The real stdio
MCP `solana_perp_get_onboarding_status` also returned `ready`; its simulate twin returned
`already_ready` without submitting.

## Explicit collateral transfers (#102) — funded round trip verified

`perp simulate-deposit --amount <USDC-base-units>` and `perp deposit --amount
<USDC-base-units>` use an exact wallet USDC input. `perp simulate-withdraw-collateral
--amount <Phoenix-collateral-token-base-units>` and `perp withdraw-collateral --amount
<Phoenix-collateral-token-base-units>` use an exact collateral-token input, **not** an exact USDC
output. Their MCP twins are `solana_perp_simulate_deposit_collateral`,
`solana_perp_execute_deposit_collateral`, `solana_perp_simulate_withdraw_collateral` and
`solana_perp_execute_withdraw_collateral`. All four target only the configured signer's trader
PDA 0 / subaccount 0. No transfer happens as a side effect of onboarding or trading commands.

The quote's `estimatedOutput` comes from one transaction simulation and is **not a minimum or
guarantee**: the pinned Rise 0.5.26 Ember instructions encode no minimum receipt. Execute always
rebuilds and simulates and ignores `skipSimulation`, compares account identity and trader
sequence before submitting, and never retries an ambiguous submission. On confirmed execution,
read `reconciliation.walletUsdcDelta`, `traderCollateralDelta` and `payerLamportsDelta` for the
**actual** observed changes; a post-confirmation read or mismatch error preserves the signature
for manual investigation. Do not automatically resubmit such an error.

Offline Surfpool tests seed public Phoenix Trader and global account bytes captured with the
read-only `solos dev inspect account-data` command after #101. They verify SDK instructions,
account ownership, exact-input transfer plans, no-send on failed simulation and withdrawal
exposure. A scripted Phoenix program response over a forwarding Surfpool RPC proxy exercises
successful quote, submit and reconciliation paths, **not** execution of the real Phoenix
program; the independent funded round-trip below verifies the pinned live program. Fresh
operator approval is required for future live transfers. Before authorizing a small fixed-input
round-trip, confirm the active signer/RPC, wallet USDC and SOL, Phoenix status, current positions,
withdrawal state and amount budget. The eventual, separately authorized sequence is:
`onboarding-status` / `onboard` if necessary → `simulate-deposit` / explicit `deposit` →
#27 open / read all positions → #28 reduce-only close / read all positions and orders →
optional `simulate-withdraw-collateral` / explicit `withdraw-collateral` / read again. Compare
post-trade residual exposure, wallet USDC and on-chain trader collateral before deciding whether
to withdraw. Record each signature, on-chain fees/rent, pre/post wallet USDC and trader collateral;
do not trade until the separately approved close/exit path exists.

### 2026-09-24 mainnet collateral round-trip validated

The configured RPC returned the prior #101 mainnet enrollment signature. Signer
`E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f` was ready and flat with
**1,792,984,536 lamports**, **0 wallet USDC**, and **49,999,998 wSOL base units**. Initial read-only
simulations uncovered two live/API compatibility issues: exchange metadata lagged the RPC (its
keys are now checked against current on-chain config and derivations instead of a 12-slot age
window), and Rise 0.5.26 omits empty position/order/spline/trigger arrays (now decoded with the
SDK's documented defaults after an independent on-chain flatness check). The **trader-risk**
snapshot retains its own 12-slot freshness limit; an early withdrawal simulation failed stale,
and a later fresh read passed. Neither failure submitted a transaction.

Funding was explicit and bounded. The repo's Jupiter key was found in `.env` (not `.env.local`),
never copied to an issue. Jupiter refused a build that would have closed the signer's existing
wSOL account. Using the official SPL Token CLI with the **same locally verified signer and RPC**,
we unwrapped the full 49,999,998 wSOL base units back to the signer as native SOL; signature
[`21xYHVTWnvAJ1JbkTpjXCfQigAwFAMTzpycELtDmcJxB2BFkgkgMmvUc1ghvXT9VR7GzjQfrjcaEzp4oQmJzDFLq`](https://explorer.solana.com/tx/21xYHVTWnvAJ1JbkTpjXCfQigAwFAMTzpycELtDmcJxB2BFkgkgMmvUc1ghvXT9VR7GzjQfrjcaEzp4oQmJzDFLq)
confirmed: **5,000 lamports fee**, 51,488,438 lamports (including 1,488,440 rent) returned
from the closed ATA. A successful `solos swap simulate` preceded one 12,000,000-lamport SOL →
USDC swap, signature
[`X9QdSuacPFztUV3beGaos3xqFJRaadXdKZLVRghEc4gTxU7A49S8CeSdcGTeFhs1ZrMYf8D6GbRtKqCpfRHA7DQ`](https://explorer.solana.com/tx/X9QdSuacPFztUV3beGaos3xqFJRaadXdKZLVRghEc4gTxU7A49S8CeSdcGTeFhs1ZrMYf8D6GbRtKqCpfRHA7DQ),
which credited **1,386,476 USDC base units** for **105,000 lamports fee**. One larger and one
earlier quote/simulation failed safety checks without submitting; no failed swap was retried.

`perp simulate-deposit --amount 500000` succeeded at 39,337 units, estimating 500,000 Phoenix
units and 1,499,440 lamports debit; output was not guaranteed. One explicit `perp deposit`
confirmed at
[`3T5shXcgpuiqcur9xYyEANffFM9ENFspxEWithyy3qjcb3TSWPqUhNU6CzmjjPU2EoF2U3LxbQzWLo85qUYJJUM`](https://explorer.solana.com/tx/3T5shXcgpuiqcur9xYyEANffFM9ENFspxEWithyy3qjcb3TSWPqUhNU6CzmjjPU2EoF2U3LxbQzWLo85qUYJJUM):
**−500,000 wallet USDC**, **+500,000 trader collateral**, **−1,494,440 payer lamports**. The
read-only transaction inspection found **6,000 lamports fee** and **1,488,440 lamports rent**
retained in the new wallet Phoenix-token ATA. The position remained flat, account equity $0.50.

A fresh all-market `simulate-withdraw-collateral --amount 500000` passed at 47,189 units and
estimated 500,000 USDC out, without guaranteeing it. One explicit withdrawal confirmed at
[`2hWGp2vZrG3UxgAx1xoCFCMbMHbSqTFJX1724628h7KGc2ybowLLe7zUvyK8jN1Hzt6yzEM9BGZAyoQX77JaVocS`](https://explorer.solana.com/tx/2hWGp2vZrG3UxgAx1xoCFCMbMHbSqTFJX1724628h7KGc2ybowLLe7zUvyK8jN1Hzt6yzEM9BGZAyoQX77JaVocS):
**+500,000 wallet USDC**, **−500,000 trader collateral**, **−6,000 payer lamports** (all fee).
The final wallet held **1,386,476 USDC base units**, **1,830,862,534 lamports**, no wSOL; the
Phoenix-token ATA remained with zero tokens and retained rent. On-chain trader equity was
**zero**, SOL position was flat, onboarding stayed ready. Total fees for the unwrap, funding
swap, deposit and withdrawal were **122,000 lamports**, plus the **12,000,000 lamports SOL** sold
for USDC; the 1,488,440 lamports of old wSOL ATA rent released were replaced by an equal amount
of retained Phoenix-token ATA rent. No leveraged trade was placed. The real stdio MCP simulate
deposit twin also returned an estimated, non-guaranteed output without sending.

## Bounded Phoenix IOC opens (#27) — offline verification only

`perp simulate-open --market SOL --side long --notional-usd <USD-base-units> --max-leverage <integer> --limit-price-usd <exact-USD>` and `perp open` (same flags, optionally `--skip-simulation`) map to MCP twins `solana_perp_simulate_open` / `solana_perp_execute_open`. Both require a registered, ready trader PDA 0 / subaccount 0 with collateral deposited **separately**. No funding, onboarding or persistent order is hidden in an open. By design this initial safe subset also requires the **entire account** to have zero existing exposure or pending risk; other-market positions and nonzero spot collateral fail closed. The trader-state API returns a zero-balance native SOL spot row for every trader, and only a nonzero balance counts as spot exposure, so the default row neither blocks a flat open nor nulls a flat account's equity. The on-chain asset map and orderbook must agree with the Phoenix API; the risk snapshot is checked after the API response against the current RPC slot. Builds older than 5 seconds or orders expiring beyond 32 observed slots are not sent.

The limit is a maximum buy or minimum sell price, rounded inward to the venue tick. Base-lot quantity rounds down using the *rounded executable price* and the exact 1e6 USD quote-lot cap is encoded in the IOC packet. Requested leverage is checked against both the on-chain market tier and signed, fully-flat trader collateral. Insufficient collateral and absent access reject without sending; **there is no silent leverage clamp**. The CLI and MCP return the existing execution envelope: `confirmed` means the transaction landed, **not** that any base lots filled. An IOC may fill partially or zero; immediately read `perp position --market SOL`, all-market exposure, orders and equity, then compare the observed position to the pre-trade read. Never infer a fill, a closed position or an automatic retry from the signature alone.

Offline Surfpool tests decode the real signed v1 Rise 0.5.26 IOC packet and test no-send on stale/incomplete state, existing exposure, and absent collateral. **Do not run a funded `perp open` yet**: #28's reduce-only close must be implemented and checked first, then an operator must separately approve a small funded budget and an exit plan. The collateral-only QA above did not authorize a trading order. For any future live/provider-backed CLI or MCP check, source both the repo `.env` and `.env.local`, in that order, in the **same shell**, without printing credentials. Do not retry an ambiguous submission. Record signatures and actual exposure/fees from subsequent reads.

## Reduce-only Phoenix IOC closes (#28) — offline verification only

`perp simulate-close --market SOL --limit-price-usd <exact-USD>` and `perp close` (same flags,
optionally `--skip-simulation`) map to MCP twins `solana_perp_simulate_close` /
`solana_perp_execute_close`. Both require a fresh matching Phoenix API and on-chain position
for the configured signer at trader PDA 0 / subaccount 0; zero size is `NoPositionToClose`.
An existing position in another market or outstanding risk fails closed. For a long, the
opposite-side IOC sell is bounded by a **minimum** USD price; for a short, the IOC buy is
bounded by a **maximum** USD price. Ticks round inward and the signed order specifies
`ReduceOnly` plus an exact base-lot cap no greater than the observed absolute exposure.
Simulation uses the same signed wire that execution would submit; failed simulation, changed
position, expired blockhash or expired observed slot cannot send. Skipping simulation never
skips these checks. No fill quantity is returned by `close`.

For a separately approved small funded open/read/close/read test, load both local env files in
order in the **same shell** as each CLI/MCP command (without printing credentials). First record
the signer, RPC/network, balance, SOL fee cap and approved trade budget; read the entire account
and `perp position --market SOL`. Deposit only the explicit approved collateral amount using
`simulate-deposit` then `deposit`, and re-read balances. Simulate bounded open, inspect logs,
then explicitly submit once. **After the open**, read `perp position --market SOL` and all-market
exposure/orders/equity: zero fill means there is nothing to close. For nonzero exposure, choose
an operator-approved limit price; run `simulate-close`, inspect direction, base lots and the
`ReduceOnly` flag, then explicitly `close` once. Immediately read the position **again**, and
all markets and pending orders. Record the signature, confirmed on-chain fee and actual before/
after exposure and equity. `confirmed` is not a fill; a zero or partial fill leaves the recorded
residual. Do not auto-resubmit or claim flat until a subsequent read shows zero exposure and
no outstanding risk. If a signature is known but submission/confirmation is ambiguous, read
its status and state manually; **never retry** until reconciliation. Only consider a separately
simulated collateral withdrawal after fresh all-market flat-risk reconciliation.

Offline Surfpool tests decode the signed v1 SDK instruction and its protocol `ReduceOnly` bit,
check long/short, no-send rejections and simulation races. Scripted confirmation outcomes for
zero/partial/full fills exercise follow-up reads, but **do not execute the Phoenix program** and
cannot prove a funded close on mainnet. Do not perform funded trading until both #27 and #28
are reviewed, merged and checked and a specific live exit plan is confirmed.

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

Enrollment #101 and explicit collateral #102 are validated by the funded confirmations and
reconciliations above. #27 open is implemented and tested offline; funded **trading** QA still requires
#28 close/exit and separate operator approval. Never
claim mainnet trading passed from a collateral-only round trip.
