# Swap

Part of the [tool reference](index.md).

## Swap quotes (Jupiter V2, indicative)

`solana_swap_get_quote` (MCP) and `solos swap quote --input-mint <mint> --output-mint <mint>
--amount <base-units> [--slippage-bps 50]` (CLI) fetch an **indicative** quote from Jupiter's
current Swap API V2: `GET {JUPITER_BASE_URL}/swap/v2/order`, authenticated with `x-api-key` from
`JUPITER_API_KEY`. No `taker` is ever sent, so the response is quote-only and its embedded
transaction is null — nothing is signed, built for sending, or submitted, and there is no
/execute call.

- **Setup:** export `JUPITER_API_KEY`. The key is **required to invoke the tool**; it stays in
  the environment, never in tool arguments. The tool always lists — without the key every call
  fails before any HTTP with `QuoteConfigMissing`.
- **Metis-only routing.** Every request carries the documented
  `excludeRouters=jupiterz,dflow,okx`, so quotes come from Jupiter's Metis router only — the same
  routing the self-managed V2 build execution path uses. A response routed by anything else is
  rejected (`QuoteResponseInvalid`).
- **Field and unit mapping.** `inAmount`, `outAmount`, and `minOutAmount` (from the provider's
  `otherAmountThreshold`) are exact decimal strings in base units and are never rounded through a
  JS Number. `routeSummary` carries the `routePlan[].swapInfo.label` hop labels. `priceImpactPct`
  keeps the legacy decimal-ratio convention: the provider's `priceImpact` is percentage points and
  is divided by 100, so 1 percentage point => `"0.01"` (the deprecated provider `priceImpactPct`
  string is ignored). Missing provider fields fail (`QuoteResponseInvalid`); solOS never
  fabricates a zero.
- **Tolerance and route validation.** The tolerance is a maximum loss: the echoed `slippageBps`
  must equal the request, and `minOutAmount` must sit within
  `floor(outAmount x (10000 - slippageBps) / 10000) <= minOutAmount <= outAmount` (BigInt, the
  verified Jupiter floor rounding — live quotes compute `floor(netOut x 9950 / 10000)` at
  50 bps). A threshold above the floor is more protective than requested and stays allowed; a
  threshold below it means more slippage than requested and is rejected; at 0 bps the bound
  collapses to equality. Route plans must span the requested pair with no traversal-order
  assumptions (Metis splits and merges mid-route): every hop must be executable from the input
  mint, the output mint must be produced, the hops ending at the output must jointly gross at
  least the quoted net output (fees make gross exceed net; equality is not required), and the
  validated hop data is retained in the non-executable `raw` payload. Redirects must stay on
  the request's origin; a cross-origin redirect is refused before the other host is contacted
  or receives the key.
- **`expiresAt` is a local 30-second TTL**, the receipt time plus 30 000 ms. It is when solOS
  stops presenting the quote as usable, **not** a provider price guarantee — V2 documents no
  quote TTL.
- **Indicative only.** The quote is never a promise to execute: an execution or simulation
  obtains its own fresh build (see the next section). Nothing is ever executed from a stored
  quote.
- **Errors:** `NoRouteFound` (empty route plan, or the documented
  400 `"Failed to get quotes"` body), `QuoteInputInvalid`, `QuoteConfigMissing`,
  `QuoteAuthFailed` (401/403), `QuoteRateLimited` (429), `QuoteHttpError` (other non-2xx),
  `QuoteTimeout`, `QuoteNetworkError`, `QuoteResponseInvalid`. **One attempt, 10-second
  deadline** covering headers and body; never retried. Error payloads never contain the key, a
  raw provider body, or the endpoint URL.

`JUPITER_BASE_URL` overrides the endpoint (default `https://api.jup.ag`); plain `http` is
accepted only for loopback hosts running local test fixtures.

Operator QA (requires the configured `JUPITER_API_KEY`; blocked without one, never faked
offline). A 0.01 SOL -> USDC quote sends nothing on chain:

```sh
JUPITER_API_KEY=... bun run solos swap quote --input-mint So11111111111111111111111111111111111111112 --output-mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --amount 10000000
JUPITER_API_KEY=... bun run solos mcp call solana_swap_get_quote --args '{"inputMint":"So11111111111111111111111111111111111111112","outputMint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"10000000"}'
```

Inspect the answer's `routeSummary` hops, `minOutAmount` (worst case at 0.5% default slippage),
and `priceImpactPct` (a decimal ratio: `"0.01"` means 1 percent). Both surfaces must return the
same amounts for the same request, and the fixture-backed tests assert the request went to
`/swap/v2/order` exactly once with no submit call.

## Swap simulation and execution (Jupiter V2 build)

`solana_swap_simulate_swap` (MCP) and `solos swap simulate` (CLI) simulate a swap without
submitting anything; `solana_swap_execute_swap` (MCP) and `solos swap execute [--skip-simulation]`
(CLI) sign and submit one. Both take the same intent — `--input-mint`, `--output-mint`,
`--amount` (exact base-unit integer string), `[--slippage-bps 50]` — plus the execute twin's
`--skip-simulation` flag (default false: execution always simulates the exact transaction
first). Venue is Jupiter only: omission or explicit `jupiter`; other venues are unsupported
until their executor branches land.

- **Fresh build per call.** Every simulate and execute fetches its own Jupiter V2
  `GET {JUPITER_BASE_URL}/swap/v2/build` for the configured signer's taker address. A quote from
  `solos swap quote`, or the build behind an earlier simulate, is never reused or replayed;
  prices may differ between calls by design.
- **What is validated before signing.** The response must echo the exact pair, amount, and
  tolerance, carry a tolerance-bound minimum output (`otherAmountThreshold`), and pass a strict
  instruction allowlist: a well-formed compute-unit price (stripped — v1 carries no budget
  instructions), exact ATA creates bound to the taker and requested mints (idempotent for durable
  accounts, either canonical create opcode for a cleanup-owned temporary account), wSOL funding
  in the canonical 12-byte System transfer form for exactly the requested amount, the JUP6
  route, and a closeAccount cleanup limited to a build-owned temporary wSOL ATA. Cleanup is
  accepted only when that ATA is absent in a read-only RPC preflight, this build creates it with
  the canonical ATA instruction, and the wrap/route direction funds and consumes the same
  account. At assembly the temporary create is pinned to exclusive creation (opcode 0): a raced
  pre-existing account aborts the whole transaction instead of being adopted and closed, while
  the destination ATA keeps idempotent semantics because it legitimately pre-exists after a
  first swap. Transfers, approvals, authorities, mints, burns, tips, foreign signers, foreign
  recipients, pre-existing wSOL ATAs, or a pre-sign expiry are refused with a fixed-reason
  `BuildRejected` before anything is signed or sent.
- **v1-only, self-submitted.** The transaction is assembled as a Solana v1 message with explicit
  local resource policy (compute-unit limit, loaded-account-data limit, a capped total priority
  fee in lamports), all accounts inline (no address-lookup tables), signed once by the
  configured signer, proven v1 on the wire before simulation or submission, simulated as those
  exact bytes unless `--skip-simulation` is explicit, and submitted exactly once to
  `SOLANA_RPC_URL`. The configured RPC supplies and pre-sign gates the blockhash lifetime;
  provider lifetime metadata never chooses the signed bytes. Jupiter's `/execute` and `/submit`
  are never used; there are no auto tips, referral fees, or provider-chosen payers.
- **Zero-send guarantees.** A build that fails validation, a failed simulation, an expired
  blockhash lifetime, or a missing key leaves the balance untouched — nothing is submitted. A
  confirmation failure is an honest `TransactionFailed` carrying the submitted signature; there
  is no automatic second attempt or swap.
- **Credentials and destinations.** `JUPITER_API_KEY` rides the `x-api-key` header to
  `JUPITER_BASE_URL` (default `https://api.jup.ag`; plain `http` only for loopback fixtures);
  `SOLANA_RPC_URL` (or the active profile's stored endpoint) is where signed transactions go.
  The signer comes from `SOLOS_SIGNER_PRIVATE_KEY` / `SOLOS_SIGNER_KEYPAIR_PATH` /
  `SOLOS_PROFILE` per ADR-0015; `SOLOS_EXECUTOR` selects the executor (currently `direct`).
  Keys live in the environment or profile store, never in tool arguments or error payloads.
- **Errors:** executor-channel failures — `BuildRejected` (pre-sign policy), `BuildUnavailable`
  (credential, rate limit, timeout, contract mismatch; with no `JUPITER_API_KEY` the failure is
  pre-HTTP), `SimulationFailed` (nothing was sent), `TransactionExpired` (expired after signing;
  signature preserved and nothing sent), `TransactionFailed` (the one
  submission did not confirm; signature preserved), `UnsupportedAction`, `RpcError`. Domain errors exit
  non-zero with `{ "error": { "code", ... } }` on stderr; results are JSON on stdout.
