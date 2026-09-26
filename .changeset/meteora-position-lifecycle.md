---
"@solos/actions": minor
---

`open_position` accepts an empty Meteora DLMM open: `protocol: "meteora"`, the LbPair as `pool`, and an explicit `lowerBinId` plus `width`. Illegal widths are rejected rather than clamped. Execution results may include `position`, the PositionV2 account this open created. Simulation quotes gain `meteora_position_open`.
