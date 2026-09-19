// @ts-check
import { expect, test } from "bun:test";
import root from "../agent.js";
import analyst from "../subagents/analyst/agent.js";
import classifier from "../subagents/classifier/agent.js";
import implementer from "../subagents/implementer/agent.js";
import researcher from "../subagents/researcher/agent.js";
import reviewer from "../subagents/reviewer/agent.js";
import { sessionLimitsFor } from "./models.js";

const glmAgents = [root, classifier, researcher, analyst, implementer];

test("GLM-backed factory agents disable cumulative token budgets", () => {
  for (const agent of glmAgents) {
    expect(agent.limits?.maxInputTokensPerSession).toBe(false);
    expect(agent.limits?.maxOutputTokensPerSession).toBeUndefined();
  }
});

test("the independent reviewer retains cumulative token caps", () => {
  expect(reviewer.limits?.maxInputTokensPerSession).toBe(40_000_000);
  expect(reviewer.limits?.maxOutputTokensPerSession).toBe(100_000);
});

test("provider overrides move the guardrail with the model", () => {
  expect(sessionLimitsFor("implementer", "openai/gpt-5.6-luna")).toEqual({
    maxInputTokensPerSession: 40_000_000,
    maxOutputTokensPerSession: 200_000,
  });
  expect(sessionLimitsFor("reviewer", "zai/glm-5.3-flash")).toEqual({
    maxInputTokensPerSession: false,
  });
});
