// @ts-check
import { expect, test } from "bun:test";
import { replayRow } from "./replay-builder.js";
import { transferReplay } from "./transfer-replay.js";
import { validateAcceptance } from "./validate.js";

test("acceptance matrix #47 replays exact grammar and all native CLI/MCP simulate/send sentinel reports", () => {
  const input = transferReplay();
  expect(validateAcceptance(input).valid).toBe(true);
  for (const row of input.matrix.rows) {
    for (const surface of row.surfaces) {
      const incomplete = transferReplay();
      const target = replayRow(incomplete, row.id.split(".").at(-1) ?? "");
      target.proofs = target.proofs.filter((proof) => proof.surface !== surface);
      expect(validateAcceptance(incomplete).findings.join(" ")).toContain(surface);
    }
  }
});

test("acceptance matrix #47 rejects source-order claims and double-sign repair regressions", () => {
  const input = transferReplay();
  input.previous = structuredClone(input.matrix);
  const cli = replayRow(input, "cli");
  cli.proofs = cli.proofs.map((proof) =>
    proof.surface.includes("--1")
      ? {
          ...proof,
          outcome: "fail",
          observation: "Native CLI returned SignerUnavailable before ValidationError",
        }
      : proof,
  );
  const grammar = replayRow(input, "grammar");
  grammar.proofs = grammar.proofs.map((proof) => ({
    ...proof,
    kind: "inspection",
    observation: "Guard appears before signer in source",
  }));
  const result = validateAcceptance(input);
  expect(result.valid).toBe(false);
  expect(result.findings.join(" ")).toContain("cli.send:--1.1");
  expect(result.findings.join(" ")).toContain("pure:--1");
});
