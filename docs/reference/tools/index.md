# Tools today

This table is generated from the tool registry by `solos dev docs check --write`; `solos dev
check` fails when it drifts. Do not edit it by hand.

<!-- generated: tools -->
| Tool | Tier | Stability | Slice |
|---|---|---|---|
| `solana_discovery_search_tools` | read | beta | `discovery` |
| `solana_launch_execute_buy` | execute | stable | `launch` |
| `solana_launch_execute_sell` | execute | stable | `launch` |
| `solana_launch_get_curve` | read | beta | `launch` |
| `solana_launch_simulate_buy` | simulate | stable | `launch` |
| `solana_launch_simulate_sell` | simulate | stable | `launch` |
| `solana_lend_execute_deposit` | execute | stable | `lend` |
| `solana_lend_execute_withdraw` | execute | stable | `lend` |
| `solana_lend_get_position` | read | beta | `lend` |
| `solana_lend_get_reserve` | read | beta | `lend` |
| `solana_lend_simulate_deposit` | simulate | stable | `lend` |
| `solana_lend_simulate_withdraw` | simulate | stable | `lend` |
| `solana_liquidity_execute_close_position` | execute | stable | `liquidity` |
| `solana_liquidity_execute_deposit` | execute | stable | `liquidity` |
| `solana_liquidity_execute_open_position` | execute | stable | `liquidity` |
| `solana_liquidity_execute_withdraw` | execute | stable | `liquidity` |
| `solana_liquidity_get_position` | read | beta | `liquidity` |
| `solana_liquidity_simulate_close_position` | simulate | stable | `liquidity` |
| `solana_liquidity_simulate_deposit` | simulate | stable | `liquidity` |
| `solana_liquidity_simulate_open_position` | simulate | stable | `liquidity` |
| `solana_liquidity_simulate_withdraw` | simulate | stable | `liquidity` |
| `solana_market_ask_iris` | read | beta | `market` |
| `solana_market_get_event_summary` | read | beta | `market` |
| `solana_market_get_price` | read | beta | `market` |
| `solana_market_get_token` | read | beta | `market` |
| `solana_market_get_token_news` | read | beta | `market` |
| `solana_market_get_trending_tokens` | read | beta | `market` |
| `solana_perp_execute_close` | execute | stable | `perp` |
| `solana_perp_execute_deposit_collateral` | execute | stable | `perp` |
| `solana_perp_execute_onboard_trader` | execute | beta | `perp` |
| `solana_perp_execute_open` | execute | stable | `perp` |
| `solana_perp_execute_withdraw_collateral` | execute | stable | `perp` |
| `solana_perp_get_onboarding_status` | read | beta | `perp` |
| `solana_perp_get_position` | read | beta | `perp` |
| `solana_perp_simulate_close` | simulate | stable | `perp` |
| `solana_perp_simulate_deposit_collateral` | simulate | stable | `perp` |
| `solana_perp_simulate_onboard_trader` | simulate | beta | `perp` |
| `solana_perp_simulate_open` | simulate | stable | `perp` |
| `solana_perp_simulate_withdraw_collateral` | simulate | stable | `perp` |
| `solana_portfolio_get_state` | read | beta | `portfolio` |
| `solana_swap_execute_swap` | execute | stable | `swap` |
| `solana_swap_get_quote` | read | beta | `swap` |
| `solana_swap_simulate_swap` | simulate | stable | `swap` |
| `solana_transfer_execute_sol` | execute | stable | `transfer` |
| `solana_transfer_simulate_sol` | simulate | stable | `transfer` |
| `solana_wallet_execute_close_token_account` | execute | stable | `wallet` |
| `solana_wallet_get_address` | read | beta | `wallet` |
| `solana_wallet_get_balance` | read | beta | `wallet` |
| `solana_wallet_simulate_close_token_account` | simulate | stable | `wallet` |
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
holding is priced — a supported-assets view, never full net worth; `wallet` has the balance and
address reads plus closing one token account the signer owns (rent back, and wrapped SOL unwrapped
to native SOL) through the shared executor; `discovery` has the search tool the MCP server
advertises first, which enables the tools a request needs (ADR-0029); `signals` has ports only.

Every `execute` tool has a `simulate` twin, and the pages linked below still describe the read tiers
in the most depth — the write tiers are specified in their ADRs (0019 lend, 0021 perp, 0022
liquidity) and their QA docs.

## Slice pages

- [Discovery](discovery.md)
- [Launch](launch.md)
- [Lend](lend.md)
- [Liquidity](liquidity.md)
- [Market](market.md)
- [Perp](perp.md)
- [Swap](swap.md)
- [Wallet](wallet.md)
