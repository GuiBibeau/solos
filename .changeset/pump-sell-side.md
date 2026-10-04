---
"@solos-sh/actions": minor
---

A `pump` swap may now carry wSOL on either side. The venue previously required wSOL as the input mint, which described a buy and refused every sell; the rule is now that exactly one side must be wSOL — the input to buy the coin, the output to sell it. A pump swap still cannot express a token-to-token route, and the venue's positive-amount and 0..9999 bps slippage bounds are unchanged. `WSOL_MINT` is exported alongside the schemas.
