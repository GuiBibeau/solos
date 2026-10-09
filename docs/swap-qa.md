# Jupiter swap execution live QA

Offline tests exercise the real adapter, executor, CLI, and MCP server against a loopback
Jupiter V2 `/build` fixture and an offline Surfnet: envelope and instruction validation, v1
assembly and wire decoding, zero-send guarantees on every refusal, and honest domain failures.
They prove what solOS builds and refuses, not what a funded swap earns. Live QA spends real SOL
and belongs to the maintainer, after `solos swap simulate` says the exact transaction is sound.

**Latest local round: passed on 2026-10-08.** The approved $2 SOL -> USDC -> SOL round is
recorded below. Factory and CI environments still need an operator-provisioned funded signer,
mainnet RPC and a Jupiter key with `/swap/v2/build` access before any funded QA.

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
- Never retry a failed submission by hand without re-simulating; a `TransactionFailed`
  signature may still land.

## Local two-dollar round trip 2026-10-08

**Result: two finalized swaps, no token residual and no new locked rent.** The round cost
218,247 lamports (0.000218247 SOL, about $0.025 at the initial $115.8236/SOL price).

The operator approved mainnet wallet `E15BHE3BEGdQ5PwJxe2sMVN1MtKKA5kGXVbAaDeBSJ8f`
(local profile `keychain-qa`): at most 17,267,637 lamports of SOL input, then only the received
USDC back to SOL; 50 bps slippage per leg; 250,000 lamports total network fees; and the CLI's
20,000,000-lamport fee/rent allowance per leg. Both local environment files were sourced for
every live CLI/MCP invocation, without displaying their contents. `solos dev inspect network`
confirmed the mainnet genesis hash. The round ran HEAD
`ba2d217d835a05223283e21f6c543fdc47935aaa` with a dirty working tree: read-only inspection
commands added for this QA and unrelated pre-existing changes. No swap execution code changed.

| Measurement | Before | After SOL -> USDC | After USDC -> SOL |
|---|---:|---:|---:|
| Wallet SOL, lamports | 1,771,928,517 | 1,754,555,880 | 1,771,710,270 |
| Wallet USDC, base units | 0 | 1,998,371 | 0 |

- SOL -> USDC finalized at slot 454,429,908, signature
  `KsacJCoBnq6cY51mp6278BrZ9CosAiNyPHERyqcEDnjWpBjWrSRAa4p2AvWd9AjftWqrNUK92N1e7WMeQmRwkFc`.
  Input was 17,267,637 lamports; receipt was 1.998371 USDC; the fee was exactly 105,000
  lamports. Wallet SOL fell by input plus fee, with zero additional rent. The follow-up quote
  was 1,998,662 USDC base units, minimum 1,988,668; the measured receipt was within 50 bps.
- USDC -> SOL finalized at slot 454,430,099, signature
  `4WPw3UKgPXALkBRBCoVNFLCmcsWQF8adVXe9eUYdb9i7KyLAE6nAU76Z6dFYLJaqV16pKR93fDbwBXmXERhA6rBA`.
  All 1,998,371 USDC base units were spent; 17,259,390 lamports returned gross, with a
  105,000-lamport fee and 17,154,390-lamport net wallet credit. The follow-up quote was
  17,259,233 lamports, minimum 17,172,936; the measured receipt was above that quote.

Network fees totaled 210,000 lamports, below the approved cap. The remaining 8,247-lamport
loss is the trade result across the two fresh routes; its spread/venue-fee split was not
measured. The pre-existing USDC account `DnK1LXA51TSLeLTHhRAL2fJSwshCfNqiaME6xX3m3cwp`
retained its original 1,488,440 lamports of rent. The canonical wSOL account
`BNP6pHgDRwiCNAJa3qfob88HbT9TWqwMFmHinZHTevAG` was absent afterwards. Other token balances
were unchanged. No collateral or position was opened by this round.

CLI previews passed (initial SOL -> USDC 139,233 CU; return 121,277 CU), and a real stdio MCP
SOL -> USDC preview passed at 82,316 CU before the successful first leg. Every execute
reported `simulated: true`; none used `--skip-simulation`. Preview builds are fresh and their
compute figures are not measurements of the submitted builds. CLI and stdio MCP closing
balances agreed. A final zero-amount execute was refused with `QuoteInputInvalid`, exit 1,
and unchanged balances: no signature or additional spend.

### Initial submission expired without landing

The initial first-leg attempt returned `TransactionFailed` after the 75-second confirmation
deadline, carrying signature
`2nzPWLMbagtsJQoSn4R2ifmEYnBYx9hjRAgUEYYEsZkhBf8PghDgetxaSdW3PkgFgkupvo2CQKijxVYBUTRXmUVc`.
No automatic retry occurred. Finalized transaction inspection found no transaction, history
status lookups found no signature, and CLI/MCP balances remained exactly at baseline.

Before retrying, a fresh later blockhash provided an upper expiry bound of block height
432,467,130. A subsequent finalized height of 432,467,288 passed that bound, with the
signature still absent and baseline balances unchanged. The earlier recent-blockhash send
could therefore no longer land. Only then was a fresh simulation and new first-leg execute
performed under the same caps. The expired attempt spent zero SOL and paid zero fees. The
underlying landing failure was not identified; this round does not establish landing reliability.

### Offline verification

The inspection integration suite passed against offline Surfpool: 7 tests, 0 failures.
`solos dev verify --scope unit --json` recorded every step as `ok: true`: line limits, docs,
format, lint, dependency rules, types and 916 unit tests. Its top-level `ok` is false solely
because `dirty: true`; it is not clean-commit PR Evidence. Dependency checks reported five
warnings and zero errors. This does not change the finalized live transaction
reconciliation above. No credentials or raw local environment files are included.
