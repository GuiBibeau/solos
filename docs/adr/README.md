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
| [0016](0016-software-factory-and-evidence.md) | Software factory in `apps/factory` on eve; `solos dev verify` Evidence is the verification contract |
