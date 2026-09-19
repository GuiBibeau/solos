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
apps/factory      eve software factory: GitHub issue → stations → draft PR (Node 24 for the eve CLI only)
docs/adr          why things are the way they are
docs/clients      wiring snippets for Claude Code, Codex, Cursor
```

Read `AGENTS.md` before contributing (humans too) and `CONTEXT.md` for vocabulary.

## How work gets done

Design is human: a grilling session ends in an ADR and issues with acceptance criteria. Labelling
an issue `agent-ready` hands it to the factory (`apps/factory`), which plans, implements, and
independently reviews the change in sandboxes and opens a **draft** pull request. Every pull
request, from a person or an agent, carries the JSON printed by `solos dev verify` under
`## Evidence`; CI checks it against the head commit and re-runs the same command. A person marks
the draft ready and merges. See `docs/factory.md` for operating the factory and ADR-0016 for why.

## Tools today

| Tool | Tier |
|---|---|
| `solana_wallet_get_address` | read |
| `solana_wallet_get_balance` | read |
| `solana_market_ask_iris` | read |
| `solana_market_get_trending_tokens` | read |
| `solana_market_get_token_news` | read |
| `solana_market_get_event_summary` | read |
| `solana_market_get_price` | read |
| `solana_market_get_token` | read |
| `solana_launch_get_curve` | read |
| `solana_swap_get_quote` | read |
| `solana_transfer_simulate_sol` | simulate |
| `solana_transfer_send_sol` | execute |

`market` has the Elfa Iris adapter behind `ELFA_API_KEY`, the Jupiter Price V3 adapter behind
`JUPITER_API_KEY`, and the on-chain token registry over the configured Solana RPC; `swap` has the
Jupiter Swap V2 quote-only adapter behind the same `JUPITER_API_KEY` (indicative quotes; execution
arrives with Action-based build execution); `launch` has the pump bonding-curve reader over the
configured Solana RPC (no provider key at all); `signals` has ports only.

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
  **blocked** without one — the factory never provisions RPC credentials.

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
- **Indicative only.** The quote is never a promise to execute: an execution obtains a fresh
  build. The provider port's `execute` method is present but fails fast with `SwapFailed` until
  Action-based build execution lands; no send or signing path exists yet.
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

Operator QA (requires an RPC endpoint with the curve on chain; **blocked** in the factory —
the factory never provisions RPC credentials, so live QA is reported blocked, never passed):
read one active curve and one completed curve and compare the decoded flags and reserves with
the chain accounts for the same addresses; both surfaces must return identical JSON for the
same mint. No funded transaction is involved.

## License

Apache-2.0. Copyright 2026 Solana Foundation.
