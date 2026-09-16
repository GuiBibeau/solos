// @ts-check
import { expect, test } from "bun:test";
import root from "../agent.js";
import analyst from "../subagents/analyst/agent.js";
import classifier from "../subagents/classifier/agent.js";
import implementer from "../subagents/implementer/agent.js";
import researcher from "../subagents/researcher/agent.js";
import reviewer from "../subagents/reviewer/agent.js";

const revisionPipeline = [
  classifier,
  researcher,
  analyst,
  implementer,
  reviewer,
  implementer,
  reviewer,
  implementer,
  reviewer,
];

test("factory aggregate budget preserves every station's authored output window", () => {
  let remaining = root.limits?.maxOutputTokensPerSession;
  expect(typeof remaining).toBe("number");
  if (typeof remaining !== "number") return;

  for (const station of revisionPipeline) {
    const limit = station.limits?.maxOutputTokensPerSession;
    expect(typeof limit).toBe("number");
    if (typeof limit !== "number") return;
    expect(remaining).toBeGreaterThanOrEqual(limit);
    remaining -= limit;
  }
});

test("an implementer session can emit up to 200K output tokens", () => {
  expect(implementer.limits?.maxOutputTokensPerSession).toBe(200_000);
});
