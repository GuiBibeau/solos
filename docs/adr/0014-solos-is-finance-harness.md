# 0014 — solOS is `finance-harness`; vaults are an optional executor

Status: accepted, 2026-09-16
Amended by ADR-0037.

## Context

The product plan has three repos: `finance-harness` (agent runtime, tool registry, MCP, CLI),
`vault-engine` (deterministic validation and execution), `vault-core` (on-chain custody). This
repo already contains everything the plan lists under `finance-harness`, with Solana as its first
environment. The team also does not want the harness to require vaults: it must be a complete
product operating a plain wallet, and become vault-compatible later.

## Decision

- This repo is `finance-harness`. `apps/harness` is the agent runtime, `packages/core/*/tools` is
  the tool registry, `packages/solana` is the first `FinancialEnvironment`. A rename is optional.
- The shared contract lives here as `packages/actions` (`@solos/actions`), the only published
  package. Its central type is `Action`, not `VaultAction`: who executes is not part of the action.
  `VaultState` lives in the package but nothing in core requires it.
- Vaults are a parallel, optional track. `vault-engine` consumes `@solos/actions` and is reached
  through a future `VaultEngineExecutor` Layer (ADR-0013). solOS never imports `vault-core`.
- Wallet mode is the default and a first-class product mode, not a stepping stone.
- Surfpool forked from mainnet is the paper environment. Devnet is not used at any step.

## Consequences

- Nothing in Step 0 or Step 1 of `docs/plan.md` waits on a vault decision.
- Policy placement is unchanged from ADR-0006: none in solOS. In vault mode it lives in
  `vault-engine`; in wallet mode it lives above solOS.
- `packages/actions` changes are versioned API changes and get changelog entries.
