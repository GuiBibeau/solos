# Architecture decision records

One file per decision, numbered, never edited after acceptance except to mark superseded.
Each has Context, Decision, Consequences. New decisions get a new number.

| # | Decision |
|---|---|
| [0001](0001-bun-only-runtime.md) | Bun is the only runtime and package manager |
| [0002](0002-plain-javascript-jsdoc-zod.md) | Plain JavaScript with JSDoc types and Zod schemas |
| [0003](0003-effect-is-the-architecture.md) | Effect Tags and Layers are the ports-and-adapters mechanism |
| [0004](0004-vertical-slices-and-packages.md) | Vertical slices with hexagonal internals; five packages |
| [0005](0005-solana-stack-and-network.md) | Kit 8 + keychain; mainnet-only, the RPC URL is the only switch |
| [0006](0006-thin-execution-layer-no-policy.md) | No policy or guardrails in solOS |
| [0007](0007-tool-discovery.md) | Flat static tool list; discovery is naming and description discipline |
| [0008](0008-testing-with-surfpool.md) | Integration tests over implementation details, on Surfpool |
| [0009](0009-model-router.md) | Task classes, provider-neutral presets, gateway fallbacks |
| [0010](0010-lever-cli.md) | One `solos` CLI as operator tool and agent lever |
| [0011](0011-observability.md) | Effect logging to stderr, spans everywhere, OTel as a Layer |
| [0012](0012-mcp-sdk-v2-single-client.md) | MCP SDK v2 and one MCP client for the whole repo |
| [0013](0013-execution-through-action-executor.md) | Execution goes through `ActionExecutor`; the wallet is the default target |
| [0014](0014-solos-is-finance-harness.md) | solOS is `finance-harness`; vaults are an optional executor |
| [0015](0015-login-and-profiles.md) | `solos login --provider` and wallet profiles; env wins, then `SOLOS_PROFILE` |
| [0016](0016-verification-evidence.md) | `solos dev verify` Evidence is the verification contract |
| [0018](0018-portfolio-slice.md) | Portfolio identity, coverage and account equity |
| [0019](0019-lend-slice.md) | Lending in one explicit Kamino market |
| [0020](0020-launch-slice.md) | Explicit Jupiter or Pump swap execution |
| [0021](0021-perp-slice.md) | Phoenix account scope and finite-price IOC bounds |
| [0022](0022-liquidity-slice.md) | Identified LP positions and deterministic bin allocation |
| [0023](0023-swap-guard-taker-repeats.md) | Swap guard admits read-only taker repeats and nothing more (superseded by 0024) |
| [0024](0024-kamino-withdrawal-target.md) | Kamino withdrawals target underlying, but execute collateral input |
| [0024](0024-swap-spend-bound-replaces-shape-guard.md) | A measured spend bound replaces the swap shape guard |
| [0025](0025-phoenix-onboarding-wire.md) | Phoenix onboarding uses an isolated v0 co-signing wire |
| [0025](0025-pump-buys-use-the-v2-exact-quote-instruction.md) | Pump buys use `buy_exact_quote_in_v2` |
| [0026](0026-phoenix-collateral-input.md) | Phoenix collateral transfers fix input, estimate output |
| [0027](0027-pump-sells-close-the-curve-side-exit.md) | Pump sells use `sell_v2`; wSOL on exactly one side is the direction |
| [0028](0028-pump-fees-and-recipients-are-read-per-coin.md) | Pump fees and fee recipients are read per coin, never reconstructed |
| [0029](0029-jit-tool-discovery.md) | Tool discovery is just in time: withhold tools, enable on demand; `--tools all` escape hatch |
| [0030](0030-swap-signer-repeat-guard-stays.md) | The swap signer-repeat guard stays; relax it only against a captured route |
| [0031](0031-submission-order-submitter-port-and-modes.md) | Submission owns one order of steps; delivery is a `Submitter` port; parameters are named modes |
| [0032](0032-sealing-venues-hand-over-drafts.md) | Sealing: venues hand Submission a draft; Submission fetches the lifetime and signs |
| [0033](0033-simulation-never-carries-a-signature.md) | Simulation never carries a real signature; every surface has a tier ceiling |
| [0034](0034-the-developer-lever-is-opt-in.md) | The developer lever is opt-in: `solos dev` exists only under `SOLOS_DEV=1` |
| [0035](0035-one-compiled-solos-binary.md) | One compiled `solos` binary is the distribution; the CLI ships; `solos mcp serve` |
| [0036](0036-release-lanes-and-stability-labels.md) | Release lanes: canary on every merge, stable through a reviewed release PR, promotion by pointer; every tool carries a stability label |
| [0037](0037-engine-is-a-caller.md) | The Engine is a Caller inside this repo; `SOLOS_EXECUTOR=engine` means that process |
