// @ts-check
import { expect, test } from "bun:test";
import { firstRow, proof, replay } from "./replay-fixture.js";
import { validateAcceptance } from "./validate.js";

test("acceptance matrix rejects invented criteria while allowing boundary expansion", () => {
  const input = replay();
  const original = input.originals[0];
  if (!original) throw new Error("Expected source criterion");
  input.matrix.criteria.push({
    ...original,
    id: "model-added",
    text: "Add unrelated product policy",
  });
  input.matrix.rows.push({
    ...firstRow(input),
    id: "model-added.row",
    criterion_id: "model-added",
  });
  input.matrix.summary.pass += 1;
  expect(validateAcceptance(input).findings.join(" ")).toContain("model-added");
  input.matrix.criteria.pop();
  const extra = input.matrix.rows.at(-1);
  if (!extra) throw new Error("Expected boundary row");
  extra.criterion_id = original.id;
  expect(validateAcceptance(input).valid).toBe(true);
});

test("acceptance matrix cannot resolve a finding with unrelated or incomplete surface proof", () => {
  const input = replay();
  const finding = {
    id: "sentinel",
    row_ids: [firstRow(input).id],
    lane: "spec",
    detail: "Missing unusable-signer sentinel",
    state: "resolved",
    resolution: [proof("unrelated.surface")],
  };
  const result = validateAcceptance({ ...input, matrix: { ...input.matrix, findings: [finding] } });
  expect(result.valid).toBe(false);
  finding.resolution = [proof("cli.simulate")];
  const validate = () =>
    validateAcceptance({ ...input, matrix: { ...input.matrix, findings: [finding] } });
  expect(validate().valid).toBe(false);
  finding.resolution = [proof("cli.simulate"), { ...proof("cli.send"), kind: "inspection" }];
  expect(validate().valid).toBe(false);
  finding.resolution = [
    proof("cli.simulate"),
    { ...proof("cli.send"), reference: "unrelated test output" },
  ];
  expect(validate().valid).toBe(false);
  finding.resolution = [proof("cli.simulate"), proof("cli.send")];
  expect(validate().valid).toBe(true);
  const mcp = {
    ...firstRow(input),
    id: "47-ac-1.mcp",
    surfaces: ["mcp.send"],
    proofs: [proof("mcp.send")],
  };
  input.matrix.rows.push(mcp);
  input.matrix.summary.pass += 1;
  finding.row_ids.push(mcp.id);
  expect(validate().valid).toBe(false);
  finding.resolution.push(proof("mcp.send"));
  expect(validate().valid).toBe(true);
});

test("acceptance matrix requires current row-tied source proof before waiving required operator QA", () => {
  const input = replay();
  const row = firstRow(input);
  Object.assign(row, {
    state: "not_applicable",
    responsibility: "operator",
    reason: "Claimed exemption",
    proofs: [],
  });
  input.matrix.summary = { pass: 0, fail: 0, pending: 0, blocked: 0, not_applicable: 1 };
  expect(validateAcceptance(input).valid).toBe(false);
  row.proofs = row.surfaces.map(proof);
  expect(validateAcceptance(input).valid).toBe(false);
  row.proofs = row.surfaces.map((surface) => ({
    ...proof(surface),
    kind: "inspection",
    source: {
      url: "https://example.test/maintainer-amendment",
      quote: "Operator CLI simulate/send QA is outside this amended docs-only scope.",
    },
  }));
  expect(validateAcceptance(input).valid).toBe(true);
  row.proofs.pop();
  expect(validateAcceptance(input).valid).toBe(false);
  row.proofs = [
    {
      ...proof("unrelated.surface"),
      kind: "inspection",
      source: { url: "https://example.test/maintainer-amendment", quote: "Amended scope" },
    },
  ];
  expect(validateAcceptance(input).valid).toBe(false);
});
