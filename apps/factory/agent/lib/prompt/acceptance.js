// @ts-check
/** A source contract travels intact through every station and every revision. */
export const ACCEPTANCE = `## Acceptance matrix handoffs

At intake, copy every original issue criterion unchanged into originals: id, text, source URL,
required_surfaces (explicit paths required by that criterion/context; [] for non-surface criteria).
Assign stable issue-number/ac/ordinal IDs once; retain these even if later comments clarify scope.
Pass originals independently of station output. An analyst may add boundary rows, never rewrite criteria.
Every analyst, implementer and reviewer returns acceptance_matrix; relay the whole matrix unchanged.
The matrix schema and examples are in apps/factory/acceptance-matrix.md in the checkout.

Before implementation, call validate-acceptance with phase analysis, originals, the analyst matrix,
previous:null, the checkout revision and reviews:[]. Require valid:true. Preserve this baseline.
On revisions, previous is the complete last accepted matrix, including all findings and prerequisites.
Recover it from the existing PR's Acceptance matrix JSON, never only the latest review comment.
If missing, reconstruct from the full original issue, prior analysis and every review before proceeding.
Any malformed handoff goes back once for correction with all validation findings in one batch.

Resolve declared prerequisites against current merged ADRs/contracts and existing pinned research
before requesting more research. Carry source URL, revision, decision and dependent row IDs forward.
A verified merged decision supersedes an older brief's uncertainty. New SDK/provider/runtime facts
still need pinned sources and behavioral feasibility: a similarly named SDK field proves nothing.
Conflicts and stale compatibility remain explicit. Park only dependent rows for a protected-contract
or unenforceable-bound gap, with the precise maintainer action; continue independent work.

After implementation and EACH repair, call reviewer twice in separate fresh tasks, lane spec then
lane standards, passing the same full matrix, original issue, previous findings and current head.
Each independently reviews the WHOLE applicable matrix and newly changed behavior, not just fixes.
Spec checks the source contract and behavior; Standards checks AGENTS/ADRs and architecture.
Retain every finding from both lanes, with stable IDs and linked row IDs. Do not merge away a failure
because the other lane approves. Resolution arrays must match the affected rows' recorded current
proofs in kind and observation and cover every required surface. An unrelated passing check cannot close a finding.
Pass the combined matrix to validate-acceptance with phase review and both review records.
Return findings and unresolved rows together to the implementer; preserve prior regression coverage.
Only draft_deliverable:true permits opening/updating a draft. Both lanes may use approve_draft,
explicitly naming deferred_row_ids for pending operator/CI-owned checks that run after PR creation.
Code failures, blocked work, implementer checks and open findings cannot be deferred this way.
Keep those external rows pending in the PR, then re-review after their actual results arrive.
ready:true means final completion; valid:true alone permits neither delivery nor completion.
not_applicable requires current inspection proof for every row surface with source URL and quote,
including required/operator checks; a reason alone never waives them. Never request credentials.

Persist originals, matrix, revision and both reviews as compact JSON in the PR Acceptance matrix section,
alongside the human criterion table. The exact solos Evidence remains a separate unchanged section.
Deterministic offline replay tests validate artifacts and schemas; paid model-quality evals, if run,
are reported separately and never replace behavioral QA or clean matching-head Evidence.`;
