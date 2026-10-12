# 0039 — Owner sign-off for removing STRATEGIES

Status: accepted, 2026-10-12. References ADR-0038.

## Context

ADR-0038 says removing `STRATEGIES` waits until #243 has landed, the funded mainnet rounds are
recorded in `features/feature-map.json`, and Gui has signed off. The unexplained 2026-10-10 17:36
swap on the QA wallet E15BHE3… had held unattended signing.

## Decision

- The owner sign-off gate for removing `STRATEGIES` was met on 2026-10-12. Gui (the repo owner)
  signed off on 2026-10-12. He confirmed the 2026-10-10 17:36 swap on the QA wallet E15BHE3… was
  his own.
- The flag removal itself lands in #246.
- The first unattended funded round after the flag is removed is still to come.

## Consequences

The owner sign-off gate for removing `STRATEGIES` is met. The flag removal lands in #246. The
first unattended funded round after the flag is removed is still to come.
