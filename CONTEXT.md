# CONTEXT — solOS vocabulary

Terms used in code, docs, and conversation. When a word here and a word in code disagree, fix the code.

**solOS** — this repo: a thin Solana execution layer for LLM agents. Many tools, no policy.

**Slice** — one capability (`wallet`, `transfer`, `swap`, `market`, `signals`) in
`packages/core/src/<slice>/`, internally hexagonal: `domain`, `ports`, `use-cases`, `tools`. Other
slices see only its `index.js`.

**Caller** — whatever invokes a tool: an agent loop, a swarm, the CLI, the harness. solOS is built
for Callers first; a human reaches it by prompting one, not by driving a wallet UI. A Caller acts
only within what the Operator allowed, and learns the boundary from the tool list it is given.

**Operator** — the human who owns the signer and decides what solOS is allowed to do. Sets the
boundary out of band — which wallet, which RPC, whether the execute tier exists at all — and is
not in the loop of any individual call. Policy above that boundary lives upstream (ADR-0006).

**Port** — an interface the core needs from the outside world, declared as an Effect
`Context.GenericTag` in `ports/`. Examples: `Signer`, `BalanceReader`, `SolTransfer`, `EventBus`.

**Adapter** — a `Layer` that provides a port with real I/O. Adapters live in `packages/solana`
(Kit, keychain), the harness (OTel), or the Engine (SQLite Intent store). Never in core.

**Use case** — an `Effect` in `use-cases/` that composes ports into one operation with a span.
Called by tools, the CLI, and the harness alike.

**Tool** — a slice's public verb, defined with `defineTool` in `tools/`. One definition serves the
MCP server and the harness agent loop. Named `solana_<group>_<verb>_<object>`.

**Discovery** — how a Caller learns which tools exist. Tools are registered but withheld, and a
search enables the matching ones just in time, so the Caller pays context only for what it asked
for. Takes free text, a group, or explicit names; only free text consults a `ToolSelector`. JEV
ranks when the Operator has configured it. Otherwise the local deterministic matcher ranks, and it
also takes over when JEV fails or is slow. A selection always names which one ranked it and, when
it fell back, why. A search that matches nothing explains what solOS does not cover rather than
returning silence, and a tool the tier ceiling withholds is named as existing — the tool's
existence is not the secret, the signer is.

**Tier ceiling** — the highest tier an Operator lets a server offer. Withheld tools are never
registered, so a Caller plans around what it can see instead of discovering refusals.

**Stability label** — `experimental`, `beta` or `stable` on every tool (ADR-0036): the
compatibility promise. A stable tool's name, arguments, result keys and tier change only in a
major with a Migration note; a beta tool may change in a minor; an experimental tool may change
or disappear in any release and is exposed only when the server runs with `--features
experimental`. An execute or simulate tool is stable only once `features/feature-map.json` holds
a live-validated row for the Action it names in `action`; `solos dev docs check` enforces it.

**Group** — the tool namespace, equal to the slice name. Used for search, server instructions, and
per-step activation in the agent loop.

**Tier** — `read` (no side effects), `simulate` (builds and simulates, never sends), `execute`
(signs and sends). Mapped to MCP annotations. Every `execute` has a `simulate` twin.

**Action** — what the agent wants done on chain, as a typed value from `@solos-sh/actions`
(`transfer_sol`, `swap`, ...). Who executes it is not part of the action.

**Executor** — the `ActionExecutor` port: `simulate(action)` and `execute(action)`. The default
adapter is `DirectSignerExecutor` (local keypair). `SOLOS_EXECUTOR=engine` selects
`EngineExecutor`, which forwards to the Engine (ADR-0037).

**Engine** — the process in `apps/engine` that holds the hot key and executes one-off Actions over
HTTP. A Caller reaches it with `SOLOS_EXECUTOR=engine`, `SOLOS_ENGINE_URL` and
`SOLOS_ENGINE_TOKEN`. It is a Caller inside this repo: the same tools, aimed at a remote signer.
Dry run (no flags) simulates and refuses execute. `--paper` runs the execute tier on Surfpool.
`--tier execute` is live.

**Hot key** — the keypair that lives only on the Engine host. Callers configured with
`SOLOS_EXECUTOR=engine` send Actions; they never see the key.

**Intent** — one Caller request to execute one Action, identified by `intentId`. CLI and MCP
retries reuse the id `EngineExecutor` saved for that action in the caller's config directory
(`engine-intents.sqlite`) before the first request. The Engine executes an Intent at most once.
States: `in_flight`, `settled` (with the `ExecutionResult`), `failed` (with the error envelope).
Before broadcast it stores the signature and last valid block height. On startup, or when a
request touches an in-flight Intent that has a signature, a landed signature becomes `settled`
and is not resent; `failed` waits until the blockhash has expired and the signature is still
absent; until then it stays `in_flight` and answers `IntentInFlight`. An in-flight Intent with
no signature at startup becomes `failed`, because nothing was sent. A repeat of a settled or
failed Intent returns the stored outcome.

**Strategy** — a registered, data-only description of work the Engine may later perform: a kind,
that kind's parameters, a tick source, Bounds, a lifecycle state, and an owner label. It emits
Actions. It is not an Action, a Mandate, or a Signal. The owner is a free-text label a Caller
or swarm uses to tell its registrations apart. It is never authorization.
`schedule` and `trigger` are defined in `@solos-sh/actions`. `rebalance`, `range`, and `carry`
are names until their issues ship. Nothing in this slice ticks. States are `active`,
`paused`, `done`, `expired`, and `failed`. `done`,
`expired`, and `failed` are terminal. A move the state table does not allow is refused with
`StrategyTransitionRefused`.

**Registry** — where Strategies are registered and where their state is changed. The Engine owns
the one Registry. Callers reach it through the strategy tools or `solos strategy`. A Strategy
whose allowlist widens the Engine's is refused at registration with `BoundsExceeded`.

**Bounds** — the limits one Strategy may spend, carried as `StrategyBoundsSchema`.
`maxNotionalPerTickUsd` caps the notional of one tick. `maxDailySpendUsd` caps what the Strategy
may reserve during the current UTC day. `allowedMints` lists the mints it may spend: empty means
any mint the Engine allowlist already permits, and a non-empty list can only narrow that
allowlist, never widen it. `expiresAt` is when the bounds stop authorizing spends, or null when
they do not expire on a clock. `maxConsecutiveFailures` is how many failed ticks in a row move
the Strategy to `failed`. A breach is refused with `BoundsExceeded`.

**Wallet mode / vault mode** — which executor is configured. Wallet mode is a complete product
(`SOLOS_EXECUTOR=direct`). Vault mode, if it comes, is a later Layer inside the Engine, not a
separate repo the harness depends on (ADR-0037).

**Signer** — the identity that pays and signs. Core sees only its address (`Signer` port). The
adapter holds the `KitSigner` produced by `@solana/keychain`. Backend is a config value.

**Submission** — how a venue's draft reaches the chain, always in one order: seal it (fetch a
lifetime, check it, sign), check the lifetime again, simulate, the venue's last guard, check the
lifetime again, deliver, confirm. Simulating is its first half. Venues build drafts; they never
sign or send them.

**Draft** — what a venue hands to Submission: its ordered instructions, any extra signers on
their accounts, a named compute budget and a label. It has no lifetime and no signature.
Submission never reorders or drops its instructions. _Avoid_: "unsigned transaction", "message",
and "plan", which already names a venue's computed amounts.

**Submitter** — where Submission delivers signed bytes and asks for their status: an RPC node by
default, or a landing service, bundle engine or colocated sender. It never signs or re-signs.

**Submission mode** — a named set of Submission parameters: whether to simulate, lifetime
rechecks, commitments, confirmation deadline. `slow` is the default. The Operator or code chooses
it, never the LLM through a tool. _Avoid_: "mode" alone, which already means wallet or vault mode.

**Lifetime** — how long a signed transaction can still land: until its blockhash's last valid
block height. An expired transaction can never land, so resending the same bytes is always
safe; re-signing makes a new transaction.

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

**Harness** — router, agent loop (`ToolLoopAgent`), external MCP discovery, and tracing. Imports
core directly; goes through MCP only for third-party servers.

**Lever** — the `solos` CLI used by humans and agents to verify behaviour instead of writing
throwaway scripts. Its `dev` group exists only under `SOLOS_DEV=1`, which the checkout's
`bun run solos` script sets; an installed `solos` is the operator surface alone (ADR-0034).

**Live verification** — a mainnet round with real funds. The operator approves the wallet,
cluster, token/amount cap, and SOL fee/rent cap first. Reusable tests stay on Surfnet.

**Live validation** — an execute path proven by a live-verification spend: simulated first, small
caps, then balances, signatures, fees, and residual exposure reconciled. The bar every Action
strives for. Surfpool coverage and Evidence are the pull-request check; they are not this proof.

**Evidence** — the JSON printed by `solos dev verify --json`: `ok`, `sha`, `dirty`, `scope`, tool
versions, and per-step results. The only accepted proof that a pull request's checks passed.
Counts only when `sha` is the commit under review and `dirty` is false.

**Reason / Remedy** — the two sentences a domain error carries. `reason` says what is wrong,
precisely; `remedy` names the next action (an argument, a tool, a command) and is omitted when no
action exists. Both travel beside `code` on every surface; see
[docs/reference/errors.md](docs/reference/errors.md).

**Feature map** — `features/feature-map.json`. Funded mainnet execute paths. One row per recorded
round. The row shape is `features/README.md`. No row means the path is unrecorded. Surfpool
results and unimplemented paths are not rows in this file.

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
