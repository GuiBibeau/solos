# CONTEXT — solOS vocabulary

Terms used in code, docs, and conversation. When a word here and a word in code disagree, fix the code.

**solOS** — this repo: a thin Solana execution layer for LLM agents. Many tools, no policy.

**Slice** — one capability (`wallet`, `transfer`, `swap`, `market`, `signals`) in
`packages/core/src/<slice>/`, internally hexagonal: `domain`, `ports`, `use-cases`, `tools`. Other
slices see only its `index.js`.

**Port** — an interface the core needs from the outside world, declared as an Effect
`Context.GenericTag` in `ports/`. Examples: `Signer`, `BalanceReader`, `SolTransfer`, `EventBus`.

**Adapter** — a `Layer` that provides a port with real I/O. Lives in `packages/solana` (Kit,
keychain) or the harness (sqlite, OTel). Never in core.

**Use case** — an `Effect` in `use-cases/` that composes ports into one operation with a span.
Called by tools, the CLI, and the harness alike.

**Tool** — a slice's public verb, defined with `defineTool` in `tools/`. One definition serves the
MCP server and the harness agent loop. Named `solana_<group>_<verb>_<object>`.

**Group** — the tool namespace, equal to the slice name. Used for search, server instructions, and
per-step activation in the agent loop.

**Tier** — `read` (no side effects), `simulate` (builds and simulates, never sends), `execute`
(signs and sends). Mapped to MCP annotations. Every `execute` has a `simulate` twin.

**Action** — what the agent wants done on chain, as a typed value from `@solos/actions`
(`transfer_sol`, `swap`, ...). Who executes it is not part of the action.

**Executor** — the `ActionExecutor` port: `simulate(action)` and `execute(action)`. The default
adapter is `DirectSignerExecutor` (local keypair). A vault engine is another adapter, optional.

**Wallet mode / vault mode** — which executor is configured. Wallet mode is a complete product;
vault mode plugs the same tools into pooled custody through `vault-engine`.

**Signer** — the identity that pays and signs. Core sees only its address (`Signer` port). The
adapter holds the `KitSigner` produced by `@solana/keychain`. Backend is a config value.

**Network** — not a concept. `SOLANA_RPC_URL` is the only switch. Mainnet unless the URL says
otherwise.

**Surfnet** — a local Solana network from Surfpool, forking mainnet lazily or running offline.
Tests start one automatically (`ensureSurfnet`). `solos dev surfpool` manages one for humans.

**Cheatcode** — a `surfnet_*` RPC method that mutates local state: fund SOL, set a token balance,
create a mint, time travel.

**Event** — `{ type, at, payload }` on the in-process `EventBus`. Types are dotted lowercase
(`transfer.sent`, `signal.received`). `EventSink` is where events would persist.

**Signal** — an item from a live feed (X post, price alert) delivered by a `SignalSource`.

**Router** — maps a task class (`fast`, `default`, `reasoning`) to a gateway model string plus
fallbacks and a reasoning level. Presets per provider, selected by `ROUTER_PRESET`.

**Harness** — the long-running app: daemon (event loop), router, agent loop (`ToolLoopAgent`),
store. Imports core directly; goes through MCP only for third-party servers.

**Lever** — the `solos` CLI used by humans and agents to verify behaviour instead of writing
throwaway scripts.

**Live verification** — a mainnet round with real funds. The operator approves the wallet,
cluster, token/amount cap, and SOL fee/rent cap first. Reusable tests stay on Surfnet.

**Live validation** — an execute path proven by a live-verification spend: simulated first, small
caps, then balances, signatures, fees, and residual exposure reconciled. The bar every Action
strives for. Surfpool coverage and Evidence are the pull-request check; they are not this proof.

**Evidence** — the JSON printed by `solos dev verify --json`: `ok`, `sha`, `dirty`, `scope`, tool
versions, and per-step results. The only accepted proof that a pull request's checks passed.
Counts only when `sha` is the commit under review and `dirty` is false.

**Feature map** — `features/feature-map.json`. Which Actions are live-validated, Surfpool-only, or
unimplemented. Rows appear after a round is run. The file starts empty.

**Scope** — how much `verify` runs: `check` (format, lint, dependency rules, types), `unit`
(plus unit tests), `full` (plus Surfpool integration tests).

**Position** — a discriminated wallet-token, Kamino supply, Phoenix exposure or LP principal
record. Identity is per owner and mint, market/mint/obligations, trader/market, or LP account;
see ADR-0018. Native SOL uses instrument `SOL`, distinct from the wSOL mint.

**Withdrawal target** — the underlying base-unit amount used to select an exactly representable
collateral input at the observed Kamino reserve rate. It is not a guaranteed on-chain output;
credited underlying can differ when the rate moves before inclusion. _Avoid_: exact withdrawal.

**Collateral input** — the receipt-token units actually encoded in a Kamino withdrawal;
underlying output is estimated at the read-time rate and measured after confirmation.

**Phoenix onboarding-ready** — the configured trader is registered with immediate permissions to place market orders, increase risk and deposit collateral. A registered `cold` trader can be ready while unfunded; ready never implies sufficient equity to open a position.

**Perp account equity** — signed USD collateral plus PnL/funding under the pinned venue math,
counted once per trader account in PortfolioState.perpAccounts. It is never leveraged notional.
Per-market Position.valueUsd is null and its amount is absolute exposure with explicit side.

**Price bound** — required limitPriceUsd on perp Actions: maximum buy or minimum sell USD per
base token. IOC tick rounding tightens the bound and quote-lot caps constrain open notional.

**Phoenix collateral input** — the fixed token amount the transaction encodes: wallet USDC base
units on deposit, Phoenix collateral-token base units on withdrawal. An estimated received amount
is not a guaranteed minimum; only post-confirmation balance reads establish the actual credit.

**LP position** — an existing protocol position account, never its NFT mint or its pool. Adds
preserve its range and A/B maximum spends; removes take an explicit 1..10000 bps fraction of its
liquidity, preserving account/NFT. Underlying principal is separate from shares and unclaimed fees.

**Venue selector** — swap Action.venue; omission means Jupiter. Launch buys explicitly choose
pump. No mint-based route inference, fallback, or public swap-tool venue argument.

**Complete enumeration** — a bounded owner read that returns all supported positions and the
receipt mints they represent, or fails explicitly. Missing optional coverage is distinct from a
configured provider failure. Supported-assets valuation is not full net worth or debt accounting.
