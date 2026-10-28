---
"@solos-sh/actions": minor
---

Accept `kind: "carry"` on the Strategy contract. `CarryParamsSchema` names the Phoenix market, the spot and quote mints, the per-leg USD notional, the entry and exit funding hurdles, the trailing lookback, the expected hold that amortises round-trip cost, and slippage and leverage. `exitHurdleAprPct` must be strictly below `entryHurdleAprPct`. Open and close perp Actions may name `protocol: "phoenix"`. All five Strategy kinds are now accepted.
