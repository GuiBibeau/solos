# Kamino lending live QA

Offline tests exercise the real adapter, CLI, and MCP server against a seeded offline
Surfnet: Market ( 2424 bytes), Reserve (8624 bytes), Obligation and UserMetadata accounts
written under the pinned lending program `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` with
the `surfnet_setAccount` cheatcode, decoded by the pinned `@kamino-finance/klend-sdk`. They
prove the decode/guard/derivation/instruction-order behavior, not what the configured live
market holds. Live QA compares solOS output with the same market state seen through a second
client (Kamino's own app or a block explorer).

**Status: deposit simulation passed; live round trip not yet run (2026-09-23).** The mainnet QA
wallet `E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f` simulated a 100,000-base-unit
(0.0001 wSOL) deposit through the native CLI and real stdio MCP child with the operator's
private QuickNode RPC. Both returned `ok: true`: farm-user initialization, contiguous
reserve/obligation/collateral-farm refreshes, combined deposit, and trailing farm stake
refresh all succeeded in simulation. The quote included 28,854,400 lamports of account rent
and a 5,000-lamport signature fee; this was only a quote, not a debit. Earlier simulations
failed on oracle accounts, empty-obligation refresh and then `IncorrectInstructionInPosition`
(6051) until those issues and instruction ordering were fixed. No RPC credentials were
recorded. **Zero transactions were sent; no SOL/wSOL or rent was spent; there is no signature.**
The position is still zero, so a withdrawal against this wallet cannot yet simulate.
Funded entry/exit, actual credited units and rent recovery are NOT verified. Obtain fresh,
specific operator approval and validate the exit before treating this as a completed QA round. Live deposit/withdrawal QA
needs an operator-provided RPC endpoint and a funded signer whose config selects Kamino Main Market. The offline fixture
does not execute the actual lending program and cannot establish that the funded exit works.
Do not deposit funds for QA until the operator checks that a matching exit is available, sets a
small explicit budget, and accepts the exchange-rate movement risk. The protocol withdrawal
instruction encodes collateral units, not an on-chain minimum underlying receipt; solOS checks
that the read-time predicted underlying equals the request and simulates signed bytes, but a
later state change can result in a different actual credit. Confirmation is not a fill claim. The venue configuration is `KAMINO_LENDING_MARKET` (env)
or the solOS default; credentials stay only in the operator environment, never in issue
comments, tool inputs, or implementation sandboxes.

## What the offline suites already prove

- Reserve selection follows the configured market only: the facts seam loads the
  float-rate reserve for the mint from the configured market's own accounts, and the
  executor revalidates the action's market against its configuration (ADR-0019).
- The signed wire decodes to the pinned SDK sequence — optional metadata, obligation and
  farm initialization; then contiguous reserve, obligation and collateral-farm refreshes;
  the combined deposit with the exact u64 base-unit amount, little-endian; then a trailing
  farm stake refresh. Without a configured farm, the farm instructions are omitted.
- Authority, obligation, and source selection: the derived market-authority PDA is
  read-only, the signer's vanilla obligation PDA is the writable destination, and the
  source is the signer's own associated token account.
- A failed simulation sends nothing; rejected plans never even simulate; ambiguous
  submissions keep their signature in a structured failure.

## Paired deposit / withdrawal operator runbook

1. Simulate first (never moves funds), with a small stated USDC amount in base units:

   ```sh
   SOLANA_RPC_URL=... bun run solos lend simulate-deposit --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --amount <base-units>
   SOLANA_RPC_URL=... bun run solos mcp call solana_lend_simulate_deposit --args '{"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"<base-units>"}'
   ```

   Check the venueQuote: `liquidityAmount` equals the request exactly, `estimatedCollateral`
   is the read-time exchange-rate prediction (not a fill promise), `initializeObligation`
   matches the signer's history in the market, and `rentLamports`/`feeLamports` are present.

2. Deposit the same amount, recording the signature:

   ```sh
   SOLANA_RPC_URL=... bun run solos lend deposit --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --amount <base-units>
   ```

3. Compare before/after with a second client: underlying token balance decreased by
   exactly the amount (plus fees), the obligation shows the collateral at the filled
   rate, and `solos lend position` and `solos market price` agree with that state.

4. Before withdrawal, record the wallet's token balance and `solos lend position --mint
   <mint>`. Choose a positive base-unit amount no greater than the observed supply. The
   signer's underlying associated token account must exist. A request may fail when whole
   collateral units cannot predict precisely that underlying amount; choose an exactly
   representable amount rather than using a withdraw-all sentinel. Simulate via CLI and real
   stdio MCP child, inspecting `venueQuote` (receipt units, exchange rate and predicted
   underlying), then withdraw **once**:

   ```sh
   bun run solos lend simulate-withdraw --mint <mint> --amount <base-units>
   bun run solos mcp call solana_lend_simulate_withdraw --args '{"mint":"<mint>","amount":"<base-units>"}'
   bun run solos lend withdraw --mint <mint> --amount <base-units>
   ```

5. Read wallet balance and `solos lend position` again. Record both signatures, fees/rent,
   actual credited base units and residual supply; compare with an independent client.
   Any remaining supply or rounding dust is exposure, not a flat round trip. Do not retry
   an ambiguous submission. A simulation or confirmation alone does not prove redemption.

Record the budget and results in the issue without disclosing credentials. If operator RPC,
signer, supported program access or a safe exit is unavailable, report live QA as blocked.
