# Perp

Part of the [tool reference](index.md).

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
exist — see [perp QA](../../perp-qa.md) and never report it as passed.
