# 0041 — Trigger strategies tick on a clock and spend when a price crosses

Status: accepted, 2026-10-28. Extends ADR-0037 and ADR-0038.

## Context

Issue #199 asks for one Strategy kind that a trader would call a limit, a stop, a take-profit,
or a trailing order. The parameters were already on `TriggerParamsSchema`: one USD price
Observation, `above` or `below`, exactly one of `priceUsd` and `trailingBps` (an integer from
50 to 9000), one Action, `once` defaulting to true, and `cooldown` when `once` is false.

The tick runner only woke `schedule`. A trigger could be stored and simulated, and then never
ran. The price feed returns `String(usdPrice)` from a JSON number, so a mint priced below one
millionth of a dollar can arrive as `1e-7`. A restart after `nextDueAt` records one `missed`
Tick. That Tick had no state, and the next evaluation read only the newest Tick, so a trailing
reference and a cooldown disappeared after the gap.

## Decision

- **The clock wakes `schedule` and `trigger`.** `nextDueInstant` is the same interval or cron
  the Strategy already carries. Other kinds stay unscheduled until their issues ship.
- **The comparison is strict and exact.** Fixed `priceUsd` fires only when the observed price
  is strictly above or strictly below the line. An equal price emits nothing. `trailingBps`
  with `below` tracks the highest usable price since registration or the last committed fire
  and fires when the drop is at least that many basis points. `above` tracks the lowest price
  and fires on a rise of that size. The arithmetic is decimal strings. A scientific-notation
  quote such as `1e-7` or `1.25e-8` is expanded to a plain decimal before that comparison and
  before the Tick stores it.
- **A fire commits when the Intent settles.** `once` stays the default. After `executed`, that
  Strategy moves to `done` and `nextDueAt` is null. `failed` stays `active`, stays armed, and
  counts toward `maxConsecutiveFailures`. `skipped_bounds` and `skipped_kill_switch` stay armed
  and do not move `bestPriceUsd` or `firedAt`. `once: false` requires `cooldown`. Until that
  duration has elapsed, Ticks are `evaluated` with no Actions. The trailing reference resets to
  the price at the committed fire.
- **State lives on the Tick.** Each trigger Tick records `bestPriceUsd` and `firedAt`. An
  in-flight fire also keeps `armed`, the state to restore if recovery closes that Tick as
  anything other than `executed`. A `missed` Tick copies the newest persisted state, and the
  next evaluation reads the newest Tick that has state, so a gap does not clear the reference
  or the cooldown.
- **A price that cannot be used does not fire.** The live reader loads the mint on
  `params.observe.price` from `PriceFeed`. A missing quote, a feed error, or a quote older than
  the staleness limit records `skipped_observation` with the feed's reason and leaves
  `bestPriceUsd` unchanged. The limit is an Engine setting. It defaults to two tick intervals.
  `SOLOS_OBSERVATION_STALENESS` sets a duration such as `2m` or an interval count such as `2`.

## Consequences

- A restart during a cooldown, or after a trailing extreme, continues from the last usable
  price instead of arming a new reference.
- Dust prices expressed in scientific notation compare as the same decimal the feed meant.
- A quote that is not a decimal and not scientific notation still skips the Tick.
- OCO bundles, triggers on anything other than a USD price, and stream-driven Ticks stay out
  of this decision.
