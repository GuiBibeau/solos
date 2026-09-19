// @ts-check
import { expect, test } from "bun:test";
import { profileReplay } from "./profile-replay.js";
import { replayRow } from "./replay-builder.js";
import { proof } from "./replay-fixture.js";
import { validateAcceptance } from "./validate.js";

const draftReview = () => {
  const input = profileReplay();
  input.phase = "review";
  const ci = replayRow(input, "ci");
  Object.assign(ci, { state: "pending", reason: "Hosted CI starts after PR creation", proofs: [] });
  input.matrix.summary.pass -= 1;
  input.matrix.summary.pending += 1;
  input.reviews = ["spec", "standards"].map((lane) => ({
    lane,
    revision: input.revision,
    verdict: "approve_draft",
    reviewed_row_ids: input.matrix.rows.map(({ id }) => id),
    deferred_row_ids: [ci.id, replayRow(input, "operator").id],
  }));
  return input;
};

test("acceptance matrix permits an independently reviewed draft with explicit pending operator and CI QA", () => {
  const input = draftReview();
  const result = validateAcceptance(input);
  expect(result.valid).toBe(true);
  expect(result.draft_deliverable).toBe(true);
  expect(result.ready).toBe(false);
  expect(result.unresolved).toHaveLength(2);
  expect(replayRow(input, "operator").state).toBe("pending");
  for (const row of input.matrix.rows.filter(({ state }) => state === "pending")) {
    row.state = "pass";
    row.reason = null;
    row.proofs = row.surfaces.map((surface) => ({
      ...proof(surface),
      kind: row.proof_kind,
      observation: "Reported external QA passed at this exact revision",
    }));
  }
  input.matrix.summary.pass += input.matrix.summary.pending;
  input.matrix.summary.pending = 0;
  for (const review of input.reviews) {
    review.verdict = "approve";
    review.deferred_row_ids = [];
  }
  expect(validateAcceptance(input).ready).toBe(true);
});

test("acceptance matrix draft approval cannot defer code failures or erase unresolved findings", () => {
  const input = draftReview();
  replayRow(input, "operator").state = "fail";
  input.matrix.summary.pending -= 1;
  input.matrix.summary.fail = 1;
  expect(validateAcceptance(input).draft_deliverable).toBe(false);
  const pending = draftReview();
  replayRow(pending, "operator").responsibility = "spec";
  expect(validateAcceptance(pending).draft_deliverable).toBe(false);
  const missing = draftReview();
  for (const review of missing.reviews) review.deferred_row_ids = [];
  expect(validateAcceptance(missing).draft_deliverable).toBe(false);
  const findings = draftReview();
  findings.matrix.findings.push({
    id: "open",
    row_ids: [replayRow(findings, "pure-url").id],
    lane: "spec",
    detail: "Unfixed regression",
    state: "open",
    resolution: null,
  });
  expect(validateAcceptance(findings).draft_deliverable).toBe(false);
});
