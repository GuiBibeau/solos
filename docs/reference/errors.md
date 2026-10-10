# Errors

Every domain error is one `Data.TaggedError` class from the owning slice's `domain/errors.js`, built
with the `taggedError("Name")` helper. On the wire — MCP results and CLI output alike — it is one
JSON object built by `errorEnvelope` in `packages/core/src/shared/domain/error-envelope.js`:

```json
{ "code": "BuildRejected", "reason": "the funding account does not exist", "remedy": "pass wrapSol: true to wrap native SOL for this side" }
```

- **`code`** — the `_tag`, the error's identity. Stable; Callers branch on it.
- **`reason`** — one sentence saying what is wrong, as precise as the adapter can make it. Present
  on the reason-bearing types (see below).
- **`remedy`** — one sentence naming the next action: an argument, a tool, or a command. Optional,
  and deliberately so.
- **everything else** — the error's structured props, JSON-safe, spread beside `code`. `signature`,
  `status`, `owner`, `lamports`, and so on.

## When to write a `remedy`

Write one whenever a next action exists. `insufficient token A balance: the funding account does not
exist` is true and costs the reader a round-trip to learn the answer was `wrapSol: true`. A `remedy`
saves an agent a turn and an operator a trip to the source.

**Omit `remedy` when no action exists.** Never restate the `reason` in different words, and never
invent filler — an absent remedy is honest, a padded one is noise. A `remedy` names something the
reader can actually do.

## Reason-bearing and reasonless types

Not every type carries a `reason` yet. `errors-registry.test.js` in `packages/core` classifies
every registered type as reason-bearing or reasonless and fails when a new type is added without a
classification. The reasonless set is tracked by #162 and #163, which drain it as each slice is
migrated; it can only shrink.

The registry itself comes from `taggedError`: creating a class registers it, so importing a slice's
`index.js` is enough to make its errors appear in `domainErrors()`. No hand-kept list to drift.

## Migrating a slice

Each migration ticket drains its slice's reasonless types. When an error's reason and remedy are
fixed by its tag — a `QuoteAuthFailed` always means Jupiter rejected the key, a
`LiquidityPositionUnavailable` is always read back the same way — the class supplies them from its
own constructor. The raise site then passes only the data it has, and cannot forget the sentence or
the next action.

Where a cause is genuinely data-dependent (the funding shortfall names the amount to add; a
deposit that buys no liquidity names the budgets) the raise site supplies the remedy, and omits it
when no action exists rather than padding the field.

## BoundsExceeded

Reason-bearing. An Action asked for more than Bounds allow. Beside `code` and `reason`:

- `bound` — the limit that refused, such as `maxDailySpendUsd` or `allowedMints`.
- `limit` — the configured ceiling, as a string (a decimal cap, or the allowlist).
- `requested` — what the Action asked for, as a string (an amount, a mint or a venue).
- `scope` — `engine` for the engine-wide ceiling, or the strategy id when a strategy ceiling refused.
- `remedy` — the next action, when one exists. Omitted when none does.

The class writes `reason` from those fields when the raise site does not pass one:
`maxDailySpendUsd limit is 5 on scope engine; requested 3`.

## Why the field is `reason`, never `cause`

`Error.cause` is non-enumerable and vanishes from serialised output (ADR-0003). `reason` is a plain
prop and survives `errorEnvelope`. The shared executor's `ExecutorError` follows the same rule.
