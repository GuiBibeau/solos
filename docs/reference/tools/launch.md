# Launch

Part of the [tool reference](index.md).

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

### Bounded SOL-in buys and curve-side sells

`solana_launch_simulate_buy` / `solana_launch_execute_buy` (MCP) and `solos launch simulate-buy
--mint <mint> --amount <lamports> [--max-slippage-bps 50]` / `solos launch buy … [--skip-simulation]`
buy one coin on a live curve with a bounded SOL budget. `solana_launch_simulate_sell` /
`solana_launch_execute_sell` and `solos launch simulate-sell` / `solos launch sell` sell it back
to the same curve.

- **The sell is the curve-side exit, not a guaranteed one.** It trades against the same bonding
  curve, so it stops working the moment that curve completes and migrates; after that the
  position is only reachable through PumpSwap or an aggregator, which solOS does not reroute to.
  A buy still leaves an exposure whose exit depends on the curve staying live.
- **`amount` means opposite things in the two directions.** A buy's is the maximum SOL, in
  lamports; a sell's is the exact quantity of the coin, in its base units. Neither is ever the
  other, and both tool descriptions say so.
- **`amount` is the maximum SOL, in lamports, including Pump's trading fees** — never a token
  quantity. The same maximum is encoded in the transaction as `spendable_quote_in`, so nothing
  more can be spent. Network fees and account rent are reported separately and sit outside it.
- **The minimum tokens out is enforced on chain**, not by solOS arithmetic. It is derived from
  live curve state and `maxSlippageBps` and handed to the program, so a curve that moves between
  planning and landing reverts the buy instead of filling it badly (ADR-0025).
- **The minimum SOL out is enforced on chain the same way.** A sell derives it from live curve
  state and `maxSlippageBps` and hands it to the program as `min_sol_output`.
- **Route identity is explicit, and direction is read from the Action.** Both directions build a
  `swap` Action carrying `venue: "pump"`; the executor selects Pump from that and never infers it
  from a mint, so an ordinary `solana_swap_*` call on the same coin still goes to Jupiter. Which
  side holds wSOL is the direction — the Action contract requires wSOL on exactly one side. A
  refused trade is never rerouted to PumpSwap or Jupiter, and never retried.
- **Refusals before signing:** a completed curve, a curve quoted in anything but SOL, a missing or
  foreign-owned curve, a missing mint, an unreadable protocol config, a budget too small to clear
  one whole token after fees, or — for a sell — a wallet holding less of the coin than the sell
  asks for, or a quantity returning no lamports after fees.
- **Fee rates are read live.** Pump's published docs state `fee_basis_points == 100`; the live
  config reads 95 plus a 5 bps creator fee, so the rates are never hardcoded.

```sh
SOLANA_RPC_URL=... bun run solos launch simulate-buy --mint <mint> --amount 10000000
SOLANA_RPC_URL=... bun run solos launch simulate-sell --mint <mint> --amount 1000000
SOLANA_RPC_URL=... bun run solos mcp call solana_launch_simulate_buy --args '{"mint":"<mint>","amount":"10000000"}'
```

Operator QA is a funded round: a small buy and the sell that closes it, on a curve that is live
for both. Record both signatures, fees, before and after balances, and the residual token
position; a balance increase alone is not a completed round trip. One such round ran on
2026-09-25 and is reconciled in ADR-0027 — note that the buy opens two rent-bearing accounts
(about 2.86M lamports on a Token-2022 mint), which stay locked after the position is closed.
