// @ts-check
import { expect, test } from "bun:test";
import { profileReplay } from "./profile-replay.js";
import { replayRow } from "./replay-builder.js";
import { tradingReplay } from "./trading-replay.js";
import { validateAcceptance } from "./validate.js";

test("acceptance matrix #48 preserves every bound, identity, duplicate and null aggregation proof", () => {
  const baseline = tradingReplay();
  expect(validateAcceptance(baseline).valid).toBe(true);
  for (const row of baseline.matrix.rows) {
    for (const surface of row.surfaces) {
      const input = tradingReplay();
      const target = replayRow(input, row.id.split(".").at(-1) ?? "");
      target.proofs = target.proofs.filter((proof) => proof.surface !== surface);
      expect(validateAcceptance(input).findings.join(" ")).toContain(surface);
    }
  }
});

test("acceptance matrix #48 does not substitute schema checks for on-chain state validation", () => {
  const input = tradingReplay();
  input.previous = structuredClone(input.matrix);
  const runtime = replayRow(input, "state-validation");
  runtime.validator = "pure";
  runtime.requirement = "The SDK fields match, so ownership and price caps are enforceable";
  expect(validateAcceptance(input).findings.join(" ")).toContain("state-validation");
});

test("acceptance matrix #49 audits every filesystem/profile and child environment case", () => {
  const input = profileReplay();
  expect(validateAcceptance(input).valid).toBe(true);
  input.previous = structuredClone(input.matrix);
  const affected = input.matrix.rows.filter((row) => row.validator === "integration");
  for (const row of affected) row.validator = "pure";
  let result = validateAcceptance(input);
  expect(result.valid).toBe(false);
  for (const row of affected) expect(result.findings.join(" ")).toContain(row.id);
  const first = affected[0];
  if (!first) throw new Error("Expected profile cases");
  first.validator = "integration";
  result = validateAcceptance(input);
  expect(result.valid).toBe(false);
  expect(result.findings.join(" ")).toContain("46-ac-7.adapters");
  expect(replayRow(input, "pure-url").validator).toBe("pure");
  expect(result.unresolved.join(" ")).toContain("46-ac-9.operator: pending");
});
