// @ts-check
import { expect, test } from "bun:test";
import { firstRow, proof, replay, REVISION } from "./replay-fixture.js";
import { validateAcceptance } from "./validate.js";

/** @param {import("./schema.js").Validation} input */
const reviewed = (input) => {
  input.previous = structuredClone(input.matrix);
  input.phase = "review";
  input.reviews = ["spec", "standards"].map((lane) => ({
    lane: lane === "spec" ? "spec" : "standards",
    revision: REVISION,
    reviewed_row_ids: input.matrix.rows.map(({ id }) => id),
    deferred_row_ids: [],
    verdict: "approve",
  }));
  return input;
};

test("acceptance matrix requires independent whole-matrix Spec and Standards review after repair", () => {
  const input = reviewed(replay());
  expect(validateAcceptance(input).ready).toBe(true);
  input.reviews.pop();
  expect(validateAcceptance(input).ready).toBe(false);
  input.reviews = [
    {
      lane: "spec",
      revision: REVISION,
      reviewed_row_ids: [],
      deferred_row_ids: [],
      verdict: "approve",
    },
  ];
  expect(validateAcceptance(input).findings.join(" ")).toContain("47-ac-1.ordering");
});

test("acceptance matrix retains all unresolved findings even when a later review approves", () => {
  const input = reviewed(replay());
  input.matrix.findings = [
    {
      id: "negative-exponent",
      row_ids: [firstRow(input).id],
      lane: "spec",
      detail: "-1e-9 acquires signer",
      state: "open",
      resolution: null,
    },
    {
      id: "composition-root",
      row_ids: [firstRow(input).id],
      lane: "standards",
      detail: "Telemetry fix runs Effect outside a composition root",
      state: "open",
      resolution: null,
    },
  ];
  input.previous = structuredClone(input.matrix);
  input.matrix.findings = [];
  const result = validateAcceptance(input);
  expect(result.ready).toBe(false);
  expect(result.findings.join(" ")).toContain("negative-exponent");
  expect(result.findings.join(" ")).toContain("composition-root");
  input.matrix = structuredClone(input.previous);
  for (const finding of input.matrix.findings) finding.state = "resolved";
  expect(validateAcceptance(input).ready).toBe(false);
  for (const finding of input.matrix.findings)
    finding.resolution = [proof("cli.simulate"), proof("cli.send")];
  expect(validateAcceptance(input).ready).toBe(true);
});

test("acceptance matrix keeps newly introduced malformed grammar and architecture failures visible together", () => {
  const input = reviewed(replay());
  const row = firstRow(input);
  input.matrix.rows.push(
    {
      ...row,
      id: "47-ac-1.double-sign",
      requirement: "--1 and --1.1 reject before dependency acquisition",
      state: "fail",
      reason: "CLI returned SignerUnavailable",
      proofs: [],
    },
    {
      ...row,
      id: "47-ac-1.telemetry",
      dimension: "architecture",
      requirement:
        "Effect execution remains in composition roots and preserves caller logger/tracer",
      responsibility: "standards",
      state: "fail",
      reason: "register-tools executes Effect directly",
      proofs: [],
    },
  );
  input.matrix.summary.fail = 2;
  const result = validateAcceptance(input);
  expect(result.ready).toBe(false);
  expect(result.findings.join(" ")).toContain("47-ac-1.double-sign");
  expect(result.findings.join(" ")).toContain("47-ac-1.telemetry");
});
