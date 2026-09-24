# solOS

A thin Solana execution layer for LLM agents. Two faces, one core:

- **MCP server** (`packages/mcp`): stdio server that Claude Code, Codex, Cursor and any MCP client
  can spawn. Flat, searchable tool list; every signing tool has a simulate twin.
- **Harness** (`apps/harness`): long-running daemon with an event bus, a provider-neutral model
  router, and an agent loop that uses the same tools directly plus any third-party MCP server.

Plain JavaScript on Bun, Effect for architecture, Zod for schemas, Solana Kit 8 for the chain,
`@solana/keychain` for signing. Mainnet by default; Surfpool for everything reusable.

## Quick start

```sh
bun install
bun run solos login --provider privy --rpc-url https://your-provider-url   # browser login; or local | pay
bun run solos dev verify --scope unit --json   # Evidence: the only accepted proof of work (ADR-0016)
bun run solos dev verify                        # full: adds Surfpool integration tests

bun run solos dev surfpool up   # local network for manual verification
bun run solos wallet balance
bun run solos mcp list
```

Requires Bun ≥ 1.3 and [Surfpool](https://solana.com/docs/tools/surfpool)
(`curl -sL https://run.surfpool.run/ | bash`).

## Layout

```
packages/actions  Action / state / result schemas, the one published package
packages/core     domain, ports, use cases, tool definitions   (zero I/O)
packages/solana   Kit + keychain adapters, DirectSignerExecutor, Surfpool helpers
packages/mcp      stdio MCP server, the single MCP client
apps/harness      daemon, router, agent loop, sqlite store, tracing
apps/cli          `solos`: operator CLI and verification lever
docs/adr          why things are the way they are
docs/clients      wiring snippets for Claude Code, Codex, Cursor
```

Read `AGENTS.md` before contributing (humans too) and `CONTEXT.md` for vocabulary.

## How work gets done

Design work ends in ADRs and issues with acceptance criteria. Every authored pull request carries
the JSON printed by `solos dev verify` under `## Evidence`; CI checks it against the head commit and
re-runs the same command. See ADR-0016 for the verification contract.

## Tools today

This table is generated from the tool registry by `solos dev docs check --write`; `solos dev
check` fails when it drifts. Do not edit it by hand.

<!-- generated: tools -->
| Tool | Tier | Slice |
|---|---|---|
| `solana_launch_get_curve` | read | `launch` |
| `solana_lend_execute_deposit` | execute | `lend` |
| `solana_lend_execute_withdraw` | execute | `lend` |
| `solana_lend_get_position` | read | `lend` |
| `solana_lend_get_reserve` | read | `lend` |
| `solana_lend_simulate_deposit` | simulate | `lend` |
| `solana_lend_simulate_withdraw` | simulate | `lend` |
| `solana_liquidity_execute_deposit` | execute | `liquidity` |
| `solana_liquidity_execute_withdraw` | execute | `liquidity` |
| `solana_liquidity_get_position` | read | `liquidity` |
| `solana_liquidity_simulate_deposit` | simulate | `liquidity` |
| `solana_liquidity_simulate_withdraw` | simulate | `liquidity` |
| `solana_market_ask_iris` | read | `market` |
| `solana_market_get_event_summary` | read | `market` |
| `solana_market_get_price` | read | `market` |
| `solana_market_get_token` | read | `market` |
| `solana_market_get_token_news` | read | `market` |
| `solana_market_get_trending_tokens` | read | `market` |
| `solana_perp_execute_deposit_collateral` | execute | `perp` |
| `solana_perp_execute_onboard_trader` | execute | `perp` |
| `solana_perp_execute_open` | execute | `perp` |
| `solana_perp_execute_withdraw_collateral` | execute | `perp` |
| `solana_perp_get_onboarding_status` | read | `perp` |
| `solana_perp_get_position` | read | `perp` |
| `solana_perp_simulate_deposit_collateral` | simulate | `perp` |
| `solana_perp_simulate_onboard_trader` | simulate | `perp` |
| `solana_perp_simulate_open` | simulate | `perp` |
| `solana_perp_simulate_withdraw_collateral` | simulate | `perp` |
| `solana_portfolio_get_state` | read | `portfolio` |
| `solana_swap_execute_swap` | execute | `swap` |
| `solana_swap_get_quote` | read | `swap` |
| `solana_swap_simulate_swap` | simulate | `swap` |
| `solana_transfer_send_sol` | execute | `transfer` |
| `solana_transfer_simulate_sol` | simulate | `transfer` |
| `solana_wallet_get_address` | read | `wallet` |
| `solana_wallet_get_balance` | read | `wallet` |
<!-- /generated: tools -->

`market` has the Elfa Iris adapter behind `ELFA_API_KEY`, the Jupiter Price V3 adapter behind
`JUPITER_API_KEY`, and the on-chain token registry over the configured Solana RPC; `swap` has the
Jupiter Swap V2 quote-only adapter behind the same `JUPITER_API_KEY` (indicative quotes) plus
Action-based simulation and execution over Jupiter V2 `/build` through the shared executor;
`launch` has the pump bonding-curve reader over the configured Solana RPC (no provider key at
all); `perp` has the Phoenix Perps position and onboarding-status readers plus trader enrollment
and bounded USDC collateral deposits and withdrawals (no provider key; `PHOENIX_BASE_URL` only
overrides the public endpoint for loopback fixtures); `liquidity` has the Orca Whirlpool position
reader plus bounded deposits into, and removals from, explicitly identified existing positions
over the configured Solana RPC (no provider key at all); `lend` has the Kamino reserve and supply
readers plus bounded deposits and withdrawals over the configured Solana RPC through the official
Kamino klend-sdk (no provider key; one explicitly configured market); `portfolio`
composes the wallet, price feed and venue reads into the supported-portfolio state
(ADR-0018): cash, positions, perp account equity and USD valuation only when every nonzero
holding is priced — a supported-assets view, never full net worth; `signals` has
ports only.

Every `execute` tool has a `simulate` twin, and the sections below still describe the read tiers
in the most depth — the write tiers are specified in their ADRs (0019 lend, 0021 perp, 0022
liquidity) and their QA docs.

## Market intelligence (Elfa Iris)

`solana_market_ask_iris` (MCP) and `solos market ask --question` (CLI) send one market question to
Elfa's Iris and return the written answer, the credits the call consumed, and the receive time.
Links appear only when the provider includes them; solOS never invents citations or certainty.

- **Setup:** export `ELFA_API_KEY`. Chat access requires an Elfa Grow plan or above, or
  pay-as-you-go credits. The key stays in the environment — never in tool arguments.
- **Credits:** every call consumes Elfa credits; the response reports the exact amount as
  `creditsConsumed`.
- **Endpoint:** `POST {ELFA_BASE_URL}/v2/chat`, default `https://api.elfa.ai`. Plain `http` is
  accepted only for loopback hosts running local test fixtures.
- **One attempt, 30-second deadline.** Elfa bills per request and chat can run past a minute, so
  solOS never retries automatically — a silent retry would double-bill.

Trial (the ordinary Solana profile/RPC startup requirements still apply):

```sh
ELFA_API_KEY=... bun run solos market ask --question "What changed for SOL in the last 24 hours?"
ELFA_API_KEY=... bun run solos mcp call solana_market_ask_iris --args '{"question":"What changed for SOL in the last 24 hours?"}'
```

### Free-plan discovery and news

The same key supports these read tools on Elfa's Free plan:

| CLI | MCP tool | Result |
|---|---|---|
| `market trending` | `solana_market_get_trending_tokens` | Tokens ranked by mention activity, previous counts and percentage changes |
| `market news --coin-ids solana` | `solana_market_get_token_news` | News-source X posts, source links, timestamps and engagement |
| `market summary --keywords Solana` | `solana_market_get_event_summary` | Event summaries and provider-supplied citations (5 credits/call) |

All use `--time-window` (`30m`, `1h`, `4h`, `24h`, `7d`, `30d`; default `24h`). Trending and news
accept `--page` and `--page-size` (1–50, default 10); trending also accepts `--min-mentions`.
News uses comma-separated **CoinGecko IDs**, not tickers. Summary accepts comma-separated keywords
and `--search-type and|or` (default `or`). Each command makes one request without retries. Summary generation has a 180-second deadline;
other endpoints have a 30-second deadline. External MCP clients should allow at least 190 seconds
for `solana_market_get_event_summary` (the bundled CLI already does).

```sh
bun run solos market trending --time-window 24h --page-size 5
bun run solos market news --coin-ids solana --time-window 24h
bun run solos market summary --keywords Solana --time-window 24h
bun run solos mcp call solana_market_get_token_news --args '{"coinIds":["solana"],"timeWindow":"24h"}'
bun run solos dev verify --scope full --qa elfa-market --json
```

Results include `provider`, `receivedAt`, and `creditsConsumed` from Elfa's `x-elfa-credits` header
(`null` if unavailable). Receipt time is not a source freshness guarantee. Empty result lists are
valid. Trending is experimental; it measures attention, not price or sentiment. News contains
links and metrics, not raw post text. See [live QA](docs/iris-qa.md) for the bounded six-call suite.

## Jupiter Price V3

`solana_market_get_price` (MCP) and `solos market price --mint <address>` (CLI) read the current
USD price of one token mint from Jupiter's Price V3 endpoint:
`GET https://api.jup.ag/price/v3?ids=<mint>`, authenticated with `x-api-key` from
`JUPITER_API_KEY`. The response normalizes to `{ mint, priceUsd, source: "jupiter", at }`, with
`priceUsd` an exact decimal string.

- **Setup:** export `JUPITER_API_KEY`. The key is **required to invoke the tool**; it stays in the
  environment, never in tool arguments. The tool always lists — without the key every call fails
  before any HTTP with `PriceConfigMissing`.
- **`at` is the local receipt time**, not a source freshness guarantee: Jupiter stamps responses
  with a `blockId` (a provider sequence number, not a timestamp) and serves them through a CDN
  that caches for roughly 5 seconds.
- **Omission is not zero.** A mint Jupiter does not price is reported as `PriceUnavailable`, never
  as a zero price; a genuine `usdPrice: 0` still returns `"0"`.
- **One attempt, 10-second deadline** covering the whole request including body read. Never
  retried.

`JUPITER_BASE_URL` overrides the endpoint (default `https://api.jup.ag`); plain `http` is accepted
only for loopback hosts running local test fixtures. `lite-api.jup.ag` is deprecated and never a
default or fallback.

Trial (the ordinary Solana profile/RPC startup requirements still apply):

```sh
JUPITER_API_KEY=... bun run solos market price --mint So11111111111111111111111111111111111111112
JUPITER_API_KEY=... bun run solos mcp call solana_market_get_price --args '{"mint":"So11111111111111111111111111111111111111112"}'
```

Operator QA with a real key: run both surfaces for wSOL and USDC and compare — the CLI and MCP
must return the same `priceUsd` for the same mint, wSOL should track SOL's market price, and USDC
should be close to 1. Each call makes exactly one provider request; back-to-back calls may return
a CDN-cached price for up to ~5 seconds.

```sh
JUPITER_API_KEY=... bun run solos market price --mint So11111111111111111111111111111111111111112
JUPITER_API_KEY=... bun run solos market price --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
JUPITER_API_KEY=... bun run solos mcp call solana_market_get_price --args '{"mint":"So11111111111111111111111111111111111111112"}'
JUPITER_API_KEY=... bun run solos mcp call solana_market_get_price --args '{"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"}'
```

## Token metadata

`solana_market_get_token` (MCP) and `solos market token --mint <address>` (CLI) read verified
on-chain metadata for one mint and return `{ mint, name, symbol, decimals, logoUri }`:

- **Sources.** Standard SPL mints are read from their Metaplex metadata PDA; Token-2022 mints
  from their in-mint metadata extension (including a `logo` pair in `additionalMetadata`), with
  the Metaplex PDA as a fallback. The decoded metadata must name the requested mint itself —
  wrong-mint or foreign-pointer metadata fails, it is never trusted.
- **No invented tickers.** An address that does not exist or is not a mint account (a token
  account, a system-owned account) fails `UnknownToken`. A valid mint whose metadata is absent
  or unreadable fails `TokenMetadataUnavailable`. These two tags are the whole failure surface.
- **Canonical wSOL/USDC.** Wrapped SOL and USDC map to their canonical names only after the
  mint account, its owner program, and its decimals are verified on chain (9 for wSOL, 6 for
  USDC). The mapping never applies when metadata is unreadable or decimals disagree.
- **`logoUri` is null unless a real logo URI is on chain.** Only a well-formed http(s)
  additional-metadata `logo` pair qualifies — a scheme prefix alone, control characters, an
  oversized value, or a non-http(s) scheme all leave `logoUri` null. The metadata JSON `uri`
  is not a logo and is never fetched: solOS makes no off-chain requests for token metadata.
- **Bounded decoding and bounded reads.** Mint and metadata accounts are size-checked before
  decoding; string lengths are bounded and NUL padding is trimmed, so malformed or oversized
  metadata fails promptly instead of being parsed into garbage. Each account read carries an
  aborting deadline that covers the response headers and the full body.

### `SOLANA_RPC_URL`

Token metadata reads go through the same configured Solana endpoint as every other Solana tool
(shared `SolanaRpc` service; no second configuration path, no public fallback):

- `SOLANA_RPC_URL` **overrides** the active profile's stored `rpcUrl` (ADR-0015 precedence:
  env, then `SOLOS_PROFILE`, then the default profile). There is **no default RPC**: with
  neither configured, startup fails with a clear error naming `SOLANA_RPC_URL`.
- An authenticated RPC URL (provider keys in the path or query) belongs only in the operator or
  approved QA environment. solOS redacts endpoint credentials in token-metadata errors and in
  the MCP server's startup line to the URL origin, and transport errors carry fixed reasons —
  a provider's own failure text never travels; never paste such a URL into logs, errors, issue
  comments, or committed files.
- Automated tests run offline on Surfnet. Live QA of real mints (compare a Token-2022 mint
  against its known name/symbol) requires an explicitly configured operator RPC and is
  **blocked** without one.

```sh
SOLANA_RPC_URL=... bun run solos market token --mint So11111111111111111111111111111111111111112
SOLANA_RPC_URL=... bun run solos mcp call solana_market_get_token --args '{"mint":"So11111111111111111111111111111111111111112"}'
```

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

## Launch curve (Pump bonding curve)

`solana_launch_get_curve` (MCP) and `solos launch curve --mint <address>` (CLI) read the current
state of a pump.fun bonding curve for one launched token and return
`{ mint, program, complete, progressBps, virtualSolReserves, virtualTokenReserves }`:

- **Pinned program and IDL.** Reads target the official pump program
  `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`, with byte layouts and discriminators verified
  against the official IDL at pinned upstream commit `81091419e4457566469d4e2a27f64ed84d42419c`.
  The curve account stores no mint of its own, so identity is established only by the derived
  PDA (seeds `["bonding-curve", mint]`) plus the program owner plus the layout discriminator —
  an impostor account at the PDA fails, it is never trusted.
- **`complete` is the on-chain flag and nothing more.** It does **not** prove a PumpSwap
  migration pool exists; migration tracking is out of scope, and solOS deliberately does not
  emit any `graduated` field.
- **`progressBps` is real, floored, and clamped.** Progress is computed from the curve's real
  token reserves against the protocol's configured initial real token reserves, read live from
  the Global config (so a protocol `set_params` update is honored, never a guessed constant),
  as `floor((initial - real) x 10000 / initial)`, clamped to 0..10000. Floor rounding and the
  clamp are solOS's documented convention; the protocol documents none. A fresh curve reads 0,
  a completed curve reads exactly 10000, and a curve one base unit from completion reads 9999.
- **Reserves are exact.** `virtualSolReserves` and `virtualTokenReserves` are u64 base-unit
  integer strings decoded with BigInt end to end — never rounded through a JS Number.
- **SOL-paired curves only (MVP).** A legacy account without a quote field, or one storing the
  default pubkey (native SOL), reads normally. A curve trading against any other quote asset
  fails `UnsupportedQuoteAsset` with the offending quote mint. There is no Jupiter fallback.
- **Errors:** `CurveInputInvalid` (not a 32-byte base58 address, before any RPC),
  `CurveUnavailable` (no account at the PDA), `CurveCorrupt` (wrong owner, wrong discriminator,
  or truncated bytes — older shorter curves are valid layouts, decoded by threshold with
  defaults, and longer accounts with trailing padding decode identically),
  `CurveConfigUnavailable` (the Global config needed for progress is absent or unreadable), and
  the shared `RpcError` for transport failures. A completed curve is a **successful** read.
- **Reads are bounded.** At most two account reads per call (curve, then Global), each with an
  aborting deadline covering headers and body, one attempt, no retries, no off-chain fetches.
  Nothing is bought, sold, signed, or sent.
- **No API key.** The only configuration is the standard `SOLANA_RPC_URL` (or an RPC URL in the
  active profile), the same endpoint every other Solana tool uses. Endpoint credentials in the
  URL are redacted to the origin in errors, exactly as in token metadata reads.

```sh
SOLANA_RPC_URL=... bun run solos launch curve --mint <mint>
SOLANA_RPC_URL=... bun run solos mcp call solana_launch_get_curve --args '{"mint":"<mint>"}'
```

Operator QA requires an RPC endpoint with the curve on chain; report it blocked until the
operator provides that endpoint:
read one active curve and one completed curve and compare the decoded flags and reserves with
the chain accounts for the same addresses; both surfaces must return identical JSON for the
same mint. No funded transaction is involved.

## Phoenix Perps positions, enrollment and collateral

`solana_perp_get_position` (MCP) and `solos perp position --market <symbol> [--owner <address>]`
(CLI) read one position from Phoenix Perps and return `{ position, account }`:

- **No credential exists.** Market and trader reads are public, so there is nothing to log in to
  and nothing to store. The tool always lists; without any configuration it uses the production
  endpoint.
- **Account scope is fixed by the contract** (ADR-0021): traderPdaIndex 0, subaccount index 0.
  `--owner` / `owner` is honored verbatim; omitted, it means the configured signer.
- **Symbols normalize through exchange metadata.** `SOL-PERP` and `sol` both mean the wire
  symbol `SOL`; a symbol the exchange does not list fails `PerpMarketUnknown` — never an
  invented zero position.
- **Direction and amounts stay exact.** The wire's signed base lots become `side`
  (long/short/flat, flat is exactly zero) plus an absolute base-unit amount and the market's
  `decimals`, computed with BigInt only. `valueUsd` is always null: it must never mean
  leveraged notional.
- **Equity is signed or null.** `account.equityUsd` is the shared trader-account equity,
  counted once across markets. A cold or absent trader is a typed flat zero-position success
  with confirmed-zero equity; an active flat account is worth exactly its collateral; any open
  position or spot collateral makes equity null — unrealized PnL and spot valuation are
  unknowable from the state snapshot, and solOS never guesses collateral or notional.
- **Distinct failures.** Unknown market, provider unavailability (`PerpTimeout`,
  `PerpNetworkError`, `PerpHttpError`, `PerpRateLimited`, `PerpAuthFailed`), a corrupt account
  (`PerpAccountCorrupt`) and incomplete state (`PerpStateIncomplete`,
  `PerpEnumerationIncomplete`) are separate tags. One attempt per read, no retries, raw
  failure bodies never travel.
- **Pins.** Production perps program `EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih`, verified
  in Ellipsis Labs' official Rise source at revision `4bd3c505f16f09fdbe9fb2eff035aeaef8b7b12d`
  (SDK manifest 0.5.26); the adapter speaks that revision's documented wire contract. Any
  replacement revision must be verified separately first.
- **Endpoint.** `PHOENIX_BASE_URL` overrides `https://perp-api.phoenix.trade`; plain `http` is
  accepted only for loopback hosts running local test fixtures.

```sh
bun run solos perp position --market SOL-PERP
bun run solos perp position --market SOL --owner <trader-address>
bun run solos mcp call solana_perp_get_position --args '{"market":"SOL-PERP"}'
```

Beyond reads, the slice enrolls the configured trader (`solana_perp_simulate_onboard_trader` /
`solana_perp_execute_onboard_trader`, with `solana_perp_get_onboarding_status` reporting whether
it is needed) and moves USDC collateral in exact, fixed amounts both ways
(`solana_perp_{simulate,execute}_deposit_collateral` and the matching `withdraw_collateral`).
Orders, opens and closes remain separate, later slices (#27/#28): nothing here opens, closes or
sizes a position, but enrollment and collateral transfers do sign and spend.
Live QA against a registered, funded operator account is **blocked** until those prerequisites
exist — see [perp QA](docs/perp-qa.md) and never report it as passed.

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

Operator QA requires an RPC endpoint and an operator-owned Whirlpool position; report it blocked
until those prerequisites exist. Read the operator position and compare `liquidity`,
`tokenA`/`tokenB` amounts and decimals against the same pool state on a block explorer or a
second client; both surfaces must return identical underlying quantities. See
[liquidity QA](docs/liquidity-qa.md).

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

## Kamino Lend reserve and supply reads, deposits and withdrawals

`solana_lend_get_reserve` (MCP) and `solos lend reserve --mint <address>` (CLI) read one
reserve's rates and available liquidity from one explicitly configured Kamino market and
return `{ protocol, market, reserve, mint, decimals, supplyApy, borrowApy, liquidity, at }`:

`solana_lend_get_position` and `solos lend position --mint <address> [--owner <address>]`
read one owner's aggregate supply in the same market. Omitted owner means the active signer;
an explicit owner is used verbatim. The result is the published lend Position with underlying
base units and the distinct obligation accounts that contribute supply.

- **One configured market, never a search.** The default market is Kamino Main Market
  `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF`; `KAMINO_LENDING_MARKET` may select one other
  supported market. The market address is validated and echoed in every snapshot (`market` plus
  the exact `reserve` PDA), so later reads and execution reuse the same identities. There is no
  APY-based market choice and no first-reserve-across-markets fallback: two markets holding a
  reserve for the same mint answer with the configured market's float-rate reserve or fail
  `ReserveUnavailable` for that market.
- **Program pin.** Lending program `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD`; reads go
  through Kamino's official `@kamino-finance/klend-sdk` over the same configured Solana RPC
  every other tool uses. No provider key, no second RPC endpoint, no off-chain HTTP leg.
- **Exact units.** `liquidity` is the reserve's available underlying token amount in base units
  (`liquidity.totalAvailableAmount`, u64, decimal string, BigInt end to end) — never TVL, never
  USD, never `totalSupply - totalBorrow`. `decimals` is the reserve liquidity mint's decimals.
  An existing reserve with zero available liquidity is a successful read with `liquidity: "0"`.
  Supply positions sum collateral units across each distinct owner obligation, convert once at
  the reserve's current collateral-per-liquidity exchange rate using integer arithmetic, and
  round down to underlying base units. Borrow entries are never subtracted or reported as supply.
- **APYs are observations, not promised returns.** `supplyApy`/`borrowApy` are annual fractional
  decimal strings (`0.05` = 5%) computed by the SDK's published per-slot interest math and
  exclude incentive reward yields by documented contract. They move every slot; record the time
  when comparing.
- **Typed failures.** Input that is not a 32-byte base58 address fails `LendingInputInvalid`
  before any RPC; a missing configured market fails `LendingMarketUnavailable`; a mint without a
  float-rate reserve (or a mapping violation) fails `ReserveUnavailable`; an undecodable reserve
  account fails `LendingLayoutUnsupported`; a decoded value outside the snapshot schema fails
  `LendingResponseInvalid`; a deadline miss fails `LendingTimeout`; transport failures surface
  as the shared `RpcError`. Corrupt obligations fail `LendingObligationInvalid`; enumerations
  beyond 4096 accounts, 256 positions, or 32 pages fail `LendingEnumerationIncomplete` rather
  than returning a partial result. One attempt per read, no retries, raw provider bodies never travel.
- **Deposits and withdrawals are bounded and twinned** (#22/#23). `solana_lend_simulate_deposit` /
  `solana_lend_execute_deposit` supply one exact underlying amount into the configured market, and
  `solana_lend_simulate_withdraw` / `solana_lend_execute_withdraw` redeem back out of it. The
  amount encoded in the transaction is the exact amount asked for, so nothing more can be spent;
  the executor re-plans against live chain state on every call, and a simulation never submits.
  Borrowing, leverage and elevation-group obligations are never touched.

```sh
SOLANA_RPC_URL=... bun run solos lend reserve --mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
KAMINO_LENDING_MARKET=<market> SOLANA_RPC_URL=... bun run solos lend reserve --mint <address>
SOLANA_RPC_URL=... bun run solos mcp call solana_lend_get_reserve --args '{"mint":"<address>"}'
SOLANA_RPC_URL=... bun run solos lend position --mint <address> --owner <owner>
SOLANA_RPC_URL=... bun run solos mcp call solana_lend_get_position --args '{"mint":"<address>","owner":"<owner>"}'
```

`KAMINO_LENDING_MARKET` is optional everywhere and is forwarded to the MCP child like the other
solOS keys; without it every tool still works against the default market.

Operator QA compares one USDC reserve snapshot with the same named Kamino market, recording
time and units. Report it blocked until an operator RPC exists; see [lend QA](docs/lend-qa.md).

## License

Apache-2.0. Copyright 2026 Solana Foundation.
