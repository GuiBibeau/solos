---
"@solos/actions": minor
---

Add an optional `venueQuote` to `SimulationResult`: for liquidity actions it carries the plan's quoted amounts and the exact bounds encoded in the instruction (removal: liquidity, quoted and minimum receipts per side; deposit: liquidity, required and maximum spends per side) at the pre-send pool price. It is `null` for every other action, and absent-`null` results keep parsing.
