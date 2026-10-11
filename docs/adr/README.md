# Architecture decision records

One file per decision, numbered, never edited after acceptance except to mark superseded.
Each has Context, Decision, Consequences. New decisions get a new number. Accepted numbers
are not renumbered.

**0017** was never written. Git history has no add, delete, or rename of `docs/adr/0017*`.
**0024** and **0025** each name two decisions. Both files keep the shared number. A letter
suffix would retarget the `ADR-0024` and `ADR-0025` citations already in the tree, and the
Pump file is named from ADR-0027 and ADR-0028. The rows below are the file titles.

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
| [0015](0015-login-and-profiles.md) | `solos login --provider` and wallet profiles |
| [0016](0016-verification-evidence.md) | Evidence is the verification contract |
| [0018](0018-portfolio-slice.md) | Portfolio is a read model with explicit valuation scope |
| [0019](0019-lend-slice.md) | Lending uses one configured Kamino market |
| [0020](0020-launch-slice.md) | Launch buys select Pump explicitly |
| [0021](0021-perp-slice.md) | Phoenix perps use bounded IOC intent and shared account equity |
| [0022](0022-liquidity-slice.md) | Liquidity acts on identified existing positions |
| [0023](0023-swap-guard-taker-repeats.md) | Swap guard admits read-only taker repeats and nothing more (superseded by the swap spend-bound 0024) |
| [0024](0024-kamino-withdrawal-target.md) | Kamino withdrawals target underlying, but execute collateral input |
| [0024](0024-swap-spend-bound-replaces-shape-guard.md) | A measured spend bound replaces the swap shape guard |
| [0025](0025-phoenix-onboarding-wire.md) | Phoenix onboarding uses an isolated v0 co-signing wire |
| [0025](0025-pump-buys-use-the-v2-exact-quote-instruction.md) | Pump buys use `buy_exact_quote_in_v2` |
| [0026](0026-phoenix-collateral-input.md) | Phoenix collateral transfers fix input, estimate output |
| [0027](0027-pump-sells-close-the-curve-side-exit.md) | Pump sells use `sell_v2`, and wSOL on exactly one side is the direction |
| [0028](0028-pump-fees-and-recipients-are-read-per-coin.md) | Pump fees and fee recipients are read per coin, never reconstructed |
| [0029](0029-jit-tool-discovery.md) | Tool discovery is just in time: the server withholds tools and enables them on demand |
| [0030](0030-swap-signer-repeat-guard-stays.md) | The swap signer-repeat guard stays; relax it only against a captured route |
| [0031](0031-submission-order-submitter-port-and-modes.md) | Submission owns one order of steps; delivery is a `Submitter` port; parameters are named modes |
| [0032](0032-sealing-venues-hand-over-drafts.md) | Sealing: venues hand Submission a draft; Submission fetches the lifetime and signs |
| [0033](0033-simulation-never-carries-a-signature.md) | Simulation never carries a real signature, and every surface has a tier ceiling |
| [0034](0034-the-developer-lever-is-opt-in.md) | The developer lever is opt-in: `solos dev` exists only under `SOLOS_DEV=1` |
| [0035](0035-one-compiled-solos-binary.md) | One compiled `solos` binary is the distribution; the CLI ships; `solos mcp serve` |
| [0036](0036-release-lanes-and-stability-labels.md) | Release lanes: canary on every merge, stable through a reviewed release PR, promotion by pointer; every tool carries a stability label |
| [0037](0037-engine-is-a-caller.md) | The Engine is a Caller inside this repo |
| [0038](0038-unattended-strategy-spending.md) | Unattended Strategy spending |
