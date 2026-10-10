# Strategy

Part of the [tool reference](index.md).

A Strategy is a registered description of later work: a kind, that kind's parameters, a tick
source, Bounds, and a lifecycle state. Registering one stores it. Nothing ticks in this slice,
and no transaction is signed. `schedule` and `trigger` are the kinds the contract accepts.
`rebalance`, `range`, and `carry` are names that fail until their issues ship.

The Engine owns the Registry (ADR-0037). Callers reach it with these tools or with
`solos strategy`, both of which talk to the Engine over HTTP. Core registers the eleven MCP
tools unconditionally, so they always exist. `STRATEGIES` is a `feature()` flag fixed when
Bun loads the code (`bun --feature=STRATEGIES`); release builds leave it off. `bun run solos`
starts a second Bun and drops `--feature`, so both the Engine and the CLI group are started
with the flag on the same process:

```sh
bun --feature=STRATEGIES run apps/cli/src/main.js engine start --tier execute \
  --allowed-mints So11111111111111111111111111111111111111112,EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
bun --feature=STRATEGIES run apps/cli/src/main.js strategy register --file strategy.json
```

`--allowed-mints` is the Engine allowlist. An execute-tier Engine refuses to start without
it. `--allowed-mints any` allows every mint. A comma-separated list allows only those mints.
Paper and dry-run Engines default to any mint when the flag is omitted. Native SOL is priced
through the wrapped SOL mint `So11111111111111111111111111111111111111112`. Against an Engine
built without the flag, a tool call returns `EngineUnavailable` with a remedy naming the flag.
In direct mode (`SOLOS_EXECUTOR=direct`) a strategy tool returns `EngineConfigMissing` because
there's no Engine to hold a Registry.

## Bounds

Each Strategy carries `StrategyBoundsSchema`. `maxNotionalPerTickUsd` caps one tick.
`maxDailySpendUsd` caps the UTC day. `allowedMints` empty means any mint the Engine allowlist
already permits; a non-empty list can only narrow that allowlist, never widen it. Widening is
refused at registration with `BoundsExceeded`, and `requested` names the mint. `expiresAt` is
the clock expiry, or null. `maxConsecutiveFailures` is how many failed ticks in a row fail the
Strategy. A breach is refused with `BoundsExceeded`.

## Lifecycle

States are `active`, `paused`, `done`, `expired`, and `failed`. A Caller may pause (`paused`),
resume (`active`), or cancel (`done`). `done`, `expired`, and `failed` are terminal. Any other
move is refused with `StrategyTransitionRefused`, which carries `from` and `to`.

## Tools

`solana_strategy_list_strategies` and `solana_strategy_get_status` read the Registry.

`solana_strategy_simulate_register` validates a draft and returns the Actions a first tick would
emit. A schedule returns its configured Actions. A trigger also returns the observed price.
The comparison is strict: an exact match emits nothing. The Registry is unchanged.
`solana_strategy_execute_register` stores the Strategy and returns `{ id, state: "active" }`.
The id survives an Engine restart.

`solana_strategy_simulate_update` reports whether a move to `active`, `paused`, or `done` is
allowed, including `allowed: false` and the refusal when the Strategy is already `done`. It
applies nothing. `solana_strategy_execute_update` applies a move the state table allows.

`solana_strategy_get_kill_switch` reads whether a scope is engaged.
`solana_strategy_simulate_engage_kill` and `solana_strategy_simulate_disengage_kill` preview a
change and write nothing. `solana_strategy_execute_engage_kill` and
`solana_strategy_execute_disengage_kill` apply it. A scope of `global` covers every Strategy.
Any other scope is one Strategy id.

`solos strategy register --file <path>`, `list`, `status <id>`, `pause <id>`, `resume <id>`, and
`cancel <id>` are the same operations. `solos strategy kill --scope <scope> --reason <text>`,
`kill-status --scope <scope>`, and `disengage --scope <scope>` are the kill switch. They need
`SOLOS_ENGINE_URL` and `SOLOS_ENGINE_TOKEN`, and the CLI process needs `--feature=STRATEGIES`.

## Caps on an execute

`POST /v1/actions/execute` takes optional `strategyId` and `tickId`, together. The Engine
reserves the transfer's SOL notional before anything is signed. The hold is the lamports
plus the fee reserve the transfer builder sets: the base signature fee plus the priority
fee from its compute-unit price times its compute-unit limit. A nonpositive wrapped-SOL
price is `PriceUnavailable` and nothing is reserved. A confirmed transfer settles that
reserved notional once. A transaction that lands with an execution error settles the fee
it paid, priced the same way as the hold.
Nothing signed, or a blockhash that expires with the signature still absent, releases the hold.
If the Engine stops after broadcast and before confirm, the hold stays open and keeps counting
against the per-tick and daily caps while the Intent is `in_flight`. Restart does not release
it and does not reserve it again. Recovery settles it once when the signature has landed.
