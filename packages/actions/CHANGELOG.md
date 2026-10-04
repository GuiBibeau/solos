# @solos-sh/actions

## 0.4.0

### Minor Changes

- 556a588: The contract package publishes as `@solos-sh/actions`. The `@solos` npm scope belongs to another
  account, so `@solos/actions`, which was never published, is renamed before its first release;
  imports change from `@solos/actions` to `@solos-sh/actions` and nothing else does.
- d8dd480: Add the `close_token_account` Action. It closes one token account the signer owns and returns its rent, and closing the wrapped-SOL account unwraps its whole balance to native SOL. Simulation quotes gain a `token_account_close` variant naming the mint, the token program, the lamports returned and the lamports unwrapped. `ExecutionResult.position` now also names the personal position a Raydium open created, not only a Meteora PositionV2.
- 7093287: Venue quotes gain a `lend_deposit` variant: Kamino deposit simulations now carry the exact encoded underlying amount, the predicted collateral receipt at the read-time exchange rate, whether the transaction initializes the obligation, and pre-send rent and transaction-fee evidence.
- 914688d: Add a typed Kamino withdrawal simulation quote with requested underlying, encoded collateral, observed exchange-rate evidence and any collateral-farm initialization rent.
- 7f17712: `open_position` accepts an empty Meteora DLMM open: `protocol: "meteora"`, the LbPair as `pool`, and an explicit `lowerBinId` plus `width`. Illegal widths are rejected rather than clamped. Execution results may include `position`, the PositionV2 account this open created. Simulation quotes gain `meteora_position_open`.
- 2a89792: Add fixed-input Phoenix collateral Action variants, simulated non-guaranteed output quotes, and confirmed wallet/trader reconciliation results for explicit USDC deposits and collateral-token withdrawals. Offline executor tests do not establish live Phoenix program execution.
- 1dfb992: Add the bounded `close_perp` Action for explicit Phoenix reduce-only IOC exits.
- 9fefd57: Add the explicit bounded `open_perp` IOC action for Phoenix Perps, with a finite limit price, maximum notional and leverage.
- 2e68024: Add the explicitly invoked Phoenix default-trader onboarding Action, simulated and executed by the configured signer.
- 8624632: Add the `open_position` and `close_position` Action variants, so a concentrated-liquidity position can be created and retired rather than only added to and removed from. The tick range is the caller's: both ticks are explicit and validated (lower strictly below upper), never inferred or rounded. Venue quotes gain a `position_open` variant carrying the range, the liquidity the budgets buy at the pre-send pool price, and the encoded spend bounds; it deliberately omits the position NFT mint, which is generated per build and so differs between a simulation and the execute that follows it.
- 2722e7a: A `pump` swap may now carry wSOL on either side. The venue previously required wSOL as the input mint, which described a buy and refused every sell; the rule is now that exactly one side must be wSOL — the input to buy the coin, the output to sell it. A pump swap still cannot express a token-to-token route, and the venue's positive-amount and 0..9999 bps slippage bounds are unchanged. `WSOL_MINT` is exported alongside the schemas.
- 57af689: `AddLiquidityAction` and `OpenPositionAction` gain `wrapSol`, default false. When set, the funding side wraps exactly the native SOL the quote is short — never the whole budget — inside the same transaction that spends it, and unwraps the remainder when that transaction created the account. A pre-existing wSOL account is topped up but never closed: its rent is the caller's. Left false, a wSOL side must already be funded and is refused otherwise, so solOS never moves native SOL the caller did not name.

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
