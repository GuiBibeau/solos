# 0016 — Evidence is the verification contract

Status: accepted, 2026-09-16. See also 0010.

## Context

ADR-0010 makes the `solos` CLI the lever contributors use instead of ad-hoc scripts. A reviewer
must be able to tell what actually ran on which commit, rather than relying on a prose claim. The
same verification contract should work for people, coding agents, and CI.

## Decision

`solos dev verify --scope check|unit|full --json` runs the repository checks in order and prints
one Evidence object. It records the result, commit SHA, dirty state, scope, tool versions, and each
step's command, result, duration, and final output line.

Evidence counts only when its SHA equals the commit under review, the working tree was clean, and
the declared scope completed successfully. Every authored pull request includes the JSON verbatim
under an `## Evidence` heading. CI validates the object against the pull request head with
`solos dev evidence check`, verifies that all required steps are present and successful, and then
re-runs verification on that same commit. Bot-generated dependency and release pull requests may
omit author Evidence; their CI run remains the proof.

Renovate may auto-merge configured devDependency minor and patch updates only after required CI
succeeds. Other authored changes still follow the repository's normal review and merge rules.

Reusable verification stays offline. Unit scope does not start Surfpool. Full scope starts the
repository-pinned Surfpool and runs integration tests against its local network. Live mainnet
verification remains an explicit operator action governed by `AGENTS.md` and is never part of the
reusable suite.

## Consequences

- Review begins from immutable, machine-checkable output tied to the exact commit.
- Hand-edited, incomplete, stale, failed, or dirty Evidence is rejected.
- The CLI, local contributors, and GitHub Actions exercise the same commands.
- Publishing `@solos/actions` remains disabled until `vars.NPM_PUBLISH` is `true`; release pull
  requests still open so version history can accumulate.
