# @solos/actions

The contract between an agent that decides and an executor that acts on Solana.

- `Action`: what the agent wants done (`transfer_sol`, `swap`, `open_perp`, `close_perp`, `lend`,
  `withdraw_lend`). Who executes it (a wallet, a vault, a multisig) is not part of the action.
- `PortfolioState`, `Mandate`: what the agent reads before deciding. Both work for a plain wallet.
- `SimulationResult`, `ExecutionResult`: what every executor returns.
- `VaultState`: for vault consumers only. Nothing in solOS core requires it.

Zod 4 schemas, plain JavaScript, no runtime dependency beyond `zod`. Amounts are decimal strings
because JSON has no bigint. This is the only published package of the solOS monorepo; treat every
change as a versioned API change.
