// @ts-check
import { expect, test } from "bun:test";
import { firstRow, proof, replay } from "./replay-fixture.js";
import { validateAcceptance } from "./validate.js";

test("acceptance matrix rejects a dropped original criterion", () => {
  const input = replay();
  input.matrix.criteria = [];
  const result = validateAcceptance(input);
  expect(result.valid).toBe(false);
  expect(result.findings.join(" ")).toContain("47-ac-1");
});

test("acceptance matrix rejects passed rows backed only by future checks", () => {
  const input = replay();
  firstRow(input).proofs = [{ ...proof("cli.simulate"), kind: "planned" }];
  expect(validateAcceptance(input).valid).toBe(false);
  firstRow(input).proofs = firstRow(input).surfaces.map((surface) => ({
    ...proof(surface),
    observation: "Will run the signer sentinel after review",
  }));
  expect(validateAcceptance(input).valid).toBe(false);
});

test("acceptance matrix rejects reworded criteria and duplicate stable IDs", () => {
  const input = replay();
  input.matrix.criteria = input.matrix.criteria.map((criterion) => ({
    ...criterion,
    text: "Skip send coverage",
  }));
  expect(validateAcceptance(input).valid).toBe(false);
  input.matrix.rows.push(structuredClone(firstRow(input)));
  expect(validateAcceptance(input).findings.join(" ")).toContain("duplicate ID");
});

test("acceptance matrix rejects contradictory current-head observations", () => {
  const input = replay();
  firstRow(input).proofs.push({
    ...proof("cli.send"),
    outcome: "fail",
    observation: "SignerUnavailable",
  });
  expect(validateAcceptance(input).valid).toBe(false);
});

test("acceptance matrix requires current behavioral proof for every applicable surface", () => {
  const input = replay();
  expect(validateAcceptance(input).valid).toBe(true);
  firstRow(input).proofs = [proof("cli.simulate")];
  expect(validateAcceptance(input).findings.join(" ")).toContain("cli.send");
  firstRow(input).proofs.push({ ...proof("cli.send"), revision: "b69e43b" });
  expect(validateAcceptance(input).valid).toBe(false);
  firstRow(input).proofs = [proof("cli.simulate"), { ...proof("cli.send"), kind: "inspection" }];
  expect(validateAcceptance(input).valid).toBe(false);
});

test("acceptance matrix preserves row identities, responsibilities and surfaces across revisions", () => {
  const input = replay();
  input.previous = structuredClone(input.matrix);
  firstRow(input).surfaces = ["cli.simulate"];
  expect(validateAcceptance(input).valid).toBe(false);
  input.matrix = structuredClone(input.previous);
  firstRow(input).validator = "pure";
  expect(validateAcceptance(input).valid).toBe(false);
  input.matrix.rows = [];
  expect(validateAcceptance(input).findings.join(" ")).toContain("47-ac-1.ordering");
});

test("acceptance matrix rejects contradictory summaries and distinguishes unfinished states", () => {
  const input = replay();
  input.matrix.summary.pass = 2;
  expect(validateAcceptance(input).valid).toBe(false);
  for (const state of ["pending", "blocked", "not_applicable"]) {
    const candidate = replay();
    Object.assign(firstRow(candidate), { state, reason: "Requires operator QA", proofs: [] });
    candidate.matrix.summary = {
      pass: 0,
      fail: 0,
      pending: 0,
      blocked: 0,
      not_applicable: 0,
      [state]: 1,
    };
    expect(validateAcceptance(candidate).valid).toBe(true);
    firstRow(candidate).reason = null;
    expect(validateAcceptance(candidate).valid).toBe(false);
  }
});

test("acceptance matrix rejects an analyst omitting a source-required surface before implementation", () => {
  const input = replay();
  firstRow(input).surfaces = ["cli.simulate"];
  expect(validateAcceptance(input).findings.join(" ")).toContain("cli.send");
});
