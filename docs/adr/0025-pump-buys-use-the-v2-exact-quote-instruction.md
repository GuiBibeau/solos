# 0025 — Pump buys use `buy_exact_quote_in_v2`

Status: accepted, 2026-09-25. Delivers the maintainer contract in issue #25. Its "there is no solOS
Pump sell tool" clause is amended by ADR-0027, 2026-09-25; everything else stands.

## Context

Issue #25 asks for a bounded SOL-in buy whose `amount` is "the maximum SOL input budget including
Pump trading fees", with an "enforceable minimum tokens out", and says to raise a mismatch before
implementing if the protocol cannot honour that with current instructions.

The pinned IDL (commit `81091419e4457566469d4e2a27f64ed84d42419c`) offers four buys:

| Instruction | Accounts | Args |
|---|---|---|
| `buy` | 16 | `amount`, `max_sol_cost`, `track_volume` |
| `buy_v2` | 27 | `amount`, `max_sol_cost` |
| `buy_exact_sol_in` | 16 | `spendable_sol_in`, `min_tokens_out`, `track_volume` |
| `buy_exact_quote_in_v2` | 27 | `spendable_quote_in`, `min_tokens_out` |

`docs/instructions/BUY.md` documents **only `buy_v2`**, whose `amount` is exact tokens out. Neither
exact-input instruction appears in any published doc, and neither is marked deprecated.

## Decision

Use **`buy_exact_quote_in_v2`**.

It is the only instruction that satisfies both halves of the contract. `spendable_quote_in` is the
budget verbatim, and `min_tokens_out` is enforced by the program rather than by our arithmetic —
so a curve that moves between planning and landing reverts the buy instead of filling it badly.

## Why not the alternatives

`buy_v2` is the documented path, and it bounds the spend through `max_sol_cost`. But `amount` is
exact tokens out, so the minimum would have to be derived off chain from curve state. Twice in
recent work a constant calibrated against a single observation did not survive real conditions
(ADR-0024's overhead allowance, and the 16 MiB loaded-accounts bound). Putting the guarantee in
the program instead of in our own arithmetic is worth more than the documentation comfort.

`buy_exact_sol_in` matches the contract on paper and was implemented first. **The deployed program
refuses it**: a live simulation returned

```
AnchorError thrown in programs/pump/src/sell.rs:145.
Error Code: BuybackFeeRecipientMissing. Error Number: 6062.
```

Its 16-account list has no slot for a buyback fee recipient the current program requires, so the
instruction is effectively legacy regardless of its presence in the IDL. This was only discoverable
by running it — the IDL alone says nothing about it.

## Consequences

- The buy carries 27 accounts. All are derived, none taken on trust, and the seeds come from the
  IDL's own `pda` entries rather than the docs prose.
- `buy_exact_quote_in_v2` does not open the buyer's token account, so an idempotent ATA create is
  prepended. That is the only account initialisation the buy performs.
- Fee rates are read live from `Global`. The documentation states `fee_basis_points == 100`; the
  live account reads **95** with a separate 5 bps creator fee. A hardcoded 100 would misprice every
  quote.
- The instruction is undocumented, so its discriminator and account order are pinned in
  `pump-buy-wire.test.js`. A silent upstream change fails the suite rather than the wallet.
- There is no solOS Pump sell tool. An operator needs a checked external exit route before buying,
  and the tool descriptions and CLI help both say so.

## Verification

Offline: the curve maths, the 27-account derivation, the encoded instruction, and every refusal
the contract lists — completed curve, non-SOL quote, foreign owner, missing curve or mint,
unreadable config, a budget too small to clear one token.

Live, on mainnet, spending nothing: `solos launch simulate-buy` against a coin on a live curve
returns `ok: true` at 107,876 compute units with no violations. Every derived PDA was also checked
against mainnet and exists with the expected owner, and the computed `Global` layout totals 1087
bytes, exactly the live account's length.

A funded buy remains an operator decision, gated on a checked exit route per the issue.
