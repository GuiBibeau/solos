# Jupiter swap execution live QA

Offline tests exercise the real adapter, executor, CLI, and MCP server against a loopback
Jupiter V2 `/build` fixture and an offline Surfnet: envelope and instruction validation, v1
assembly and wire decoding, zero-send guarantees on every refusal, and honest domain failures.
They prove what solOS builds and refuses, not what a funded swap earns. Live QA spends real SOL
and belongs to the maintainer, after `solos swap simulate` says the exact transaction is sound.

**Status: blocked.** A live swap needs operator prerequisites that do not exist in the factory
or CI sandboxes: a funded signer (`SOLOS_SIGNER_PRIVATE_KEY` / `SOLOS_SIGNER_KEYPAIR_PATH` /
`SOLOS_PROFILE`) and a mainnet `SOLANA_RPC_URL` — the factory holds no signer, RPC URL, or
`JUPITER_API_KEY`. The stored Jupiter credential must also carry `/swap/v2/build` permission
(keyless access returns 200 while a stored key has answered 403; reconcile the endpoint
permission before QA). Live QA is reported blocked, never passed.

## Protocol: small-budget SOL -> USDC -> SOL, simulate first

1. **Prepare and record.** Fund a disposable signer with a small budget (start at 0.05 SOL
   total). Record the address, the UTC time, and the pre-balances:

   ```sh
   SOLANA_RPC_URL=... bun run solos wallet address
   SOLANA_RPC_URL=... bun run solos wallet balance
   ```

2. **Simulate first — never skip.** One hop at a time, exact base-unit amounts:

   ```sh
   SOLANA_RPC_URL=... JUPITER_API_KEY=... bun run solos swap simulate \
     --input-mint So11111111111111111111111111111111111111112 \
     --output-mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
     --amount 10000000 --slippage-bps 50
   SOLANA_RPC_URL=... JUPITER_API_KEY=... bun run solos mcp call solana_swap_simulate_swap \
     --args '{"inputMint":"So11111111111111111111111111111111111111112","outputMint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"10000000","slippageBps":50}'
   ```

   The result echoes the intent, reports `unitsConsumed`, and carries the program logs. Record
   them. Every simulate fetches a fresh build; nothing from this step is ever submitted later.

3. **Execute one hop.** Re-run the same intent as an execute, with `--skip-simulation` omitted
   (default false) so the exact signed transaction is simulated once more immediately before the
   single submission:

   ```sh
   SOLANA_RPC_URL=... JUPITER_API_KEY=... bun run solos swap execute \
     --input-mint So11111111111111111111111111111111111111112 \
     --output-mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
     --amount 10000000 --slippage-bps 50
   ```

   Record the returned `signature`. Exactly one submission happens per call; a failure is an
   honest `TransactionFailed` carrying that signature, and nothing is retried.

4. **Verify on-chain outcomes.** After each hop and at the end, re-read balances and compare:
   - The taker's SOL decreased by at most `amount + fee`; with the local policy the priority fee
     is capped (100 000 lamports) on top of the base fee.
   - The USDC ATA (created by the build's idempotent ATA instruction, owned by the taker) holds
     at least the simulate step's minimum output, i.e. `otherAmountThreshold`
     = `floor(outAmount x (10000 - slippageBps) / 10000)` — the min-out compliance bound.
   - The cleanup closed only the ATA that was absent during preflight and created by this exact
     build, returning its rent to the taker. No temporary wSOL residual should remain.
   - Any residual is only ever dust from rounding at the recorded slippage; residuals beyond the
     bound are a defect — record the signature and stop.
5. **Reverse hop.** Repeat steps 2-4 with input USDC (the ATA from step 4) and output wSOL, then
   confirm the round trip's total cost: fees plus slippage against the recorded pre-balances.
6. **Refusals stay refusals.** Re-run step 3 once with a deliberately stale intent (an amount of
   zero after spending, or a revoked key) and confirm it exits non-zero with the tagged error
   and an unchanged balance — zero-send behavior holds live, not only in fixtures.

## Never do

- Never pass `--skip-simulation` in QA: simulation is the zero-send safety gate.
- Never run the two hops from a stored quote — there is no such path; every call builds fresh.
- Never put keys in tool arguments or shell history beyond the temporary export shown above.
- Never retry a failed submission by hand without re-simulating; a `TransactionFailed`
  signature may still land.
