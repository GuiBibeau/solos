# Acceptance matrix

The matrix is a compact station handoff, not a new product contract. `schema.js` defines the
shared analyst/implementer/reviewer output. `validate-acceptance` validates the same pure data
in the orchestrator and stations; offline tests need no model, provider, credentials or chain.

Copy every original criterion unchanged into `criteria`: stable issue/ordinal `id`, verbatim
`text`, `source` URL and `required_surfaces` explicitly required by the issue/context ([] when none).
The orchestrator supplies `originals` independently from the issue; missing required surfaces fail
even at initial analysis. Analyst/reviewer add other applicable boundaries as they trace the code.
Extensions are boundary rows under those criteria, not rewritten requirements.

Each row has a stable `id`, `criterion_id`, `requirement`, applicable `dimension`, `surfaces`,
`validator`, `responsibility`, `proof_kind`, `prerequisite_ids`, `state`, `reason`, and `proofs`.
Group equivalent cases when they share a validator; do not generate a Cartesian suite.
Dimensions cover criterion, representation, domain, identity, surface, failure_timing,
compatibility, observability, qa_environment and architecture. Validators are pure,
integration, native_cli, mcp or review. Responsibilities are spec, standards, maintainer or operator.

- `pass`: observed proof at the exact current revision for **every** declared surface.
- `fail`: observed incorrect behavior, with a concrete reason.
- `pending`: not yet checked; name the check and responsibility.
- `blocked`: cannot check or implement yet; explain the dependency or required environment.
- `not_applicable`: explicit source-grounded justification, never a way to erase a finding.

Proof records carry kind (`behavioral`, `inspection`, `planned`), revision, surface, reference
(solos command/output location or exact source lines), observation and outcome. Behavioral rows
cannot pass using inspection, future work, stale proof or proof from a different surface.
`summary` counts all five states exactly; it is checked against rows, never used to override them.
The gate checks artifact consistency, not the truth of model-authored observations: independent
review and real QA still establish applicability and behavior.

Before implementation resolve prerequisite records against current merged contracts and existing
research: stable ID, dependent criterion IDs, state, decision, source, revision, verification,
maintainer_action. Link each dependent row through prerequisite_ids. Verified merged decisions
supersede older uncertain briefs; new SDK/runtime facts need pinned research. Replacing a resolved
decision must be an explicit conflict with a precise maintainer action. Only dependent rows park.
Protected-contract gaps and unenforceable protocol bounds never authorize inventing a contract.

After every repair, independently run **both** Spec and Standards review on the entire matrix
and new behavior. `review` records contain lane, exact revision, reviewed_row_ids and verdict.
Retain ledger findings (id, row_ids, lane, detail, state, resolution) across revisions. Closing
a finding needs current observed proof. Batch all failures, including new regressions, together.

Call `validate-acceptance` with originals, matrix, previous (null only on first analysis),
revision, reviews and phase. `valid` means the handoff is internally consistent. `ready` is true
only in review phase with both whole-matrix approvals and no unfinished row or open finding.
`parked_row_ids` identifies blocked work; `unresolved` and `findings` must both reach the next station.
Preserve originals/matrix/revision/reviews in PR JSON for revisions. Keep solos Evidence separate.

Replay scope:

- #47: number/string and decimal/exponent grammar (including repeated/embedded signs), exact
  zero/sub-lamport truncation and positive compatibility; pure cases, native CLI and real MCP
  simulate/send with unusable-signer sentinels, plus error logs/spans. Review sign fixes for new
  malformed inputs and telemetry fixes for composition-root and caller-config violations.
- #48: each specified amount/price/slippage/lot bound, account/position/market identity,
  duplicate rules, shared equity and unknown/null aggregation. Static schema proof does not
  establish on-chain ownership, fresh state, reduce-only or atomic enforcement. No venue adapters
  or additional product requirements are implied by the contract PR.
- #49: every filesystem/profile case is integration, with isolated temporary stores for every
  fresh environment and child CLI/MCP; only pure URL parsing is unit. Fixing one fixture or file
  does not clear the other affected rows. Preserve real default/named/explicit adapter checks.

Run deterministic artifact replays through `bun run solos dev test --filter 'acceptance matrix'`.
These test validator decisions on reported artifacts, not the product regressions themselves.
Paid model-quality evals are separate; neither replay nor eval replaces full clean Evidence.
