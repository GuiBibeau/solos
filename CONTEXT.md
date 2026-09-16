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

**Live verification** — running `solos` commands against mainnet with real funds, allowed for
Claude Code on request. Distinct from reusable tests, which stay on Surfnet.

**Factory** — the eve app in `apps/factory` that turns a Work item into a draft pull request
through Stations. Holds no signer, RPC URL, profile, or gateway key.

**Station** — one stage of the Factory run by its own subagent in its own sandbox: classifier,
analyst, implementer, reviewer, and the optional researcher.

**Work item** — a GitHub issue with acceptance criteria that reached Ready by receiving the
`agent-ready` label.

**Acceptance criteria** — the checkable statements the analyst copies from the Work item and may
only extend; the reviewer judges the diff against them one by one.

**Evidence** — the JSON printed by `solos dev verify --json`: `ok`, `sha`, `dirty`, `scope`, tool
versions, and per-step results. The only accepted proof of work. Counts only when `sha` is the
commit under review and `dirty` is false.

**Scope** — how much `verify` runs: `check` (format, lint, dependency rules, types), `unit`
(plus unit tests), `full` (plus Surfpool integration tests).

**Human gate** — marking a draft pull request ready and merging it. Never done by the Factory.

**Protected path** — a file or directory the Factory may not change: `packages/actions/`,
`docs/adr/`, `.github/`, lint and type configuration, `LICENSE`. Enforced by CODEOWNERS and CI.
