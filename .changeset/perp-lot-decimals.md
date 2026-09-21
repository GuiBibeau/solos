---
"@solos/actions": minor
---

Perp positions accept negative lot-size exponents: Phoenix lists markets whose lot is larger than one token (PUMP at -2). `PerpPositionSchema.decimals` now spans integers -18..255 and its description states the scale convention: uiAmount = amount x 10^-decimals.
