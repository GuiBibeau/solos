# Phoenix Perps live QA

Offline tests exercise the real adapter, CLI, and MCP server against loopback HTTP fixtures at
`PHOENIX_BASE_URL`. They cannot establish what a live registered account holds. Live QA
compares solOS output with the Phoenix UI for an operator account.

**Status: blocked.** A funded, registered read needs operator prerequisites that CI does not have:
a Phoenix Perps account registered for the operator's signer
(traderPdaIndex 0, activated), collateral deposited, and — before the later funded open/close
QA (#27/#28) — enough equity to hold a position. Reads themselves are public, so no credential
is provisioned anywhere; the only configuration is `PHOENIX_BASE_URL` (leave it unset for the
production endpoint `https://perp-api.phoenix.trade`). Live credentials belong only in the
operator or approved QA environment, never in issue comments, tool inputs, or implementation
sandboxes.

## What to compare once an operator account exists

1. Pick the signer's trader account (subaccount 0). Run:

   ```sh
   bun run solos perp position --market SOL
   bun run solos mcp call solana_perp_get_position --args '{"market":"SOL"}'
   ```

2. Compare against Phoenix, market by market:
   - `position.side` and the sign: a UI short must arrive as `side: "short"` with a positive
     absolute `amount`, never a negative or unsigned amount.
   - `position.amount` / 10^`decimals` equals the UI's position size in the base token.
   - `position.valueUsd` is null; the UI's "position value" is leveraged notional and must
     never be read as equity.
   - `account.equityUsd` vs the UI's account equity, when the account has an open position or
     spot collateral the snapshot cannot value, solOS reports null by design (ADR-0021): only
     compare when the output is non-null, and treat null as "unknown complete equity", not
     zero.
   - A market with no position on a registered account must return `side: "flat"`,
     `amount: "0"`, and the account equity once.
3. Repeat for a second market so the shared collateral/equity is seen counted once across
   markets, not duplicated per market.

## Reporting

Record live QA as `blocked` until the prerequisites above exist. Never report it as passed
from fixture runs: fixture-backed suites say `mode: fixture` implicitly and prove adapter
behavior, not venue state. The first funded QA round belongs with the #27/#28 prerequisites,
after registration and collateral, run from the operator environment.
