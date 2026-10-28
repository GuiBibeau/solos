---
"@solos-sh/actions": minor
---

LpPosition gains an optional `range`. Meteora positions carry `lowerBinId` and `upperBinId`; Orca and Raydium positions carry `tickLower` and `tickUpper`. Records written before the field existed still parse.
