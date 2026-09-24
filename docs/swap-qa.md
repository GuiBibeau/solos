# Jupiter swap execution live QA

Offline tests exercise the real adapter, executor, CLI, and MCP server against a loopback
Jupiter V2 `/build` fixture and an offline Surfnet: envelope and instruction validation, v1
assembly and wire decoding, zero-send guarantees on every refusal, and honest domain failures.
They prove what solOS builds and refuses, not what a funded swap earns. Live QA spends real SOL
and belongs to the maintainer, after `solos swap simulate` says the exact transaction is sound.

**Status: funded reliability round pending.** Offline integration proves the bounded pre-sign
route rebuilds and zero-send safety; it cannot prove live fill reliability. The 2026-09-24
0.19 SOL mainnet attempt did not send: one signed simulation exceeded the old 16 MiB loaded-data
cap, and another execute obtained a new build with an elevated taker repeat that pre-sign
validation rejected. Local tests cover both fixes, but live acceptance must be recorded here
separately, with confirmed signatures and reconciled balances, before calling them verified.
Factory/CI sandboxes never contain a mainnet signer, RPC URL, or Jupiter build credential.

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
   - The taker's SOL decreased by at most `amount + fees + the rent-exempt minimum of every token account this build created`. On a fresh signer the execute's idempotent create makes the taker the payer for the new destination ATA, and its rent stays locked there after cleanup — so the first hop's SOL delta legitimately includes that rent. A decrease beyond that bound is a defect — record the signature and stop.
   - The USDC ATA (created by the build's idempotent ATA instruction, owned by the taker) holds an amount within the recorded slippage of the execution-time market rate. The submitted transaction's own `otherAmountThreshold` was already enforced by the Jupiter route program on-chain — a fill below it would have failed the transaction — so a confirmed signature proves min-out for the executed build. To check the received amount against the market independently, immediately re-run `solos swap quote` for the same pair and confirm the received amount sits within the recorded 50 bps of that fresh quote's output. Never treat the earlier simulate step's `otherAmountThreshold` as the execute's bound: a fresh build between the two calls may legitimately quote lower.
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
- The bounded fresh-build retry is **before signing only** and only for a writable taker repeat.
  A malformed build, failed simulation, or ambiguous submission does not retry. Never retry a
  failed submission by hand without investigating its signature; it may still land.
