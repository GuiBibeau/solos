---
"@solos-sh/actions": minor
---

Add the `close_token_account` Action. It closes one token account the signer owns and returns its rent, and closing the wrapped-SOL account unwraps its whole balance to native SOL. Simulation quotes gain a `token_account_close` variant naming the mint, the token program, the lamports returned and the lamports unwrapped. `ExecutionResult.position` now also names the personal position a Raydium open created, not only a Meteora PositionV2.
