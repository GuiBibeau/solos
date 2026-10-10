# Strategy

Part of the [tool reference](index.md).

A Strategy is a registered description of later work: a kind, that kind's parameters, a tick
source, Bounds, and a lifecycle state. Registering one stores it. Nothing ticks in this slice,
and no transaction is signed. `schedule` and `trigger` are the kinds the contract accepts.
`rebalance`, `range`, and `carry` are names that fail until their issues ship.

The Engine owns the Registry (ADR-0037). Callers reach it with these tools or with
`solos strategy`, both of which talk to the Engine over HTTP. The CLI group and the Engine
routes are compiled in only when the process is started with the STRATEGIES flag. A process
without that flag has no `solos strategy` group, serves no `/v1/strategies` routes, and a tool
call against it returns `EngineUnavailable` naming the flag.

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
emit. A schedule returns its configured Actions. A trigger also returns the observed price. The
Registry is unchanged. `solana_strategy_execute_register` stores the Strategy and returns
`{ id, state: "active" }`. The id survives an Engine restart.

`solana_strategy_simulate_update` reports whether a move to `active`, `paused`, or `done` is
allowed, including `allowed: false` and the refusal when the Strategy is already `done`. It
applies nothing. `solana_strategy_execute_update` applies a move the state table allows.

`solos strategy register --file <path>`, `list`, `status <id>`, `pause <id>`, `resume <id>`, and
`cancel <id>` are the same operations. They need `SOLOS_ENGINE_URL` and `SOLOS_ENGINE_TOKEN`.
