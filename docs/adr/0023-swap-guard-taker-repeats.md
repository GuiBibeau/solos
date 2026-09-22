# 0023 — Swap guard admits read-only taker repeats and nothing more

Status: accepted, 2026-09-22. Maintainer contract for issue #90.

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

The taker's pubkey may appear any number of times in the swap instruction, but exactly once with
elevated privileges — the validated authority slot (read-only signer in both V2 layouts). Every
other occurrence must be a pure data reference: not writable and not a signer. A writable or
signer occurrence anywhere else rejects with `BuildRejected` before signing.

This is provably sufficient under the coalescing rule: a read-only repeat contributes neither
writability nor a signature requirement, so the union is unchanged — the route learns nothing it
could not already read at the authority slot, and holds no authority over the wallet that
validation did not approve. A signer repeat outside the slot would place a signed authority
position the validator never reviewed; a writable repeat would elevate it.

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

- Jupiter execute builds with read-only hop repeats sign and land; a mainnet SOL -> USDC -> SOL
  round trip is the acceptance proof for the rule.
- The malicious-build negative test stays: a hop account that takes the taker writable — or as
  an extra signer — must still fail `BuildRejected`, and the test pins it.
- If a future Jupiter layout needs the taker writable in a declared, reviewed slot, that is a
  new decision record, not a loosening of this rule.
