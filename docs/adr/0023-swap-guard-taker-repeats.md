# 0023 — Swap guard admits read-only taker repeats and nothing more

Status: accepted, 2026-09-22; amended for bounded pre-sign route rebuilds.

## Context

The pre-sign swap validator rejected every real Jupiter V2 execute build on mainnet with
`BuildRejected` ("swap instruction repeated the taker outside its validated authority slot").
Real route builds repeat the taker's pubkey in hop accounts (for example as the owner of
intermediate or wrapped accounts). The guard modeled "any second occurrence" as elevation and
stopped every build before signing: typed, safe, and unusable.

The elevation concern is real. Per-instruction compilation coalesces duplicate account keys by
unioning their privileges: if the taker appears once as a read-only authority and once as
writable, the whole instruction treats the taker as writable, and the route program could then
move lamports or authorize token debits against the taker beyond what the quote approved.

## Decision

The taker's pubkey may appear any number of times in the swap instruction, but may never be
writable. The validated authority slot is already a read-only signer in both V2 layouts. Other
occurrences may be read-only references or read-only signers: compilation unions their roles with
the already-signed authority and gains no new privilege. Any writable occurrence outside the
fixed authority slot rejects with `BuildRejected` before signing.

The rejection may trigger at most two fresh build requests (three candidates total) for this
route-specific condition only. Every candidate is validated independently, and no build is
retried after signing, simulation, or submission. A repeated writable taker stays rejected if
all three candidates carry it; unrelated invalid builds fail immediately. This preserves the
security boundary while allowing Jupiter to choose a different route.

The runtime enforces the same boundary from below, so the proof does not rest on provider
metadata alone. An occurrence the instruction declares read-only fails the transaction on any
write attempt (`ReadonlyLamportChange`, `ReadonlyDataModified`), and a CPI cannot grant an
account writability the top-level instruction did not declare (`PrivilegeEscalation`). An
occurrence's position carries no semantic weight — only the union does — and the taker's
signature is transaction-level, present regardless of how many times the key repeats.

Premise of sufficiency: the guard sees every key. This holds because the executor enforces
transaction v1 (ADR-0019 lineage, #69), whose messages carry all account keys inline — no
address-lookup-table indirection can hide an occurrence from the validator.

## Consequences

- Jupiter execute builds with read-only hop repeats, including signer-only repeats, may sign and
  land; funded swaps remain an acceptance requirement, not a result inferred from tests.
- The malicious-build negative test stays: a hop account that takes the taker writable must fail
  `BuildRejected` with zero signer/RPC contact, even across the bounded rebuilds.
- If a future Jupiter layout needs the taker writable in a declared, reviewed slot, that is a
  new decision record, not a loosening of this rule.
