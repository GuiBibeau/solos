# 0016 — Software factory in `apps/factory`, Evidence as the verification contract

Status: accepted, 2026-09-16. Amends 0001 (Node for the `eve` CLI only). See also 0010.

## Context

Work in solOS is scoped by humans through grilling sessions and ADRs, then implemented as
small, well-specified changes: new tools in a slice, adapters for existing ports, bug fixes,
dependency bumps. That shape fits an unattended software factory. Vercel's eve framework and its
Foreman template provide one: GitHub intake, four stations (classifier, analyst, implementer,
reviewer) in isolated sandboxes, an independent reviewer on a different model vendor, and a draft
pull request a human marks ready and merges.

Two constraints from earlier decisions apply. ADR-0001 makes Bun the only runtime and package
manager; eve's CLI runs on Node 24. ADR-0010 makes the `solos` CLI the lever agents verify with
instead of ad-hoc scripts. The requirement that mattered most in the grilling was
**verifiability**: a reviewer, human or model, must be able to tell what was actually run on
which commit, not what an agent says it ran.

## Decision

1. **The factory is `apps/factory`**, a plain-JavaScript port of Foreman on eve, inside this
   monorepo. It is a leaf: it imports nothing from `packages/*` and reaches solOS only through a
   sandbox checkout and `solos` commands, like any other agent. Bun installs its dependencies;
   the `eve` CLI (`eve dev`, `eve build`, `eve info`, `eve eval`) runs on Node 24. This is the
   only Node exception to ADR-0001. Vercel project `solos-factory` builds it from
   `apps/factory` on pushes to `main`.

2. **Evidence is the verification contract.** `solos dev verify --scope check|unit|full --json`
   runs the repository's own checks in order and prints one Evidence object: `ok`, `sha`,
   `dirty`, `scope`, tool versions, and per-step `command`, `ok`, `ms`, `summary`. It is the
   only accepted proof of work, for humans, interactive agents, factory stations, and CI alike.
   Evidence counts only when `sha` equals the commit under review and `dirty` is false.
   Every pull request carries the author's Evidence under `## Evidence`; CI validates it against
   the head sha (`solos dev evidence check`), requires the declared scope's exact steps each
   passed, and then re-runs the same command so agent Evidence and CI Evidence sit side by side.
   Hand-edited, incomplete, or stale Evidence fails the check. Pull requests opened by Renovate or
   the changesets bot carry no author Evidence; for them the CI re-run alone is the proof.

3. **Stations verify with the lever.** The implementer runs `verify --scope unit` through the
   station verification gate after committing and pastes the JSON verbatim. The reviewer re-runs
   `verify --scope check` through the same gate in its own clone before reading the diff and
   returns `request_changes` on missing, stale, or dirty Evidence. The gate records the expected
   and actual head, clean state, frozen-lockfile install and measured Bun/Surfpool/platform/PATH
   capabilities, then waits for the verifier's actual process result. Rebase revisions run
   `scope full` with the repository-pinned offline Surfpool in the sandbox; ordinary integration
   remains in GitHub Actions, so check-only work never starts Surfpool unnecessarily.

4. **Protected paths** need a human: `packages/actions/`, `docs/adr/`, `.github/`, lint and type
   configuration, `LICENSE`. CODEOWNERS requires the owner's review; a workflow fails
   `factory/*` branches and any app-authored pull request that touch them; the factory's push tool
   refuses branches without the `factory/` prefix; station instructions forbid it.

5. **Funds boundary.** The factory never holds a Solana signer, RPC URL, wallet profile, or AI
   Gateway key. Sandboxes carry no `SOLOS_*`, `SOLANA_*`, or `AI_GATEWAY_API_KEY` values. Tests
   it runs are Surfpool offline. Live verification against mainnet stays a human-driven activity
   on a developer machine (AGENTS.md).

6. **Human gate.** The factory opens draft pull requests only; it has no merge tools. `main` is
   protected: required checks `check`, `unit`, `integration`, `evidence`, squash merges, linear
   history. A person marks a draft ready and merges. Renovate may auto-merge devDependency
   minor and patch updates on green; nothing else merges unattended.

7. **Intake** is a GitHub issue with acceptance criteria (issue forms `bug`, `change`, `slice`)
   labeled `agent-ready`, which both moves the card to Ready on the solOS Project board and
   starts the factory. No Linear.

8. **Models** are cheap and configurable per station (`FACTORY_MODEL_<STATION>`); implementer
   and reviewer must be on different vendors. Defaults: DeepSeek v4.1 flash for orchestrator,
   classifier, analyst, implementer, researcher, served by gateway providers without an output
   content filter (the Alibaba route rejects wallet vocabulary); GPT-5.6 luna for the reviewer.
   Expensive
   reasoning stays upstream, in grilling and ADRs.

## Consequences

- Every contributor, human or agent, produces Evidence the same way; review starts from the
  same JSON regardless of who wrote the code.
- Lint exceptions the port of Foreman needed are scoped to `apps/factory/**` and listed in
  `apps/factory/README.md`; they do not loosen rules elsewhere.
- Node 24 is a build dependency of one app. Nothing else may depend on it.
- Publishing `@solos/actions` is prepared (changesets, release workflow) but disabled until the
  package is ready; the release PR still opens so version history accrues.
- Operating the factory means maintaining its station instructions and evals when failures
  recur. The nightly mainnet-fork run reports drift as `nightly-failure` issues the factory can
  pick up.
