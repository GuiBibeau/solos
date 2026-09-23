# Kamino lending live QA

Offline tests exercise the real adapter, CLI, and MCP server against a seeded offline
Surfnet: Market ( 2424 bytes), Reserve (8624 bytes), Obligation and UserMetadata accounts
written under the pinned lending program `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` with
the `surfnet_setAccount` cheatcode, decoded by the pinned `@kamino-finance/klend-sdk`. They
prove the decode/guard/derivation/instruction-order behavior, not what the configured live
market holds. Live QA compares solOS output with the same market state seen through a second
client (Kamino's own app or a block explorer).

**Status: live round trip blocked (2026-09-23).** The operator-authorized mainnet QA wallet
`E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f` used public mainnet RPC, then the
operator's local QuickNode QA RPC, to read the Kamino Main Market wSOL reserve and simulate a
100,000-base-unit (0.0001 wSOL) deposit via CLI and a real stdio MCP child. Both CLI and MCP
reported the same failure against QuickNode; withdrawal simulation correctly rejected the
absent supply obligation. No RPC credentials were recorded. The oracle-account and empty-obligation refresh errors were
found and fixed with regression coverage. The next simulation reached the combined deposit
instruction and failed `IncorrectInstructionInPosition` (6051): the reserve requires a
`RefreshFarmsForObligationForReserve` instruction before the obligation refresh. The simulator
sent **zero transactions**; no SOL/wSOL or rent was spent, no signature exists, and the
position is still zero. The farm refresh/initialization path, paired withdrawal and actual
post-confirmation credits have NOT been verified. Do not deposit real funds until this is
implemented, simulated successfully, and the exit path is checked. Live deposit/withdrawal QA
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
- The signed wire decodes to the pinned SDK sequence — refreshReserve,
  initUserMetadata, initObligation, refreshObligation, then the combined deposit whose
  data is the discriminator plus the exact u64 base-unit amount, little-endian.
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
