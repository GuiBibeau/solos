# Kamino lending live QA

Offline tests exercise the real adapter, CLI, and MCP server against a seeded offline
Surfnet: Market (4664 bytes), Reserve (8624 bytes), Obligation and UserMetadata accounts
written under the pinned lending program `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` with
the `surfnet_setAccount` cheatcode, decoded by the pinned `@kamino-finance/klend-sdk`. They
prove the decode/guard/derivation/instruction-order behavior, not what the configured live
market holds. Live QA compares solOS output with the same market state seen through a second
client (Kamino's own app or a block explorer).

**Status: funded mainnet round trip completed (2026-09-23).** Operator approved wallet
`E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f`, mainnet, a 100,000-base-unit
(0.0001 wSOL) deposit and at most 0.05 SOL combined fees/rent. With the private QA RPC,
CLI deposit simulation succeeded (farm-user initialization, contiguous reserve/obligation/farm
refreshes, combined deposit and trailing farm-stake refresh). A real stdio MCP child also
simulated the entry successfully. CLI deposit confirmed with signature
`5wTjnjHsZiSVxYTuDiQuijNq8YBVZn4sZqvLofQSg5NFQ77GjLcRBGH6Jpt3vkMYFKw7qgSDcNhLXwoD1eVgxFrr`;
the wallet lost exactly 100,000 wSOL base units and the position read 99,999 underlying base
units. CLI and MCP then both simulated an exit of 99,999 base units successfully (86,718
receipt units, zero new rent). CLI withdrawal confirmed with signature
`3879VpQdTXP6MUT5xy9pRCdfbbuHDR1uLB2MdqECLFVLxDVZ5r7sm5zKjHLY7Sn3qBfNnbFQmtaqK6ybRfSdRjcP`.
Afterwards the wallet had received 99,999 wSOL base units and the position read zero.

Observed balances (lamports, wSOL base units): before entry `1,832,102,216 / 49,999,999`;
after entry `1,803,241,816 / 49,899,999`; after exit
`1,820,873,576 / 49,999,998`. The SOL changes were −28,860,400 at entry and +17,631,760
at exit, net −11,228,640 lamports (0.01122864 SOL), below the approved 0.05 SOL cap.
The entry quote included 28,854,400 lamports rent and a 5,000-lamport base fee, before
priority fees. Some SOL returned during withdrawal, but balance reads alone cannot allocate
that return precisely between rent refunds and other transfers or identify any still-locked
rent. The net wSOL difference was one base unit (one-billionth wSOL); the position was zero.
No RPC credentials were recorded or committed, and no retry or skipped simulation occurred.

The instruction still encodes collateral units, not an on-chain minimum underlying receipt:
read-time exactness and simulation do not guarantee a future fill if the exchange rate moves
before inclusion. The venue configuration is `KAMINO_LENDING_MARKET` (env) or the solOS default;
operator credentials remain private. Future funded rounds require their own specific approval.

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
