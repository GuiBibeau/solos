# Tools today

This table is generated from the tool registry by `solos dev docs check --write`; `solos dev
check` fails when it drifts. Do not edit it by hand.

<!-- generated: tools -->
| Tool | Tier | Slice |
|---|---|---|
| `solana_launch_execute_buy` | execute | `launch` |
| `solana_launch_execute_sell` | execute | `launch` |
| `solana_launch_get_curve` | read | `launch` |
| `solana_launch_simulate_buy` | simulate | `launch` |
| `solana_launch_simulate_sell` | simulate | `launch` |
| `solana_lend_execute_deposit` | execute | `lend` |
| `solana_lend_execute_withdraw` | execute | `lend` |
| `solana_lend_get_position` | read | `lend` |
| `solana_lend_get_reserve` | read | `lend` |
| `solana_lend_simulate_deposit` | simulate | `lend` |
| `solana_lend_simulate_withdraw` | simulate | `lend` |
| `solana_liquidity_execute_close_position` | execute | `liquidity` |
| `solana_liquidity_execute_deposit` | execute | `liquidity` |
| `solana_liquidity_execute_open_position` | execute | `liquidity` |
| `solana_liquidity_execute_withdraw` | execute | `liquidity` |
| `solana_liquidity_get_position` | read | `liquidity` |
| `solana_liquidity_simulate_close_position` | simulate | `liquidity` |
| `solana_liquidity_simulate_deposit` | simulate | `liquidity` |
| `solana_liquidity_simulate_open_position` | simulate | `liquidity` |
| `solana_liquidity_simulate_withdraw` | simulate | `liquidity` |
| `solana_market_ask_iris` | read | `market` |
| `solana_market_get_event_summary` | read | `market` |
| `solana_market_get_price` | read | `market` |
| `solana_market_get_token` | read | `market` |
| `solana_market_get_token_news` | read | `market` |
| `solana_market_get_trending_tokens` | read | `market` |
| `solana_perp_execute_close` | execute | `perp` |
| `solana_perp_execute_deposit_collateral` | execute | `perp` |
| `solana_perp_execute_onboard_trader` | execute | `perp` |
| `solana_perp_execute_open` | execute | `perp` |
| `solana_perp_execute_withdraw_collateral` | execute | `perp` |
| `solana_perp_get_onboarding_status` | read | `perp` |
| `solana_perp_get_position` | read | `perp` |
| `solana_perp_simulate_close` | simulate | `perp` |
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

Every `execute` tool has a `simulate` twin, and the pages linked below still describe the read tiers
in the most depth — the write tiers are specified in their ADRs (0019 lend, 0021 perp, 0022
liquidity) and their QA docs.

## Slice pages

- [Launch](launch.md)
- [Lend](lend.md)
- [Liquidity](liquidity.md)
- [Market](market.md)
- [Perp](perp.md)
- [Swap](swap.md)
