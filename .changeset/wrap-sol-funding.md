---
"@solos-sh/actions": minor
---

`AddLiquidityAction` and `OpenPositionAction` gain `wrapSol`, default false. When set, the funding side wraps exactly the native SOL the quote is short — never the whole budget — inside the same transaction that spends it, and unwraps the remainder when that transaction created the account. A pre-existing wSOL account is topped up but never closed: its rent is the caller's. Left false, a wSOL side must already be funded and is refused otherwise, so solOS never moves native SOL the caller did not name.
