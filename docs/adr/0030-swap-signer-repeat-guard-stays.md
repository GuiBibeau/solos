# 0030 — The swap signer-repeat guard stays; relax it only against a captured route

Status: accepted, 2026-09-27. Extends ADR-0024, which admitted the writable taker repeat but kept
the signer repeat rejected. Issue #116 asked whether that surviving clause should also be relaxed.

## Context

ADR-0024 relaxed the writable taker repeat because it *measured* the guard blocking real routes: 10
of 14 mainnet SOL→USDC builds were refused, every one of them through Manifest. The signer repeat
was kept on the merits — a taker occurrence declared a **signer** outside the validated authority
slot is a signed position the validator never reviewed.

Issue #116 left three residual failures, each about 1% of attempts: the signer-repeat rejection, a
v1-policy rejection whose reason named nothing, and a Jupiter HTTP 400.

Re-measured 2026-09-27 from the `keychain-qa` wallet with
`solos dev qa swap --amount-sol 0.1 --rounds 20` (simulate tier, real mainnet state and routes):

- **80 of 80 attempts succeeded** across `sol-usdc`, `usdc-sol`, `sol-usdt` and `sol-bonk`
  (rate 1.0, p50 419 ms, p95 581 ms).
- The signer-repeat rejection did not fire once.
- The v1-policy rejection did not fire; its reason was already given a named trailing clause by
  #124, so a recurrence is diagnosable rather than anonymous.
- The Jupiter 400 did not fire.

## Decision

**Keep the signer-repeat rejection.** The argument for relaxing is real but symmetric with the
writable case: the taker's signature is transaction-level, and message compilation coalesces
duplicate keys, so a signer flag on a second occurrence may grant no capability the fee payer did
not already have. What separates it from the writable case is evidence. ADR-0024 relaxed *because
a measurement showed the guard blocking real routes*. This clause now has the opposite evidence:
across 80 real attempts it never fires. A guard that costs nothing when it never fires is worth
keeping, and relaxing it expands a signed authority surface for no observed benefit. Two guards
were already relaxed on measurement; the third is not.

The burden of proof is a reproduction, not an analogy: **a captured route whose build Jupiter
considers valid, and which this guard rejects with a signer repeat outside the authority slot,
reopens the decision.** Absent that, the guard stands.

## Consequences

- The malicious-build negative test stays: a hop account that takes the taker as an extra
  **signer** must still fail `BuildRejected`, and the test pins it. A writable repeat is admitted,
  per ADR-0024.
- The Jupiter transport still takes a single attempt with no retry. The 400 did not reproduce, so
  there is no evidence it is transient; adding a retry without that evidence would only double the
  latency of a genuine client error. It is revisited if 400s return with captured bodies.
- A future Jupiter layout that needs the taker signed in a declared, reviewed slot is a new
  decision record, not a loosening of this one.
