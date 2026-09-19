// @ts-check
import { expect, test } from "bun:test";
import { replayRow } from "./replay-builder.js";
import { tradingReplay } from "./trading-replay.js";
import { validateAcceptance } from "./validate.js";

test("acceptance matrix resolves stale Phoenix uncertainty from a pinned merged contract", () => {
  const input = tradingReplay();
  input.matrix.prerequisites.push({
    id: "phoenix-program",
    criterion_ids: ["35-ac-5"],
    state: "resolved",
    decision:
      "ADR-0021 pins the Phoenix Perps program and matching codecs at Rise revision 4bd3c505f16f09fdbe9fb2eff035aeaef8b7b12d; the older brief is superseded.",
    source:
      "https://github.com/GuiBibeau/solos/blob/ed0d908882334e9c6afb77734bd04a0e1b2a8268/docs/adr/0021-perp-slice.md",
    revision: "ed0d908882334e9c6afb77734bd04a0e1b2a8268",
    verification: "merged_contract",
    maintainer_action: null,
  });
  replayRow(input, "perp").prerequisite_ids = ["phoenix-program"];
  expect(validateAcceptance(input).valid).toBe(true);
  input.previous = structuredClone(input.matrix);
  const prerequisite = input.matrix.prerequisites[0];
  if (!prerequisite) throw new Error("Expected prerequisite");
  prerequisite.decision = "Use a similarly named SDK field instead";
  expect(validateAcceptance(input).valid).toBe(false);
});

test("acceptance matrix parks only dependent work for an unenforceable protocol bound", () => {
  const input = tradingReplay();
  input.matrix.prerequisites.push({
    id: "atomic-min-out",
    criterion_ids: ["35-ac-8"],
    state: "blocked",
    decision: "Pinned Meteora removal instruction cannot encode minimum receipts.",
    source: "https://github.com/GuiBibeau/solos/pull/48",
    revision: "3d08fc86a83fce7d11ee5f56ac42112dad7d9d8a",
    verification: "pinned_research",
    maintainer_action:
      "Review an atomic min-receipt enforcement mechanism before issue #32 execution.",
  });
  replayRow(input, "handoff").prerequisite_ids = ["atomic-min-out"];
  expect(validateAcceptance(input).valid).toBe(false);
  Object.assign(replayRow(input, "handoff"), {
    state: "blocked",
    reason: "Await reviewed atomic mechanism",
    proofs: [],
  });
  input.matrix.summary.pass -= 1;
  input.matrix.summary.blocked = 1;
  const result = validateAcceptance(input);
  expect(result.valid).toBe(true);
  expect(result.parked_row_ids).toEqual(["35-ac-8.handoff"]);
  replayRow(input, "handoff").prerequisite_ids = [];
  expect(validateAcceptance(input).valid).toBe(false);
});
