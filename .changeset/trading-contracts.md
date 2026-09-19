---
"@solos/actions": minor
---

Prepare the 0.2 trading contracts: explicit optional Jupiter/Pump routing, identified LP
add/remove intents, market-scoped lending and finite-price, account-scoped Phoenix IOC intents.
Positions discriminate wallet assets, supply claims, perp exposure and LP principal, with signed
shared perp equity recorded once per account. Transfer and ordinary swap shapes are preserved.
Dormant lend/perp callers must supply the new bounds/identities; see the package migration guide.
