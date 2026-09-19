// @ts-check
import { expect, test } from "bun:test";
import root from "../agent.js";
import analyst from "../subagents/analyst/agent.js";
import classifier from "../subagents/classifier/agent.js";
import implementer from "../subagents/implementer/agent.js";
import researcher from "../subagents/researcher/agent.js";
import reviewer from "../subagents/reviewer/agent.js";

const glmAgents = [root, classifier, researcher, analyst, implementer];

test("GLM-backed factory agents have no authored cumulative output cap", () => {
  for (const agent of glmAgents) {
    expect(agent.limits?.maxOutputTokensPerSession).toBeUndefined();
  }
});

test("the independent reviewer retains its cumulative output cap", () => {
  expect(reviewer.limits?.maxOutputTokensPerSession).toBe(100_000);
});
