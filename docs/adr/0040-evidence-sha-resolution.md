# 0040 — Evidence sha resolves to the reviewed head

Status: accepted, 2026-10-12. Extends ADR-0016. The rest of that contract stands: Evidence is still
the JSON from `solos dev verify`, a dirty tree still fails, and bot pull requests still rely on CI.

## Context

`solos dev evidence check` compared the Evidence sha to `pull_request.head.sha`. On `synchronize`
the body cannot yet name the new head, so the required check failed until someone edited the body.
A docs-only follow-up failed the same way even though the verified code had not changed. CI also
started Surfpool and ran `solos dev verify --scope full` for those docs-only pull requests.

## Decision

The check resolves the reviewed commit itself. CI checks out the pull request head and passes
`--sha HEAD`, which is `git rev-parse HEAD` on that checkout.

An Evidence block is accepted when `dirty` is false, `ok` is true, the declared scope's required
steps passed, and `sha` is one of:

- the reviewed commit (a prefix of 7+ characters still matches)
- the literal marker `HEAD`, meaning that reviewed commit
- an ancestor of the reviewed commit, when `git diff --name-status -M` from it to the head touches
  only docs paths

Docs paths are `docs/**`, any `*.md` (`CONTEXT.md`, `AGENTS.md`, ADRs, `engine-qa.md`), and
`features/feature-map.json`. `apps/engine`, the cap ledger, tick and strategy, swap and transfer
builders, and other code, config, and workflow files are never docs paths, even as markdown inside
those trees. A diff that includes one of them fails this check.

A missing Evidence block fails. A sha that does not resolve, is not an ancestor, or whose diff is
not docs-only fails. Live QA still requires the full exact reviewed sha, so neither `HEAD` nor an
ancestor satisfies a block that carries `qa`.

The `verify` job always runs, so branch protection never waits on a path-filtered workflow. A
docs-only pull request runs `solos dev verify --scope check` and does not install Surfpool. Every
other pull request, and every push to main, runs `--scope full`. An empty file list or a failed
classification runs full.

## Consequences

- A push whose body already says `HEAD`, or whose new commits are docs-only relative to the pasted
  sha, passes the evidence check without a follow-up body edit.
- Code, config, or workflow changes since the pasted sha still fail that check until the body names
  the new commit or `HEAD`.
- `HEAD` binds the block to the reviewed commit. It does not by itself prove `verify` ran there.
  The `verify` job re-runs the scope the diff requires.
- Hand-edited steps, a dirty tree, and a failed run are still rejected.
