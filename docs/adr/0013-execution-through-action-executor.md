# 0013 — Execution goes through `ActionExecutor`; the wallet is the default target

Status: accepted, 2026-09-16

## Context

The product plan (`docs/plan.md`) separates deciding from acting: an agent proposes a typed action
and an executor turns it into a transaction. Until now `solana_transfer_execute_sol` signed with the
local keypair directly, with no seam between the use case and the signer. That is the right
behaviour for wallet mode, but it left no place to plug a vault engine in later without touching
core.

## Decision

- A shared port `ActionExecutor` in `packages/core/src/shared/ports/` with `simulate(action)` and
  `execute(action, { skipSimulation })`. Inputs and outputs are the `Action`, `SimulationResult`,
  and `ExecutionResult` schemas from `@solos/actions`.
- Execute-tier use cases build an `Action` and call the port. They never see a signer or an RPC.
- `DirectSignerExecutor` in `packages/solana` is the default adapter: today's Kit + keychain code,
  one branch per supported action type, `UnsupportedAction` for the rest. It is the right target
  for a personal or treasury wallet, for paper mode on Surfpool, and for dev.
- `SOLOS_EXECUTOR` selects the adapter at the composition root. Only `direct` exists; `engine` is
  reserved for a `VaultEngineExecutor` Layer that talks to `vault-engine`.
- Execution errors (`SimulationFailed`, `TransactionFailed`, `UnsupportedAction`) move to shared,
  because every executor can raise them. `InsufficientFunds` stays in `transfer`: it is checked
  before any executor is involved.

## Consequences

- Tool names, tiers, schemas, and MCP output did not change. The existing integration tests passed
  unchanged in intent, which was the definition of done for this refactor.
- Adding an action type is one schema variant plus one executor branch.
- A vault is an optional executor, never a dependency of the harness (ADR-0014).
