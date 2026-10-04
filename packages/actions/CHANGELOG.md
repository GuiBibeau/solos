# @solos-sh/actions

## 0.3.0

### Minor Changes

- 87dad7a: Perp positions accept negative lot-size exponents: Phoenix lists markets whose lot is larger than one token (PUMP at -2). `PerpPositionSchema.decimals` now spans integers -18..255 and its description states the scale convention: uiAmount = amount x 10^-decimals.
- 05ce7e7: Add an optional `venueQuote` to `SimulationResult`: for liquidity actions it carries the plan's quoted amounts and the exact bounds encoded in the instruction (removal: liquidity, quoted and minimum receipts per side; deposit: liquidity, required and maximum spends per side) at the pre-send pool price. It is `null` for every other action, and absent-`null` results keep parsing.

### Patch Changes

- c2dddc1: Fix `AddressSchema` to accept only strings that base58-decode to exactly 32 bytes. Strings it previously accepted but that are not valid Solana pubkeys (wrong decoded byte length) now fail validation at the tool boundary with a typed input error instead of surfacing as transport errors from the RPC provider.

## 0.2.0

### Minor Changes

- d699df2: Prepare the 0.2 trading contracts: explicit optional Jupiter/Pump routing, identified LP
  add/remove intents, market-scoped lending and finite-price, account-scoped Phoenix IOC intents.
  Positions discriminate wallet assets, supply claims, perp exposure and LP principal, with signed
  shared perp equity recorded once per account. Transfer and ordinary swap shapes are preserved.
  Dormant lend/perp callers must supply the new bounds/identities; see the package migration guide.
