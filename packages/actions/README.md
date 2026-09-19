# @solos/actions

The contract between an agent that decides and an executor that acts on Solana.

`Action` expresses intent; `PortfolioState` and `Mandate` express observations and constraints.
`SimulationResult` and `ExecutionResult` carry the original Action and execution outcome.
`VaultState` is for vault consumers only. These Zod 4 schemas have no adapter or SDK dependencies.
Integer quantities are decimal strings; never convert them through JavaScript Number.

## Trading contract migration (0.2)

The minor changeset moves this pre-1.0 package from 0.1 to 0.2 through the release workflow.
Existing transfer and ordinary swap Actions serialize unchanged. Optional swap `venue` selects
`jupiter` or `pump`; omitted venue means Jupiter without adding a serialized default. Public swap
tools stay Jupiter-only. Supporting the schema does not imply an executor supports every venue.

Previously dormant lend/withdraw Actions now require the configured Kamino `market` and a
positive u64 underlying amount. Dormant perp Actions now require both trader indices (0 only)
and a positive `limitPriceUsd`; open notional is positive u64 in 1e6 USD units. Old unbounded
payloads intentionally fail validation. Do not fabricate defaults for these new required fields.

New LP Actions identify an existing position account, never an NFT mint. Adds use maximum A/B
spend budgets in canonical pool mint order, at least one positive. Removes use bps 1..10000.
LP slippage is 0..9999; adapters must enforce actual spend/minimum receipts and conservative
rounding. Schemas encode intent; on-chain ownership, layout, price ticks, lots and fee accounting
are executor responsibilities. A confirmed IOC order may have zero or partial fills.

Wallet token positions keep their old shape; native SOL uses instrument `SOL`, not wSOL's mint.
Portfolio validation rejects duplicate identities across cash and positions: token by mint,
lending by protocol/market/mint, perps by protocol/account/market, and LPs by protocol/position.
Unknown nonzero principal value or unknown account equity requires a null aggregate valuation;
zero principal and per-market perp null values do not make known equity unknown.
Lend positions add market and contributing obligation addresses; nonzero supply requires at
least one obligation. Perps add account and side;
amount is absolute exposure, with zero exactly `flat`. Shared signed equity lives once in
`perpAccounts`, never in market valueUsd or notional. LP records have position identity, raw
liquidity shares and two underlying quantities, not a generic amount/decimals pair. Consumers
must narrow by `kind`. Portfolio cash contains only wallet tokens. Perp positions require a
matching equity observation; duplicate account observations fail. Missing perpAccounts defaults
to [] for portfolios without perps. Old lend/perp records need explicit migration; do not parse
and silently drop account identity. Unknown values are null. This is a supported-assets view,
not complete debt-adjusted net worth. See ADRs 0018–0022 in the repository for execution rules.

## Exact Action examples

The addresses below are illustrative identities, not provisioned execution targets. Prices and
amounts illustrate units, not current quotes. All eight discriminants are included.

```js
import { ActionSchema, PositionSchema, PortfolioStateSchema } from "@solos/actions";

const owner = "7Zr8cNF4XeAgP3ttjTgzHk5Ffm4NWEoHuHybwDC6D8dY";
const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const wsol = "So11111111111111111111111111111111111111112";
const market = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";
const position = owner;
const pool = market;
const actions = [
  { type: "transfer_sol", to: owner, lamports: "1000000" },
  { type: "swap", inputMint: wsol, outputMint: usdc, amount: "10000000", maxSlippageBps: 50 },
  { type: "swap", venue: "jupiter", inputMint: wsol, outputMint: usdc,
    amount: "10000000", maxSlippageBps: 50 },
  { type: "swap", venue: "pump", inputMint: wsol, outputMint: owner,
    amount: "1000000", maxSlippageBps: 50 },
  { type: "open_perp", market: "SOL-PERP", traderPdaIndex: 0, traderSubaccountIndex: 0,
    side: "long", notionalUsd: "1000000", maxLeverage: 1, limitPriceUsd: "150.25" },
  { type: "close_perp", market: "SOL-PERP", traderPdaIndex: 0, traderSubaccountIndex: 0,
    limitPriceUsd: "149.75" },
  { type: "lend", protocol: "kamino", market, mint: usdc, amount: "1000000" },
  { type: "withdraw_lend", protocol: "kamino", market, mint: usdc, amount: "1000000" },
  { type: "add_liquidity", protocol: "orca", pool, position,
    amountA: "1000000", amountB: "0", maxSlippageBps: 50 },
  { type: "remove_liquidity", protocol: "orca", position, bps: 10000, maxSlippageBps: 50 },
];
actions.forEach((action) => ActionSchema.parse(action));
```

The LP forms also accept `meteora` and `raydium` with the same fields. A Phoenix short changes
side to `short` and uses limitPriceUsd as the minimum sell price. A close derives direction from
current exposure and is always reduce-only. Pump budgets include protocol trading fees, but
network fees and rent are separate. Pump schema validation requires wSOL as input identity,
a positive u64 amount and slippage of 0..9999 bps. Ordinary swap validation remains compatible with 0.1;
venue executors must reject unsupported, zero or unsafe amounts before submission.

## Exact Position and portfolio examples

Using the illustrative identities above:

```js
const cash = { kind: "token", instrument: "SOL", protocol: null,
  amount: "1000000000", decimals: 9, valueUsd: null };
const positions = [
  { kind: "token", instrument: wsol, protocol: null,
    amount: "10000000", decimals: 9, valueUsd: null },
  { kind: "lend", protocol: "kamino", market, instrument: usdc, positions: [owner],
    amount: "1000000", decimals: 6, valueUsd: null },
  { kind: "perp", protocol: "phoenix", account: owner, instrument: "SOL-PERP",
    side: "short", amount: "10000000", decimals: 9, valueUsd: null },
  { kind: "lp", protocol: "orca", position, instrument: pool, liquidity: "123456789",
    tokenA: { mint: usdc, amount: "1000000", decimals: 6 },
    tokenB: { mint: wsol, amount: "10000000", decimals: 9 }, valueUsd: null },
];
positions.forEach((record) => PositionSchema.parse(record));
PortfolioStateSchema.parse({ owner, cash: [cash], positions,
  perpAccounts: [{ protocol: "phoenix", account: owner, equityUsd: "-0.125000" }],
  valuationUsd: null, at: 1700000000000 });
```

A flat perp uses side `flat` and amount `0`; account equity can still be nonzero. Missing prices
or incomplete equity produce null, never an invented zero. LP amounts represent principal only,
excluding unclaimed fees/rewards; raw shares cannot be valued directly. Distinct position
accounts in the same pool remain separate records. Portfolio aggregation excludes receipt/NFT
mints only after successful venue enumeration and counts each shared equity observation once.
