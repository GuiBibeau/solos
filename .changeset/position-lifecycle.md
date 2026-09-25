---
"@solos/actions": minor
---

Add the `open_position` and `close_position` Action variants, so a concentrated-liquidity position can be created and retired rather than only added to and removed from. The tick range is the caller's: both ticks are explicit and validated (lower strictly below upper), never inferred or rounded. Venue quotes gain a `position_open` variant carrying the range, the liquidity the budgets buy at the pre-send pool price, and the encoded spend bounds; it deliberately omits the position NFT mint, which is generated per build and so differs between a simulation and the execute that follows it.
