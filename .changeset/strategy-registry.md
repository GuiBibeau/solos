---
"@solos-sh/actions": minor
---

Add the Strategy contract: `StrategySchema`, `StrategyDraftSchema`, `TickSourceSchema`, `StrategyStateSchema`, and the `schedule` and `trigger` parameter schemas. `rebalance`, `range`, and `carry` stay named in the union and fail validation until their issues ship. Stream tick sources fail until streams exist.
