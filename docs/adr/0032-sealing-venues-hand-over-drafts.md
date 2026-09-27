# 0032 — Sealing: venues hand Submission a draft; Submission fetches the lifetime and signs

Status: accepted, 2026-09-27. This is slice 1 of the remaining ADR-0031 slices (sealing). The
order ADR-0031 fixed is unchanged; this adds the step in front of it.

## Context

After ADR-0031, every venue still signed its own transaction. Fourteen v1 sites ran the same
five steps:

1. fetch a blockhash at `confirmed`
2. `beginV1Message` with a compute config
3. set the lifetime
4. append the instructions
5. sign

Only three of them (swap, pump, Kamino) checked the block height before signing. Swap signed
through its own path, with its own copy of the v1 ceilings. The three sites mapped signer
failures to three different errors.

Two later slices need Submission to own signing:

- **The `fast` preset** has to set the before-signing lifetime check as a mode parameter.
- **Submitter additions** (a priority fee, a tip) have to land in the message before it is
  signed.

A survey of every signing site found:

- no lookup tables, because v1 has none
- no instruction data that depends on the blockhash or the signature
- extra signers carried only on account metas: the Meteora position key and the Raydium NFT
  mint

## Decision

- **A venue builds a Draft and returns it with its quote.** A draft holds:
  - the ordered instructions, with any extra signers on their account metas
  - the venue's named compute config
  - a label

  It has no lifetime and no signature. It stays internal to `packages/solana`; the
  `ActionExecutor` seam and `@solos/actions` do not change.
- **Sealing is Submission's first step, and both tiers run it with the same code.**
  1. Fetch a blockhash at the mode's lifetime commitment.
  2. Check it: height plus minimum remaining blocks must be at or below the last valid height.
     This runs whenever the mode rechecks, and it now applies to every path.
  3. Build the v1 message through `beginV1Message`, which enforces the v1 clauses.
  4. Sign with the fee payer and the signers on the metas.
  5. Check the wire.

  The recheck after signing stays. A remote signer can take seconds, and the mode governs it
  as before.
- **Every v1 venue moves.** The list: transfer, token-account close, Orca, Kamino, pump,
  Jupiter, Meteora, Raydium, and Phoenix open, close and collateral. The builder-level lifetime
  checks are deleted, and so are swap's duplicate ceilings and its separate signing path.
  **Phoenix onboarding stays outside**, because it is v0 and co-signed (ADR-0025).
- **Compute configs stay with their builders**, as named frozen constants next to the
  instructions they budget. There is no central registry.
- **Freshness windows that start before signing stay in the builder.** Phoenix's 5 s build
  window is checked as the builder's last step before it returns the draft; the guard keeps its
  own checks. Submission has no before-signing hook.
- **One set of error types.**

  | Failure | Error |
  |---|---|
  | Blockhash fetch | `RpcError` |
  | Expired before signing | `BuildRejected`: "the configured RPC lifetime expired before signing; nothing was signed or sent" |
  | v1 policy | `BuildRejected`, naming the clause |
  | Signer | `SignerUnavailable`, with a fixed reason that never carries a provider's response body |

  Before this, only swap reported a signer failure as `SignerUnavailable`. Transfer reported it
  as an `RpcError`. Every other venue reported it as a `BuildRejected` with a generic
  "assembling or signing failed" sentence. All of them now see `SignerUnavailable`. Assembly
  failures stay `BuildRejected`, because the pre-signing boundary turns every exception it
  catches into one that names its clause. A Kit refusal inside the signing call itself, such as
  a signer-role account with no signer, is reported as `SignerUnavailable` too.
- **Submission never reorders or drops a draft's instructions.** Kamino's refreshes must stay
  contiguous before the deposit, because the program introspects them. The wrap-SOL prefix and
  suffix and Jupiter's setup, swap, cleanup order also carry weight.
- **Future Submitter additions are limited to two things.** One is the priority fee, through
  the config, and nothing else in it: compute units and loaded bytes belong to the builder. The
  other is at most one tip, appended after the last instruction and never inserted.

## Consequences

- There is one signing path for every v1 transaction, so slices 3 and 4 (fast preset,
  Submitter additions) have a place to act.
- A draft keeps its signer objects, so a future re-sign after expiry keeps the same ephemeral
  key. The position address a Caller was given stays true.
- Tests that read a builder's signed bytes assert on its draft instead. Tests that decode the
  wire stay valid. The pinned RPC orders move `getLatestBlockhash` into Submission and lose the
  builder-level height read.
- A priority-fee override has to reach core's transfer balance reserve, which assumes the
  default fee today.
- It ships as one PR. Submission's input changes from a signed transaction to a draft in one
  step, with no input that accepts both, so every venue moves in the same commit. The live
  round on every converted path is recorded in [the sealing QA notes](../sealing-qa.md) and
  the feature map, in the same change set.
